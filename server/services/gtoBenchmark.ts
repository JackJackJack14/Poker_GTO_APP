/**
 * GTO Math Engine — Verification Benchmark Scenarios
 * รัน: npm run test (ในโฟลเดอร์ server)
 */
import { computeBetContext } from '../../shared/lib/betContext';
import type { GameState, GtoResponse } from '../types';
import {
  analyzeGameState,
  applySafetyGatekeeper,
  extractGtoDecision,
  isFoldDecision,
  workingPot,
} from './localGtoEngine';

export interface BenchmarkCase {
  id: string;
  name: string;
  gameState: GameState;
  /** assertions — throw ถ้าไม่ผ่าน */
  assert: (result: GtoResponse, gs: GameState) => void;
}

function buildGameState(partial: Omit<GameState, 'betContext'>): GameState {
  const betContext = computeBetContext(partial);
  return { ...partial, betContext };
}

/** แฮนด์ที่ 1: T9s facing 3-bet → Fold, EV=0, Equity ~35–40% */
export const SCENARIO_T9S_FACING_3BET: BenchmarkCase = {
  id: 'preflop-t9s-facing-3bet',
  name: 'Preflop: T9s facing 3-bet → Fold / EV 0 / Eq 35–40%',
  gameState: buildGameState({
    heroPosition: 'BTN',
    stage: 'PREFLOP',
    pot: 12,
    bigBlind: 1,
    heroCards: ['Th', '9h'],
    boardCards: [],
    positions: {
      UTG: { stack: 100, betSize: 2.5, folded: false },
      MP: { stack: 100, betSize: 0, folded: true },
      CO: { stack: 100, betSize: 0, folded: true },
      BTN: { stack: 100, betSize: 0, folded: false },
      SB: { stack: 100, betSize: 8, folded: false },
      BB: { stack: 100, betSize: 0, folded: true },
    },
  }),
  assert(result) {
    const decision = extractGtoDecision(result.text);
    if (!isFoldDecision(decision)) {
      throw new Error(`คาด Fold แต่ได้: ${decision}`);
    }
    if (Math.abs(result.ev) > 1e-9) {
      throw new Error(`คาด EV=0 แต่ได้ ${result.ev}`);
    }
    if (result.equity < 35 || result.equity > 40) {
      throw new Error(`คาด Equity 35–40% แต่ได้ ${result.equity}%`);
    }
  },
};

/** แฮนด์ที่ 2: Strong draw บน Wet board · pot รวมบลายด์ ≥ 1.5 · EV สอดคล้องแอคชั่น */
export const SCENARIO_STRONG_DRAW_WET: BenchmarkCase = {
  id: 'postflop-strong-draw-wet',
  name: 'Postflop: OESD+FD wet board facing bet · blinds≥1.5 · EV↔action',
  gameState: buildGameState({
    heroPosition: 'BTN',
    stage: 'FLOP',
    // Dead 1.5 (blinds) + street bets — workingPot ต้อง ≥ 1.5
    pot: 1.5 + 3 + 3, // blinds dead + CO bet 3 + (dead accounting simplified as total 7.5)
    bigBlind: 1,
    // Open-ended + flush draw-ish: 8h7h on 9h6h2c
    heroCards: ['8h', '7h'],
    boardCards: ['9h', '6h', '2c'],
    positions: {
      UTG: { stack: 100, betSize: 0, folded: true },
      MP: { stack: 100, betSize: 0, folded: true },
      CO: { stack: 100, betSize: 3, folded: false },
      BTN: { stack: 100, betSize: 0, folded: false },
      SB: { stack: 100, betSize: 0, folded: true },
      BB: { stack: 100, betSize: 0, folded: true },
    },
  }),
  assert(result, gs) {
    const pot = workingPot(gs);
    if (pot + 1e-9 < 1.5) {
      throw new Error(`คาด workingPot ≥ 1.5 BB (blinds) แต่ได้ ${pot}`);
    }

    const decision = extractGtoDecision(result.text);
    const fold = isFoldDecision(decision);

    if (fold) {
      if (Math.abs(result.ev) > 1e-9) {
        throw new Error(`Fold ต้อง EV=0 แต่ได้ ${result.ev}`);
      }
    } else {
      // Call / Raise / Bet ห้ามมี EV < 0 (Safety Gatekeeper)
      if (result.ev < -1e-9) {
        throw new Error(
          `แอคชั่น "${decision}" มี EV ติดลบ ${result.ev} — Gatekeeper ควรบล็อก`,
        );
      }
    }

    // EV ใน text ต้องตรงกับ result.ev
    const evLine = result.text
      .split('\n')
      .find((l) => l.startsWith('💰 EV สุทธิ:'));
    if (!evLine) throw new Error('ไม่พบบรรทัด EV สุทธิ');
    const match = evLine.match(/([+-]?\d+\.\d{2})\s*BB/);
    if (!match) throw new Error(`parse EV จากข้อความไม่ได้: ${evLine}`);
    const textEv = Number(match[1]);
    if (Math.abs(textEv - result.ev) > 0.011) {
      throw new Error(
        `EV ใน text (${textEv}) ไม่ตรง result.ev (${result.ev})`,
      );
    }
  },
};

/** แฮนด์สังเคราะห์: บังคับ Gatekeeper ตัดแอคชั่น -EV */
export const SCENARIO_GATEKEEPER_NEG_EV: BenchmarkCase = {
  id: 'gatekeeper-force-fold-neg-ev',
  name: 'Safety Gatekeeper: stub -EV Raise → บังคับ Fold / EV 0',
  gameState: buildGameState({
    heroPosition: 'BTN',
    stage: 'FLOP',
    pot: 10,
    bigBlind: 1,
    heroCards: ['As', 'Kd'],
    boardCards: ['2c', '7d', '9h'],
    positions: {
      UTG: { stack: 100, betSize: 0, folded: true },
      MP: { stack: 100, betSize: 0, folded: true },
      CO: { stack: 100, betSize: 0, folded: true },
      BTN: { stack: 100, betSize: 0, folded: false },
      SB: { stack: 100, betSize: 0, folded: true },
      BB: { stack: 100, betSize: 0, folded: true },
    },
  }),
  assert() {
    const poisoned: GtoResponse = {
      equity: 55,
      ev: -1.73,
      text: [
        '⚡ การตัดสินใจ GTO: Raise ยอดรวมพิมพ์เลข 99BB [ใส่เพิ่มอีก 50BB]',
        '📈 Equity ของเรา vs Range: 55%',
        '💰 EV สุทธิ: -1.73 BB',
        '💡 เหตุผล: buggy raise',
      ].join('\n'),
      rakeTrapWarning: false,
    };
    const gated = applySafetyGatekeeper(poisoned);
    const decision = extractGtoDecision(gated.text);
    if (!isFoldDecision(decision)) {
      throw new Error(`Gatekeeper ต้องบังคับ Fold แต่ได้: ${decision}`);
    }
    if (Math.abs(gated.ev) > 1e-9) {
      throw new Error(`Gatekeeper ต้อง EV=0 แต่ได้ ${gated.ev}`);
    }
    if (!gated.text.includes('0.00 BB')) {
      throw new Error('ข้อความ EV ต้องเป็น 0.00 BB');
    }
    if (!gated.rakeTrapWarning) {
      throw new Error('ต้องตั้ง rakeTrapWarning หลังบล็อก -EV');
    }
  },
};

export const ALL_BENCHMARKS: BenchmarkCase[] = [
  SCENARIO_T9S_FACING_3BET,
  SCENARIO_STRONG_DRAW_WET,
  SCENARIO_GATEKEEPER_NEG_EV,
];

export interface BenchmarkReport {
  passed: number;
  failed: number;
  results: {
    id: string;
    name: string;
    ok: boolean;
    error?: string;
    snapshot?: {
      decision: string;
      ev: number;
      equity: number;
      pot: number;
    };
  }[];
}

export function runGtoBenchmarks(): BenchmarkReport {
  const results: BenchmarkReport['results'] = [];
  let passed = 0;
  let failed = 0;

  for (const scenario of ALL_BENCHMARKS) {
    try {
      if (scenario.id === 'gatekeeper-force-fold-neg-ev') {
        scenario.assert(
          {
            equity: 0,
            ev: 0,
            text: '',
            rakeTrapWarning: false,
          },
          scenario.gameState,
        );
        results.push({
          id: scenario.id,
          name: scenario.name,
          ok: true,
          snapshot: {
            decision: 'Fold (forced)',
            ev: 0,
            equity: 55,
            pot: workingPot(scenario.gameState),
          },
        });
      } else {
        const result = analyzeGameState(scenario.gameState);
        scenario.assert(result, scenario.gameState);
        results.push({
          id: scenario.id,
          name: scenario.name,
          ok: true,
          snapshot: {
            decision: extractGtoDecision(result.text),
            ev: result.ev,
            equity: result.equity,
            pot: workingPot(scenario.gameState),
          },
        });
      }
      passed += 1;
    } catch (err) {
      failed += 1;
      results.push({
        id: scenario.id,
        name: scenario.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { passed, failed, results };
}

/** CLI entry */
export function printBenchmarkReport(report: BenchmarkReport): boolean {
  console.log('\n=== GTO Math Engine Benchmark ===\n');
  for (const r of report.results) {
    const mark = r.ok ? 'PASS' : 'FAIL';
    console.log(`[${mark}] ${r.name}`);
    if (r.snapshot) {
      console.log(
        `       decision=${r.snapshot.decision} | EV=${r.snapshot.ev} | Eq=${r.snapshot.equity}% | pot=${r.snapshot.pot}`,
      );
    }
    if (r.error) {
      console.log(`       ERROR: ${r.error}`);
    }
  }
  console.log(
    `\nSummary: ${report.passed} passed, ${report.failed} failed (of ${report.results.length})\n`,
  );
  return report.failed === 0;
}
