// Vertical eval bar — white-share fill, animates on change.
//
// Props:
//   score        — { type: 'cp'|'mate', value: number } | null
//   orientation  — 'white' (default) or 'black' — when black, flip so the
//                  player's colour is at the bottom

const SAT_CP = 500   // ±500cp saturates the bar (any larger pins it at 100/0)

function pct(score) {
  if (!score) return 50
  if (score.type === 'mate') return score.value > 0 ? 99 : 1
  const cp = Math.max(-SAT_CP, Math.min(SAT_CP, score.value))
  return 50 + (cp / (SAT_CP * 2)) * 100
}

export default function EvalBar({ score, orientation = 'white' }) {
  const whitePct = pct(score)
  const shownPct = orientation === 'white' ? whitePct : 100 - whitePct
  return (
    <div className="w-3 rounded-full bg-gray-800 overflow-hidden flex flex-col-reverse"
      style={{ aspectRatio: '1 / 20' }}>
      <div
        className="bg-gradient-to-t from-gray-200 to-white transition-all duration-500"
        style={{ height: `${shownPct}%` }}
      />
    </div>
  )
}
