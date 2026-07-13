import type { Position, PositionState } from '../types';
import { POSITIONS } from '../types';

export type StreetMode = 'open' | 'facing' | 'matched';

export function sumStreetBets(
  positions: Record<Position, PositionState>,
): number {
  return POSITIONS.reduce((sum, pos) => sum + positions[pos].betSize, 0);
}

export function calculateTotalPot(
  basePot: number,
  positions: Record<Position, PositionState>,
): number {
  return basePot + sumStreetBets(positions);
}

export function getMaxStreetBet(
  positions: Record<Position, PositionState>,
): number {
  return POSITIONS.reduce((max, pos) => {
    const seat = positions[pos];
    if (seat.folded) return max;
    return Math.max(max, seat.betSize);
  }, 0);
}

export function getSeatStreetMode(
  state: PositionState,
  maxBet: number,
): StreetMode {
  if (state.folded) return 'open';
  if (maxBet === 0) return 'open';
  if (state.betSize < maxBet) return 'facing';
  return 'matched';
}

export function getToCall(state: PositionState, maxBet: number): number {
  return Math.max(0, maxBet - state.betSize);
}

export function resetStreetBets(
  positions: Record<Position, PositionState>,
): Record<Position, PositionState> {
  const next = { ...positions };
  for (const pos of POSITIONS) {
    next[pos] = { ...next[pos], betSize: 0 };
  }
  return next;
}

export function getSeatActionLabel(
  state: PositionState,
  maxBet: number,
): string | null {
  if (state.folded) return 'FOLD';
  if (maxBet === 0) {
    return state.betSize > 0 ? `BET ${state.betSize.toFixed(1)}` : 'CHECK';
  }
  if (state.betSize < maxBet) return null;
  if (state.betSize === maxBet && maxBet > 0) {
    return state.betSize === 0 ? 'CHECK' : `CALL ${state.betSize.toFixed(1)}`;
  }
  return `RAISE ${state.betSize.toFixed(1)}`;
}
