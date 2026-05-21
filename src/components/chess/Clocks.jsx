// Two-side chess clocks with optional Fischer increment.
//
// Props:
//   white       — ms remaining for white
//   black       — ms remaining for black
//   activeSide  — 'white' | 'black' | null (null = paused)
//   orientation — 'white' | 'black' — controls which clock sits on bottom
//
// The page owns the tick loop + handles 0-flag detection. This is a
// dumb renderer.

const fmtClock = (ms) => {
  if (ms == null) return '—:—'
  if (ms <= 0) return '0:00'
  const totalSec = Math.ceil(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  // Hours shown only when needed (long classical games)
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const mm = (m % 60).toString().padStart(2, '0')
    return `${h}:${mm}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

function ClockBox({ ms, isActive, label }) {
  const low = ms != null && ms < 10_000
  const flagged = ms != null && ms <= 0
  return (
    <div className={`luxe-card px-3 py-2 transition-all ${
      isActive
        ? (low ? 'ring-2 ring-rose-400/70 bg-rose-500/10' : 'ring-2 ring-amber-400/60 bg-amber-500/5')
        : 'opacity-60'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">{label}</span>
        {isActive && !flagged && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        )}
      </div>
      <p className={`text-2xl font-bold font-mono tabular-nums leading-tight ${
        flagged ? 'text-rose-400'
        : low ? 'text-rose-300'
        : isActive ? 'text-amber-100'
        : 'text-gray-300'
      }`}>
        {fmtClock(ms)}
      </p>
    </div>
  )
}

export default function Clocks({ white, black, activeSide, orientation = 'white' }) {
  // Render order: opponent on top, player on bottom (matches the board flip).
  const top    = orientation === 'white' ? { side: 'black', ms: black, label: 'Black' }
                                         : { side: 'white', ms: white, label: 'White' }
  const bottom = orientation === 'white' ? { side: 'white', ms: white, label: 'White' }
                                         : { side: 'black', ms: black, label: 'Black' }
  return (
    <div className="space-y-2">
      <ClockBox ms={top.ms}    isActive={activeSide === top.side}    label={top.label} />
      <ClockBox ms={bottom.ms} isActive={activeSide === bottom.side} label={bottom.label} />
    </div>
  )
}
