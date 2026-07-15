import type { PositionState, Stage } from '../types';
import { STAGES } from '../types';

const BET_EPS = 1e-6;

export type StreetCompletionResult =
  | { status: 'incomplete' }
  /** ผู้เล่นที่ยังไม่หมอบเหลือ ≤ 1 → จบแฮนด์ ห้ามเลื่อนสตรีท */
  | { status: 'hand-over' }
  /** Equalized + ทุกคนแอคชั่นครบ → เลื่อนสตรีท (หรือจบที่ River) */
  | { status: 'street-complete' };

/**
 * ตรวจว่าสตรีทเดิมพันจบหรือยัง
 * - activePlayers: ไม่หมอบ
 * - Hand over: active ≤ 1
 * - Street complete: ยอด bet ของทุกคนที่ยังอยู่ในแฮนด์เท่ากันเป๊ะ และทุกคนแอคชั่นแล้ว
 */
export function checkStreetCompletion(
  seats: readonly PositionState[],
): StreetCompletionResult {
  const active = seats.filter((s) => !s.folded);

  if (active.length <= 1) {
    return { status: 'hand-over' };
  }

  const target = active[0].betSize;
  const equalized = active.every(
    (s) => Math.abs(s.betSize - target) < BET_EPS,
  );
  const allActed = active.every((s) => s.hasActed === true);

  if (equalized && allActed) {
    return { status: 'street-complete' };
  }

  return { status: 'incomplete' };
}

export function nextStreet(stage: Stage): Stage | null {
  const idx = STAGES.indexOf(stage);
  if (idx < 0 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1];
}

/** รวมยอด street bets จากอาร์เรย์เก้าอี้ */
export function sumSeatStreetBets(seats: readonly PositionState[]): number {
  return seats.reduce((sum, s) => sum + s.betSize, 0);
}

/**
 * เงินทอน (Uncalled Bet) บนสตรีทปัจจุบัน:
 * ยอดที่ผู้เล่นสูงสุดเดิมพันเกินยอดสูงสุดอันดับ 2 — ไม่มีคนคอลส่วนต่างนี้
 */
export function calcUncalledStreetBet(
  seats: readonly PositionState[],
): number {
  let maxBet = 0;
  let second = 0;
  let maxCount = 0;
  for (const seat of seats) {
    const b = seat.betSize;
    if (b > maxBet + BET_EPS) {
      second = maxBet;
      maxBet = b;
      maxCount = 1;
    } else if (Math.abs(b - maxBet) <= BET_EPS) {
      maxCount += 1;
    } else if (b > second + BET_EPS) {
      second = b;
    }
  }
  if (maxBet <= BET_EPS || maxCount >= 2) return 0;
  return Math.round(Math.max(0, maxBet - second) * 100) / 100;
}

/**
 * ใช้แอคชั่นกับเก้าอี้ + ติดตาม hasActed
 * Raise (ยอดเกิน max ของคนอื่น) → รีเซ็ต hasActed ของคู่ต่อสู้ที่ยังไม่หมอบ
 */
export function applySeatStreetAction(
  seats: readonly PositionState[],
  seatIndex: number,
  patch: Partial<PositionState>,
): PositionState[] {
  const isStreetAction =
    patch.folded !== undefined || patch.betSize !== undefined;

  if (!isStreetAction) {
    return seats.map((seat, i) =>
      i === seatIndex ? { ...seat, ...patch } : seat,
    );
  }

  let next = seats.map((seat, i) => {
    if (i !== seatIndex) return seat;
    const merged: PositionState = { ...seat, ...patch };
    if (typeof patch.betSize === 'number') {
      const delta = Math.max(0, patch.betSize - seat.betSize);
      merged.investedHand = (seat.investedHand ?? 0) + delta;
    }
    if (patch.folded === true) {
      merged.hasActed = true;
    } else if (patch.folded === false) {
      merged.hasActed = false;
    } else if (patch.betSize !== undefined) {
      merged.hasActed = true;
    }
    return merged;
  });

  if (typeof patch.betSize === 'number' && patch.folded !== true) {
    const maxOthers = seats.reduce((max, seat, i) => {
      if (i === seatIndex || seat.folded) return max;
      return Math.max(max, seat.betSize);
    }, 0);

    if (patch.betSize > maxOthers + BET_EPS) {
      next = next.map((seat, i) => {
        if (i === seatIndex) return { ...seat, hasActed: true };
        if (seat.folded) return seat;
        return { ...seat, hasActed: false };
      });
    }
  }

  return next;
}

export function clearStreetBetsAndActs(
  seats: readonly PositionState[],
): PositionState[] {
  return seats.map((seat) => ({
    ...seat,
    betSize: 0,
    hasActed: false,
    // ห้ามรีเซ็ต investedHand — สะสม Prefop→River จนจบแฮนด์
    investedHand: seat.investedHand ?? 0,
  }));
}

/** ฝังยอดลงทุนสะสมทั้งแฮนด์ลงทุกเก้าอี้ (ไม่ให้หลุดตอน remap) */
export function stampInvestedHand(
  seats: readonly PositionState[],
  investedBySeat: readonly number[],
): PositionState[] {
  return seats.map((seat, i) => ({
    ...seat,
    investedHand: Math.max(0, investedBySeat[i] ?? seat.investedHand ?? 0),
  }));
}
