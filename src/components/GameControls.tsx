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
      </div>

      <button
        type="button"
        onClick={onReset}
        className="ml-auto rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
      >
        รีเซ็ตโต๊ะ
      </button>
    </div>
  );
}
