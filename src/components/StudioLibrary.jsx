import { useState, useEffect, useRef } from 'react'
import { Modal, Pagination, InputNumber } from 'antd'
import { notice } from '../lib/notice'
import { DeleteOutlined, CheckOutlined, AppstoreOutlined, ReloadOutlined, CheckSquareOutlined } from '@ant-design/icons'
import useQueryState from '../hooks/useQueryState'

const PAGE_SIZE_OPTIONS = ['10', '20', '30', '50', '100']
const DEFAULT_PAGE_SIZE = 24

// Reusable page-size picker — antd's Pagination dropdown plus a Custom
// InputNumber (1..1000) for the times when the user wants to see all
// 243 items at once. Same component the Combine + Mesh libraries use,
// extracted here so the pattern stays consistent across every library.
function PageSizeStrip({ pageSize, setPageSize }) {
  const [draft, setDraft] = useState(pageSize)
  useEffect(() => { setDraft(pageSize) }, [pageSize])
  const apply = () => {
    const n = Math.max(1, Math.min(1000, parseInt(draft, 10) || pageSize))
    setPageSize(n)
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-gray-500">Custom</span>
      <InputNumber size="small" min={1} max={1000} value={draft}
        onChange={setDraft} onPressEnter={apply}
        style={{ width: 80 }} />
      <button onClick={apply}
        className="text-[10px] px-2 py-1 rounded border border-gray-700 hover:border-gray-500 text-gray-300 inline-flex items-center">
        <CheckOutlined />
      </button>
    </span>
  )
}

// Cheap structural compare: same length, same id order, same status per item.
// Used so the library doesn't repaint card by card when polling returns the
// exact same data. Caller's `getId` would be ideal but happens BEFORE that
// runs, so we sniff common id fields (jobId / projectId / videoId / id).
function _itemKey(it) { return it?.jobId || it?.projectId || it?.videoId || it?.id || '' }
function sameList(a, b) {
  if (!a || !b) return false
  if (a.total !== b.total || a.page !== b.page) return false
  const ai = a.items || [], bi = b.items || []
  if (ai.length !== bi.length) return false
  for (let i = 0; i < ai.length; i++) {
    if (_itemKey(ai[i]) !== _itemKey(bi[i])) return false
    if ((ai[i]?.status || '') !== (bi[i]?.status || '')) return false
    if ((ai[i]?.outputUrl || '') !== (bi[i]?.outputUrl || '')) return false
  }
  return true
}

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
  // Filter + page + size mirrored to URL so refresh keeps the user on
  // page 3 of failed lipsync jobs (or whatever they were looking at).
  // `sl` (studio library) prefix avoids collisions with parent state.
  const [filter, setFilter]     = useQueryState('slFilter', 'completed')
  const [page, setPage]         = useQueryState('slPage',   1, { parse: Number })
  const [pageSize, setPageSize] = useQueryState('slSize',   DEFAULT_PAGE_SIZE, { parse: Number })
  const [data, setData] = useState({ items: [], total: 0, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [internalReload, setInternalReload] = useState(0)

  // Keep listFn out of the effect's dep array — parents (LipSync, Audio, Cinema)
  // pass an inline arrow fn, so its reference flips every render. While a job
  // polls every 2s, the parent re-renders → new listFn ref → refetch → skeleton
  // → cards flicker even though nothing changed. Mirror listFn in a ref so the
  // effect always calls the latest fn but the effect itself only re-runs on
  // intentional triggers (filter, page, refreshKey, internalReload).
  const listFnRef = useRef(listFn)
  useEffect(() => { listFnRef.current = listFn }, [listFn])

  useEffect(() => { setPage(1); setSelected(new Set()) }, [filter, refreshKey])
  useEffect(() => { if (!selectMode) setSelected(new Set()) }, [selectMode])

  useEffect(() => {
    let cancelled = false
    // Only show the skeleton on the very first fetch (when no items yet).
    // Subsequent silent refetches keep existing cards on screen and just swap
    // them when the data actually differs — no flash, no flicker.
    setLoading(prev => (data.items.length === 0 ? true : prev))
    listFnRef.current({ status: filter, page, limit: pageSize }).then(({ data: result }) => {
      if (cancelled) return
      if (result) {
        // Shallow-diff: if the items array is logically identical (same ids in
        // same order with same status), keep the existing reference so React
        // skips re-rendering child cards. Cuts unnecessary repaints on every
        // 2-second poll tick.
        setData(prev => sameList(prev, result) ? prev : result)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [filter, page, pageSize, refreshKey, internalReload])

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
      content: <p className="text-sm text-rose-300 font-medium">⚠ Removes the row + Cloudinary asset. Can't be undone.</p>,
      okText: 'Delete', okButtonProps: { danger: true }, cancelText: 'Keep', centered: true,
      onOk: async () => {
        const { error: err } = await bulkFn('delete', [getId(item)])
        if (err) { notice.error(`Delete failed: ${err}`); return }
        notice.success('Deleted')
        setInternalReload(n => n + 1)
      },
    })
  }

  const doBulkDelete = () => {
    const ids = Array.from(selected)
    if (!ids.length) { notice.warning('Select at least one item'); return }
    Modal.confirm({
      title: `Delete ${ids.length} item${ids.length === 1 ? '' : 's'}?`,
      content: <p className="text-sm text-rose-300 font-medium">⚠ Removes rows + Cloudinary assets. Can't be undone.</p>,
      okText: 'Delete', okButtonProps: { danger: true }, cancelText: 'Cancel', centered: true,
      onOk: async () => {
        setBulkBusy(true)
        const { data: result, error: err } = await bulkFn('delete', ids)
        setBulkBusy(false)
        if (err) { notice.error(`Failed: ${err}`); return }
        notice.success(`Deleted ${result?.affected ?? ids.length}`)
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
            className={`flex items-center gap-1 px-3 py-1 text-[10px] rounded-full border transition-all ${
              selectMode
                ? 'bg-amber-500/15 text-amber-200 border-amber-400/50'
                : 'bg-gray-900/60 text-gray-400 border-gray-800 hover:border-gray-700 hover:text-gray-200'
            }`}>
            <CheckSquareOutlined /> {selectMode ? `Selecting (${selCount})` : 'Select'}
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
              {/* Inline Delete — same row as Select. The sticky-bottom version
                  forced the user to scroll past every card to reach it; this
                  one is always visible right where they clicked Select. */}
              {selCount > 0 && (
                <button onClick={doBulkDelete} disabled={bulkBusy}
                  title={`Delete ${selCount} selected`}
                  className="flex items-center gap-1 text-[10px] px-3 py-1 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-200 border border-rose-500/40 font-semibold disabled:opacity-50 transition-colors">
                  <DeleteOutlined /> Delete {selCount}
                </button>
              )}
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
                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/40'
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

      {/* Sticky-bottom delete bar removed — the inline "Delete N" button
          on the header row (right next to Select) is the only delete
          control now. The floating bar was duplicating it AND making the
          user scroll past every card to reach it. */}

      {/* Pagination + custom page-size strip — same pattern Combine and
          Mesh libraries use. Lets the user blow through hundreds of past
          items without overloading the BE per request. */}
      {data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-800">
          <Pagination
            current={page}
            pageSize={pageSize}
            total={data.total}
            showSizeChanger
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            size="small"
            showQuickJumper
            showTotal={(t, [a, b]) => `${a}-${b} of ${t.toLocaleString()}`}
            onChange={(p, s) => { setPage(p); if (s !== pageSize) setPageSize(s) }}
            onShowSizeChange={(_p, s) => { setPageSize(s); setPage(1) }}
          />
          <PageSizeStrip pageSize={pageSize} setPageSize={(n) => { setPageSize(n); setPage(1) }} />
        </div>
      )}
    </section>
  )
}

// Tiny shared select-mode checkbox overlay — drop on top of any media card
export function SelectCheckbox({ checked, onToggle }) {
  return (
    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle?.() }}
      className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold transition-colors z-20 ${
        checked
          ? 'bg-cyan-400 text-black'
          : 'bg-black/70 text-gray-400 border border-white/20 hover:bg-black/90 hover:text-white'
      }`}>
      {checked ? <CheckOutlined className="text-[11px]" /> : ''}
    </button>
  )
}
