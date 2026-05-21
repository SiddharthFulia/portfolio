// Piece-set picker. Renders all 8 sets as live thumbnails — the white
// king SVG from each set, with the active one ring-highlighted.
//
// Props:
//   value     — current setId
//   onChange  — (setId) => void
//
// Source: SVGs are copied from Lichess's lila/public/piece/ at build
// time → lived under portfolio/public/piece/{set}/{wK,wQ,...}.svg.

import { PIECE_SETS } from './usePieceSet'

export default function PieceSetPicker({ value, onChange }) {
  return (
    <div className="luxe-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Piece set</p>
      <div className="grid grid-cols-4 gap-1.5">
        {PIECE_SETS.map(set => (
          <button
            key={set.id}
            onClick={() => onChange(set.id)}
            title={`${set.label} · ${set.blurb}`}
            className={`group relative aspect-square rounded-lg border-2 bg-gray-900/40 hover:bg-gray-900 transition-all overflow-hidden ${
              value === set.id
                ? 'border-amber-400 ring-2 ring-amber-400/40'
                : 'border-gray-800 hover:border-gray-600'
            }`}
          >
            <img
              src={`/piece/${set.id}/wK.svg`}
              alt={set.label}
              className="absolute inset-0 w-full h-full object-contain p-1"
              loading="lazy"
            />
            <span className={`absolute bottom-0 left-0 right-0 text-[8px] font-semibold uppercase tracking-wider px-1 py-0.5 backdrop-blur-sm ${
              value === set.id
                ? 'bg-amber-400/90 text-black'
                : 'bg-black/50 text-gray-400 group-hover:text-gray-200'
            }`}>
              {set.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
