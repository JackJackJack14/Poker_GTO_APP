import type { AnalyzeResponse, GameState } from '../types';

/** Backend API base — ว่างไว้ใช้ Vite proxy, หรือชี้ตรงไปที่ Backend (เช่น http://127.0.0.1:3001) */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3001').replace(
  /\/$/,
  '',
);

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/** Prevent overlapping POSTs if UI somehow double-fires */
let analyzeRequestLock = false;

export async function analyzeHand(gameState: GameState): Promise<AnalyzeResponse> {
  if (analyzeRequestLock) {
    throw new Error('กำลังวิเคราะห์อยู่แล้ว — กรุณารอผลก่อนกดซ้ำ');
  }

  analyzeRequestLock = true;
  let res: Response;

  try {
    res = await fetch(apiUrl('/api/analyze'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameState }),
    });
  } catch (err) {
    analyzeRequestLock = false;
    const message = err instanceof Error ? err.message : 'fetch failed';
    throw new Error(
      `เชื่อมต่อ API ไม่ได้ (${message}) — ตรวจสอบว่า Backend รันที่ ${API_BASE} และ GEMINI_API_KEY ถูกต้อง`,
    );
  }

  try {
    const data = (await res.json()) as AnalyzeResponse;

    if (!res.ok || !data.success) {
      throw new Error(data.error ?? `Request failed (${res.status})`);
    }

    return data;
  } finally {
    analyzeRequestLock = false;
  }
}

/** ผลจำลอง 50k แฮนด์ (sandbox) — ไม่แตะ LocalStorage */
export interface MonteCarloSimResult {
  handCount: number;
  winrateBb100: number;
  stdDevBb100: number;
  evPerHand: number;
  sdPerHand: number;
  finalEv: number;
  finalReal: number;
  delta: number;
  chart: {
    hands: number[];
    cumulativeEv: number[];
    cumulativeReal: number[];
  };
  sandbox: true;
}

export async function runMonteCarloSim(params?: {
  hands?: number;
  seed?: number;
}): Promise<MonteCarloSimResult> {
  let res: Response;
  try {
    res = await fetch(apiUrl('/api/simulate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hands: params?.hands ?? 50_000,
        seed: params?.seed,
        chartPoints: 500,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch failed';
    throw new Error(
      `เชื่อมต่อ Simulation API ไม่ได้ (${message}) — ตรวจ Backend ที่ ${API_BASE}`,
    );
  }

  const data = (await res.json()) as {
    success: boolean;
    data?: MonteCarloSimResult;
    error?: string;
  };

  if (!res.ok || !data.success || !data.data) {
    throw new Error(data.error ?? `Simulate failed (${res.status})`);
  }

  return data.data;
}
