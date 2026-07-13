import type { Position, PositionState } from '../types';
import { PlayingCard } from './PlayingCard';
import type { Card } from '../types';

interface SeatProps {
  position: Position;
  state: PositionState;
  isHero: boolean;
  heroCards?: [Card | null, Card | null];
  onSelectHero: () => void;
  onUpdate: (patch: Partial<PositionState>) => void;
  style: React.CSSProperties;
}

function Seat({
  position,
  state,
  isHero,
  heroCards,
  onSelectHero,
  onUpdate,
  style,
}: SeatProps) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={style}>
      <button
        type="button"
        onClick={onSelectHero}
        className={`group relative flex flex-col items-center gap-1.5 rounded-xl p-2 transition-all ${
          isHero
            ? 'ring-2 ring-gold shadow-[0_0_20px_rgba(212,168,83,0.35)]'
            : 'hover:ring-1 hover:ring-zinc-500'
        } ${state.folded ? 'opacity-45' : ''}`}
      >
        {/* Position badge */}
        <div
          className={`rounded-full px-3 py-0.5 text-xs font-bold tracking-wider ${
            isHero
              ? 'bg-gold text-zinc-900'
              : 'bg-zinc-800 text-zinc-300 border border-zinc-600'
          }`}
        >
          {position}
          {isHero && <span className="ml-1 text-[10px] font-normal">HERO</span>}
        </div>

        {/* Hero cards preview */}
        {isHero && heroCards && (
          <div className="flex gap-1">
            {heroCards.map((c, i) =>
              c ? (
                <PlayingCard key={i} card={c} size="sm" />
              ) : (
                <div
                  key={i}
                  className="flex h-12 w-9 items-center justify-center rounded-lg border border-dashed border-zinc-600 bg-zinc-800/60 text-xs text-zinc-500"
                >
                  ?
                </div>
              ),
            )}
          </div>
        )}

        {/* Stack & bet */}
        <div className="flex flex-col items-center gap-0.5 text-[11px]">
          <span className="font-mono text-emerald-400">
            {state.stack.toFixed(1)} BB
          </span>
          {state.betSize > 0 && (
            <span className="rounded bg-amber-900/60 px-1.5 py-0.5 font-mono text-amber-300">
              bet {state.betSize.toFixed(1)}
            </span>
          )}
        </div>

        {state.folded && (
          <span className="absolute -top-1 -right-1 rounded bg-red-900/80 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
            FOLD
          </span>
        )}
      </button>

      {/* Seat controls */}
      <div
        className="mt-1 flex flex-col items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onUpdate({ folded: !state.folded })}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              state.folded
                ? 'bg-red-900/50 text-red-300 ring-1 ring-red-700'
                : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            {state.folded ? 'Unfold' : 'Fold'}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[9px] text-zinc-500">Stack</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={state.stack}
            onChange={(e) =>
              onUpdate({ stack: Math.max(0, Number(e.target.value)) })
            }
            className="w-14 rounded border border-zinc-600 bg-zinc-800 px-1 py-0.5 text-center font-mono text-[10px] text-zinc-200"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[9px] text-zinc-500">Bet</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={state.betSize}
            onChange={(e) =>
              onUpdate({ betSize: Math.max(0, Number(e.target.value)) })
            }
            className="w-14 rounded border border-zinc-600 bg-zinc-800 px-1 py-0.5 text-center font-mono text-[10px] text-zinc-200"
          />
        </div>
      </div>
    </div>
  );
}

/** ตำแหน่งที่นั่งรอบโต๊ะ 6-Max (เปอร์เซ็นต์ของ container) */
const SEAT_LAYOUT: Record<Position, React.CSSProperties> = {
  UTG: { left: '50%', top: '6%' },
  MP: { left: '88%', top: '22%' },
  CO: { left: '92%', top: '58%' },
  BTN: { left: '50%', top: '92%' },
  SB: { left: '12%', top: '58%' },
  BB: { left: '8%', top: '22%' },
};

interface PokerTableProps {
  heroPosition: Position;
  positions: Record<Position, PositionState>;
  heroCards: [Card | null, Card | null];
  boardCards: (Card | null)[];
  pot: number;
  onSelectHero: (pos: Position) => void;
  onUpdatePosition: (pos: Position, patch: Partial<PositionState>) => void;
  positionsList: readonly Position[];
}

export function PokerTable({
  heroPosition,
  positions,
  heroCards,
  boardCards,
  pot,
  onSelectHero,
  onUpdatePosition,
  positionsList,
}: PokerTableProps) {
  const visibleBoard = boardCards.filter((c): c is Card => c !== null);

  return (
    <div className="relative mx-auto aspect-[16/11] w-full max-w-2xl">
      {/* Table felt */}
      <div className="absolute inset-[8%] rounded-[50%] bg-gradient-to-br from-felt-mid via-felt-dark to-felt-light shadow-[inset_0_0_60px_rgba(0,0,0,0.5),0_0_40px_rgba(0,0,0,0.6)] ring-4 ring-amber-900/40">
        {/* Inner rail */}
        <div className="absolute inset-3 rounded-[50%] border-2 border-amber-800/30" />

        {/* Pot */}
        <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="rounded-full bg-zinc-900/70 px-5 py-2 ring-1 ring-gold/30 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-widest text-zinc-400">
              Pot
            </p>
            <p className="font-mono text-xl font-bold text-gold">
              {pot.toFixed(1)} BB
            </p>
          </div>
        </div>

        {/* Board cards */}
        {visibleBoard.length > 0 && (
          <div className="absolute left-1/2 top-[55%] flex -translate-x-1/2 gap-1.5">
            {visibleBoard.map((card) => (
              <PlayingCard key={card} card={card} size="md" />
            ))}
          </div>
        )}
      </div>

      {/* Seats */}
      {positionsList.map((pos) => (
        <Seat
          key={pos}
          position={pos}
          state={positions[pos]}
          isHero={pos === heroPosition}
          heroCards={pos === heroPosition ? heroCards : undefined}
          onSelectHero={() => onSelectHero(pos)}
          onUpdate={(patch) => onUpdatePosition(pos, patch)}
          style={SEAT_LAYOUT[pos]}
        />
      ))}
    </div>
  );
}
