// MeshLibrary — paginated grid of every mesh-generation job on the
// account. Mirrors VideoCombiner's Library tab: antd Pagination with
// pageSizeOptions + custom-up-to-1000 InputNumber, status filter chips,
// per-row card with thumbnail (reference image if present), prompt,
// engine + params, download button for the generated GLB, and a click
// to expand the full param set.
//
// Live jobs (queued + processing) show inline alongside completed
// rows — clicking a processing card opens the inputs panel inline so
// the user can see exactly what's being generated. Refresh ticks every
// 2s when any job is in flight, slows to 15s otherwise.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, Pagination, InputNumber, Progress, Tag, message as antMessage } from 'antd'
import {
  DownloadOutlined, DeleteOutlined, ReloadOutlined,
  CheckOutlined, EyeOutlined,
} from '@ant-design/icons'
import { listMeshJobs, deleteMeshJob } from '../../api/ai'
import notify from '../../utils/notify'

const PAGE_SIZE_OPTIONS = ['10', '20', '30', '50', '100']
const DEFAULT_PAGE_SIZE = 20
const STATUSES = ['all', 'queued', 'processing', 'completed', 'failed']

function fmtBytes(n) {
  if (!n) return '—'
  const mb = n / (1024 * 1024)
  return mb < 1 ? `${(n / 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`
}

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

function StatusTag({ status }) {
  const map = {
    queued:     { color: 'default',    label: 'Queued' },
    processing: { color: 'processing', label: 'Working' },
    completed:  { color: 'success',    label: 'Ready' },
    failed:     { color: 'error',      label: 'Failed' },
  }
  const meta = map[status] || { color: 'default', label: status || '—' }
  return <Tag color={meta.color} className="!text-[10px] !uppercase !tracking-wider !m-0">{meta.label}</Tag>
}

// Single library card. Click toggles the inputs panel so the user can
// see every param + the reference image that drove this generation.
function MeshCard({ row, onView, onDelete }) {
  const [open, setOpen] = useState(false)
  const isLive = row.status === 'queued' || row.status === 'processing'
  return (
    <li className="rounded-lg border border-gray-800 bg-gray-900/40 overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-3 p-3">
        {/* Thumbnail — reference image if provided, otherwise a neutral
            placeholder so the row height stays consistent. */}
        <div className="shrink-0 w-full sm:w-32 aspect-square rounded-md overflow-hidden border border-gray-800 bg-gray-950/80 grid place-items-center">
          {row.imageUrl ? (
            <img src={row.imageUrl} alt="Reference"
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = 'none' }} />
          ) : (
            <span className="text-[10px] font-mono text-gray-600">no ref image</span>
          )}
        </div>
        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300">
              {row.model}
            </span>
            <StatusTag status={row.status} />
          </div>
          <p className="text-xs text-gray-200 leading-snug break-words line-clamp-2">
            {row.prompt}
          </p>
          {isLive && (
            <Progress percent={row.progress || 0} size="small" showInfo={false}
              strokeColor="#fbbf24" trailColor="#1f2937"
              className="!mt-2 !mb-0" />
          )}
          {row.error && (
            <p className="mt-1.5 text-[10px] font-mono text-rose-400 break-words">{row.error}</p>
          )}
          {/* Param chip row — only render the params that exist on the row */}
          <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] font-mono">
            {row.steps != null && (
              <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">steps {row.steps}</span>
            )}
            {row.meshQuality != null && (
              <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">mesh {row.meshQuality}</span>
            )}
            {row.textureQuality != null && (
              <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">tex {row.textureQuality}</span>
            )}
            {row.textureResolution && (
              <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">{row.textureResolution}px</span>
            )}
            {row.polygonTarget && (
              <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">{(row.polygonTarget / 1000).toFixed(0)}k tris</span>
            )}
            {row.seed != null && (
              <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">seed {row.seed}</span>
            )}
            {row.bytes != null && (
              <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">{fmtBytes(row.bytes)}</span>
            )}
          </div>
          {/* Actions */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {row.glbUrl && (
              <>
                <button onClick={() => onView?.(row)}
                  className="text-[10px] font-semibold px-2 py-1 rounded border border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 inline-flex items-center gap-1">
                  <EyeOutlined /> Open in viewer
                </button>
                <a href={row.glbUrl} download
                  className="text-[10px] font-semibold px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 inline-flex items-center gap-1">
                  <DownloadOutlined /> GLB
                </a>
              </>
            )}
            <button onClick={() => setOpen(o => !o)}
              className="text-[10px] font-semibold px-2 py-1 rounded border border-gray-700 hover:border-gray-500 text-gray-300">
              {open ? 'Hide inputs' : 'Inputs'}
            </button>
            <button onClick={() => onDelete?.(row)}
              className="text-[10px] font-semibold px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 inline-flex items-center gap-1">
              <DeleteOutlined />
            </button>
          </div>
        </div>
      </div>
      {/* Full inputs panel — appears below when the row is expanded.
          Live progress message included so a processing card answers
          "what's happening right now" without an extra modal hop. */}
      {open && (
        <div className="border-t border-gray-800 bg-gray-950/40 px-3 py-2 text-[11px] font-mono space-y-1">
          <div><span className="text-gray-500">jobId · </span>{row.jobId}</div>
          <div><span className="text-gray-500">created · </span>{row.createdAt}</div>
          {row.completedAt && (
            <div><span className="text-gray-500">completed · </span>{row.completedAt}</div>
          )}
          {row.guidance != null && (
            <div><span className="text-gray-500">guidance · </span>{row.guidance}</div>
          )}
          {row.negativePrompt && (
            <div><span className="text-gray-500">negative · </span>{row.negativePrompt}</div>
          )}
          {isLive && row.progressMessage && (
            <div><span className="text-gray-500">step · </span>{row.progressMessage}</div>
          )}
          {row.imageUrl && (
            <div className="break-all"><span className="text-gray-500">imageUrl · </span>{row.imageUrl}</div>
          )}
          {row.glbUrl && (
            <div className="break-all"><span className="text-gray-500">glbUrl · </span>{row.glbUrl}</div>
          )}
        </div>
      )}
    </li>
  )
}

export default function MeshLibrary({ onPickRow, refreshKey = 0 }) {
  const [items, setItems]       = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading]   = useState(false)
  const pollTimerRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await listMeshJobs({ status: statusFilter, page, pageSize })
    setLoading(false)
    setItems(Array.isArray(data?.items) ? data.items : [])
    setTotal(Number(data?.total || 0))
  }, [statusFilter, page, pageSize])

  useEffect(() => { load() }, [load, refreshKey])

  // Auto-poll: fast when anything's in flight, slower otherwise. This
  // way the library acts as the live-jobs feed too — no separate panel.
  useEffect(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    const anyLive = items.some(r => r.status === 'queued' || r.status === 'processing')
    pollTimerRef.current = setInterval(load, anyLive ? 2000 : 15000)
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current) }
  }, [items, load])

  const requestDelete = (row) => {
    Modal.confirm({
      title: `Delete this mesh job?`,
      content: row.prompt,
      okText: 'Delete', okType: 'danger', okButtonProps: { danger: true },
      cancelText: 'Keep', autoFocusButton: 'cancel', centered: true,
      onOk: async () => {
        const { error } = await deleteMeshJob(row.jobId)
        if (error) { antMessage.error(error); return }
        notify.success('Deleted')
        load()
      },
    })
  }

  return (
    <div className="luxe-card p-4 sm:p-5">
      {/* Header — title + status filter chips + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
            Mesh library
          </h3>
          <span className="text-[10px] text-gray-500 font-mono">
            {total.toLocaleString()} job{total === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {STATUSES.map(s => (
            <button key={s}
              onClick={() => { setStatusFilter(s); setPage(1) }}
              className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                statusFilter === s
                  ? 'border-amber-400/60 bg-amber-500/12 text-amber-200'
                  : 'border-gray-800 text-gray-400 hover:border-gray-700'
              }`}>
              {s}
            </button>
          ))}
          <button onClick={load}
            className="text-[10px] font-semibold px-2 py-1 rounded-md border border-gray-800 hover:border-gray-700 text-gray-400 inline-flex items-center gap-1">
            <ReloadOutlined /> Refresh
          </button>
        </div>
      </div>

      {loading && !items.length && <p className="text-xs text-gray-500">Loading…</p>}
      {!loading && !items.length && (
        <p className="text-xs text-gray-500 py-10 text-center">
          No mesh jobs{statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''} yet.
        </p>
      )}

      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {items.map(row => (
          <MeshCard key={row.jobId}
            row={row}
            onView={onPickRow}
            onDelete={requestDelete} />
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-800">
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
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
    </div>
  )
}
