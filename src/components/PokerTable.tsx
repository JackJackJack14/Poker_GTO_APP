import type { Position, PositionState } from '../types';
import { PlayingCard } from './PlayingCard';
import { NumericInput } from './NumericInput';
import type { Card } from '../types';
import {
  getMaxStreetBet,
  getSeatActionLabel,
  getSeatStreetMode,
  type StreetMode,
} from '../lib/potEngine';
import {
  getPositionLabel,
  PHYSICAL_SEAT_LAYOUT,
  SEAT_COUNT,
  STREET_BET_BADGE_LAYOUT,
  type SeatIndex,
} from '../lib/seatLayout';

interface SeatProps {
  seatIndex: SeatIndex;
  position: Position;
  state: PositionState;
  isHero: boolean;
  isButton: boolean;
  isActive: boolean;
  heroCards?: [Card | null, Card | null];
  maxStreetBet: number;
  streetMode: StreetMode;
  pot: number;
  onSetButton: () => void;
  onSetHero: () => void;
  onActivate: () => void;
  onUpdate: (patch: Partial<PositionState>) => void;
  betInputRef: (el: HTMLInputElement | null) => void;
  style: React.CSSProperties;
}

const QUICK_BET_PERCENTS = [33, 50, 75] as const;

function roundBb(n: number): number {
  return Math.round(Math.max(0, n) * 10) / 10;
}

function btnClass(active: boolean): string {
  return `rounded px-1.5 py-0.5 text-[9px] font-semibold leading-none transition-colors ${
    active
      ? 'bg-gold/25 text-gold ring-1 ring-gold/50'
      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
  }`;
}

/** ชิปเดิมพันลอยบน felt — แสดงเฉพาะเมื่อ bet > 0 และยังไม่ fold */
function StreetBetBadge({
  amount,
  style,
}: {
  amount: number;
  style: React.CSSProperties;
}) {
  return (
    <div
      className="pointer-events-none absolute z-[5]"
      style={style}
      aria-hidden
    >
      <div className="rounded-full border border-amber-400/70 bg-zinc-950/90 px-2.5 py-1 shadow-[0_2px_8px_rgba(0,0,0,0.45)] ring-1 ring-amber-700/40 backdrop-blur-[2px]">
        <p className="whitespace-nowrap font-mono text-[11px] font-bold tabular-nums leading-none text-amber-200">
          {amount.toFixed(1)}
          <span className="ml-0.5 text-[9px] font-semibold text-amber-400/90">
            BB
          </span>
        </p>
      </div>
    </div>
  );
}

function Seat({
  seatIndex,
  position,
  state,
  isHero,
  isButton,
  isActive,
  heroCards,
  maxStreetBet,
  streetMode,
  pot,
  onSetButton,
  onSetHero,
  onActivate,
  onUpdate,
  betInputRef,
  style,
}: SeatProps) {
  const actionLabel = getSeatActionLabel(state, maxStreetBet);
  const isChecked =
    !state.folded &&
    ((streetMode === 'open' && state.betSize === 0) ||
      (streetMode === 'matched' && state.betSize === maxStreetBet));

  const zIndex = isActive ? 40 : isHero ? 30 : 10 + seatIndex;

  return (
    <div
      className="absolute"
      style={{ ...style, zIndex, width: '7.25rem' }}
      onClick={onActivate}
      onFocus={onActivate}
    >
      <div
        className={`flex max-h-[9.5rem] w-full flex-col overflow-hidden rounded-lg border bg-zinc-950/95 px-1.5 py-1 shadow-md backdrop-blur-sm ${
          isHero
            ? 'border-gold ring-1 ring-gold/60'
            : isActive
              ? 'border-sky-400 ring-1 ring-sky-400/50'
              : 'border-zinc-700/80'
        } ${state.folded ? 'opacity-45' : ''}`}
      >
        {/* Row 1: position + dealer + hero toggle */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSetButton();
            }}
            title="ย้าย BTN"
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${
              isButton
                ? 'bg-white text-zinc-900'
                : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
            }`}
          >
            D
          </button>
          <div
            className={`min-w-0 flex-1 truncate rounded px-1 py-0.5 text-center text-[10px] font-bold tracking-wide ${
              isHero
                ? 'bg-gold text-zinc-900'
                : 'bg-zinc-800 text-zinc-200'
            }`}
          >
            {position}
            {isHero ? ' ★' : ''}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSetHero();
            }}
            className={`shrink-0 rounded px-1 py-0.5 text-[8px] ${
              isHero
                ? 'text-emerald-300'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            H
          </button>
        </div>

        {/* Row 2: cards (hero only) + stack/bet */}
        <div className="mt-0.5 flex items-center gap-1">
          {isHero && heroCards ? (
            <div className="flex shrink-0 gap-0.5">
              {heroCards.map((c, i) =>
                c ? (
                  <PlayingCard key={i} card={c} size="sm" />
                ) : (
                  <div
                    key={i}
                    className="flex h-10 w-7 items-center justify-center rounded border border-dashed border-zinc-600 bg-zinc-800/60 text-[9px] text-zinc-500"
                  >
                    ?
                  </div>
                ),
              )}
            </div>
          ) : null}
          <div className="min-w-0 flex-1 text-right leading-tight">
            <div className="font-mono text-[10px] text-emerald-400">
              {state.stack.toFixed(0)}
              <span className="text-[8px] text-zinc-500"> BB</span>
            </div>
            {actionLabel && !state.folded && (
              <div className="truncate text-[8px] font-bold text-sky-300">
                {actionLabel}
              </div>
            )}
            {state.folded && (
              <div className="text-[8px] font-bold text-red-400">FOLD</div>
            )}
          </div>
        </div>

        {/* Row 3: Fold / Call|Check — horizontal */}
        <div
          className="mt-0.5 flex flex-wrap items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onUpdate({ folded: !state.folded })}
            className={btnClass(state.folded)}
          >
            {state.folded ? 'Un' : 'Fold'}
          </button>
          {!state.folded && streetMode !== 'facing' && (
            <button
              type="button"
              onClick={() =>
                onUpdate({ betSize: streetMode === 'open' ? 0 : state.betSize })
              }
              className={btnClass(isChecked)}
            >
              Chk
            </button>
          )}
          {!state.folded && streetMode === 'facing' && (
            <button
              type="button"
              onClick={() => onUpdate({ betSize: maxStreetBet })}
              className={btnClass(state.betSize === maxStreetBet)}
              title={`Call ${maxStreetBet.toFixed(1)}`}
            >
              Call
            </button>
          )}
        </div>

        {/* Row 4: Bet/Raise input + % — horizontal compact */}
        {!state.folded && (
          <div
            className="mt-0.5 flex items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <NumericInput
              ref={betInputRef}
              value={state.betSize}
              onChange={(amount) => {
                if (state.folded) return;
                onUpdate({ betSize: Math.max(0, amount) });
              }}
              className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-800 px-0.5 py-0.5 text-center font-mono text-[9px] text-zinc-200"
            />
            {QUICK_BET_PERCENTS.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() =>
                  onUpdate({ betSize: roundBb((pot * pct) / 100) })
                }
                className="shrink-0 rounded bg-zinc-800 px-1 py-0.5 text-[8px] font-semibold text-amber-300/90 ring-1 ring-zinc-700 hover:bg-amber-900/40"
              >
                {pct}
              </button>
            ))}
          </div>
        )}

        {/* Row 5: stack + tendencies — single compact line */}
        <div
          className="mt-0.5 flex items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <NumericInput
            value={state.stack}
            onChange={(stack) => onUpdate({ stack })}
            className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-0.5 py-0.5 text-center font-mono text-[8px] text-zinc-400"
          />
          {!isHero && (
            <>
              <label className="flex items-center gap-0.5 text-[7px] text-zinc-500" title="Station">
                <input
                  type="checkbox"
                  checked={state.station ?? false}
                  onChange={(e) => onUpdate({ station: e.target.checked })}
                  className="h-2 w-2 accent-amber-500"
                />
                S
              </label>
              <label className="flex items-center gap-0.5 text-[7px] text-zinc-500" title="Tight">
                <input
                  type="checkbox"
                  checked={state.tight ?? false}
                  onChange={(e) => onUpdate({ tight: e.target.checked })}
                  className="h-2 w-2 accent-sky-500"
                />
                T
              </label>
            </>
          )}
        </div>
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
    /* Wrapper: position relative — fixed 6-max frame */
    <div className="relative mx-auto aspect-[5/4] w-full max-w-3xl">
      {/* Felt oval — center only, seats stay outside ring */}
      <div className="pointer-events-none absolute inset-[18%_14%] rounded-[50%] bg-gradient-to-br from-felt-mid via-felt-dark to-felt-light shadow-[inset_0_0_50px_rgba(0,0,0,0.55),0_0_30px_rgba(0,0,0,0.45)] ring-[3px] ring-amber-900/45">
        <div className="absolute inset-2 rounded-[50%] border border-amber-800/25" />

        {/* Pot + board centered on felt */}
        <div className="absolute left-1/2 top-[34%] z-[1] w-max max-w-[90%] -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="rounded-full bg-zinc-950/75 px-4 py-1.5 ring-1 ring-gold/35 backdrop-blur-sm">
            <p className="text-[9px] uppercase tracking-widest text-zinc-400">
              Total Pot
            </p>
            <p className="font-mono text-lg font-bold leading-tight text-gold sm:text-xl">
              {pot.toFixed(1)} BB
            </p>
            <p className="text-[8px] text-zinc-500">
              Street {streetPot.toFixed(1)} + Dead {basePot.toFixed(1)}
            </p>
          </div>
        </div>

        {visibleBoard.length > 0 && (
          <div className="absolute left-1/2 top-[58%] z-[1] flex -translate-x-1/2 -translate-y-1/2 gap-1">
            {visibleBoard.map((card) => (
              <PlayingCard key={card} card={card} size="md" />
            ))}
          </div>
        )}
      </div>

      {/* Street bet badges — ลอยบน felt เยื้องเข้ากลาง; หายเมื่อ bet=0 (เปลี่ยนสตรีท) */}
      {Array.from({ length: SEAT_COUNT }, (_, index) => {
        const seatIndex = index as SeatIndex;
        const seat = seats[seatIndex];
        if (seat.folded || seat.betSize <= 0) return null;
        return (
          <StreetBetBadge
            key={`bet-badge-${seatIndex}`}
            amount={seat.betSize}
            style={STREET_BET_BADGE_LAYOUT[seatIndex]}
          />
        );
      })}

      {/* 6 locked absolute seat pods */}
      {Array.from({ length: SEAT_COUNT }, (_, index) => {
        const seatIndex = index as SeatIndex;
        return (
          <Seat
            key={seatIndex}
            seatIndex={seatIndex}
            position={getPositionLabel(seatIndex, btnSeatIndex)}
            state={seats[seatIndex]}
            isHero={seatIndex === heroSeatIndex}
            isButton={seatIndex === btnSeatIndex}
            isActive={seatIndex === activeSeatIndex}
            heroCards={seatIndex === heroSeatIndex ? heroCards : undefined}
            maxStreetBet={maxStreetBet}
            streetMode={getSeatStreetMode(seats[seatIndex], maxStreetBet)}
            pot={pot}
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
