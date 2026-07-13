import { useState } from 'react';
import type { GtoResponse } from './types';
import { useGameState } from './hooks/useGameState';
import { analyzeHand } from './lib/api';
import { PokerTable } from './components/PokerTable';
import { CardSelector } from './components/CardSelector';
import { GameControls } from './components/GameControls';
import { GtoAdviceScreen } from './components/GtoAdviceScreen';

export default function App() {
  const game = useGameState();
  const [adviceOpen, setAdviceOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GtoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    const gameState = game.buildGameState();
    if (!gameState) return;

    setAdviceOpen(true);
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await analyzeHand(gameState);
      setResult(response.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
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
              <p className="text-xs text-zinc-500">6-Max Analyzer · Powered by Gemini</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="rounded-full bg-emerald-900/40 px-3 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-800/50">
              Hero: {game.heroPosition}
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
          onStageChange={game.setStage}
          onPotChange={game.setPot}
          onReset={game.resetTable}
        />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Poker Table — 3 cols */}
          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 sm:p-6">
              <p className="mb-4 text-center text-xs text-zinc-500">
                คลิกที่ตำแหน่งเพื่อเลือก Hero · ปรับ Stack / Bet / Fold ได้ที่แต่ละที่นั่ง
              </p>
              <PokerTable
                heroPosition={game.heroPosition}
                positions={game.positions}
                heroCards={game.heroCards}
                boardCards={game.boardCards}
                pot={game.pot}
                onSelectHero={game.setHeroPosition}
                onUpdatePosition={game.updatePosition}
                positionsList={game.positionsList}
              />
            </div>
          </div>

          {/* Card Selector — 2 cols */}
          <div className="lg:col-span-2">
            <div className="flex h-full flex-col rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 sm:p-6">
              <CardSelector
                stage={game.stage}
                heroCards={game.heroCards}
                boardCards={game.boardCards}
                usedCards={game.usedCards}
                onSelectHero={game.selectHeroCard}
                onSelectBoard={game.selectBoardCard}
              />

              <div className="mt-auto pt-6">
                {game.validationError && (
                  <p className="mb-3 text-center text-xs text-amber-400">
                    {game.validationError}
                  </p>
                )}
                <button
                  type="button"
                  disabled={!!game.validationError || loading}
                  onClick={handleAnalyze}
                  className="w-full rounded-xl bg-gradient-to-r from-gold to-gold-dim py-3.5 text-sm font-bold tracking-wide text-zinc-900 shadow-lg shadow-gold/20 transition-all hover:shadow-gold/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  {loading ? 'กำลังวิเคราะห์...' : 'วิเคราะห์ด้วย AI'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <GtoAdviceScreen
        open={adviceOpen}
        result={result}
        loading={loading}
        error={error}
        onClose={() => setAdviceOpen(false)}
      />
    </div>
  );
}
