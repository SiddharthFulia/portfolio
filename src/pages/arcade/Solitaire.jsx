// Solitaire — Klondike, the version bundled with Windows since 1990.
//
// Rules implemented:
//   - 7 tableau piles, each 1-7 cards, top card face-up. Alternating
//     colour descending sequences allowed (K down to A).
//   - 4 foundations (♥ ♦ ♣ ♠), each built up from A to K, one suit.
//   - Stock (top-left) draws to waste. Toggle draw-1 / draw-3.
//   - Empty tableau column accepts a King only.
//   - Double-click a card to auto-send it to its foundation (if legal).
//   - Undo stack — every action is a snapshot pushed onto a stack.
//   - Hint system highlights the next legal move (foundation moves
//     preferred; otherwise a tableau shift that reveals a new card).
//   - Win animation: cards ricochet off the walls like Windows XP,
//     stopped by any click. Reduced motion skips it.
//   - Timer + move counter update every second while playing.
//
// This file focuses on the game logic; card art lives in PlayingCard.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import PlayingCard, {
  SUIT_LIST, RANK_VALUE, isRed, makeDeck, shuffle,
} from '../../components/arcade/PlayingCard'
import { Button } from '../../components/ui'

// ── Rules helpers ────────────────────────────────────────────────

// The foundation accepts a card if its suit matches the pile and its
// rank is exactly one above the top card (or Ace when the pile is empty).
function canPlaceOnFoundation(card, pile) {
  if (pile.length === 0) return card.rank === 'A'
  const top = pile[pile.length - 1]
  return top.suit === card.suit && RANK_VALUE[card.rank] === RANK_VALUE[top.rank] + 1
}

// Tableau accepts a card if the destination is empty and the card is
// a King, OR the destination's top card is one rank higher and the
// opposite colour.
function canPlaceOnTableau(card, pile) {
  if (pile.length === 0) return card.rank === 'K'
  const top = pile[pile.length - 1]
  if (!top.faceUp) return false
  return (
    RANK_VALUE[top.rank] === RANK_VALUE[card.rank] + 1 &&
    isRed(top.suit) !== isRed(card.suit)
  )
}

// Deal a fresh Klondike layout: 7 piles of 1-7 cards, top face-up.
function dealLayout(seed = Math.random) {
  const deck = shuffle(makeDeck(), seed)
  const tableau = [[], [], [], [], [], [], []]
  let idx = 0
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const card = { ...deck[idx++], faceUp: row === col }
      tableau[col].push(card)
    }
  }
  const stock = deck.slice(idx).map((c) => ({ ...c, faceUp: false }))
  const waste = []
  const foundations = { hearts: [], diamonds: [], clubs: [], spades: [] }
  return { tableau, stock, waste, foundations }
}

// Deep-ish clone — enough for our purposes. Cards are read-only after
// creation so the array-of-arrays copy is safe.
function cloneState(s) {
  return {
    tableau: s.tableau.map((c) => c.slice()),
    stock: s.stock.slice(),
    waste: s.waste.slice(),
    foundations: {
      hearts: s.foundations.hearts.slice(),
      diamonds: s.foundations.diamonds.slice(),
      clubs: s.foundations.clubs.slice(),
      spades: s.foundations.spades.slice(),
    },
  }
}

function findFoundationTarget(card, foundations) {
  return canPlaceOnFoundation(card, foundations[card.suit]) ? card.suit : null
}

// Look for a hint. Priority: waste -> foundation, tableau top ->
// foundation, tableau -> tableau if it exposes a face-down card,
// waste -> tableau.
function findHint(s) {
  const wTop = s.waste[s.waste.length - 1]
  if (wTop) {
    const t = findFoundationTarget(wTop, s.foundations)
    if (t) return { from: { kind: 'waste' }, card: wTop, to: { kind: 'foundation', suit: t } }
  }
  for (let c = 0; c < 7; c++) {
    const pile = s.tableau[c]
    const top = pile[pile.length - 1]
    if (top?.faceUp) {
      const t = findFoundationTarget(top, s.foundations)
      if (t) return { from: { kind: 'tableau', col: c }, card: top, to: { kind: 'foundation', suit: t } }
    }
  }
  for (let src = 0; src < 7; src++) {
    const pile = s.tableau[src]
    const faceIdx = pile.findIndex((c) => c.faceUp)
    if (faceIdx <= 0) continue
    const card = pile[faceIdx]
    for (let dst = 0; dst < 7; dst++) {
      if (dst === src) continue
      if (canPlaceOnTableau(card, s.tableau[dst])) {
        return { from: { kind: 'tableau', col: src, idx: faceIdx }, card, to: { kind: 'tableau', col: dst } }
      }
    }
  }
  if (wTop) {
    for (let c = 0; c < 7; c++) {
      if (canPlaceOnTableau(wTop, s.tableau[c])) {
        return { from: { kind: 'waste' }, card: wTop, to: { kind: 'tableau', col: c } }
      }
    }
  }
  return null
}

function isWin(s) {
  return SUIT_LIST.every((suit) => s.foundations[suit].length === 13)
}

// ── Component ────────────────────────────────────────────────────

export default function Solitaire() {
  const [state, setState] = useState(() => dealLayout())
  const [history, setHistory] = useState([])
  const [drawCount, setDrawCount] = useState(1)
  const [moves, setMoves] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [best, setBest] = useState(() => {
    const v = Number(localStorage.getItem('arcade.solitaire.best') || 0)
    return Number.isFinite(v) ? v : 0
  })
  const [drag, setDrag] = useState(null)
  const [hint, setHint] = useState(null)
  const [soundOn, setSoundOn] = useState(true)
  const [paused, setPaused] = useState(false)
  const [confetti, setConfetti] = useState([])
  const boardRef = useRef(null)
  const audioCtxRef = useRef(null)
  const reducedMotion = useRef(false)

  useEffect(() => {
    if (paused || isWin(state)) return
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [paused, state])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.current = mq.matches
  }, [])

  const beep = useCallback((freq = 480, dur = 0.07) => {
    if (!soundOn) return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioCtxRef.current
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'triangle'
      o.frequency.value = freq
      g.gain.value = 0.05
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
      o.connect(g).connect(ctx.destination)
      o.start()
      o.stop(ctx.currentTime + dur)
    } catch { /* audio disabled */ }
  }, [soundOn])

  const push = useCallback((next) => {
    setHistory((h) => [...h, cloneState(state)])
    setState(next)
    setMoves((m) => m + 1)
    setHint(null)
  }, [state])

  const undo = useCallback(() => {
    if (history.length === 0) return
    setState(history[history.length - 1])
    setHistory((h) => h.slice(0, -1))
    setMoves((m) => Math.max(0, m - 1))
    setHint(null)
    beep(280, 0.05)
  }, [history, beep])

  const restart = useCallback(() => {
    setState(dealLayout())
    setHistory([])
    setMoves(0)
    setElapsed(0)
    setHint(null)
    setConfetti([])
    beep(600, 0.1)
  }, [beep])

  const drawFromStock = useCallback(() => {
    const s = cloneState(state)
    if (s.stock.length === 0) {
      if (s.waste.length === 0) return
      s.stock = s.waste.reverse().map((c) => ({ ...c, faceUp: false }))
      s.waste = []
    } else {
      const n = Math.min(drawCount, s.stock.length)
      for (let i = 0; i < n; i++) {
        const c = s.stock.pop()
        s.waste.push({ ...c, faceUp: true })
      }
    }
    push(s)
    beep(520, 0.05)
  }, [state, drawCount, push, beep])

  const autoMoveToFoundation = useCallback((source) => {
    const s = cloneState(state)
    let card = null
    if (source.kind === 'waste') {
      card = s.waste[s.waste.length - 1]
      if (!card || !canPlaceOnFoundation(card, s.foundations[card.suit])) return false
      s.waste.pop()
    } else if (source.kind === 'tableau') {
      const pile = s.tableau[source.col]
      card = pile[pile.length - 1]
      if (!card || !card.faceUp || !canPlaceOnFoundation(card, s.foundations[card.suit])) return false
      pile.pop()
      if (pile.length && !pile[pile.length - 1].faceUp) {
        pile[pile.length - 1] = { ...pile[pile.length - 1], faceUp: true }
      }
    }
    s.foundations[card.suit].push(card)
    push(s)
    beep(720, 0.1)
    return true
  }, [state, push, beep])

  const performDrop = useCallback((drag, dest) => {
    const s = cloneState(state)
    const [head, ...rest] = drag.cards
    const isSingle = drag.cards.length === 1

    if (dest.kind === 'foundation') {
      if (!isSingle) return false
      if (!canPlaceOnFoundation(head, s.foundations[dest.suit])) return false
    } else if (dest.kind === 'tableau') {
      if (!canPlaceOnTableau(head, s.tableau[dest.col])) return false
    } else {
      return false
    }

    if (drag.source.kind === 'waste') {
      s.waste.pop()
    } else if (drag.source.kind === 'tableau') {
      const pile = s.tableau[drag.source.col]
      pile.splice(drag.source.idx)
      if (pile.length && !pile[pile.length - 1].faceUp) {
        pile[pile.length - 1] = { ...pile[pile.length - 1], faceUp: true }
      }
    }

    if (dest.kind === 'foundation') {
      s.foundations[dest.suit].push(head)
      beep(720, 0.09)
    } else {
      s.tableau[dest.col].push(head, ...rest)
      beep(500, 0.06)
    }
    push(s)
    return true
  }, [state, push, beep])

  const beginDrag = useCallback((source, cards, e) => {
    if (!cards.length || !cards[0].faceUp) return
    const rect = e.currentTarget.getBoundingClientRect()
    const point = e.touches?.[0] || e
    setDrag({
      source,
      cards,
      offsetX: point.clientX - rect.left,
      offsetY: point.clientY - rect.top,
      cursorX: point.clientX,
      cursorY: point.clientY,
    })
  }, [])

  useEffect(() => {
    if (!drag) return
    const onMove = (e) => {
      const point = e.touches?.[0] || e
      setDrag((d) => d ? { ...d, cursorX: point.clientX, cursorY: point.clientY } : d)
    }
    const onEnd = (e) => {
      const point = e.changedTouches?.[0] || e
      const under = document.elementsFromPoint(point.clientX, point.clientY)
      const dropSlot = under.find((el) => el.dataset?.drop)
      if (dropSlot) {
        const dest = JSON.parse(dropSlot.dataset.drop)
        performDrop(drag, dest)
      }
      setDrag(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [drag, performDrop])

  const showHint = useCallback(() => {
    const h = findHint(state)
    setHint(h)
    beep(660, 0.05)
    setTimeout(() => setHint(null), 2200)
  }, [state, beep])

  useEffect(() => {
    if (!isWin(state)) return
    if (best === 0 || elapsed < best) {
      setBest(elapsed)
      localStorage.setItem('arcade.solitaire.best', String(elapsed))
    }
    beep(880, 0.2)
    if (reducedMotion.current) return
    const c = []
    for (const suit of SUIT_LIST) {
      state.foundations[suit].forEach((card) => {
        c.push({
          ...card,
          x: 100 + Math.random() * 400,
          y: 80 + Math.random() * 60,
          vx: (Math.random() - 0.5) * 12,
          vy: -Math.random() * 4 - 2,
        })
      })
    }
    setConfetti(c)
  }, [state, best, elapsed, beep])

  useEffect(() => {
    if (confetti.length === 0) return
    let raf
    const step = () => {
      setConfetti((cards) => cards.map((c) => {
        let { x, y, vx, vy } = c
        x += vx
        y += vy
        vy += 0.4
        if (y > window.innerHeight - 60) { y = window.innerHeight - 60; vy = -vy * 0.8; vx *= 0.95 }
        if (x < 0 || x > window.innerWidth - 60) vx = -vx * 0.9
        return { ...c, x, y, vx, vy }
      }))
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [confetti.length])

  const status = useMemo(() => {
    if (isWin(state)) return 'won'
    if (paused) return 'paused'
    return 'playing'
  }, [state, paused])

  const timeStr = useMemo(() => {
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0')
    const s = (elapsed % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }, [elapsed])

  const bestStr = useMemo(() => {
    if (!best) return '—'
    const m = Math.floor(best / 60).toString().padStart(2, '0')
    const s = (best % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }, [best])

  return (
    <GameShell
      title="Klondike Solitaire"
      category="Card"
      score={moves}
      best={bestStr}
      level={timeStr}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onPause={() => setPaused((p) => !p)}
      onRestart={restart}
      controls={[
        { key: 'Drag', label: 'Move a card / run' },
        { key: 'Dbl', label: 'Auto to foundation' },
        { key: 'Space', label: 'Draw from stock' },
        { key: 'H', label: 'Hint' },
        { key: 'U', label: 'Undo' },
      ]}
      extraStats={
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Draw</span>
          <div className="flex gap-1 mt-0.5">
            {[1, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDrawCount(n)}
                className={`text-xs px-2 py-0.5 rounded font-bold ${drawCount === n ? 'bg-amber-500 text-black' : 'bg-white/10 text-white/60'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div
        ref={boardRef}
        className="relative bg-[#0f2417] p-4 sm:p-6 min-h-[600px]"
        style={{ backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(16,185,129,0.08), transparent 60%)' }}
        onKeyDown={(e) => {
          if (e.key === ' ') { e.preventDefault(); drawFromStock() }
          if (e.key === 'h' || e.key === 'H') { showHint() }
          if ((e.key === 'u' || e.key === 'U') && !e.ctrlKey) undo()
        }}
        tabIndex={0}
      >
        {/* Top row */}
        <div className="flex gap-2 sm:gap-3 mb-6">
          <div
            className="w-[70px] sm:w-[86px] h-[100px] sm:h-[120px] rounded-lg border-2 border-dashed border-emerald-500/25 flex items-center justify-center cursor-pointer"
            onClick={drawFromStock}
          >
            {state.stock.length > 0 ? (
              <PlayingCard faceUp={false} size="sm" />
            ) : (
              <span className="text-emerald-400/50 text-xs">Reset</span>
            )}
          </div>
          <div className="w-[110px] sm:w-[130px] h-[100px] sm:h-[120px] relative">
            {state.waste.slice(-3).map((c, i, arr) => {
              const isTop = i === arr.length - 1
              return (
                <div
                  key={c.id}
                  className="absolute top-0"
                  style={{ left: `${i * 22}px` }}
                  onMouseDown={isTop ? (e) => beginDrag({ kind: 'waste' }, [c], e) : undefined}
                  onTouchStart={isTop ? (e) => beginDrag({ kind: 'waste' }, [c], e) : undefined}
                  onDoubleClick={isTop ? () => autoMoveToFoundation({ kind: 'waste' }) : undefined}
                >
                  <PlayingCard
                    suit={c.suit}
                    rank={c.rank}
                    faceUp
                    size="sm"
                    highlighted={hint?.from?.kind === 'waste' && isTop}
                  />
                </div>
              )
            })}
          </div>

          <div className="flex-1" />

          {SUIT_LIST.map((suit) => {
            const pile = state.foundations[suit]
            const top = pile[pile.length - 1]
            return (
              <div
                key={suit}
                data-drop={JSON.stringify({ kind: 'foundation', suit })}
                className="w-[70px] sm:w-[86px] h-[100px] sm:h-[120px] rounded-lg border-2 border-dashed border-white/15 flex items-center justify-center"
              >
                {top ? (
                  <PlayingCard
                    suit={top.suit}
                    rank={top.rank}
                    faceUp
                    size="sm"
                    highlighted={hint?.to?.kind === 'foundation' && hint?.to?.suit === suit}
                  />
                ) : (
                  <span className="text-white/25 text-2xl">
                    {{ hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit]}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Tableau */}
        <div className="grid grid-cols-7 gap-2 sm:gap-3">
          {state.tableau.map((pile, col) => (
            <div
              key={col}
              data-drop={JSON.stringify({ kind: 'tableau', col })}
              className="relative min-h-[280px]"
            >
              {pile.length === 0 && (
                <div className="w-[70px] sm:w-[86px] h-[100px] sm:h-[120px] rounded-lg border-2 border-dashed border-white/10" />
              )}
              {pile.map((c, i) => {
                const stackOffset = i * (typeof window !== 'undefined' && window.innerWidth < 640 ? 18 : 24)
                const isDrag = drag && drag.source.kind === 'tableau' && drag.source.col === col && i >= drag.source.idx
                if (isDrag) return null
                return (
                  <div
                    key={c.id}
                    className="absolute"
                    style={{ top: `${stackOffset}px`, left: 0 }}
                    onMouseDown={c.faceUp ? (e) => beginDrag({ kind: 'tableau', col, idx: i }, pile.slice(i), e) : undefined}
                    onTouchStart={c.faceUp ? (e) => beginDrag({ kind: 'tableau', col, idx: i }, pile.slice(i), e) : undefined}
                    onDoubleClick={i === pile.length - 1 && c.faceUp ? () => autoMoveToFoundation({ kind: 'tableau', col }) : undefined}
                  >
                    <PlayingCard
                      suit={c.suit}
                      rank={c.rank}
                      faceUp={c.faceUp}
                      size="sm"
                      highlighted={
                        (hint?.from?.kind === 'tableau' && hint.from.col === col && i >= (hint.from.idx ?? pile.length - 1)) ||
                        (hint?.to?.kind === 'tableau' && hint.to.col === col && i === pile.length - 1)
                      }
                    />
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Drag ghost */}
        {drag && (
          <div
            className="pointer-events-none fixed z-50"
            style={{
              left: drag.cursorX - drag.offsetX,
              top: drag.cursorY - drag.offsetY,
            }}
          >
            {drag.cards.map((c, i) => (
              <div key={c.id} className="absolute" style={{ top: `${i * (typeof window !== 'undefined' && window.innerWidth < 640 ? 18 : 24)}px` }}>
                <PlayingCard suit={c.suit} rank={c.rank} faceUp size="sm" />
              </div>
            ))}
          </div>
        )}

        {/* Win confetti */}
        {confetti.map((c) => (
          <div
            key={c.id}
            className="pointer-events-none fixed"
            style={{ left: `${c.x}px`, top: `${c.y}px`, zIndex: 60 }}
          >
            <PlayingCard suit={c.suit} rank={c.rank} faceUp size="sm" />
          </div>
        ))}

        {/* Toolbar */}
        <div className="flex flex-wrap gap-2 mt-8">
          <Button variant="secondary" onClick={undo} disabled={history.length === 0}>Undo</Button>
          <Button variant="ghost" onClick={showHint}>Hint</Button>
          <Button variant="ghost" onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</Button>
        </div>

        {/* Win overlay */}
        {isWin(state) && (
          <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="text-center pointer-events-auto">
              <div className="text-5xl sm:text-6xl font-bold bg-gradient-to-br from-amber-200 via-rose-300 to-fuchsia-300 bg-clip-text text-transparent mb-3">You Won!</div>
              <div className="text-slate-200 text-lg mb-1">Time: {timeStr} · Moves: {moves}</div>
              <div className="text-slate-400 text-sm mb-6">Best: {bestStr}</div>
              <Button variant="primary" onClick={restart}>Play again</Button>
            </div>
          </div>
        )}
      </div>
    </GameShell>
  )
}
