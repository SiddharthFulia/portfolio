import { useMemo, useState } from 'react'
import { Dropdown, Button, message as antMessage, Tooltip } from 'antd'
import {
  DownloadOutlined, FileTextOutlined, FileExcelOutlined,
  FilePdfOutlined, FileMarkdownOutlined, FileZipOutlined,
} from '@ant-design/icons'
import { ENDPOINTS } from '../api/endpoints'

// DownloadMenu — only appears on assistant messages that contain
// downloadable structured content (a table, a JSON row-array, CSV).
// Plain prose replies get a Copy button only (rendered by the parent).
//
// Detection:
//   ```json …```  → row-array → Excel/CSV/JSON; otherwise nothing
//   ```csv …```   → CSV/Excel/JSON
//   markdown |  | table → parse to rows → CSV/Excel/JSON
//   no structure → null (component renders nothing)
//
// JSON / CSV are blob-downloaded client-side (zero BE hop).
// Excel calls /api/export which generates the file server-side via SheetJS.

const BE_URL = (import.meta.env.VITE_BE_URL || 'http://localhost:4001').replace(/\/$/, '')

// ── Detection helpers ──────────────────────────────────────────
const stripCodeFence = (src, lang) => {
  const re = new RegExp(`\\\`\\\`\\\`\\s*${lang}\\s*\\n([\\s\\S]*?)\\n\\\`\\\`\\\``, 'i')
  const m = src.match(re)
  return m ? m[1].trim() : null
}

// Pull any code fence body — language tag optional. Used to detect
// TSV / pipe / whitespace-aligned tables when the model wraps the data
// in a plain ``` block without a `csv` or `json` tag (which is what
// most models do when they say "here's the data you can paste into
// Excel"). Returns an array of fence bodies, in order.
const extractAllCodeFences = (src) => {
  const re = /```[^\n]*\n([\s\S]*?)```/g
  const out = []
  let m
  while ((m = re.exec(src)) !== null) out.push(m[1])
  return out
}

// Sniff a tab-separated or whitespace-aligned table inside a plain
// code fence. Two heuristics, in order:
//   1) every non-blank row has the same number of TABs (≥1) — TSV
//   2) every non-blank row has ≥1 "2+ spaces" gap and the same gap
//      count — whitespace-aligned table (what the Groq sample used)
// Returns an array of objects keyed by the header row, or null.
const parseLooseTable = (text) => {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.length > 0)
  if (lines.length < 2) return null

  // (1) TSV — tabs as separators
  const tabCounts = lines.map(l => (l.match(/\t/g) || []).length)
  if (tabCounts[0] >= 1 && tabCounts.every(c => c === tabCounts[0])) {
    const header = lines[0].split('\t').map(s => s.trim())
    return lines.slice(1).map(l => {
      const cells = l.split('\t')
      const obj = {}
      header.forEach((h, i) => { obj[h || `col${i + 1}`] = (cells[i] ?? '').trim() })
      return obj
    })
  }

  // (2) Whitespace-aligned — split on runs of 2+ spaces. Needs every
  //     row to land on the same column count; otherwise we'd be
  //     guessing at human prose.
  const wsSplit = (l) => l.split(/ {2,}|\t+/).map(s => s.trim()).filter(s => s.length > 0)
  const wsRows = lines.map(wsSplit)
  const cols = wsRows[0].length
  if (cols >= 2 && wsRows.every(r => r.length === cols)) {
    const header = wsRows[0]
    return wsRows.slice(1).map(cells => {
      const obj = {}
      header.forEach((h, i) => { obj[h || `col${i + 1}`] = cells[i] ?? '' })
      return obj
    })
  }
  return null
}

// Parse a markdown table → array of objects. Returns null if no table.
const parseMarkdownTable = (src) => {
  const lines = src.split(/\r?\n/)
  // Find a header row immediately followed by a |---|---| separator
  for (let i = 0; i < lines.length - 1; i++) {
    const head = lines[i].trim()
    const sep  = (lines[i + 1] || '').trim()
    if (!head.includes('|') || !/^\|?[\s:|-]+\|?$/.test(sep)) continue
    const cols = head.replace(/^\||\|$/g, '').split('|').map(s => s.trim()).filter(Boolean)
    if (!cols.length) continue
    const rows = []
    for (let j = i + 2; j < lines.length; j++) {
      const r = lines[j].trim()
      if (!r.includes('|')) break
      const cells = r.replace(/^\||\|$/g, '').split('|').map(s => s.trim())
      const obj = {}
      cols.forEach((c, idx) => { obj[c] = cells[idx] ?? '' })
      rows.push(obj)
    }
    if (rows.length) return rows
  }
  return null
}

// Loose CSV parser — handles quoted cells. Header is the first non-blank row.
const parseCsvText = (src) => {
  const trimmed = src.trim()
  if (!trimmed) return null
  const records = []
  let i = 0, cur = '', row = [], inQ = false
  while (i < trimmed.length) {
    const c = trimmed[i]
    if (inQ) {
      if (c === '"' && trimmed[i + 1] === '"') { cur += '"'; i += 2; continue }
      if (c === '"') { inQ = false; i += 1; continue }
      cur += c; i += 1; continue
    }
    if (c === '"') { inQ = true; i += 1; continue }
    if (c === ',') { row.push(cur); cur = ''; i += 1; continue }
    if (c === '\r') { i += 1; continue }
    if (c === '\n') { row.push(cur); records.push(row); row = []; cur = ''; i += 1; continue }
    cur += c; i += 1
  }
  if (cur.length || row.length) { row.push(cur); records.push(row) }
  if (records.length < 2) return null
  const header = records[0].map(s => s.trim())
  return records.slice(1).filter(r => r.some(c => c !== '')).map(r => {
    const obj = {}
    header.forEach((h, idx) => { obj[h] = r[idx] ?? '' })
    return obj
  })
}

// Walks a JSON value and decides whether it's a "row array" (array of
// flat-ish objects) → suitable for tabular formats.
const isRowArray = (val) => {
  if (!Array.isArray(val) || !val.length) return false
  const first = val[0]
  if (!first || typeof first !== 'object' || Array.isArray(first)) return false
  return val.every(r => r && typeof r === 'object' && !Array.isArray(r))
}

// Pick the most informative structured shape we can extract from the
// assistant's reply. Order matters — JSON code block wins over markdown
// table because it's more explicit.
const detectStructured = (content) => {
  if (!content) return { kind: 'text' }
  // JSON fence
  const jsonRaw = stripCodeFence(content, 'json') || stripCodeFence(content, 'JSON')
  if (jsonRaw) {
    try {
      const val = JSON.parse(jsonRaw)
      if (isRowArray(val)) return { kind: 'rows', rows: val, source: 'json' }
      return { kind: 'json', value: val }
    } catch {}
  }
  // CSV fence
  const csvRaw = stripCodeFence(content, 'csv') || stripCodeFence(content, 'CSV')
  if (csvRaw) {
    const rows = parseCsvText(csvRaw)
    if (rows && rows.length) return { kind: 'rows', rows, source: 'csv' }
  }
  // Bare markdown table anywhere in the content
  const tableRows = parseMarkdownTable(content)
  if (tableRows && tableRows.length) return { kind: 'rows', rows: tableRows, source: 'markdown-table' }
  // Loose code-fence tables — model dumped TSV / whitespace-aligned data
  // inside a plain ``` block (the "paste into Excel" pattern). Walk all
  // fences in the reply and pick the first one that parses cleanly.
  for (const body of extractAllCodeFences(content)) {
    const looseRows = parseLooseTable(body)
    if (looseRows && looseRows.length) {
      return { kind: 'rows', rows: looseRows, source: 'code-fence-tsv' }
    }
    // Sometimes the body is bare CSV without the `csv` tag
    if (body.includes(',') && body.split(/\r?\n/).filter(Boolean).length >= 2) {
      const csvRows = parseCsvText(body)
      if (csvRows && csvRows.length && Object.keys(csvRows[0]).length >= 2) {
        return { kind: 'rows', rows: csvRows, source: 'code-fence-csv' }
      }
    }
  }
  // Fallback — just text
  return { kind: 'text' }
}

// ── Browser blob download ───────────────────────────────────────
const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click()
  setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 200)
}

const csvBlob = (rows) => {
  const cell = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const cols = Array.from(rows.reduce((set, r) => {
    Object.keys(r || {}).forEach(k => set.add(k)); return set
  }, new Set()))
  const lines = [cols.map(cell).join(',')]
  rows.forEach(r => lines.push(cols.map(c => cell(r?.[c])).join(',')))
  return new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
}

// Server-rendered formats (Excel / PDF) — POST + fetch the blob.
async function serverExport({ format, rows, content, title, filename }) {
  const res = await fetch(`${BE_URL}${ENDPOINTS.EXPORT}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, rows, content, title, filename }),
  })
  if (!res.ok) {
    let msg = `Export failed (${res.status})`
    try { const j = await res.json(); if (j?.message) msg = j.message } catch {}
    throw new Error(msg)
  }
  return res.blob()
}

// ── Component ─────────────────────────────────────────────────
export default function DownloadMenu({ content, messageId, model }) {
  const [busy, setBusy] = useState(false)

  const detected = useMemo(() => detectStructured(content), [content])
  const baseName = `chat-${(messageId || Date.now()).toString().slice(-8)}`

  // Skip the button entirely on plain-text replies — those just need a
  // Copy action, which the parent renders separately. Keeps the reply
  // box clean and avoids surfacing "Save this reply" on every message.
  if (detected.kind === 'text') return null

  // Build the list of formats based on what we detected — only the ones
  // that actually make sense as file downloads.
  const items = useMemo(() => {
    const list = []
    if (detected.kind === 'rows') {
      list.push({ key: 'xlsx', icon: <FileExcelOutlined style={{ color: '#16a34a' }} />, label: `Excel (.xlsx) · ${detected.rows.length} rows` })
      list.push({ key: 'csv',  icon: <FileZipOutlined  style={{ color: '#60a5fa' }} />, label: 'CSV (.csv)' })
      list.push({ key: 'json', icon: <FileTextOutlined style={{ color: '#f59e0b' }} />, label: 'JSON (.json)' })
    } else if (detected.kind === 'json') {
      list.push({ key: 'json', icon: <FileTextOutlined style={{ color: '#f59e0b' }} />, label: 'JSON (.json)' })
    }
    return list
  }, [detected])

  const handlePick = async (key) => {
    if (busy) return
    setBusy(true)
    try {
      if (key === 'json') {
        const payload = detected.kind === 'rows' ? detected.rows
                       : detected.kind === 'json' ? detected.value
                       : { content }
        triggerDownload(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${baseName}.json`)
      } else if (key === 'md') {
        triggerDownload(new Blob([String(content || '')], { type: 'text/markdown;charset=utf-8' }), `${baseName}.md`)
      } else if (key === 'csv') {
        if (detected.kind !== 'rows') throw new Error('No rows detected to export as CSV')
        triggerDownload(csvBlob(detected.rows), `${baseName}.csv`)
      } else if (key === 'xlsx') {
        if (detected.kind !== 'rows') throw new Error('No rows detected to export as Excel')
        const blob = await serverExport({
          format: 'xlsx',
          rows: detected.rows,
          title: model || 'Sheet1',
          filename: `${baseName}.xlsx`,
        })
        triggerDownload(blob, `${baseName}.xlsx`)
      } else if (key === 'pdf') {
        const blob = await serverExport({
          format: 'pdf',
          content: String(content || ''),
          title: model ? `Chat reply · ${model}` : 'Chat reply',
          filename: `${baseName}.pdf`,
        })
        triggerDownload(blob, `${baseName}.pdf`)
      }
      antMessage.success(`Downloaded ${key.toUpperCase()}`)
    } catch (e) {
      antMessage.error(e.message || 'Download failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dropdown
      menu={{ items, onClick: ({ key }) => handlePick(key) }}
      trigger={['click']}
      placement="bottomRight">
      <Tooltip title={
        detected.kind === 'rows'
          ? `Table detected · ${detected.rows.length} rows — download in any format`
          : 'Save this reply'
      }>
        <Button size="small" icon={<DownloadOutlined />} loading={busy}
          className="!border-cyan-500/40 !bg-cyan-500/10 hover:!bg-cyan-500/20 !text-cyan-200">
          <span className="hidden sm:inline">Download</span>
          {detected.kind === 'rows' && (
            <span className="ml-1 text-[9px] font-mono opacity-70 hidden sm:inline">
              {detected.rows.length} rows
            </span>
          )}
        </Button>
      </Tooltip>
    </Dropdown>
  )
}
