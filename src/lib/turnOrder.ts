import type { Position, PositionState, Stage } from '../types';
import { findSeatForPosition, type SeatIndex } from './seatLayout';

/** Preflop: UTG → MP → CO → BTN → SB → BB */
export const PREFLOP_ACTION_ORDER: readonly Position[] = [
  'UTG',
  'MP',
  'CO',
  'BTN',
  'SB',
  'BB',
] as const;

/** Postflop: ซ้ายของ BTN ก่อน = SB → BB → UTG → MP → CO → BTN */
export const POSTFLOP_ACTION_ORDER: readonly Position[] = [
  'SB',
  'BB',
  'UTG',
  'MP',
  'CO',
  'BTN',
] as const;

const BET_EPS = 1e-6;

export function actionOrderForStage(stage: Stage): readonly Position[] {
  return stage === 'PREFLOP' ? PREFLOP_ACTION_ORDER : POSTFLOP_ACTION_ORDER;
}

export function maxActiveStreetBet(seats: readonly PositionState[]): number {
  return seats.reduce((max, seat) => {
    if (seat.folded) return max;
    return Math.max(max, seat.betSize);
  }, 0);
}

/** ต้องแอคชั่น: ยังไม่หมอบ และ (เจอเดิมพันที่สูงกว่า หรือยังไม่ได้แอคชั่นในสตรีท) */
export function seatNeedsToAct(
  seat: PositionState,
  maxBet: number,
): boolean {
  if (seat.folded) return false;
  if (seat.betSize + BET_EPS < maxBet) return true;
  return seat.hasActed !== true;
}

/**
 * หาเก้าอี้ถึงคิวแอคชั่น
 * @param afterSeatIndex — เริ่มค้นหาจากคนถัดไปในลำดับ (หลังคนที่เพิ่งแอคชั่น); null = เริ่มหัวคิว
 */
export function resolveActionSeat(
  seats: readonly PositionState[],
  btnSeatIndex: number,
  stage: Stage,
  afterSeatIndex: number | null = null,
): SeatIndex | null {
  const order = actionOrderForStage(stage);
  const orderedSeats = order.map((pos) =>
    findSeatForPosition(pos, btnSeatIndex),
  );
  const maxBet = maxActiveStreetBet(seats);

  let start = 0;
  if (afterSeatIndex !== null) {
    const at = orderedSeats.indexOf(afterSeatIndex as SeatIndex);
    start = at >= 0 ? at + 1 : 0;
  }

  for (let i = 0; i < orderedSeats.length; i++) {
    const seatIndex = orderedSeats[(start + i) % orderedSeats.length];
    if (seatNeedsToAct(seats[seatIndex], maxBet)) {
      return seatIndex;
    }
  }
  return null;
}

/** ตำแหน่งแรกที่ต้องแอคชั่นเมื่อเปิดสตรีทใหม่ / แฮนด์ใหม่ */
export function openingActionSeat(
  seats: readonly PositionState[],
  btnSeatIndex: number,
  stage: Stage,
): SeatIndex {
  return (
    resolveActionSeat(seats, btnSeatIndex, stage, null) ??
    findSeatForPosition(stage === 'PREFLOP' ? 'UTG' : 'SB', btnSeatIndex)
  );
}
