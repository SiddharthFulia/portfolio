// Analyze — step-through debugger for the algorithms pages.
//
// Given a chunk of source (Python or ES5 JavaScript), this component:
//   1) Lazy-loads Pyodide (CDN, ~6 MB) or js-interpreter (CDN, ~200 KB)
//      on first Trace click.
//   2) Runs the code with a per-line tracer to build a list of frames.
//      Each frame captures the current line, event type ('line' | 'call'
//      | 'return' | 'exception'), and a shallow repr'd snapshot of local
//      variables.
//   3) Renders a three-pane UI:
//        left  = code with current-line highlight + hover-a-var-for-value
//        right = variables panel (delta-highlighted, expandable)
//        bottom = transport bar (play, pause, step, scrub, speed)
//   4) Caps traces at 5000 frames so infinite loops can't OOM the tab.
//
// C / C++ / Java / Rust: not supported yet — show "coming soon" panel.
//   Real step-through for those would need GDB output parsing on the BE.
//
// Reduced motion: autoplay disabled when the user prefers less motion.
//   Users can still Step + Scrub manually.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tooltip } from 'antd'
import { Button } from '../../ui'
import VariablesPanel from './VariablesPanel'
import TransportBar from './TransportBar'
import HoverTooltip from './HoverTooltip'

// Lang keys the runners actually support.
const SUPPORTED = new Set(['python', 'javascript', 'js'])
function normalizeLang(lang) {
  if (lang === 'js') return 'javascript'
  return lang
}

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch { return false }
}

// Tokenise a line into runs of identifiers vs. everything else so we can
// wire mouseenter handlers only onto identifier spans. Same regex as
// MultiLangCode.jsx tint fn — but we keep it simpler here since we don't
// need syntax colours (the runtime highlight is what matters).
const IDENT_RE = /([A-Za-z_][A-Za-z0-9_]*)/g

function CodePane({ code, activeLine, locals, onHoverVar, onLeaveVar }) {
  const lines = useMemo(() => code.replace(/\t/g, '  ').split('\n'), [code])
  return (
    <div className="bg-[#08080b]/80 border border-white/10 rounded-lg overflow-hidden">
      <pre className="text-[12.5px] leading-6 font-mono overflow-x-auto py-3">
        {lines.map((raw, i) => {
          const lineNo = i + 1
          const isActive = activeLine === lineNo
          // Split each line into identifier + non-identifier chunks.
          const parts = []
          let last = 0
          const line = raw.length ? raw : ' '
          let m
          IDENT_RE.lastIndex = 0
          while ((m = IDENT_RE.exec(line)) !== null) {
            if (m.index > last) parts.push({ kind: 'txt', text: line.slice(last, m.index) })
            parts.push({ kind: 'id', text: m[0] })
            last = m.index + m[0].length
          }
          if (last < line.length) parts.push({ kind: 'txt', text: line.slice(last) })

          return (
            <div
              key={i}
              className={`flex items-start gap-3 px-4 border-l-2 transition-colors ${
                isActive
                  ? 'bg-amber-500/15 border-amber-400'
                  : 'border-transparent hover:bg-white/[0.015]'
              }`}
            >
              <span className={`select-none w-7 text-right shrink-0 ${
                isActive ? 'text-amber-300 font-bold' : 'text-gray-600'
              }`}>{lineNo}</span>
              <span className="flex-1 whitespace-pre">
                {parts.map((p, j) => {
                  if (p.kind === 'txt') return <span key={j}>{p.text}</span>
                  const hasValue = locals && p.text in locals
                  return (
                    <span
                      key={j}
                      className={`${hasValue ? 'cursor-help underline decoration-dotted decoration-amber-400/40 underline-offset-2' : ''}`}
                      onMouseEnter={hasValue ? (e) => onHoverVar(p.text, e.clientX, e.clientY) : undefined}
                      onMouseLeave={hasValue ? onLeaveVar : undefined}
                    >
                      {p.text}
                    </span>
                  )
                })}
              </span>
            </div>
          )
        })}
      </pre>
    </div>
  )
}

export default function Analyze({ code, lang, topicSlug }) {
  const normalized = normalizeLang(lang)
  const supported = SUPPORTED.has(normalized)

  // Runtime state
  const [frames, setFrames] = useState([])
  const [step, setStep] = useState(0)
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'tracing' | 'ready' | 'error'
  const [statusMsg, setStatusMsg] = useState('')
  const [output, setOutput] = useState('')
  const [capped, setCapped] = useState(false)

  // The reference implementations in code snippets are usually just
  // `def foo(...)` — no call site. Users can append a demo invocation
  // here that gets concatenated to the source before tracing. Pre-fill
  // with a language-aware placeholder so first-time users see what to
  // type.
  const defaultDemo = useMemo(() => {
    if (normalized === 'python') return '# Optional: add a call to see it execute, e.g.:\n# print(fn(args))\n'
    return '// Optional: add a call to see it execute, e.g.:\n// console.log(fn(args));\n'
  }, [normalized])
  const [demoCall, setDemoCall] = useState(defaultDemo)
  useEffect(() => { setDemoCall(defaultDemo) }, [defaultDemo])

  // Combined source: user code + demo call, only if the demo call
  // has real content (not just the placeholder comment).
  const effectiveCode = useMemo(() => {
    const trimmed = (demoCall || '').split('\n')
      .filter(l => !/^\s*(#|\/\/)/.test(l))
      .join('\n').trim()
    if (!trimmed) return code
    return `${code}\n\n${demoCall}`
  }, [code, demoCall])

  // Playback
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const playTimerRef = useRef(null)
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])

  // Hover tooltip
  const [hover, setHover] = useState({ name: null, x: 0, y: 0 })

  // Reset the trace when the code or language changes.
  useEffect(() => {
    setFrames([])
    setStep(0)
    setStatus('idle')
    setStatusMsg('')
    setOutput('')
    setCapped(false)
    setPlaying(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, normalized, topicSlug])

  // Stop autoplay when unmounted or trace resets.
  useEffect(() => () => {
    if (playTimerRef.current) clearInterval(playTimerRef.current)
  }, [])

  const runTrace = useCallback(async () => {
    if (!supported) return
    setStatus('loading')
    setStatusMsg(normalized === 'python'
      ? 'Loading Pyodide runtime (first run downloads ~6 MB — cached after)…'
      : 'Loading JS interpreter (small, cached after first run)…')
    try {
      let result
      if (normalized === 'python') {
        const { tracePython } = await import('./runPython.js')
        setStatus('tracing')
        setStatusMsg('Executing your code with the line tracer attached…')
        result = await tracePython(effectiveCode, { maxSteps: 5000 })
      } else {
        const { traceJs } = await import('./runJs.js')
        setStatus('tracing')
        setStatusMsg('Stepping through the code node-by-node…')
        result = await traceJs(effectiveCode, { maxSteps: 5000 })
      }
      if (result.error) {
        setStatus('error')
        setStatusMsg(result.error)
        setFrames([])
        setOutput(result.output || '')
        setCapped(false)
        return
      }
      setFrames(result.frames)
      setOutput(result.output || '')
      setCapped(!!result.capped)
      setStep(0)
      setStatus('ready')
      setStatusMsg('')
    } catch (err) {
      setStatus('error')
      setStatusMsg(err?.message || String(err))
      setFrames([])
    }
  }, [effectiveCode, normalized, supported])

  // Playback tick — 1× = 250 ms/step. speed scales inversely.
  useEffect(() => {
    if (!playing) return undefined
    if (frames.length === 0) return undefined
    const interval = Math.max(30, Math.round(250 / speed))
    playTimerRef.current = setInterval(() => {
      setStep(s => {
        if (s >= frames.length - 1) {
          setPlaying(false)
          return frames.length - 1
        }
        return s + 1
      })
    }, interval)
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current)
      playTimerRef.current = null
    }
  }, [playing, speed, frames.length])

  const current = frames[step]
  const previous = step > 0 ? frames[step - 1] : null
  const activeLine = current?.line || 0
  const locals = current?.locals || {}
  const prevLocals = previous?.locals || {}

  const onHoverVar = useCallback((name, x, y) => setHover({ name, x, y }), [])
  const onLeaveVar = useCallback(() => setHover({ name: null, x: 0, y: 0 }), [])

  // Not-supported branch first (C, C++, Java, Rust, pseudo).
  if (!supported) {
    return (
      <div className="p-6 bg-black/40 border border-white/10 rounded-lg">
        <div className="max-w-lg mx-auto text-center space-y-2">
          <p className="text-sm font-bold text-amber-200 uppercase tracking-widest">
            Step-through coming soon
          </p>
          <p className="text-sm text-gray-300 leading-relaxed">
            Line-by-line variable capture for <span className="font-mono text-white">{lang}</span> needs
            a debugger backend (GDB / JDB / rustc-lldb) that we're still wiring up.
          </p>
          <p className="text-sm text-gray-400 leading-relaxed">
            For now, switch to the <span className="font-bold text-amber-300">Python</span> tab or
            paste a JavaScript equivalent — both run entirely in your browser via WASM / JS
            interpreter, no server round-trip.
          </p>
        </div>
      </div>
    )
  }

  // Idle: user hasn't clicked Trace yet.
  if (status === 'idle') {
    return (
      <div className="p-6 bg-black/40 border border-white/10 rounded-lg">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="text-center space-y-2">
            <p className="text-sm font-bold text-amber-200 uppercase tracking-widest">
              Analyze — step through the code
            </p>
            <p className="text-sm text-gray-300 leading-relaxed">
              Click <span className="font-bold text-white">Trace</span> to run the {normalized === 'python' ? 'Python' : 'JavaScript'} code with a line-by-line tracer. You'll see every executed line, every variable, and be able to hover any identifier in the code to see its current value.
            </p>
          </div>
          <div className="bg-black/40 border border-white/10 rounded-lg p-3 space-y-2">
            <label htmlFor="analyze-demo-call" className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Demo call {normalized === 'python' ? '(Python)' : '(JavaScript)'}
              <span className="ml-2 font-normal normal-case tracking-normal text-gray-500">— appended to the code before tracing</span>
            </label>
            <textarea
              id="analyze-demo-call"
              value={demoCall}
              onChange={e => setDemoCall(e.target.value.slice(0, 2048))}
              rows={4}
              spellCheck={false}
              placeholder={normalized === 'python' ? 'print(my_function(1, 2, 3))' : 'console.log(myFn(1, 2, 3));'}
              className="w-full text-[12px] font-mono bg-[#08080b] border border-white/10 rounded-md px-2 py-1.5 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-400/50 resize-y"
            />
            <p className="text-[10px] text-gray-500 leading-relaxed">
              Reference implementations only <em>define</em> functions — a call is needed to
              actually execute them. This demo call is appended to the code just before tracing.
            </p>
          </div>
          <div className="text-center space-y-2">
            <Button variant="primary" size="middle" onClick={runTrace}>
              ▶ Trace this code
            </Button>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              {normalized === 'python'
                ? 'Runs in-browser via Pyodide (CPython in WASM). Cold load ~5-10s the first time, instant thereafter.'
                : 'Runs in-browser via NeilFraser/JS-Interpreter (ES5 only — no arrows / let / async).'
              }
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Loading Pyodide / interpreter, or actively tracing.
  if (status === 'loading' || status === 'tracing') {
    return (
      <div className="p-8 bg-black/40 border border-white/10 rounded-lg text-center space-y-3">
        {!reducedMotion && (
          <div className="w-8 h-8 mx-auto rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
        )}
        <p className="text-sm font-bold text-amber-200 uppercase tracking-widest">
          {status === 'loading' ? 'Loading runtime' : 'Tracing execution'}
        </p>
        <p className="text-sm text-gray-300 max-w-md mx-auto">{statusMsg}</p>
      </div>
    )
  }

  // Error state.
  if (status === 'error') {
    return (
      <div className="p-6 bg-rose-500/5 border border-rose-400/30 rounded-lg space-y-3">
        <p className="text-sm font-bold text-rose-200 uppercase tracking-widest">Trace failed</p>
        <pre className="text-[12px] font-mono text-rose-100 bg-black/40 border border-rose-400/20 rounded px-3 py-2 whitespace-pre-wrap break-words">
          {statusMsg || 'Unknown error'}
        </pre>
        <div>
          <Button variant="secondary" size="small" onClick={runTrace}>Retry</Button>
        </div>
      </div>
    )
  }

  // Ready — show the full step-through UI.
  return (
    <div className="space-y-3">
      {/* Meta banner */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-white/[0.02] border border-white/10 rounded-lg">
        <span className="text-[11px] font-mono text-gray-300">
          <span className="font-bold text-white">{frames.length}</span> frames captured
        </span>
        {capped && (
          <Tooltip title="Trace was capped at 5000 steps to prevent runaway execution. This is usually caused by an infinite loop — inspect the frames before the cap to see what happened.">
            <span className="text-[11px] font-bold text-amber-300 cursor-help">⚠ capped at 5000</span>
          </Tooltip>
        )}
        {output && (
          <span className="text-[11px] font-mono text-gray-400">
            stdout: <span className="text-emerald-300">{output.length}b</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="small" onClick={runTrace}>Re-trace</Button>
        </div>
      </div>

      {/* stdout preview when non-empty */}
      {output && (
        <div className="bg-black/40 border border-white/10 rounded-lg overflow-hidden">
          <div className="px-3 py-1.5 bg-white/[0.02] border-b border-white/10">
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white">Stdout</span>
          </div>
          <pre className="text-[12px] font-mono text-gray-200 px-3 py-2 max-h-24 overflow-auto whitespace-pre-wrap break-words">
            {output}
          </pre>
        </div>
      )}

      {/* Main body: code + variables */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-3">
        <CodePane
          code={effectiveCode}
          activeLine={activeLine}
          locals={locals}
          onHoverVar={onHoverVar}
          onLeaveVar={onLeaveVar}
        />
        <VariablesPanel
          locals={locals}
          prevLocals={prevLocals}
          event={current?.event}
          returnValue={current?.return}
          exception={current?.exception}
          step={step}
          total={frames.length}
        />
      </div>

      {/* Transport */}
      <TransportBar
        playing={playing}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onStepBack={() => { setPlaying(false); setStep(s => Math.max(0, s - 1)) }}
        onStepForward={() => setStep(s => Math.min(frames.length - 1, s + 1))}
        onReset={() => { setPlaying(false); setStep(0) }}
        onScrub={s => { setPlaying(false); setStep(s) }}
        speed={speed}
        onSpeed={setSpeed}
        step={step}
        total={frames.length}
        reducedMotion={reducedMotion}
      />

      {/* Floating hover tooltip */}
      <HoverTooltip
        x={hover.x}
        y={hover.y}
        name={hover.name}
        value={hover.name ? locals[hover.name] : null}
      />
    </div>
  )
}
