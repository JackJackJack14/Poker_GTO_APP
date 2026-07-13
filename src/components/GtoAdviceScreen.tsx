import type { Action, GtoResponse } from '../types';

const ACTION_COLORS: Record<Action, string> = {
  FOLD: 'bg-red-900/40 text-red-300 ring-red-700/50',
  CHECK: 'bg-zinc-700/60 text-zinc-200 ring-zinc-500/50',
  CALL: 'bg-blue-900/40 text-blue-300 ring-blue-700/50',
  RAISE: 'bg-emerald-900/40 text-emerald-300 ring-emerald-700/50',
};

interface GtoAdviceScreenProps {
  result: GtoResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  open: boolean;
}

function EquityRing({ equity }: { equity: number }) {
  const clamped = Math.min(100, Math.max(0, equity));
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (clamped / 100) * circumference;

  const color =
    clamped >= 60 ? '#34d399' : clamped >= 40 ? '#d4a853' : '#f87171';

  return (
    <div className="relative flex h-36 w-36 items-center justify-center">
      <svg className="-rotate-90" width="136" height="136">
        <circle
          cx="68"
          cy="68"
          r="54"
          fill="none"
          stroke="#334155"
          strokeWidth="10"
        />
        <circle
          cx="68"
          cy="68"
          r="54"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute text-center">
        <p className="font-mono text-3xl font-bold text-white">
          {clamped.toFixed(0)}%
        </p>
        <p className="text-[10px] uppercase tracking-widest text-zinc-400">
          Equity
        </p>
      </div>
    </div>
  );
}

export function GtoAdviceScreen({
  result,
  loading,
  error,
  onClose,
  open,
}: GtoAdviceScreenProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-700/60 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">GTO Analysis</h2>
            <p className="text-xs text-zinc-400">คำแนะนำจาก AI Coach</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {loading && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-gold" />
              <p className="text-sm text-zinc-400">กำลังวิเคราะห์ด้วย AI...</p>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-xl border border-red-800/50 bg-red-950/30 p-4 text-center">
              <p className="text-sm font-medium text-red-300">{error}</p>
              <p className="mt-1 text-xs text-red-400/70">
                ตรวจสอบว่า Backend รันอยู่และ GEMINI_API_KEY ถูกต้อง
              </p>
            </div>
          )}

          {result && !loading && !error && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-6">
                <EquityRing equity={result.equity} />
                <div className="flex-1">
                  <p className="mb-1 text-xs uppercase tracking-widest text-gold">
                    คำแนะนำ
                  </p>
                  <p className="text-lg font-semibold leading-snug text-white">
                    {result.advice}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">
                  อธิบายเชิงกลยุทธ์
                </p>
                <p className="text-sm leading-relaxed text-zinc-300">
                  {result.explanation}
                </p>
              </div>

              {result.suggestedActions.length > 0 && (
                <div>
                  <p className="mb-3 text-xs uppercase tracking-widest text-zinc-500">
                    Suggested Actions
                  </p>
                  <div className="flex flex-col gap-2">
                    {result.suggestedActions.map((sa, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between rounded-lg px-4 py-2.5 ring-1 ${ACTION_COLORS[sa.action]}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-bold">
                            {sa.action}
                          </span>
                          {sa.size !== undefined && (
                            <span className="text-xs opacity-80">
                              {sa.size} BB
                            </span>
                          )}
                        </div>
                        {sa.frequency !== undefined && (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-black/30">
                              <div
                                className="h-full rounded-full bg-white/60"
                                style={{ width: `${sa.frequency * 100}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs">
                              {(sa.frequency * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
