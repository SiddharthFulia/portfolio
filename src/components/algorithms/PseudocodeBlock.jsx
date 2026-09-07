// PseudocodeBlock — syntax-tinted pseudocode with optional live highlight.
//
// Sibling agents pass an array of lines. Each line can be:
//   { code: string, comment?: string, indent?: number }
// or a plain string (indent inferred from leading spaces).
//
// Props:
//   lines            — the code
//   activeLine       — 0-indexed, currently executing line (optional). When
//                      set, that row gets a soft amber background so users
//                      can see the "we are here" cursor tick along with
//                      the visualiser.
//   language         — label chip in the header (default "pseudocode")
//   title            — panel title, bold
//   comments         — legend footer that maps colour → meaning (optional)

import { useMemo } from 'react'

// A tiny highlighter — no full parse, just keywords and punctuation
// enough that pseudocode reads as code rather than prose. Deliberately
// language-agnostic so a page can drop in Python-ish OR C-ish text.
const KEYWORDS = new Set([
  'if', 'else', 'elif', 'while', 'for', 'do', 'to', 'in', 'and', 'or', 'not',
  'return', 'yield', 'break', 'continue', 'pass', 'true', 'false', 'null', 'nil',
  'def', 'function', 'let', 'var', 'const', 'int', 'float', 'bool', 'string',
  'push', 'pop', 'peek', 'enqueue', 'dequeue', 'insert', 'delete', 'search',
  'swap', 'compare', 'sort', 'merge', 'partition',
  'begin', 'end', 'then', 'until', 'repeat', 'foreach', 'each', 'of',
])

function tint(text) {
  // Split around string literals + comments + numbers + identifiers.
  const parts = text.split(/("[^"]*"|'[^']*'|\/\/[^\n]*|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*|[<>=!+\-*/%&|^]+)/g)
  return parts.map((p, i) => {
    if (!p) return null
    if (p.startsWith('//')) return <span key={i} className="text-gray-500 italic">{p}</span>
    if (p.startsWith('"') || p.startsWith("'")) return <span key={i} className="text-emerald-300">{p}</span>
    if (/^\d+(\.\d+)?$/.test(p)) return <span key={i} className="text-fuchsia-300">{p}</span>
    if (/^[A-Za-z_]/.test(p)) {
      if (KEYWORDS.has(p.toLowerCase())) return <span key={i} className="text-cyan-300 font-semibold">{p}</span>
      return <span key={i} className="text-gray-100">{p}</span>
    }
    if (/^[<>=!+\-*/%&|^]+$/.test(p)) return <span key={i} className="text-amber-300">{p}</span>
    return <span key={i}>{p}</span>
  })
}

export default function PseudocodeBlock({
  lines = [],
  activeLine = null,
  language = 'pseudocode',
  title = 'Pseudocode',
  comments,
  className = '',
}) {
  const normalized = useMemo(() =>
    lines.map((l) => {
      if (typeof l === 'string') {
        const m = l.match(/^(\s*)/)
        const indent = m ? m[1].length : 0
        return { code: l.replace(/^\s+/, ''), indent, comment: null }
      }
      return { code: l.code || '', indent: l.indent || 0, comment: l.comment || null }
    }), [lines])

  return (
    <div className={`luxe-card rounded-2xl border border-white/10 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
        <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-white">{title}</p>
        <span className="text-[10px] font-mono text-gray-500">{language}</span>
      </div>
      <div className="bg-[#08080b]/80">
        <pre className="text-[12.5px] leading-6 font-mono overflow-x-auto py-3">
          {normalized.map((l, i) => {
            const active = activeLine === i
            return (
              <div
                key={i}
                className={`flex items-start gap-3 px-4 border-l-2 transition-colors ${
                  active
                    ? 'bg-amber-500/10 border-amber-400'
                    : 'border-transparent hover:bg-white/[0.02]'
                }`}
              >
                <span className={`select-none w-6 text-right shrink-0 ${
                  active ? 'text-amber-300' : 'text-gray-600'
                }`}>{i + 1}</span>
                <span className="flex-1 whitespace-pre">
                  <span style={{ paddingLeft: `${l.indent * 8}px` }}>{tint(l.code)}</span>
                  {l.comment && (
                    <span className="ml-3 text-gray-500 italic">// {l.comment}</span>
                  )}
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
