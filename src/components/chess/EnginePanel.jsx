// Live engine telemetry. Driven by the last best-move / analyze response.
// Fields are stockfish-standard:
//   nodes     — positions searched
//   nps       — nodes per second
//   depth     — search depth reached
//   seldepth  — max selective depth (incl. extensions)
//   hashfull  — 0-1000 per-mille of the hash table currently used
//   elapsedMs — wall-clock time the request took on the BE
//
// Hash size itself is a UCI option — Stockfish default is 16 MB unless we
// override with setoption('Hash', N). We show that as the static "Hash"
// row so users can see how much memory each engine instance holds.

const DEFAULT_HASH_MB = 16   // Stockfish UCI default (we don't override it yet)

const fmt = (n) => {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export default function EnginePanel({ telemetry, status, thinking }) {
  const rows = [
    { label: 'Memory',  value: `${DEFAULT_HASH_MB} MB`, hint: 'UCI Hash · default' },
    { label: 'Depth',   value: telemetry?.depth ?? '—', hint: telemetry?.seldepth ? `sel ${telemetry.seldepth}` : null },
    { label: 'Nodes',   value: fmt(telemetry?.nodes) },
    { label: 'Speed',   value: telemetry?.nps ? `${fmt(telemetry.nps)}/s` : '—' },
    { label: 'Hash fill',
      value: telemetry?.hashfull != null ? `${(telemetry.hashfull / 10).toFixed(1)}%` : '—',
      hint: telemetry?.hashfull != null ? `${telemetry.hashfull}‰` : null,
    },
    { label: 'Time',    value: telemetry?.elapsedMs ? `${telemetry.elapsedMs} ms` : '—' },
  ]
  return (
    <div className="luxe-card p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500">Engine telemetry</p>
        <span className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
          thinking ? 'bg-cyan-500/20 text-cyan-300' : 'bg-gray-800 text-gray-400'
        }`}>
          {thinking ? 'thinking' : 'idle'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {rows.map(r => (
          <div key={r.label} className="flex justify-between items-baseline text-[11px] font-mono">
            <span className="text-gray-500">{r.label}</span>
            <span className="text-gray-200 tabular-nums" title={r.hint || undefined}>{r.value}</span>
          </div>
        ))}
      </div>
      {/* Hash fill visual — small horizontal bar so you can see how full
          the transposition table is at a glance. */}
      {telemetry?.hashfull != null && (
        <div className="mt-2">
          <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400 transition-all duration-300"
              style={{ width: `${telemetry.hashfull / 10}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
