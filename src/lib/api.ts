import type { AnalyzeResponse, GameState } from '../types';

export async function analyzeHand(gameState: GameState): Promise<AnalyzeResponse> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameState }),
  });

  const data = (await res.json()) as AnalyzeResponse;

  if (!res.ok || !data.success) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }

  return data;
}
