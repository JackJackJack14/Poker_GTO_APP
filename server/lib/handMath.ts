import type { Card } from '../../shared/types';
import { detectDrawTags } from '../../shared/lib/betContext';

const RANK_VALUES: Record<string, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
};

export function cardRank(card: Card): number {
  const rankStr = card.slice(0, -1);
  return RANK_VALUES[rankStr] ?? Number(rankStr);
}

export function cardSuit(card: Card): string {
  return card.slice(-1);
}

export function rankChar(rank: number): string {
  const map: Record<number, string> = {
    14: 'A',
    13: 'K',
    12: 'Q',
    11: 'J',
    10: 'T',
  };
  return map[rank] ?? String(rank);
}

/** Canonical preflop code e.g. AKs, AKo, 77 */
export function toHandCode(cards: [Card, Card]): string {
  const a = { r: cardRank(cards[0]), s: cardSuit(cards[0]) };
  const b = { r: cardRank(cards[1]), s: cardSuit(cards[1]) };
  const high = a.r >= b.r ? a : b;
  const low = a.r >= b.r ? b : a;
  if (high.r === low.r) return `${rankChar(high.r)}${rankChar(low.r)}`;
  const suited = high.s === low.s ? 's' : 'o';
  return `${rankChar(high.r)}${rankChar(low.r)}${suited}`;
}

/** Rough preflop equity vs random range (static table, not solver) */
export function estimatePreflopEquity(handCode: string): number {
  if (/^([2-9TJQKA])\1$/.test(handCode)) {
    const r = cardRank(`${handCode[0]}s`);
    // 22≈50, AA≈85
    return Math.round(50 + ((r - 2) / 12) * 35);
  }
  const suited = handCode.endsWith('s');
  const high = cardRank(`${handCode[0]}s`);
  const low = cardRank(`${handCode[1]}s`);
  const gap = high - low;
  let eq = 30 + (high - 2) * 1.6 + (low - 2) * 0.8;
  if (suited) eq += 3;
  if (gap === 1) eq += 2;
  if (gap >= 4) eq -= gap;
  if (handCode.startsWith('AK')) eq = suited ? 67 : 65;
  if (handCode.startsWith('AQ')) eq = suited ? 66 : 64;
  return Math.min(85, Math.max(18, Math.round(eq)));
}

/**
 * Equity vs tight 3-bet range ≈ QQ+/AK (~value) + light bluffs (Axs/SC)
 * Mid SC เช่น T9s ควรอยู่ราว 35–40% (ไม่ใช่ ~53% แบบ vs random)
 */
export function estimatePreflopEquityVs3BetRange(handCode: string): number {
  if (/^([2-9TJQKA])\1$/.test(handCode)) {
    const r = cardRank(`${handCode[0]}s`);
    if (r >= 14) return 85;
    if (r === 13) return 82;
    if (r === 12) return 68;
    if (r === 11) return 54;
    if (r === 10) return 47;
    // 99→43 … 22→32
    return Math.round(32 + ((r - 2) / 7) * 11);
  }

  const suited = handCode.endsWith('s');
  const high = cardRank(`${handCode[0]}s`);
  const low = cardRank(`${handCode[1]}s`);
  const gap = high - low;
  const prefix = handCode.slice(0, 2);

  if (prefix === 'AK') return suited ? 43 : 41;
  if (prefix === 'AQ') return suited ? 38 : 34;
  if (prefix === 'AJ') return suited ? 36 : 32;
  if (prefix === 'AT') return suited ? 35 : 31;
  if (prefix === 'KQ') return suited ? 36 : 32;

  // Speculative / mid suited — blend vs value (~30% eq) + light bluffs (~50%)
  let eq = suited ? 34 : 30;
  eq += (high - 10) * 1.2;
  eq += (low - 8) * 0.6;
  if (gap === 1) eq += 1.5;
  if (gap >= 3) eq -= gap * 0.8;
  if (high <= 9 && !suited) eq -= 3;
  return Math.min(55, Math.max(28, Math.round(eq)));
}

/**
 * Preflop equity ตาม prior action (แยกจาก postflop equity เด็ดขาด)
 * - UNOPENED: vs random
 * - FACING_OPEN: แคบกว่า random เล็กน้อย
 * - FACING_3BET: vs QQ+/AK + Light Bluff
 */
export function estimatePreflopEquityByPrior(
  handCode: string,
  prior: 'UNOPENED' | 'FACING_OPEN' | 'FACING_3BET',
): number {
  if (prior === 'FACING_3BET') {
    return estimatePreflopEquityVs3BetRange(handCode);
  }
  const vsRandom = estimatePreflopEquity(handCode);
  if (prior === 'FACING_OPEN') {
    return Math.min(85, Math.max(20, Math.round(vsRandom * 0.9 + 1)));
  }
  return vsRandom;
}

export type MadeCategory =
  | 'high-card'
  | 'one-pair'
  | 'two-pair'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'quads'
  | 'straight-flush';

export function classifyMadeHand(
  heroCards: [Card, Card],
  boardCards: Card[],
): { category: MadeCategory; score: number } {
  if (boardCards.length < 3) {
    return { category: 'high-card', score: Math.max(...heroCards.map(cardRank)) };
  }

  const all = [...heroCards, ...boardCards];
  const ranks = all.map(cardRank);
  const suits = all.map(cardSuit);

  const rankCount: Record<number, number> = {};
  for (const r of ranks) rankCount[r] = (rankCount[r] ?? 0) + 1;
  const counts = Object.values(rankCount).sort((a, b) => b - a);
  const uniqueSorted = [...new Set(ranks)].sort((a, b) => a - b);

  const suitCount: Record<string, number> = {};
  for (const s of suits) suitCount[s] = (suitCount[s] ?? 0) + 1;
  const flushSuit = Object.entries(suitCount).find(([, c]) => c >= 5)?.[0];
  const isFlush = Boolean(flushSuit);

  let isStraight = false;
  const wheel = [14, 5, 4, 3, 2];
  if (wheel.every((r) => uniqueSorted.includes(r))) isStraight = true;
  for (let i = 0; i <= uniqueSorted.length - 5; i++) {
    const w = uniqueSorted.slice(i, i + 5);
    if (w[4] - w[0] === 4) isStraight = true;
  }

  if (isFlush && isStraight) return { category: 'straight-flush', score: 95 };
  if (counts[0] >= 4) return { category: 'quads', score: 92 };
  if (counts[0] >= 3 && counts[1] >= 2) return { category: 'full-house', score: 88 };
  if (isFlush) return { category: 'flush', score: 82 };
  if (isStraight) return { category: 'straight', score: 78 };
  if (counts[0] >= 3) return { category: 'trips', score: 70 };
  if (counts[0] >= 2 && counts[1] >= 2) return { category: 'two-pair', score: 62 };
  if (counts[0] >= 2) {
    const pairRank = Number(
      Object.entries(rankCount).find(([, c]) => c >= 2)?.[0] ?? 0,
    );
    const heroHasPair = heroCards.some((c) => cardRank(c) === pairRank);
    const boardMax = Math.max(...boardCards.map(cardRank));
    const heroPocket =
      cardRank(heroCards[0]) === cardRank(heroCards[1]) &&
      cardRank(heroCards[0]) === pairRank;
    const overpair = heroPocket && pairRank > boardMax;
    const topPair = heroHasPair && pairRank === boardMax;
    let score = heroHasPair ? 48 + pairRank : 40 + pairRank * 0.5;
    if (overpair) score = Math.max(score, 72 + (pairRank - 10));
    else if (topPair) score = Math.max(score, 58 + pairRank * 0.4);
    return {
      category: 'one-pair',
      score,
    };
  }
  return {
    category: 'high-card',
    score: 20 + Math.max(...heroCards.map(cardRank)),
  };
}

/** Outs → rough equity % remaining (rule of 2/4) */
export function outsToEquity(
  outs: number,
  stage: 'FLOP' | 'TURN' | 'RIVER',
): number {
  if (outs <= 0 || stage === 'RIVER') return 0;
  if (stage === 'FLOP') return Math.min(90, outs * 4);
  return Math.min(90, outs * 2);
}

const STRAIGHT_WINDOWS: number[][] = (() => {
  const windows: number[][] = [[14, 5, 4, 3, 2]];
  for (let low = 2; low <= 10; low++) {
    windows.push([low, low + 1, low + 2, low + 3, low + 4]);
  }
  return windows;
})();

/** Ranks ที่ทำให้ติด straight (gutshot 1 rank / OESD 2 ranks) */
export function findStraightDrawOutRanks(
  heroCards: [Card, Card],
  boardCards: Card[],
): { gutshotRanks: number[]; oesdRanks: number[] } {
  const known = new Set([...heroCards, ...boardCards].map(cardRank));
  const gutshot = new Set<number>();
  const oesd = new Set<number>();

  for (const window of STRAIGHT_WINDOWS) {
    const present = window.filter((r) => known.has(r));
    const missing = window.filter((r) => !known.has(r));
    if (present.length === 4 && missing.length === 1) {
      gutshot.add(missing[0]);
    }
  }

  const rankList = [...known];
  if (known.has(14)) rankList.push(1);
  const sorted = [...new Set(rankList)].sort((a, b) => a - b);
  for (let i = 0; i <= sorted.length - 4; i++) {
    const slice = sorted.slice(i, i + 4);
    if (slice[3] - slice[0] !== 3) continue;
    if (!slice.every((v, idx) => idx === 0 || slice[idx] - slice[idx - 1] === 1)) {
      continue;
    }
    const low = slice[0] - 1;
    const high = slice[3] + 1;
    if (low === 1) oesd.add(14);
    else if (low >= 2) oesd.add(low);
    if (high <= 14) oesd.add(high);
  }

  for (const r of gutshot) oesd.delete(r);

  return {
    gutshotRanks: [...gutshot],
    oesdRanks: [...oesd],
  };
}

export function countLikelyOuts(
  heroCards: [Card, Card],
  boardCards: Card[],
): number {
  const tags = detectDrawTags(heroCards, boardCards);
  const straight = findStraightDrawOutRanks(heroCards, boardCards);
  let outs = 0;
  if (tags.includes('flush-draw') || tags.includes('nut-flush-draw')) outs += 9;
  if (straight.oesdRanks.length >= 2) outs += 8;
  else if (straight.gutshotRanks.length >= 1) outs += 4;
  else if (tags.includes('open-ended')) outs += 8;
  else if (tags.includes('nut-gutshot') || tags.includes('gutshot')) outs += 4;
  return Math.min(15, outs);
}

const SUIT_EMOJI: Record<string, string> = {
  h: '❤️',
  d: '💎',
  s: '♠️',
  c: '♣️',
};

export interface DirtyOutsReport {
  active: boolean;
  threatSuit: string | null;
  dirtyOutsCount: number;
  rawOuts: number;
  cleanOuts: number;
  /** ตัวอย่างไพ่สกปรก เช่น J❤️ / 9❤️ */
  dirtyCardLabels: string[];
}

/**
 * Dirty Outs: บอร์ดมี FD (ดอกเดียวกัน ≥2) และ Hero ไม่มี blocker ดอกนั้น
 * → ห้ามนับ outs ดอกนั้นเต็ม ๆ (หักออกเพื่อไม่ให้ EV สูงเกินจริง)
 */
export function analyzeDirtyOuts(
  heroCards: [Card, Card],
  boardCards: Card[],
): DirtyOutsReport {
  const rawOuts = countLikelyOuts(heroCards, boardCards);
  if (boardCards.length < 3) {
    return {
      active: false,
      threatSuit: null,
      dirtyOutsCount: 0,
      rawOuts,
      cleanOuts: rawOuts,
      dirtyCardLabels: [],
    };
  }

  const boardSuitCount: Record<string, number> = {};
  for (const c of boardCards) {
    const s = cardSuit(c);
    boardSuitCount[s] = (boardSuitCount[s] ?? 0) + 1;
  }

  const threat = Object.entries(boardSuitCount)
    .filter(([, n]) => n >= 2 && n <= 3)
    .sort((a, b) => b[1] - a[1])[0];

  if (!threat) {
    return {
      active: false,
      threatSuit: null,
      dirtyOutsCount: 0,
      rawOuts,
      cleanOuts: rawOuts,
      dirtyCardLabels: [],
    };
  }

  const [threatSuit] = threat;
  const heroHasBlocker = heroCards.some((c) => cardSuit(c) === threatSuit);
  if (heroHasBlocker) {
    return {
      active: false,
      threatSuit,
      dirtyOutsCount: 0,
      rawOuts,
      cleanOuts: rawOuts,
      dirtyCardLabels: [],
    };
  }

  const straight = findStraightDrawOutRanks(heroCards, boardCards);
  const dirtyRanks = [...straight.gutshotRanks, ...straight.oesdRanks];
  let dirtyCardLabels = dirtyRanks.map(
    (r) => `${rankChar(r)}${SUIT_EMOJI[threatSuit] ?? threatSuit}`,
  );
  let dirtyOutsCount = dirtyRanks.length;

  if (dirtyOutsCount === 0) {
    const tags = detectDrawTags(heroCards, boardCards);
    if (tags.includes('open-ended')) dirtyOutsCount += 2;
    if (tags.includes('nut-gutshot') || tags.includes('gutshot')) dirtyOutsCount += 1;
    if (dirtyOutsCount === 0 && rawOuts > 0) {
      dirtyOutsCount = Math.min(rawOuts, Math.max(1, Math.ceil(rawOuts / 4)));
      const usedRanks = new Set(boardCards.map(cardRank));
      const sampleRanks = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].filter(
        (r) => !usedRanks.has(r),
      );
      dirtyCardLabels.push(
        ...sampleRanks
          .slice(0, Math.min(dirtyOutsCount, 2))
          .map((r) => `${rankChar(r)}${SUIT_EMOJI[threatSuit] ?? threatSuit}`),
      );
    }
  }

  dirtyOutsCount = Math.min(dirtyOutsCount, rawOuts);
  const cleanOuts = Math.max(0, rawOuts - dirtyOutsCount);

  return {
    active: dirtyOutsCount > 0,
    threatSuit,
    dirtyOutsCount,
    rawOuts,
    cleanOuts,
    dirtyCardLabels: dirtyCardLabels.slice(0, dirtyOutsCount),
  };
}

export interface EquityEstimate {
  /** Equity สุทธิหลังหัก dirty outs */
  equity: number;
  /** Equity ก่อนหัก */
  rawEquity: number;
  dirty: DirtyOutsReport;
}

/**
 * Estimated showdown equity % + dirty-outs filter
 */
export function estimateEquityDetailed(
  heroCards: [Card, Card],
  boardCards: Card[],
  stage: 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER',
): EquityEstimate {
  if (stage === 'PREFLOP') {
    const equity = estimatePreflopEquity(toHandCode(heroCards));
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

  const made = classifyMadeHand(heroCards, boardCards);
  const dirty = analyzeDirtyOuts(heroCards, boardCards);
  const street = stage === 'RIVER' ? 'RIVER' : stage;

  const rawDrawEq = outsToEquity(dirty.rawOuts, street);
  const cleanDrawEq = outsToEquity(dirty.cleanOuts, street);
  const madeEq = Math.min(95, Math.max(12, made.score));

  const blend = (drawEq: number) => {
    if (drawEq <= 0) return Math.round(madeEq);
    if (madeEq >= 70) return Math.round(Math.min(96, madeEq + drawEq * 0.15));
    return Math.round(Math.min(92, madeEq * 0.55 + drawEq * 0.7 + 8));
  };

  const rawEquity = blend(rawDrawEq);
  const equity = blend(cleanDrawEq);

  return { equity, rawEquity, dirty };
}

export function estimateEquity(
  heroCards: [Card, Card],
  boardCards: Card[],
  stage: 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER',
): number {
  return estimateEquityDetailed(heroCards, boardCards, stage).equity;
}

export function hasStrongDraw(gameState: {
  heroCards: [Card, Card];
  boardCards: Card[];
}): boolean {
  const tags = detectDrawTags(gameState.heroCards, gameState.boardCards);
  return tags.some((t) =>
    ['nut-gutshot', 'nut-flush-draw', 'flush-draw', 'open-ended', 'has-draw'].includes(
      t,
    ),
  );
}

/** Suited connector / weak suited — Rake-Trap candidates */
export function isMarginalSuitedHand(cards: [Card, Card]): boolean {
  const a = { r: cardRank(cards[0]), s: cardSuit(cards[0]) };
  const b = { r: cardRank(cards[1]), s: cardSuit(cards[1]) };
  if (a.s !== b.s) return false;
  const high = Math.max(a.r, b.r);
  const low = Math.min(a.r, b.r);
  const gap = high - low;
  if (high <= 11 && gap <= 3) return true;
  if (high <= 9) return true;
  return false;
}

export { detectDrawTags };
