// Sudoku — generator + solver + full solve-support UI.
//
// Generation strategy:
//   1) Build a full valid 9x9 solved board via randomised backtracking.
//      To avoid deterministic output we shuffle 1..9 at every recursive
//      step. Constraint checks use pre-computed row/col/box bit masks
//      for O(1) validity.
//   2) Punch holes symmetrically until we hit the target clue count for
//      the chosen difficulty. After each removal we solve the board with
//      the *counting solver* — if there are ≥2 solutions we back out and
//      pick a different pair. Guarantees a unique solution.
//
// Difficulty → clue count (empirical guideline):
//   easy    ~40
//   medium  ~32
//   hard    ~26
//   expert  ~23   (still uniquely solvable)
//
// UI features:
//   • Row / col / 3×3 box highlight for the selected cell
//   • Same-digit highlight (light up every 7 if 7 is selected)
//   • Conflict highlight (red glow when entering a digit that violates
//     row/col/box); the *given* remains unchanged
//   • Pencil marks — small candidates 1..9 per cell (toggle mode)
//   • Undo/redo stack
//   • Timer + hint system (3 hints, reveals the correct digit for the
//     currently selected empty cell; solved via internal solver)
//   • Confetti burst on win

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const RULES = [
  { heading: 'Goal', body: 'Fill the 9×9 grid so that every row, every column and each of the nine 3×3 boxes contain the digits 1–9 exactly once. The puzzle you start with is guaranteed to have a unique solution.' },
  { heading: 'Controls', body: 'Click / tap a cell to select it. Type 1–9 or use the number bar to enter a digit. Delete or 0 clears. Toggle pencil mode (P) to jot small candidates instead. Ctrl/Cmd + Z undoes, Shift-Z redoes. Arrow keys move the selection.' },
  { heading: 'Scoring & timer', body: 'Each puzzle is timed. Faster completions rank higher; your best time per difficulty persists locally. There is no per-move scoring — this is a race against yourself and the clock.' },
  { heading: 'Conflict feedback', body: 'When you enter a digit that clashes with the row, column or box, that digit glows red. The clue cells you start with are locked and cannot be changed.' },
  { heading: 'Hints', body: 'You start with a small hint budget (3 by default). Each hint reveals the correct digit for the currently selected empty cell, drawn from the puzzle\'s solved board. Used hints do not refund.' },
  { heading: 'Pencil marks', body: 'Pencil mode paints small candidate digits into a cell without committing. Useful for tracking twins, triples and X-wings. In Custom mode you can auto-fill all pencils on generation.' },
  { heading: 'Difficulty', body: 'Easy leaves ~40 clues, a large hint budget and visible timer. Hard leaves ~26 clues, only 1 hint and hides the timer. Custom exposes clue count, hint budget, timer visibility and pencil-mark auto-fill.' },
]

const DIFFICULTY_MODES = ['Easy', 'Medium', 'Hard', 'Custom']

const PRESET_DIFFICULTIES = {
  Easy:   { clueCount: 40, hintBudget: 6, timerVisible: true,  pencilAuto: false },
  Medium: { clueCount: 32, hintBudget: 3, timerVisible: true,  pencilAuto: false },
  Hard:   { clueCount: 26, hintBudget: 1, timerVisible: false, pencilAuto: false },
}

const CUSTOM_SCHEMA = {
  clueCount:    { label: 'Clue count',       min: 17, max: 45, step: 1, default: 32 },
  hintBudget:   { label: 'Hint budget',      min: 0,  max: 10, step: 1, default: 3 },
  timerVisible: { label: 'Timer visible (0/1)', min: 0, max: 1, step: 1, default: 1 },
  pencilAuto:   { label: 'Auto-fill pencils (0/1)', min: 0, max: 1, step: 1, default: 0 },
}

const N = 9
const BOX = 3

const rowOf = (i) => (i / N) | 0
const colOf = (i) => i % N
const boxOf = (i) => (Math.floor(rowOf(i) / BOX) * BOX) + Math.floor(colOf(i) / BOX)

function newMasks() {
  return { rows: new Uint16Array(N), cols: new Uint16Array(N), boxes: new Uint16Array(N) }
}

function maskFrom(board) {
  const m = newMasks()
  for (let i = 0; i < N * N; i++) {
    const v = board[i]
    if (v) {
      const bit = 1 << (v - 1)
      m.rows[rowOf(i)] |= bit
      m.cols[colOf(i)] |= bit
      m.boxes[boxOf(i)] |= bit
    }
  }
  return m
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function fillSolution(board) {
  const m = maskFrom(board)
  const solve = (i) => {
    while (i < N * N && board[i] !== 0) i++
    if (i === N * N) return true
    const used = m.rows[rowOf(i)] | m.cols[colOf(i)] | m.boxes[boxOf(i)]
    for (const v of shuffle([1,2,3,4,5,6,7,8,9])) {
      const bit = 1 << (v - 1)
      if (!(used & bit)) {
        board[i] = v
        m.rows[rowOf(i)] |= bit
        m.cols[colOf(i)] |= bit
        m.boxes[boxOf(i)] |= bit
        if (solve(i + 1)) return true
        board[i] = 0
        m.rows[rowOf(i)] &= ~bit
        m.cols[colOf(i)] &= ~bit
        m.boxes[boxOf(i)] &= ~bit
      }
    }
    return false
  }
  solve(0)
  return board
}

function countSolutions(board, limit = 2) {
  const b = new Int8Array(board)
  const m = maskFrom(b)
  let count = 0
  const solve = (i) => {
    if (count >= limit) return
    while (i < N * N && b[i] !== 0) i++
    if (i === N * N) { count++; return }
    const used = m.rows[rowOf(i)] | m.cols[colOf(i)] | m.boxes[boxOf(i)]
    for (let v = 1; v <= 9; v++) {
      const bit = 1 << (v - 1)
      if (!(used & bit)) {
        b[i] = v
        m.rows[rowOf(i)] |= bit
        m.cols[colOf(i)] |= bit
        m.boxes[boxOf(i)] |= bit
        solve(i + 1)
        b[i] = 0
        m.rows[rowOf(i)] &= ~bit
        m.cols[colOf(i)] &= ~bit
        m.boxes[boxOf(i)] &= ~bit
        if (count >= limit) return
      }
    }
  }
  solve(0)
  return count
}

const CLUES_BY_DIFF = { easy: 40, medium: 32, hard: 26, expert: 23 }

function generatePuzzle(difficultyOrClueCount) {
  const clueTarget = typeof difficultyOrClueCount === 'number'
    ? Math.max(17, Math.min(45, difficultyOrClueCount))
    : (CLUES_BY_DIFF[difficultyOrClueCount] ?? 32)
  const solution = fillSolution(new Int8Array(N * N))
  const puzzle = new Int8Array(solution)
  const indices = shuffle([...Array(N * N).keys()])
  let remaining = N * N
  for (const i of indices) {
    if (remaining <= clueTarget) break
    const mirror = N * N - 1 - i
    if (puzzle[i] === 0) continue
    const saveA = puzzle[i], saveB = puzzle[mirror]
    puzzle[i] = 0
    if (i !== mirror) puzzle[mirror] = 0
    if (countSolutions(puzzle, 2) === 1) {
      remaining -= (i === mirror) ? 1 : 2
    } else {
      puzzle[i] = saveA
      puzzle[mirror] = saveB
    }
  }
  return { puzzle, solution }
}

const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert']

export default function Sudoku() {
  const [shellDifficulty, setShellDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState(() => Object.fromEntries(
    Object.entries(CUSTOM_SCHEMA).map(([k, v]) => [k, v.default])
  ))
  const shellCfg = useMemo(
    () => shellDifficulty === 'Custom' ? customValues : PRESET_DIFFICULTIES[shellDifficulty] || PRESET_DIFFICULTIES.Medium,
    [shellDifficulty, customValues],
  )
  const [difficulty, setDifficulty] = useState('medium')
  const [puzzle, setPuzzle] = useState(null)
  const [solution, setSolution] = useState(null)
  const [board, setBoard] = useState(null)
  const [pencils, setPencils] = useState(null)
  const [selected, setSelected] = useState(null)
  const [pencilMode, setPencilMode] = useState(false)
  const [history, setHistory] = useState([])
  const [future, setFuture] = useState([])
  const [hintsLeft, setHintsLeft] = useState(3)
  const [seconds, setSeconds] = useState(0)
  const [status, setStatus] = useState('ready')
  const [paused, setPaused] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [generating, setGenerating] = useState(true)
  const [confetti, setConfetti] = useState(false)
  const [best, setBest] = useState(0)
  const sfxRef = useRef(getSfx())
  const timerRef = useRef(0)

  useEffect(() => { sfxRef.current.setEnabled(soundOn) }, [soundOn])

  useEffect(() => {
    try { setBest(Number(localStorage.getItem(`arcade.sudoku.best.${difficulty}`)) || 0) } catch {}
  }, [difficulty])

  const startNew = useCallback((diff) => {
    setGenerating(true)
    setTimeout(() => {
      // Prefer explicit shell clue count when set; fall back to legacy difficulty string.
      const clueOrDiff = shellCfg.clueCount ?? diff
      const { puzzle: p, solution: s } = generatePuzzle(clueOrDiff)
      setPuzzle(new Int8Array(p))
      setSolution(new Int8Array(s))
      setBoard(new Int8Array(p))
      const pencils = new Uint16Array(N * N)
      if (shellCfg.pencilAuto) {
        // Auto-fill every empty cell with all legal candidates.
        const m = maskFrom(p)
        for (let i = 0; i < N * N; i++) {
          if (p[i]) continue
          const used = m.rows[rowOf(i)] | m.cols[colOf(i)] | m.boxes[boxOf(i)]
          pencils[i] = (~used) & 0x1ff
        }
      }
      setPencils(pencils)
      setHistory([])
      setFuture([])
      setHintsLeft(shellCfg.hintBudget ?? 3)
      setSeconds(0)
      setSelected(40)
      setPencilMode(false)
      setStatus('playing')
      setPaused(false)
      setGenerating(false)
      setConfetti(false)
    }, 30)
  }, [shellCfg])

  useEffect(() => { startNew(difficulty) }, [difficulty, startNew])

  useEffect(() => {
    if (status !== 'playing' || paused) { clearInterval(timerRef.current); return }
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [status, paused])

  const isGiven = useCallback((i) => puzzle && puzzle[i] !== 0, [puzzle])

  const conflictsAt = useCallback((i, val) => {
    if (!board || !val) return []
    const r = rowOf(i), c = colOf(i), b = boxOf(i)
    const bad = []
    for (let j = 0; j < N * N; j++) {
      if (j === i) continue
      if (board[j] !== val) continue
      if (rowOf(j) === r || colOf(j) === c || boxOf(j) === b) bad.push(j)
    }
    return bad
  }, [board])

  const isComplete = useCallback((b) => {
    if (!b || !solution) return false
    for (let i = 0; i < N * N; i++) if (b[i] !== solution[i]) return false
    return true
  }, [solution])

  const pushHistory = useCallback(() => {
    if (!board || !pencils) return
    setHistory((h) => [{ board: new Int8Array(board), pencils: new Uint16Array(pencils) }, ...h].slice(0, 100))
    setFuture([])
  }, [board, pencils])

  const setCell = useCallback((i, val) => {
    if (!board || isGiven(i)) return
    if (pencilMode && val > 0) {
      pushHistory()
      const p = new Uint16Array(pencils)
      p[i] ^= 1 << (val - 1)
      setPencils(p)
      sfxRef.current.chirp()
      return
    }
    pushHistory()
    const b = new Int8Array(board)
    b[i] = val
    setBoard(b)
    if (val > 0) {
      const p = new Uint16Array(pencils)
      p[i] = 0
      setPencils(p)
      sfxRef.current.pop()
    } else {
      sfxRef.current.chirp()
    }

    if (isComplete(b)) {
      setStatus('won')
      setConfetti(true)
      sfxRef.current.win()
      const prev = best
      const s = seconds
      if (!prev || s < prev) {
        setBest(s)
        try { localStorage.setItem(`arcade.sudoku.best.${difficulty}`, String(s)) } catch {}
      }
    }
  }, [board, pencils, isGiven, pencilMode, pushHistory, isComplete, best, seconds, difficulty])

  const undo = useCallback(() => {
    if (!history.length) return
    const [prev, ...rest] = history
    setFuture((f) => [{ board: new Int8Array(board), pencils: new Uint16Array(pencils) }, ...f])
    setBoard(prev.board)
    setPencils(prev.pencils)
    setHistory(rest)
    sfxRef.current.chirp()
  }, [history, board, pencils])

  const redo = useCallback(() => {
    if (!future.length) return
    const [next, ...rest] = future
    setHistory((h) => [{ board: new Int8Array(board), pencils: new Uint16Array(pencils) }, ...h])
    setBoard(next.board)
    setPencils(next.pencils)
    setFuture(rest)
    sfxRef.current.chirp()
  }, [future, board, pencils])

  const useHint = useCallback(() => {
    if (hintsLeft <= 0 || selected === null || !solution || !board) return
    if (isGiven(selected) || board[selected] === solution[selected]) return
    setCell(selected, solution[selected])
    setHintsLeft((h) => h - 1)
    sfxRef.current.coin()
  }, [hintsLeft, selected, solution, board, isGiven, setCell])

  useEffect(() => {
    const onKey = (e) => {
      if (status === 'won') return
      const k = e.key
      if (k >= '1' && k <= '9') { if (selected !== null) setCell(selected, parseInt(k, 10)); return }
      if (k === '0' || k === 'Backspace' || k === 'Delete') { if (selected !== null) setCell(selected, 0); return }
      if (k === 'p' || k === 'P') return setPencilMode((m) => !m)
      if (k === 'h' || k === 'H') return useHint()
      if (k === 'z' || k === 'Z') return undo()
      if (k === 'y' || k === 'Y') return redo()
      if (selected === null) return
      let ns = selected
      if (k === 'ArrowLeft')  ns = Math.max(0, selected - 1)
      else if (k === 'ArrowRight') ns = Math.min(N * N - 1, selected + 1)
      else if (k === 'ArrowUp')    ns = Math.max(0, selected - N)
      else if (k === 'ArrowDown')  ns = Math.min(N * N - 1, selected + N)
      if (ns !== selected) { setSelected(ns); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, setCell, useHint, undo, redo, status])

  const selectedValue = selected !== null && board ? board[selected] : 0
  const selectedRow = selected !== null ? rowOf(selected) : -1
  const selectedCol = selected !== null ? colOf(selected) : -1
  const selectedBox = selected !== null ? boxOf(selected) : -1
  const selectedConflicts = useMemo(
    () => selected !== null ? conflictsAt(selected, selectedValue) : [],
    [selected, selectedValue, conflictsAt]
  )

  const remaining = useMemo(() => {
    const counts = new Array(10).fill(9)
    if (!board) return counts
    for (let i = 0; i < N * N; i++) if (board[i]) counts[board[i]] -= 1
    return counts
  }, [board])

  const timeStr = useMemo(() => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }, [seconds])

  const bestStr = useMemo(() => {
    if (!best) return '—'
    const m = Math.floor(best / 60).toString().padStart(2, '0')
    const s = (best % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }, [best])

  const boardPx = 486
  const cellPx = 54

  return (
    <GameShell
      title="Sudoku"
      category="Puzzle"
      score={seconds}
      best={best}
      level={DIFFICULTIES.indexOf(difficulty) + 1}
      status={status === 'won' ? 'won' : (paused ? 'paused' : (generating ? 'ready' : 'playing'))}
      extraStats={
        <>
          {shellCfg.timerVisible !== 0 && shellCfg.timerVisible !== false && (
            <div className="flex flex-col items-start">
              <span className="text-[10px] uppercase tracking-widest text-white/40">Time</span>
              <span className="text-xl sm:text-2xl font-bold tabular-nums text-cyan-300">{timeStr}</span>
            </div>
          )}
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Best</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-rose-300">{bestStr}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Hints</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-fuchsia-300">{hintsLeft}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Level</span>
            <span className="text-sm font-semibold text-emerald-300 capitalize">{difficulty}</span>
          </div>
        </>
      }
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={() => startNew(difficulty)}
      onPause={() => setPaused((p) => !p)}
      controls={[
        { key: '1-9', label: 'Enter digit' },
        { key: '0 / ⌫', label: 'Erase' },
        { key: 'P', label: 'Pencil mode' },
        { key: 'H', label: 'Hint' },
        { key: 'Z / Y', label: 'Undo / Redo' },
        { key: '↑↓←→', label: 'Move cursor' },
      ]}
      rules={RULES}
      difficulty={shellDifficulty}
      onDifficultyChange={setShellDifficulty}
      difficultyModes={DIFFICULTY_MODES}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
    >
      <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 p-3 sm:p-5">
        <div className="w-full lg:w-auto flex flex-wrap justify-center gap-2 lg:hidden">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize ${d===difficulty ? 'bg-cyan-500 text-black border-cyan-400' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'}`}
            >{d}</button>
          ))}
        </div>

        <div
          className="relative rounded-xl select-none"
          style={{
            width: boardPx + 6,
            height: boardPx + 6,
            padding: 3,
            background: 'linear-gradient(135deg, #14141c, #0a0a0e)',
            border: '2px solid rgba(255,255,255,0.15)',
            boxShadow: '0 0 40px -12px rgba(34,211,238,0.35)',
          }}
        >
          <div className="grid grid-cols-9 gap-0" style={{ width: boardPx, height: boardPx }}>
            {board && Array.from({ length: N * N }).map((_, i) => {
              const r = rowOf(i), c = colOf(i), b = boxOf(i)
              const given = isGiven(i)
              const val = board[i]
              const isSelected = i === selected
              const inLine = r === selectedRow || c === selectedCol || b === selectedBox
              const sameDigit = selectedValue > 0 && val === selectedValue && !isSelected
              const isConflict = selectedConflicts.includes(i)
              const isError = !isSelected && val > 0 && !given && solution && val !== solution[i]
              const p = pencils ? pencils[i] : 0
              const bt = r % 3 === 0
              const bl = c % 3 === 0
              const bb = r === 8
              const br = c === 8
              return (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className="relative flex items-center justify-center font-bold transition-colors focus:outline-none"
                  style={{
                    width: cellPx, height: cellPx,
                    background:
                      isSelected ? 'rgba(34,211,238,0.28)' :
                      isConflict ? 'rgba(244, 63, 94, 0.15)' :
                      sameDigit  ? 'rgba(168,85,247,0.16)' :
                      inLine     ? 'rgba(255,255,255,0.04)' :
                                   'rgba(255,255,255,0.015)',
                    color:
                      given      ? '#e5e7eb' :
                      isConflict ? '#fecaca' :
                      isError    ? '#fda4af' :
                                   '#67e8f9',
                    fontSize: given ? 28 : 26,
                    fontWeight: given ? 900 : 700,
                    borderTop:    bt ? '2px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.08)',
                    borderLeft:   bl ? '2px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.08)',
                    borderBottom: bb ? '2px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.05)',
                    borderRight:  br ? '2px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.05)',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}
                >
                  {val > 0 ? val : (
                    p ? (
                      <div className="grid grid-cols-3 gap-0 w-full h-full text-[9px] leading-none text-white/45 font-mono">
                        {Array.from({ length: 9 }, (_, j) => (
                          <div key={j} className="flex items-center justify-center">
                            {(p & (1 << j)) ? j + 1 : ''}
                          </div>
                        ))}
                      </div>
                    ) : null
                  )}
                  {isSelected && (
                    <div className="absolute inset-0 pointer-events-none" style={{
                      boxShadow: 'inset 0 0 0 2px rgba(34,211,238,0.85)',
                    }} />
                  )}
                </button>
              )
            })}
          </div>

          {generating && (
            <div className="absolute inset-0 rounded-xl bg-black/70 backdrop-blur-sm flex items-center justify-center gap-3 text-white/80 text-sm font-semibold">
              <span className="w-4 h-4 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin" />
              Generating unique puzzle…
            </div>
          )}

          {status === 'won' && !generating && (
            <div className="absolute inset-0 rounded-xl bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10">
              <div className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent">
                Solved
              </div>
              <div className="text-white/70 text-sm">Time {timeStr} · {difficulty}</div>
              <button onClick={() => startNew(difficulty)} className="mt-1 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-semibold">
                New puzzle
              </button>
            </div>
          )}

          {paused && !generating && status === 'playing' && (
            <div className="absolute inset-0 rounded-xl bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 font-semibold">Paused</div>
          )}
        </div>

        <div className="flex flex-col gap-4 w-full lg:w-64">
          <div className="hidden lg:flex flex-wrap gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize ${d===difficulty ? 'bg-cyan-500 text-black border-cyan-400' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'}`}
              >{d}</button>
            ))}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Numpad</div>
            <div className="grid grid-cols-3 gap-2">
              {[1,2,3,4,5,6,7,8,9].map((n) => (
                <button
                  key={n}
                  onClick={() => selected !== null && setCell(selected, n)}
                  disabled={remaining[n] === 0}
                  className="relative h-14 rounded-lg border transition font-bold text-2xl"
                  style={{
                    background: remaining[n] === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    color: remaining[n] === 0 ? 'rgba(255,255,255,0.15)' : '#67e8f9',
                  }}
                >
                  {n}
                  <span className="absolute bottom-0.5 right-1 text-[10px] text-white/40 font-normal">{remaining[n]}</span>
                </button>
              ))}
              <button
                onClick={() => selected !== null && setCell(selected, 0)}
                className="col-span-3 h-10 rounded-lg border bg-white/5 border-white/10 text-white/80 hover:bg-white/10 text-sm font-semibold"
              >Erase</button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => setPencilMode((v) => !v)}
              className={`h-9 rounded-lg text-xs font-semibold border transition ${pencilMode ? 'bg-fuchsia-500 text-black border-fuchsia-400' : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'}`}
            >
              Pencil mode: {pencilMode ? 'on' : 'off'}
            </button>
            <div className="flex gap-2">
              <button
                onClick={undo}
                disabled={!history.length}
                className="flex-1 h-9 rounded-lg text-xs font-semibold border bg-white/5 border-white/10 text-white/80 hover:bg-white/10 disabled:opacity-40"
              >Undo</button>
              <button
                onClick={redo}
                disabled={!future.length}
                className="flex-1 h-9 rounded-lg text-xs font-semibold border bg-white/5 border-white/10 text-white/80 hover:bg-white/10 disabled:opacity-40"
              >Redo</button>
            </div>
            <button
              onClick={useHint}
              disabled={hintsLeft === 0 || selected === null || (selected !== null && isGiven(selected))}
              className="h-9 rounded-lg text-xs font-semibold border bg-amber-500/80 text-black border-amber-400 hover:bg-amber-400 disabled:opacity-40"
            >
              Hint ({hintsLeft} left)
            </button>
          </div>
        </div>

        {confetti && <Confetti onDone={() => setConfetti(false)} />}
      </div>
    </GameShell>
  )
}

function Confetti({ onDone }) {
  const pieces = useMemo(() => {
    return Array.from({ length: 80 }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 20,
      y: 50 + (Math.random() - 0.5) * 20,
      dx: (Math.random() - 0.5) * 80,
      dy: -Math.random() * 60 - 20,
      rot: Math.random() * 360,
      dr: (Math.random() - 0.5) * 720,
      color: ['#f59e0b','#f43f5e','#a855f7','#22d3ee','#4ade80','#facc15'][(Math.random()*6)|0],
      shape: Math.random() > 0.5 ? 'sq' : 'rect',
    }))
  }, [])
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 2200)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="fixed inset-0 pointer-events-none z-40">
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.shape === 'sq' ? 10 : 6,
            height: p.shape === 'sq' ? 10 : 16,
            background: p.color,
            transform: `rotate(${p.rot}deg)`,
            borderRadius: 2,
            animation: `sudoku-conf 2.2s cubic-bezier(.4,0,.2,1) forwards`,
            '--dx': `${p.dx}vw`,
            '--dy': `${p.dy}vh`,
            '--dr': `${p.dr}deg`,
          }}
        />
      ))}
      <style>{`
        @keyframes sudoku-conf {
          0%   { transform: translate(0,0) rotate(0); opacity: 1; }
          100% { transform: translate(var(--dx), calc(80vh + var(--dy))) rotate(var(--dr)); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
