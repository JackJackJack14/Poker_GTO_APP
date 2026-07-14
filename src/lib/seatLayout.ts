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

/**
 * พิกัดเก้าอี้กายภาพคงที่ 6-Max (เมื่อ BTN อยู่ seat 0)
 * 0 BTN ล่างกลาง · 1 SB ซ้ายล่าง · 2 BB ซ้ายบน · 3 UTG บนกลาง · 4 MP ขวาบน · 5 CO ขวาล่าง
 */
export const PHYSICAL_SEAT_LAYOUT: readonly CSSProperties[] = [
  // 0 — BTN / Hero: ด้านล่างตรงกลาง
  { left: '50%', bottom: '0%', top: 'auto', right: 'auto', transform: 'translateX(-50%)' },
  // 1 — SB: ด้านซ้ายล่าง
  { left: '1%', bottom: '18%', top: 'auto', right: 'auto', transform: 'none' },
  // 2 — BB: ด้านซ้ายบน
  { left: '1%', top: '14%', bottom: 'auto', right: 'auto', transform: 'none' },
  // 3 — UTG: ด้านบนตรงกลาง
  { left: '50%', top: '0%', bottom: 'auto', right: 'auto', transform: 'translateX(-50%)' },
  // 4 — MP: ด้านขวาบน
  { right: '1%', top: '14%', bottom: 'auto', left: 'auto', transform: 'none' },
  // 5 — CO: ด้านขวาล่าง
  { right: '1%', bottom: '18%', top: 'auto', left: 'auto', transform: 'none' },
];

/**
 * Street bet badges บน felt — เยื้องจากเก้าอี้เข้าหาศูนย์กลางโต๊ะ
 * (พิกัดสัมพัทธ์กับ wrapper เดียวกับเก้าอี้)
 */
export const STREET_BET_BADGE_LAYOUT: readonly CSSProperties[] = [
  // 0 BTN — เหนือเก้าอี้เข้าหาพ็อต
  { left: '50%', bottom: '23%', top: 'auto', right: 'auto', transform: 'translateX(-50%)' },
  // 1 SB — ขวาเยื้องเข้ากลาง
  { left: '20%', bottom: '32%', top: 'auto', right: 'auto', transform: 'none' },
  // 2 BB — ขวาเยื้องเข้ากลาง
  { left: '20%', top: '28%', bottom: 'auto', right: 'auto', transform: 'none' },
  // 3 UTG — ใต้เก้าอี้เข้าหาพ็อต
  { left: '50%', top: '21%', bottom: 'auto', right: 'auto', transform: 'translateX(-50%)' },
  // 4 MP — ซ้ายเยื้องเข้ากลาง
  { right: '20%', top: '28%', bottom: 'auto', left: 'auto', transform: 'none' },
  // 5 CO — ซ้ายเยื้องเข้ากลาง
  { right: '20%', bottom: '32%', top: 'auto', left: 'auto', transform: 'none' },
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
