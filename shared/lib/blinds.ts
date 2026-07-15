import type { Position, PositionState } from '../types/poker.types';

/** มาตรฐาน NLHE (หน่วย BB) */
export const BIG_BLIND_BB = 1;
export const SMALL_BLIND_BB = 0.5;
/** รวมบลายด์เริ่มต้นที่ต้องอยู่ใน pot */
export const STARTING_BLINDS_TOTAL_BB = SMALL_BLIND_BB + BIG_BLIND_BB; // 1.5

export function blindAmountForPosition(
  position: Position,
  bigBlind: number = BIG_BLIND_BB,
): number {
  if (position === 'BB') return bigBlind;
  if (position === 'SB') return bigBlind * 0.5;
  return 0;
}

/**
 * เติมเงินบลายด์ตามตำแหน่งที่ derive จากปุ่ม Dealer
 * — ล้างยอดเดิมพันเก้าอี้อื่นเป็น 0 แล้วตั้ง SB/BB
 */
export function withPostedBlinds<T extends PositionState>(
  seats: readonly T[],
  getPosition: (seatIndex: number) => Position,
  bigBlind: number = BIG_BLIND_BB,
): T[] {
  const sbAmt = bigBlind * 0.5;
  const bbAmt = bigBlind;
  return seats.map((seat, seatIndex) => {
    const position = getPosition(seatIndex);
    if (position === 'SB') {
      return { ...seat, betSize: sbAmt, folded: false, investedHand: sbAmt };
    }
    if (position === 'BB') {
      return { ...seat, betSize: bbAmt, folded: false, investedHand: bbAmt };
    }
    return { ...seat, betSize: 0, investedHand: 0 };
  });
}

/**
 * Pot ที่ใช้ในสมการ Pot Odds / MDF / EV
 * ต้องรวมบลายด์เริ่มต้น ≥ 1.5 BB (หรือตาม bigBlind)
 */
export function resolveWorkingPot(params: {
  pot: number;
  bigBlind?: number;
  positions: Record<Position, { betSize: number }>;
}): number {
  const bb = params.bigBlind ?? BIG_BLIND_BB;
  const blindsFloor = bb * 1.5;
  const streetSum = (
    ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'] as const
  ).reduce((sum, pos) => sum + (params.positions[pos]?.betSize ?? 0), 0);

  // pot ที่ส่งมาควรรวม street bets แล้ว — สำรอง floor บลายด์ถ้ายังต่ำเกินไป
  const effective = Math.max(params.pot, streetSum, blindsFloor);
  return Math.round(effective * 100) / 100;
}
