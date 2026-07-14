import type { GameState } from '../types';
import { computeBetContext } from '../../shared/lib/betContext';
import { resolveWorkingPot } from '../../shared/lib/blinds';
import type { DirtyOutsReport, EquityEstimate } from '../lib/handMath';

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

/**
 * EV ของการ Raise/Bet รวม Fold Equity
 * EV = FE * Pot + (1−FE) * [eq*(Pot+HeroInvest+VillainCall) − (1−eq)*HeroInvest]
 */
export function calcRaiseExpectedValue(params: {
  equityPercent: number;
  pot: number;
  /** ชิปที่ Hero ต้องใส่เพิ่มเพื่อ Raise (ถึงยอด raise-to) */
  heroInvest: number;
  /** ชิปที่ Villain ต้องใส่เพิ่มถ้า Call */
  villainCallAmount: number;
  /** โอกาสที่คู่ต่อสู้หมอบ (0–1) มักอิง Bluff Ratio */
  foldEquity: number;
}): number {
  const eq = Math.min(1, Math.max(0, params.equityPercent / 100));
  const fe = Math.min(0.95, Math.max(0, params.foldEquity));
  const pot = Math.max(0, params.pot);
  const invest = Math.max(0, params.heroInvest);
  const vCall = Math.max(0, params.villainCallAmount);

  const evWhenOppFolds = pot;
  const evWhenOppCalls = eq * (pot + invest + vCall) - (1 - eq) * invest;
  const ev = fe * evWhenOppFolds + (1 - fe) * evWhenOppCalls;
  return Math.round(ev * 100) / 100;
}

/** Pot ที่ใช้คำนวณ — รวมบลายด์เริ่มต้น ≥ 1.5 BB */
export function workingPot(gameState: GameState): number {
  return resolveWorkingPot({
    pot: gameState.pot,
    bigBlind: gameState.bigBlind,
    positions: gameState.positions,
  });
}

export function roundBb(n: number): number {
  return Math.round(Math.max(0, n) * 10) / 10;
}

export function formatBb(n: number): string {
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

export function raiseToFromPotPercent(
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

export function shortPotOddsLine(gameState: GameState): string {
  const betCtx = gameState.betContext ?? computeBetContext(gameState);
  const toCall = betCtx.toCall;
  const pot = workingPot(gameState);
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

export function formatEquityLine(eq: EquityEstimate): string {
  const net = Math.round(eq.equity);
  if (eq.dirty.active && eq.rawEquity !== eq.equity) {
    return `📈 Equity ของเรา vs Range: ${net}% 🛑 [หักลดจาก ${Math.round(eq.rawEquity)}% แล้ว]`;
  }
  return `📈 Equity ของเรา vs Range: ${net}%`;
}

export function formatDirtyAlert(dirty: DirtyOutsReport): string | null {
  if (!dirty.active || dirty.dirtyOutsCount <= 0) return null;
  const samples =
    dirty.dirtyCardLabels.length > 0
      ? dirty.dirtyCardLabels.join(' / ')
      : 'ไพ่ดอกสกปรก';
  return `🛑 เตือน Dirty Outs: หักออก ${dirty.dirtyOutsCount} ใบ (${samples})`;
}

export function buildResponseText(params: {
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

export type EngineDecision = {
  action: string;
  equity: number;
  equityDetail: EquityEstimate;
  reason: string;
  rakeLine: string;
  rakeTrap: boolean;
  /** เมื่อ Fold — ล็อก EV = 0 */
  lockEvToZero?: boolean;
  /** EV ของแอคชั่นที่เลือกจริง (ต้องตรงกับ UI 100%) */
  selectedEv?: number;
  rangeGuess: string;
  statsLine: string;
  dirtyAlert: string | null;
};
