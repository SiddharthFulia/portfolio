// TransportBar — bottom control strip for the Analyze tab. Mirrors the
// pattern from src/components/algorithms/StepControls.jsx but wires
// against the Analyze player's frame index directly rather than the
// generic viz step engine.
//
// Layout:
//   [⏮ Step Back] [▶ Play / ⏸ Pause] [⏭ Step Forward] [⏹ Reset]
//   speed  [—— slider ——]  step 42 / 187
//   [—————————— scrubber ——————————]

import { Button, Slider } from '../../ui'

const SPEEDS = [
  { v: 0.25, label: '0.25×' },
  { v: 0.5,  label: '0.5×'  },
  { v: 1,    label: '1×'    },
  { v: 2,    label: '2×'    },
  { v: 4,    label: '4×'    },
]

export default function TransportBar({
  playing,
  onPlay,
  onPause,
  onStepBack,
  onStepForward,
  onReset,
  onScrub,
  speed = 1,
  onSpeed,
  step = 0,
  total = 0,
  disabled = false,
  reducedMotion = false,
}) {
  const atStart = step <= 0
  const atEnd = total > 0 && step >= total - 1
  const scrubMax = Math.max(0, total - 1)

  return (
    <div className="border-t border-white/10 bg-black/40 p-3 space-y-2">
      {/* Buttons row */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="small"
          onClick={onStepBack}
          disabled={disabled || atStart}
          aria-label="Step backward one frame"
        >
          ⏮ Back
        </Button>
        {playing ? (
          <Button
            variant="primary"
            size="small"
            onClick={onPause}
            disabled={disabled}
            aria-label="Pause playback"
          >
            ⏸ Pause
          </Button>
        ) : (
          <Button
            variant="primary"
            size="small"
            onClick={onPlay}
            disabled={disabled || atEnd || reducedMotion || total === 0}
            aria-label={reducedMotion ? 'Autoplay disabled by prefers-reduced-motion' : 'Play through the trace'}
          >
            ▶ Play
          </Button>
        )}
        <Button
          variant="ghost"
          size="small"
          onClick={onStepForward}
          disabled={disabled || atEnd}
          aria-label="Step forward one frame"
        >
          ⏭ Forward
        </Button>
        <Button
          variant="subtle"
          size="small"
          onClick={onReset}
          disabled={disabled || atStart}
          aria-label="Reset to first frame"
        >
          ⏹ Reset
        </Button>

        {/* Speed selector */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">Speed</span>
          {SPEEDS.map(s => {
            const on = Math.abs(speed - s.v) < 1e-6
            return (
              <button
                key={s.v}
                type="button"
                onClick={() => onSpeed?.(s.v)}
                disabled={disabled}
                className={`text-[11px] font-bold px-2 py-0.5 rounded border transition-colors ${
                  on
                    ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                    : 'text-gray-400 border-white/10 hover:text-gray-100 hover:bg-white/[0.05]'
                }`}
                aria-pressed={on}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Scrubber row */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-mono text-gray-500 shrink-0">
          Step {total > 0 ? step + 1 : 0} / {total}
        </span>
        <div className="flex-1 min-w-0">
          <Slider
            min={0}
            max={scrubMax}
            step={1}
            value={Math.min(step, scrubMax)}
            onChange={v => onScrub?.(Number(v))}
            disabled={disabled || total <= 1}
            tooltip={{ formatter: v => `Frame ${Number(v) + 1}` }}
            accent="amber"
          />
        </div>
      </div>
    </div>
  )
}
