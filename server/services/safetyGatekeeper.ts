/**
 * Global Safety Gatekeeper — ตาข่ายดักแอคชั่น -EV ก่อนส่ง UI
 *
 * กฎเด็ดขาด: ถ้าไม่ใช่ Fold แต่ EV < 0 → บังคับ Fold และ EV = 0.00 BB
 */
import type { GtoResponse } from '../types';

const DECISION_PREFIX = '⚡ การตัดสินใจ GTO:';
const EV_PREFIX = '💰 EV สุทธิ:';
const REASON_PREFIX = '💡 เหตุผล:';

export function extractGtoDecision(text: string): string {
  const line = text.split('\n').find((l) => l.startsWith(DECISION_PREFIX));
  if (!line) return '';
  return line.slice(DECISION_PREFIX.length).trim();
}

export function isFoldDecision(decision: string): boolean {
  const d = decision.trim().toLowerCase();
  return d === 'fold' || d.startsWith('fold ');
}

/**
 * Guard Clause สุดท้ายก่อนเรนเดอร์ UI
 * — ทำลายคำสั่ง Call/Raise/Bet ที่ EV < 0 ทันที
 */
export function applySafetyGatekeeper(result: GtoResponse): GtoResponse {
  const decision = extractGtoDecision(result.text);
  const isFold = isFoldDecision(decision);
  const negativeEv = result.ev < -1e-9;

  if (isFold || !negativeEv) {
    // Fold อยู่แล้ว หรือ EV ≥ 0 — ปล่อยผ่าน
    // บังคับ Fold → EV เป็น 0 เสมอ (กันเศษติดลบ)
    if (isFold && Math.abs(result.ev) > 1e-9) {
      return forceFoldResponse(result, 'Normalize Fold EV → 0.00 BB');
    }
    return result;
  }

  return forceFoldResponse(
    result,
    `บล็อกแอคชั่น -EV (${decision || 'unknown'} · EV ${result.ev.toFixed(2)})`,
  );
}

function forceFoldResponse(
  result: GtoResponse,
  detail: string,
): GtoResponse {
  const lines = result.text.split('\n').map((line) => {
    if (line.startsWith(DECISION_PREFIX)) {
      return `${DECISION_PREFIX} Fold`;
    }
    if (line.startsWith(EV_PREFIX)) {
      return `${EV_PREFIX} 0.00 BB`;
    }
    if (line.startsWith(REASON_PREFIX)) {
      return `${REASON_PREFIX} 🛡️ Safety Gatekeeper — ${detail}`;
    }
    return line;
  });

  // ถ้าไม่มีบรรทัดเหตุผลเดิม ให้เติมท้าย
  const hasReason = lines.some((l) => l.startsWith(REASON_PREFIX));
  if (!hasReason) {
    lines.push(`${REASON_PREFIX} 🛡️ Safety Gatekeeper — ${detail}`);
  }

  return {
    ...result,
    ev: 0,
    text: lines.join('\n'),
    rakeTrapWarning: true,
    rakeTrapMessage:
      'Safety Gatekeeper: -EV action blocked → Fold (EV = 0.00 BB)',
  };
}
