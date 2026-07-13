import type { CSSProperties } from 'react';
import type { Position, PositionState } from '../types';

export const SEAT_COUNT = 6;

/** ลำดับตำแหน่งตามเข็มนาฬิกาจาก BTN */
export const CLOCKWISE_FROM_BTN: readonly Position[] = [
  'BTN',
  'SB',
  'BB',
  'UTG',
  'MP',
  'CO',
] as const;

export type SeatIndex = 0 | 1 | 2 | 3 | 4 | 5;

/** ตำแหน่งเก้าอี้บนโต๊ะ (เข็มนาฬิกา เริ่มจาก BTN ด้านล่าง) */
export const PHYSICAL_SEAT_LAYOUT: readonly CSSProperties[] = [
  { left: '50%', top: '92%' }, // 0 — BTN default
  { left: '12%', top: '58%' }, // 1 — SB
  { left: '8%', top: '22%' }, // 2 — BB
  { left: '50%', top: '6%' }, // 3 — UTG
  { left: '88%', top: '22%' }, // 4 — MP
  { left: '92%', top: '58%' }, // 5 — CO
];

export function getPositionLabel(
  seatIndex: number,
  btnSeatIndex: number,
): Position {
  const offset = (((seatIndex - btnSeatIndex) % SEAT_COUNT) + SEAT_COUNT) % SEAT_COUNT;
  return CLOCKWISE_FROM_BTN[offset];
}

export function buildPositionsMap(
  seats: readonly PositionState[],
  btnSeatIndex: number,
): Record<Position, PositionState> {
  const map = {} as Record<Position, PositionState>;
  for (let seatIndex = 0; seatIndex < SEAT_COUNT; seatIndex++) {
    const label = getPositionLabel(seatIndex, btnSeatIndex);
    map[label] = seats[seatIndex];
  }
  return map;
}

export function getPositionLineup(
  btnSeatIndex: number,
): { seatIndex: SeatIndex; position: Position }[] {
  return Array.from({ length: SEAT_COUNT }, (_, seatIndex) => ({
    seatIndex: seatIndex as SeatIndex,
    position: getPositionLabel(seatIndex, btnSeatIndex),
  }));
}

export function findSeatForPosition(
  position: Position,
  btnSeatIndex: number,
): SeatIndex {
  for (let seatIndex = 0; seatIndex < SEAT_COUNT; seatIndex++) {
    if (getPositionLabel(seatIndex, btnSeatIndex) === position) {
      return seatIndex as SeatIndex;
    }
  }
  return 0;
}
