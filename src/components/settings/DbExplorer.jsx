// Database Explorer — Settings → Database tab.
//
// Two-column layout:
//   • Left  (1/4): searchable table list, ordered by rowCount desc.
//                  Click a table to load its rows in the right pane.
//   • Right (3/4): paginated row browser for the selected table, plus
//                  a "Query mode" toggle that reveals a split-pane
//                  with either "Ask in English" (Groq → SELECT) or
//                  "Write SQL" (direct SELECT).
//
// Safety contract — every call hits a vault-gated endpoint. The BE rejects
// any non-SELECT SQL with a clear reason; we display the rejection inline
// in red. The "Read-only sandbox" pill at the top makes the contract
// visible to the user.

import { useEffect, useMemo, useState, useRef } from 'react'
import { Tabs, Pagination, Select, Empty, Tag, Tooltip, Input } from 'antd'
import {
  DatabaseOutlined, ReloadOutlined, SearchOutlined, ThunderboltOutlined,
  CodeOutlined, BulbOutlined, SafetyOutlined, RightOutlined,
} from '@ant-design/icons'
import { Button } from '../ui'
import { notice } from '../../lib/notice'
import {
  adminDbTables, adminDbTable, adminDbQuery, adminDbAsk,
} from '../../api/ai'

const PAGE_SIZES = [25, 50, 100, 200, 500]

function fmtBytes(n) {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

// Stringify cell values for the table view. JSON-detect objects/arrays
// (sometimes columns hold JSON strings), truncate long blobs.
function renderCell(v) {
  if (v == null) return <span className="text-gray-600 italic">null</span>
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'number') return <span className="tabular-nums">{v.toLocaleString()}</span>
  if (typeof v === 'object') {
    if (v.kind === 'blob' && typeof v.bytes === 'number') {
      return <Tag color="default" className="!font-mono !text-[10px]">BLOB {fmtBytes(v.bytes)}</Tag>
    }
    const s = JSON.stringify(v)
    return <span className="font-mono text-[11px]">{s.length > 200 ? s.slice(0, 200) + '…' : s}</span>
  }
  const s = String(v)
  if (s.length > 200) {
    return (
      <Tooltip title={s.slice(0, 1000)}>
        <span className="font-mono text-[11px]">{s.slice(0, 200)}…</span>
      </Tooltip>
    )
  }
  return <span className="font-mono text-[11px]">{s}</span>
}

export default function DbExplorer() {
  // ── Schema (left pane) ──────────────────────────────────────
  const [tables, setTables]   = useState([])
  const [tablesLoading, setTablesLoading] = useState(true)
  const [filter, setFilter]   = useState('')
  const [selected, setSelected] = useState(null)   // table name

  const loadTables = async ({ refresh = false } = {}) => {
    setTablesLoading(true)
    const { data, error } = await adminDbTables({ refresh })
    setTablesLoading(false)
    if (error) {
      notice.error(`Schema load failed: ${error}`)
      return
    }
    const list = (data?.tables || []).slice().sort((a, b) => (b.rowCount || 0) - (a.rowCount || 0))
    setTables(list)
    // Auto-select the first table on initial load if none is selected.
    if (!selected && list.length) setSelected(list[0].name)
  }
  useEffect(() => { loadTables() }, [])      // eslint-disable-line react-hooks/exhaustive-deps

  const visibleTables = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return tables
    return tables.filter(t => t.name.toLowerCase().includes(q))
  }, [tables, filter])

  // ── Row browser (right pane, default mode) ──────────────────
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage]         = useState(1)
  const [rowsData, setRowsData] = useState(null)
  const [rowsLoading, setRowsLoading] = useState(false)
  const [orderBy, setOrderBy]   = useState('')
  const [order, setOrder]       = useState('desc')

  const loadRows = async () => {
    if (!selected) return
    setRowsLoading(true)
    const { data, error } = await adminDbTable(selected, {
      limit:  pageSize,
      offset: (page - 1) * pageSize,
      orderBy,
      order,
    })
    setRowsLoading(false)
    if (error) {
      notice.error(`Browse failed: ${error}`)
      setRowsData(null)
      return
    }
    setRowsData(data)
  }
  // Re-load rows whenever the selected table / pagination / order changes.
  useEffect(() => {
    setPage(1)
    setOrderBy('')
  }, [selected])
  useEffect(() => { loadRows() }, [selected, page, pageSize, orderBy, order])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Query mode (right pane, expandable) ─────────────────────
  const [queryOpen, setQueryOpen] = useState(false)
  const [queryTab,  setQueryTab]  = useState('ask')   // 'ask' | 'sql'

  // Natural-language Q&A state
  const [question, setQuestion] = useState('')
  const [askResult, setAskResult] = useState(null)
  const [askError, setAskError]   = useState(null)
  const [askLoading, setAskLoading] = useState(false)

  // Direct SQL state
  const [sql, setSql] = useState('SELECT name FROM sqlite_master WHERE type=\'table\' LIMIT 50')
  const [sqlResult, setSqlResult] = useState(null)
  const [sqlError, setSqlError]   = useState(null)
  const [sqlLoading, setSqlLoading] = useState(false)

  // Refs to scroll the result panes into view when a query completes.
  const askResultRef = useRef(null)
  const sqlResultRef = useRef(null)

  const runAsk = async () => {
    const q = question.trim()
    if (!q) return
    setAskLoading(true); setAskError(null); setAskResult(null)
    const r = await adminDbAsk(q)
    setAskLoading(false)
    if (r.error) {
      // BE returns the generated SQL even on rejection — display both.
      setAskError({ message: r.error, data: r.data, status: r.status })
      // If the rejection includes a generatedSql, surface it.
      return
    }
    setAskResult(r.data)
    setTimeout(() => askResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }

  const runSql = async () => {
    const s = sql.trim()
    if (!s) return
    setSqlLoading(true); setSqlError(null); setSqlResult(null)
    const r = await adminDbQuery(s)
    setSqlLoading(false)
    if (r.error) {
      setSqlError({ message: r.error, data: r.data, status: r.status })
      return
    }
    setSqlResult(r.data)
    setTimeout(() => sqlResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }

  const useGeneratedSqlInSqlTab = (g) => {
    if (!g) return
    setSql(g)
    setQueryTab('sql')
  }

  const selectedMeta = useMemo(() => tables.find(t => t.name === selected), [tables, selected])

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header strip — read-only pill + refresh + query-mode toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <Tag color="cyan" className="!flex !items-center !gap-1 !text-[11px] !font-mono">
          <SafetyOutlined /> Read-only sandbox
        </Tag>
        <Tag color="default" className="!text-[11px] !font-mono">
          {tables.length} tables
        </Tag>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="subtle"
            size="small"
            onClick={() => loadTables({ refresh: true })}
            disabled={tablesLoading}
          >
            <ReloadOutlined spin={tablesLoading} /> Refresh schema
          </Button>
          <Button
            variant={queryOpen ? 'primary' : 'secondary'}
            size="small"
            onClick={() => setQueryOpen(o => !o)}
          >
            <ThunderboltOutlined /> {queryOpen ? 'Hide query' : 'Run query'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* ── Left: table list ───────────────────────────── */}
        <aside className="lg:col-span-1 rounded-2xl border border-white/10 bg-white/[0.02] p-3 max-h-[70vh] overflow-y-auto">
          <Input
            allowClear
            size="small"
            placeholder="Filter tables…"
            prefix={<SearchOutlined />}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mb-2"
          />
          {tablesLoading && tables.length === 0 ? (
            <div className="text-xs text-gray-500 px-2 py-3">Loading schema…</div>
          ) : visibleTables.length === 0 ? (
            <div className="text-xs text-gray-500 px-2 py-3">No tables match.</div>
          ) : (
            <ul className="space-y-1">
              {visibleTables.map(t => {
                const active = t.name === selected
                return (
                  <li key={t.name}>
                    <button
                      type="button"
                      onClick={() => setSelected(t.name)}
                      className={[
                        'w-full text-left px-2 py-1.5 rounded-lg transition border flex items-center justify-between gap-2',
                        active
                          ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                          : 'border-transparent hover:bg-white/5 text-gray-300',
                      ].join(' ')}
                    >
                      <span className="font-mono text-[11px] truncate flex items-center gap-1.5">
                        {active && <RightOutlined className="text-[8px]" />}
                        {t.name}
                      </span>
                      <span className="text-[10px] tabular-nums text-gray-400 shrink-0">
                        {(t.rowCount || 0).toLocaleString()}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {/* ── Right: rows + query mode ──────────────────── */}
        <section className="lg:col-span-3 space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <DatabaseOutlined className="text-amber-300" />
              <span className="font-mono text-xs text-gray-200">
                {selected || '—'}
              </span>
              {selectedMeta && (
                <Tag color="default" className="!text-[10px] !font-mono">
                  {selectedMeta.columns?.length || 0} cols · {(selectedMeta.rowCount || 0).toLocaleString()} rows
                </Tag>
              )}
              <div className="ml-auto flex items-center gap-2">
                <Select
                  size="small"
                  value={pageSize}
                  onChange={(v) => { setPage(1); setPageSize(v) }}
                  options={PAGE_SIZES.map(n => ({ value: n, label: `${n}/page` }))}
                  className="!w-24"
                />
                <Button
                  variant="subtle"
                  size="small"
                  onClick={loadRows}
                  disabled={rowsLoading}
                >
                  <ReloadOutlined spin={rowsLoading} />
                </Button>
              </div>
            </div>

            {/* Rows table */}
            {!selected ? (
              <Empty description="Pick a table on the left." />
            ) : rowsLoading && !rowsData ? (
              <div className="text-xs text-gray-500 py-6 text-center">Loading rows…</div>
            ) : rowsData?.rows?.length ? (
              <div className="overflow-x-auto rounded-lg border border-white/5">
                <table className="w-full text-[11px]">
                  <thead className="bg-white/[0.03] border-b border-white/10">
                    <tr>
                      {(rowsData.columns || []).map(c => {
                        const colName = c.name || c
                        const active = orderBy === colName
                        return (
                          <th key={colName} className="text-left px-2 py-1.5 font-mono text-[10px] text-gray-400 uppercase tracking-wider">
                            <button
                              type="button"
                              onClick={() => {
                                if (orderBy === colName) {
                                  setOrder(o => o === 'desc' ? 'asc' : 'desc')
                                } else {
                                  setOrderBy(colName); setOrder('desc')
                                }
                              }}
                              className={active ? 'text-amber-300' : 'hover:text-gray-200'}
                            >
                              {colName}{active ? (order === 'desc' ? ' ↓' : ' ↑') : ''}
                            </button>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rowsData.rows.map((row, i) => (
                      <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                        {(rowsData.columns || []).map(c => {
                          const colName = c.name || c
                          return (
                            <td key={colName} className="px-2 py-1 align-top max-w-[260px] truncate">
                              {renderCell(row[colName])}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty description="No rows." />
            )}

            {/* Pagination */}
            {rowsData?.total > 0 && (
              <div className="mt-3 flex justify-end">
                <Pagination
                  size="small"
                  current={page}
                  pageSize={pageSize}
                  total={rowsData.total}
                  showSizeChanger={false}
                  onChange={(p) => setPage(p)}
                />
              </div>
            )}
          </div>

          {/* ── Query mode panel ─────────────────────────── */}
          {queryOpen && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.04] p-3">
              <Tabs
                size="small"
                activeKey={queryTab}
                onChange={setQueryTab}
                items={[
                  {
                    key: 'ask',
                    label: <span className="text-xs inline-flex items-center gap-1"><BulbOutlined /> Ask in English</span>,
                    children: (
                      <div className="space-y-2">
                        <Input.TextArea
                          rows={3}
                          value={question}
                          onChange={(e) => setQuestion(e.target.value)}
                          placeholder="e.g. How many videos completed in the last 7 days, grouped by provider?"
                          className="!font-mono !text-xs"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary"
                            size="small"
                            onClick={runAsk}
                            disabled={askLoading || !question.trim()}
                          >
                            <BulbOutlined /> {askLoading ? 'Asking Groq…' : 'Ask Groq'}
                          </Button>
                          <span className="text-[10px] text-gray-500 font-mono">
                            llama-3.3-70b-versatile · read-only SELECT only
                          </span>
                        </div>

                        {askError && (
                          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-rose-200 text-xs space-y-1">
                            <div className="font-mono">{askError.message}</div>
                            {askError.data?.generatedSql && (
                              <>
                                <div className="text-[10px] uppercase tracking-wider text-rose-300/80 mt-1">Generated SQL (not executed):</div>
                                <pre className="font-mono text-[11px] whitespace-pre-wrap bg-black/40 p-2 rounded">{askError.data.generatedSql}</pre>
                                <Button
                                  variant="ghost"
                                  size="small"
                                  onClick={() => useGeneratedSqlInSqlTab(askError.data.generatedSql)}
                                >
                                  Edit in SQL tab
                                </Button>
                              </>
                            )}
                          </div>
                        )}

                        {askResult && (
                          <div ref={askResultRef} className="space-y-2">
                            <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Generated SQL</div>
                              <pre className="font-mono text-[11px] whitespace-pre-wrap text-cyan-200">{askResult.generatedSql}</pre>
                            </div>
                            {askResult.explanation && (
                              <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-gray-300">
                                <BulbOutlined className="text-amber-300 mr-1" />
                                {askResult.explanation}
                              </div>
                            )}
                            <QueryResultTable result={askResult} />
                          </div>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'sql',
                    label: <span className="text-xs inline-flex items-center gap-1"><CodeOutlined /> Write SQL</span>,
                    children: (
                      <div className="space-y-2">
                        <Input.TextArea
                          rows={5}
                          value={sql}
                          onChange={(e) => setSql(e.target.value)}
                          placeholder="SELECT … FROM …"
                          className="!font-mono !text-xs"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary"
                            size="small"
                            onClick={runSql}
                            disabled={sqlLoading || !sql.trim()}
                          >
                            <ThunderboltOutlined /> {sqlLoading ? 'Running…' : 'Run SQL'}
                          </Button>
                          <span className="text-[10px] text-gray-500 font-mono">
                            SELECT only · auto-LIMIT 200 · no comments / multi-statements
                          </span>
                        </div>

                        {sqlError && (
                          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-rose-200 text-xs space-y-1">
                            <div className="font-mono">{sqlError.message}</div>
                          </div>
                        )}

                        {sqlResult && (
                          <div ref={sqlResultRef}>
                            <QueryResultTable result={sqlResult} />
                          </div>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// Reusable result table for both the "Ask" and "Write SQL" tabs.
function QueryResultTable({ result }) {
  if (!result) return null
  const cols = result.columns || (result.rows?.[0] ? Object.keys(result.rows[0]) : [])
  return (
    <div className="rounded-lg border border-white/10 bg-black/30">
      <div className="px-2 py-1.5 border-b border-white/5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-400 font-mono">
        <span>{result.rowCount} rows</span>
        {typeof result.durationMs === 'number' && <span>· {result.durationMs} ms</span>}
        {cols.length > 0 && <span>· {cols.length} cols</span>}
      </div>
      {result.rows?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-white/[0.03] border-b border-white/10">
              <tr>
                {cols.map(c => (
                  <th key={c} className="text-left px-2 py-1 font-mono text-[10px] text-gray-400 uppercase tracking-wider">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                  {cols.map(c => (
                    <td key={c} className="px-2 py-1 align-top max-w-[260px] truncate">
                      {renderCell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-2 py-3 text-xs text-gray-500">Empty result.</div>
      )}
    </div>
  )
}
