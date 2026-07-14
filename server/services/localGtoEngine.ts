import type { GameState, GtoResponse, Position } from '../types';
import { POSITIONS } from '../types';
import { computeBetContext } from '../../shared/lib/betContext';
import { lookupPreflopAction, priorActionLabel, type PriorPreflopAction } from '../data/preflopRanges';
import {
  cardRank,
  cardSuit,
  classifyMadeHand,
  estimateEquityDetailed,
  hasStrongDraw,
  isMarginalSuitedHand,
  toHandCode,
  type DirtyOutsReport,
  type EquityEstimate,
} from '../lib/handMath';

/** Pot Odds % = call / (pot + call) * 100 */
export function calcPotOddsPercent(callSize: number, currentPot: number): number | null {
  if (callSize <= 0) return null;
  return (callSize / (currentPot + callSize)) * 100;
}

/** MDF % = (1 - bet/(potBefore + bet)) * 100 */
export function calcMdfPercent(betSize: number, potBeforeBet: number): number | null {
  if (betSize <= 0) return null;
  const denom = potBeforeBet + betSize;
  if (denom <= 0) return null;
  return (1 - betSize / denom) * 100;
}

/** Alpha (optimal bluff fraction) = bet / (potBefore + bet) */
export function calcAlpha(betSize: number, potBeforeBet: number): number | null {
  if (betSize <= 0) return null;
  const denom = potBeforeBet + betSize;
  if (denom <= 0) return null;
  return betSize / denom;
}

export type BoardTexture = 'wet' | 'dry' | 'semi' | 'preflop';

export interface OpponentRangeAnalysis {
  texture: BoardTexture;
  bluffFraction: number;
  valueFraction: number;
  alpha: number | null;
  rangeGuess: string;
  statsLine: string;
  opponentAction: string;
}

export function classifyBoardTexture(boardCards: GameState['boardCards']): BoardTexture {
  if (boardCards.length < 3) return 'preflop';

  const ranks = boardCards.map(cardRank);
  const suits = boardCards.map(cardSuit);

  const suitCount: Record<string, number> = {};
  for (const s of suits) suitCount[s] = (suitCount[s] ?? 0) + 1;
  const maxSuit = Math.max(...Object.values(suitCount));
  const flushy = maxSuit >= 2;
  const monotone = maxSuit >= 3;

  const unique = [...new Set(ranks)].sort((a, b) => a - b);
  let connected = false;
  for (let i = 0; i < unique.length - 1; i++) {
    if (unique[i + 1] - unique[i] <= 2) connected = true;
  }
  const span = unique[unique.length - 1] - unique[0];
  const tightlyPacked = unique.length >= 3 && span <= 4;
  const straighty = connected || tightlyPacked;

  if (monotone || (flushy && straighty) || (maxSuit >= 2 && tightlyPacked)) {
    return 'wet';
  }
  if (flushy || straighty) return 'semi';
  return 'dry';
}

/**
 * Dynamic Hero Sizing ตาม Board Texture
 * Dry → 25–33% pot | Wet → 66–75% pot | Semi → ~50%
 */
export function heroSizingPercent(
  texture: BoardTexture,
  kind: 'value' | 'bluff',
): number {
  if (texture === 'dry') return kind === 'value' ? 33 : 25;
  if (texture === 'wet') return kind === 'value' ? 75 : 66;
  if (texture === 'semi') return kind === 'value' ? 50 : 40;
  return 50;
}

export function analyzeOpponentRange(
  boardCards: GameState['boardCards'],
  opponentAction: string,
  currentPot: number,
  betSize?: number,
): OpponentRangeAnalysis {
  const bet = Math.max(0, betSize ?? 0);
  const potBefore = Math.max(0, currentPot - bet);
  const alpha = calcAlpha(bet, potBefore);
  const texture = classifyBoardTexture(boardCards);

  let bluff = alpha ?? 0;
  let rangeGuess = 'Range กว้าง';

  if (opponentAction === 'CHECK' || bet <= 0) {
    bluff = texture === 'wet' ? 0.35 : texture === 'dry' ? 0.15 : 0.25;
    rangeGuess =
      texture === 'wet' ? 'Missed Draws / Weak Pairs' : texture === 'dry' ? 'Weak Made' : 'Mixed Weak';
  } else if (texture === 'wet') {
    bluff = Math.min(0.72, (alpha ?? 0.4) * 1.35 + 0.08);
    rangeGuess = 'FD/SD + Semi-Bluff · บาง Sets';
  } else if (texture === 'dry') {
    bluff = Math.max(0.08, (alpha ?? 0.33) * 0.65);
    rangeGuess = 'Sets · Two-Pair · TPTK';
  } else if (texture === 'semi') {
    bluff = Math.min(0.55, Math.max(0.18, (alpha ?? 0.35) * 1.05));
    rangeGuess = 'Top Pair+ · Draws';
  } else {
    bluff = Math.min(0.45, Math.max(0.2, alpha ?? 0.33));
    rangeGuess = 'QQ+/AK + Light Bluff';
  }

  if (bet > 0 && potBefore > 0 && bet / potBefore > 1.0) {
    bluff = Math.min(0.75, bluff + 0.08);
    rangeGuess = `${rangeGuess} · Polar`;
  }

  const value = Math.max(0, 1 - bluff);
  const valuePct = Math.round(value * 100);
  const bluffPct = 100 - valuePct;

  return {
    texture,
    bluffFraction: bluff,
    valueFraction: value,
    alpha,
    rangeGuess,
    statsLine: `Value ${valuePct}% / Bluff ${bluffPct}%`,
    opponentAction,
  };
}

function resolveOpponentAction(gameState: GameState): {
  action: string;
  betSize: number;
} {
  const betCtx = computeBetContext(gameState);
  if (betCtx.facingBetSize > 0) {
    return { action: 'BET', betSize: betCtx.facingBetSize };
  }
  if (betCtx.maxStreetBet > 0) {
    return { action: 'BET', betSize: betCtx.maxStreetBet };
  }
  return { action: 'CHECK', betSize: 0 };
}

/**
 * Action Cascading: อนุมาน Action ก่อนหน้าจากยอดเดิมพันบนโต๊ะ
 * - UNOPENED: ยังไม่มีใครเปิดเกิน BB
 * - FACING_OPEN: มี open raise (1 ระดับ)
 * - FACING_3BET: มีการ raise ซ้อน (ยอด ≥ ~2.5× open หรือ ≥ 6BB)
 */
export function inferPriorPreflopAction(
  gameState: GameState,
): PriorPreflopAction {
  const bb = gameState.bigBlind ?? 1;
  const raises: number[] = [];
  for (const p of POSITIONS) {
    if (p === gameState.heroPosition) continue;
    const s = gameState.positions[p];
    if (s.folded) continue;
    if (s.betSize > bb + 1e-9) raises.push(s.betSize);
  }

  if (raises.length === 0) return 'UNOPENED';

  const maxBet = Math.max(...raises);
  const minRaise = Math.min(...raises);
  // 3-bet ทั่วไป ≈ 3× open; หรือ absolute ≥ 6BB เมื่อ open มาตรฐาน 2–2.5
  const looksLike3Bet =
    raises.length >= 2 ||
    maxBet >= Math.max(6 * bb, minRaise * 2.4 - 1e-9);

  return looksLike3Bet ? 'FACING_3BET' : 'FACING_OPEN';
}

/**
 * EV = (Equity * Total Pot) - ((1 - Equity) * Call Size)
 * Equity เป็นเศษส่วน 0–1, ผลลัพธ์หน่วย BB
 */
export function calcExpectedValue(
  equityPercent: number,
  totalPot: number,
  callSize: number,
): number {
  const eq = Math.min(1, Math.max(0, equityPercent / 100));
  const pot = Math.max(0, totalPot);
  const call = Math.max(0, callSize);
  const ev = eq * pot - (1 - eq) * call;
  return Math.round(ev * 100) / 100;
}

function roundBb(n: number): number {
  return Math.round(Math.max(0, n) * 10) / 10;
}

function formatBb(n: number): string {
  const r = roundBb(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function formatRaiseDecision(
  raiseTo: number,
  opponentBetSize: number,
): string {
  const oppBet = roundBb(Math.max(0, opponentBetSize));
  const raiseToTotal = roundBb(
    Math.max(raiseTo, oppBet > 0 ? oppBet + 0.1 : raiseTo),
  );
  const raiseBy = roundBb(Math.max(0, raiseToTotal - oppBet));
  return `Raise ยอดรวมพิมพ์เลข ${formatBb(raiseToTotal)}BB [ใส่เพิ่มอีก ${formatBb(raiseBy)}BB]`;
}

function raiseToFromPotPercent(
  pot: number,
  percent: number,
  opponentBet: number,
): number {
  const betAmount = roundBb(Math.max(1, (pot * percent) / 100));
  if (opponentBet > 0) {
    return roundBb(Math.max(opponentBet + betAmount, opponentBet * 2.2, betAmount));
  }
  return betAmount;
}

function shortPotOddsLine(gameState: GameState): string {
  const betCtx = gameState.betContext ?? computeBetContext(gameState);
  const toCall = betCtx.toCall;
  const pot = gameState.pot;
  const facing = betCtx.facingBetSize;
  const potBefore = Math.max(0, pot - facing);
  const potOdds = toCall > 0 ? calcPotOddsPercent(toCall, pot) : null;
  const mdf = facing > 0 ? calcMdfPercent(facing, potBefore) : null;

  if (toCall <= 0) {
    return mdf !== null ? `ไม่ต้อง call · MDF ${mdf.toFixed(0)}%` : 'ไม่ต้อง call';
  }
  return `ต้อง ${potOdds!.toFixed(0)}% · Call ${toCall.toFixed(1)}BB${
    mdf !== null ? ` · MDF ${mdf.toFixed(0)}%` : ''
  }`;
}

function formatEquityLine(eq: EquityEstimate): string {
  const net = Math.round(eq.equity);
  if (eq.dirty.active && eq.rawEquity !== eq.equity) {
    return `📈 Equity ของเรา vs Range: ${net}% 🛑 [หักลดจาก ${Math.round(eq.rawEquity)}% แล้ว]`;
  }
  return `📈 Equity ของเรา vs Range: ${net}%`;
}

function formatDirtyAlert(dirty: DirtyOutsReport): string | null {
  if (!dirty.active || dirty.dirtyOutsCount <= 0) return null;
  const samples =
    dirty.dirtyCardLabels.length > 0
      ? dirty.dirtyCardLabels.join(' / ')
      : 'ไพ่ดอกสกปรก';
  return `🛑 เตือน Dirty Outs: หักออก ${dirty.dirtyOutsCount} ใบ (${samples})`;
}

function buildResponseText(params: {
  action: string;
  equityLine: string;
  potOddsLine: string;
  rangeGuess: string;
  statsLine: string;
  dirtyAlert: string | null;
  rakeLine: string;
  reason: string;
  evLine: string;
}): string {
  const lines = [
    `⚡ การตัดสินใจ GTO: ${params.action}`,
    params.equityLine,
    params.evLine,
  ];
  if (params.dirtyAlert) lines.push(params.dirtyAlert);
  lines.push(
    `📊 Pot Odds & MDF: ${params.potOddsLine}`,
    `🎯 Range คู่ต่อสู้: ${params.rangeGuess}`,
    `💥 สัดส่วน: ${params.statsLine}`,
  );
  lines.push(`⚠️ Rake: ${params.rakeLine}`);
  lines.push(`💡 เหตุผล: ${params.reason}`);
  return lines.join('\n');
}

type Decision = {
  action: string;
  equity: number;
  equityDetail: EquityEstimate;
  reason: string;
  rakeLine: string;
  rakeTrap: boolean;
};

function decidePreflop(gameState: GameState): Decision {
  const hand = toHandCode(gameState.heroCards);
  const equityDetail = estimateEquityDetailed(
    gameState.heroCards,
    [],
    'PREFLOP',
  );
  const equity = equityDetail.equity;
  const prior = inferPriorPreflopAction(gameState);
  const facing = prior !== 'UNOPENED';
  const unopened = prior === 'UNOPENED';
  const betCtx = computeBetContext(gameState);
  const chart = lookupPreflopAction(
    gameState.heroPosition,
    hand,
    facing,
    prior,
  );
  const potOdds = betCtx.potOddsPercent;
  const marginal = isMarginalSuitedHand(gameState.heroCards);
  const smallPot = gameState.pot <= 12;
  const sitTag = priorActionLabel(prior);

  let action = 'Fold';
  let reason = '';
  let rakeTrap = false;

  if (unopened) {
    if (gameState.heroPosition === 'BB' && betCtx.toCall <= 0) {
      action = 'Check';
      reason = `✅ BB เช็คฟรี · ${hand}`;
    } else if (chart === 'OPEN') {
      const raiseTo = 2.5;
      const opponentBet = betCtx.facingBetSize || betCtx.maxStreetBet;
      action = formatRaiseDecision(raiseTo, opponentBet);
      reason = `🚀 Open ${hand} · ${gameState.heroPosition} · ${sitTag}`;
    } else {
      action = 'Fold';
      reason = `🗑️ นอกชาร์ต · ${hand} · ${sitTag}`;
    }
  } else if (chart === '4BET') {
    const opponentBet = betCtx.facingBetSize || betCtx.maxStreetBet;
    const raiseTo = roundBb(Math.max(opponentBet * 2.2, opponentBet + 4));
    action = formatRaiseDecision(raiseTo, opponentBet);
    reason = `🔥 4-Bet ${hand} · ${sitTag}`;
  } else if (chart === '3BET') {
    const opponentBet = betCtx.facingBetSize || betCtx.maxStreetBet;
    const raiseTo = roundBb(Math.max(opponentBet * 3, opponentBet + 2));
    action = formatRaiseDecision(raiseTo, opponentBet);
    reason = `🔥 3-Bet ${hand} · ${sitTag}`;
  } else if (chart === 'CALL') {
    if (potOdds !== null && equity + 1e-9 < potOdds) {
      action = 'Fold';
      reason = `⛔ Eq ${equity}% < Odds ${potOdds.toFixed(0)}% · ${sitTag}`;
      rakeTrap = true;
    } else if (marginal && smallPot) {
      action = 'Fold';
      reason = `🪤 Rake-Trap · ${hand} · ${sitTag}`;
      rakeTrap = true;
    } else {
      action = 'Call';
      reason = `📞 Flat ${hand} · ${sitTag} · Eq ${equity}%`;
    }
  } else {
    action = 'Fold';
    reason = `🗑️ Fold · ${hand} · ${sitTag}`;
  }

  return {
    action,
    equity,
    equityDetail,
    reason,
    rakeLine: rakeTrap ? '🪤 หลีก Call -EV' : `✅ ${sitTag}`,
    rakeTrap,
  };
}

function decidePostflop(gameState: GameState): Decision {
  const betCtx = computeBetContext(gameState);
  const equityDetail = estimateEquityDetailed(
    gameState.heroCards,
    gameState.boardCards,
    gameState.stage,
  );
  const equity = equityDetail.equity;
  const texture = classifyBoardTexture(gameState.boardCards);
  const made = classifyMadeHand(gameState.heroCards, gameState.boardCards);
  const strongDraw = hasStrongDraw(gameState);
  const potOdds = betCtx.potOddsPercent;
  const marginal = isMarginalSuitedHand(gameState.heroCards);
  const smallPot = gameState.pot <= 12;
  const opponentBet = betCtx.facingBetSize || betCtx.maxStreetBet;

  const textureTag =
    texture === 'wet' ? '🌊 Wet' : texture === 'dry' ? '🏜️ Dry' : '⚖️ Semi';

  let action = 'Check';
  let reason = '';
  let rakeTrap = false;

  if (betCtx.toCall <= 0) {
    if (made.score >= 70 || equity >= 65) {
      const pct = heroSizingPercent(texture, 'value');
      const raiseTo = raiseToFromPotPercent(gameState.pot, pct, opponentBet);
      action = formatRaiseDecision(raiseTo, opponentBet);
      reason = `💪 Value · ${textureTag} · ${pct}% pot`;
    } else if (strongDraw && equity >= 35) {
      const pct = heroSizingPercent(texture, 'bluff');
      const raiseTo = raiseToFromPotPercent(gameState.pot, pct, opponentBet);
      action = formatRaiseDecision(raiseTo, opponentBet);
      reason = `🎯 Semi-bluff · ${textureTag} · ${pct}% pot`;
    } else {
      action = 'Check';
      reason = `🛑 Check · Eq ${equity}% · ${made.category}`;
    }
  } else if (potOdds !== null && equity + 1e-9 < potOdds) {
    if (strongDraw && equity >= potOdds - 8) {
      const pct = heroSizingPercent(texture, 'bluff');
      const raiseTo = raiseToFromPotPercent(gameState.pot, pct, opponentBet);
      action = formatRaiseDecision(raiseTo, opponentBet);
      reason = `⛔ Eq<Odds · Raise แทน Call · ${pct}%`;
    } else {
      action = 'Fold';
      reason = `⛔ Eq ${equity}% < Odds ${potOdds.toFixed(0)}%`;
      rakeTrap = true;
    }
  } else if (marginal && smallPot && equity < 55 && !strongDraw) {
    action = 'Fold';
    reason = `🪤 Rake-Trap`;
    rakeTrap = true;
  } else if (made.score >= 78 || equity >= 72) {
    const pct = heroSizingPercent(texture, 'value');
    const raiseTo = raiseToFromPotPercent(gameState.pot, pct, opponentBet);
    action = formatRaiseDecision(raiseTo, opponentBet);
    reason = `💪 Raise Value · ${textureTag} · ${pct}%`;
  } else {
    action = 'Call';
    reason = `📞 Call · Eq ${equity}% ≥ Odds`;
  }

  return {
    action,
    equity,
    equityDetail,
    reason,
    rakeLine: rakeTrap ? '🪤 ห้าม Call -EV' : `✅ ${textureTag}`,
    rakeTrap,
  };
}

export function analyzeGameState(gameState: GameState): GtoResponse {
  const decision =
    gameState.stage === 'PREFLOP'
      ? decidePreflop(gameState)
      : decidePostflop(gameState);

  const { action: oppAction, betSize } = resolveOpponentAction(gameState);
  const range = analyzeOpponentRange(
    gameState.boardCards,
    oppAction,
    gameState.pot,
    betSize,
  );

  const betCtx = gameState.betContext ?? computeBetContext(gameState);
  const ev = calcExpectedValue(
    decision.equity,
    gameState.pot,
    betCtx.toCall,
  );
  const evSign = ev >= 0 ? '+' : '';
  const evLine = `💰 EV สุทธิ: ${evSign}${ev.toFixed(2)} BB`;

  const dirtyOutsAlert = formatDirtyAlert(decision.equityDetail.dirty);
  const prior =
    gameState.stage === 'PREFLOP'
      ? inferPriorPreflopAction(gameState)
      : undefined;

  const text = buildResponseText({
    action: decision.action,
    equityLine: formatEquityLine(decision.equityDetail),
    potOddsLine: shortPotOddsLine(gameState),
    rangeGuess: range.rangeGuess,
    statsLine: range.statsLine,
    dirtyAlert: dirtyOutsAlert,
    rakeLine: decision.rakeLine,
    reason: decision.reason,
    evLine,
  });

  return {
    equity: Math.round(decision.equity),
    ev,
    priorAction: prior ? priorActionLabel(prior) : undefined,
    text,
    rakeTrapWarning: decision.rakeTrap,
    rakeTrapMessage: decision.rakeTrap
      ? 'Local Math: -EV / Rake-Trap — หลีกเลี่ยง Call'
      : undefined,
    dirtyOutsWarning: Boolean(dirtyOutsAlert),
    dirtyOutsAlert: dirtyOutsAlert ?? undefined,
  };
}

export type { Position };
