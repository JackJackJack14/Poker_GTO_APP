import type { GameState, GtoResponse } from '../types';
import { POSITIONS } from '../types';
import { computeBetContext } from '../../shared/lib/betContext';
import {
  lookupPreflopAction,
  priorActionLabel,
  type PriorPreflopAction,
} from '../data/preflopRanges';
import {
  estimatePreflopEquityByPrior,
  isMarginalSuitedHand,
  toHandCode,
  type EquityEstimate,
} from '../lib/handMath';
import {
  buildResponseText,
  calcExpectedValue,
  formatEquityLine,
  formatRaiseDecision,
  roundBb,
  shortPotOddsLine,
  workingPot,
  type EngineDecision,
} from './engineShared';

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
  const looksLike3Bet =
    raises.length >= 2 ||
    maxBet >= Math.max(6 * bb, minRaise * 2.4 - 1e-9);

  return looksLike3Bet ? 'FACING_3BET' : 'FACING_OPEN';
}

function equityDetailFromPrior(
  hand: string,
  prior: PriorPreflopAction,
): EquityEstimate {
  const equity = estimatePreflopEquityByPrior(hand, prior);
  return {
    equity,
    rawEquity: equity,
    dirty: {
      active: false,
      threatSuit: null,
      dirtyOutsCount: 0,
      rawOuts: 0,
      cleanOuts: 0,
      dirtyCardLabels: [],
    },
  };
}

function preflopRangeLabel(prior: PriorPreflopAction): {
  rangeGuess: string;
  statsLine: string;
} {
  if (prior === 'FACING_3BET') {
    return {
      rangeGuess: 'QQ+/AK + Light Bluff',
      statsLine: 'Value ~70% / Light Bluff ~30%',
    };
  }
  if (prior === 'FACING_OPEN') {
    return {
      rangeGuess: 'Open-Raise Range (Positional)',
      statsLine: 'Value ~55% / Bluff/Weak ~45%',
    };
  }
  return {
    rangeGuess: 'Unopened / Random field',
    statsLine: 'Preflop — ไม่ใช้ Postflop Texture Stats',
  };
}

/**
 * PreflopEngine — ทำงานเฉพาะ PREFLOP
 * Facing 3-Bet: ยึด Preflop Range Matrix 100% (ไม่ผสมสูตร Postflop EV)
 */
function decide(gameState: GameState): EngineDecision {
  const hand = toHandCode(gameState.heroCards);
  const prior = inferPriorPreflopAction(gameState);
  const equityDetail = equityDetailFromPrior(hand, prior);
  const equity = equityDetail.equity;
  const facing = prior !== 'UNOPENED';
  const unopened = prior === 'UNOPENED';
  const facing3Bet = prior === 'FACING_3BET';
  const betCtx = computeBetContext(gameState);
  const chart = lookupPreflopAction(
    gameState.heroPosition,
    hand,
    facing,
    prior,
  );
  const potOdds = betCtx.potOddsPercent;
  const marginal = isMarginalSuitedHand(gameState.heroCards);
  const pot = workingPot(gameState);
  const smallPot = pot <= 12;
  const sitTag = priorActionLabel(prior);
  const { rangeGuess, statsLine } = preflopRangeLabel(prior);

  let action = 'Fold';
  let reason = '';
  let rakeTrap = false;
  let lockEvToZero = false;

  if (facing3Bet) {
    // Strict matrix — ไม่ให้ pot-odds / rake / postflop EV แทรก
    if (chart === '4BET') {
      const opponentBet = betCtx.facingBetSize || betCtx.maxStreetBet;
      const raiseTo = roundBb(Math.max(opponentBet * 2.2, opponentBet + 4));
      action = formatRaiseDecision(raiseTo, opponentBet);
      reason = `🔥 4-Bet ${hand} · Matrix · ${sitTag}`;
    } else if (chart === 'CALL') {
      action = 'Call';
      reason = `📞 Flat ${hand} · Matrix 100% · ${sitTag} · Eq ${equity}%`;
    } else {
      action = 'Fold';
      reason = `🗑️ Fold ${hand} · Matrix 100% · ${sitTag}`;
      lockEvToZero = true;
    }
  } else if (unopened) {
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
      lockEvToZero = true;
    }
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
      lockEvToZero = true;
    } else if (marginal && smallPot) {
      action = 'Fold';
      reason = `🪤 Rake-Trap · ${hand} · ${sitTag}`;
      rakeTrap = true;
      lockEvToZero = true;
    } else {
      action = 'Call';
      reason = `📞 Flat ${hand} · ${sitTag} · Eq ${equity}%`;
    }
  } else {
    action = 'Fold';
    reason = `🗑️ Fold · ${hand} · ${sitTag}`;
    lockEvToZero = true;
  }

  if (action === 'Fold') lockEvToZero = true;

  return {
    action,
    equity,
    equityDetail,
    reason,
    rakeLine: rakeTrap ? '🪤 หลีก Call -EV' : `✅ ${sitTag}`,
    rakeTrap,
    lockEvToZero,
    rangeGuess,
    statsLine,
    dirtyAlert: null,
  };
}

export const PreflopEngine = {
  /**
   * วิเคราะห์เฉพาะสถานการณ์ PREFLOP
   * — ไม่เรียก Dynamic Sizing / Dirty Outs / Postflop texture stats
   */
  analyze(gameState: GameState): GtoResponse {
    const decision = decide(gameState);
    const prior = inferPriorPreflopAction(gameState);
    const betCtx = gameState.betContext ?? computeBetContext(gameState);

    const pot = workingPot(gameState);
    const ev = decision.lockEvToZero
      ? 0
      : calcExpectedValue(decision.equity, pot, betCtx.toCall);
    const evSign = ev > 0 ? '+' : '';
    const evLine = `💰 EV สุทธิ: ${evSign}${ev.toFixed(2)} BB`;

    const text = buildResponseText({
      action: decision.action,
      equityLine: formatEquityLine(decision.equityDetail),
      potOddsLine: shortPotOddsLine(gameState),
      rangeGuess: decision.rangeGuess,
      statsLine: decision.statsLine,
      dirtyAlert: null,
      rakeLine: decision.rakeLine,
      reason: decision.reason,
      evLine,
    });

    return {
      equity: Math.round(decision.equity),
      ev,
      priorAction: priorActionLabel(prior),
      text,
      rakeTrapWarning: decision.rakeTrap,
      rakeTrapMessage: decision.rakeTrap
        ? 'Local Math: -EV / Rake-Trap — หลีกเลี่ยง Call'
        : undefined,
      dirtyOutsWarning: false,
      dirtyOutsAlert: undefined,
    };
  },
};
