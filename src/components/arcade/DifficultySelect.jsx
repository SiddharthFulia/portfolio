// <DifficultySelect> — segmented control + optional custom-tunable panel.
//
// Renders a horizontal segmented picker for difficulty modes (Easy /
// Medium / Hard / Custom by convention, but any string array works).
// When the active mode is Custom AND a `customSchema` is provided, a
// small slider panel opens below so the player can tune individual
// gameplay parameters.
//
// Usage:
//   const [difficulty, setDifficulty] = useState('Medium')
//   const [customValues, setCustomValues] = useState({ paddleW: 90 })
//   <DifficultySelect
//     modes={['Easy','Medium','Hard','Custom']}
//     value={difficulty}
//     onChange={setDifficulty}
//     customSchema={{
//       paddleW: { label: 'Paddle width', min: 40, max: 200, step: 10, default: 90 },
//     }}
//     customValues={customValues}
//     onCustomChange={setCustomValues}
//   />
//
// Design choices:
//   • Segmented pill row on top — matches the site's dark-amber theme.
//   • Custom panel uses the site's <Slider> primitive (accent="amber").
//   • Slider changes are debounced only visually; caller receives every
//     update so games can live-tune where sensible.

import Slider from '../ui/Slider'

export default function DifficultySelect({
  modes = ['Easy', 'Medium', 'Hard', 'Custom'],
  value,
  onChange,
  customSchema,
  customValues = {},
  onCustomChange,
  compact = false,
}) {
  const setCustom = (key, v) => {
    if (!onCustomChange) return
    onCustomChange({ ...customValues, [key]: v })
  }

  const isCustom = value === 'Custom' && customSchema && Object.keys(customSchema).length > 0

  return (
    <div className="w-full">
      <div
        role="tablist"
        aria-label="Difficulty"
        className={`inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1 gap-1 ${compact ? '' : 'w-full sm:w-auto'}`}
      >
        {modes.map((m) => {
          const active = m === value
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange?.(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                active
                  ? 'bg-gradient-to-r from-amber-500 via-rose-500 to-fuchsia-500 text-black shadow'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              {m}
            </button>
          )
        })}
      </div>

      {isCustom && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 space-y-3">
          {Object.entries(customSchema).map(([key, spec]) => {
            const v = customValues[key] ?? spec.default
            return (
              <div key={key} className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-3">
                <label className="text-xs text-white/70 truncate">
                  {spec.label || key}
                </label>
                <div className="flex items-center gap-2">
                  <Slider
                    accent="amber"
                    min={spec.min}
                    max={spec.max}
                    step={spec.step || 1}
                    value={typeof v === 'number' ? v : Number(v)}
                    onChange={(nv) => setCustom(key, nv)}
                    className="flex-1"
                    tooltip={{ open: false }}
                  />
                  <span className="text-[11px] font-mono text-amber-300 w-10 text-right tabular-nums">
                    {typeof v === 'number' ? (spec.step && spec.step < 1 ? v.toFixed(2) : v) : v}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
