/** Effective stack เริ่มต้นของทุกเก้าอี้หน้าโต๊ะเทรนนิ่ง */
export const STARTING_STACK_BB = 100;

/** ชิปที่ Hero เหลือจริง: 100 − totalInvestedAcrossHand */
export function remainingHeroStack(
  totalInvestedAcrossHand: number,
  startingStackBb = STARTING_STACK_BB,
): number {
  const left = startingStackBb - Math.max(0, totalInvestedAcrossHand);
  return Math.max(0, Math.round(left * 100) / 100);
}

function formatBb(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * ถ้าข้อความแนะนำ "ใส่เพิ่มอีก X" เกิน remainingStack → เปลี่ยนเป็น All-in
 * (แก้เฉพาะข้อความฝั่ง UI — ไม่แตะ engine)
 */
export function applyEffectiveStackCapToAdvice(
  text: string,
  totalInvestedAcrossHand: number,
  startingStackBb = STARTING_STACK_BB,
): string {
  const remaining = remainingHeroStack(
    totalInvestedAcrossHand,
    startingStackBb,
  );
  const addMatch = text.match(/ใส่เพิ่มอีก\s*([\d.]+)\s*BB/i);
  if (!addMatch) return text;

  const addMore = Number(addMatch[1]);
  if (!Number.isFinite(addMore) || addMore <= remaining + 1e-9) {
    return text;
  }

  const capped =
    `⚡ การตัดสินใจ GTO: All-in [ใส่เพิ่มอีก ${formatBb(remaining)} BB]`;

  return text.replace(/^(⚡\s*)?การตัดสินใจ GTO:\s*.+$/im, capped);
}
