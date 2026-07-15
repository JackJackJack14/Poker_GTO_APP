import { useEffect, useState } from 'react';
import type { Card, HandStatus, Position, PositionState, Stage } from '../types';
import { PlayingCard } from './PlayingCard';
import { NumericInput } from './NumericInput';
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

/** Neon green สำหรับ HERO — แยกจาก Active Turn สีทอง */
const HERO_NEON = '#39FF14';

interface SeatProps {
  seatIndex: SeatIndex;
  position: Position;
  state: PositionState;
  isHero: boolean;
  isButton: boolean;
  isToAct: boolean;
  heroCards?: [Card | null, Card | null];
  maxStreetBet: number;
  streetMode: StreetMode;
  pot: number;
  stage: Stage;
  onSetButton: () => void;
  onSetHero: () => void;
  onUpdate: (patch: Partial<PositionState>) => void;
  betInputRef: (el: HTMLInputElement | null) => void;
  style: React.CSSProperties;
}

const QUICK_BET_PERCENTS = [33, 50, 75] as const;

function roundBb(n: number): number {
  return Math.round(Math.max(0, n) * 10) / 10;
}

function btnClass(active: boolean, disabled: boolean): string {
  return `rounded px-1.5 py-0.5 text-[9px] font-semibold leading-none transition-colors ${
    disabled
      ? 'cursor-not-allowed bg-zinc-800/50 text-zinc-600 opacity-40'
      : active
        ? 'bg-gold/25 text-gold ring-1 ring-gold/50'
        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
  }`;
}

function StreetBetBadge({
  amount,
  style,
}: {
  amount: number;
  style: React.CSSProperties;
}) {
  return (
    <div
      className="pointer-events-none absolute z-30 overflow-visible"
      style={style}
      aria-hidden
    >
      <div className="rounded-full border border-amber-400/80 bg-zinc-950/95 px-2.5 py-1 shadow-[0_4px_14px_rgba(0,0,0,0.55)] ring-1 ring-amber-500/50 backdrop-blur-[2px]">
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
  isToAct,
  heroCards,
  maxStreetBet,
  streetMode,
  pot,
  stage,
  onSetButton,
  onSetHero,
  onUpdate,
  betInputRef,
  style,
}: SeatProps) {
  const actionLabel = getSeatActionLabel(state, maxStreetBet);
  const actionsLocked = !isToAct;
  const canCheck = !state.folded && streetMode !== 'facing';
  const canCall = !state.folded && streetMode === 'facing';
  const raiseLabel = streetMode === 'facing' || streetMode === 'matched' ? 'Raise' : 'Bet';

  /** ช่องเดิมพันเริ่มว่างเสมอ (0 + placeholder) — ไม่ดึง min/ของเก่า */
  const [raiseDraft, setRaiseDraft] = useState(0);

  useEffect(() => {
    setRaiseDraft(0);
  }, [isToAct, streetMode, seatIndex, stage]);

  const zIndex = isToAct ? 45 : isHero ? 30 : 10 + seatIndex;

  const commitRaise = (rawAmount?: number) => {
    if (actionsLocked || state.folded) return;
    let amount = roundBb(rawAmount ?? raiseDraft);
    if (streetMode === 'facing' || streetMode === 'matched') {
      const minRaise = roundBb(Math.max(maxStreetBet * 2, maxStreetBet + 1));
      if (amount <= maxStreetBet + 1e-9) amount = minRaise;
    } else if (amount <= 0) {
      amount = roundBb(Math.max(1, pot * 0.33));
    }
    setRaiseDraft(0);
    onUpdate({ betSize: amount });
  };

  const heroFrameStyle =
    isHero && !isToAct
      ? {
          borderColor: HERO_NEON,
          boxShadow: `0 0 14px ${HERO_NEON}99, 0 0 28px ${HERO_NEON}55`,
        }
      : isHero && isToAct
        ? {
            borderColor: HERO_NEON,
            boxShadow: `0 0 12px ${HERO_NEON}88, 0 0 20px rgba(251,191,36,0.65)`,
          }
        : undefined;

  return (
    // ไม่มี onClick บน container — คิวเปลี่ยนได้เฉพาะปุ่มแอคชั่น / hotkeys
    <div
      className="absolute overflow-visible"
      style={{ ...style, zIndex, width: '7.5rem' }}
    >
      <div
        style={heroFrameStyle}
        className={`flex max-h-[10.5rem] w-full flex-col overflow-visible rounded-lg border bg-zinc-950/95 px-1.5 py-1 shadow-md backdrop-blur-sm transition-[box-shadow,border-color] ${
          isToAct
            ? 'animate-pulse border-amber-400 ring-2 ring-amber-400/85 shadow-[0_0_22px_rgba(251,191,36,0.75)]'
            : isHero
              ? 'ring-1'
              : 'border-zinc-700/80'
        } ${state.folded ? 'opacity-45' : ''}`}
      >
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
              isToAct
                ? 'bg-amber-400 text-zinc-950'
                : isHero
                  ? 'text-zinc-950'
                  : 'bg-zinc-800 text-zinc-200'
            }`}
            style={
              isHero && !isToAct
                ? {
                    backgroundColor: HERO_NEON,
                    boxShadow: `0 0 8px ${HERO_NEON}`,
                  }
                : undefined
            }
          >
            {position}
            {isToAct ? ' ●' : isHero ? ' ★' : ''}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSetHero();
            }}
            title="ตั้งเป็น Hero"
            className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-bold ${
              isHero ? 'text-[#39FF14]' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            style={
              isHero
                ? { textShadow: `0 0 6px ${HERO_NEON}` }
                : undefined
            }
          >
            H
          </button>
        </div>

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
              {Math.max(
                0,
                state.stack ?? 100 - (state.investedHand ?? 0),
              ).toFixed(0)}
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

        {/* ปุ่มหลัก 3 ตัว: Fold | Check/Call | (Raise อยู่แถวช่องยอด) */}
        <div
          className={`mt-0.5 flex flex-wrap items-center gap-0.5 ${
            actionsLocked ? 'pointer-events-none' : ''
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={actionsLocked || state.folded}
            onClick={() => {
              if (state.folded || actionsLocked) return;
              onUpdate({ folded: true });
            }}
            className={btnClass(false, actionsLocked || state.folded)}
          >
            Fold
          </button>
          {canCheck && (
            <button
              type="button"
              disabled={actionsLocked}
              onClick={() => {
                if (actionsLocked) return;
                onUpdate({
                  betSize: streetMode === 'open' ? 0 : state.betSize,
                });
              }}
              className={btnClass(false, actionsLocked)}
            >
              Check
            </button>
          )}
          {canCall && (
            <button
              type="button"
              disabled={actionsLocked}
              onClick={() => {
                if (actionsLocked) return;
                onUpdate({ betSize: maxStreetBet });
              }}
              className={btnClass(false, actionsLocked)}
              title={`Call ${maxStreetBet.toFixed(1)} BB`}
            >
              Call
            </button>
          )}
        </div>

        {/* ช่องยอด + ปุ่ม Raise/Bet — พิมพ์อย่างเดียวไม่เปลี่ยนคิว จนกว่าจะกด Raise / Enter */}
        {!state.folded && (
          <div
            className={`mt-0.5 flex flex-col gap-0.5 ${
              actionsLocked ? 'pointer-events-none opacity-40' : ''
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-0.5">
              <NumericInput
                ref={isToAct ? betInputRef : undefined}
                value={raiseDraft}
                onChange={setRaiseDraft}
                onEnterCommit={(amount) => commitRaise(amount)}
                disabled={actionsLocked}
                emptyWhenZero
                placeholder="0"
                className="min-w-0 flex-1 rounded border border-amber-700/50 bg-zinc-800 px-0.5 py-0.5 text-center font-mono text-[9px] text-amber-100 disabled:cursor-not-allowed placeholder:text-zinc-500"
              />
              <button
                type="button"
                disabled={actionsLocked}
                onClick={() => commitRaise()}
                className="shrink-0 rounded bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold text-zinc-950 ring-1 ring-amber-300/80 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {raiseLabel}
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-0.5">
              {QUICK_BET_PERCENTS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  disabled={actionsLocked}
                  onClick={() => setRaiseDraft(roundBb((pot * pct) / 100))}
                  title={`เติม ${pct}% pot ลงช่อง — ยังไม่ยืนยันจนกด ${raiseLabel}`}
                  className="rounded bg-zinc-800 px-1 py-0.5 text-[8px] font-semibold text-amber-300/90 ring-1 ring-zinc-700 hover:bg-amber-900/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          className="mt-0.5 flex items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <NumericInput
            value={state.stack}
            onChange={(stack) => onUpdate({ stack })}
            emptyWhenZero={false}
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
  actionSeatIndex: SeatIndex;
  /** เมื่อ SHOWDOWN — ล็อกแอคชั่นทุกเก้าอี้ */
  handStatus?: HandStatus;
  stage: Stage;
  heroCards: [Card | null, Card | null];
  boardCards: (Card | null)[];
  pot: number;
  basePot: number;
  positions: Record<Position, PositionState>;
  onSetBtnSeat: (seatIndex: SeatIndex) => void;
  onSetHeroSeat: (seatIndex: SeatIndex) => void;
  onUpdateSeat: (seatIndex: SeatIndex, patch: Partial<PositionState>) => void;
  registerBetInput: (seatIndex: SeatIndex, el: HTMLInputElement | null) => void;
}

export function PokerTable({
  seats,
  btnSeatIndex,
  heroSeatIndex,
  actionSeatIndex,
  handStatus = 'PLAYING',
  stage,
  heroCards,
  boardCards,
  pot,
  basePot,
  positions,
  onSetBtnSeat,
  onSetHeroSeat,
  onUpdateSeat,
  registerBetInput,
}: PokerTableProps) {
  const visibleBoard = boardCards.filter((c): c is Card => c !== null);
  const maxStreetBet = getMaxStreetBet(positions);
  const streetPot = pot - basePot;
  const actingEnabled = handStatus === 'PLAYING';

  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-3xl overflow-visible">
      <div className="pointer-events-none absolute inset-[18%_14%] overflow-visible rounded-[50%] bg-gradient-to-br from-felt-mid via-felt-dark to-felt-light shadow-[inset_0_0_50px_rgba(0,0,0,0.55),0_0_30px_rgba(0,0,0,0.45)] ring-[3px] ring-amber-900/45">
        <div className="absolute inset-2 rounded-[50%] border border-amber-800/25" />

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
            {handStatus === 'SHOWDOWN' && (
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                Showdown
              </p>
            )}
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
            isToAct={actingEnabled && seatIndex === actionSeatIndex}
            heroCards={seatIndex === heroSeatIndex ? heroCards : undefined}
            maxStreetBet={maxStreetBet}
            streetMode={getSeatStreetMode(seats[seatIndex], maxStreetBet)}
            pot={pot}
            stage={stage}
            onSetButton={() => onSetBtnSeat(seatIndex)}
            onSetHero={() => onSetHeroSeat(seatIndex)}
            onUpdate={(patch) => onUpdateSeat(seatIndex, patch)}
            betInputRef={(el) => registerBetInput(seatIndex, el)}
            style={PHYSICAL_SEAT_LAYOUT[seatIndex]}
          />
        );
      })}
    </div>
  );
}
