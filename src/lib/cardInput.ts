import type { Card } from '../types';
import { FULL_DECK } from './cards';

export type CardSelectTarget =
  | { type: 'hero'; slot: 0 | 1 }
  | { type: 'board'; index: number };

const RANK_CHARS: Record<string, string> = {
  a: 'A',
  k: 'K',
  q: 'Q',
  j: 'J',
  t: 'T',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
};

const SUIT_CHARS = new Set(['s', 'h', 'd', 'c']);

export function parseCardPair(rankChar: string, suitChar: string): Card | null {
  const rank = RANK_CHARS[rankChar.toLowerCase()];
  const suit = suitChar.toLowerCase();
  if (!rank || !SUIT_CHARS.has(suit)) return null;
  const card = `${rank}${suit}` as Card;
  return FULL_DECK.includes(card) ? card : null;
}

/** แปลงสตริงติดกัน เช่น "AsKd" หรือ "qhjc2s" เป็นรายการไพ่ */
export function parseCardSequence(input: string): Card[] {
  const normalized = input.replace(/\s/g, '').toLowerCase();
  const cards: Card[] = [];
  let i = 0;

  while (i + 1 < normalized.length) {
    const card = parseCardPair(normalized[i], normalized[i + 1]);
    if (!card) break;
    cards.push(card);
    i += 2;
  }

  return cards;
}

export function isCardInputChar(char: string): boolean {
  if (char.length !== 1) return false;
  const lower = char.toLowerCase();
  return lower in RANK_CHARS || SUIT_CHARS.has(lower);
}
