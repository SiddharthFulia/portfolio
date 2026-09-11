// Snake AI — placeholder. The real implementation ships in the
// arcade drop. GameShell is already wired so the top bar / left rail
// / bottom bar all render — the sibling agent for this game only
// swaps in the game viewport (canvas or DOM) as `children`.

import GameShell from '../../components/arcade/GameShell'

export default function SnakeAi() {
  return (
    <GameShell title="Snake AI" category="Strategy" status="idle">
      <div className="p-8 text-center min-h-[50vh] flex flex-col items-center justify-center gap-3 text-white/50">
        <div className="text-6xl select-none" role="img" aria-label="Snake AI">🐍</div>
        <div className="text-white/80 font-semibold text-lg">Snake AI</div>
        <div className="text-sm max-w-md">Watch a genetic-algorithm-trained snake play itself.</div>
        <div className="text-xs mt-4 text-white/40">Coming in the arcade drop — check back soon.</div>
      </div>
    </GameShell>
  )
}
