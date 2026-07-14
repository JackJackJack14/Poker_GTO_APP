import { useMemo } from 'react';
import type { EvSessionState } from '../lib/evTracker';
import { totalSessionEv, totalSessionReal } from '../lib/evTracker';

interface SessionAnalyticsProps {
  session: EvSessionState;
  onClear: () => void;
}

function DualLineChart({
  cumulativeEv,
  cumulativeReal,
}: {
  cumulativeEv: number[];
  cumulativeReal: number[];
}) {
  const w = 360;
  const h = 140;
  const pad = 14;

  const { evPath, realPath, zeroY, min, max } = useMemo(() => {
    const n = Math.max(cumulativeEv.length, cumulativeReal.length);
    if (n === 0) {
      return { evPath: '', realPath: '', zeroY: h / 2, min: 0, max: 0 };
    }
    const evVals = [0, ...cumulativeEv];
    const realVals = [0, ...cumulativeReal];
    // align lengths
    while (evVals.length < realVals.length) evVals.push(evVals[evVals.length - 1] ?? 0);
    while (realVals.length < evVals.length) {
      realVals.push(realVals[realVals.length - 1] ?? 0);
    }
    const all = [...evVals, ...realVals];
    let minV = Math.min(...all);
    let maxV = Math.max(...all);
    if (minV === maxV) {
      minV -= 1;
      maxV += 1;
    }
    const span = maxV - minV;
    const points = (values: number[]) =>
      values
        .map((v, i) => {
          const x = pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2);
          const y = pad + (1 - (v - minV) / span) * (h - pad * 2);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
    const zeroY = pad + (1 - (0 - minV) / span) * (h - pad * 2);
    return {
      evPath: points(evVals),
      realPath: points(realVals),
      zeroY,
      min: minV,
      max: maxV,
    };
  }, [cumulativeEv, cumulativeReal]);

  if (cumulativeEv.length === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40">
        <p className="text-xs text-zinc-500">
          ยังไม่มีข้อมูล — กด「ความน่าจะเป็น」แล้วบันทึกผลชนะ/แพ้
        </p>
      </div>
    );
  }

  const lastEvIdx = Math.max(0, cumulativeEv.length);
  const lastRealIdx = Math.max(0, cumulativeReal.length);
  const lastN = Math.max(lastEvIdx, lastRealIdx);
  const span = max - min || 1;

  const endPoint = (series: number[], color: string) => {
    const values = [0, ...series];
    while (values.length < lastN + 1) values.push(values[values.length - 1] ?? 0);
    const i = values.length - 1;
    const v = values[i];
    const cx = pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2);
    const cy = pad + (1 - (v - min) / span) * (h - pad * 2);
    return <circle key={color} cx={cx} cy={cy} r="3.5" fill={color} />;
  };

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-3 text-[10px] text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded bg-emerald-400" />
          EV สะสม
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded bg-sky-400" />
          เงินจริงสะสม
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-[140px] w-full overflow-visible"
        role="img"
        aria-label="Cumulative EV and Real Money dual line graph"
      >
        <line
          x1={pad}
          y1={zeroY}
          x2={w - pad}
          y2={zeroY}
          stroke="#3f3f46"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
        <polyline
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={realPath}
        />
        <polyline
          fill="none"
          stroke="#34d399"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={evPath}
        />
        {endPoint(cumulativeReal, '#38bdf8')}
        {endPoint(cumulativeEv, '#34d399')}
      </svg>
    </div>
  );
}

function formatBb(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)} BB`;
}

export function SessionAnalytics({ session, onClear }: SessionAnalyticsProps) {
  const totalEv = totalSessionEv(session);
  const totalReal = totalSessionReal(session);
  const hands = session.hands.length;
  const pending = session.hands.filter((h) => h.actualResult === null).length;

  return (
    <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold tracking-wide text-white">
            Session Analytics · EV vs เงินจริง
          </h2>
          <p className="text-[11px] text-zinc-500">
            บันทึกในเครื่อง · {hands} แฮนด์
            {pending > 0 ? ` · รอผลจริง ${pending}` : ''}
          </p>
          <p className="mt-2 font-mono text-xs sm:text-sm">
            <span className="text-emerald-400">
              EV สะสม: {formatBb(totalEv)}
            </span>
            <span className="mx-2 text-zinc-600">|</span>
            <span className="text-sky-400">
              เงินจริงสะสม: {formatBb(totalReal)}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg border border-zinc-600 bg-zinc-800/80 px-3 py-2 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-red-700 hover:bg-red-950/40 hover:text-red-200"
        >
          ล้างข้อมูลสถิติ (Clear Stats)
        </button>
      </div>

      <DualLineChart
        cumulativeEv={session.cumulativeEv}
        cumulativeReal={session.cumulativeReal}
      />

      {session.hands.length > 0 && (
        <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-zinc-800/80 bg-zinc-950/50">
          <table className="w-full text-left text-[10px] text-zinc-400">
            <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
              <tr>
                <th className="px-2 py-1 font-medium">#</th>
                <th className="px-2 py-1 font-medium">Hand</th>
                <th className="px-2 py-1 font-medium">Pos</th>
                <th className="px-2 py-1 font-medium">EV</th>
                <th className="px-2 py-1 font-medium">จริง</th>
              </tr>
            </thead>
            <tbody>
              {[...session.hands].reverse().slice(0, 12).map((h, i) => {
                const idx = session.hands.length - i;
                const evSign = h.ev >= 0 ? '+' : '';
                const real =
                  h.actualResult === null
                    ? '—'
                    : `${h.actualResult >= 0 ? '+' : ''}${h.actualResult.toFixed(2)}`;
                return (
                  <tr key={h.id} className="border-t border-zinc-800/60">
                    <td className="px-2 py-1 font-mono">{idx}</td>
                    <td className="px-2 py-1 font-mono text-zinc-300">
                      {h.heroCards.join(' ')}
                    </td>
                    <td className="px-2 py-1">{h.heroPosition}</td>
                    <td
                      className={`px-2 py-1 font-mono ${
                        h.ev >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {evSign}
                      {h.ev.toFixed(2)}
                    </td>
                    <td
                      className={`px-2 py-1 font-mono ${
                        h.actualResult === null
                          ? 'text-zinc-600'
                          : h.actualResult >= 0
                            ? 'text-sky-400'
                            : 'text-amber-400'
                      }`}
                    >
                      {real}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
