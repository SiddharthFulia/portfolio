// MultiLangCode — one algorithm, six views + a Run button.
//
// Same idea as PseudocodeBlock (line-numbered, syntax-tinted, active-line
// highlight, header chip) but with a segmented tab bar across the top for
// Pseudocode / C / C++ / Python / Java / Rust. The last-picked language is
// persisted in sessionStorage so users don't re-pick on every topic.
//
// Runnable languages (C, C++, Python, Java, Rust) get a Run button that
// hits the BE's sandboxed exec proxy. Pseudocode shows a disabled Run
// button with a "pick a real language" tooltip. Every run result is
// cached in sessionStorage keyed by (topic slug + language) so switching
// tabs doesn't lose the output.
//
// Props:
//   title        — panel title (bold)
//   active       — legacy prop, forwarded to activeLines.pseudo if that
//                  slot isn't explicitly set (keeps parity with the old
//                  PseudocodeBlock signature)
//   code         — { pseudo, c, cpp, python, java, rust } — strings, one
//                  language per key. Missing keys just skip that tab.
//   activeLines  — { pseudo?, c?, cpp?, python?, java?, rust? } — 0-indexed
//                  line to highlight per language. Omit a key → no highlight.
//   comments     — optional footer legend
//   className    — extra classes on the outer card
//   runnable     — bool (default true). Set false on read-only pages
//                  (Learn tutorials, etc.) to hide the Run controls.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tooltip } from 'antd'
import { Button } from '../ui'
import { runCode } from '../../api/codeRun'

const TABS = [
  { key: 'pseudo', label: 'Pseudocode', name: 'pseudocode' },
  { key: 'c',      label: 'C',          name: 'c' },
  { key: 'cpp',    label: 'C++',        name: 'cpp' },
  { key: 'python', label: 'Python',     name: 'python' },
  { key: 'java',   label: 'Java',       name: 'java' },
  { key: 'rust',   label: 'Rust',       name: 'rust' },
]

// Languages the sandbox will actually compile + run. `pseudo` is
// documentation — the Run button stays disabled + shows a tooltip.
const RUNNABLE = new Set(['c', 'cpp', 'python', 'java', 'rust'])

// A per-language keyword set. Kept small — enough to make the tab feel like
// code without pulling in Prism or highlight.js. Any identifier that's not
// a keyword and not a string / number falls through to plain text.
const KEYWORDS = {
  pseudo: new Set([
    'if', 'else', 'elif', 'while', 'for', 'do', 'to', 'in', 'and', 'or', 'not',
    'return', 'yield', 'break', 'continue', 'pass', 'true', 'false', 'null', 'nil',
    'function', 'def', 'let', 'var', 'const', 'int', 'float', 'bool', 'string',
    'push', 'pop', 'peek', 'enqueue', 'dequeue', 'insert', 'delete', 'search',
    'begin', 'end', 'then', 'until', 'repeat', 'foreach', 'each', 'of', 'mod',
  ]),
  c: new Set([
    'int', 'char', 'void', 'return', 'if', 'else', 'while', 'for', 'do',
    'struct', 'typedef', 'static', 'const', 'unsigned', 'long', 'short',
    'sizeof', 'break', 'continue', 'NULL', 'true', 'false', 'switch', 'case',
    'default', 'malloc', 'free', 'include', 'printf', 'scanf',
  ]),
  cpp: new Set([
    'int', 'char', 'void', 'bool', 'auto', 'return', 'if', 'else', 'while', 'for',
    'do', 'struct', 'class', 'public', 'private', 'protected', 'template',
    'typename', 'const', 'static', 'namespace', 'using', 'std', 'nullptr',
    'true', 'false', 'new', 'delete', 'this', 'virtual', 'override', 'break',
    'continue', 'switch', 'case', 'default', 'include', 'sizeof',
  ]),
  python: new Set([
    'def', 'return', 'if', 'elif', 'else', 'while', 'for', 'in', 'not', 'and',
    'or', 'is', 'True', 'False', 'None', 'class', 'self', 'from', 'import',
    'as', 'try', 'except', 'raise', 'with', 'lambda', 'yield', 'pass', 'break',
    'continue', 'global', 'nonlocal',
  ]),
  java: new Set([
    'public', 'private', 'protected', 'class', 'interface', 'extends', 'implements',
    'static', 'final', 'void', 'int', 'long', 'short', 'byte', 'char', 'boolean',
    'double', 'float', 'String', 'return', 'if', 'else', 'while', 'for', 'do',
    'new', 'this', 'super', 'null', 'true', 'false', 'try', 'catch', 'throw',
    'throws', 'import', 'package', 'break', 'continue', 'switch', 'case', 'default',
  ]),
  rust: new Set([
    'fn', 'let', 'mut', 'pub', 'struct', 'impl', 'enum', 'trait', 'for', 'while',
    'loop', 'if', 'else', 'match', 'return', 'break', 'continue', 'ref', 'as',
    'in', 'move', 'self', 'Self', 'true', 'false', 'None', 'Some', 'Ok', 'Err',
    'use', 'crate', 'mod', 'i32', 'i64', 'u32', 'u64', 'usize', 'isize', 'f32',
    'f64', 'bool', 'str', 'String', 'Vec', 'Box', 'Option', 'Result', 'where',
    'type', 'const', 'static', 'unsafe',
  ]),
}

const COMMENT_STARTS = {
  pseudo: ['//', '#'],
  c: ['//', '/*'],
  cpp: ['//', '/*'],
  python: ['#'],
  java: ['//', '/*'],
  rust: ['//'],
}

function tint(text, lang) {
  const kw = KEYWORDS[lang] || KEYWORDS.pseudo
  const starts = COMMENT_STARTS[lang] || ['//']
  // Whole-line comment? Fast path — colour the entire line grey/italic.
  const trimmed = text.trimStart()
  for (const s of starts) {
    if (trimmed.startsWith(s)) {
      return <span className="text-gray-500 italic">{text}</span>
    }
  }
  const parts = text.split(/("[^"]*"|'[^']*'|\/\/[^\n]*|#[^\n]*|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*|[<>=!+\-*/%&|^]+)/g)
  return parts.map((p, i) => {
    if (!p) return null
    if (p.startsWith('//') || (lang === 'python' && p.startsWith('#'))) {
      return <span key={i} className="text-gray-500 italic">{p}</span>
    }
    if (p.startsWith('"') || p.startsWith("'")) {
      return <span key={i} className="text-emerald-300">{p}</span>
    }
    if (/^\d+(\.\d+)?$/.test(p)) {
      return <span key={i} className="text-fuchsia-300">{p}</span>
    }
    if (/^[A-Za-z_]/.test(p)) {
      if (kw.has(p)) return <span key={i} className="text-amber-300 font-semibold">{p}</span>
      return <span key={i} className="text-gray-100">{p}</span>
    }
    if (/^[<>=!+\-*/%&|^]+$/.test(p)) {
      return <span key={i} className="text-amber-200">{p}</span>
    }
    return <span key={i}>{p}</span>
  })
}

const STORE_KEY = 'algo-lang'
function readStoredLang() {
  try {
    if (typeof window === 'undefined') return 'pseudo'
    const v = window.sessionStorage?.getItem(STORE_KEY)
    return TABS.some(t => t.key === v) ? v : 'pseudo'
  } catch { return 'pseudo' }
}

// Best-effort topic slug — the URL for every algorithms page is
// `/algorithms/<slug>` so we can lift it straight off window.location.
// Falls back to `general` for anywhere else the component is used.
// Used to key sessionStorage entries so switching between topics keeps
// each topic's last output separately.
function currentTopicSlug() {
  try {
    if (typeof window === 'undefined') return 'general'
    const parts = window.location.pathname.split('/').filter(Boolean)
    const i = parts.indexOf('algorithms')
    if (i >= 0 && parts[i + 1]) return parts[i + 1]
    return parts.join('.') || 'general'
  } catch { return 'general' }
}

function runCacheKey(topic, lang) {
  return `algo.run.${topic}.${lang}`
}

function readCachedRun(topic, lang) {
  try {
    const raw = window.sessionStorage?.getItem(runCacheKey(topic, lang))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
    return null
  } catch { return null }
}

function writeCachedRun(topic, lang, payload) {
  try {
    window.sessionStorage?.setItem(runCacheKey(topic, lang), JSON.stringify(payload))
  } catch { /* private mode or quota */ }
}

// Human-friendly summary line for the "Info" panel. `payload.limits` is
// present on server runs but missing on cache-only reads — we defensively
// stringify each field.
function infoLine(payload) {
  if (!payload) return ''
  const bits = []
  if (payload.language) bits.push(payload.language.toUpperCase())
  if (payload.version) bits.push(`v${payload.version}`)
  if (typeof payload.runtime_ms === 'number') bits.push(`${payload.runtime_ms} ms`)
  if (payload.exit_code === 0) bits.push('exit 0')
  else if (payload.exit_code === null) bits.push('runtime issue')
  else if (typeof payload.exit_code === 'number') bits.push(`exit ${payload.exit_code}`)
  if (payload.cached) bits.push('cached')
  return bits.join(' · ')
}

const RUN_TABS = [
  { key: 'stdout', label: 'Stdout' },
  { key: 'stderr', label: 'Stderr' },
  { key: 'info',   label: 'Info' },
]

// Detect the user's reduced-motion preference so we don't spin an
// endless loader on top of the accessibility contract.
function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch { return false }
}

export default function MultiLangCode({
  title = 'Implementation',
  active = null,       // legacy prop → maps to activeLines.pseudo
  code = {},
  activeLines = {},
  comments,
  className = '',
  runnable = true,
}) {
  const available = TABS.filter(t => typeof code[t.key] === 'string' && code[t.key].length > 0)
  const fallback = available[0]?.key || 'pseudo'
  const [lang, setLang] = useState(() => {
    const stored = readStoredLang()
    return available.some(t => t.key === stored) ? stored : fallback
  })
  const [copied, setCopied] = useState(false)

  // Run state — the last result payload, an in-flight phase label,
  // an elapsed-ms counter for the "compiling…" / "running…" UI, the
  // output panel tab (stdout | stderr | info), and the stdin box.
  const topic = useMemo(() => currentTopicSlug(), [])
  const [runResult, setRunResult] = useState(() => readCachedRun(topic, lang))
  const [runPhase, setRunPhase] = useState('idle')     // 'idle' | 'compiling' | 'running'
  const [runElapsed, setRunElapsed] = useState(0)
  const [runTab, setRunTab] = useState('stdout')
  const [stdin, setStdin] = useState('')
  const [showStdin, setShowStdin] = useState(false)
  const runTimerRef = useRef(null)
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])

  // Re-hydrate the cached run when the language tab changes.
  useEffect(() => {
    setRunResult(readCachedRun(topic, lang))
    setRunPhase('idle')
    setRunElapsed(0)
    setRunTab('stdout')
  }, [topic, lang])

  useEffect(() => {
    if (!available.some(t => t.key === lang)) setLang(fallback)
  }, [available, lang, fallback])

  useEffect(() => {
    try { window.sessionStorage?.setItem(STORE_KEY, lang) } catch { /* private mode */ }
  }, [lang])

  const src = code[lang] || ''
  const lines = useMemo(() => src.replace(/\t/g, '  ').split('\n'), [src])

  // active-line resolution: explicit activeLines[lang] wins, else fall back
  // to the legacy `active` prop when the tab is pseudocode.
  const activeIdx = useMemo(() => {
    if (activeLines && typeof activeLines[lang] === 'number') return activeLines[lang]
    if (lang === 'pseudo' && typeof active === 'number') return active
    return -1
  }, [activeLines, lang, active])

  const onCopy = useCallback(async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(src)
      } else {
        const ta = document.createElement('textarea')
        ta.value = src
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus(); ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch { /* clipboard blocked */ }
  }, [src])

  const isRunnable = runnable && RUNNABLE.has(lang) && src.trim().length > 0

  // Fire the run. We flip through 'compiling' → 'running' phases so the
  // button label reflects roughly what the sandbox is doing (there's no
  // real signal from upstream, but users see feedback within 300 ms of
  // clicking rather than a static spinner for 2-5 s).
  const onRun = useCallback(async () => {
    if (!isRunnable || runPhase !== 'idle') return
    setRunPhase('compiling')
    setRunElapsed(0)
    setRunTab('stdout')
    const started = Date.now()
    // Elapsed timer — 100 ms tick so the "0.4s" counter feels responsive.
    if (runTimerRef.current) clearInterval(runTimerRef.current)
    runTimerRef.current = setInterval(() => {
      const ms = Date.now() - started
      setRunElapsed(ms)
      // Once we're past ~800 ms the compile step is almost certainly
      // done, so we swap the label to "running". Pure UX signal.
      setRunPhase(prev => (prev === 'compiling' && ms > 800 ? 'running' : prev))
    }, 100)

    try {
      const { data, error } = await runCode({ language: lang, code: src, stdin })
      const payload = data || {
        stdout: '',
        stderr: error || 'Run failed.',
        exit_code: null,
        compile_output: '',
        runtime_ms: Date.now() - started,
        cached: false,
        language: lang,
      }
      setRunResult(payload)
      writeCachedRun(topic, lang, payload)
      // Auto-focus the tab most likely to be useful.
      if (payload.exit_code === 0 && payload.stdout) setRunTab('stdout')
      else if (payload.stderr || payload.compile_output) setRunTab('stderr')
      else setRunTab('info')
    } finally {
      if (runTimerRef.current) { clearInterval(runTimerRef.current); runTimerRef.current = null }
      setRunPhase('idle')
    }
  }, [isRunnable, runPhase, lang, src, stdin, topic])

  // Stop the timer if the component unmounts mid-run.
  useEffect(() => () => {
    if (runTimerRef.current) clearInterval(runTimerRef.current)
  }, [])

  const currentName = TABS.find(t => t.key === lang)?.name || lang
  const running = runPhase !== 'idle'
  const exitOk = runResult?.exit_code === 0
  const outputHeaderClass = runResult
    ? exitOk
      ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-200'
      : 'bg-rose-500/10 border-rose-400/40 text-rose-200'
    : 'bg-white/[0.02] border-white/10 text-gray-300'

  // Which body content to render in the output panel.
  const outputBody = useMemo(() => {
    if (!runResult) return ''
    if (runTab === 'stdout') return runResult.stdout || ''
    if (runTab === 'stderr') {
      // Prefer compile_output when present — it's the friendlier of the
      // two on a build failure.
      return runResult.compile_output || runResult.stderr || ''
    }
    if (runTab === 'info') {
      const lines = [infoLine(runResult)]
      if (runResult.limits) {
        lines.push(
          `Runtime cap: ${(runResult.limits.run_timeout_ms || 0) / 1000}s`,
          `Compile cap: ${(runResult.limits.compile_timeout_ms || 0) / 1000}s`,
          `Memory cap: ${Math.round((runResult.limits.memory_bytes || 0) / 1024 / 1024)} MB`,
          `Source cap: ${Math.round((runResult.limits.source_bytes || 0) / 1024)} KB`,
        )
      }
      return lines.filter(Boolean).join('\n')
    }
    return ''
  }, [runResult, runTab])

  return (
    <div className={`luxe-card rounded-2xl border border-white/10 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 bg-white/[0.02] flex-wrap">
        <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-white">{title}</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-gray-500 hidden sm:inline">{currentName}</span>
          <button
            type="button"
            onClick={onCopy}
            data-success={copied ? 'true' : undefined}
            className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${
              copied
                ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06] hover:text-white'
            }`}
            aria-label="Copy code"
          >
            {copied ? 'copied ✓' : 'copy'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-white/10 bg-white/[0.015]">
        {available.map(t => {
          const on = t.key === lang
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setLang(t.key)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-md transition-colors ${
                on
                  ? t.key === 'pseudo'
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                    : 'bg-white/10 text-white border border-white/20'
                  : 'text-gray-400 border border-transparent hover:bg-white/[0.04] hover:text-gray-200'
              }`}
              aria-pressed={on}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Run controls row + safety banner */}
      {runnable && (
        <div className="flex flex-col gap-2 px-3 py-2 border-b border-white/10 bg-white/[0.015]">
          <div className="flex flex-wrap items-center gap-2">
            {isRunnable ? (
              <Button
                variant="primary"
                size="small"
                onClick={onRun}
                loading={running}
                disabled={running}
                aria-label="Run code in a sandbox"
              >
                {runPhase === 'compiling' && `Compiling… ${(runElapsed / 1000).toFixed(1)}s`}
                {runPhase === 'running'   && `Running… ${(runElapsed / 1000).toFixed(1)}s`}
                {runPhase === 'idle'      && 'Run'}
              </Button>
            ) : (
              <Tooltip title={lang === 'pseudo'
                ? 'Pseudo-code — pick a language to run'
                : 'This tab has nothing to run'}>
                <span>
                  <Button variant="secondary" size="small" disabled aria-disabled="true">
                    Run
                  </Button>
                </span>
              </Tooltip>
            )}
            <button
              type="button"
              onClick={() => setShowStdin(v => !v)}
              className="text-[11px] font-bold text-gray-400 hover:text-gray-200 px-2 py-1 rounded border border-transparent hover:border-white/10 transition-colors"
              aria-expanded={showStdin}
              aria-controls="algo-stdin-input"
            >
              {showStdin ? 'Hide stdin' : 'Add stdin'}
            </button>
            {reducedMotion
              ? null
              : running && (
                <span className="text-[10px] font-mono text-gray-500 hidden sm:inline">
                  sandbox active — this is safe
                </span>
              )}
          </div>

          {/* Stdin — collapsible, only rendered when opened */}
          {showStdin && (
            <div>
              <label htmlFor="algo-stdin-input" className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                Stdin
              </label>
              <textarea
                id="algo-stdin-input"
                value={stdin}
                onChange={e => setStdin(e.target.value.slice(0, 4096))}
                rows={2}
                placeholder="One line per input the program reads…"
                spellCheck={false}
                className="w-full text-[12px] font-mono bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-400/50 resize-y"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Piped to the program on stdin. Max 4 KB.
              </p>
            </div>
          )}

          <p className="text-[10px] leading-relaxed text-gray-500">
            <span className="font-bold text-gray-400">Run limits:</span>{' '}
            5s runtime · 15s compile · 256MB memory · 20KB source · 10 runs/min.
          </p>
        </div>
      )}

      {/* Code */}
      <div className="bg-[#08080b]/80">
        <pre className="text-[12.5px] leading-6 font-mono overflow-x-auto py-3">
          {lines.map((raw, i) => {
            const isActive = activeIdx === i
            return (
              <div
                key={i}
                className={`flex items-start gap-3 px-4 border-l-2 transition-colors ${
                  isActive
                    ? 'bg-amber-500/10 border-amber-400'
                    : 'border-transparent hover:bg-white/[0.02]'
                }`}
              >
                <span className={`select-none w-7 text-right shrink-0 ${
                  isActive ? 'text-amber-300' : 'text-gray-600'
                }`}>{i + 1}</span>
                <span className="flex-1 whitespace-pre">
                  {tint(raw.length ? raw : ' ', lang)}
                </span>
              </div>
            )
          })}
        </pre>
      </div>

      {/* Output panel — only rendered when a run has happened */}
      {runnable && runResult && (
        <div className="border-t border-white/10">
          {/* Output tabs + status header */}
          <div className={`flex items-center gap-1 px-3 py-2 border-b ${outputHeaderClass}`}>
            <p className="text-[11px] uppercase tracking-[0.2em] font-bold mr-2">
              Output
            </p>
            {RUN_TABS.map(t => {
              const on = t.key === runTab
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setRunTab(t.key)}
                  className={`text-[11px] font-bold px-2 py-0.5 rounded transition-colors ${
                    on ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-100'
                  }`}
                  aria-pressed={on}
                >
                  {t.label}
                </button>
              )
            })}
            <span className="ml-auto text-[10px] font-mono opacity-80 hidden sm:inline">
              {infoLine(runResult)}
            </span>
          </div>

          {/* Output body */}
          <pre className="bg-[#08080b]/90 text-[12px] leading-6 font-mono text-gray-200 px-4 py-3 max-h-64 overflow-auto whitespace-pre-wrap break-words">
            {outputBody || <span className="text-gray-600">(empty)</span>}
          </pre>
        </div>
      )}

      {comments && (
        <div className="px-4 py-2 border-t border-white/10 bg-white/[0.015] text-[11px] text-gray-400">
          {comments}
        </div>
      )}
    </div>
  )
}
