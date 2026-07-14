import type { GtoResponse, Position, Stage } from '../types';

const STORAGE_KEY = 'poker-gto-ev-session-v2';
const LEGACY_KEY = 'poker-gto-ev-session-v1';

export interface EvHandRecord {
  id: string;
  ts: number;
  ev: number;
  /** ผลจริงของแฮนด์ (BB) — null = ยังไม่บันทึก */
  actualResult: number | null;
  equity: number;
  pot: number;
  /** ยอดที่ Hero ลงบนโต๊ะ ณ ตอนวิเคราะห์ (ใช้ตอนแพ้) */
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

/**
 * บันทึกผลจริงท้ายแฮนด์
 * - win → +totalPot
 * - lose → −heroBet (จ่ายทิ้ง)
 */
export function recordActualResult(params: {
  handId?: string | null;
  outcome: 'win' | 'lose';
  /** Pot ปัจจุบันตอนกดชนะ */
  totalPot: number;
  /** ยอด Hero จ่าย (ถ้าไม่ส่ง ใช้ที่บันทึกตอน analyze) */
  heroBetSize?: number;
}): EvSessionState {
  const session = loadEvSession();
  if (session.hands.length === 0) return session;

  let idx = session.hands.length - 1;
  if (params.handId) {
    const found = session.hands.findIndex((h) => h.id === params.handId);
    if (found >= 0) idx = found;
  } else {
    for (let i = session.hands.length - 1; i >= 0; i--) {
      if (session.hands[i].actualResult === null) {
        idx = i;
        break;
      }
    }
  }

  const hand = session.hands[idx];
  const heroBet = Math.max(
    0,
    params.heroBetSize ?? hand.heroBetSize ?? 0,
  );
  const actualResult =
    params.outcome === 'win'
      ? Math.round(Math.max(0, params.totalPot) * 100) / 100
      : Math.round(-heroBet * 100) / 100;

  const hands = session.hands.map((h, i) =>
    i === idx ? { ...h, actualResult, pot: params.totalPot || h.pot } : h,
  );
  return persist(withSeries(hands));
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
