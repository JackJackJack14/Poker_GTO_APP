import { useCallback, useMemo, useState } from 'react';
import type { Card, GameState, Position, PositionState, Stage } from '../types';
import { boardCardLimit } from '../lib/cards';
import {
  calculateTotalPot,
  resetStreetBets,
  sumStreetBets,
} from '../lib/potEngine';
import { computeBetContext } from '../../shared/lib/betContext';
import {
  buildPositionsMap,
  CLOCKWISE_FROM_BTN,
  getPositionLabel,
  type SeatIndex,
} from '../lib/seatLayout';

function createDefaultPositions(): Record<Position, PositionState> {
  return {
    UTG: { stack: 100, betSize: 0, folded: false, station: false, tight: false },
    MP: { stack: 100, betSize: 0, folded: false, station: false, tight: false },
    CO: { stack: 100, betSize: 0, folded: false, station: false, tight: false },
    BTN: { stack: 100, betSize: 0, folded: false, station: false, tight: false },
    SB: { stack: 99.5, betSize: 0.5, folded: false, station: false, tight: false },
    BB: { stack: 99, betSize: 1, folded: false, station: false, tight: false },
  };
}

function createEmptySeats(): PositionState[] {
  return Array.from({ length: 6 }, () => ({
    stack: 100,
    betSize: 0,
    folded: false,
    station: false,
    tight: false,
  }));
}

function createDefaultSeats(): PositionState[] {
  const byPosition = createDefaultPositions();
  return CLOCKWISE_FROM_BTN.map((position) => byPosition[position]);
}

export function useGameState() {
  const [btnSeatIndex, setBtnSeatIndex] = useState<SeatIndex>(0);
  const [heroSeatIndex, setHeroSeatIndex] = useState<SeatIndex>(0);
  const [seats, setSeats] = useState<PositionState[]>(createDefaultSeats);
  const [stage, setStage] = useState<Stage>('FLOP');
  const [basePot, setBasePot] = useState(4.5);
  const [heroCards, setHeroCards] = useState<[Card | null, Card | null]>([
    'As',
    'Kd',
  ]);
  const [boardCards, setBoardCards] = useState<(Card | null)[]>([
    'Qh',
    'Jc',
    '2s',
    null,
    null,
  ]);

  const positions = useMemo(
    () => buildPositionsMap(seats, btnSeatIndex),
    [seats, btnSeatIndex],
  );

  const heroPosition = useMemo(
    () => getPositionLabel(heroSeatIndex, btnSeatIndex),
    [heroSeatIndex, btnSeatIndex],
  );

  const pot = useMemo(
    () => calculateTotalPot(basePot, positions),
    [basePot, positions],
  );

  const streetPot = useMemo(() => sumStreetBets(positions), [positions]);

  const usedCards = useMemo(() => {
    const cards = new Set<Card>();
    for (const c of heroCards) {
      if (c) cards.add(c);
    }
    for (const c of boardCards) {
      if (c) cards.add(c);
    }
    return cards;
  }, [heroCards, boardCards]);

  const updateSeat = useCallback(
    (seatIndex: SeatIndex, patch: Partial<PositionState>) => {
      setSeats((prev) =>
        prev.map((seat, index) =>
          index === seatIndex ? { ...seat, ...patch } : seat,
        ),
      );
    },
    [],
  );

  const setBtnSeat = useCallback((seatIndex: SeatIndex) => {
    setBtnSeatIndex(seatIndex);
  }, []);

  const setHeroSeat = useCallback((seatIndex: SeatIndex) => {
    setHeroSeatIndex(seatIndex);
  }, []);

  const selectHeroCard = useCallback((slot: 0 | 1, card: Card | null) => {
    setHeroCards((prev) => {
      const next: [Card | null, Card | null] = [...prev];
      next[slot] = card;
      return next;
    });
  }, []);

  const selectBoardCard = useCallback((index: number, card: Card | null) => {
    setBoardCards((prev) => {
      const next = [...prev];
      next[index] = card;
      return next;
    });
  }, []);

  const handleStageChange = useCallback(
    (newStage: Stage) => {
      setSeats((prevSeats) => {
        const prevPositions = buildPositionsMap(prevSeats, btnSeatIndex);
        setBasePot((base) => base + sumStreetBets(prevPositions));
        const resetPositions = resetStreetBets(prevPositions);
        return prevSeats.map((seat, seatIndex) => {
          const label = getPositionLabel(seatIndex, btnSeatIndex);
          const reset = resetPositions[label];
          return {
            ...reset,
            station: seat.station ?? false,
            tight: seat.tight ?? false,
          };
        });
      });
      setStage(newStage);
      const limit = boardCardLimit(newStage);
      setBoardCards((prev) => prev.map((c, i) => (i < limit ? c : null)));
    },
    [btnSeatIndex],
  );

  const buildGameState = useCallback((): GameState | null => {
    if (!heroCards[0] || !heroCards[1]) {
      return null;
    }

    const limit = boardCardLimit(stage);
    const activeBoard = boardCards
      .slice(0, limit)
      .filter((c): c is Card => c !== null);

    if (activeBoard.length !== limit) {
      return null;
    }

    return {
      heroPosition,
      stage,
      positions,
      heroCards: [heroCards[0], heroCards[1]],
      boardCards: activeBoard,
      pot,
      bigBlind: 1,
      betContext: computeBetContext({
        heroPosition,
        stage,
        positions,
        heroCards: [heroCards[0], heroCards[1]],
        boardCards: activeBoard,
        pot,
        bigBlind: 1,
      }),
    };
  }, [heroPosition, stage, positions, heroCards, boardCards, pot]);

  const validationError = useMemo(() => {
    if (!heroCards[0] || !heroCards[1]) {
      return 'กรุณาเลือกไพ่ในมือ Hero ครบ 2 ใบ';
    }
    const limit = boardCardLimit(stage);
    const activeBoard = boardCards.slice(0, limit);
    if (activeBoard.some((c) => !c)) {
      return `กรุณาเลือกไพ่บน Board ครบ ${limit} ใบสำหรับ ${stage}`;
    }
    return null;
  }, [heroCards, boardCards, stage]);

  const resetTable = useCallback(() => {
    setBtnSeatIndex(0);
    setHeroSeatIndex(0);
    setStage('PREFLOP');
    setBasePot(0);
    setSeats(createEmptySeats());
    setHeroCards([null, null]);
    setBoardCards([null, null, null, null, null]);
  }, []);

  return {
    btnSeatIndex,
    heroSeatIndex,
    heroPosition,
    seats,
    setBtnSeat,
    setHeroSeat,
    stage,
    setStage: handleStageChange,
    positions,
    updateSeat,
    heroCards,
    selectHeroCard,
    boardCards,
    selectBoardCard,
    pot,
    basePot,
    streetPot,
    setBasePot,
    usedCards,
    buildGameState,
    validationError,
    resetTable,
  };
}

export type GameStateHook = ReturnType<typeof useGameState>;
