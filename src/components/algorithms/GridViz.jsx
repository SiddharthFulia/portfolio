// GridViz — 2D grid used by DP tables and matrix algorithms.
//
// Data model:
//   cells   — 2D array; each cell is a primitive (rendered as-is) or a
//             { value, state?, hint? } object.
//   rowLabels / colLabels — optional headers rendered along the top/left
//   highlight    — [{ row, col, kind }] overlay ring/pulse markers used
//                  to show "current" / "backtrack" / etc.
//   maxWidth     — cap in px (default 640)
//
// Use for: 0/1 Knapsack DP table, LCS, LIS backtrack, Floyd–Warshall
// dist matrix, prefix-sum tables.

import { useMemo } from 'react'

export const GRID_STATE_COLORS = {
  idle:      'bg-white/[0.02]  border-white/10  text-gray-300',
  filled:    'bg-white/[0.05]  border-white/15  text-gray-100',
  computing: 'bg-amber-500/20  border-amber-400/70 text-amber-100',
  current:   'bg-fuchsia-500/25 border-fuchsia-400/80 text-fuchsia-100',
  chosen:    'bg-emerald-500/20 border-emerald-400/60 text-emerald-100',
  discarded: 'bg-rose-500/15   border-rose-400/40 text-rose-100',
  path:      'bg-cyan-500/20   border-cyan-400/60  text-cyan-100',
  frontier:  'bg-violet-500/20 border-violet-400/60 text-violet-100',
}

function normalize(cell) {
  if (cell == null) return { value: '', state: 'idle', hint: null }
  if (typeof cell === 'object' && !Array.isArray(cell)) {
    return { value: cell.value ?? '', state: cell.state || 'idle', hint: cell.hint || null }
  }
  return { value: cell, state: 'idle', hint: null }
}

export default function GridViz({
  cells = [],
  rowLabels,
  colLabels,
  highlight = [],
  cellSize = 44,
  maxWidth = 640,
  title,
  legend,
  className = '',
  emptyLabel = 'Grid is empty — reset to start.',
}) {
  const rows = cells.length
  const cols = cells[0]?.length || 0
  const highlightMap = useMemo(() => {
    const m = new Map()
    for (const h of highlight || []) m.set(`${h.row}-${h.col}`, h.kind || 'ring')
    return m
  }, [highlight])

  const showRowHeader = !!rowLabels?.length
  const showColHeader = !!colLabels?.length
  const gridColsCount = cols + (showRowHeader ? 1 : 0)
  const templateCols = `${showRowHeader ? 'min-content ' : ''}repeat(${cols}, minmax(0, 1fr))`
  const computedWidth = Math.min(maxWidth, gridColsCount * cellSize + (showRowHeader ? 40 : 0))

  return (
    <div className={`luxe-card rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 ${className}`}>
      {(title || legend) && (
        <div className="flex items-center justify-between mb-3">
          {title && <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-white">{title}</p>}
          {legend && <div className="text-[10px] font-mono text-gray-500">{legend}</div>}
        </div>
      )}
      {rows === 0 ? (
        <p className="text-sm text-gray-500 italic py-6 text-center">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid gap-1 mx-auto"
            style={{ gridTemplateColumns: templateCols, width: computedWidth, maxWidth: '100%' }}
          >
            {showColHeader && (
              <>
                {showRowHeader && <div />}
                {colLabels.map((l, i) => (
                  <div
                    key={`ch-${i}`}
                    className="text-[10px] font-mono text-gray-500 text-center pb-1 uppercase tracking-wider"
                  >
                    {l}
                  </div>
                ))}
              </>
            )}
            {cells.map((row, r) => (
              <>
                {showRowHeader && (
                  <div key={`rh-${r}`} className="text-[10px] font-mono text-gray-500 text-right pr-2 flex items-center justify-end uppercase tracking-wider">
                    {rowLabels[r]}
                  </div>
                )}
                {row.map((raw, c) => {
                  const cell = normalize(raw)
                  const cls = GRID_STATE_COLORS[cell.state] || GRID_STATE_COLORS.idle
                  const hk = highlightMap.get(`${r}-${c}`)
                  const ring =
                    hk === 'ring' ? 'ring-2 ring-amber-400/70' :
                    hk === 'path' ? 'ring-2 ring-cyan-400/70' :
                    hk === 'pulse' ? 'ring-2 ring-fuchsia-400/70 animate-pulse' :
                    ''
                  return (
                    <div
                      key={`c-${r}-${c}`}
                      className={`rounded-md border font-mono text-[12px] font-semibold flex items-center justify-center transition-colors ${cls} ${ring}`}
                      style={{ minWidth: cellSize, minHeight: cellSize }}
                      title={cell.hint || undefined}
                    >
                      {cell.value === '' || cell.value === null ? (
                        <span className="text-gray-600">·</span>
                      ) : cell.value}
                    </div>
                  )
                })}
              </>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
