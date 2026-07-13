import { useCallback, useEffect, useRef } from 'react';
import type { Card, Position, PositionState } from '../types';
import {
  getMaxStreetBet,
  getSeatStreetMode,
  type StreetMode,
} from '../lib/potEngine';
import { isCardInputChar, parseCardPair, parseCardSequence } from '../lib/cardInput';
import type { CardSelectTarget } from '../lib/cardInput';
import type { SeatIndex } from '../lib/seatLayout';

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

function canUseCard(
  card: Card,
  target: CardSelectTarget,
  heroCards: [Card | null, Card | null],
  boardCards: (Card | null)[],
  usedCards: Set<Card>,
): boolean {
  if (target.type === 'hero') {
    const otherSlot = target.slot === 0 ? 1 : 0;
    if (usedCards.has(card) && heroCards[otherSlot] !== card) return false;
    return true;
  }
  if (usedCards.has(card) && boardCards[target.index] !== card) return false;
  return true;
}

function nextCardTarget(
  current: CardSelectTarget,
  boardLimit: number,
): CardSelectTarget | null {
  if (current.type === 'hero') {
    if (current.slot === 0) return { type: 'hero', slot: 1 };
    if (boardLimit > 0) return { type: 'board', index: 0 };
    return null;
  }
  if (current.index + 1 < boardLimit) {
    return { type: 'board', index: current.index + 1 };
  }
  return null;
}

export interface GrindingHotkeysConfig {
  enabled?: boolean;
  cardTarget: CardSelectTarget | null;
  onCardTargetChange: (target: CardSelectTarget | null) => void;
  heroCards: [Card | null, Card | null];
  boardCards: (Card | null)[];
  boardLimit: number;
  usedCards: Set<Card>;
  onSelectHero: (slot: 0 | 1, card: Card | null) => void;
  onSelectBoard: (index: number, card: Card | null) => void;
  activeSeatIndex: SeatIndex;
  seats: PositionState[];
  positions: Record<Position, PositionState>;
  onUpdateSeat: (seatIndex: SeatIndex, patch: Partial<PositionState>) => void;
  focusBetInput: (seatIndex: SeatIndex) => void;
}

export function useGrindingHotkeys({
  enabled = true,
  cardTarget,
  onCardTargetChange,
  heroCards,
  boardCards,
  boardLimit,
  usedCards,
  onSelectHero,
  onSelectBoard,
  activeSeatIndex,
  seats,
  positions,
  onUpdateSeat,
  focusBetInput,
}: GrindingHotkeysConfig) {
  const cardBufferRef = useRef('');

  const applyCard = useCallback(
    (card: Card, target: CardSelectTarget) => {
      if (!canUseCard(card, target, heroCards, boardCards, usedCards)) return false;

      if (target.type === 'hero') {
        onSelectHero(target.slot, card);
      } else {
        onSelectBoard(target.index, card);
      }

      onCardTargetChange(nextCardTarget(target, boardLimit));
      return true;
    },
    [
      heroCards,
      boardCards,
      usedCards,
      onSelectHero,
      onSelectBoard,
      onCardTargetChange,
      boardLimit,
    ],
  );

  const applyCheckOrCall = useCallback(() => {
    const state = seats[activeSeatIndex];
    if (state.folded) return;

    const maxBet = getMaxStreetBet(positions);
    const mode: StreetMode = getSeatStreetMode(state, maxBet);

    if (mode === 'facing') {
      onUpdateSeat(activeSeatIndex, { betSize: maxBet });
      return;
    }

    if (mode === 'open') {
      onUpdateSeat(activeSeatIndex, { betSize: 0 });
    }
  }, [activeSeatIndex, seats, positions, onUpdateSeat]);

  const applyFold = useCallback(() => {
    onUpdateSeat(activeSeatIndex, { folded: true });
  }, [activeSeatIndex, onUpdateSeat]);

  useEffect(() => {
    if (!enabled) return;

    const flushBuffer = () => {
      let buf = cardBufferRef.current;
      while (buf.length >= 2) {
        const card = parseCardPair(buf[0], buf[1]);
        if (!card) {
          buf = buf.slice(1);
          continue;
        }
        buf = buf.slice(2);
        if (cardTarget) {
          applyCard(card, cardTarget);
        }
      }
      cardBufferRef.current = buf;
    };

    const handleCardChar = (char: string) => {
      if (!cardTarget) return;
      const lower = char.toLowerCase();
      cardBufferRef.current += lower;

      if (cardBufferRef.current.length >= 2) {
        flushBuffer();
      }
    };

    const handleCardPaste = (text: string) => {
      if (!cardTarget) return;
      cardBufferRef.current = '';
      let target: CardSelectTarget | null = cardTarget;

      for (const card of parseCardSequence(text)) {
        if (!target) break;
        if (!canUseCard(card, target, heroCards, boardCards, usedCards)) continue;
        if (target.type === 'hero') {
          onSelectHero(target.slot, card);
        } else {
          onSelectBoard(target.index, card);
        }
        target = nextCardTarget(target, boardLimit);
      }

      onCardTargetChange(target);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      const inField = isTypingInField(e.target);

      if (cardTarget && !inField && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isCardInputChar(e.key)) {
          e.preventDefault();
          handleCardChar(e.key);
          return;
        }
      }

      if (inField) return;

      const key = e.key.toLowerCase();

      if (key === 'f') {
        e.preventDefault();
        applyFold();
        return;
      }

      if (key === 'c') {
        e.preventDefault();
        applyCheckOrCall();
        return;
      }

      if (key === 'r') {
        e.preventDefault();
        focusBetInput(activeSeatIndex);
        return;
      }

      if (key >= '1' && key <= '6') {
        e.preventDefault();
        focusBetInput((Number(key) - 1) as SeatIndex);
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (!cardTarget || isTypingInField(e.target)) return;
      const text = e.clipboardData?.getData('text') ?? '';
      if (!parseCardSequence(text).length) return;
      e.preventDefault();
      handleCardPaste(text);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, [
    enabled,
    cardTarget,
    heroCards,
    boardCards,
    boardLimit,
    usedCards,
    onSelectHero,
    onSelectBoard,
    onCardTargetChange,
    applyCard,
    applyFold,
    applyCheckOrCall,
    activeSeatIndex,
    focusBetInput,
  ]);

  useEffect(() => {
    cardBufferRef.current = '';
  }, [cardTarget]);
}
