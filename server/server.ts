import cors from 'cors';
import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { analyzeGameState } from './services/gemini';
import type { AnalyzeRequest, AnalyzeResponse, GameState } from './types';
import { POSITIONS, STAGES } from './types';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function isValidGameState(body: unknown): body is GameState {
  if (!body || typeof body !== 'object') return false;

  const gs = body as GameState;

  if (!POSITIONS.includes(gs.heroPosition)) return false;
  if (!STAGES.includes(gs.stage)) return false;
  if (!Array.isArray(gs.heroCards) || gs.heroCards.length !== 2) return false;
  if (!Array.isArray(gs.boardCards) || gs.boardCards.length > 5) return false;
  if (typeof gs.pot !== 'number' || gs.pot < 0) return false;
  if (!gs.positions || typeof gs.positions !== 'object') return false;

  for (const pos of POSITIONS) {
    const state = gs.positions[pos];
    if (!state) return false;
    if (typeof state.stack !== 'number' || state.stack < 0) return false;
    if (typeof state.betSize !== 'number' || state.betSize < 0) return false;
    if (typeof state.folded !== 'boolean') return false;
  }

  return true;
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'poker-gto-advisor' });
});

app.post('/api/analyze', async (req: Request, res: Response<AnalyzeResponse>) => {
  try {
    const { gameState } = req.body as AnalyzeRequest;

    if (!isValidGameState(gameState)) {
      res.status(400).json({
        success: false,
        error:
          'Invalid gameState. Required: heroPosition, stage, positions (6 seats), heroCards (2), boardCards (0-5), pot.',
      });
      return;
    }

    const data = await analyzeGameState(gameState);

    res.json({ success: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error';
    console.error('[POST /api/analyze]', message);
    res.status(500).json({ success: false, error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Poker GTO Advisor API running on http://localhost:${PORT}`);
});
