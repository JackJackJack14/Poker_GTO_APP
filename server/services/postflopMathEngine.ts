import type { GameState, GtoResponse } from '../types';
import { computeBetContext } from '../../shared/lib/betContext';
import {
  cardRank,
  cardSuit,
  classifyMadeHand,
  estimateEquityDetailed,
  hasStrongDraw,
  isMarginalSuitedHand,
} from '../lib/handMath';
import {
  buildResponseText,
  calcAlpha,
  calcExpectedValue,
  calcRaiseExpectedValue,
  formatDirtyAlert,
  formatEquityLine,
  formatRaiseDecision,
  raiseToFromPotPercent,
  roundBb,
  shortPotOddsLine,
  workingPot,
  type EngineDecision,
} from './engineShared';

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

/** Board texture — ใช้เฉพาะ FLOP/TURN/RIVER */
export function classifyBoardTexture(
  boardCards: GameState['boardCards'],
): BoardTexture {
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
 * Dynamic Hero Sizing ตาม Board Texture (Postflop only)
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
    rangeGuess = 'Postflop mixed';
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

function formatEvSign(ev: number): string {
  if (ev > 0) return `+${ev.toFixed(2)}`;
  return ev.toFixed(2);
}

/**
 * Fold Equity จาก Bluff Ratio ของคู่ต่อสู้
 * — range ที่บลัฟเยอะ → raise ได้ fold บ่อยขึ้น
 * — เมื่อ Facing bet แล้ว: FE ต่ำกว่าเช็คโพต (คู่ต่อสู้เปิดเกมมาแล้ว)
 */
function estimateFoldEquity(
  bluffFraction: number,
  kind: 'value' | 'bluff',
  facing: boolean,
): number {
  const base = Math.min(0.85, Math.max(0.05, bluffFraction));
  let fe: number;
  if (!facing) {
    fe = kind === 'value' ? base * 0.7 : Math.min(0.6, base * 0.95 + 0.06);
  } else {
    // บลัฟบางส่วนยัง fold ต่อ raise — ไม่ใช้ bluff% ทั้งก้อนเป็น FE
    fe =
      kind === 'value'
        ? base * 0.42 + 0.04
        : Math.min(0.72, base * 0.58 + 0.06);
  }
  return Math.round(Math.min(0.85, Math.max(0.05, fe)) * 1000) / 1000;
}

type EvCandidate = {
  key: 'fold' | 'call' | 'check' | 'raise';
  label: string;
  ev: number;
  raiseTo?: number;
  raiseKind?: 'value' | 'bluff';
  raisePct?: number;
};

/**
 * Strict Max-EV Postflop Decision
 * EV_Fold = 0 เสมอ · เลือกแอคชั่นที่ EV สูงสุด
 * ถ้า EV_Call และ EV_Raise ติดลบทั้งคู่ → Fold เท่านั้น
 */
function decide(gameState: GameState): EngineDecision {
  const betCtx = gameState.betContext ?? computeBetContext(gameState);
  const equityDetail = estimateEquityDetailed(
    gameState.heroCards,
    gameState.boardCards,
    gameState.stage,
  );
  const equity = equityDetail.equity;
  const texture = classifyBoardTexture(gameState.boardCards);
  const made = classifyMadeHand(gameState.heroCards, gameState.boardCards);
  const strongDraw = hasStrongDraw(gameState);
  const pot = workingPot(gameState);
  const marginal = isMarginalSuitedHand(gameState.heroCards);
  const smallPot = pot <= 12;
  const opponentBet = betCtx.facingBetSize || betCtx.maxStreetBet;
  const heroBet = betCtx.heroBetSize;
  const facing = betCtx.toCall > 0;

  const { action: oppAction, betSize } = resolveOpponentAction(gameState);
  const range = analyzeOpponentRange(
    gameState.boardCards,
    oppAction,
    pot,
    betSize,
  );

  const textureTag =
    texture === 'wet' ? '🌊 Wet' : texture === 'dry' ? '🏜️ Dry' : '⚖️ Semi';

  // —— sizing candidate (value vs bluff ตามความแข็งแฮนด์) ——
  const raiseKind: 'value' | 'bluff' =
    made.score >= 70 || equity >= 65 ? 'value' : 'bluff';
  const raisePct = heroSizingPercent(texture, raiseKind);
  const raiseTo = raiseToFromPotPercent(pot, raisePct, opponentBet);
  const heroInvest = roundBb(Math.max(0, raiseTo - heroBet));
  const villainCallAmount = roundBb(Math.max(0, raiseTo - opponentBet));
  const foldEquity = estimateFoldEquity(
    range.bluffFraction,
    raiseKind,
    facing,
  );

  const evFold = 0;
  const evCall = facing
    ? calcExpectedValue(equity, pot, betCtx.toCall)
    : 0; // Check line — baseline 0 (ไม่ลงทุนเพิ่ม)
  const evRaise = calcRaiseExpectedValue({
    equityPercent: equity,
    pot,
    heroInvest,
    villainCallAmount,
    foldEquity,
  });

  const candidates: EvCandidate[] = [
    { key: 'fold', label: 'Fold', ev: evFold },
  ];

  if (facing) {
    candidates.push({ key: 'call', label: 'Call', ev: evCall });
  } else {
    candidates.push({ key: 'check', label: 'Check', ev: evCall });
  }

  candidates.push({
    key: 'raise',
    label: facing ? 'Raise' : 'Bet',
    ev: evRaise,
    raiseTo,
    raiseKind,
    raisePct,
  });

  // Strict Max EV — ถ้า Call และ Raise ติดลบทั้งคู่ → Fold เท่านั้น
  const aggressiveNegative =
    evCall < -1e-9 && evRaise < -1e-9;

  let best: EvCandidate;
  if (facing && aggressiveNegative) {
    best = { key: 'fold', label: 'Fold', ev: 0 };
  } else {
    best = candidates.reduce((a, b) => (b.ev > a.ev ? b : a));
    // เมื่อไม่ facing: ห้าม Fold (เลือก Check ถ้า Raise ไม่ชนะ)
    if (!facing && best.key === 'fold') {
      best = candidates.find((c) => c.key === 'check') ?? best;
    }
  }

  // Rake-trap: marginal + small pot + call ไม่คุ้ม → บังคับไม่ Call ถ้า EV_Call ≤ EV_Fold
  let rakeTrap = false;
  if (
    facing &&
    best.key === 'call' &&
    marginal &&
    smallPot &&
    equity < 55 &&
    !strongDraw &&
    evCall <= 0
  ) {
    best = { key: 'fold', label: 'Fold', ev: 0 };
    rakeTrap = true;
  }

  let action: string;
  let reason: string;
  const fePct = Math.round(foldEquity * 100);
  const bluffPct = Math.round(range.bluffFraction * 100);
  const cmp = `MaxEV Fold ${formatEvSign(evFold)} · ${facing ? 'Call' : 'Check'} ${formatEvSign(evCall)} · ${facing ? 'Raise' : 'Bet'} ${formatEvSign(evRaise)} (FE ${fePct}% / Bluff ${bluffPct}%)`;

  if (best.key === 'fold') {
    action = 'Fold';
    reason = rakeTrap
      ? `🪤 Rake-Trap · ${cmp}`
      : `⛔ Max EV → Fold · ${cmp}`;
    rakeTrap = rakeTrap || (facing && aggressiveNegative);
  } else if (best.key === 'call') {
    action = 'Call';
    reason = `📞 Max EV → Call · ${cmp}`;
  } else if (best.key === 'check') {
    action = 'Check';
    reason = `🛑 Max EV → Check · ${textureTag} · ${cmp}`;
  } else {
    const to = best.raiseTo ?? raiseTo;
    action = formatRaiseDecision(to, opponentBet);
    const tag = best.raiseKind === 'value' ? '💪 Value' : '🎯 Semi-bluff';
    reason = `${tag} · ${textureTag} · ${best.raisePct ?? raisePct}% pot · ${cmp}`;
  }

  return {
    action,
    equity,
    equityDetail,
    reason,
    rakeLine: rakeTrap ? '🪤 ห้าม Call -EV' : `✅ ${textureTag}`,
    rakeTrap,
    lockEvToZero: best.key === 'fold',
    selectedEv: best.ev,
    rangeGuess: range.rangeGuess,
    statsLine: range.statsLine,
    dirtyAlert: formatDirtyAlert(equityDetail.dirty),
  };
}

export const PostflopMathEngine = {
  /**
   * วิเคราะห์เฉพาะ FLOP / TURN / RIVER
   * — Strict Max EV · Fold Equity บน Raise · Dirty Outs · Texture Stats
   */
  analyze(gameState: GameState): GtoResponse {
    if (gameState.stage === 'PREFLOP') {
      throw new Error(
        'PostflopMathEngine ห้ามรันบน PREFLOP — ใช้ PreflopEngine แทน',
      );
    }

    const decision = decide(gameState);
    const ev = decision.lockEvToZero
      ? 0
      : (decision.selectedEv ?? 0);
    const evSign = ev > 0 ? '+' : '';
    const evLine = `💰 EV สุทธิ: ${evSign}${ev.toFixed(2)} BB`;

    const text = buildResponseText({
      action: decision.action,
      equityLine: formatEquityLine(decision.equityDetail),
      potOddsLine: shortPotOddsLine(gameState),
      rangeGuess: decision.rangeGuess,
      statsLine: decision.statsLine,
      dirtyAlert: decision.dirtyAlert,
      rakeLine: decision.rakeLine,
      reason: decision.reason,
      evLine,
    });

    return {
      equity: Math.round(decision.equity),
      ev,
      priorAction: undefined,
      text,
      rakeTrapWarning: decision.rakeTrap,
      rakeTrapMessage: decision.rakeTrap
        ? 'Local Math: -EV / Rake-Trap — หลีกเลี่ยง Call'
        : undefined,
      dirtyOutsWarning: Boolean(decision.dirtyAlert),
      dirtyOutsAlert: decision.dirtyAlert ?? undefined,
    };
  },
};
