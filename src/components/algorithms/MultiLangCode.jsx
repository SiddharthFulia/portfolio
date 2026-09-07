// MultiLangCode — one algorithm, six views.
//
// Same idea as PseudocodeBlock (line-numbered, syntax-tinted, active-line
// highlight, header chip) but with a segmented tab bar across the top for
// Pseudocode / C / C++ / Python / Java / Rust. The last-picked language is
// persisted in sessionStorage so users don't re-pick on every topic.
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

import { useEffect, useMemo, useState, useCallback } from 'react'

const TABS = [
  { key: 'pseudo', label: 'Pseudocode', name: 'pseudocode' },
  { key: 'c',      label: 'C',          name: 'c' },
  { key: 'cpp',    label: 'C++',        name: 'cpp' },
  { key: 'python', label: 'Python',     name: 'python' },
  { key: 'java',   label: 'Java',       name: 'java' },
  { key: 'rust',   label: 'Rust',       name: 'rust' },
]

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

export default function MultiLangCode({
  title = 'Implementation',
  active = null,       // legacy prop → maps to activeLines.pseudo
  code = {},
  activeLines = {},
  comments,
  className = '',
}) {
  const available = TABS.filter(t => typeof code[t.key] === 'string' && code[t.key].length > 0)
  const fallback = available[0]?.key || 'pseudo'
  const [lang, setLang] = useState(() => {
    const stored = readStoredLang()
    return available.some(t => t.key === stored) ? stored : fallback
  })
  const [copied, setCopied] = useState(false)

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

  const currentName = TABS.find(t => t.key === lang)?.name || lang

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

      {comments && (
        <div className="px-4 py-2 border-t border-white/10 bg-white/[0.015] text-[11px] text-gray-400">
          {comments}
        </div>
      )}
    </div>
  )
}
