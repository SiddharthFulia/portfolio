// <GameRules> — modal rulebook shown when a player taps the "?" button in
// the GameShell top bar. Renders a scrollable stack of {heading, body}
// sections. Purely presentational — the shell owns open/close state.
//
// Usage:
//   <GameRules
//     open={rulesOpen}
//     onClose={() => setRulesOpen(false)}
//     title="Breakout — How to Play"
//     sections={RULES}
//   />
//
// Design choices:
//   • Full-screen on mobile, centred card on ≥ md.
//   • Escape and backdrop click both close.
//   • Reduced-motion friendly (no entry animation flash).
//   • Content stays a plain text array — no rich HTML injection, so
//     rulebooks stay easy to grep and diff.

import { useEffect, useRef } from 'react'

export default function GameRules({
  open,
  onClose,
  title = 'How to play',
  sections = [],
}) {
  const cardRef = useRef(null)

  // Escape closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Focus the modal card on open so screen-readers announce it.
  useEffect(() => {
    if (open && cardRef.current) cardRef.current.focus()
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-rules-title"
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-2xl max-h-[92vh] md:max-h-[85vh] rounded-t-2xl md:rounded-2xl bg-[#0f0f16] border border-white/10 shadow-2xl flex flex-col outline-none"
      >
        <header className="flex items-center gap-3 px-5 py-4 border-b border-white/10 shrink-0">
          <h2
            id="game-rules-title"
            className="font-poppins font-black text-lg sm:text-xl bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent flex-1 truncate"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rules"
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-white/15 hover:border-white/40 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {sections.length === 0 ? (
            <p className="text-white/50 text-sm">Rulebook coming soon.</p>
          ) : (
            sections.map((s, i) => (
              <section key={i} className="space-y-1.5">
                <h3 className="font-poppins font-bold text-sm uppercase tracking-wide text-amber-300">
                  {s.heading}
                </h3>
                <p className="text-white/80 text-sm leading-relaxed whitespace-pre-line">
                  {s.body}
                </p>
              </section>
            ))
          )}
        </div>

        <footer className="px-5 py-3 border-t border-white/10 shrink-0 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors"
          >
            Got it
          </button>
        </footer>
      </div>
    </div>
  )
}
