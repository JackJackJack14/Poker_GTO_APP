/** Windows dev: แก้ SSL ก่อนโหลด Google SDK */
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';

import { GoogleGenAI } from '@google/genai';
import type { GameState, GtoResponse } from '../types';
import {
  assessRakeTrap,
  buildUserPrompt,
  GTO_SYSTEM_PROMPT,
  normalizeGtoText,
  parseEquityFromText,
} from '../prompts/gtoCoach';

let aiClient: GoogleGenAI | null = null;
let cachedApiKey: string | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }
  if (!aiClient || cachedApiKey !== apiKey) {
    aiClient = new GoogleGenAI({ apiKey });
    cachedApiKey = apiKey;
  }
  return aiClient;
}

function isRetryableError(message: string): boolean {
  return (
    message.includes('fetch failed') ||
    message.includes('ENOTFOUND') ||
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT') ||
    message.includes('socket hang up')
  );
}

async function callGemini(userPrompt: string) {
  const ai = getClient();
  return ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: userPrompt,
    config: {
      systemInstruction: GTO_SYSTEM_PROMPT,
      temperature: 0.1,
      maxOutputTokens: 512,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
}

export async function analyzeGameState(
  gameState: GameState,
): Promise<GtoResponse> {
  const userPrompt = buildUserPrompt(gameState);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await callGemini(userPrompt);
      const raw = response.text?.trim();

      if (!raw) {
        throw new Error('Empty response from Gemini API');
      }

      const text = normalizeGtoText(raw, gameState);
      const equity = parseEquityFromText(text);
      const rakeTrap = assessRakeTrap(gameState, text, equity);

      return {
        equity,
        text,
        rakeTrapWarning: rakeTrap.warning,
        rakeTrapMessage: rakeTrap.message || undefined,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      lastError = error instanceof Error ? error : new Error(detail);

      if (attempt === 0 && isRetryableError(detail)) {
        aiClient = null;
        cachedApiKey = null;
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      if (isRetryableError(detail)) {
        throw new Error(
          'เชื่อมต่อ Gemini API ไม่ได้ — ตรวจสอบอินเทอร์เน็ต และ GEMINI_API_KEY ใน server/.env',
        );
      }
      if (detail.includes('API key') || detail.includes('401') || detail.includes('403')) {
        throw new Error(
          'GEMINI_API_KEY ไม่ถูกต้องหรือหมดอายุ — สร้างคีย์ใหม่ที่ https://aistudio.google.com/apikey',
        );
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('Gemini API failed after retries');
}
