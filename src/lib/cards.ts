import type { Card, Stage } from '../types';

export const RANKS = [
  'A',
  'K',
  'Q',
  'J',
  'T',
  '9',
  '8',
  '7',
  '6',
  '5',
  '4',
  '3',
  '2',
] as const;

export const SUITS = ['s', 'h', 'd', 'c'] as const;

export const SUIT_SYMBOLS: Record<(typeof SUITS)[number], string> = {
  s: '♠',
  h: '♥',
  d: '♦',
  c: '♣',
};

export const SUIT_NAMES: Record<(typeof SUITS)[number], string> = {
  s: 'Spades',
  h: 'Hearts',
  d: 'Diamonds',
  c: 'Clubs',
};

export function generateDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

export const FULL_DECK = generateDeck();

export function isRedSuit(card: Card): boolean {
  return card.endsWith('h') || card.endsWith('d');
}

export function parseCard(card: Card): { rank: string; suit: (typeof SUITS)[number] } {
  const suit = card.slice(-1) as (typeof SUITS)[number];
  const rank = card.slice(0, -1);
  return { rank, suit };
}

export function formatCard(card: Card): string {
  const { rank, suit } = parseCard(card);
  return `${rank}${SUIT_SYMBOLS[suit]}`;
}

export function boardCardLimit(stage: Stage): number {
  switch (stage) {
    case 'PREFLOP':
      return 0;
    case 'FLOP':
      return 3;
    case 'TURN':
      return 4;
    case 'RIVER':
      return 5;
  }
}
