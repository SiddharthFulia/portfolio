// Time control picker — Lichess-style presets + a custom option.
// Returns {baseMs, incMs} from onChange.
//
// Presets follow Lichess conventions (1+0 bullet, 3+2 blitz, 15+10 rapid,
// 30+0 classical, etc). 'None' disables the clocks entirely.

export const TIME_CONTROLS = [
  { id: 'none',     label: 'No clock', short: '∞',     baseMs: null,   incMs: 0   },
  { id: 'bullet1',  label: 'Bullet',   short: '1+0',   baseMs: 60_000, incMs: 0   },
  { id: 'bullet21', label: 'Bullet',   short: '2+1',   baseMs: 120_000, incMs: 1_000 },
  { id: 'blitz30',  label: 'Blitz',    short: '3+0',   baseMs: 180_000, incMs: 0   },
  { id: 'blitz32',  label: 'Blitz',    short: '3+2',   baseMs: 180_000, incMs: 2_000 },
  { id: 'blitz50',  label: 'Blitz',    short: '5+0',   baseMs: 300_000, incMs: 0   },
  { id: 'rapid100', label: 'Rapid',    short: '10+0',  baseMs: 600_000, incMs: 0   },
  { id: 'rapid155', label: 'Rapid',    short: '15+10', baseMs: 900_000, incMs: 10_000 },
  { id: 'classic',  label: 'Classical',short: '30+0',  baseMs: 1_800_000, incMs: 0 },
]

export default function TimeControlPicker({ value, onChange }) {
  return (
    <div className="luxe-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Time control</p>
      <div className="grid grid-cols-3 gap-1.5">
        {TIME_CONTROLS.map(t => (
          <button key={t.id}
            onClick={() => onChange(t)}
            title={t.label}
            className={`px-2 py-1.5 rounded-lg border text-center transition-all ${
              value?.id === t.id
                ? 'border-amber-400/70 bg-amber-500/15 text-amber-200'
                : 'border-gray-800 bg-gray-900/40 text-gray-400 hover:border-gray-600 hover:text-gray-200'
            }`}>
            <div className="text-[10px] font-bold leading-tight">{t.short}</div>
            <div className="text-[9px] uppercase tracking-wider opacity-70">{t.label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
