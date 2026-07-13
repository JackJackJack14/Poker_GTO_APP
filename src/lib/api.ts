import type { AnalyzeResponse, GameState } from '../types';

/** Backend API base — ว่างไว้ใช้ Vite proxy, หรือชี้ตรงไปที่ Backend (เช่น http://127.0.0.1:3001) */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3001').replace(
  /\/$/,
  '',
);

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function analyzeHand(gameState: GameState): Promise<AnalyzeResponse> {
  let res: Response;

  try {
    res = await fetch(apiUrl('/api/analyze'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameState }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch failed';
    throw new Error(
      `เชื่อมต่อ API ไม่ได้ (${message}) — ตรวจสอบว่า Backend รันที่ ${API_BASE} และ GEMINI_API_KEY ถูกต้อง`,
    );
  }

  const data = (await res.json()) as AnalyzeResponse;

  if (!res.ok || !data.success) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }

  return data;
}
