import type { Card, GameState, Position } from '../types';
import { POSITIONS } from '../types';
import {
  computeBetContext,
  detectDrawTags,
  hasStrongDraw,
} from '../../shared/lib/betContext';

export const GTO_OUTPUT_TEMPLATE = `⚡ การตัดสินใจ GTO: [Action เช่น Raise 3BB / Fold / Call]
📈 Equity ของเรา vs Range: [52%]
📊 Pot Odds & MDF: [ใช้ค่าจาก PotOddsCalc ห้าม N/A]
⚠️ คำเตือนเรื่อง Rake: [1 ประโยคไทย]
💡 เหตุผลหลัก: [1 ประโยคไทย ห้ามจิตวิทยา]`;

export const GTO_SYSTEM_PROMPT = `คุณคือ GTO Coach โป๊กเกอร์ 6-Max Microstakes $0.02/$0.04 สภาพ High Rake แนว TAG + Exploitative

กฎตอบ (เด็ดขาด):
- ภาษาไทย 100% (ยกเว้นชื่อ Action: Fold/Call/Raise/Check/3-Bet)
- Plain Text เท่านั้น ห้าม Markdown (# * **)
- ตอบเฉพาะ 5 บรรทัด template ไม่มีคำนำ/สรุป
- คำสั้นสุด Low Latency รวมไม่เกิน 60 คำ

กฎ Equity (เด็ดขาด):
- ห้าม N/A ในบรรทัด Equity ทุก Street รวม Preflop
- ประเมิน Range + Draw Equity (Outs) เทียบ Range คู่ต่อสู้ 6-Max
- บรรทัด Equity = ตัวเลข% เท่านั้น เช่น 52%

กฎ Pot Odds (เด็ดขาด):
- ใช้ค่า PotOddsCalc จาก user prompt เป็นหลัก
- ห้าม N/A ในบรรทัด Pot Odds & MDF — คัดลอกหรือย่อจาก PotOddsCalc
- ระบุ % equity ที่ต้องมีเมื่อต้อง call

Draw & Implied Odds (เด็ดขาด):
- แฮนด์มี Gutshot/Flush Draw/Nut Draw มี Outs ชนะ pot — ห้ามสรุปว่า "ไม่มีโอกาสชนะ" หรือ "แพ้แน่นอน"
- Nut Gutshot (เช่น บอร์ด K-Q-T ต้องการ J สำหรับ Broadway) บน Microstakes มี Implied Odds สูงมาก — Villain มัก stack off เมื่อเราติดนัท
- Flop/Turn: หาก PotOddsCalc เอื้อ (ราคา call ไม่แพง) หรือ Villain ไม่ได้เบทใหญ่เกินไป ห้ามแนะนำ Fold ทันทีกับ Nut Draw / Strong Draw
- นับ Equity จาก Outs + Implied Odds ไม่ใช่แค่ made hand ปัจจุบัน

Rake-Trap Logic (Preflop/Marginal เท่านั้น):
- ประเมิน EV แฮนด์ suited connector/gapper และแฮนด์ Marginal EV อื่น
- หากกำไรคาดหวัง < ค่าต๋งใน pot เล็ก $0.02/$0.04 ห้ามแนะนำ Call
- เปลี่ยน Call → Fold หรือ 3-Bet (semi-bluff) ทันที
- ไม่ใช้ Rake-Trap กับ Strong Draw บน Flop/Turn

Node Locking / Exploitative Mode:
- อ่าน Opponent Tags จาก user prompt
- Calling Station: Value Bet ใหญ่ขึ้น, ตัด Bluff, ขยาย thin value — และ implied odds สูงขึ้นเมื่อติด
- Tight-Fold/Nit: เพิ่ม Bluff/Steal, ลด value บางจุด
- ผสมหลายคน: ล็อก node ตาม Villain หลักที่ยังอยู่ใน pot

${GTO_OUTPUT_TEMPLATE}`;

const RANK_VALUES: Record<string, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
};

function parseCard(card: Card): { rank: number; suit: string } {
  const rankStr = card.slice(0, -1);
  const rank = RANK_VALUES[rankStr] ?? Number(rankStr);
  return { rank, suit: card.slice(-1) };
}

/** แฮนด์ suited marginal (คาบลูก/ดอก หรือ suited weak) */
export function isMarginalSuitedHand(cards: [Card, Card]): boolean {
  const [a, b] = cards.map(parseCard);
  if (a.suit !== b.suit) return false;
  const high = Math.max(a.rank, b.rank);
  const low = Math.min(a.rank, b.rank);
  const gap = high - low;
  if (high <= 11 && gap <= 3) return true;
  if (high <= 9) return true;
  return false;
}

export function buildOpponentTendencies(gameState: GameState): string {
  const parts: string[] = [];
  for (const pos of POSITIONS) {
    if (pos === gameState.heroPosition) continue;
    const s = gameState.positions[pos];
    if (!s || s.folded) continue;
    const tags: string[] = [];
    if (s.station) tags.push('Station');
    if (s.tight) tags.push('Tight');
    if (tags.length) parts.push(`${pos}:${tags.join('+')}`);
  }
  return parts.length ? parts.join(' ') : 'none';
}

function resolveBetContext(gameState: GameState) {
  return gameState.betContext ?? computeBetContext(gameState);
}

export function buildUserPrompt(gameState: GameState): string {
  const bb = gameState.bigBlind ?? 1;
  const betCtx = resolveBetContext(gameState);
  const drawTags = detectDrawTags(gameState.heroCards, gameState.boardCards);

  const seats = POSITIONS.map((pos) => {
    const s = gameState.positions[pos];
    if (!s || s.folded) return null;
    const tags =
      pos !== gameState.heroPosition
        ? `${s.station ? 'S' : ''}${s.tight ? 'T' : ''}`
        : '';
    return `${pos}:stk${s.stack}/bet${s.betSize}${tags ? `[${tags}]` : ''}`;
  })
    .filter(Boolean)
    .join(' ');

  const board =
    gameState.boardCards.length > 0 ? gameState.boardCards.join('') : '-';
  const villains = buildOpponentTendencies(gameState);
  const marginal = isMarginalSuitedHand(gameState.heroCards)
    ? 'marginal-suited'
    : '';
  const draw = drawTags.length ? drawTags.join('+') : 'none';
  const implied =
    drawTags.includes('nut-gutshot') || drawTags.includes('nut-flush-draw')
      ? 'high-implied'
      : drawTags.includes('has-draw')
        ? 'implied-ok'
        : 'std';

  const villainBets = POSITIONS.filter(
    (p) => p !== gameState.heroPosition && !gameState.positions[p].folded,
  )
    .map((p) => `${p}bet${gameState.positions[p].betSize}`)
    .join(',');

  return `${gameState.stage}|Hero:${gameState.heroPosition}|${gameState.heroCards.join('')}|Board:${board}|Pot:${gameState.pot}BB|BB:${bb}
Seats:${seats}
VillainBets:${villainBets || 'none'}
BetCtx:toCall=${betCtx.toCall}BB|heroBet=${betCtx.heroBetSize}BB|maxBet=${betCtx.maxStreetBet}BB|facing=${betCtx.facingBetSize}BB
PotOddsCalc:${betCtx.potOddsLine}
Draw:${draw}|Implied:${implied}|Villains:${villains}|Hand:${marginal || 'std'}
ใช้ PotOddsCalc ในบรรทัด Pot Odds. Draw=มี outs ห้ามบอกไม่มีโอกาสชนะ. 5 lines Thai Plain Text. Equity=XX% only.`;
}

const FIELD_PATTERNS: { key: string; regex: RegExp }[] = [
  { key: 'action', regex: /⚡\s*การตัดสินใจ GTO:\s*(.+)/i },
  { key: 'equity', regex: /📈\s*Equity ของเรา vs Range:\s*(.+)/i },
  { key: 'potOdds', regex: /📊\s*Pot Odds & MDF:\s*(.+)/i },
  { key: 'rake', regex: /⚠️\s*คำเตือนเรื่อง Rake:\s*(.+)/i },
  { key: 'reason', regex: /💡\s*เหตุผลหลัก:\s*(.+)/i },
];

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)_/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function sanitizeEquityPercent(raw: string | undefined, fallback = 42): string {
  if (!raw || /n\/a/i.test(raw.trim())) return `${fallback}%`;
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return `${fallback}%`;
  const value = Math.min(100, Math.max(1, Math.round(Number(match[1]))));
  return `${value}%`;
}

function sanitizePotOdds(
  raw: string | undefined,
  fallback: string,
): string {
  if (!raw || /^n\/a$/i.test(raw.trim()) || /n\/a/i.test(raw)) {
    return fallback;
  }
  return raw.trim();
}

export function normalizeGtoText(raw: string, gameState: GameState): string {
  const text = stripMarkdown(raw.trim());
  const values: Record<string, string> = {};
  const betCtx = resolveBetContext(gameState);

  for (const { key, regex } of FIELD_PATTERNS) {
    const match = text.match(regex);
    if (match) values[key] = match[1].trim();
  }

  if (!values.equity) {
    const eq = text.match(/Equity[^0-9%]*(\d+(?:\.\d+)?)\s*%/i);
    if (eq) values.equity = `${eq[1]}%`;
  }

  if (!values.action) {
    const act = text.match(/\b(Fold|Call|Check|Raise|3-?Bet|4-?Bet)\b/i);
    if (act) values.action = act[1];
  }

  const equity = sanitizeEquityPercent(values.equity);
  const potOdds = sanitizePotOdds(values.potOdds, betCtx.potOddsLine);
  const isFold = /fold/i.test(values.action ?? '');
  const strongDraw = hasStrongDraw(gameState);

  const defaults = {
    action: strongDraw && gameState.stage !== 'PREFLOP' ? 'Call' : 'Fold',
    rake:
      strongDraw && gameState.stage !== 'PREFLOP'
        ? 'Draw มี implied odds — Rake ไม่ใช่เหตุผล fold บน Flop'
        : 'Rake สูง $0.02/$0.04 — หลีกเลี่ยง Call marginal',
    reason: strongDraw
      ? 'Nut/Strong Draw มี implied odds สูงบน Microstakes'
      : isFold
        ? 'แฮนด์ marginal OOP ไม่คุ้มต๋ง'
        : 'เล่น TAG ตามตำแหน่งและ pot odds',
  };

  return `⚡ การตัดสินใจ GTO: ${values.action ?? defaults.action}
📈 Equity ของเรา vs Range: ${equity}
📊 Pot Odds & MDF: ${potOdds}
⚠️ คำเตือนเรื่อง Rake: ${values.rake ?? defaults.rake}
💡 เหตุผลหลัก: ${values.reason ?? defaults.reason}`;
}

export function parseEquityFromText(text: string): number {
  const match = text.match(
    /📈\s*Equity ของเรา vs Range:\s*(\d+(?:\.\d+)?)\s*%/i,
  );
  if (match) {
    return Math.min(100, Math.max(1, Math.round(Number(match[1]))));
  }
  return 42;
}

export interface RakeTrapAssessment {
  warning: boolean;
  message: string;
}

export function assessRakeTrap(
  gameState: GameState,
  text: string,
  equity: number,
): RakeTrapAssessment {
  if (gameState.stage !== 'PREFLOP' && hasStrongDraw(gameState)) {
    return { warning: false, message: '' };
  }

  const action = text.match(/การตัดสินใจ GTO:\s*(.+)/i)?.[1] ?? '';
  const rakeLine = text.match(/คำเตือนเรื่อง Rake:\s*(.+)/i)?.[1] ?? '';
  const suggestsCall = /\bCall\b/i.test(action) && !/\b3-?Bet\b/i.test(action);
  const marginalHand = isMarginalSuitedHand(gameState.heroCards);
  const smallPot = gameState.pot <= 12;
  const lowEquity = equity < 52;
  const rakeTrapKeywords =
    /rake.?trap|กับดัก|marginal|ไม่คุ้ม|ติดต๋ง|ห้าม call/i.test(
      `${rakeLine} ${text}`,
    );

  const warning =
    rakeTrapKeywords ||
    (marginalHand && suggestsCall && smallPot) ||
    (suggestsCall && lowEquity && smallPot && gameState.stage === 'PREFLOP');

  return {
    warning,
    message: warning
      ? 'Rake-Trap: แฮนด์ Marginal EV — Call ไม่คุ้มค่าต๋ง $0.02/$0.04 พิจารณา Fold หรือ 3-Bet'
      : '',
  };
}

// Re-export for tests
export { computeBetContext, detectDrawTags, hasStrongDraw };
