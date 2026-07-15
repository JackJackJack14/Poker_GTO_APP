import type { Card, GtoResponse, Position, Stage } from '../types';
import type { MutableRefObject } from 'react';

const STORAGE_KEY = 'poker-gto-ev-session-v2';
const LEGACY_KEY = 'poker-gto-ev-session-v1';

export interface EvHandRecord {
  id: string;
  ts: number;
  ev: number;
  /** ผลจริงสุทธิของแฮนด์ (BB) — null = ยังไม่บันทึก */
  actualResult: number | null;
  equity: number;
  pot: number;
  /** ยอดที่ Hero ลงทุนสะสมในแฮนด์ */
  heroBetSize: number;
  heroPosition: Position;
  stage: Stage;
  heroCards: [string, string];
  boardCards: string[];
  priorAction?: string;
  decisionSnippet: string;
}

export interface EvSessionState {
  hands: EvHandRecord[];
  cumulativeEv: number[];
  cumulativeReal: number[];
}

export interface HandResolvedPayload {
  heroWon: boolean;
  totalPot: number;
  heroInvested: number;
  /** Total Pot − Hero Invested เมื่อชนะ / −Hero Invested เมื่อแพ้ */
  netProfit: number;
  stage: Stage;
  heroPosition: Position;
  heroCards: [Card | null, Card | null];
  boardCards: (Card | null)[];
  /** สาเหตุจบแฮนด์ (UI flash) */
  reason?: 'hero-fold' | 'fold-around';
}

function emptySession(): EvSessionState {
  return { hands: [], cumulativeEv: [], cumulativeReal: [] };
}

function rebuildCumulative(
  hands: EvHandRecord[],
  pick: (h: EvHandRecord) => number,
): number[] {
  let sum = 0;
  return hands.map((h) => {
    sum += pick(h);
    return Math.round(sum * 100) / 100;
  });
}

function withSeries(hands: EvHandRecord[]): EvSessionState {
  return {
    hands,
    cumulativeEv: rebuildCumulative(hands, (h) => h.ev),
    cumulativeReal: rebuildCumulative(hands, (h) => h.actualResult ?? 0),
  };
}

function migrateHand(raw: Partial<EvHandRecord> & { ev: number }): EvHandRecord {
  return {
    id: raw.id ?? `${Date.now()}-mig`,
    ts: raw.ts ?? Date.now(),
    ev: raw.ev,
    actualResult: typeof raw.actualResult === 'number' ? raw.actualResult : null,
    equity: raw.equity ?? 0,
    pot: raw.pot ?? 0,
    heroBetSize: raw.heroBetSize ?? 0,
    heroPosition: raw.heroPosition ?? 'BTN',
    stage: raw.stage ?? 'FLOP',
    heroCards: raw.heroCards ?? ['??', '??'],
    boardCards: raw.boardCards ?? [],
    priorAction: raw.priorAction,
    decisionSnippet: raw.decisionSnippet ?? '',
  };
}

/**
 * กำไรสุทธิเงินจริง:
 * ชนะ → Total Pot − ชิปที่ Hero ลงทั้งแฮนด์
 * แพ้ → −ชิปที่ Hero ลงทั้งแฮนด์
 * Chop n คน → (Total Pot / n) − Hero Invested
 * (ห้ามใช้ค่าคงที่ 1.5 BB)
 */
export function calcNetRealProfit(
  totalPot: number,
  heroInvested: number,
  outcome: 'win' | 'lose',
): number {
  const pot = Math.max(0, totalPot);
  const invested = Math.max(0, heroInvested);
  if (outcome === 'win') {
    return Math.round((pot - invested) * 100) / 100;
  }
  return Math.round(-invested * 100) / 100;
}

/** Split Pot / Chop: (Total Pot / n) − Hero Invested */
export function calcSplitPotProfit(
  totalPot: number,
  heroInvested: number,
  splitWays: number,
): number {
  const n = Math.max(2, Math.floor(splitWays));
  const share = Math.max(0, totalPot) / n;
  const invested = Math.max(0, heroInvested);
  return Math.round((share - invested) * 100) / 100;
}

export type ActualOutcome = 'win' | 'lose' | 'split';

export function loadEvSession(): EvSessionState {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return emptySession();
    const parsed = JSON.parse(raw) as {
      hands?: Partial<EvHandRecord>[];
      cumulative?: number[];
    };
    if (!Array.isArray(parsed.hands)) return emptySession();
    const hands = parsed.hands
      .filter((h): h is Partial<EvHandRecord> & { ev: number } => typeof h?.ev === 'number')
      .map(migrateHand);
    const session = withSeries(hands);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return session;
  } catch {
    return emptySession();
  }
}

export function clearEvSession(): EvSessionState {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_KEY);
  return emptySession();
}

function persist(session: EvSessionState): EvSessionState {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function appendEvHand(params: {
  result: GtoResponse;
  heroPosition: Position;
  stage: Stage;
  pot: number;
  heroBetSize: number;
  heroCards: [string, string];
  boardCards: string[];
}): EvSessionState {
  const session = loadEvSession();
  const firstLine =
    params.result.text.split('\n').find((l) => l.includes('การตัดสินใจ')) ??
    params.result.text.slice(0, 80);

  const record: EvHandRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    ev: params.result.ev,
    actualResult: null,
    equity: params.result.equity,
    pot: params.pot,
    heroBetSize: Math.max(0, params.heroBetSize),
    heroPosition: params.heroPosition,
    stage: params.stage,
    heroCards: params.heroCards,
    boardCards: params.boardCards,
    priorAction: params.result.priorAction,
    decisionSnippet: firstLine.replace(/^⚡\s*/, ''),
  };

  return persist(withSeries([...session.hands, record].slice(-200)));
}

function resolveTargetIndex(
  session: EvSessionState,
  handId?: string | null,
): number {
  if (session.hands.length === 0) return -1;
  if (handId) {
    const found = session.hands.findIndex((h) => h.id === handId);
    if (found >= 0) return found;
  }
  for (let i = session.hands.length - 1; i >= 0; i--) {
    if (session.hands[i].actualResult === null) return i;
  }
  return session.hands.length - 1;
}

/**
 * บันทึกผลจริงท้ายแฮนด์ (สูตรสุทธิ)
 * win → TotalPot − HeroInvested
 * lose → −HeroInvested
 * split → (TotalPot / n) − HeroInvested
 */
export function recordActualResult(params: {
  handId?: string | null;
  outcome: ActualOutcome;
  totalPot: number;
  heroInvested: number;
  /** จำนวนคนหารพ็อต เมื่อ outcome = 'split' (2 หรือ 3) */
  splitWays?: number;
}): EvSessionState {
  const session = loadEvSession();
  const netProfit =
    params.outcome === 'split'
      ? calcSplitPotProfit(
          params.totalPot,
          params.heroInvested,
          params.splitWays ?? 2,
        )
      : calcNetRealProfit(
          params.totalPot,
          params.heroInvested,
          params.outcome,
        );

  const snippet =
    params.outcome === 'win'
      ? 'Hero wins pot'
      : params.outcome === 'lose'
        ? 'Hero loses showdown'
        : `Split pot / ${params.splitWays ?? 2}-way chop`;

  let idx = resolveTargetIndex(session, params.handId);
  if (idx < 0) {
    const stub: EvHandRecord = {
      id: `${Date.now()}-auto`,
      ts: Date.now(),
      ev: 0,
      actualResult: netProfit,
      equity: 0,
      pot: params.totalPot,
      heroBetSize: params.heroInvested,
      heroPosition: 'BTN',
      stage: 'RIVER',
      heroCards: ['??', '??'],
      boardCards: [],
      decisionSnippet: snippet,
    };
    return persist(withSeries([...session.hands, stub].slice(-200)));
  }

  const hands = session.hands.map((h, i) =>
    i === idx
      ? {
          ...h,
          actualResult: netProfit,
          pot: params.totalPot || h.pot,
          heroBetSize: params.heroInvested,
          decisionSnippet: h.decisionSnippet || snippet,
        }
      : h,
  );
  return persist(withSeries(hands));
}

/** จาก payload จบแฮนด์อัตโนมัติ (fold around / sole survivor) */
export function recordHandResolved(
  payload: HandResolvedPayload,
  handId?: string | null,
): EvSessionState {
  return recordActualResult({
    handId,
    outcome: payload.heroWon ? 'win' : 'lose',
    totalPot: payload.totalPot,
    heroInvested: payload.heroInvested,
  });
}

export function totalSessionEv(session: EvSessionState): number {
  if (session.cumulativeEv.length === 0) return 0;
  return session.cumulativeEv[session.cumulativeEv.length - 1];
}

export function totalSessionReal(session: EvSessionState): number {
  if (session.cumulativeReal.length === 0) return 0;
  return session.cumulativeReal[session.cumulativeReal.length - 1];
}

export function getLatestPendingHand(
  session: EvSessionState,
): EvHandRecord | null {
  for (let i = session.hands.length - 1; i >= 0; i--) {
    if (session.hands[i].actualResult === null) return session.hands[i];
  }
  return null;
}

export type HandResolvedHandler = (payload: HandResolvedPayload) => void;
export type HandResolvedRef = MutableRefObject<HandResolvedHandler | null>;
