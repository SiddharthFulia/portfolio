// Saved games library panel. Lists rows from /api/chess/games, click to
// load, rename inline, delete with confirm. Refreshes when refreshKey
// changes (parent bumps it after save / delete).
//
// Groups games by `collection` — rows from bulk PGN uploads land in a
// folder per collection (e.g. "📁 MacKenzie — 105 games") that collapses
// to keep the list scannable. Games without a collection live in a
// fixed "Unfiled" section at the top.
//
// Props:
//   refreshKey   — bump to re-fetch
//   onLoad(row)  — called when user picks a row to restore on the board

import { useEffect, useMemo, useState } from 'react'
import { Modal } from 'antd'
import { chessListGames, chessUpdateGame, chessDeleteGame } from '../../api/ai'

const RESULT_TAG = {
  '1-0':    { label: '1-0', tone: 'text-amber-200 bg-amber-500/15 border-amber-500/40' },
  '0-1':    { label: '0-1', tone: 'text-cyan-200 bg-cyan-500/15 border-cyan-500/40' },
  '1/2-1/2':{ label: '½-½', tone: 'text-gray-300 bg-gray-700/40 border-gray-600' },
  '*':      { label: '·',  tone: 'text-violet-300 bg-violet-500/15 border-violet-500/40' },
}
const fmtAgo = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const m = Math.floor((Date.now() - d) / 60_000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return d.toLocaleDateString()
}

export default function SavedGames({ refreshKey, onLoad }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  // collectionName → bool (true = collapsed). Default = collapsed for
  // any new collection encountered (we render the header but hide the
  // game rows underneath until the user clicks).
  const [collapsed, setCollapsed] = useState(() => new Map())

  const refetch = async () => {
    setLoading(true)
    // Bumped limit — a single bulk PGN upload can be 100+ games and the
    // grouped view is worthless if the API caps at 50.
    const { data } = await chessListGames({ limit: 200 })
    setItems(data?.items || [])
    setLoading(false)
  }
  useEffect(() => { refetch() }, [refreshKey])

  // Bucket rows into { unfiled: [], byCollection: Map<name, rows[]> }.
  // Insertion order on the Map preserves "most recently updated first"
  // because `items` already arrives sorted by updatedAt DESC.
  const grouped = useMemo(() => {
    const unfiled = []
    const byCollection = new Map()
    for (const row of items) {
      if (!row.collection) {
        unfiled.push(row)
      } else {
        if (!byCollection.has(row.collection)) byCollection.set(row.collection, [])
        byCollection.get(row.collection).push(row)
      }
    }
    return { unfiled, byCollection }
  }, [items])

  const toggle = (name) => {
    setCollapsed(prev => {
      const next = new Map(prev)
      // Folders start expanded by default — if no entry, clicking
      // collapses (sets true). Subsequent clicks flip the bool.
      const cur = next.get(name) ?? false
      next.set(name, !cur)
      return next
    })
  }

  const startRename = (row) => { setEditingId(row.id); setEditName(row.name) }
  const commitRename = async (row) => {
    const name = editName.trim()
    if (!name || name === row.name) { setEditingId(null); return }
    await chessUpdateGame(row.id, { name })
    setEditingId(null); refetch()
  }
  // Two-step confirm so users can't nuke a 50-move masterclass on a
  // mistap. Both modals are antd-styled — the second is the harder one
  // to dismiss (autoFocusButton: 'cancel' so Enter cancels, not deletes).
  const remove = (row) => {
    Modal.confirm({
      title: '🗑 Delete saved game?',
      content: (
        <div className="text-sm text-gray-300 mt-2">
          About to delete <span className="text-amber-200 font-semibold">"{row.name}"</span>.
          <div className="text-[11px] text-gray-500 mt-2">
            {row.moveCount} ply · {row.engineName || row.mode} · result {row.result === '1/2-1/2' ? '½-½' : row.result}
          </div>
        </div>
      ),
      okText: 'Continue',
      okButtonProps: { danger: true },
      cancelText: 'Keep it',
      centered: true,
      autoFocusButton: 'cancel',
      onOk: () => confirmDelete(row),
    })
  }
  const confirmDelete = (row) => {
    Modal.confirm({
      title: '⚠ Are you sure? This is permanent.',
      content: (
        <div className="text-sm text-rose-200/90 mt-2 leading-relaxed">
          Final confirmation. <span className="font-semibold">"{row.name}"</span> will be
          removed from your library and there's no undo. The PGN and game
          metadata get wiped from the database immediately.
        </div>
      ),
      okText: '🗑 Delete forever',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      centered: true,
      autoFocusButton: 'cancel',
      onOk: async () => {
        await chessDeleteGame(row.id)
        refetch()
      },
    })
  }

  // Shared per-row renderer (used by both the Unfiled list and each
  // collection folder).
  const renderRow = (row) => {
    const tag = RESULT_TAG[row.result] || RESULT_TAG['*']
    return (
      <li key={row.id}
        className="group rounded-lg border border-gray-800 hover:border-amber-500/40 bg-gray-900/40 hover:bg-gray-900/80 transition-colors p-2">
        <div className="flex items-center justify-between gap-2 mb-1">
          {editingId === row.id ? (
            <input value={editName} onChange={e => setEditName(e.target.value)}
              onBlur={() => commitRename(row)}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(row); if (e.key === 'Escape') setEditingId(null) }}
              autoFocus
              className="flex-1 bg-surface-elevated border border-amber-500/40 rounded px-1.5 py-0.5 text-xs text-gray-100" />
          ) : (
            <button onClick={() => onLoad?.(row)}
              className="flex-1 text-left text-xs font-semibold text-gray-100 hover:text-amber-200 line-clamp-2 leading-tight">
              {row.name}
            </button>
          )}
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${tag.tone}`}>
            {tag.label}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono">
          <span className="truncate">
            {row.engineName && (
              <>
                <span className="text-gray-400">{row.engineName}</span>
                {row.engineStrength ? <span className="text-amber-400/80"> · {row.engineStrength}</span> : null}
                {row.timeControl && row.timeControl !== 'none' ? <span className="text-cyan-400/80"> · {row.timeControl}</span> : null}
              </>
            )}
            {!row.engineName && <span>{row.mode || '—'}</span>}
            {row.collection && (
              <span className="ml-1 inline-block text-[9px] uppercase tracking-wider text-emerald-300/80 bg-emerald-500/10 border border-emerald-500/30 rounded px-1">
                {row.collection}
              </span>
            )}
          </span>
          <span>{row.moveCount} ply · {fmtAgo(row.updatedAt)}</span>
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 mt-1">
          <button onClick={() => startRename(row)}
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-gray-200">
            ✎ Rename
          </button>
          <button onClick={() => remove(row)}
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded border border-rose-500/40 hover:border-rose-400 text-rose-300 hover:text-rose-200">
            ✕ Delete
          </button>
        </div>
      </li>
    )
  }

  return (
    <div className="luxe-card p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500">Saved games</p>
        <span className="text-[10px] text-gray-600">{items.length}</span>
      </div>
      {loading ? (
        <p className="text-[11px] text-gray-600 text-center py-3">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[11px] text-gray-600 text-center py-3">
          No saved games yet. Click <span className="text-amber-300">Save game</span> after a few moves.
        </p>
      ) : (
        <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
          {grouped.unfiled.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">
                Unfiled · {grouped.unfiled.length}
              </p>
              <ul className="space-y-1.5">
                {grouped.unfiled.map(renderRow)}
              </ul>
            </div>
          )}
          {[...grouped.byCollection.entries()].map(([name, rows]) => {
            const isCollapsed = collapsed.get(name) ?? false
            return (
              <div key={name}>
                <button
                  onClick={() => toggle(name)}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-200 transition-colors"
                >
                  <span className="text-[11px] font-semibold line-clamp-2 leading-tight text-left">
                    <span className="mr-1">{isCollapsed ? '▶' : '▼'}</span>
                    📁 {name}
                  </span>
                  <span className="text-[10px] text-emerald-300/70 font-mono">
                    {rows.length} {rows.length === 1 ? 'game' : 'games'}
                  </span>
                </button>
                {!isCollapsed && (
                  <ul className="space-y-1.5 mt-1.5 pl-2 border-l border-emerald-500/20">
                    {rows.map(renderRow)}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
