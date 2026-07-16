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

/**
 * Quick Card Parser — แปลงข้อความเต็มก้อน (เช่น AsKd / KsJhTs / 2s)
 * คืน null ถ้ามีตัวอักษรเหลือที่ไม่ใช่ไพ่ (เข้มกว่า parseCardSequence)
 */
export function parseQuickCardCommand(input: string): Card[] | null {
  const normalized = input.replace(/\s/g, '').toLowerCase();
  if (!normalized) return null;
  if (normalized.length % 2 !== 0) return null;

  const cards: Card[] = [];
  for (let i = 0; i < normalized.length; i += 2) {
    const card = parseCardPair(normalized[i], normalized[i + 1]);
    if (!card) return null;
    cards.push(card);
  }
  return cards;
}

export function isCardInputChar(char: string): boolean {
  if (char.length !== 1) return false;
  const lower = char.toLowerCase();
  return lower in RANK_CHARS || SUIT_CHARS.has(lower);
}

export type QuickCardApplyResult = {
  ok: boolean;
  applied: number;
  message: string;
  /** สล็อตที่ถูกเติม */
  filled: Array<
    | { type: 'hero'; slot: 0 | 1; card: Card }
    | { type: 'board'; index: number; card: Card }
  >;
};

/**
 * วางไพ่ตามสตรีท: เติม Hero ที่ว่างก่อน → ที่เหลือลง Board ตามช่องว่างของสตรีทปัจจุบัน
 */
export function planQuickCardPlacement(params: {
  cards: Card[];
  heroCards: [Card | null, Card | null];
  boardCards: (Card | null)[];
  boardLimit: number;
  usedCards: Set<Card>;
}): QuickCardApplyResult {
  const { cards, heroCards, boardCards, boardLimit, usedCards } = params;
  if (cards.length === 0) {
    return { ok: false, applied: 0, message: 'ไม่พบไพ่ในข้อความ', filled: [] };
  }

  const seen = new Set<Card>();
  for (const c of cards) {
    if (seen.has(c)) {
      return {
        ok: false,
        applied: 0,
        message: `ไพ่ซ้ำในคำสั่ง: ${c}`,
        filled: [],
      };
    }
    seen.add(c);
  }

  const occupied = new Set(usedCards);
  const filled: QuickCardApplyResult['filled'] = [];
  let cursor = 0;

  const takeIfFree = (card: Card): boolean => {
    if (occupied.has(card)) return false;
    occupied.add(card);
    return true;
  };

  for (const slot of [0, 1] as const) {
    if (cursor >= cards.length) break;
    if (heroCards[slot]) continue;
    const card = cards[cursor]!;
    if (!takeIfFree(card)) {
      return {
        ok: false,
        applied: 0,
        message: `ไพ่ ${card} ถูกใช้อยู่แล้ว`,
        filled: [],
      };
    }
    filled.push({ type: 'hero', slot, card });
    cursor += 1;
  }

  for (let index = 0; index < boardLimit; index++) {
    if (cursor >= cards.length) break;
    if (boardCards[index]) continue;
    const card = cards[cursor]!;
    if (!takeIfFree(card)) {
      return {
        ok: false,
        applied: 0,
        message: `ไพ่ ${card} ถูกใช้อยู่แล้ว`,
        filled: [],
      };
    }
    filled.push({ type: 'board', index, card });
    cursor += 1;
  }

  if (filled.length === 0) {
    return {
      ok: false,
      applied: 0,
      message: 'ไม่มีช่องว่างให้ใส่ไพ่ (Hero/Board เต็มแล้ว)',
      filled: [],
    };
  }

  if (cursor < cards.length) {
    return {
      ok: false,
      applied: 0,
      message: `ไพ่เกินช่องว่าง (ใส่ได้ ${filled.length} ใบ จาก ${cards.length})`,
      filled: [],
    };
  }

  const labels = filled
    .map((f) =>
      f.type === 'hero' ? `H${f.slot + 1}:${f.card}` : `B${f.index + 1}:${f.card}`,
    )
    .join(' · ');

  return {
    ok: true,
    applied: filled.length,
    message: `ใส่ไพ่แล้ว: ${labels}`,
    filled,
  };
}
