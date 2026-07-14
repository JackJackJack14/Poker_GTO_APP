import { useCallback, useMemo, useState } from 'react';
import type { Card, GameState, PositionState, Stage } from '../types';
import { boardCardLimit } from '../lib/cards';
import {
  calculateTotalPot,
  resetStreetBets,
  sumStreetBets,
} from '../lib/potEngine';
import { computeBetContext } from '../../shared/lib/betContext';
import {
  BIG_BLIND_BB,
  STARTING_BLINDS_TOTAL_BB,
  withPostedBlinds,
} from '../../shared/lib/blinds';
import {
  buildPositionsMap,
  getPositionLabel,
  type SeatIndex,
} from '../lib/seatLayout';

function createFreshSeats(): PositionState[] {
  return Array.from({ length: 6 }, () => ({
    stack: 100,
    betSize: 0,
    folded: false,
    station: false,
    tight: false,
  }));
}

/** เก้าอี้พร้อมบลายด์ตามปุ่ม Dealer (SB 0.5 / BB 1.0) */
function createBlindedSeats(btnSeatIndex: SeatIndex): PositionState[] {
  return withPostedBlinds(createFreshSeats(), (seatIndex) =>
    getPositionLabel(seatIndex, btnSeatIndex),
  );
}

/**
 * Positional Automation:
 * - อ้างอิงปุ่ม D → เก้าอี้ถัดไป = SB (0.5) แล้ว BB (1.0)
 * - Total Pot เริ่มที่ 1.5 BB จากบลายด์บนเก้าอี้
 * - เมื่อเลื่อนสตรีท บลายด์/เดิมพันถูกย้ายเข้า Dead Pot อัตโนมัติ
 */
export function useGameState() {
  const [btnSeatIndex, setBtnSeatIndex] = useState<SeatIndex>(0);
  const [heroSeatIndex, setHeroSeatIndex] = useState<SeatIndex>(0);
  const [seats, setSeats] = useState<PositionState[]>(() =>
    createBlindedSeats(0),
  );
  const [stage, setStage] = useState<Stage>('PREFLOP');
  /** Dead pot — เริ่ม 0; รับเงินจากสตรีทก่อนหน้าเมื่อเปลี่ยนสตรีท */
  const [basePot, setBasePot] = useState(0);
  const [heroCards, setHeroCards] = useState<[Card | null, Card | null]>([
    null,
    null,
  ]);
  const [boardCards, setBoardCards] = useState<(Card | null)[]>([
    null,
    null,
    null,
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

  /** เปลี่ยนปุ่ม D → โพสต์บลายด์ใหม่ตามวงกลม 6-Max */
  const setBtnSeat = useCallback((seatIndex: SeatIndex) => {
    setBtnSeatIndex(seatIndex);
    setSeats(createBlindedSeats(seatIndex));
    setStage('PREFLOP');
    setBasePot(0);
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
        // บลายด์ 1.5 (+ raises) เข้า Dead Pot
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
      bigBlind: BIG_BLIND_BB,
      betContext: computeBetContext({
        heroPosition,
        stage,
        positions,
        heroCards: [heroCards[0], heroCards[1]],
        boardCards: activeBoard,
        pot,
        bigBlind: BIG_BLIND_BB,
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
    const btn: SeatIndex = 0;
    setBtnSeatIndex(btn);
    setHeroSeatIndex(0);
    setStage('PREFLOP');
    setBasePot(0);
    setSeats(createBlindedSeats(btn));
    setHeroCards([null, null]);
    setBoardCards([null, null, null, null, null]);
  }, []);

  /** Preflop → โพสต์บลายด์ใหม่; Postflop → ล้างยอด street (Dead คงเดิม) */
  const resetStreetActions = useCallback(() => {
    setSeats((prev) => {
      if (stage === 'PREFLOP') {
        return withPostedBlinds(prev, (seatIndex) =>
          getPositionLabel(seatIndex, btnSeatIndex),
        );
      }
      return prev.map((seat) => ({
        ...seat,
        betSize: 0,
      }));
    });
  }, [btnSeatIndex, stage]);

  /** แฮนด์ใหม่: ล้างไพ่ + โพสต์บลายด์ → Total Pot = 1.5 BB */
  const clearHandInputs = useCallback(() => {
    setHeroCards([null, null]);
    setBoardCards([null, null, null, null, null]);
    setStage('PREFLOP');
    setBasePot(0);
    setSeats((prev) =>
      withPostedBlinds(prev, (seatIndex) =>
        getPositionLabel(seatIndex, btnSeatIndex),
      ),
    );
  }, [btnSeatIndex]);

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
    resetStreetActions,
    clearHandInputs,
    startingBlindsTotal: STARTING_BLINDS_TOTAL_BB,
  };
}

export type GameStateHook = ReturnType<typeof useGameState>;
