import type { Card, GameState, Position } from '../types/poker.types';
import { POSITIONS } from '../types/poker.types';

export interface BetContext {
  maxStreetBet: number;
  heroBetSize: number;
  toCall: number;
  facingBetSize: number;
  potOddsPercent: number | null;
  mdfPercent: number | null;
  /** บรรทัดสำเร็จรูปสำหรับ template Pot Odds */
  potOddsLine: string;
}

export function getMaxStreetBet(
  positions: Record<Position, { betSize: number; folded: boolean }>,
): number {
  return POSITIONS.reduce((max, pos) => {
    const seat = positions[pos];
    if (seat.folded) return max;
    return Math.max(max, seat.betSize);
  }, 0);
}

export function computeBetContext(gameState: GameState): BetContext {
  const hero = gameState.positions[gameState.heroPosition];
  const maxStreetBet = getMaxStreetBet(gameState.positions);
  const heroBetSize = hero.betSize;
  const toCall = Math.max(0, maxStreetBet - heroBetSize);

  let facingBetSize = 0;
  for (const pos of POSITIONS) {
    if (pos === gameState.heroPosition) continue;
    const s = gameState.positions[pos];
    if (s.folded) continue;
    facingBetSize = Math.max(facingBetSize, s.betSize);
  }

  if (toCall <= 0) {
    if (maxStreetBet === 0) {
      return {
        maxStreetBet,
        heroBetSize,
        toCall: 0,
        facingBetSize,
        potOddsPercent: null,
        mdfPercent: null,
        potOddsLine: 'ไม่ต้อง call — เปิด check/bet ได้',
      };
    }
    return {
      maxStreetBet,
      heroBetSize,
      toCall: 0,
      facingBetSize,
      potOddsPercent: null,
      mdfPercent: null,
      potOddsLine: `matched ${heroBetSize.toFixed(1)}BB — ไม่ต้อง call`,
    };
  }

  const pot = gameState.pot;
  const potOddsPercent = (toCall / (pot + toCall)) * 100;
  const potBeforeBet = Math.max(0, pot - facingBetSize);
  const mdfPercent =
    potBeforeBet + facingBetSize > 0
      ? (potBeforeBet / (potBeforeBet + facingBetSize)) * 100
      : null;

  const potOddsLine = `ต้อง ${potOddsPercent.toFixed(1)}% equity (call ${toCall.toFixed(1)}BB เข้า pot ${pot.toFixed(1)}BB)${mdfPercent !== null ? ` | MDF ${mdfPercent.toFixed(0)}%` : ''}`;

  return {
    maxStreetBet,
    heroBetSize,
    toCall,
    facingBetSize,
    potOddsPercent,
    mdfPercent,
    potOddsLine,
  };
}

const RANK_VALUES: Record<string, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
};

function cardRank(card: Card): number {
  const rankStr = card.slice(0, -1);
  return RANK_VALUES[rankStr] ?? Number(rankStr);
}

function cardSuit(card: Card): string {
  return card.slice(-1);
}

/** แท็ก draw สำหรับ prompt — ช่วย AI ไม่ fold draw มูลค่าสูง */
export function detectDrawTags(
  heroCards: [Card, Card],
  boardCards: Card[],
): string[] {
  if (boardCards.length < 3) return [];

  const tags: string[] = [];
  const boardRanks = boardCards.map(cardRank).sort((a, b) => b - a);
  const heroRanks = heroCards.map(cardRank);
  const allRanks = [...boardRanks, ...heroRanks];

  const boardSuits = boardCards.map(cardSuit);
  const heroSuits = heroCards.map(cardSuit);

  const suitCounts: Record<string, number> = {};
  for (const s of [...boardSuits, ...heroSuits]) {
    suitCounts[s] = (suitCounts[s] ?? 0) + 1;
  }
  const flushSuit = Object.entries(suitCounts).find(([, c]) => c >= 4)?.[0];
  if (flushSuit) {
    tags.push('flush-draw');
    const heroFlushCards = heroCards.filter((c) => cardSuit(c) === flushSuit);
    if (heroFlushCards.some((c) => cardRank(c) === 14)) {
      tags.push('nut-flush-draw');
    }
  }

  const uniqueRanks = [...new Set(allRanks)].sort((a, b) => a - b);
  for (let i = 0; i < uniqueRanks.length - 3; i++) {
    const window = uniqueRanks.slice(i, i + 4);
    if (window[3] - window[0] === 3) {
      tags.push('open-ended');
      break;
    }
  }

  const hasBroadwayWindow =
    boardRanks.includes(13) &&
    boardRanks.includes(12) &&
    boardRanks.includes(10);
  const heroHasAce = heroRanks.includes(14);
  const boardMissingJack = !boardRanks.includes(11) && !heroRanks.includes(11);

  if (hasBroadwayWindow && boardMissingJack && heroHasAce) {
    tags.push('nut-gutshot');
  }

  if (
    boardRanks.includes(13) &&
    boardRanks.includes(12) &&
    boardRanks.includes(11) &&
    heroRanks.includes(14)
  ) {
    tags.push('nut-gutshot');
  }

  const hasGutshot = tags.includes('nut-gutshot') || tags.some((t) => t.includes('gutshot'));
  if (!hasGutshot) {
    for (let i = 0; i < uniqueRanks.length - 3; i++) {
      const w = uniqueRanks.slice(i, i + 4);
      if (w[3] - w[0] === 4 && w[1] - w[0] === 1 && w[2] - w[1] === 1) {
        tags.push('gutshot');
        break;
      }
    }
  }

  if (!tags.includes('gutshot') && !tags.includes('nut-gutshot')) {
    const known = new Set(allRanks);
    for (const window of [
      [14, 5, 4, 3, 2],
      ...Array.from({ length: 9 }, (_, i) => [
        i + 2,
        i + 3,
        i + 4,
        i + 5,
        i + 6,
      ]),
    ]) {
      const present = window.filter((r) => known.has(r));
      const missing = window.filter((r) => !known.has(r));
      if (present.length === 4 && missing.length === 1) {
        tags.push('gutshot');
        break;
      }
    }
  }

  if (tags.some((t) => t.includes('draw') || t.includes('gutshot') || t === 'open-ended')) {
    tags.push('has-draw');
  }

  return [...new Set(tags)];
}

export function hasStrongDraw(gameState: GameState): boolean {
  const tags = detectDrawTags(gameState.heroCards, gameState.boardCards);
  return tags.some((t) =>
    ['nut-gutshot', 'nut-flush-draw', 'flush-draw', 'open-ended', 'has-draw'].includes(t),
  );
}
