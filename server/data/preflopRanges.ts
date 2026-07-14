import type { Position } from '../../shared/types';

/**
 * Static 6-Max Cash Game preflop charts (approx GTO-ish TAG microstakes).
 * Hand codes: "AA","AKs","AKo","76s","T9o" etc.
 */
export type PreflopAction = 'OPEN' | 'CALL' | '3BET' | '4BET' | 'FOLD';

/**
 * Action ก่อนหน้าบนโต๊ะ (Action Cascading)
 * — ใช้เลือกระหว่าง Open chart vs Facing Open vs Facing 3-Bet
 */
export type PriorPreflopAction = 'UNOPENED' | 'FACING_OPEN' | 'FACING_3BET';

const RANK_ORDER = '23456789TJQKA';

function expandPairs(from: string, to: string): string[] {
  const a = RANK_ORDER.indexOf(from);
  const b = RANK_ORDER.indexOf(to);
  const out: string[] = [];
  for (let i = a; i <= b; i++) {
    const r = RANK_ORDER[i];
    out.push(`${r}${r}`);
  }
  return out;
}

function combos(
  highs: string,
  lows: string,
  suited: boolean | 'both',
): string[] {
  const out: string[] = [];
  for (const h of highs) {
    for (const l of lows) {
      if (RANK_ORDER.indexOf(h) <= RANK_ORDER.indexOf(l)) continue;
      if (suited === true || suited === 'both') out.push(`${h}${l}s`);
      if (suited === false || suited === 'both') out.push(`${h}${l}o`);
    }
  }
  return out;
}

function uniq(list: string[]): string[] {
  return [...new Set(list)];
}

/** RFI / Open-raise ranges by position */
export const OPEN_RANGES: Record<Position, ReadonlySet<string>> = {
  UTG: new Set(
    uniq([
      ...expandPairs('7', 'A'),
      ...combos('A', 'JT98', true),
      ...combos('A', 'KQ', false),
      ...combos('K', 'QJ', true),
      'KQo',
      'JTs',
      'T9s',
      '98s',
    ]),
  ),
  MP: new Set(
    uniq([
      ...expandPairs('6', 'A'),
      ...combos('A', 'JT987', true),
      ...combos('A', 'KQJ', false),
      ...combos('K', 'QJT', true),
      'KQo',
      'KJo',
      'QJo',
      'QTs',
      'JTs',
      'T9s',
      '98s',
      '87s',
      '76s',
    ]),
  ),
  CO: new Set(
    uniq([
      ...expandPairs('5', 'A'),
      ...combos('A', '23456789TJQK', true),
      ...combos('A', 'KQJT9', false),
      ...combos('K', 'QJT98', true),
      ...combos('K', 'QJT', false),
      ...combos('Q', 'JT9', true),
      'QJo',
      'JTs',
      'JTo',
      'T9s',
      'T8s',
      '98s',
      '97s',
      '87s',
      '76s',
      '65s',
      '54s',
    ]),
  ),
  BTN: new Set(
    uniq([
      ...expandPairs('2', 'A'),
      ...combos('A', '23456789TJQK', 'both'),
      ...combos('K', '23456789TJQ', true),
      ...combos('K', 'QJT987', false),
      ...combos('Q', 'JT9876', true),
      ...combos('Q', 'JT98', false),
      ...combos('J', 'T987', true),
      ...combos('J', 'T9', false),
      ...combos('T', '987', true),
      'T9o',
      '98s',
      '97s',
      '87s',
      '86s',
      '76s',
      '75s',
      '65s',
      '64s',
      '54s',
      '53s',
      '43s',
    ]),
  ),
  SB: new Set(
    uniq([
      ...expandPairs('5', 'A'),
      ...combos('A', '23456789TJQK', true),
      ...combos('A', 'KQJT98', false),
      ...combos('K', 'QJT987', true),
      ...combos('K', 'QJT', false),
      ...combos('Q', 'JT98', true),
      'QJo',
      'JTs',
      'T9s',
      '98s',
      '87s',
      '76s',
      '65s',
    ]),
  ),
  BB: new Set(
    uniq([
      ...expandPairs('2', 'A'),
      ...combos('A', '23456789TJQK', 'both'),
      ...combos('K', 'QJT98765', true),
      ...combos('K', 'QJT9', false),
      ...combos('Q', 'JT987', true),
      ...combos('J', 'T98', true),
      'T9s',
      '98s',
      '87s',
      '76s',
      '65s',
      '54s',
    ]),
  ),
};

/** Value 3-bet vs open (by hero position) */
export const THREE_BET_VALUE: Record<Position, ReadonlySet<string>> = {
  UTG: new Set(['AA', 'KK', 'QQ', 'AKs', 'AKo']),
  MP: new Set(['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo', 'AQs']),
  CO: new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'AQs', 'AJs']),
  BTN: new Set([
    'AA',
    'KK',
    'QQ',
    'JJ',
    'TT',
    'AKs',
    'AKo',
    'AQs',
    'AQo',
    'AJs',
    'KQs',
  ]),
  SB: new Set(['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo', 'AQs']),
  BB: new Set([
    'AA',
    'KK',
    'QQ',
    'JJ',
    'TT',
    'AKs',
    'AKo',
    'AQs',
    'AQo',
    'AJs',
    'KQs',
  ]),
};

/** Bluff/light 3-bet candidates (suited blockers / speculative) */
export const THREE_BET_BLUFF: Record<Position, ReadonlySet<string>> = {
  UTG: new Set(['A5s', 'A4s']),
  MP: new Set(['A5s', 'A4s', 'A3s', '76s']),
  CO: new Set(['A5s', 'A4s', 'A3s', 'A2s', '76s', '65s', '54s']),
  BTN: new Set([
    'A5s',
    'A4s',
    'A3s',
    'A2s',
    'K9s',
    'K8s',
    'Q9s',
    '76s',
    '65s',
    '54s',
    'J9s',
  ]),
  SB: new Set(['A5s', 'A4s', 'A3s', '76s', '65s']),
  BB: new Set(['A5s', 'A4s', 'A3s', 'A2s', '76s', '65s', '54s', 'K9s']),
};

/** Flat-call vs open (exclude hands already in value 3-bet) */
export const CALL_VS_OPEN: Record<Position, ReadonlySet<string>> = {
  UTG: new Set(['JJ', 'TT', '99', 'AQs', 'AJs', 'KQs']),
  MP: new Set(['TT', '99', '88', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs', 'JTs']),
  CO: new Set([
    '99',
    '88',
    '77',
    'ATs',
    'A9s',
    'KQs',
    'KJs',
    'KTs',
    'QJs',
    'QTs',
    'JTs',
    'T9s',
    '98s',
    '87s',
  ]),
  BTN: new Set([
    '99',
    '88',
    '77',
    '66',
    'ATs',
    'A9s',
    'A8s',
    'KJs',
    'KTs',
    'QJs',
    'QTs',
    'JTs',
    'T9s',
    '98s',
    '87s',
    '76s',
    '65s',
  ]),
  SB: new Set(['TT', '99', '88', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs', 'JTs']),
  BB: new Set(
    uniq([
      ...expandPairs('2', '9'),
      ...combos('A', '23456789TJ', true),
      ...combos('A', 'JT9', false),
      ...combos('K', 'QJT987', true),
      ...combos('Q', 'JT98', true),
      ...combos('J', 'T98', true),
      'T9s',
      '98s',
      '87s',
      '76s',
      '65s',
      '54s',
      'KQo',
      'KJo',
      'QJo',
    ]),
  ),
};

/** Value 4-bet / jam vs 3-bet (narrower than value 3-bet) */
export const FOUR_BET_VALUE: Record<Position, ReadonlySet<string>> = {
  UTG: new Set(['AA', 'KK', 'AKs']),
  MP: new Set(['AA', 'KK', 'QQ', 'AKs', 'AKo']),
  CO: new Set(['AA', 'KK', 'QQ', 'AKs', 'AKo']),
  BTN: new Set(['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo']),
  SB: new Set(['AA', 'KK', 'QQ', 'AKs', 'AKo']),
  BB: new Set(['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo']),
};

/** Flat-call vs 3-bet (ผ่อนได้เฉพาะมือแข็ง) */
export const CALL_VS_3BET: Record<Position, ReadonlySet<string>> = {
  UTG: new Set(['QQ', 'JJ', 'AQs']),
  MP: new Set(['JJ', 'TT', 'AQs', 'AJs']),
  CO: new Set(['JJ', 'TT', '99', 'AQs', 'AJs', 'KQs']),
  BTN: new Set(['TT', '99', 'AQs', 'AJs', 'KQs', 'AQo']),
  SB: new Set(['JJ', 'TT', 'AQs']),
  BB: new Set(['TT', '99', '88', 'AQs', 'AJs', 'KQs', 'AQo']),
};

const SITUATION_LABEL: Record<PriorPreflopAction, string> = {
  UNOPENED: 'Unopened (RFI)',
  FACING_OPEN: 'Facing Open Raise',
  FACING_3BET: 'Facing 3-Bet',
};

export function priorActionLabel(prior: PriorPreflopAction): string {
  return SITUATION_LABEL[prior];
}

/**
 * Action Cascading Preflop Lookup
 * @param priorAction — สถานการณ์จาก Action ก่อนหน้าบนโต๊ะ
 * @param facingRaise — legacy bool (true ≈ FACING_OPEN ถ้า prior ไม่ระบุ)
 */
export function lookupPreflopAction(
  position: Position,
  handCode: string,
  facingRaise: boolean,
  priorAction?: PriorPreflopAction,
): PreflopAction {
  const situation: PriorPreflopAction =
    priorAction ?? (facingRaise ? 'FACING_OPEN' : 'UNOPENED');

  if (situation === 'UNOPENED') {
    return OPEN_RANGES[position].has(handCode) ? 'OPEN' : 'FOLD';
  }

  if (situation === 'FACING_3BET') {
    if (FOUR_BET_VALUE[position].has(handCode)) return '4BET';
    if (CALL_VS_3BET[position].has(handCode)) return 'CALL';
    return 'FOLD';
  }

  // FACING_OPEN — 3-Bet / Flat / Fold
  if (THREE_BET_VALUE[position].has(handCode)) return '3BET';
  if (THREE_BET_BLUFF[position].has(handCode)) return '3BET';
  if (CALL_VS_OPEN[position].has(handCode)) return 'CALL';
  if (OPEN_RANGES[position].has(handCode) && position === 'BB') return 'CALL';
  return 'FOLD';
}
