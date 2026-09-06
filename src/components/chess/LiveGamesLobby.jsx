// Live lobby — lists matches that are waiting for an opponent. Fired ONCE
// on mount + on manual refresh (no polling). Click "Join" to navigate to
// the live match page where the friend-of-creator path will run.
//
// Tucked behind a collapse arrow on /chess so it doesn't push the
// analysis board down on first load.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chessListLiveMatches } from '../../api/ai'
import { TIME_CONTROLS } from './TimeControl'

const tcLabel = (id) => {
  if (!id || id === 'none') return '∞'
  const t = TIME_CONTROLS.find(t => t.id === id)
  return t ? t.short : id
}

const ageStr = (iso) => {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function LiveGamesLobby({ defaultOpen = true }) {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [open, setOpen] = useState(defaultOpen)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    const { data, error } = await chessListLiveMatches()
    setLoading(false)
    if (error) { setErr(error); return }
    setItems(Array.isArray(data?.items) ? data.items : [])
  }, [])

  // Fire once on mount.
  useEffect(() => { load() }, [load])

  return (
    <div className="luxe-card p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 text-left flex-1 min-w-0"
        >
          <span className="text-base">{open ? '▾' : '▸'}</span>
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Live lobby</span>
          <span className="text-xs text-gray-200 truncate">
            {loading ? 'Loading…'
              : items.length === 0 ? 'No live games right now'
              : `${items.length} waiting`}
          </span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); load() }}
          disabled={loading}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 shrink-0">
          🔄 Refresh
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          {err && (
            <div className="text-[11px] text-rose-300 font-mono px-2 py-1.5 rounded border border-rose-500/30 bg-rose-500/10">
              {err}
            </div>
          )}
          {!loading && !err && items.length === 0 && (
            <p className="text-xs text-gray-500 italic">No live games right now. Click "🎯 Challenge" below to start one.</p>
          )}
          {items.map(m => (
            <div key={m.id}
              className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border border-gray-800 bg-gray-900/40 hover:border-amber-500/30 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-block w-2 h-2 rounded-full bg-gray-200" />
                  <span className="text-xs font-semibold text-gray-200 truncate">
                    {m.whiteName || 'Anonymous'}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-line bg-surface-elevated text-gray-400">
                    {tcLabel(m.timeControlId)}
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">#{m.id}</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">{ageStr(m.createdAt)}</p>
              </div>
              <button
                onClick={() => navigate(`/chess/m/${m.id}`)}
                className="text-[11px] font-semibold px-3 py-2 rounded-full border border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-200 hover:bg-fuchsia-500/25 shrink-0">
                ⚔️ Join
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
