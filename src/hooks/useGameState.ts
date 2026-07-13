import { useCallback, useMemo, useState } from 'react';
import type { Card, GameState, Position, PositionState, Stage } from '../types';
import { POSITIONS } from '../types';
import { boardCardLimit } from '../lib/cards';

function createDefaultPositions(): Record<Position, PositionState> {
  return {
    UTG: { stack: 100, betSize: 0, folded: false },
    MP: { stack: 100, betSize: 0, folded: false },
    CO: { stack: 100, betSize: 0, folded: false },
    BTN: { stack: 100, betSize: 0, folded: false },
    SB: { stack: 99.5, betSize: 0.5, folded: false },
    BB: { stack: 99, betSize: 1, folded: false },
  };
}

export function useGameState() {
  const [heroPosition, setHeroPosition] = useState<Position>('BTN');
  const [stage, setStage] = useState<Stage>('FLOP');
  const [positions, setPositions] = useState(createDefaultPositions);
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
  const [pot, setPot] = useState(6);

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

  const updatePosition = useCallback(
    (pos: Position, patch: Partial<PositionState>) => {
      setPositions((prev) => ({
        ...prev,
        [pos]: { ...prev[pos], ...patch },
      }));
    },
    [],
  );

  const selectHeroCard = useCallback(
    (slot: 0 | 1, card: Card | null) => {
      setHeroCards((prev) => {
        const next: [Card | null, Card | null] = [...prev];
        next[slot] = card;
        return next;
      });
    },
    [],
  );

  const selectBoardCard = useCallback(
    (index: number, card: Card | null) => {
      setBoardCards((prev) => {
        const next = [...prev];
        next[index] = card;
        return next;
      });
    },
    [],
  );

  const handleStageChange = useCallback((newStage: Stage) => {
    setStage(newStage);
    const limit = boardCardLimit(newStage);
    setBoardCards((prev) =>
      prev.map((c, i) => (i < limit ? c : null)),
    );
  }, []);

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
    setPositions(createDefaultPositions());
    setPot(6);
    setStage('FLOP');
    setHeroCards(['As', 'Kd']);
    setBoardCards(['Qh', 'Jc', '2s', null, null]);
    setHeroPosition('BTN');
  }, []);

  return {
    heroPosition,
    setHeroPosition,
    stage,
    setStage: handleStageChange,
    positions,
    updatePosition,
    heroCards,
    selectHeroCard,
    boardCards,
    selectBoardCard,
    pot,
    setPot,
    usedCards,
    buildGameState,
    validationError,
    resetTable,
    positionsList: POSITIONS,
  };
}

export type GameStateHook = ReturnType<typeof useGameState>;
