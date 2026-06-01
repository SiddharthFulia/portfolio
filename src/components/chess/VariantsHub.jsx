// VariantsHub — rules-only reference card. Renders BELOW the shared board
// on /chess when the user is in a non-standard mode. It used to ship its
// own second board for each variant; that's gone — variants now play on
// the ONE board at the top of /chess, driven by the chessops adapter in
// src/lib/variantGame.js. Lichess's chessops library implements the real
// rules for Atomic, Antichess, Crazyhouse, Horde, KoTH, Three-Check,
// Racing Kings and 960 — same library their site uses. No second board,
// no separate chess.js instance, no duplicated UI.

import { useMemo } from 'react'

// Rule blurbs — keyed by the variantGame mode id. Standard / 960 / offline
// are NOT listed here because they don't need a separate reference card.
const VARIANTS = {
  koth: {
    name: 'King of the Hill',
    aka: 'KoTH',
    icon: '⛰️',
    eco: 'KOTH',
    engine: true,
    summary: 'First king to reach one of the four central squares (d4, e4, d5, e5) wins. Checkmate also wins as normal.',
    rulesBy: 'chessops',
  },
  threeCheck: {
    name: 'Three-Check',
    aka: '3-Check',
    icon: '✓✓✓',
    eco: '3C',
    engine: true,
    summary: 'Standard rules, but the first side to deliver three checks wins immediately. Mate ends the game as usual.',
    rulesBy: 'chessops',
  },
  atomic: {
    name: 'Atomic',
    aka: 'Boom chess',
    icon: '💥',
    eco: 'ATM',
    engine: false,
    summary: "Captures detonate a 3×3 square (pawns excepted). Win by exploding the opponent's king. chessops enforces blast rules — own king can't be captured, kings can't be exposed by the blast.",
    rulesBy: 'chessops',
  },
  antichess: {
    name: 'Antichess',
    aka: 'Losing chess',
    icon: '🪞',
    eco: 'ATC',
    engine: false,
    summary: 'Captures are mandatory. The king is just a piece — no check, no mate. First to lose every piece (or stalemate without legal moves) wins. chessops enforces forced-capture legality.',
    rulesBy: 'chessops',
  },
  horde: {
    name: 'Horde',
    aka: 'Pawn swarm',
    icon: '🛡️',
    eco: 'HRD',
    engine: false,
    summary: 'Black plays standard. White has 36 pawns and no other pieces. White wins by mating Black; Black wins by clearing the swarm.',
    rulesBy: 'chessops',
  },
  crazyhouse: {
    name: 'Crazyhouse',
    aka: 'Drop chess',
    icon: '♛↺',
    eco: 'CZH',
    engine: false,
    summary: 'Captured pieces switch sides and join your reserve. You can drop them on any empty square as your move (pawns excluded from the back ranks).',
    rulesBy: 'chessops',
  },
  racingKings: {
    name: 'Racing Kings',
    aka: 'King race',
    icon: '🏁',
    eco: 'RK',
    engine: false,
    summary: 'No checks allowed (any move that gives check is illegal). First king to reach the 8th rank wins; if White makes it, Black gets one move to match.',
    rulesBy: 'chessops',
  },
  chess960: {
    name: 'Chess960',
    aka: 'Fischer Random',
    icon: '🎲',
    eco: 'FRC',
    engine: true,
    summary: 'Back rank shuffled. Bishops on opposite colours, king between rooks. Castling adapts to starting files (X-FEN). Stockfish plays with UCI_Chess960 = true.',
    rulesBy: 'chess.js + Stockfish',
  },
}

// Default export — accepts `activeMode` so callers can highlight which
// variant the user is currently in. Renders a single luxe card with the
// rule blurb + a meta strip showing the rules-engine credit.
export default function VariantsHub({ activeMode }) {
  const variant = useMemo(() => VARIANTS[activeMode] || null, [activeMode])
  if (!variant) return null
  return (
    <section className="mt-6">
      <div className="luxe-card p-4 sm:p-5 border-amber-500/30">
        <div className="flex items-start gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl leading-none">{variant.icon}</span>
            <div>
              <h3 className="text-base font-bold text-amber-200">{variant.name}</h3>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">
                {variant.aka} · ECO {variant.eco}
              </p>
            </div>
          </div>
          <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-lg border border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200">
            Rules: {variant.rulesBy}
          </span>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed">{variant.summary}</p>
        {!variant.engine && (
          <p className="mt-3 text-[11px] text-gray-500 italic">
            Stockfish doesn&apos;t play this variant — pass-and-play only. The board enforces
            legality via Lichess&apos;s chessops library (the same rules engine lichess.org uses).
          </p>
        )}
      </div>
    </section>
  )
}
