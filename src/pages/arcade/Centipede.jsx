// Centipede — placeholder. The real implementation ships in the
// arcade drop. GameShell is already wired so the top bar / left rail
// / bottom bar all render — the sibling agent for this game only
// swaps in the game viewport (canvas or DOM) as `children`.

import GameShell from '../../components/arcade/GameShell'

export default function Centipede() {
  return (
    <GameShell title="Centipede" category="Retro" status="idle">
      <div className="p-8 text-center min-h-[50vh] flex flex-col items-center justify-center gap-3 text-white/50">
        <div className="text-6xl select-none" role="img" aria-label="Centipede">🐛</div>
        <div className="text-white/80 font-semibold text-lg">Centipede</div>
        <div className="text-sm max-w-md">Shoot the centipede as it winds down. Watch for spiders.</div>
        <div className="text-xs mt-4 text-white/40">Coming in the arcade drop — check back soon.</div>
      </div>
    </GameShell>
  )
}
