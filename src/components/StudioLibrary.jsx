import { useState, useEffect } from 'react'
import { Modal, message as antMessage } from 'antd'
import { DeleteOutlined, CheckOutlined, AppstoreOutlined, ReloadOutlined } from '@ant-design/icons'

// Reusable library + bulk-delete component for Lip Sync / Audio / Cinema.
// Same UX as the image-enhance library but lane-agnostic.
//
// Props:
//   refreshKey      — bump from parent to force a reload after a new submit
//   title           — section heading
//   listFn          — async ({ status, page, limit }) => { data: { items, total, pages, counts } }
//   bulkFn          — async (action, ids) => { data, error }
//   getId           — (item) => string  (jobId / projectId)
//   renderCard      — (item, { selectMode, checked, onToggleSelect, onDelete }) => JSX
//   statuses        — list of status filter chips: [{ v, label, count }]; pass [] to skip
//   bulkAccent      — Tailwind hue for the sticky bulk toolbar ('emerald'/'fuchsia'/'amber')
export default function StudioLibrary({
  refreshKey, title, listFn, bulkFn, getId, renderCard,
  statuses = ['completed', 'processing', 'queued', 'failed', 'all'],
  bulkAccent = 'cyan',
}) {
  const [filter, setFilter] = useState('completed')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [internalReload, setInternalReload] = useState(0)

  useEffect(() => { setPage(1); setSelected(new Set()) }, [filter, refreshKey])
  useEffect(() => { if (!selectMode) setSelected(new Set()) }, [selectMode])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listFn({ status: filter, page, limit: 24 }).then(({ data: result }) => {
      if (cancelled) return
      if (result) setData(result)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [filter, page, refreshKey, internalReload, listFn])

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const selectAllOnPage = () => setSelected(new Set(data.items.map(getId)))
  const clearSelection = () => setSelected(new Set())

  const askDelete = (item) => {
    Modal.confirm({
      title: 'Delete this item?',
      content: <p className="text-sm text-gray-300">Removes the row + Cloudinary asset. Can't be undone.</p>,
      okText: 'Delete', okButtonProps: { danger: true }, cancelText: 'Keep', centered: true,
      onOk: async () => {
        const { error: err } = await bulkFn('delete', [getId(item)])
        if (err) { antMessage.error(`Delete failed: ${err}`); return }
        antMessage.success('Deleted')
        setInternalReload(n => n + 1)
      },
    })
  }

  const doBulkDelete = () => {
    const ids = Array.from(selected)
    if (!ids.length) { antMessage.warning('Select at least one item'); return }
    Modal.confirm({
      title: `Delete ${ids.length} item${ids.length === 1 ? '' : 's'}?`,
      content: <p className="text-sm text-gray-300">Removes rows + Cloudinary assets. Can't be undone.</p>,
      okText: 'Delete', okButtonProps: { danger: true }, cancelText: 'Cancel', centered: true,
      onOk: async () => {
        setBulkBusy(true)
        const { data: result, error: err } = await bulkFn('delete', ids)
        setBulkBusy(false)
        if (err) { antMessage.error(`Failed: ${err}`); return }
        antMessage.success(`Deleted ${result?.affected ?? ids.length}`)
        setSelected(new Set())
        setSelectMode(false)
        setInternalReload(n => n + 1)
      },
    })
  }

  const selCount = selected.size
  const accentClasses = {
    emerald: 'border-emerald-500/40 shadow-emerald-500/10',
    fuchsia: 'border-fuchsia-500/40 shadow-fuchsia-500/10',
    amber:   'border-amber-500/40 shadow-amber-500/10',
    cyan:    'border-cyan-500/40 shadow-cyan-500/10',
  }[bulkAccent] || 'border-cyan-500/40'

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h2 className="text-xs uppercase tracking-wider text-gray-500 flex items-center gap-2">
          <AppstoreOutlined /> {title || 'Library'}
          <span className="text-[10px] font-mono text-gray-600">({data.total})</span>
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setInternalReload(n => n + 1)}
            className="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-1 rounded border border-gray-800 hover:border-gray-700 flex items-center gap-1">
            <ReloadOutlined /> Refresh
          </button>
          <button onClick={() => setSelectMode(s => !s)}
            className={`px-3 py-1 text-[10px] rounded-full border transition-all ${
              selectMode
                ? 'bg-amber-500/20 text-amber-200 border-amber-400/50'
                : 'bg-gray-900/60 text-gray-400 border-gray-800 hover:border-gray-700 hover:text-gray-200'
            }`}>
            {selectMode ? `Selecting (${selCount})` : '☑ Select'}
          </button>
          {selectMode && (
            <>
              <button onClick={selectAllOnPage}
                className="px-2 py-1 text-[10px] rounded-full bg-gray-900/60 text-gray-400 border border-gray-800 hover:text-gray-200">
                All
              </button>
              <button onClick={clearSelection}
                className="px-2 py-1 text-[10px] rounded-full bg-gray-900/60 text-gray-400 border border-gray-800 hover:text-gray-200">
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {statuses.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {statuses.map(v => {
            const active = filter === v
            return (
              <button key={v} onClick={() => setFilter(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg border transition-colors ${
                  active
                    ? 'bg-cyan-600/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-gray-800/60 hover:bg-gray-800 text-gray-400 border-transparent hover:border-gray-700'
                }`}>
                <span className="capitalize">{v}</span>
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1,2,3,4,5,6,7,8].map(i => (
            <div key={i} className="aspect-video rounded-xl bg-gray-900/40 animate-pulse" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="py-16 text-center text-gray-500 text-sm">
          No {filter === 'all' ? '' : filter} items yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.items.map(it => {
            const id = getId(it)
            return renderCard(it, {
              selectMode,
              checked: selected.has(id),
              onToggleSelect: () => toggleSelect(id),
              onDelete: () => askDelete(it),
            })
          })}
        </div>
      )}

      {selectMode && selCount > 0 && (
        <div className="sticky bottom-3 z-30 mx-auto max-w-xl mt-4">
          <div className={`rounded-2xl border bg-gradient-to-r from-gray-900/95 via-gray-950/95 to-gray-900/95 backdrop-blur p-3 shadow-2xl ${accentClasses} flex items-center justify-between gap-3 flex-wrap`}>
            <span className="text-xs text-gray-300">
              <span className="font-mono text-cyan-300">{selCount}</span> selected
            </span>
            <button onClick={doBulkDelete} disabled={bulkBusy}
              className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 font-semibold disabled:opacity-50">
              <DeleteOutlined /> Delete {selCount}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// Tiny shared select-mode checkbox overlay — drop on top of any media card
export function SelectCheckbox({ checked, onToggle }) {
  return (
    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle?.() }}
      className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold transition-all z-20 ${
        checked
          ? 'bg-cyan-400 text-black shadow-md'
          : 'bg-black/70 text-gray-400 border border-white/20 hover:bg-black/90 hover:text-white'
      }`}>
      {checked ? <CheckOutlined className="text-[11px]" /> : ''}
    </button>
  )
}
