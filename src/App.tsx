import { useCallback, useMemo, useRef, useState } from 'react';
import type { GtoResponse, Stage } from './types';
import { useGameState } from './hooks/useGameState';
import { useGrindingHotkeys } from './hooks/useGrindingHotkeys';
import { analyzeHand } from './lib/api';
import { boardCardLimit } from './lib/cards';
import type { CardSelectTarget } from './lib/cardInput';
import {
  appendEvHand,
  clearEvSession,
  getLatestPendingHand,
  loadEvSession,
  recordActualResult,
  type EvSessionState,
} from './lib/evTracker';
import { PokerTable } from './components/PokerTable';
import { CardSelector } from './components/CardSelector';
import { GameControls } from './components/GameControls';
import { HotkeyLegend } from './components/HotkeyLegend';
import { SessionAnalytics } from './components/SessionAnalytics';
import {
  GtoAdviceScreen,
  type AnalysisContext,
} from './components/GtoAdviceScreen';
import { getPositionLineup, type SeatIndex } from './lib/seatLayout';

/** Minimum gap between analyze clicks (ms) — hard stop for double-fire / quota burn */
const ANALYZE_DEBOUNCE_MS = 1000;

export default function App() {
  const game = useGameState();
  const [adviceOpen, setAdviceOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GtoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisContext, setAnalysisContext] = useState<AnalysisContext | null>(
    null,
  );
  const [cardTarget, setCardTarget] = useState<CardSelectTarget | null>(null);
  const [activeSeatIndex, setActiveSeatIndex] = useState<SeatIndex>(0);
  const [evSession, setEvSession] = useState<EvSessionState>(() =>
    loadEvSession(),
  );
  const [lastHandId, setLastHandId] = useState<string | null>(null);
  const [actualFlash, setActualFlash] = useState<string | null>(null);
  const betInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const analyzeInFlightRef = useRef(false);
  const lastAnalyzeClickRef = useRef(0);

  const pendingHand = useMemo(
    () => getLatestPendingHand(evSession),
    [evSession],
  );
  const canRecordActual = Boolean(pendingHand);

  const positionLineup = useMemo(
    () => getPositionLineup(game.btnSeatIndex),
    [game.btnSeatIndex],
  );

  const boardLimit = boardCardLimit(game.stage);

  const clearAnalysisUi = useCallback(() => {
    setAdviceOpen(false);
    setResult(null);
    setError(null);
    setAnalysisContext(null);
    setLoading(false);
    analyzeInFlightRef.current = false;
  }, []);

  const handleClearEvStats = useCallback(() => {
    setEvSession(clearEvSession());
    setLastHandId(null);
    setActualFlash(null);
  }, []);

  const handleRecordActual = useCallback(
    (outcome: 'win' | 'lose') => {
      const heroBet =
        game.positions[game.heroPosition]?.betSize ??
        pendingHand?.heroBetSize ??
        0;
      const next = recordActualResult({
        handId: lastHandId ?? pendingHand?.id,
        outcome,
        totalPot: game.pot,
        heroBetSize: heroBet,
      });
      setEvSession(next);
      const amount =
        outcome === 'win'
          ? `+${game.pot.toFixed(1)} BB`
          : `-${Math.max(0, heroBet).toFixed(1)} BB`;
      setActualFlash(
        outcome === 'win'
          ? `🟢 บันทึกชนะ ${amount}`
          : `🔴 บันทึกแพ้ ${amount}`,
      );
    },
    [game.heroPosition, game.positions, game.pot, lastHandId, pendingHand],
  );

  const registerBetInput = useCallback(
    (seatIndex: SeatIndex, el: HTMLInputElement | null) => {
      betInputRefs.current[seatIndex] = el;
    },
    [],
  );

  const focusBetInput = useCallback((seatIndex: SeatIndex) => {
    setActiveSeatIndex(seatIndex);
    requestAnimationFrame(() => {
      betInputRefs.current[seatIndex]?.focus();
    });
  }, []);

  useGrindingHotkeys({
    enabled: !adviceOpen,
    cardTarget,
    onCardTargetChange: setCardTarget,
    heroCards: game.heroCards,
    boardCards: game.boardCards,
    boardLimit,
    usedCards: game.usedCards,
    onSelectHero: game.selectHeroCard,
    onSelectBoard: game.selectBoardCard,
    activeSeatIndex,
    seats: game.seats,
    positions: game.positions,
    onUpdateSeat: game.updateSeat,
    focusBetInput,
  });

  const handleAnalyze = useCallback(async () => {
    if (analyzeInFlightRef.current || loading) return;

    const now = Date.now();
    if (now - lastAnalyzeClickRef.current < ANALYZE_DEBOUNCE_MS) return;
    lastAnalyzeClickRef.current = now;

    const gameState = game.buildGameState();
    if (!gameState) return;

    const context: AnalysisContext = {
      heroPosition: game.heroPosition,
      stage: game.stage,
      pot: game.pot,
      heroCards: [gameState.heroCards[0], gameState.heroCards[1]],
      boardCards: gameState.boardCards,
      positionLineup,
    };

    analyzeInFlightRef.current = true;
    setAnalysisContext(context);
    setAdviceOpen(true);
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await analyzeHand(gameState);
      const data = response.data ?? null;
      setResult(data);
      if (data && typeof data.ev === 'number') {
        const heroBet =
          game.positions[game.heroPosition]?.betSize ?? 0;
        const next = appendEvHand({
          result: data,
          heroPosition: context.heroPosition,
          stage: context.stage,
          pot: context.pot,
          heroBetSize: heroBet,
          heroCards: context.heroCards,
          boardCards: context.boardCards,
        });
        setEvSession(next);
        const newest = next.hands[next.hands.length - 1];
        setLastHandId(newest?.id ?? null);
        setActualFlash(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      analyzeInFlightRef.current = false;
      setLoading(false);
    }
  }, [game, loading, positionLineup]);

  const handleStageChange = useCallback(
    (stage: Stage) => {
      clearAnalysisUi();
      game.setStage(stage);
    },
    [clearAnalysisUi, game],
  );

  const handleReset = useCallback(() => {
    game.resetTable();
    clearAnalysisUi();
    setCardTarget({ type: 'hero', slot: 0 });
    setActiveSeatIndex(0);
  }, [clearAnalysisUi, game]);

  const analyzeDisabled = !!game.validationError || loading;

  return (
    <div className="min-h-screen">
      <HotkeyLegend />

      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-gold to-gold-dim text-lg">
              ♠
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                Poker GTO Advisor
              </h1>
              <p className="text-xs text-zinc-500">6-Max Analyzer · Local Math Engine</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="rounded-full bg-emerald-900/40 px-3 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-800/50">
              Hero: {game.heroPosition}
            </span>
            <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
              BTN Seat {game.btnSeatIndex + 1}
            </span>
            <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
              {game.stage}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <GameControls
          stage={game.stage}
          pot={game.pot}
          basePot={game.basePot}
          streetPot={game.streetPot}
          onStageChange={handleStageChange}
          onBasePotChange={game.setBasePot}
          onReset={handleReset}
        />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 sm:p-6">
              <ul className="mb-5 flex flex-wrap justify-center gap-x-4 gap-y-2 px-2 text-center text-[11px] leading-relaxed text-zinc-500 sm:gap-x-6">
                <li className="list-none">คลิกเก้าอี้เพื่อย้าย BTN (D)</li>
                <li className="list-none">กด「ตั้ง Hero」เลือกตำแหน่งของคุณ</li>
                <li className="list-none">ป้ายหมุนตาม BTN→SB→BB→UTG→MP→CO</li>
                <li className="list-none text-sky-400">เก้าอี้สีฟ้า = ปุ่มลัด f/c/r</li>
              </ul>
              <PokerTable
                seats={game.seats}
                btnSeatIndex={game.btnSeatIndex}
                heroSeatIndex={game.heroSeatIndex}
                activeSeatIndex={activeSeatIndex}
                heroCards={game.heroCards}
                boardCards={game.boardCards}
                pot={game.pot}
                basePot={game.basePot}
                positions={game.positions}
                onSetBtnSeat={game.setBtnSeat}
                onSetHeroSeat={game.setHeroSeat}
                onActiveSeatChange={setActiveSeatIndex}
                onUpdateSeat={game.updateSeat}
                registerBetInput={registerBetInput}
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="flex h-full flex-col rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 sm:p-6">
              <CardSelector
                stage={game.stage}
                heroCards={game.heroCards}
                boardCards={game.boardCards}
                usedCards={game.usedCards}
                activeTarget={cardTarget}
                onActiveTargetChange={setCardTarget}
                onSelectHero={game.selectHeroCard}
                onSelectBoard={game.selectBoardCard}
              />

              <div className="mt-auto pt-6">
                {game.validationError && (
                  <p className="mb-3 text-center text-xs text-amber-400">
                    {game.validationError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={analyzeDisabled}
                    aria-busy={loading}
                    onClick={handleAnalyze}
                    className="min-w-0 flex-1 rounded-xl bg-gradient-to-r from-gold to-gold-dim py-3.5 text-sm font-bold tracking-wide text-zinc-900 shadow-lg shadow-gold/20 transition-all hover:shadow-gold/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    {loading ? 'กำลังคำนวณ...' : 'ความน่าจะเป็น'}
                  </button>
                  <button
                    type="button"
                    onClick={() => game.resetStreetActions()}
                    title="รีเซ็ตเงินแฮนด์นี้ — ล้างยอดเดิมพันสตรีทปัจจุบันเป็น 0 (ไม่กระทบ Dead Pot)"
                    className="flex shrink-0 items-center gap-1 rounded-xl border border-zinc-600 bg-zinc-800/80 px-3 py-3.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-amber-600/60 hover:bg-zinc-700 hover:text-amber-200"
                  >
                    <span className="text-base leading-none" aria-hidden>
                      ↺
                    </span>
                    <span className="hidden sm:inline">รีเซ็ตเงินแฮนด์นี้</span>
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!canRecordActual}
                    onClick={() => handleRecordActual('win')}
                    title={
                      canRecordActual
                        ? `ชนะ → บันทึก +${game.pot.toFixed(1)} BB (Total Pot)`
                        : 'วิเคราะห์แฮนด์ก่อน แล้วค่อยบันทึกผลจริง'
                    }
                    className="rounded-xl border border-emerald-700/70 bg-emerald-950/50 px-2 py-2.5 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-900/60 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    🟢 ชนะแฮนด์นี้
                  </button>
                  <button
                    type="button"
                    disabled={!canRecordActual}
                    onClick={() => handleRecordActual('lose')}
                    title={
                      canRecordActual
                        ? `แพ้ → บันทึก −${(game.positions[game.heroPosition]?.betSize ?? pendingHand?.heroBetSize ?? 0).toFixed(1)} BB`
                        : 'วิเคราะห์แฮนด์ก่อน แล้วค่อยบันทึกผลจริง'
                    }
                    className="rounded-xl border border-red-700/70 bg-red-950/50 px-2 py-2.5 text-xs font-bold text-red-200 transition-colors hover:bg-red-900/60 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    🔴 แพ้/หมอบแฮนด์นี้
                  </button>
                </div>
                {actualFlash && (
                  <p className="mt-2 text-center text-[11px] font-medium text-zinc-300">
                    {actualFlash}
                  </p>
                )}
                {!canRecordActual && evSession.hands.length > 0 && (
                  <p className="mt-1.5 text-center text-[10px] text-zinc-600">
                    แฮนด์ล่าสุดบันทึกผลจริงแล้ว — วิเคราะห์มือใหม่เพื่อบันทึกต่อ
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <SessionAnalytics session={evSession} onClear={handleClearEvStats} />
        </div>
      </main>

      <GtoAdviceScreen
        open={adviceOpen}
        result={result}
        loading={loading}
        error={error}
        context={analysisContext}
        canRecordActual={canRecordActual}
        actualFlash={actualFlash}
        onRecordActual={handleRecordActual}
        onClose={() => setAdviceOpen(false)}
      />
    </div>
  );
}
