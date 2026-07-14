/**
 * Monte Carlo Simulation Engine — แยกเด็ดขาดจาก Local GTO Engine
 *
 * ⚠️ STRICT ISOLATION: ไฟล์นี้ห้าม import localGtoEngine / PreflopEngine / PostflopMathEngine
 * ใช้เฉพาะจำลองกราฟระยะยาว — ไม่กระทบ production analyze path
 */

/** True winrate คงที่ (bb/100) */
export const SIM_TRUE_WINRATE_BB100 = 5;

/** Standard Deviation เกม 6-Max (bb/100) */
export const SIM_STD_DEV_BB100 = 90;

/** จำนวนแฮนด์จำลองมาตรฐาน */
export const SIM_DEFAULT_HANDS = 50_000;

export interface SimulationParams {
  /** จำนวนแฮนด์ (default 50_000) */
  hands?: number;
  /** True winrate bb/100 (default +5) */
  winrateBb100?: number;
  /** SD bb/100 (default 90) */
  stdDevBb100?: number;
  /** seed ทางเลือก — ไม่ระบุ = สุ่มใหม่ทุกครั้ง */
  seed?: number;
  /** จุดบนกราฟที่ส่งกลับ (downsample) — default 500 */
  chartPoints?: number;
}

export interface SimulationSeries {
  /** index แฮนด์ (1-based ที่จุด sample) */
  hands: number[];
  /** เส้น EV ทางทฤษฎีสะสม (BB) */
  cumulativeEv: number[];
  /** เส้นเงินจริงจำลองสะสม (BB) — มี variance */
  cumulativeReal: number[];
}

export interface SimulationResult {
  handCount: number;
  winrateBb100: number;
  stdDevBb100: number;
  /** EV / แฮนด์ (BB) */
  evPerHand: number;
  /** SD / แฮนด์ (BB) — ตาม convention: SD_bb100 / 10 */
  sdPerHand: number;
  /** สรุปปลายทาง */
  finalEv: number;
  finalReal: number;
  /** ผลต่างเงินจริง − EV ท้ายสุด */
  delta: number;
  /** ชุดจุดสำหรับเรนเดอร์กราฟ (downsample จาก full 50k) */
  chart: SimulationSeries;
  /** ยืนยันว่าไม่ได้แตะ LocalStorage / production engine */
  sandbox: true;
}

/** Mulberry32 PRNG — deterministic เมื่อมี seed */
function createRng(seed?: number): () => number {
  if (seed === undefined) {
    return Math.random;
  }
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box–Muller → Normal(0,1)
 */
function randomNormal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function downsampleIndices(n: number, maxPoints: number): number[] {
  if (n <= maxPoints) {
    return Array.from({ length: n }, (_, i) => i);
  }
  const out: number[] = [];
  const step = (n - 1) / (maxPoints - 1);
  for (let p = 0; p < maxPoints; p++) {
    out.push(Math.round(p * step));
  }
  // guarantee last
  out[out.length - 1] = n - 1;
  return [...new Set(out)];
}

/**
 * รันจำลอง N แฮนด์ในหน่วยความจำเท่านั้น
 * — ไม่เขียน LocalStorage
 * — ไม่เรียก GTO production engine
 */
export function runMonteCarloSimulation(
  params: SimulationParams = {},
): SimulationResult {
  const handCount = Math.max(1, Math.floor(params.hands ?? SIM_DEFAULT_HANDS));
  const winrateBb100 = params.winrateBb100 ?? SIM_TRUE_WINRATE_BB100;
  const stdDevBb100 = params.stdDevBb100 ?? SIM_STD_DEV_BB100;
  const chartPoints = Math.max(2, Math.floor(params.chartPoints ?? 500));

  // μ per hand (bb) · σ per hand ตาม convention bb/100 → /100 และ /10
  const evPerHand = winrateBb100 / 100;
  const sdPerHand = stdDevBb100 / 10;

  const rng = createRng(params.seed);

  // Full series ใน memory (ไม่ persist)
  const cumulativeEv = new Float64Array(handCount);
  const cumulativeReal = new Float64Array(handCount);

  let sumEv = 0;
  let sumReal = 0;

  for (let i = 0; i < handCount; i++) {
    sumEv += evPerHand;
    // เงินจริง = EV ต่อแฮนด์ + noise ~ N(0, σ²)
    const noise = randomNormal(rng) * sdPerHand;
    sumReal += evPerHand + noise;
    cumulativeEv[i] = sumEv;
    cumulativeReal[i] = sumReal;
  }

  const indices = downsampleIndices(handCount, chartPoints);
  const chart: SimulationSeries = {
    hands: indices.map((i) => i + 1),
    cumulativeEv: indices.map((i) =>
      Math.round(cumulativeEv[i]! * 100) / 100,
    ),
    cumulativeReal: indices.map((i) =>
      Math.round(cumulativeReal[i]! * 100) / 100,
    ),
  };

  const finalEv = Math.round(sumEv * 100) / 100;
  const finalReal = Math.round(sumReal * 100) / 100;

  return {
    handCount,
    winrateBb100,
    stdDevBb100,
    evPerHand,
    sdPerHand,
    finalEv,
    finalReal,
    delta: Math.round((finalReal - finalEv) * 100) / 100,
    chart,
    sandbox: true,
  };
}

export type SimulateApiResponse =
  | { success: true; data: SimulationResult }
  | { success: false; error: string };
