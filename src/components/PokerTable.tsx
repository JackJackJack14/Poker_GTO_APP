import type { Position, PositionState } from '../types';
import { PlayingCard } from './PlayingCard';
import { NumericInput } from './NumericInput';
import type { Card } from '../types';
import {
  getMaxStreetBet,
  getSeatActionLabel,
  getSeatStreetMode,
  getToCall,
  type StreetMode,
} from '../lib/potEngine';
import {
  getPositionLabel,
  PHYSICAL_SEAT_LAYOUT,
  SEAT_COUNT,
  type SeatIndex,
} from '../lib/seatLayout';

interface SeatProps {
  position: Position;
  state: PositionState;
  isHero: boolean;
  isButton: boolean;
  isActive: boolean;
  heroCards?: [Card | null, Card | null];
  maxStreetBet: number;
  streetMode: StreetMode;
  onSetButton: () => void;
  onSetHero: () => void;
  onActivate: () => void;
  onUpdate: (patch: Partial<PositionState>) => void;
  betInputRef: (el: HTMLInputElement | null) => void;
  style: React.CSSProperties;
}

function actionButtonClass(active: boolean): string {
  return `rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
    active
      ? 'bg-gold/20 text-gold ring-1 ring-gold/50'
      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
  }`;
}

function Seat({
  position,
  state,
  isHero,
  isButton,
  isActive,
  heroCards,
  maxStreetBet,
  streetMode,
  onSetButton,
  onSetHero,
  onActivate,
  onUpdate,
  betInputRef,
  style,
}: SeatProps) {
  const toCall = getToCall(state, maxStreetBet);
  const actionLabel = getSeatActionLabel(state, maxStreetBet);
  const isChecked =
    !state.folded &&
    ((streetMode === 'open' && state.betSize === 0) ||
      (streetMode === 'matched' && state.betSize === maxStreetBet));

  const applyWager = (amount: number) => {
    if (state.folded) return;

    if (streetMode === 'open') {
      onUpdate({ betSize: Math.max(0, amount) });
      return;
    }

    const minRaiseTotal = maxStreetBet + 1;
    const next = Math.max(amount, minRaiseTotal);
    onUpdate({ betSize: next });
  };

  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={style}>
      <div
        className={`group relative flex flex-col items-center gap-1.5 rounded-xl p-2 transition-all ${
          isHero
            ? 'ring-2 ring-gold shadow-[0_0_20px_rgba(212,168,83,0.35)]'
            : isActive
              ? 'ring-2 ring-sky-400/80 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
              : isButton
                ? 'ring-2 ring-white/30'
                : 'hover:ring-1 hover:ring-zinc-500'
        } ${state.folded ? 'opacity-45' : ''}`}
      >
        <button
          type="button"
          onClick={onSetButton}
          title="คลิกเพื่อย้าย BTN (Dealer) มาที่นี่"
          className="flex w-full flex-col items-center gap-1.5"
        >
          {isButton && (
            <span className="absolute -top-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-white text-[10px] font-bold text-zinc-900 shadow-md">
              D
            </span>
          )}

          <div
            className={`rounded-full px-3 py-0.5 text-xs font-bold tracking-wider ${
              isHero
                ? 'bg-gold text-zinc-900'
                : position === 'BTN'
                  ? 'bg-white text-zinc-900'
                  : 'bg-zinc-800 text-zinc-300 border border-zinc-600'
            }`}
          >
            {position}
            {isHero && <span className="ml-1 text-[10px] font-normal">HERO</span>}
          </div>

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

          <div className="flex flex-col items-center gap-0.5 text-[11px]">
            <span className="font-mono text-emerald-400">
              {state.stack.toFixed(1)} BB
            </span>
            {state.betSize > 0 && (
              <span className="rounded bg-amber-900/60 px-1.5 py-0.5 font-mono text-amber-300">
                in {state.betSize.toFixed(1)} BB
              </span>
            )}
            {actionLabel && !state.folded && (
              <span className="rounded bg-sky-900/50 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-sky-200">
                {actionLabel}
              </span>
            )}
          </div>

          {state.folded && (
            <span className="absolute -top-1 -right-1 rounded bg-red-900/80 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
              FOLD
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onSetHero}
          className={`mt-0.5 rounded px-2 py-0.5 text-[9px] font-medium transition-colors ${
            isHero
              ? 'bg-emerald-900/50 text-emerald-300 ring-1 ring-emerald-700'
              : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300'
          }`}
        >
          {isHero ? '★ Hero' : 'ตั้ง Hero'}
        </button>
      </div>

      <div
        className="mt-1 flex w-[7.5rem] flex-col items-center gap-1"
        onClick={(e) => {
          e.stopPropagation();
          onActivate();
        }}
        onFocus={onActivate}
      >
        <div className="flex flex-wrap justify-center gap-1">
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

          {!state.folded && streetMode !== 'facing' && (
            <button
              type="button"
              onClick={() =>
                onUpdate({ betSize: streetMode === 'open' ? 0 : state.betSize })
              }
              className={actionButtonClass(isChecked)}
            >
              Check
            </button>
          )}

          {!state.folded && streetMode === 'facing' && (
            <button
              type="button"
              onClick={() => onUpdate({ betSize: maxStreetBet })}
              className={actionButtonClass(state.betSize === maxStreetBet)}
            >
              Call {toCall.toFixed(1)}
            </button>
          )}
        </div>

        {!state.folded && (
          <div className="flex w-full items-center gap-1">
            <label className="w-8 shrink-0 text-[9px] text-zinc-500">
              {streetMode === 'facing' || streetMode === 'matched' ? 'Raise' : 'Bet'}
            </label>
            <NumericInput
              ref={betInputRef}
              value={state.betSize}
              onChange={applyWager}
              className="w-full rounded border border-zinc-600 bg-zinc-800 px-1 py-0.5 text-center font-mono text-[10px] text-zinc-200"
            />
          </div>
        )}

        <div className="flex w-full items-center gap-1">
          <label className="w-8 shrink-0 text-[9px] text-zinc-500">Stack</label>
          <NumericInput
            value={state.stack}
            onChange={(stack) => onUpdate({ stack })}
            className="w-full rounded border border-zinc-600 bg-zinc-800 px-1 py-0.5 text-center font-mono text-[10px] text-zinc-200"
          />
        </div>

        {!isHero && (
          <div className="flex w-full flex-col gap-0.5 border-t border-zinc-700/50 pt-1">
            <label className="flex cursor-pointer items-center gap-1 text-[8px] text-zinc-400">
              <input
                type="checkbox"
                checked={state.station ?? false}
                onChange={(e) => onUpdate({ station: e.target.checked })}
                className="h-2.5 w-2.5 rounded border-zinc-600 accent-amber-500"
              />
              Station (คอลไม่เลิก)
            </label>
            <label className="flex cursor-pointer items-center gap-1 text-[8px] text-zinc-400">
              <input
                type="checkbox"
                checked={state.tight ?? false}
                onChange={(e) => onUpdate({ tight: e.target.checked })}
                className="h-2.5 w-2.5 rounded border-zinc-600 accent-sky-500"
              />
              Tight (หมอบบ่อย)
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

interface PokerTableProps {
  seats: PositionState[];
  btnSeatIndex: SeatIndex;
  heroSeatIndex: SeatIndex;
  activeSeatIndex: SeatIndex;
  heroCards: [Card | null, Card | null];
  boardCards: (Card | null)[];
  pot: number;
  basePot: number;
  positions: Record<Position, PositionState>;
  onSetBtnSeat: (seatIndex: SeatIndex) => void;
  onSetHeroSeat: (seatIndex: SeatIndex) => void;
  onActiveSeatChange: (seatIndex: SeatIndex) => void;
  onUpdateSeat: (seatIndex: SeatIndex, patch: Partial<PositionState>) => void;
  registerBetInput: (seatIndex: SeatIndex, el: HTMLInputElement | null) => void;
}

export function PokerTable({
  seats,
  btnSeatIndex,
  heroSeatIndex,
  activeSeatIndex,
  heroCards,
  boardCards,
  pot,
  basePot,
  positions,
  onSetBtnSeat,
  onSetHeroSeat,
  onActiveSeatChange,
  onUpdateSeat,
  registerBetInput,
}: PokerTableProps) {
  const visibleBoard = boardCards.filter((c): c is Card => c !== null);
  const maxStreetBet = getMaxStreetBet(positions);
  const streetPot = pot - basePot;

  return (
    <div className="relative mx-auto aspect-[16/11] w-full max-w-2xl">
      <div className="absolute inset-[8%] rounded-[50%] bg-gradient-to-br from-felt-mid via-felt-dark to-felt-light shadow-[inset_0_0_60px_rgba(0,0,0,0.5),0_0_40px_rgba(0,0,0,0.6)] ring-4 ring-amber-900/40">
        <div className="absolute inset-3 rounded-[50%] border-2 border-amber-800/30" />

        <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="rounded-full bg-zinc-900/70 px-5 py-2 ring-1 ring-gold/30 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-widest text-zinc-400">
              Total Pot
            </p>
            <p className="font-mono text-xl font-bold text-gold">
              {pot.toFixed(1)} BB
            </p>
            <p className="mt-0.5 text-[9px] text-zinc-500">
              Street {streetPot.toFixed(1)} + Dead {basePot.toFixed(1)}
            </p>
          </div>
        </div>

        {visibleBoard.length > 0 && (
          <div className="absolute left-1/2 top-[55%] flex -translate-x-1/2 gap-1.5">
            {visibleBoard.map((card) => (
              <PlayingCard key={card} card={card} size="md" />
            ))}
          </div>
        )}
      </div>

      {Array.from({ length: SEAT_COUNT }, (_, index) => {
        const seatIndex = index as SeatIndex;
        const seatState = seats[seatIndex];
        const position = getPositionLabel(seatIndex, btnSeatIndex);

        return (
          <Seat
            key={seatIndex}
            position={position}
            state={seatState}
            isHero={seatIndex === heroSeatIndex}
            isButton={seatIndex === btnSeatIndex}
            isActive={seatIndex === activeSeatIndex}
            heroCards={seatIndex === heroSeatIndex ? heroCards : undefined}
            maxStreetBet={maxStreetBet}
            streetMode={getSeatStreetMode(seatState, maxStreetBet)}
            onSetButton={() => onSetBtnSeat(seatIndex)}
            onSetHero={() => onSetHeroSeat(seatIndex)}
            onActivate={() => onActiveSeatChange(seatIndex)}
            onUpdate={(patch) => onUpdateSeat(seatIndex, patch)}
            betInputRef={(el) => registerBetInput(seatIndex, el)}
            style={PHYSICAL_SEAT_LAYOUT[seatIndex]}
          />
        );
      })}
    </div>
  );
}
