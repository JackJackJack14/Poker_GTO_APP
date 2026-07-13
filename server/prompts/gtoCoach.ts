import type { GameState } from '../types';

export const GTO_SYSTEM_PROMPT = `คุณคือ GTO Coach ผู้เชี่ยวชาญโป๊กเกอร์ Texas Hold'em แบบ 6-Max Cash Game
หน้าที่ของคุณคือวิเคราะห์สถานการณ์และให้คำแนะนำตามหลัก Game Theory Optimal (GTO)

กฎสำคัญ:
1. ตอบเป็นภาษาไทยเท่านั้น ใน fields advice และ explanation
2. อธิบายเหตุผลเชิงกลยุทธ์โดยอ้างอิง EV (Expected Value), Pot Odds, MDF (Minimum Defense Frequency), และ Range ของตำแหน่ง
3. equity เป็นตัวเลข 0–100 (เปอร์เซ็นต์ equity โดยประมาณของ Hero)
4. suggestedActions ต้องมี action ที่เป็นไปได้: CHECK, FOLD, CALL, RAISE
5. ถ้าแนะนำ RAISE ให้ระบุ size เป็นหน่วย BB (Big Blind)
6. ถ้ามี mixed strategy ให้ระบุ frequency 0–1 ใน suggestedActions
7. ตอบเป็น JSON เท่านั้น ตาม schema ที่กำหนด ห้ามมีข้อความนอก JSON`;

export function buildUserPrompt(gameState: GameState): string {
  const bb = gameState.bigBlind ?? 1;
  const activePositions = Object.entries(gameState.positions)
    .filter(([, state]) => !state.folded)
    .map(
      ([pos, state]) =>
        `${pos}: stack=${state.stack}BB, bet=${state.betSize}BB${state.folded ? ' (folded)' : ''}`,
    )
    .join('\n');

  const board =
    gameState.boardCards.length > 0
      ? gameState.boardCards.join(', ')
      : '(ยังไม่มี)';

  return `วิเคราะห์สถานการณ์โป๊กเกอร์ต่อไปนี้และให้คำแนะนำ GTO:

## ข้อมูลเกม
- Street: ${gameState.stage}
- Hero Position: ${gameState.heroPosition}
- Hero Cards: ${gameState.heroCards.join(', ')}
- Board: ${board}
- Pot: ${gameState.pot}BB
- Big Blind: ${bb}BB

## สถานะผู้เล่น (หน่วย BB)
${activePositions}

## คำถาม
Hero ควรทำอะไรในสถานการณ์นี้? ให้ equity โดยประมาณ, คำแนะนำ, อธิบายเชิงกลยุทธ์ (EV, Pot Odds, MDF, Range), และ suggestedActions`;
}
