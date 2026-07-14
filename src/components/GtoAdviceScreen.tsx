import type { GtoResponse, Position, Stage } from '../types';

export interface AnalysisContext {
  heroPosition: Position;
  stage: Stage;
  pot: number;
  heroCards: [string, string];
  boardCards: string[];
  positionLineup: { seatIndex: number; position: Position }[];
}

interface GtoAdviceScreenProps {
  result: GtoResponse | null;
  loading: boolean;
  error: string | null;
  context: AnalysisContext | null;
  onClose: () => void;
  open: boolean;
  canRecordActual?: boolean;
  actualFlash?: string | null;
  onRecordActual?: (outcome: 'win' | 'lose') => void;
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

function PositionLineupPanel({
  context,
}: {
  context: AnalysisContext;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="mb-3 text-xs uppercase tracking-widest text-zinc-500">
        ตำแหน่งบนโต๊ะ (หมุนตาม BTN)
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {context.positionLineup.map(({ seatIndex, position }) => (
          <div
            key={seatIndex}
            className={`rounded-lg px-3 py-2 text-center ring-1 ${
              position === context.heroPosition
                ? 'bg-gold/15 text-gold ring-gold/40'
                : position === 'BTN'
                  ? 'bg-white/10 text-white ring-white/20'
                  : 'bg-zinc-800/60 text-zinc-300 ring-zinc-700/50'
            }`}
          >
            <p className="text-[10px] text-zinc-500">Seat {seatIndex + 1}</p>
            <p className="font-mono text-sm font-bold">{position}</p>
            {position === context.heroPosition && (
              <p className="text-[9px] text-gold">HERO</p>
            )}
            {position === 'BTN' && (
              <p className="text-[9px] text-zinc-400">DEALER</p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
        <span className="rounded-full bg-zinc-800 px-2 py-1">
          Hero: <strong className="text-emerald-400">{context.heroPosition}</strong>
        </span>
        <span className="rounded-full bg-zinc-800 px-2 py-1">
          Street: <strong className="text-zinc-200">{context.stage}</strong>
        </span>
        <span className="rounded-full bg-zinc-800 px-2 py-1">
          Pot: <strong className="text-gold">{context.pot.toFixed(1)} BB</strong>
        </span>
        <span className="rounded-full bg-zinc-800 px-2 py-1">
          Hand: <strong className="text-zinc-200">{context.heroCards.join(' ')}</strong>
        </span>
        {context.boardCards.length > 0 && (
          <span className="rounded-full bg-zinc-800 px-2 py-1">
            Board: <strong className="text-zinc-200">{context.boardCards.join(' ')}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

export function GtoAdviceScreen({
  result,
  loading,
  error,
  context,
  onClose,
  open,
  canRecordActual = false,
  actualFlash = null,
  onRecordActual,
}: GtoAdviceScreenProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-700/60 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/95 px-6 py-4 backdrop-blur-sm">
          <div>
            <h2 className="text-lg font-bold text-white">ความน่าจะเป็น</h2>
            <p className="text-xs text-zinc-400">
              {context
                ? `Hero ${context.heroPosition} · ${context.stage} · ${context.pot.toFixed(1)} BB`
                : 'Local Range & Bluff Analyzer'}
            </p>
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
          {context && <PositionLineupPanel context={context} />}

          {loading && (
            <div className="mt-5 flex flex-col items-center gap-4 py-10">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-gold" />
              <p className="text-sm text-zinc-400">กำลังคำนวณความน่าจะเป็น...</p>
            </div>
          )}

          {error && !loading && (
            <div className="mt-5 rounded-xl border border-red-800/50 bg-red-950/30 p-4 text-center">
              <p className="text-sm font-medium text-red-300">{error}</p>
              <p className="mt-1 text-xs text-red-400/70">
                {/quota|โควตา|429|rate.?limit/i.test(error)
                  ? 'โควตาฟรีเต็มชั่วคราว — รอสักครู่แล้วลองใหม่ หรือเปลี่ยน GEMINI_MODEL ใน server/.env'
                  : /API_KEY|api key|หมดอายุ/i.test(error)
                    ? 'แก้ที่ server/.env → GEMINI_API_KEY แล้ว restart Backend'
                    : 'ตรวจสอบว่า Backend รันที่พอร์ต 3001 (npm run dev ในโฟลเดอร์ server)'}
              </p>
            </div>
          )}

          {result && !loading && !error && (
            <div className="mt-5 flex flex-col gap-4">
              {result.dirtyOutsWarning && result.dirtyOutsAlert && (
                <div
                  role="alert"
                  className="rounded-lg border-2 border-amber-500 bg-amber-950/90 px-4 py-3 text-center shadow-[0_0_16px_rgba(245,158,11,0.45)]"
                >
                  <p className="text-sm font-bold tracking-wide text-amber-100">
                    {result.dirtyOutsAlert}
                  </p>
                </div>
              )}
              {result.rakeTrapWarning && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-600 bg-red-950/80 px-4 py-3 text-center shadow-[0_0_12px_rgba(220,38,38,0.35)]"
                >
                  <p className="text-xs font-bold uppercase tracking-widest text-red-300">
                    Rake-Trap Warning
                  </p>
                  <p className="mt-1 text-sm font-medium text-red-100">
                    {result.rakeTrapMessage ??
                      'สถานการณ์เสี่ยงติดกับดัก Rake — พิจารณา Fold หรือ 3-Bet แทน Call'}
                  </p>
                </div>
              )}
              <div className="flex items-start gap-5">
                <EquityRing equity={result.equity} />
                <div className="min-w-0 flex-1 space-y-3">
                  <div
                    className={`rounded-lg px-3 py-2 text-center font-mono text-sm font-bold ring-1 ${
                      result.ev >= 0
                        ? 'bg-emerald-950/50 text-emerald-300 ring-emerald-700/50'
                        : 'bg-red-950/50 text-red-300 ring-red-700/50'
                    }`}
                  >
                    <p>
                      💰 EV สุทธิ:{' '}
                      {result.ev > 0 ? '+' : ''}
                      {result.ev.toFixed(2)} BB
                    </p>
                    {result.priorAction && (
                      <p className="mt-1 text-[10px] font-medium leading-snug text-zinc-400">
                        {result.priorAction}
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">
                      {result.text}
                    </pre>
                  </div>
                </div>
              </div>

              {onRecordActual && (
                <div className="rounded-xl border border-zinc-700/60 bg-zinc-950/60 p-3">
                  <p className="mb-2 text-center text-[11px] text-zinc-400">
                    บันทึกผลจริงท้ายแฮนด์ → อัปเดตเส้นเงินจริงบนกราฟ
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!canRecordActual}
                      onClick={() => onRecordActual('win')}
                      className="rounded-lg border border-emerald-700/70 bg-emerald-950/50 px-2 py-2.5 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-900/60 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      🟢 ชนะแฮนด์นี้
                    </button>
                    <button
                      type="button"
                      disabled={!canRecordActual}
                      onClick={() => onRecordActual('lose')}
                      className="rounded-lg border border-red-700/70 bg-red-950/50 px-2 py-2.5 text-xs font-bold text-red-200 transition-colors hover:bg-red-900/60 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      🔴 แพ้/หมอบแฮนด์นี้
                    </button>
                  </div>
                  {actualFlash && (
                    <p className="mt-2 text-center text-[11px] font-medium text-zinc-300">
                      {actualFlash}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
