import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Collapse, Segmented, Slider } from 'antd'
import {
  PlayCircleFilled, PauseCircleFilled, StepForwardOutlined, ReloadOutlined,
} from '@ant-design/icons'

const GRID = 20
const CELL = 18
const TICK_DEFAULT = 200

const CODE_LINES = [
  { n: 1, code: 'def step(body, d, food):',       hl: 'idle',       explain: 'Signature. `body` = deque of {x,y}. `d` = direction {x,y}. `food` = current pellet.' },
  { n: 2, code: '    head = add(body[0], d)',      hl: 'compute',    explain: 'New head position — current head plus direction vector. body[0] is the tip.' },
  { n: 3, code: '    if off(head) or head in body:', hl: 'checkDeath', explain: 'Death check. Off-grid or self-collision → dead. This line highlights the FAIL box next to the head.' },
  { n: 4, code: "        return 'dead'",             hl: 'dead',       explain: 'Bail out. Caller pauses the loop and shows game over.' },
  { n: 5, code: '    body.appendleft(head)',        hl: 'grow',       explain: 'Push the new head onto the front. Snake grows by one; we may pop the tail next.' },
  { n: 6, code: '    if head != food:',             hl: 'checkFood',  explain: 'Did we eat? If the head DIDN\'T land on the food, we must shrink to keep length constant.' },
  { n: 7, code: '        body.pop()',               hl: 'shrink',     explain: 'Drop the tail. Net effect: snake slides forward by one cell.' },
  { n: 8, code: "    return 'ok'",                  hl: 'ok',         explain: 'Handoff. Caller renders the frame, waits `tickMs`, repeats.' },
]

const HL_TO_LINE = CODE_LINES.reduce((acc, l) => { acc[l.hl] = l.n; return acc }, {})

const DIRS = {
  ArrowUp:    { x: 0,  y: -1 },
  ArrowDown:  { x: 0,  y: 1  },
  ArrowLeft:  { x: -1, y: 0  },
  ArrowRight: { x: 1,  y: 0  },
  w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
}

function eq(a, b) { return a.x === b.x && a.y === b.y }
function off(p)   { return p.x < 0 || p.y < 0 || p.x >= GRID || p.y >= GRID }
function randomFood(body) {
  while (true) {
    const p = { x: (Math.random() * GRID) | 0, y: (Math.random() * GRID) | 0 }
    if (!body.some(b => eq(b, p))) return p
  }
}

const INITIAL_BODY = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]

function initialState() {
  return {
    body:   [...INITIAL_BODY],
    dir:    { x: 1, y: 0 },
    food:   { x: 15, y: 10 },
    score:  0,
    dead:   false,
    hl:     'idle',
    lastHead: INITIAL_BODY[0],
  }
}

/**
 * Pure one-tick reducer. Returns { next, hlLine, event } — no I/O so we can
 * also drive it from the "Step" button without touching timers.
 */
function stepOnce(state) {
  const head = { x: state.body[0].x + state.dir.x, y: state.body[0].y + state.dir.y }
  if (off(head) || state.body.some(b => eq(b, head))) {
    return { next: { ...state, dead: true, hl: 'dead', lastHead: head }, event: 'dead' }
  }
  const newBody = [head, ...state.body]
  const ateFood = eq(head, state.food)
  if (!ateFood) newBody.pop()
  return {
    next: {
      ...state,
      body:  newBody,
      food:  ateFood ? randomFood(newBody) : state.food,
      score: ateFood ? state.score + 1 : state.score,
      hl:    ateFood ? 'grow' : 'shrink',
      lastHead: head,
    },
    event: ateFood ? 'ate' : 'moved',
  }
}

export default function SimpleGame() {
  const { id } = useParams()
  const navigate = useNavigate()
  const gameId = id || 'snake'

  useEffect(() => { document.title = 'Simple Games · Sid' }, [])

  return (
    <div className='min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 sm:pt-28 pb-16 px-3 sm:px-6' style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className='max-w-6xl mx-auto'>
        <header className='mb-6'>
          <p className='eyebrow-mono mb-2 text-amber-300/80'>— Simple Games</p>
          <h1 className='text-3xl sm:text-4xl font-bold gradient-text-amber leading-tight'>
            Code + game, side by side
          </h1>
          <p className='text-sm text-gray-400 mt-1 max-w-2xl'>
            Watch the algorithm execute one line at a time. Pause anywhere, step through, and inspect the state as the snake moves.
          </p>
        </header>

        <Segmented
          value={gameId}
          onChange={(v) => navigate(`/simple-game${v === 'snake' ? '' : `/${v}`}`)}
          options={[{ label: 'Snake', value: 'snake' }]}
          className='mb-4'
        />

        {gameId === 'snake' && <SnakeGame />}
      </div>
    </div>
  )
}

function SnakeGame() {
  const [state, setState] = useState(initialState)
  const [running, setRunning] = useState(false)
  const [tickMs, setTickMs] = useState(TICK_DEFAULT)
  const stateRef = useRef(state)
  stateRef.current = state
  const timerRef = useRef(null)

  const reset = useCallback(() => {
    setRunning(false)
    setState(initialState())
  }, [])

  const step = useCallback(() => {
    setState(prev => {
      if (prev.dead) return prev
      return stepOnce(prev).next
    })
  }, [])

  useEffect(() => {
    if (!running) { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } ; return }
    timerRef.current = setInterval(() => {
      const cur = stateRef.current
      if (cur.dead) { setRunning(false); return }
      const { next } = stepOnce(cur)
      setState(next)
      if (next.dead) setRunning(false)
    }, tickMs)
    return () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null }
  }, [running, tickMs])

  useEffect(() => {
    const onKey = (e) => {
      const d = DIRS[e.key]
      if (!d) return
      setState(prev => {
        const cur = prev.dir
        if (cur.x + d.x === 0 && cur.y + d.y === 0) return prev // no 180
        return { ...prev, dir: d }
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const activeLine = HL_TO_LINE[state.hl] || null

  return (
    <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
      <div className='space-y-3'>
        <Board state={state} />
        <Controls
          running={running}
          onPlayPause={() => setRunning(r => !r)}
          onStep={step}
          onReset={reset}
          tickMs={tickMs}
          onTick={setTickMs}
          score={state.score}
          dead={state.dead}
        />
        <div className='text-center text-[10px] text-gray-500 uppercase tracking-widest'>
          {state.dead ? 'game over · reset to try again' : 'on the board · not itself'}
        </div>
      </div>

      <div className='space-y-3'>
        <CodePanel activeLine={activeLine} />
        <Explainer activeLine={activeLine} />
      </div>
    </div>
  )
}

function Board({ state }) {
  const size = GRID * CELL
  return (
    <div className='luxe-glass p-4 flex items-center justify-center'>
      <svg width={size} height={size} className='rounded-xl' style={{ background: '#050507' }}>
        {Array.from({ length: GRID }).map((_, x) =>
          Array.from({ length: GRID }).map((_, y) => (
            <circle key={`${x}-${y}`} cx={x * CELL + CELL / 2} cy={y * CELL + CELL / 2} r={0.9} fill='#1e293b' />
          ))
        )}
        {state.body.map((b, i) => (
          <rect
            key={i}
            x={b.x * CELL + 1}
            y={b.y * CELL + 1}
            width={CELL - 2}
            height={CELL - 2}
            rx={i === 0 ? 5 : 4}
            fill={i === 0 ? '#22d3ee' : '#0ea5e9'}
            opacity={i === 0 ? 1 : Math.max(0.4, 1 - i * 0.03)}
          />
        ))}
        <circle
          cx={state.food.x * CELL + CELL / 2}
          cy={state.food.y * CELL + CELL / 2}
          r={CELL / 2 - 2}
          fill='#34d399'
        />
        {state.hl === 'checkDeath' || state.hl === 'dead' ? (
          <rect
            x={state.lastHead.x * CELL + 1}
            y={state.lastHead.y * CELL + 1}
            width={CELL - 2}
            height={CELL - 2}
            fill='none'
            stroke='#fbbf24'
            strokeWidth={1.5}
            strokeDasharray='3 2'
          />
        ) : null}
      </svg>
    </div>
  )
}

function Controls({ running, onPlayPause, onStep, onReset, tickMs, onTick, score, dead }) {
  return (
    <div className='luxe-glass p-3 flex flex-wrap items-center gap-3'>
      <button onClick={onPlayPause} disabled={dead} className='luxe-btn luxe-btn-primary text-xs disabled:opacity-40'>
        {running ? <><PauseCircleFilled /> Pause</> : <><PlayCircleFilled /> Play</>}
      </button>
      <button onClick={onStep} disabled={dead || running} className='luxe-btn luxe-btn-secondary text-xs disabled:opacity-40'>
        <StepForwardOutlined /> Step
      </button>
      <button onClick={onReset} className='luxe-btn luxe-btn-ghost text-xs'>
        <ReloadOutlined /> Reset
      </button>
      <div className='flex items-center gap-2 flex-1 min-w-[180px]'>
        <span className='text-[10px] uppercase tracking-widest text-gray-500'>Speed</span>
        <Slider
          min={40} max={500} step={20} value={tickMs} onChange={onTick}
          className='flex-1 !max-w-[180px]'
          tooltip={{ formatter: v => `${v}ms/tick` }}
        />
      </div>
      <div className='ml-auto text-xs font-mono text-gray-300'>
        score <span className='text-amber-300'>{score}</span>
      </div>
    </div>
  )
}

function CodePanel({ activeLine }) {
  return (
    <div className='luxe-glass overflow-hidden'>
      <div className='flex items-center justify-between px-4 py-2 border-b border-white/10'>
        <div className='flex items-center gap-2'>
          <span className='w-2.5 h-2.5 rounded-full bg-rose-400/70' />
          <span className='w-2.5 h-2.5 rounded-full bg-amber-400/70' />
          <span className='w-2.5 h-2.5 rounded-full bg-emerald-400/70' />
          <span className='text-xs text-gray-400 ml-2 font-mono'>snake.py</span>
        </div>
        <span className='text-[10px] text-gray-500 uppercase tracking-widest'>@Sid</span>
      </div>
      <pre className='p-4 font-mono text-[13px] leading-6 overflow-x-auto'>
        {CODE_LINES.map(l => {
          const active = activeLine === l.n
          return (
            <div
              key={l.n}
              className={`flex items-start gap-3 px-2 -mx-2 rounded transition-colors ${active ? 'bg-cyan-500/15' : ''}`}
            >
              <span className={`w-5 text-right shrink-0 ${active ? 'text-cyan-300' : 'text-gray-600'}`}>{l.n}</span>
              <code className={active ? 'text-cyan-100' : 'text-gray-300'}>{l.code}</code>
            </div>
          )
        })}
      </pre>
    </div>
  )
}

function Explainer({ activeLine }) {
  const items = useMemo(() => CODE_LINES.map(l => ({
    key: String(l.n),
    label: (
      <span className='text-xs font-mono flex items-center gap-2'>
        <span className={`w-5 text-right shrink-0 ${activeLine === l.n ? 'text-cyan-300 font-bold' : 'text-gray-500'}`}>{l.n}</span>
        <span className={activeLine === l.n ? 'text-cyan-200' : 'text-gray-300'}>{l.code.trim()}</span>
      </span>
    ),
    children: <p className='text-sm text-gray-300 leading-relaxed'>{l.explain}</p>,
  })), [activeLine])

  return (
    <div className='luxe-glass p-2'>
      <div className='px-3 py-2 border-b border-white/10'>
        <p className='eyebrow-mono text-amber-300/80'>— How each line works</p>
      </div>
      <Collapse
        items={items}
        activeKey={activeLine != null ? [String(activeLine)] : []}
        bordered={false}
        ghost
        className='!bg-transparent'
      />
    </div>
  )
}
