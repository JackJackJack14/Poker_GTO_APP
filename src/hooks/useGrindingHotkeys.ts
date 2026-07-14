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

function firstEmptyTarget(
  heroCards: [Card | null, Card | null],
  boardCards: (Card | null)[],
  boardLimit: number,
): CardSelectTarget | null {
  if (!heroCards[0]) return { type: 'hero', slot: 0 };
  if (!heroCards[1]) return { type: 'hero', slot: 1 };
  for (let i = 0; i < boardLimit; i++) {
    if (!boardCards[i]) return { type: 'board', index: i };
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

/**
 * Stable hotkeys via refs — ไม่ rebind listener ทุกครั้งที่ state ไพ่เปลี่ยน (กันหน่วงตอน grinding)
 */
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
  const stateRef = useRef({
    cardTarget,
    heroCards,
    boardCards,
    boardLimit,
    usedCards,
    activeSeatIndex,
    seats,
    positions,
  });

  stateRef.current = {
    cardTarget,
    heroCards,
    boardCards,
    boardLimit,
    usedCards,
    activeSeatIndex,
    seats,
    positions,
  };

  const callbacksRef = useRef({
    onCardTargetChange,
    onSelectHero,
    onSelectBoard,
    onUpdateSeat,
    focusBetInput,
  });
  callbacksRef.current = {
    onCardTargetChange,
    onSelectHero,
    onSelectBoard,
    onUpdateSeat,
    focusBetInput,
  };

  useEffect(() => {
    cardBufferRef.current = '';
  }, [cardTarget]);

  useEffect(() => {
    if (!enabled) return;

    const applyCardAt = (card: Card, target: CardSelectTarget): boolean => {
      const s = stateRef.current;
      const cb = callbacksRef.current;
      if (!canUseCard(card, target, s.heroCards, s.boardCards, s.usedCards)) {
        return false;
      }
      if (target.type === 'hero') {
        cb.onSelectHero(target.slot, card);
      } else {
        cb.onSelectBoard(target.index, card);
      }
      const next = nextCardTarget(target, s.boardLimit);
      cb.onCardTargetChange(next);

      const nextHero: [Card | null, Card | null] =
        target.type === 'hero'
          ? [
              target.slot === 0 ? card : s.heroCards[0],
              target.slot === 1 ? card : s.heroCards[1],
            ]
          : s.heroCards;
      const nextBoard =
        target.type === 'board'
          ? s.boardCards.map((c, i) => (i === target.index ? card : c))
          : s.boardCards;
      const nextUsed = new Set(s.usedCards);
      nextUsed.add(card);

      stateRef.current = {
        ...stateRef.current,
        cardTarget: next,
        heroCards: nextHero,
        boardCards: nextBoard,
        usedCards: nextUsed,
      };
      return true;
    };

    const flushBuffer = () => {
      let buf = cardBufferRef.current;
      while (buf.length >= 2) {
        const card = parseCardPair(buf[0], buf[1]);
        if (!card) {
          buf = buf.slice(1);
          continue;
        }
        buf = buf.slice(2);
        let target = stateRef.current.cardTarget;
        if (!target) {
          target = firstEmptyTarget(
            stateRef.current.heroCards,
            stateRef.current.boardCards,
            stateRef.current.boardLimit,
          );
          if (target) {
            callbacksRef.current.onCardTargetChange(target);
            stateRef.current = { ...stateRef.current, cardTarget: target };
          }
        }
        if (target) {
          applyCardAt(card, target);
        }
      }
      cardBufferRef.current = buf;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      const inField = isTypingInField(e.target);
      const key = e.key;

      // Card typing — auto-pick first empty slot if no target
      if (
        !inField &&
        key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        isCardInputChar(key)
      ) {
        e.preventDefault();
        e.stopPropagation();

        if (!stateRef.current.cardTarget) {
          const auto = firstEmptyTarget(
            stateRef.current.heroCards,
            stateRef.current.boardCards,
            stateRef.current.boardLimit,
          );
          if (auto) {
            callbacksRef.current.onCardTargetChange(auto);
            stateRef.current = { ...stateRef.current, cardTarget: auto };
          }
        }

        if (!stateRef.current.cardTarget) return;

        cardBufferRef.current += key.toLowerCase();
        if (cardBufferRef.current.length >= 2) {
          flushBuffer();
        }
        return;
      }

      if (inField) return;

      const lower = key.toLowerCase();
      const s = stateRef.current;
      const cb = callbacksRef.current;

      if (lower === 'f') {
        e.preventDefault();
        cb.onUpdateSeat(s.activeSeatIndex, { folded: true });
        return;
      }

      if (lower === 'c') {
        e.preventDefault();
        const seat = s.seats[s.activeSeatIndex];
        if (seat.folded) return;
        const maxBet = getMaxStreetBet(s.positions);
        const mode: StreetMode = getSeatStreetMode(seat, maxBet);
        if (mode === 'facing') {
          cb.onUpdateSeat(s.activeSeatIndex, { betSize: maxBet });
        } else if (mode === 'open') {
          cb.onUpdateSeat(s.activeSeatIndex, { betSize: 0 });
        }
        return;
      }

      if (lower === 'r') {
        e.preventDefault();
        cb.focusBetInput(s.activeSeatIndex);
        return;
      }

      if (lower >= '1' && lower <= '6') {
        e.preventDefault();
        cb.focusBetInput((Number(lower) - 1) as SeatIndex);
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isTypingInField(e.target)) return;
      const text = e.clipboardData?.getData('text') ?? '';
      const cards = parseCardSequence(text);
      if (!cards.length) return;
      e.preventDefault();

      cardBufferRef.current = '';
      let target =
        stateRef.current.cardTarget ??
        firstEmptyTarget(
          stateRef.current.heroCards,
          stateRef.current.boardCards,
          stateRef.current.boardLimit,
        );

      for (const card of cards) {
        if (!target) break;
        if (
          !canUseCard(
            card,
            target,
            stateRef.current.heroCards,
            stateRef.current.boardCards,
            stateRef.current.usedCards,
          )
        ) {
          continue;
        }
        applyCardAt(card, target);
        target = stateRef.current.cardTarget;
      }
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('paste', onPaste, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('paste', onPaste, { capture: true });
    };
  }, [enabled]);
}
