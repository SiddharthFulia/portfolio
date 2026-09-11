// Sokoban.jsx — box-pushing puzzle.
// 20 hand-crafted levels of ramping difficulty. Level select screen with
// completion stars (1 = solved, 2 = solved under par moves, 3 = solved
// well under par). Unlimited undo, restart, move counter, solution hint
// (BFS over box-push states — finds the next push toward optimal, may
// bail on the largest levels for perf). Custom level via ?lvl= query
// string, plus a small level editor.

import { useCallback, useEffect, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

// ── Level format ─────────────────────────────────────────
// Symbols: '#' wall, ' ' floor, '.' target, '$' box, '*' box on target,
//          '@' player, '+' player on target.

const RAW_LEVELS = [
  // 1 — warmup
  `#####
#.@ #
# $ #
#   #
#####`,
  // 2
  `#######
#.    #
#  $  #
#  @  #
#   $ #
#    .#
#######`,
  // 3
  `########
#      #
#  ##  #
# $ $  #
# .@.  #
#      #
########`,
  // 4
  `########
#.    .#
#  $$  #
#  @   #
#  $$  #
#.    .#
########`,
  // 5
  `#########
#   #   #
# $ #   #
#  @$ . #
# $ #   #
#   # . #
######..#
     ####`,
  // 6
  `########
#..    #
#..  $ #
#.. $  #
#  $   #
# @    #
#      #
########`,
  // 7 — tight corridor
  `#######
#.....#
#$$$$$#
#     #
#  @  #
#######`,
  // 8
  `##########
#  #     #
# @$  $. #
#  #  #. #
#  $  $. #
#  #  ## #
#     .  #
##########`,
  // 9
  `########
#      #
# ##.# #
# $  $ #
# .@$. #
# $  $ #
# #.## #
#      #
########`,
  // 10
  `##########
#........#
#$$$$$$$@#
#        #
##########`,
  // 11
  `########
#.  .  #
#  $$  #
# $ @$ #
#  $$  #
#.  .  #
########`,
  // 12
  `#########
#   #   #
# $ # . #
#  $#.  #
# @ #   #
# $ # . #
#   #   #
#########`,
  // 13
  `##########
#........#
# $$$$$$ #
#        #
#   @    #
##########`,
  // 14
  `##########
#   #    #
# $ # $. #
#   #    #
# $ @  . #
#   #    #
# $ # $. #
#   #    #
##########`,
  // 15
  `##########
#. . . . #
# $ $ $ $#
#        #
# $ $ $ $#
# . . . .#
#   @    #
##########`,
  // 16 — corner squeeze
  `#########
#.......#
#$$$$$$$#
#       #
#   @   #
#########`,
  // 17
  `##########
##...#####
##$$$#####
##  ######
##  $ .  #
##       #
##@    ..#
##########`,
  // 18
  `##########
#........#
# $$$$$$ #
#  #  #  #
# $    $ #
#  #  #  #
# $    $ #
#   @    #
##########`,
  // 19
  `############
#          #
# $  $  $  #
#          #
#  .  .  . #
#          #
#     @    #
############`,
  // 20 — grand finale
  `############
#. . . . . #
# $ $ $ $ $#
#          #
# $ $ $ $ $#
#. . . . . #
#     @    #
############`,
]

function parseLevel(raw) {
  const lines = raw.split('\n')
  const rows = lines.length
  const cols = Math.max(...lines.map((l) => l.length))
  const grid = []
  const boxes = []
  let player = null
  for (let r = 0; r < rows; r++) {
    const row = []
    for (let c = 0; c < cols; c++) {
      const ch = lines[r][c] || ' '
      if (ch === '#') row.push('#')
      else if (ch === '.' || ch === '*' || ch === '+') row.push('.')
      else row.push(' ')
      if (ch === '$' || ch === '*') boxes.push([c, r])
      if (ch === '@' || ch === '+') player = [c, r]
    }
    grid.push(row)
  }
  return { grid, boxes, player, cols, rows }
}

// ── Solver — BFS over (player, boxes) states, capped for perf.
function solveNext(state, cap = 200000) {
  const { grid, cols, rows } = state
  const key = (p, b) => `${p[0]},${p[1]}|${b.map(([x,y])=>x+','+y).sort().join(';')}`
  const startBoxes = state.boxes.map((b) => [...b])
  const start = { p: state.player.slice(), b: startBoxes, prev: null }
  const seen = new Set([key(start.p, start.b)])
  const queue = [start]
  let head = 0
  let nodes = 0
  const isTarget = (x, y) => grid[y]?.[x] === '.'
  const isWall = (x, y) => grid[y]?.[x] === '#' || x < 0 || y < 0 || x >= cols || y >= rows
  while (head < queue.length && nodes < cap) {
    const cur = queue[head++]; nodes++
    const allOn = cur.b.every(([x, y]) => isTarget(x, y))
    if (allOn) {
      // Walk back to the first move
      let n = cur
      while (n.prev && n.prev.prev != null) n = n.prev
      if (n.prev) return { p: n.p, b: n.b }
      return null
    }
    for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const nx = cur.p[0] + dx, ny = cur.p[1] + dy
      if (isWall(nx, ny)) continue
      let newB = cur.b
      const boxIdx = cur.b.findIndex(([bx, by]) => bx === nx && by === ny)
      if (boxIdx !== -1) {
        const bxN = nx + dx, byN = ny + dy
        if (isWall(bxN, byN)) continue
        if (cur.b.some(([bx, by]) => bx === bxN && by === byN)) continue
        newB = cur.b.map((b, i) => i === boxIdx ? [bxN, byN] : b)
      }
      const k = key([nx, ny], newB)
      if (seen.has(k)) continue
      seen.add(k)
      queue.push({ p: [nx, ny], b: newB, prev: cur })
    }
  }
  return null
}

function encodeLevel(text) {
  try { return btoa(unescape(encodeURIComponent(text))) } catch { return '' }
}
function decodeLevel(b64) {
  try { return decodeURIComponent(escape(atob(b64))) } catch { return null }
}

const PAR = [10, 22, 26, 34, 60, 44, 30, 60, 55, 40, 46, 44, 30, 70, 90, 24, 55, 80, 70, 100]

export default function Sokoban() {
  const canvasRef = useRef(null)
  const sfxRef = useRef(getSfx())

  const [soundOn, setSoundOn] = useState(true)
  const [levelIdx, setLevelIdx] = useState(0)
  const [showLevelSelect, setShowLevelSelect] = useState(true)
  const [showEditor, setShowEditor] = useState(false)
  const [stars, setStars] = useState({})
  const [moves, setMoves] = useState(0)
  const [status, setStatus] = useState('playing')
  const [hint, setHint] = useState(null)
  const [state, setState] = useState(() => parseLevel(RAW_LEVELS[0]))
  const historyRef = useRef([])
  const [playerFacing, setPlayerFacing] = useState('down')
  const boxSlideRef = useRef([])

  useEffect(() => { sfxRef.current.setEnabled(soundOn) }, [soundOn])
  useEffect(() => {
    try { setStars(JSON.parse(localStorage.getItem('sid-sokoban-stars') || '{}')) } catch {}
    const params = new URLSearchParams(window.location.search)
    const custom = params.get('lvl')
    if (custom) {
      const raw = decodeLevel(custom)
      if (raw) {
        const parsed = parseLevel(raw)
        if (parsed.player) {
          setState(parsed); setShowLevelSelect(false); setLevelIdx(-1); setMoves(0)
        }
      }
    }
  }, [])

  const loadLevel = (idx) => {
    setLevelIdx(idx)
    const parsed = parseLevel(RAW_LEVELS[idx])
    setState(parsed); setMoves(0); setStatus('playing'); setShowLevelSelect(false)
    historyRef.current = []
    setHint(null)
    boxSlideRef.current = []
  }

  const restart = () => {
    if (levelIdx >= 0) loadLevel(levelIdx)
    else {
      const params = new URLSearchParams(window.location.search)
      const custom = params.get('lvl')
      if (custom) {
        const raw = decodeLevel(custom)
        if (raw) setState(parseLevel(raw))
      }
      setMoves(0); historyRef.current = []; setHint(null); setStatus('playing')
    }
  }

  const undo = () => {
    const h = historyRef.current
    if (!h.length) return
    const prev = h.pop()
    setState(prev.state)
    setMoves(prev.moves)
    setStatus('playing')
    setHint(null)
    sfxRef.current.chirp()
  }

  const tryMove = useCallback((dx, dy) => {
    if (status === 'won') return
    setState((cur) => {
      const [px, py] = cur.player
      const nx = px + dx, ny = py + dy
      if (cur.grid[ny]?.[nx] === '#') { sfxRef.current.hit(); return cur }
      const boxIdx = cur.boxes.findIndex(([bx, by]) => bx === nx && by === ny)
      let newBoxes = cur.boxes
      if (boxIdx !== -1) {
        const bxN = nx + dx, byN = ny + dy
        if (cur.grid[byN]?.[bxN] === '#') { sfxRef.current.hit(); return cur }
        if (cur.boxes.some(([bx, by]) => bx === bxN && by === byN)) { sfxRef.current.hit(); return cur }
        newBoxes = cur.boxes.map((b, i) => i === boxIdx ? [bxN, byN] : b)
        boxSlideRef.current.push({ from: [nx, ny], to: [bxN, byN], t: 0 })
        if (cur.grid[byN]?.[bxN] === '.') sfxRef.current.pop()
        else sfxRef.current.hit()
      } else {
        sfxRef.current.chirp()
      }
      historyRef.current.push({
        state: { ...cur, boxes: cur.boxes.map((b) => [...b]), player: [...cur.player] },
        moves,
      })
      if (historyRef.current.length > 500) historyRef.current.shift()
      const face = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up'
      setPlayerFacing(face)
      setMoves((m) => m + 1)
      setHint(null)
      const allOn = newBoxes.every(([bx, by]) => cur.grid[by]?.[bx] === '.')
      if (allOn) {
        setStatus('won')
        sfxRef.current.win()
        if (levelIdx >= 0) {
          const par = PAR[levelIdx] || 30
          const m = moves + 1
          const s = m <= par * 0.75 ? 3 : m <= par * 1.1 ? 2 : 1
          setStars((prev) => {
            const cur = prev[levelIdx] || 0
            const next = { ...prev, [levelIdx]: Math.max(cur, s) }
            try { localStorage.setItem('sid-sokoban-stars', JSON.stringify(next)) } catch {}
            return next
          })
        }
      }
      return { ...cur, boxes: newBoxes, player: [nx, ny] }
    })
  }, [status, moves, levelIdx])

  useEffect(() => {
    const onKey = (e) => {
      if (showLevelSelect || showEditor) return
      if (e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); tryMove(0, -1) }
      else if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); tryMove(0, 1) }
      else if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); tryMove(-1, 0) }
      else if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); tryMove(1, 0) }
      else if (e.key === 'z' || e.key === 'Z') undo()
      else if (e.key === 'r' || e.key === 'R') restart()
      else if (e.key === 'h' || e.key === 'H') runHint()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryMove, showLevelSelect, showEditor])

  const runHint = () => {
    if (status === 'won') return
    setHint({ loading: true })
    setTimeout(() => {
      const result = solveNext(state)
      if (!result) { setHint({ err: 'No solution found (or too complex).' }); return }
      const [px, py] = state.player
      const dx = result.p[0] - px, dy = result.p[1] - py
      const dir = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up'
      setHint({ next: result.p, dir })
    }, 20)
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const cellPx = 40
    canvas.width = state.cols * cellPx * dpr
    canvas.height = state.rows * cellPx * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let raf = 0
    let last = performance.now()

    const draw = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      for (const s of boxSlideRef.current) s.t += dt * 6
      boxSlideRef.current = boxSlideRef.current.filter((s) => s.t < 1)

      ctx.fillStyle = '#0a0a0e'
      ctx.fillRect(0, 0, state.cols * cellPx, state.rows * cellPx)
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          const tile = state.grid[r][c]
          if (tile === '#') {
            ctx.fillStyle = '#57534e'
            ctx.fillRect(c * cellPx, r * cellPx, cellPx, cellPx)
            ctx.strokeStyle = '#292524'
            ctx.strokeRect(c*cellPx + 0.5, r*cellPx + 0.5, cellPx - 1, cellPx - 1)
            ctx.fillStyle = '#78716c'
            for (let bi = 0; bi < 3; bi++) {
              const y = r*cellPx + bi * 13 + 3
              const off = bi % 2 === 0 ? 0 : cellPx / 2
              ctx.fillRect(c*cellPx + off + 2, y, cellPx / 2 - 4, 10)
            }
          } else {
            const shade = (c + r) % 2 === 0 ? '#1e293b' : '#293548'
            ctx.fillStyle = shade
            ctx.fillRect(c*cellPx, r*cellPx, cellPx, cellPx)
          }
          if (tile === '.') {
            ctx.strokeStyle = '#f97316'
            ctx.lineWidth = 2
            ctx.beginPath(); ctx.arc(c*cellPx + cellPx/2, r*cellPx + cellPx/2, cellPx*0.28, 0, Math.PI*2); ctx.stroke()
            ctx.strokeStyle = '#fed7aa'
            ctx.beginPath(); ctx.arc(c*cellPx + cellPx/2, r*cellPx + cellPx/2, cellPx*0.12, 0, Math.PI*2); ctx.stroke()
          }
        }
      }

      if (hint?.next) {
        const [hx, hy] = hint.next
        ctx.strokeStyle = '#fbbf24'
        ctx.lineWidth = 3
        ctx.setLineDash([4, 3])
        ctx.strokeRect(hx*cellPx + 3, hy*cellPx + 3, cellPx - 6, cellPx - 6)
        ctx.setLineDash([])
      }

      for (const box of state.boxes) {
        const [bx, by] = box
        const slide = boxSlideRef.current.find((s) => s.to[0] === bx && s.to[1] === by)
        const t = slide ? Math.max(0, 1 - slide.t) : 0
        const dx = slide ? (slide.from[0] - slide.to[0]) * t : 0
        const dy = slide ? (slide.from[1] - slide.to[1]) * t : 0
        const px = (bx + dx) * cellPx
        const py = (by + dy) * cellPx
        const onTarget = state.grid[by]?.[bx] === '.'
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.fillRect(px + 6, py + 8, cellPx - 6, cellPx - 6)
        ctx.fillStyle = onTarget ? '#f59e0b' : '#a16207'
        ctx.fillRect(px + 4, py + 4, cellPx - 8, cellPx - 8)
        ctx.strokeStyle = onTarget ? '#7c2d12' : '#451a03'
        ctx.lineWidth = 2
        ctx.strokeRect(px + 4, py + 4, cellPx - 8, cellPx - 8)
        ctx.strokeStyle = onTarget ? '#78350f' : '#3d1500'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(px + 6, py + 6); ctx.lineTo(px + cellPx - 6, py + cellPx - 6)
        ctx.moveTo(px + cellPx - 6, py + 6); ctx.lineTo(px + 6, py + cellPx - 6)
        ctx.stroke()
        if (onTarget) {
          ctx.fillStyle = '#fef3c7'
          ctx.font = 'bold 12px system-ui'
          ctx.textAlign = 'center'
          ctx.fillText('✓', px + cellPx/2, py + cellPx/2 + 4)
        }
      }

      const [px, py] = state.player
      const cx = px * cellPx + cellPx/2
      const cy = py * cellPx + cellPx/2
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath(); ctx.ellipse(cx, cy + 12, 10, 4, 0, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#f472b6'
      ctx.beginPath(); ctx.arc(cx, cy, cellPx*0.32, 0, Math.PI*2); ctx.fill()
      ctx.strokeStyle = '#831843'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.fillStyle = '#fce7f3'
      const eyes = { up: [[-3,-3],[3,-3]], down: [[-3,3],[3,3]], left: [[-4,0],[-2,-3]], right: [[4,0],[2,-3]] }[playerFacing] || [[-3,0],[3,0]]
      ctx.fillRect(cx + eyes[0][0] - 1, cy + eyes[0][1] - 1, 2, 2)
      ctx.fillRect(cx + eyes[1][0] - 1, cy + eyes[1][1] - 1, 2, 2)

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [state, hint, playerFacing])

  const shareUrl = () => {
    if (levelIdx < 0) return ''
    const raw = RAW_LEVELS[levelIdx]
    const b64 = encodeLevel(raw)
    const u = new URL(window.location.href)
    u.searchParams.set('lvl', b64)
    return u.toString()
  }

  const [editorText, setEditorText] = useState(`########
#      #
#  $.  #
#  @   #
########`)
  const tryLoadEditor = () => {
    const parsed = parseLevel(editorText)
    if (!parsed.player) { alert('Level needs a player (@)'); return }
    if (parsed.boxes.length === 0) { alert('Level needs at least one box ($)'); return }
    let targetCount = 0
    for (const row of parsed.grid) for (const ch of row) if (ch === '.') targetCount++
    if (targetCount !== parsed.boxes.length) { alert(`Boxes (${parsed.boxes.length}) must equal targets (${targetCount})`); return }
    setState(parsed); setMoves(0); setStatus('playing'); setShowEditor(false); setShowLevelSelect(false); setLevelIdx(-1)
    historyRef.current = []
  }

  return (
    <GameShell
      title="Sokoban"
      category="Strategy"
      score={moves}
      best={levelIdx >= 0 ? (PAR[levelIdx] || 0) : 0}
      level={levelIdx >= 0 ? levelIdx + 1 : 0}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={restart}
      onPause={() => setShowLevelSelect((v) => !v)}
      controls={[
        { key: 'Arrows / WASD', label: 'Push' },
        { key: 'Z', label: 'Undo' },
        { key: 'R', label: 'Restart' },
        { key: 'H', label: 'Hint' },
      ]}
      footer={
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={undo}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 hover:border-white/30 text-sm"
          >Undo (Z)</button>
          <button
            type="button"
            onClick={restart}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 hover:border-white/30 text-sm"
          >Restart (R)</button>
          <button
            type="button"
            onClick={runHint}
            className="px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-sm font-semibold hover:bg-amber-500/30"
          >Hint (H)</button>
          <button
            type="button"
            onClick={() => setShowEditor(true)}
            className="px-3 py-2 rounded-lg bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-200 text-sm font-semibold hover:bg-fuchsia-500/30"
          >Editor</button>
          {hint?.err && <div className="col-span-full text-xs text-rose-300">{hint.err}</div>}
          {hint?.loading && <div className="col-span-full text-xs text-white/50">Thinking…</div>}
          {hint?.next && <div className="col-span-full text-xs text-amber-300">Suggested next move: {hint.dir}</div>}
          {levelIdx >= 0 && (
            <div className="col-span-full text-xs text-white/50 mt-2">
              Level {levelIdx + 1}/20 · Par {PAR[levelIdx]} moves · Stars: {stars[levelIdx] || 0}/3
            </div>
          )}
        </div>
      }
      overlay={
        <>
          {showLevelSelect && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm p-4 overflow-auto">
              <div className="max-w-3xl mx-auto">
                <div className="text-2xl font-bold bg-gradient-to-r from-amber-300 to-fuchsia-400 bg-clip-text text-transparent mb-4">
                  Select Level
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                  {RAW_LEVELS.map((_, i) => {
                    const s = stars[i] || 0
                    return (
                      <button
                        type="button"
                        key={i}
                        onClick={() => loadLevel(i)}
                        className="rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 hover:border-white/30 p-3 text-left"
                      >
                        <div className="text-lg font-bold text-white">{i + 1}</div>
                        <div className="text-[10px] text-white/50 mb-1">Par {PAR[i]}</div>
                        <div className="text-xs">
                          <span className={s >= 1 ? 'text-amber-300' : 'text-white/20'}>★</span>
                          <span className={s >= 2 ? 'text-amber-300' : 'text-white/20'}>★</span>
                          <span className={s >= 3 ? 'text-amber-300' : 'text-white/20'}>★</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditor(true)}
                    className="px-4 py-2 rounded-lg bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-200 text-sm font-semibold"
                  >Custom level editor</button>
                </div>
              </div>
            </div>
          )}
          {showEditor && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm p-4 overflow-auto">
              <div className="max-w-2xl mx-auto">
                <div className="text-2xl font-bold text-white mb-2">Level editor</div>
                <div className="text-xs text-white/60 mb-3">
                  Symbols: <code className="text-white">#</code> wall · <code className="text-white">.</code> target · <code className="text-white">$</code> box · <code className="text-white">@</code> player · <code className="text-white">*</code> box on target · <code className="text-white">+</code> player on target · space = floor
                </div>
                <textarea
                  value={editorText}
                  onChange={(e) => setEditorText(e.target.value)}
                  className="w-full h-64 rounded-lg border border-white/15 bg-black/40 p-3 font-mono text-sm text-white"
                  spellCheck={false}
                />
                <div className="mt-3 flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={tryLoadEditor}
                    className="px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold text-sm"
                  >Play custom</button>
                  <button
                    type="button"
                    onClick={() => setShowEditor(false)}
                    className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                  >Cancel</button>
                  {levelIdx >= 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const url = shareUrl()
                        if (url) navigator.clipboard?.writeText(url).catch(() => {})
                      }}
                      className="ml-auto px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                    >Copy share URL</button>
                  )}
                </div>
              </div>
            </div>
          )}
          {status === 'won' && !showLevelSelect && !showEditor && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="text-center">
                <div className="text-4xl font-bold bg-gradient-to-r from-amber-300 to-fuchsia-400 bg-clip-text text-transparent mb-2">
                  Solved!
                </div>
                <div className="text-white/70 mb-1">{moves} moves</div>
                {levelIdx >= 0 && (
                  <div className="text-xl mb-3">
                    <span className={stars[levelIdx] >= 1 ? 'text-amber-300' : 'text-white/20'}>★</span>
                    <span className={stars[levelIdx] >= 2 ? 'text-amber-300' : 'text-white/20'}>★</span>
                    <span className={stars[levelIdx] >= 3 ? 'text-amber-300' : 'text-white/20'}>★</span>
                  </div>
                )}
                <div className="flex gap-2 justify-center">
                  {levelIdx >= 0 && levelIdx < RAW_LEVELS.length - 1 && (
                    <button
                      type="button"
                      onClick={() => loadLevel(levelIdx + 1)}
                      className="px-5 py-2 rounded-lg bg-white text-black font-semibold"
                    >Next level</button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowLevelSelect(true)}
                    className="px-5 py-2 rounded-lg bg-white/10 border border-white/20 text-white font-semibold"
                  >Level select</button>
                </div>
              </div>
            </div>
          )}
        </>
      }
    >
      <div className="w-full flex items-center justify-center bg-black py-4">
        <canvas
          ref={canvasRef}
          onTouchStart={(e) => {
            const t = e.touches[0]; if (!t || !canvasRef.current) return
            const rect = canvasRef.current.getBoundingClientRect()
            const cx = rect.left + rect.width / 2
            const cy = rect.top + rect.height / 2
            const dx = t.clientX - cx, dy = t.clientY - cy
            if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 1 : -1, 0)
            else tryMove(0, dy > 0 ? 1 : -1)
          }}
          tabIndex={0}
          style={{ maxWidth: '100%', maxHeight: '68vh', display: 'block', imageRendering: 'pixelated' }}
        />
      </div>
    </GameShell>
  )
}
