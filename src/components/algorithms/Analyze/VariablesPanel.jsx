// VariablesPanel — right rail of the Analyze tab. Renders the current
// frame's locals dictionary with a small type-aware chrome:
//   number/bool → fuchsia
//   string      → emerald
//   list/dict   → cyan, collapsed → click to expand
//   None/null   → grey italic
//
// Deltas: variables whose repr differs from the previous frame are
// highlighted amber for one render, so the eye tracks change.

import { useEffect, useMemo, useRef, useState } from 'react'

const VALUE_KIND_RE = {
  bool: /^(True|False|true|false)$/,
  none: /^(None|null|undefined)$/,
  num:  /^-?\d+(\.\d+)?$/,
  str:  /^["'].*["']$/,
  list: /^\[.*\]$/,
  dict: /^\{.*\}$/,
}

function kindOf(repr) {
  if (!repr) return 'other'
  for (const [k, re] of Object.entries(VALUE_KIND_RE)) if (re.test(repr)) return k
  return 'other'
}

const KIND_COLOR = {
  bool:  'text-fuchsia-300',
  none:  'text-gray-500 italic',
  num:   'text-fuchsia-300',
  str:   'text-emerald-300',
  list:  'text-cyan-300',
  dict:  'text-cyan-300',
  other: 'text-gray-200',
}

function ValueChip({ repr, changed }) {
  const [expanded, setExpanded] = useState(false)
  const k = kindOf(repr)
  const long = repr && repr.length > 32
  const shown = expanded || !long ? repr : repr.slice(0, 30) + '…'
  const color = KIND_COLOR[k] || KIND_COLOR.other
  return (
    <button
      type="button"
      onClick={long ? () => setExpanded(v => !v) : undefined}
      className={`text-left w-full font-mono text-[11px] px-1.5 py-0.5 rounded transition-colors ${color} ${
        changed ? 'bg-amber-500/15 ring-1 ring-amber-400/40' : 'bg-white/[0.03]'
      } ${long ? 'cursor-pointer hover:bg-white/[0.06]' : 'cursor-default'}`}
      title={long ? (expanded ? 'Click to collapse' : 'Click to expand') : undefined}
    >
      {shown || <span className="text-gray-600">·</span>}
    </button>
  )
}

export default function VariablesPanel({
  locals = {},
  prevLocals = {},
  event = 'line',
  returnValue,
  exception,
  step = 0,
  total = 0,
}) {
  const scrollRef = useRef(null)
  // Sort keys stably. Deltas (new + changed) float to the top; unchanged
  // vars sort alphabetically underneath.
  const rows = useMemo(() => {
    const keys = Object.keys(locals)
    return keys
      .map(k => ({
        key: k,
        repr: locals[k],
        changed: prevLocals[k] !== locals[k],
        isNew: !(k in prevLocals),
      }))
      .sort((a, b) => {
        if (a.changed !== b.changed) return a.changed ? -1 : 1
        return a.key.localeCompare(b.key)
      })
  }, [locals, prevLocals])

  // Scroll to top whenever the frame advances so the user sees the delta
  // rather than staying scrolled at the bottom of the last snapshot.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [step])

  const isEmpty = rows.length === 0

  return (
    <div className="flex flex-col h-full bg-black/30 border border-white/10 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white">Variables</span>
        <span className="text-[10px] font-mono text-gray-500">
          {total > 0 ? `${step + 1} / ${total}` : '—'}
        </span>
      </div>

      {event === 'return' && (
        <div className="px-3 py-1.5 border-b border-white/10 bg-emerald-500/10 text-[11px] text-emerald-200 font-mono">
          <span className="font-bold">return</span> {returnValue}
        </div>
      )}
      {event === 'exception' && (
        <div className="px-3 py-1.5 border-b border-white/10 bg-rose-500/10 text-[11px] text-rose-200 font-mono">
          <span className="font-bold">exception</span> {exception}
        </div>
      )}
      {event === 'call' && (
        <div className="px-3 py-1.5 border-b border-white/10 bg-cyan-500/10 text-[11px] text-cyan-200 font-mono">
          <span className="font-bold">call</span> entered
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto p-2 space-y-1 min-h-[8rem]">
        {isEmpty ? (
          <p className="text-[11px] text-gray-500 italic px-2 py-3">
            No locals yet. Advance a step to see variables appear.
          </p>
        ) : (
          rows.map(r => (
            <div key={r.key} className="grid grid-cols-[auto,1fr] gap-2 items-start">
              <span className={`font-mono text-[11px] font-bold pt-0.5 ${
                r.isNew ? 'text-amber-300' : 'text-gray-400'
              }`}>
                {r.key}
              </span>
              <ValueChip repr={r.repr} changed={r.changed} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
