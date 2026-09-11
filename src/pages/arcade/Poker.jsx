// 5-Card Draw — placeholder. The real implementation ships in the
// arcade drop. GameShell is already wired so the top bar / left rail
// / bottom bar all render — the sibling agent for this game only
// swaps in the game viewport (canvas or DOM) as `children`.

import GameShell from '../../components/arcade/GameShell'

export default function Poker() {
  return (
    <GameShell title="5-Card Draw" category="Card" status="idle">
      <div className="p-8 text-center min-h-[50vh] flex flex-col items-center justify-center gap-3 text-white/50">
        <div className="text-6xl select-none" role="img" aria-label="5-Card Draw">♥️</div>
        <div className="text-white/80 font-semibold text-lg">5-Card Draw</div>
        <div className="text-sm max-w-md">Draw and hold — best 5-card poker hand wins.</div>
        <div className="text-xs mt-4 text-white/40">Coming in the arcade drop — check back soon.</div>
      </div>
    </GameShell>
  )
}
