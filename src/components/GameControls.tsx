import type { Stage } from '../types';
import { STAGES } from '../types';
import { NumericInput } from './NumericInput';

interface GameControlsProps {
  stage: Stage;
  pot: number;
  basePot: number;
  streetPot: number;
  onStageChange: (stage: Stage) => void;
  onBasePotChange: (basePot: number) => void;
  onReset: () => void;
}

export function GameControls({
  stage,
  pot,
  basePot,
  streetPot,
  onStageChange,
  onBasePotChange,
  onReset,
}: GameControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-zinc-400">Street</label>
        <div className="flex gap-1">
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onStageChange(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                s === stage
                  ? 'bg-gold text-zinc-900 shadow-md'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-400">Pot (auto)</label>
          <span className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 font-mono text-sm text-gold">
            {pot.toFixed(1)} BB
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-400">Street Bets</label>
          <span className="rounded-lg border border-zinc-700/70 bg-zinc-800/70 px-2 py-1 font-mono text-xs text-amber-300">
            {streetPot.toFixed(1)} BB
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-400">Dead Pot</label>
          <NumericInput
            value={basePot}
            onChange={onBasePotChange}
            className="w-20 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-center font-mono text-sm text-zinc-200"
          />
        </div>
        {stage === 'PREFLOP' && streetPot >= 1.5 - 1e-9 && basePot < 1e-9 && (
          <span className="rounded-lg border border-emerald-800/50 bg-emerald-950/40 px-2 py-1 text-[10px] font-medium text-emerald-300">
            Blinds auto 1.5 BB
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onReset}
        title="ล้างไพ่ / พ็อต / Actions ทั้งหมด — เริ่มแฮนด์ใหม่ทันที"
        className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-800/70 bg-red-950/50 px-3.5 py-2 text-xs font-bold tracking-wide text-red-200 shadow-sm transition-colors hover:border-red-500 hover:bg-red-900/60 hover:text-white"
      >
        <span className="text-sm leading-none" aria-hidden>
          ⟲
        </span>
        ล้างข้อมูลแฮนด์ (Reset Table)
      </button>
    </div>
  );
}
