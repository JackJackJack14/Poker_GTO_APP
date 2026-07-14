/** ตำแหน่งบนโต๊ะ 6-Max */
export type Position = 'UTG' | 'MP' | 'CO' | 'BTN' | 'SB' | 'BB';

/** การกระทำที่เป็นไปได้ในแต่ละ street */
export type Action = 'CHECK' | 'FOLD' | 'CALL' | 'RAISE';

/** ช่วงของมือ */
export type Stage = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER';

/** ไพ่ 1 ใบ เช่น 'As', 'Kh', 'Td' */
export type Card = string;

export const POSITIONS: readonly Position[] = [
  'UTG',
  'MP',
  'CO',
  'BTN',
  'SB',
  'BB',
] as const;

export const STAGES: readonly Stage[] = [
  'PREFLOP',
  'FLOP',
  'TURN',
  'RIVER',
] as const;

/** สถานะของผู้เล่นแต่ละตำแหน่ง */
export interface PositionState {
  stack: number;
  betSize: number;
  folded: boolean;
  /** Calling Station — คอลไม่เลิก */
  station?: boolean;
  /** Tight-Fold / Nit — หมอบบ่อย */
  tight?: boolean;
}

/** การกระทำที่แนะนำจาก GTO */
export interface SuggestedAction {
  action: Action;
  /** ขนาดเดิมพัน/raise (หน่วย: BB หรือ chips ตาม bigBlind ของเกม) */
  size?: number;
  /** ความถี่ GTO mix 0–1 */
  frequency?: number;
}

/** สถานะเกมทั้งหมดที่ส่งไปวิเคราะห์ */
export interface GameState {
  heroPosition: Position;
  stage: Stage;
  positions: Record<Position, PositionState>;
  /** ไพ่ในมือ Hero (2 ใบ) */
  heroCards: [Card, Card];
  /** ไพ่บน Board (สูงสุด 5 ใบ) */
  boardCards: Card[];
  /** เงินใน Pot */
  pot: number;
  /** ขนาด Big Blind (default 1) */
  bigBlind?: number;
  /** บริบทเดิมพันบน street ปัจจุบัน (คำนวณจาก betSize ของทุกตำแหน่ง) */
  betContext?: {
    maxStreetBet: number;
    heroBetSize: number;
    toCall: number;
    facingBetSize: number;
    potOddsPercent: number | null;
    mdfPercent: number | null;
    potOddsLine: string;
  };
}

/** ผลลัพธ์ GTO Coach — Plain Text ไทย + equity สำหรับ UI */
export interface GtoResponse {
  /** Equity โดยประมาณ 0–100 */
  equity: number;
  /**
   * EV สุทธิ (BB) จากสูตร:
   * EV = (Equity * Total Pot) - ((1 - Equity) * Call Size)
   */
  ev: number;
  /** สถานการณ์ Preflop cascading (ถ้ามี) */
  priorAction?: string;
  /** คำตอบ Plain Text (ไม่มี Markdown) */
  text: string;
  /** สถานการณ์เสี่ยง Rake-Trap */
  rakeTrapWarning: boolean;
  /** ข้อความเตือน Rake-Trap (ถ้ามี) */
  rakeTrapMessage?: string;
  /** มีการหัก Dirty Outs จาก equity */
  dirtyOutsWarning?: boolean;
  /** บรรทัดเตือน Dirty Outs แบบเต็ม (แสดงบน UI โดยตรง) */
  dirtyOutsAlert?: string;
}

/** Request body สำหรับ POST /api/analyze */
export interface AnalyzeRequest {
  gameState: GameState;
}

/** Response body จาก POST /api/analyze */
export interface AnalyzeResponse {
  success: boolean;
  data?: GtoResponse;
  error?: string;
}
