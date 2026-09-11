// Missile Command — placeholder. The real implementation ships in the
// arcade drop. GameShell is already wired so the top bar / left rail
// / bottom bar all render — the sibling agent for this game only
// swaps in the game viewport (canvas or DOM) as `children`.

import GameShell from '../../components/arcade/GameShell'

export default function MissileCommand() {
  return (
    <GameShell title="Missile Command" category="Arcade" status="idle">
      <div className="p-8 text-center min-h-[50vh] flex flex-col items-center justify-center gap-3 text-white/50">
        <div className="text-6xl select-none" role="img" aria-label="Missile Command">🚀</div>
        <div className="text-white/80 font-semibold text-lg">Missile Command</div>
        <div className="text-sm max-w-md">Defend six cities from ICBMs. Cursor to aim.</div>
        <div className="text-xs mt-4 text-white/40">Coming in the arcade drop — check back soon.</div>
      </div>
    </GameShell>
  )
}
