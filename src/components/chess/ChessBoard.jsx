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

// chess.js .moves({square, verbose:true}) → chessground destination Map.
function buildDests(chess) {
  const dests = new Map()
  for (const sq of chess.SQUARES) {
    const moves = chess.moves({ square: sq, verbose: true })
    if (moves.length) dests.set(sq, moves.map(m => m.to))
  }
  return dests
}

export default function ChessBoard({
  chess, fen, orientation = 'white', movableColor, onMove,
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

  // Sync state from React → chessground on every change.
  useEffect(() => {
    const cg = cgRef.current
    if (!cg) return
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
    })
  }, [fen, orientation, movableColor, chess])

  return <div ref={elRef} className="w-full aspect-square cg-wrap" />
}
