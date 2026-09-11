// MultiLangCode — one algorithm, six views, a real Monaco IDE.
//
// Segmented tab bar across the top: Pseudocode / C / C++ / Python /
// Java / Rust. Each tab loads a Monaco editor (lazy-loaded — the
// ~500KB Monaco chunk only ships to `/algorithms/*` visitors) with:
//   - Editable source code (persisted per-topic-per-language)
//   - 8 hand-picked themes (default VS Code Dark+)
//   - Export to disk with the right extension
//   - Reset to the canonical implementation
//   - Auto-run toggle (debounced 800ms) with in-flight abort
//   - Runnable languages fire the same sandboxed exec API as before
//
// Props:
//   title        — panel title (bold)
//   active       — legacy prop, forwarded to activeLines.pseudo if that
//                  slot isn't explicitly set
//   code         — { pseudo, c, cpp, python, java, rust } — strings, one
//                  language per key. Missing keys just skip that tab.
//   activeLines  — { pseudo?, c?, cpp?, python?, java?, rust? } — 0-indexed
//                  line to highlight per language (only used when the
//                  editor value matches the canonical source — otherwise
//                  the user is editing and highlighting the wrong line
//                  would be misleading).
//   comments     — optional footer legend
//   className    — extra classes on the outer card
//   runnable     — bool (default true). Set false on read-only pages
//                  (Learn tutorials, etc.) to hide the Run + editor
//                  controls; falls back to a read-only Monaco view.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tooltip, Switch } from 'antd'
import { Button } from '../ui'
import { runCode } from '../../api/codeRun'
import { THEMES, DEFAULT_THEME_ID } from './monacoThemes'

// Monaco is heavy (~500KB gzipped) — code-split it out of the main
// bundle. Only algorithms-page visitors download this chunk.
const MonacoEditorPanel = lazy(() => import('./MonacoEditorPanel'))

// Analyze tab (step-through debugger) — Pyodide + js-interpreter are
// both CDN-loaded on first Trace click, so this chunk stays tiny and
// out of the main graph.
const Analyze = lazy(() => import('./Analyze'))

// Languages the Analyze tab supports in-browser today. Python via
// Pyodide, JavaScript via NeilFraser/JS-Interpreter (ES5). C / C++ /
// Java / Rust would need a GDB backend — the tab still opens on those,
// but shows a "coming soon" panel.
const ANALYZE_SUPPORTED = new Set(['python', 'js', 'javascript'])

const TABS = [
  { key: 'pseudo', label: 'Pseudocode', name: 'pseudocode', monacoLang: 'plaintext', ext: 'txt' },
  { key: 'c',      label: 'C',          name: 'c',          monacoLang: 'c',         ext: 'c'   },
  { key: 'cpp',    label: 'C++',        name: 'cpp',        monacoLang: 'cpp',       ext: 'cpp' },
  { key: 'python', label: 'Python',     name: 'python',     monacoLang: 'python',    ext: 'py'  },
  { key: 'java',   label: 'Java',       name: 'java',       monacoLang: 'java',      ext: 'java'},
  { key: 'rust',   label: 'Rust',       name: 'rust',       monacoLang: 'rust',      ext: 'rs'  },
]

// Languages the sandbox will actually compile + run. `pseudo` is
// documentation — the Run button stays disabled + shows a tooltip.
const RUNNABLE = new Set(['c', 'cpp', 'python', 'java', 'rust'])

const LANG_STORE_KEY = 'algo-lang'
const THEME_STORE_KEY = 'algo-monaco-theme'

function readStoredLang() {
  try {
    if (typeof window === 'undefined') return 'pseudo'
    const v = window.sessionStorage?.getItem(LANG_STORE_KEY)
    return TABS.some(t => t.key === v) ? v : 'pseudo'
  } catch { return 'pseudo' }
}

function readStoredTheme() {
  try {
    if (typeof window === 'undefined') return DEFAULT_THEME_ID
    const v = window.localStorage?.getItem(THEME_STORE_KEY)
    return THEMES.some(t => t.id === v) ? v : DEFAULT_THEME_ID
  } catch { return DEFAULT_THEME_ID }
}

// Best-effort topic slug — the URL for every algorithms page is
// `/algorithms/<slug>` so we can lift it straight off window.location.
// Falls back to `general` for anywhere else the component is used.
function currentTopicSlug() {
  try {
    if (typeof window === 'undefined') return 'general'
    const parts = window.location.pathname.split('/').filter(Boolean)
    const i = parts.indexOf('algorithms')
    if (i >= 0 && parts[i + 1]) return parts[i + 1]
    return parts.join('.') || 'general'
  } catch { return 'general' }
}

// ─── localStorage: per-topic-per-language code drafts ─────────────
function codeKey(topic, lang) { return `algo.code.${topic}.${lang}` }
function readSavedCode(topic, lang) {
  try { return window.localStorage?.getItem(codeKey(topic, lang)) ?? null }
  catch { return null }
}
function writeSavedCode(topic, lang, value) {
  try { window.localStorage?.setItem(codeKey(topic, lang), value) }
  catch { /* private mode or quota */ }
}
function clearSavedCode(topic, lang) {
  try { window.localStorage?.removeItem(codeKey(topic, lang)) }
  catch { /* ignore */ }
}

// ─── sessionStorage: cached run results ─────────────────────────
function runCacheKey(topic, lang) { return `algo.run.${topic}.${lang}` }
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
  try { window.sessionStorage?.setItem(runCacheKey(topic, lang), JSON.stringify(payload)) }
  catch { /* private mode or quota */ }
}

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
  { key: 'info',   label: 'Info'   },
]

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch { return false }
}

function isMobileViewport() {
  try {
    return typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(max-width: 767px)').matches
  } catch { return false }
}

// Trigger a browser download of the given text as a file.
function downloadTextFile(filename, text) {
  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 500)
  } catch { /* ignore */ }
}

export default function MultiLangCode({
  title = 'Implementation',
  active = null,       // legacy → maps to activeLines.pseudo
  code = {},
  activeLines = {},
  comments,
  className = '',
  runnable = true,
  samples = null,      // optional [{ name, description, stdin, expected }]
}) {
  const available = TABS.filter(t => typeof code[t.key] === 'string' && code[t.key].length > 0)
  const fallback = available[0]?.key || 'pseudo'
  const [lang, setLang] = useState(() => {
    const stored = readStoredLang()
    return available.some(t => t.key === stored) ? stored : fallback
  })
  const [theme, setTheme] = useState(() => readStoredTheme())
  const [copied, setCopied] = useState(false)

  const topic = useMemo(() => currentTopicSlug(), [])
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])
  const [mobile, setMobile] = useState(() => isMobileViewport())

  // Canonical (reference implementation) source for the current tab —
  // used as the baseline for Reset and as the initial value when there
  // is no saved draft.
  const canonical = code[lang] || ''

  // The editor's current value. Seeded from localStorage first, falling
  // back to canonical.
  const [source, setSource] = useState(() => {
    const saved = readSavedCode(topic, lang)
    return saved != null ? saved : canonical
  })

  // Run state
  const [runResult, setRunResult] = useState(() => readCachedRun(topic, lang))
  const [runPhase, setRunPhase] = useState('idle')     // 'idle' | 'compiling' | 'running' | 'auto'
  const [runElapsed, setRunElapsed] = useState(0)
  const [runTab, setRunTab] = useState('stdout')
  const [stdin, setStdin] = useState('')
  const [showStdin, setShowStdin] = useState(false)
  const [autoRun, setAutoRun] = useState(false)
  const [activeSample, setActiveSample] = useState(null)
  const runTimerRef = useRef(null)
  const abortRef = useRef(null)
  const saveDebounceRef = useRef(null)
  const autoRunDebounceRef = useRef(null)

  // Analyze mode — swaps the Monaco editor + Run panels for the
  // step-through debugger. Stays off by default (opt-in on click).
  const [analyzeOn, setAnalyzeOn] = useState(false)

  // ─── viewport tracking (for auto-disabling auto-run on mobile) ──
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 767px)')
    if (!mq) return
    const on = () => setMobile(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])

  // ─── re-hydrate cached run + saved source when lang / topic flips
  useEffect(() => {
    setRunResult(readCachedRun(topic, lang))
    setRunPhase('idle')
    setRunElapsed(0)
    setRunTab('stdout')
    const saved = readSavedCode(topic, lang)
    setSource(saved != null ? saved : (code[lang] || ''))
  // Intentionally exclude `code` — it's a fresh object literal on every
  // parent render, so including it would clobber the user's edits with
  // canonical on every keystroke elsewhere on the page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, lang])

  useEffect(() => {
    if (!available.some(t => t.key === lang)) setLang(fallback)
  }, [available, lang, fallback])

  useEffect(() => {
    try { window.sessionStorage?.setItem(LANG_STORE_KEY, lang) } catch { /* ignore */ }
  }, [lang])

  useEffect(() => {
    try { window.localStorage?.setItem(THEME_STORE_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  // active-line resolution: only meaningful when the user hasn't diverged
  // from the canonical source (otherwise "line 12" points at a different
  // instruction after edits).
  const activeIdx = useMemo(() => {
    if (source !== canonical) return -1
    if (activeLines && typeof activeLines[lang] === 'number') return activeLines[lang]
    if (lang === 'pseudo' && typeof active === 'number') return active
    return -1
  }, [source, canonical, activeLines, lang, active])

  const onCopy = useCallback(async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(source)
      } else {
        const ta = document.createElement('textarea')
        ta.value = source
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
  }, [source])

  const isRunnable = runnable && RUNNABLE.has(lang) && source.trim().length > 0

  // Core run function — used by both the Run button and auto-run. The
  // `silent` flag lets auto-run avoid stealing the output-tab focus.
  const doRun = useCallback(async ({ silent = false } = {}) => {
    if (!isRunnable) return
    // Cancel any in-flight run first (auto-run rapid-fire case).
    if (abortRef.current) {
      try { abortRef.current.abort() } catch { /* ignore */ }
    }
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setRunPhase(silent ? 'auto' : 'compiling')
    setRunElapsed(0)
    if (!silent) setRunTab('stdout')
    const started = Date.now()

    if (runTimerRef.current) clearInterval(runTimerRef.current)
    runTimerRef.current = setInterval(() => {
      const ms = Date.now() - started
      setRunElapsed(ms)
      if (!silent) {
        setRunPhase(prev => (prev === 'compiling' && ms > 800 ? 'running' : prev))
      }
    }, 100)

    try {
      const { data, error } = await runCode({ language: lang, code: source, stdin, signal: ctrl.signal })
      if (ctrl.signal.aborted) return
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
      if (!silent) {
        if (payload.exit_code === 0 && payload.stdout) setRunTab('stdout')
        else if (payload.stderr || payload.compile_output) setRunTab('stderr')
        else setRunTab('info')
      }
    } finally {
      if (runTimerRef.current) { clearInterval(runTimerRef.current); runTimerRef.current = null }
      setRunPhase('idle')
      if (abortRef.current === ctrl) abortRef.current = null
    }
  }, [isRunnable, lang, source, stdin, topic])

  const onRun = useCallback(() => {
    if (runPhase !== 'idle') return
    doRun({ silent: false })
  }, [doRun, runPhase])

  // ─── debounced localStorage save on every edit ────────────────
  useEffect(() => {
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    saveDebounceRef.current = setTimeout(() => {
      // Only persist a draft when it diverges from the canonical value.
      if (source === canonical) clearSavedCode(topic, lang)
      else writeSavedCode(topic, lang, source)
    }, 500)
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    }
  }, [source, canonical, topic, lang])

  // ─── auto-run: debounce 800ms after keystrokes, abort in-flight ─
  useEffect(() => {
    if (!autoRun || !isRunnable || mobile) return
    if (autoRunDebounceRef.current) clearTimeout(autoRunDebounceRef.current)
    autoRunDebounceRef.current = setTimeout(() => {
      doRun({ silent: true })
    }, 800)
    return () => {
      if (autoRunDebounceRef.current) clearTimeout(autoRunDebounceRef.current)
    }
  // Intentionally reacts to source / stdin / autoRun / lang. Rebuilding
  // the timer on every render is exactly the debounce behaviour we want.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, stdin, autoRun, isRunnable, mobile, lang])

  // Auto-disable auto-run when the viewport goes mobile.
  useEffect(() => {
    if (mobile && autoRun) setAutoRun(false)
  }, [mobile, autoRun])

  // Stop timers + abort in-flight on unmount.
  useEffect(() => () => {
    if (runTimerRef.current) clearInterval(runTimerRef.current)
    if (autoRunDebounceRef.current) clearTimeout(autoRunDebounceRef.current)
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    if (abortRef.current) { try { abortRef.current.abort() } catch { /* ignore */ } }
  }, [])

  // ─── Export: download current source with the right extension ──
  const onExport = useCallback(() => {
    const t = TABS.find(x => x.key === lang)
    const ext = t?.ext || 'txt'
    const filename = `${topic || 'algorithm'}.${ext}`
    downloadTextFile(filename, source)
  }, [lang, topic, source])

  // ─── Reset: revert to canonical + clear the localStorage draft ──
  const onReset = useCallback(() => {
    clearSavedCode(topic, lang)
    setSource(canonical)
  }, [topic, lang, canonical])

  const currentTab = TABS.find(t => t.key === lang)
  const currentName = currentTab?.name || lang
  const monacoLang = currentTab?.monacoLang || 'plaintext'
  const running = runPhase !== 'idle'
  const isDirty = source !== canonical
  const exitOk = runResult?.exit_code === 0
  const outputHeaderClass = runResult
    ? exitOk
      ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-200'
      : 'bg-rose-500/10 border-rose-400/40 text-rose-200'
    : 'bg-white/[0.02] border-white/10 text-gray-300'

  const outputBody = useMemo(() => {
    if (!runResult) return ''
    if (runTab === 'stdout') return runResult.stdout || ''
    if (runTab === 'stderr') {
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

  const editorReadOnly = !runnable

  return (
    <div className={`luxe-card rounded-2xl border border-white/10 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 bg-white/[0.02] flex-wrap">
        <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-white">{title}</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-gray-500 hidden sm:inline">{currentName}</span>
          {/* Theme picker */}
          <Tooltip title="Editor theme — remembered per browser.">
            <select
              value={theme}
              onChange={e => setTheme(e.target.value)}
              aria-label="Editor theme"
              className="text-[10px] font-mono px-2 py-1 rounded border border-white/10 bg-white/[0.03] text-gray-200 hover:bg-white/[0.06] focus:outline-none focus:border-amber-400/50"
            >
              {THEMES.map(t => (
                <option key={t.id} value={t.id} className="bg-[#0a0a0e] text-gray-200">
                  {t.label}
                </option>
              ))}
            </select>
          </Tooltip>
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

      {/* Language tabs */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-white/10 bg-white/[0.015]">
        {available.map(t => {
          const on = t.key === lang
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => { setLang(t.key); if (analyzeOn) setAnalyzeOn(false) }}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-md transition-colors ${
                on && !analyzeOn
                  ? t.key === 'pseudo'
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                    : 'bg-white/10 text-white border border-white/20'
                  : 'text-gray-400 border border-transparent hover:bg-white/[0.04] hover:text-gray-200'
              }`}
              aria-pressed={on && !analyzeOn}
            >
              {t.label}
            </button>
          )
        })}
        {/* Vertical divider + Analyze tab */}
        <span className="mx-1 h-4 w-px bg-white/10 hidden sm:inline-block" aria-hidden="true" />
        <Tooltip title={
          ANALYZE_SUPPORTED.has(lang)
            ? 'Step through the code line-by-line and inspect variables at each step.'
            : `Step-through for ${currentTab?.name || lang} is coming soon — try Python for now.`
        }>
          <button
            type="button"
            onClick={() => setAnalyzeOn(v => !v)}
            className={`text-[11px] font-bold px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1 ${
              analyzeOn
                ? 'bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-400/40'
                : 'text-gray-400 border border-transparent hover:bg-white/[0.04] hover:text-gray-200'
            }`}
            aria-pressed={analyzeOn}
          >
            <span aria-hidden="true">🔍</span> Analyze
          </button>
        </Tooltip>
      </div>

      {/* Body: Monaco editor OR Analyze step-through */}
      {analyzeOn ? (
        <div className="p-3 bg-[#08080b]/60">
          <Suspense fallback={
            <div className="h-[240px] flex items-center justify-center text-[11px] font-mono text-gray-500">
              Loading Analyze…
            </div>
          }>
            <Analyze code={source} lang={lang} topicSlug={topic} />
          </Suspense>
        </div>
      ) : (
      <div className="bg-[#08080b]/80" style={{ minHeight: 360 }}>
        <Suspense fallback={
          <div className="h-[360px] flex items-center justify-center text-[11px] font-mono text-gray-500">
            Loading editor…
          </div>
        }>
          <MonacoEditorPanel
            value={source}
            language={monacoLang}
            theme={theme}
            onChange={setSource}
            height="360px"
            readOnly={editorReadOnly}
            reducedMotion={reducedMotion}
          />
        </Suspense>
        {activeIdx >= 0 && (
          <div className="px-4 py-1 text-[10px] font-mono text-amber-300/80 bg-amber-500/5 border-t border-amber-400/20">
            active line: {activeIdx + 1}
          </div>
        )}
      </div>
      )}

      {/* Run controls + auto-run + export + reset */}
      {runnable && !analyzeOn && (
        <div className="flex flex-col gap-2 px-3 py-2 border-b border-white/10 bg-white/[0.015]">
          {/* Sample-input chip row */}
          {Array.isArray(samples) && samples.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">
                Samples:
              </span>
              {samples.map((s) => {
                const on = activeSample === s.name
                return (
                  <Tooltip key={s.name} title={s.description || s.name}>
                    <button
                      type="button"
                      onClick={() => {
                        setStdin(s.stdin || '')
                        setActiveSample(s.name)
                        setShowStdin(true)
                      }}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${
                        on
                          ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                          : 'text-gray-300 border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:text-white'
                      }`}
                      aria-pressed={on}
                    >
                      {s.name}
                    </button>
                  </Tooltip>
                )
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {isRunnable ? (
              <Button
                variant="primary"
                size="small"
                onClick={onRun}
                loading={running && runPhase !== 'auto'}
                disabled={running}
                aria-label="Run code in a sandbox"
              >
                {runPhase === 'compiling' && `Compiling… ${(runElapsed / 1000).toFixed(1)}s`}
                {runPhase === 'running'   && `Running… ${(runElapsed / 1000).toFixed(1)}s`}
                {runPhase === 'auto'      && 'Run'}
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

            {/* Auto-run toggle — hidden on mobile to save BE quota */}
            {!mobile && (
              <Tooltip title="Runs 800ms after you stop typing. Rate-limited to 10 runs/min.">
                <label className="flex items-center gap-2 text-[11px] font-bold text-gray-300 cursor-pointer px-2 py-1 rounded border border-white/10 bg-white/[0.03] hover:bg-white/[0.06]">
                  <Switch
                    size="small"
                    checked={autoRun}
                    onChange={setAutoRun}
                    disabled={!RUNNABLE.has(lang)}
                    aria-label="Auto-run on change"
                  />
                  <span>Auto-run</span>
                </label>
              </Tooltip>
            )}

            <Tooltip title={`Downloads the current code as a .${currentTab?.ext || 'txt'} file.`}>
              <Button
                variant="ghost"
                size="small"
                onClick={onExport}
                disabled={!source.trim()}
                aria-label="Export code as file"
              >
                Export
              </Button>
            </Tooltip>

            <Tooltip title="Reverts to the reference implementation.">
              <span>
                <Button
                  variant="subtle"
                  size="small"
                  onClick={onReset}
                  disabled={!isDirty}
                  aria-label="Reset to reference implementation"
                >
                  Reset
                </Button>
              </span>
            </Tooltip>

            <button
              type="button"
              onClick={() => setShowStdin(v => !v)}
              className="text-[11px] font-bold text-gray-400 hover:text-gray-200 px-2 py-1 rounded border border-transparent hover:border-white/10 transition-colors"
              aria-expanded={showStdin}
              aria-controls="algo-stdin-input"
            >
              {showStdin ? 'Hide stdin' : 'Add stdin'}
            </button>

            {isDirty && (
              <span className="text-[10px] font-mono text-amber-300/80 hidden sm:inline">
                edited · saved locally
              </span>
            )}

            {runPhase === 'auto' && !reducedMotion && (
              <span className="text-[10px] font-mono text-gray-400 hidden sm:inline">
                auto-running…
              </span>
            )}

            {reducedMotion
              ? null
              : (running && runPhase !== 'auto') && (
                <span className="text-[10px] font-mono text-gray-500 hidden sm:inline">
                  sandbox active — this is safe
                </span>
              )}
          </div>

          {/* Stdin */}
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

      {/* Output panel */}
      {runnable && !analyzeOn && runResult && (
        <div className="border-t border-white/10">
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
            {/* Expected-output match indicator */}
            {(() => {
              if (!activeSample || !Array.isArray(samples) || !runResult) return null
              const s = samples.find(x => x.name === activeSample)
              if (!s || !s.expected) return null
              const actual = (runResult.stdout || '').trim()
              const expected = String(s.expected).trim()
              const ok = actual === expected
              return (
                <Tooltip title={ok
                  ? `Output matches expected for "${s.name}"`
                  : `Output differs from expected for "${s.name}"`}>
                  <span className={`text-[11px] font-bold ml-1 ${ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {ok ? '✓ match' : '✗ diff'}
                  </span>
                </Tooltip>
              )
            })()}
            <span className="ml-auto text-[10px] font-mono opacity-80 hidden sm:inline">
              {infoLine(runResult)}
            </span>
          </div>

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
