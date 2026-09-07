// ComplexityTable — Best / Average / Worst / Space table with KaTeX
// Big-O cells.
//
// Row shape accepted (both work — aliases are transparent):
//   { op:     'Bubble Sort', best: 'O(n)',      avg:     'O(n^2)', worst: 'O(n^2)', space: 'O(1)' }
//   { label:  'Bubble Sort', best: 'O(n)',      average: 'O(n^2)', worst: 'O(n^2)', space: 'O(1)' }
//
// A single row can also be passed as a bare object (auto-wrapped in an array).
//
// Every non-empty cell is rendered through KaTeX. Cells that are plain
// text ("n/a", "yes") are rendered raw when KaTeX errors.

import { useMemo } from 'react'
import katex from 'katex'

const renderTex = (src) => {
  if (typeof src !== 'string') return { __html: '' }
  const clean = src.trim()
  if (!clean) return { __html: '<span class="text-gray-500">—</span>' }
  try {
    return { __html: katex.renderToString(clean, { throwOnError: false, output: 'html' }) }
  } catch {
    return { __html: `<span class="text-gray-300">${clean}</span>` }
  }
}

export default function ComplexityTable({ rows, caption, className = '' }) {
  const normalized = useMemo(() => {
    if (!rows) return []
    const arr = Array.isArray(rows) ? rows : [rows]
    return arr.map((r) => ({
      label:   r.label   ?? r.op     ?? '—',
      best:    r.best    ?? '',
      average: r.average ?? r.avg    ?? '',
      worst:   r.worst   ?? '',
      space:   r.space   ?? '',
    }))
  }, [rows])

  return (
    <div className={`luxe-card rounded-2xl border border-white/10 overflow-hidden ${className}`}>
      <div className="px-4 sm:px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
        <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-amber-300/90">
          Complexity
        </p>
        {caption && (
          <p className="text-[11px] text-gray-500 mt-0.5">{caption}</p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="text-left px-4 py-2 font-bold">Case</th>
              <th className="text-left px-4 py-2 font-bold">Best</th>
              <th className="text-left px-4 py-2 font-bold">Average</th>
              <th className="text-left px-4 py-2 font-bold">Worst</th>
              <th className="text-left px-4 py-2 font-bold">Space</th>
            </tr>
          </thead>
          <tbody>
            {normalized.map((r, i) => (
              <tr key={r.label + '-' + i} className={i % 2 ? 'bg-white/[0.015]' : ''}>
                <td className="px-4 py-2.5 text-gray-200 font-semibold whitespace-nowrap">{r.label}</td>
                <td className="px-4 py-2.5 text-emerald-300 font-mono">
                  <span dangerouslySetInnerHTML={renderTex(r.best)} />
                </td>
                <td className="px-4 py-2.5 text-amber-300 font-mono">
                  <span dangerouslySetInnerHTML={renderTex(r.average)} />
                </td>
                <td className="px-4 py-2.5 text-rose-300 font-mono">
                  <span dangerouslySetInnerHTML={renderTex(r.worst)} />
                </td>
                <td className="px-4 py-2.5 text-cyan-300 font-mono">
                  <span dangerouslySetInnerHTML={renderTex(r.space)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
