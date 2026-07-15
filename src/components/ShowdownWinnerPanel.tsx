import { useEffect, useRef, useState } from 'react';
import {
  calcNetRealProfit,
  calcSplitPotProfit,
} from '../lib/evTracker';

export type ShowdownResolution =
  | { outcome: 'win' }
  | { outcome: 'lose' }
  | { outcome: 'split'; splitWays: 2 | 3 };

interface ShowdownWinnerPanelProps {
  totalPot: number;
  heroInvested: number;
  activePlayerCount: number;
  disabled?: boolean;
  onResolve: (resolution: ShowdownResolution) => void;
  /** compact = ใช้ใน modal advice */
  compact?: boolean;
}

/**
 * ปุ่ม Showdown: Hero ชนะเต็ม / Chop 2–3 ทาง / Hero แพ้
 */
export function ShowdownWinnerPanel({
  totalPot,
  heroInvested,
  activePlayerCount,
  disabled = false,
  onResolve,
  compact = false,
}: ShowdownWinnerPanelProps) {
  const [chopOpen, setChopOpen] = useState(false);
  const chopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chopOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!chopRef.current?.contains(e.target as Node)) {
        setChopOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [chopOpen]);

  const winNet = calcNetRealProfit(totalPot, heroInvested, 'win');
  const loseNet = calcNetRealProfit(totalPot, heroInvested, 'lose');
  const split2 = calcSplitPotProfit(totalPot, heroInvested, 2);
  const split3 = calcSplitPotProfit(totalPot, heroInvested, 3);
  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)} BB`;

  const btnBase = compact
    ? 'rounded-lg px-2 py-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-35'
    : 'rounded-xl px-2 py-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-35';

  return (
    <div className="space-y-2">
      <p className="text-center text-[11px] text-zinc-400">
        Showdown · Family Pot ({activePlayerCount} คน) · Pot{' '}
        <span className="font-mono text-gold">{totalPot.toFixed(1)} BB</span>
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onResolve({ outcome: 'win' })}
          title={`ชนะเต็ม → ${fmt(winNet)} (Pot − ลงทุน)`}
          className={`${btnBase} border border-emerald-600 bg-emerald-950 text-emerald-100 hover:bg-emerald-900`}
        >
          🏆 Hero ชนะเต็มพ็อต
        </button>

        <div className="relative" ref={chopRef}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setChopOpen((o) => !o)}
            title="หารพ็อตเท่าๆ กัน (Chop)"
            className={`${btnBase} w-full border border-sky-600 bg-sky-950 text-sky-100 hover:bg-sky-900`}
          >
            🤝 Split Pot / Chop
          </button>
          {chopOpen && (
            <div className="absolute left-1/2 z-30 mt-1.5 w-44 -translate-x-1/2 rounded-xl border border-sky-700/70 bg-zinc-950 p-2 shadow-xl shadow-sky-950/50">
              <p className="mb-1.5 text-center text-[10px] text-zinc-400">
                หารกี่คน?
              </p>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setChopOpen(false);
                    onResolve({ outcome: 'split', splitWays: 2 });
                  }}
                  className="rounded-lg border border-sky-700/60 bg-sky-950/80 px-2 py-2 text-[11px] font-semibold text-sky-100 hover:bg-sky-900"
                >
                  2 คน · {fmt(split2)}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setChopOpen(false);
                    onResolve({ outcome: 'split', splitWays: 3 });
                  }}
                  className="rounded-lg border border-sky-700/60 bg-sky-950/80 px-2 py-2 text-[11px] font-semibold text-sky-100 hover:bg-sky-900"
                >
                  3 คน · {fmt(split3)}
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onResolve({ outcome: 'lose' })}
          title={`แพ้ Showdown → ${fmt(loseNet)}`}
          className={`${btnBase} border border-red-700 bg-red-950 text-red-100 hover:bg-red-900`}
        >
          💀 Hero แพ้ Showdown
        </button>
      </div>
    </div>
  );
}
