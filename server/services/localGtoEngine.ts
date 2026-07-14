/**
 * Local GTO Engine — Street Router + Global Safety Gatekeeper
 *
 * Separation of Concerns:
 * - PREFLOP           → PreflopEngine
 * - FLOP / TURN / RIVER → PostflopMathEngine
 *
 * Final Response Formatter ผ่าน Safety Gatekeeper เสมอ:
 * แอคชั่นที่ไม่ใช่ Fold แต่ EV < 0 → บังคับ Fold / EV = 0.00 BB
 */
import type { GameState, GtoResponse, Position } from '../types';
import { PreflopEngine, inferPriorPreflopAction } from './preflopEngine';
import {
  PostflopMathEngine,
  analyzeOpponentRange,
  classifyBoardTexture,
  heroSizingPercent,
  type BoardTexture,
  type OpponentRangeAnalysis,
} from './postflopMathEngine';
import {
  calcAlpha,
  calcExpectedValue,
  calcMdfPercent,
  calcPotOddsPercent,
  calcRaiseExpectedValue,
  formatRaiseDecision,
  workingPot,
} from './engineShared';
import {
  applySafetyGatekeeper,
  extractGtoDecision,
  isFoldDecision,
} from './safetyGatekeeper';

/**
 * วิเคราะห์สถานการณ์ + ผ่าน Global Safety Gatekeeper ก่อนส่ง UI
 */
export function analyzeGameState(gameState: GameState): GtoResponse {
  const raw =
    gameState.stage === 'PREFLOP'
      ? PreflopEngine.analyze(gameState)
      : PostflopMathEngine.analyze(gameState);

  return applySafetyGatekeeper(raw);
}

export {
  applySafetyGatekeeper,
  extractGtoDecision,
  isFoldDecision,
  calcAlpha,
  calcExpectedValue,
  calcMdfPercent,
  calcPotOddsPercent,
  calcRaiseExpectedValue,
  formatRaiseDecision,
  inferPriorPreflopAction,
  analyzeOpponentRange,
  classifyBoardTexture,
  heroSizingPercent,
  workingPot,
  PreflopEngine,
  PostflopMathEngine,
};

export type { BoardTexture, OpponentRangeAnalysis, Position };
