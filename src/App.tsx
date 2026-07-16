import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  recordHandResolved,
  type EvSessionState,
  type HandResolvedHandler,
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
import {
  ShowdownWinnerPanel,
  type ShowdownResolution,
} from './components/ShowdownWinnerPanel';
import { getPositionLineup, type SeatIndex } from './lib/seatLayout';

/** Minimum gap between analyze clicks (ms) — hard stop for double-fire / quota burn */
const ANALYZE_DEBOUNCE_MS = 1000;

export default function App() {
  const handResolvedRef = useRef<HandResolvedHandler | null>(null);
  const game = useGameState(handResolvedRef);
  const [adviceOpen, setAdviceOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GtoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisContext, setAnalysisContext] = useState<AnalysisContext | null>(
    null,
  );
  const [cardTarget, setCardTarget] = useState<CardSelectTarget | null>(null);
  const [quickCardText, setQuickCardText] = useState('');
  const [quickCardFlash, setQuickCardFlash] = useState<string | null>(null);
  const [evSession, setEvSession] = useState<EvSessionState>(() =>
    loadEvSession(),
  );
  const [lastHandId, setLastHandId] = useState<string | null>(null);
  const [actualFlash, setActualFlash] = useState<string | null>(null);
  const betInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const quickCardInputRef = useRef<HTMLInputElement | null>(null);
  const analyzeInFlightRef = useRef(false);
  const lastAnalyzeClickRef = useRef(0);
  const lastHandIdRef = useRef<string | null>(null);
  lastHandIdRef.current = lastHandId;

  const pendingHand = useMemo(
    () => getLatestPendingHand(evSession),
    [evSession],
  );
  const canRecordActual = Boolean(pendingHand);

  // Auto-end hand (fold around) → บันทึกกำไรสุทธิ + กราฟฟ้าโดยไม่ต้องกด「ชนะ」
  handResolvedRef.current = (payload) => {
    const next = recordHandResolved(payload, lastHandIdRef.current);
    setEvSession(next);
    setLastHandId(null);
    const sign = payload.netProfit >= 0 ? '+' : '';
    setActualFlash(
      payload.heroWon
        ? `🟢 Auto-Win สุทธิ ${sign}${payload.netProfit.toFixed(2)} BB (Pot ${payload.totalPot.toFixed(1)} − ลงทุน ${payload.heroInvested.toFixed(1)})`
        : payload.reason === 'hero-fold'
          ? `🔴 Hero Fold −${payload.heroInvested.toFixed(2)} BB (ตัดสะสมตามยอดลงทุนทั้งแฮนด์)`
          : `🔴 Auto-Lose สุทธิ ${sign}${payload.netProfit.toFixed(2)} BB (ลงทุน ${payload.heroInvested.toFixed(1)})`,
    );
    setAdviceOpen(false);
    setResult(null);
    setError(null);
    setAnalysisContext(null);
    setLoading(false);
    analyzeInFlightRef.current = false;
    setCardTarget({ type: 'hero', slot: 0 });
  };

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

  const handleShowdownResolve = useCallback(
    (resolution: ShowdownResolution) => {
      const heroInvested = game.heroInvested;
      const totalPot = game.pot;
      const outcome = resolution.outcome;
      const splitWays =
        resolution.outcome === 'split' ? resolution.splitWays : undefined;

      const next = recordActualResult({
        handId: lastHandId ?? pendingHand?.id,
        outcome,
        totalPot,
        heroInvested,
        splitWays,
      });
      setEvSession(next);
      setLastHandId(null);

      const last = next.hands[next.hands.length - 1];
      const net = last?.actualResult ?? 0;
      const sign = net >= 0 ? '+' : '';

      if (outcome === 'win') {
        setActualFlash(
          `🏆 ชนะเต็มสุทธิ ${sign}${net.toFixed(2)} BB (Pot ${totalPot.toFixed(1)} − ลงทุน ${heroInvested.toFixed(1)})`,
        );
      } else if (outcome === 'lose') {
        setActualFlash(
          `💀 แพ้ Showdown สุทธิ ${sign}${net.toFixed(2)} BB (ลงทุน ${heroInvested.toFixed(1)})`,
        );
      } else {
        setActualFlash(
          `🤝 Chop ${splitWays}-way สุทธิ ${sign}${net.toFixed(2)} BB ((Pot ${totalPot.toFixed(1)} / ${splitWays}) − ลงทุน ${heroInvested.toFixed(1)})`,
        );
      }

      game.clearHandInputs();
      clearAnalysisUi();
      setAdviceOpen(false);
      setCardTarget({ type: 'hero', slot: 0 });
    },
    [clearAnalysisUi, game, lastHandId, pendingHand],
  );

  const handleRecordActual = useCallback(
    (outcome: 'win' | 'lose') => {
      handleShowdownResolve({ outcome });
    },
    [handleShowdownResolve],
  );

  const registerBetInput = useCallback(
    (seatIndex: SeatIndex, el: HTMLInputElement | null) => {
      betInputRefs.current[seatIndex] = el;
    },
    [],
  );

  const focusBetInput = useCallback((seatIndex: SeatIndex) => {
    requestAnimationFrame(() => {
      const el = betInputRefs.current[seatIndex];
      if (!el) return;
      el.focus();
      el.select();
    });
  }, []);

  const submitQuickCardCommand = useCallback(() => {
    const result = game.applyQuickCardText(quickCardText);
    setQuickCardFlash(result.message);
    if (result.ok) {
      setQuickCardText('');
      setCardTarget(null);
    }
    window.setTimeout(() => setQuickCardFlash(null), 2200);
  }, [game, quickCardText]);

  // Tab → โฟกัส Quick Card Command Bar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.shiftKey) return;
      if (adviceOpen || game.status === 'SHOWDOWN') return;
      e.preventDefault();
      e.stopPropagation();
      quickCardInputRef.current?.focus();
      quickCardInputRef.current?.select();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () =>
      window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [adviceOpen, game.status]);

  // โฟกัสช่อง Bet ของคนที่ถึงคิวอัตโนมัติ (ยกเว้น Showdown)
  useEffect(() => {
    if (game.status === 'SHOWDOWN') return;
    focusBetInput(game.actionSeatIndex);
  }, [focusBetInput, game.actionSeatIndex, game.status]);

  useGrindingHotkeys({
    enabled: !adviceOpen && game.status !== 'SHOWDOWN',
    cardTarget,
    onCardTargetChange: setCardTarget,
    heroCards: game.heroCards,
    boardCards: game.boardCards,
    boardLimit,
    usedCards: game.usedCards,
    onSelectHero: game.selectHeroCard,
    onSelectBoard: game.selectBoardCard,
    activeSeatIndex: game.actionSeatIndex,
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
      // บันทึกกราฟสถิติเฉพาะ Postflop (FLOP/TURN/RIVER) — ไม่ปนกับ Preflop
      if (
        data &&
        typeof data.ev === 'number' &&
        context.stage !== 'PREFLOP'
      ) {
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
      } else if (data) {
        setLastHandId(null);
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
          canUndo={game.canUndo}
          onUndo={game.handleUndo}
        />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 sm:p-6">
              <ul className="mb-5 flex flex-wrap justify-center gap-x-4 gap-y-2 px-2 text-center text-[11px] leading-relaxed text-zinc-500 sm:gap-x-6">
                <li className="list-none">คลิก D เพื่อย้าย BTN</li>
                <li className="list-none">กด「H」ตั้ง Hero</li>
                <li className="list-none text-amber-400">
                  กรอบทองกระพริบ = ถึงคิวแอคชั่น
                </li>
                <li className="list-none text-sky-400">
                  f Fold · c Check/Call · r Raise (Enter ยืนยัน)
                </li>
                <li className="list-none text-gold">
                  Tab → พิมพ์ไพ่ด่วน AsKd / KsJhTs
                </li>
              </ul>
              <PokerTable
                seats={game.seats}
                btnSeatIndex={game.btnSeatIndex}
                heroSeatIndex={game.heroSeatIndex}
                actionSeatIndex={game.actionSeatIndex}
                handStatus={game.status}
                stage={game.stage}
                heroCards={game.heroCards}
                boardCards={game.boardCards}
                pot={game.pot}
                basePot={game.basePot}
                positions={game.positions}
                onSetBtnSeat={game.setBtnSeat}
                onSetHeroSeat={game.setHeroSeat}
                onUpdateSeat={game.updateSeat}
                registerBetInput={registerBetInput}
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="flex h-full flex-col rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 sm:p-6">
              {/* Quick Card Command Bar — Primary keyboard card input */}
              <div className="mb-4 rounded-xl border border-gold/30 bg-zinc-950/70 p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label
                    htmlFor="quick-card-command"
                    className="text-[11px] font-bold uppercase tracking-widest text-gold"
                  >
                    Quick Card · กด Tab
                  </label>
                  <span className="text-[10px] text-zinc-500">
                    Enter ยืนยัน · Esc ล้าง
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    id="quick-card-command"
                    ref={quickCardInputRef}
                    type="text"
                    value={quickCardText}
                    onChange={(e) => setQuickCardText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitQuickCardCommand();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setQuickCardText('');
                        e.currentTarget.blur();
                      }
                    }}
                    placeholder="AsKd · KsJhTs · 2s"
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/40"
                  />
                  <button
                    type="button"
                    onClick={submitQuickCardCommand}
                    className="shrink-0 rounded-lg bg-gold/90 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-gold"
                  >
                    ใส่ไพ่
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  s = โพดำ ♠️ | h = โพแดง ❤️ | d = หลามตัด ♦️ | c = ดอกจิก ♣️
                </p>
                {quickCardFlash && (
                  <p
                    className={`mt-1.5 text-[11px] ${
                      quickCardFlash.startsWith('ใส่ไพ่')
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {quickCardFlash}
                  </p>
                )}
              </div>

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

                {game.status === 'SHOWDOWN' ? (
                  <div className="mt-2 rounded-xl border border-amber-700/50 bg-amber-950/20 p-2.5">
                    <ShowdownWinnerPanel
                      totalPot={game.pot}
                      heroInvested={game.heroInvested}
                      activePlayerCount={game.activePlayerCount}
                      onResolve={handleShowdownResolve}
                    />
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!canRecordActual}
                      onClick={() => handleRecordActual('win')}
                      title={
                        canRecordActual
                          ? `ชนะสุทธิ → Pot ${game.pot.toFixed(1)} − ลงทุน ${game.heroInvested.toFixed(1)} = ${(game.pot - game.heroInvested).toFixed(2)} BB`
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
                          ? `แพ้สุทธิ → −${game.heroInvested.toFixed(1)} BB (ชิปที่ลงทั้งแฮนด์)`
                          : 'วิเคราะห์แฮนด์ก่อน แล้วค่อยบันทึกผลจริง'
                      }
                      className="rounded-xl border border-red-700/70 bg-red-950/50 px-2 py-2.5 text-xs font-bold text-red-200 transition-colors hover:bg-red-900/60 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      🔴 แพ้/หมอบแฮนด์นี้
                    </button>
                  </div>
                )}
                {actualFlash && (
                  <p className="mt-2 text-center text-[11px] font-medium text-zinc-300">
                    {actualFlash}
                  </p>
                )}
                {game.status !== 'SHOWDOWN' &&
                  !canRecordActual &&
                  evSession.hands.length > 0 && (
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
        heroInvested={game.heroInvested}
        totalInvestedAcrossHand={game.totalInvestedAcrossHand}
        handStatus={game.status}
        totalPot={game.pot}
        activePlayerCount={game.activePlayerCount}
        canRecordActual={canRecordActual}
        actualFlash={actualFlash}
        onRecordActual={handleRecordActual}
        onShowdownResolve={handleShowdownResolve}
        onClose={() => setAdviceOpen(false)}
      />
    </div>
  );
}
