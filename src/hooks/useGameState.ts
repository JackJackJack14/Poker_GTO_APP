import { useCallback, useMemo, useRef, useState } from 'react';
import type { Card, GameState, HandStatus, PositionState, Stage } from '../types';
import { boardCardLimit } from '../lib/cards';
import {
  calculateTotalPot,
  resetStreetBets,
  sumStreetBets,
} from '../lib/potEngine';
import {
  applySeatStreetAction,
  calcUncalledStreetBet,
  checkStreetCompletion,
  clearStreetBetsAndActs,
  nextStreet,
  stampInvestedHand,
  sumSeatStreetBets,
} from '../lib/streetTransition';
import { openingActionSeat, resolveActionSeat } from '../lib/turnOrder';
import {
  calcNetRealProfit,
  type HandResolvedRef,
} from '../lib/evTracker';
import { STARTING_STACK_BB } from '../lib/stackCapAdvice';
import { computeBetContext } from '../../shared/lib/betContext';
import {
  BIG_BLIND_BB,
  STARTING_BLINDS_TOTAL_BB,
  withPostedBlinds,
} from '../../shared/lib/blinds';
import {
  buildPositionsMap,
  findSeatForPosition,
  getPositionLabel,
  type SeatIndex,
} from '../lib/seatLayout';

const HISTORY_MAX = 10;
const SEAT_COUNT = 6;

/**
 * Snapshot โต๊ะสำหรับ Undo stack
 * (ชื่อตามสเปก history — ไม่ใช่ API GameState ที่ส่งเข้า engine)
 */
export interface UndoGameState {
  seats: PositionState[];
  stage: Stage;
  basePot: number;
  heroCards: [Card | null, Card | null];
  boardCards: (Card | null)[];
  actionSeatIndex: SeatIndex;
  status: HandStatus;
  btnSeatIndex: SeatIndex;
  heroSeatIndex: SeatIndex;
  /** ยอดลงทุนสะสมทุกเก้าอี้ทั้งแฮนด์ (ไม่รีเซ็ตข้ามสตรีท) */
  handInvested: number[];
}

function deepCloneSeat(seat: PositionState): PositionState {
  return { ...seat };
}

function deepCloneSnapshot(snap: UndoGameState): UndoGameState {
  return {
    seats: snap.seats.map(deepCloneSeat),
    stage: snap.stage,
    basePot: snap.basePot,
    heroCards: [snap.heroCards[0], snap.heroCards[1]],
    boardCards: [...snap.boardCards],
    actionSeatIndex: snap.actionSeatIndex,
    status: snap.status,
    btnSeatIndex: snap.btnSeatIndex,
    heroSeatIndex: snap.heroSeatIndex,
    handInvested: [...snap.handInvested],
  };
}

function ledgerFromSeats(seats: readonly PositionState[]): number[] {
  return seats.map((s) =>
    Math.max(0, Math.round((s.investedHand ?? s.betSize ?? 0) * 100) / 100),
  );
}

function createFreshSeats(): PositionState[] {
  return Array.from({ length: SEAT_COUNT }, () => ({
    stack: STARTING_STACK_BB,
    betSize: 0,
    folded: false,
    hasActed: false,
    investedHand: 0,
    station: false,
    tight: false,
  }));
}

function createBlindedSeats(btnSeatIndex: SeatIndex): PositionState[] {
  const blinded = withPostedBlinds(createFreshSeats(), (seatIndex) =>
    getPositionLabel(seatIndex, btnSeatIndex),
  ).map((seat) => ({
    ...seat,
    hasActed: false,
    investedHand: seat.investedHand ?? seat.betSize,
    stack: STARTING_STACK_BB - (seat.investedHand ?? seat.betSize ?? 0),
  }));
  return blinded;
}

/**
 * Table state + auto street / auto hand-end (fold around)
 * ห้ามแตะ GTO engine — ไฟล์นี้ควบคุม UI state เท่านั้น
 */
export function useGameState(handResolvedRef?: HandResolvedRef) {
  const [btnSeatIndex, setBtnSeatIndex] = useState<SeatIndex>(0);
  const [heroSeatIndex, setHeroSeatIndex] = useState<SeatIndex>(0);
  const [seats, setSeats] = useState<PositionState[]>(() =>
    createBlindedSeats(0),
  );
  const [stage, setStage] = useState<Stage>('PREFLOP');
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
  const [actionSeatIndex, setActionSeatIndex] = useState<SeatIndex>(() =>
    findSeatForPosition('UTG', 0),
  );
  /** PLAYING = กำลังแอคชั่น | SHOWDOWN = รอเลือกชนะ/Chop (Family Pot) */
  const [status, setStatus] = useState<HandStatus>('PLAYING');
  /** ประวัติ Undo — สูงสุด 10 ขั้นตอน */
  const [history, setHistory] = useState<UndoGameState[]>([]);

  /** Ledger ยอดลงทุนสะสมทั้งแฮนด์ต่อเก้าอี้ — ไม่รีเซ็ตตอนเปลี่ยนสตรีท */
  const handInvestedRef = useRef<number[]>(
    ledgerFromSeats(createBlindedSeats(0)),
  );

  const stageRef = useRef(stage);
  stageRef.current = stage;
  const btnSeatRef = useRef(btnSeatIndex);
  btnSeatRef.current = btnSeatIndex;
  const actionSeatRef = useRef(actionSeatIndex);
  actionSeatRef.current = actionSeatIndex;
  const basePotRef = useRef(basePot);
  basePotRef.current = basePot;
  const heroSeatRef = useRef(heroSeatIndex);
  heroSeatRef.current = heroSeatIndex;
  const heroCardsRef = useRef(heroCards);
  heroCardsRef.current = heroCards;
  const boardCardsRef = useRef(boardCards);
  boardCardsRef.current = boardCards;
  const statusRef = useRef(status);
  statusRef.current = status;
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const historyRef = useRef(history);
  historyRef.current = history;

  const applyInvestedLedger = useCallback(
    (nextSeats: PositionState[]): PositionState[] => {
      const stamped = stampInvestedHand(nextSeats, handInvestedRef.current);
      return stamped.map((seat, i) => {
        const invested = handInvestedRef.current[i] ?? 0;
        return {
          ...seat,
          investedHand: invested,
          stack: Math.max(0, STARTING_STACK_BB - invested),
        };
      });
    },
    [],
  );

  const resetInvestedLedger = useCallback((nextSeats: PositionState[]) => {
    handInvestedRef.current = ledgerFromSeats(nextSeats);
  }, []);

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

  /** ยอดชิปที่ Hero จ่ายสะสม Prefop→River (ห้ามรีเซ็ตข้ามสตรีท) */
  const totalInvestedAcrossHand = useMemo(() => {
    const seat = seats[heroSeatIndex];
    return Math.max(0, seat?.investedHand ?? 0);
  }, [seats, heroSeatIndex]);

  const heroInvested = totalInvestedAcrossHand;

  /** ชิปเหลือจริง: 100 − totalInvestedAcrossHand */
  const remainingStack = useMemo(
    () =>
      Math.max(
        0,
        Math.round((STARTING_STACK_BB - totalInvestedAcrossHand) * 100) / 100,
      ),
    [totalInvestedAcrossHand],
  );

  const activePlayerCount = useMemo(
    () => seats.filter((s) => !s.folded).length,
    [seats],
  );

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

  const captureSnapshot = useCallback((): UndoGameState => {
    return deepCloneSnapshot({
      seats: seatsRef.current,
      stage: stageRef.current,
      basePot: basePotRef.current,
      heroCards: heroCardsRef.current,
      boardCards: boardCardsRef.current,
      actionSeatIndex: actionSeatRef.current,
      status: statusRef.current,
      btnSeatIndex: btnSeatRef.current,
      heroSeatIndex: heroSeatRef.current,
      handInvested: [...handInvestedRef.current],
    });
  }, []);

  const pushHistory = useCallback(() => {
    const snap = captureSnapshot();
    setHistory((prev) => [...prev, snap].slice(-HISTORY_MAX));
  }, [captureSnapshot]);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const applySnapshot = useCallback(
    (snap: UndoGameState) => {
      const clone = deepCloneSnapshot(snap);
      handInvestedRef.current = [...clone.handInvested];
      setSeats(applyInvestedLedger(clone.seats));
      setStage(clone.stage);
      setBasePot(clone.basePot);
      setHeroCards(clone.heroCards);
      setBoardCards(clone.boardCards);
      setActionSeatIndex(clone.actionSeatIndex);
      setStatus(clone.status);
      setBtnSeatIndex(clone.btnSeatIndex);
      setHeroSeatIndex(clone.heroSeatIndex);
    },
    [applyInvestedLedger],
  );

  const handleUndo = useCallback(() => {
    const prev = historyRef.current;
    if (prev.length === 0) return;
    const snap = prev[prev.length - 1];
    setHistory(prev.slice(0, -1));
    applySnapshot(snap);
  }, [applySnapshot]);

  const clearHandInputs = useCallback(() => {
    const btn = btnSeatRef.current;
    const blinded = createBlindedSeats(btn);
    resetInvestedLedger(blinded);
    setHeroCards([null, null]);
    setBoardCards([null, null, null, null, null]);
    setStage('PREFLOP');
    setBasePot(0);
    setSeats(applyInvestedLedger(blinded));
    setStatus('PLAYING');
    setActionSeatIndex(openingActionSeat(blinded, btn, 'PREFLOP'));
    clearHistory();
  }, [applyInvestedLedger, clearHistory, resetInvestedLedger]);

  /** จบแฮนด์: แจ้งสถิติ (กำไรสุทธิ) แล้ว reset โต๊ะ */
  const handleHandEnd = useCallback(
    (
      seatsSnapshot: PositionState[],
      options?: { forceHeroLoss?: boolean },
    ) => {
      const heroIdx = heroSeatRef.current;
      const survivors = seatsSnapshot
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => !s.folded);
      const survivor = survivors.length === 1 ? survivors[0] : null;
      // Hero Fold Early Exit → แพ้ทันที (ไม่รอคิวคนอื่น)
      const heroWon = options?.forceHeroLoss
        ? false
        : survivor !== null && survivor.i === heroIdx;

      const rawPot = basePotRef.current + sumSeatStreetBets(seatsSnapshot);
      // Fold-around win: หัก Uncalled Bet ออกจากพ็อตก่อนคิดกำไรสุทธิ
      const uncalled =
        heroWon && survivor !== null
          ? calcUncalledStreetBet(seatsSnapshot)
          : 0;
      const totalPot = Math.max(0, rawPot - uncalled);

      const invested = Math.max(
        0,
        handInvestedRef.current[heroIdx] ??
          seatsSnapshot[heroIdx]?.investedHand ??
          0,
      );
      // แพ้ → −totalInvestedAcrossHand
      const netProfit = calcNetRealProfit(
        totalPot,
        invested,
        heroWon ? 'win' : 'lose',
      );
      const btn = btnSeatRef.current;

      queueMicrotask(() => {
        handResolvedRef?.current?.({
          heroWon,
          totalPot,
          heroInvested: invested,
          netProfit,
          stage: stageRef.current,
          heroPosition: getPositionLabel(heroIdx, btn),
          heroCards: heroCardsRef.current,
          boardCards: boardCardsRef.current,
          reason: options?.forceHeroLoss ? 'hero-fold' : 'fold-around',
        });
        clearHandInputs();
      });
    },
    [clearHandInputs, handResolvedRef],
  );

  const advanceStreetAutomatically = useCallback(
    (seatsSnapshot: PositionState[]): PositionState[] => {
      const streetSum = sumSeatStreetBets(seatsSnapshot);
      const upcoming = nextStreet(stageRef.current);
      const btn = btnSeatRef.current;

      if (!upcoming) {
        // River จบ + มี ≥2 คน → SHOWDOWN (Family Pot / Chop) ไม่ auto-resolve
        queueMicrotask(() => {
          setStatus('SHOWDOWN');
        });
        return applyInvestedLedger(seatsSnapshot);
      }

      setBasePot((base) => base + streetSum);
      setStage(upcoming);
      const limit = boardCardLimit(upcoming);
      setBoardCards((prev) => prev.map((c, i) => (i < limit ? c : null)));

      // ล้าง betSize ของสตรีท — คง handInvested ledger / investedHand
      const cleared = applyInvestedLedger(clearStreetBetsAndActs(seatsSnapshot));
      queueMicrotask(() => {
        setActionSeatIndex(openingActionSeat(cleared, btn, upcoming));
      });
      return cleared;
    },
    [applyInvestedLedger],
  );

  const updateSeat = useCallback(
    (seatIndex: SeatIndex, patch: Partial<PositionState>) => {
      if (statusRef.current === 'SHOWDOWN') return;

      const isStreetAction =
        patch.folded !== undefined || patch.betSize !== undefined;

      if (isStreetAction) {
        if (seatIndex !== actionSeatRef.current) return;
        pushHistory();
      }

      setSeats((prev) => {
        if (isStreetAction && seatIndex !== actionSeatRef.current) {
          return prev;
        }

        const beforeBet = prev[seatIndex]?.betSize ?? 0;
        let next = applySeatStreetAction(prev, seatIndex, patch);

        if (typeof patch.betSize === 'number') {
          const delta = Math.max(0, patch.betSize - beforeBet);
          if (delta > 0) {
            const cur = handInvestedRef.current[seatIndex] ?? 0;
            handInvestedRef.current[seatIndex] =
              Math.round((cur + delta) * 100) / 100;
          }
        }

        next = applyInvestedLedger(next);
        if (!isStreetAction) return next;

        // Hero Fold Early Exit — ตัดจบทันที ไม่ส่งคิวต่อ / ไม่รอโชว์ดาวน์
        if (patch.folded === true && seatIndex === heroSeatRef.current) {
          handleHandEnd(next, { forceHeroLoss: true });
          return next;
        }

        const completion = checkStreetCompletion(next);
        const btn = btnSeatRef.current;
        const currentStage = stageRef.current;

        if (completion.status === 'hand-over') {
          handleHandEnd(next);
          return next;
        }

        if (completion.status === 'street-complete') {
          return advanceStreetAutomatically(next);
        }

        const nextActor = resolveActionSeat(
          next,
          btn,
          currentStage,
          seatIndex,
        );
        if (nextActor !== null) {
          queueMicrotask(() => setActionSeatIndex(nextActor));
        }
        return next;
      });
    },
    [advanceStreetAutomatically, applyInvestedLedger, handleHandEnd, pushHistory],
  );

  const setBtnSeat = useCallback(
    (seatIndex: SeatIndex) => {
      const blinded = createBlindedSeats(seatIndex);
      resetInvestedLedger(blinded);
      setBtnSeatIndex(seatIndex);
      setSeats(applyInvestedLedger(blinded));
      setStage('PREFLOP');
      setBasePot(0);
      setStatus('PLAYING');
      setActionSeatIndex(openingActionSeat(blinded, seatIndex, 'PREFLOP'));
      clearHistory();
    },
    [applyInvestedLedger, clearHistory, resetInvestedLedger],
  );

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
      pushHistory();
      setSeats((prevSeats) => {
        const prevPositions = buildPositionsMap(prevSeats, btnSeatIndex);
        setBasePot((base) => base + sumStreetBets(prevPositions));
        const resetPositions = resetStreetBets(prevPositions);
        const nextSeats = prevSeats.map((seat, seatIndex) => {
          const label = getPositionLabel(seatIndex, btnSeatIndex);
          const reset = resetPositions[label];
          return {
            ...reset,
            hasActed: false,
            // คงยอดสะสมทั้งแฮนด์จาก ledger — ห้ามรีเซ็ตตอนเปลี่ยนสตรีท
            investedHand: handInvestedRef.current[seatIndex] ?? 0,
            station: seat.station ?? false,
            tight: seat.tight ?? false,
          };
        });
        const stamped = applyInvestedLedger(nextSeats);
        queueMicrotask(() => {
          setActionSeatIndex(
            openingActionSeat(stamped, btnSeatIndex, newStage),
          );
        });
        return stamped;
      });
      setStage(newStage);
      setStatus('PLAYING');
      const limit = boardCardLimit(newStage);
      setBoardCards((prev) => prev.map((c, i) => (i < limit ? c : null)));
    },
    [applyInvestedLedger, btnSeatIndex, pushHistory],
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
    const blinded = createBlindedSeats(btn);
    resetInvestedLedger(blinded);
    setBtnSeatIndex(btn);
    setHeroSeatIndex(0);
    setStage('PREFLOP');
    setBasePot(0);
    setSeats(applyInvestedLedger(blinded));
    setStatus('PLAYING');
    setActionSeatIndex(openingActionSeat(blinded, btn, 'PREFLOP'));
    setHeroCards([null, null]);
    setBoardCards([null, null, null, null, null]);
    clearHistory();
  }, [applyInvestedLedger, clearHistory, resetInvestedLedger]);

  const resetStreetActions = useCallback(() => {
    if (statusRef.current === 'SHOWDOWN') return;
    pushHistory();
    setSeats((prev) => {
      let next: PositionState[];
      if (stage === 'PREFLOP') {
        // รีเซ็ตพรีฟลอปกลับบลายด์ — ลงทุนเริ่มใหม่ที่บลายด์เท่านั้น
        next = withPostedBlinds(createFreshSeats(), (seatIndex) =>
          getPositionLabel(seatIndex, btnSeatIndex),
        ).map((seat, i) => ({
          ...seat,
          hasActed: false,
          folded: prev[i]?.folded ?? false,
          station: prev[i]?.station ?? false,
          tight: prev[i]?.tight ?? false,
          investedHand: seat.investedHand ?? seat.betSize,
        }));
        resetInvestedLedger(next);
      } else {
        // โพสต์ฟลอป: ล้างยอดสตรีทอย่างเดียว — คง ledger ลงทุนทั้งแฮนด์
        next = prev.map((seat, i) => ({
          ...seat,
          betSize: 0,
          hasActed: false,
          investedHand: handInvestedRef.current[i] ?? seat.investedHand ?? 0,
        }));
      }
      const stamped = applyInvestedLedger(next);
      queueMicrotask(() => {
        setActionSeatIndex(openingActionSeat(stamped, btnSeatIndex, stage));
      });
      return stamped;
    });
  }, [
    applyInvestedLedger,
    btnSeatIndex,
    pushHistory,
    resetInvestedLedger,
    stage,
  ]);

  return {
    btnSeatIndex,
    heroSeatIndex,
    heroPosition,
    seats,
    setBtnSeat,
    setHeroSeat,
    stage,
    setStage: handleStageChange,
    /** PLAYING | SHOWDOWN — ใช้คุมปุ่มเปิดไพ่ / Chop */
    status,
    activePlayerCount,
    positions,
    updateSeat,
    actionSeatIndex,
    setActionSeatIndex,
    heroCards,
    selectHeroCard,
    boardCards,
    selectBoardCard,
    pot,
    basePot,
    streetPot,
    /** ชิปที่ Hero ลงสะสมทั้งแฮนด์ (alias ของ totalInvestedAcrossHand) */
    heroInvested,
    /** ยอดสะสม Prefop+Flop+Turn+River — ไม่รีเซ็ตข้ามสตรีท */
    totalInvestedAcrossHand,
    /** 100 − totalInvestedAcrossHand — เพดาน All-in */
    remainingStack,
    startingStack: STARTING_STACK_BB,
    setBasePot,
    usedCards,
    buildGameState,
    validationError,
    resetTable,
    resetStreetActions,
    clearHandInputs,
    startingBlindsTotal: STARTING_BLINDS_TOTAL_BB,
    /** Undo history (สูงสุด 10) */
    history,
    canUndo: history.length > 0,
    handleUndo,
  };
}

export type GameStateHook = ReturnType<typeof useGameState>;
