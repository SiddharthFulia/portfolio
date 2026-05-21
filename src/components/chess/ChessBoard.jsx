// Chessground board wrapper. Owns the cg instance lifecycle and keeps it
// synced with the chess.js state passed in via props.
//
// Props:
//   chess        — chess.js Chess instance (single source of truth for moves)
//   fen          — string — pushed to cg on change (keeps the visual board honest)
//   orientation  — 'white' | 'black'
//   movableColor — 'white' | 'black' | null (null = view-only)
//   onMove       — (from, to) => void called after a legal user move

import { useEffect, useRef } from 'react'
import { Chessground } from 'chessground'
// chess.js v1+ moved SQUARES from an instance property to a named module
// export. Old v0.x code (`chess.SQUARES`) throws 'is not iterable' here.
import { SQUARES } from 'chess.js'

// chess.js .moves({square, verbose:true}) → chessground destination Map.
function buildDests(chess) {
  const dests = new Map()
  for (const sq of SQUARES) {
    const moves = chess.moves({ square: sq, verbose: true })
    if (moves.length) dests.set(sq, moves.map(m => m.to))
  }
  return dests
}

// Build chessground shape objects from a list of UCI moves. Top-ranked
// move gets the strongest colour; opacity drops per rank so the user can
// see at a glance which alternative is the engine's preference.
const ARROW_BRUSHES = ['green', 'paleGreen', 'blue']   // chessground built-in colour names
function uciToShape(uci, brushIdx) {
  return {
    orig: uci.slice(0, 2),
    dest: uci.slice(2, 4),
    brush: ARROW_BRUSHES[brushIdx] || 'paleBlue',
  }
}

export default function ChessBoard({
  chess, fen, orientation = 'white', movableColor, onMove,
  // candidateMoves — array of UCI strings, in ranked order. Top-3 are
  // drawn as arrows with descending intensity.
  candidateMoves = [],
  // layoutKey — bump from parent when surrounding layout shifts (clocks
  // appearing, fullscreen toggle, sidebar collapse). Triggers a
  // chessground.redrawAll() so click hitboxes stay aligned with the
  // visible pieces. Without this, clicks land on the OLD square positions
  // and the user 'selects rook' when hovering knight.
  layoutKey,
}) {
  const elRef = useRef(null)
  const cgRef = useRef(null)
  // Hold the latest onMove in a ref so the chessground events callback
  // doesn't capture a stale closure when the parent re-renders.
  const onMoveRef = useRef(onMove)
  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  // Init once on mount, destroy on unmount.
  useEffect(() => {
    if (!elRef.current || cgRef.current) return
    cgRef.current = Chessground(elRef.current, {
      fen,
      orientation,
      coordinates: true,
      movable: {
        free: false,
        color: movableColor,
        dests: buildDests(chess),
        events: {
          // chessground calls (from, to, metadata) — promotion handled by
          // auto-queening in chess.js (caller's onMove can override).
          after: (from, to) => onMoveRef.current?.(from, to),
        },
      },
      draggable: { showGhost: true, deleteOnDropOff: false },
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
      drawable: { enabled: true, visible: true },
    })
    return () => {
      cgRef.current?.destroy?.()
      cgRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Whenever the parent says the layout shifted (clocks toggled,
  // fullscreen on/off, sidebar collapse), force chessground to recompute
  // its bounding rect — otherwise the cached square offsets misalign with
  // the visible pieces and clicks land on the wrong square.
  useEffect(() => {
    if (!cgRef.current) return
    // requestAnimationFrame so the layout has committed before redraw.
    const id = requestAnimationFrame(() => cgRef.current?.redrawAll?.())
    return () => cancelAnimationFrame(id)
  }, [layoutKey])

  // Sync state from React → chessground on every change.
  useEffect(() => {
    const cg = cgRef.current
    if (!cg) return
    const autoShapes = (candidateMoves || []).slice(0, 3).map(uciToShape)
    cg.set({
      fen,
      orientation,
      turnColor: chess.turn() === 'w' ? 'white' : 'black',
      check: chess.inCheck(),
      movable: {
        color: movableColor,
        dests: movableColor ? buildDests(chess) : new Map(),
        events: {
          after: (from, to) => onMoveRef.current?.(from, to),
        },
      },
      drawable: { autoShapes },
    })
  }, [fen, orientation, movableColor, chess, candidateMoves])

  return <div ref={elRef} className="w-full aspect-square cg-wrap" />
}
