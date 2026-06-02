// OpeningExplorer — ECO opening database browser.
//
// Three-layer lazy fetch lane:
//   1. List view — server-paginated table of openings (ECO + name + slug).
//      ~50 per page. Cheap row payload (no PGN, no FEN) so the wire
//      stays small even when the user paginates 70+ pages deep.
//   2. Detail view — on row click, fetch the full record (PGN + SAN
//      moves + computed FEN). Shown inline as an accordion expansion.
//   3. Master games (Lichess Opening Explorer) — fired in parallel with
//      detail fetch using the FEN from layer 2. Free public API, no key,
//      no BE proxy. Shows top continuations from the masters DB so users
//      can see "what do GMs actually play in this position?" without us
//      shipping a 50 MB opening book.
//
// Collapsed by default — the analysis board is the page's primary focus
// and the openings panel is tucked underneath as a "browse the canon"
// supplement. Lazy fetches the first list page only when the user opens
// the panel; nothing is fired on /chess mount.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Input, Pagination, message } from 'antd'
import {
  BookOutlined, CloseOutlined, CopyOutlined,
  LoadingOutlined, SearchOutlined, RightOutlined,
} from '@ant-design/icons'
import { Button } from '../ui'
import { chessListOpenings, chessGetOpening, lichessMasters } from '../../api/ai'

// Debounce hook — used so the search query doesn't fire a request on
// every keystroke. 250ms is the same value used by the analyze pane.
function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return v
}

// Render a SAN move list as numbered pairs (1. e4 c5 2. Nf3 d6 …).
function renderPgnPairs(moves) {
  if (!Array.isArray(moves) || moves.length === 0) return null
  const pairs = []
  for (let i = 0; i < moves.length; i += 2) {
    const num = Math.floor(i / 2) + 1
    const w = moves[i]
    const b = moves[i + 1]
    pairs.push(
      <span key={num} className="inline-block mr-2 whitespace-nowrap">
        <span className="text-gray-500 tabular-nums">{num}.</span>{' '}
        <span className="text-gray-100">{w}</span>
        {b && <> <span className="text-gray-300">{b}</span></>}
      </span>
    )
  }
  return pairs
}

// Apply a Lichess Opening Explorer move's UCI into the FEN's move number
// so we can display "Mxx.yyy" or pluralised move number. We just need
// the visible total games for the bar — game/win/draw stats come back
// already populated on each move object.
function gamesTotal(m) {
  return (m.white || 0) + (m.draws || 0) + (m.black || 0)
}

// Win-rate strip — white / draws / black as horizontal bands. Lichess
// returns absolute counts; convert to percentages locally.
function WinBar({ move }) {
  const total = gamesTotal(move)
  if (total === 0) return <div className="h-2 bg-gray-800 rounded" />
  const w = (move.white / total) * 100
  const d = (move.draws / total) * 100
  const b = (move.black / total) * 100
  return (
    <div className="h-2 flex rounded overflow-hidden bg-gray-800" title={`White ${w.toFixed(0)}% · Draws ${d.toFixed(0)}% · Black ${b.toFixed(0)}%`}>
      <div style={{ width: `${w}%` }} className="bg-gray-100" />
      <div style={{ width: `${d}%` }} className="bg-gray-500" />
      <div style={{ width: `${b}%` }} className="bg-gray-900 border-l border-r border-gray-700" />
    </div>
  )
}

// Single row + accordion content for one opening.
// `offline` skips the Lichess masters fetch entirely (the openings
// list + detail are FE cached on the BE anyway, but the masters panel
// is the only thing that hits an external network upstream).
function OpeningRow({ row, expanded, onToggle, offline = false }) {
  const [detail, setDetail] = useState(null)        // BE detail record
  const [detailErr, setDetailErr] = useState(null)
  const [masters, setMasters] = useState(null)      // Lichess explorer payload
  const [mastersErr, setMastersErr] = useState(null)
  const [mastersRateLimited, setMastersRateLimited] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [loadingMasters, setLoadingMasters] = useState(false)
  // Detail fetch dedup — if the user toggles the row twice fast we want
  // exactly one network call to win. AbortController would do too but
  // a ref-cached fetched flag is simpler since the data is immutable.
  const fetched = useRef(false)

  // Lazy-fetch detail on first expand. Detail → FEN → masters chain.
  // In offline mode we still load the opening detail (it's served by
  // the BE proxy with cache) but skip the upstream Lichess masters call.
  useEffect(() => {
    if (!expanded || fetched.current) return
    fetched.current = true
    let cancelled = false
    ;(async () => {
      setLoadingDetail(true); setDetailErr(null)
      const { data, error } = await chessGetOpening(row.slug)
      if (cancelled) return
      setLoadingDetail(false)
      if (error) { setDetailErr(error); return }
      setDetail(data)
      // Now kick off the masters fetch with the computed FEN — unless
      // the user toggled Offline mode, in which case we skip entirely.
      if (data?.fen && !offline) {
        setLoadingMasters(true); setMastersErr(null); setMastersRateLimited(false)
        const { data: m, error: merr, status } = await lichessMasters(data.fen, { moves: 5 })
        if (cancelled) return
        setLoadingMasters(false)
        if (merr) {
          // 429 is shown as a friendly inline pill — the BE has already
          // proxied + cached, so a moment later the same FEN serves out
          // of cache and the panel populates.
          if (status === 429) setMastersRateLimited(true)
          else setMastersErr(merr)
          return
        }
        setMasters(m)
      }
    })()
    return () => { cancelled = true }
  }, [expanded, row.slug, offline])

  const copyPgn = async () => {
    try {
      await navigator.clipboard.writeText(detail?.pgn || '')
      message.success('PGN copied')
    } catch { message.error('Clipboard unavailable') }
  }
  const copyFen = async () => {
    try {
      await navigator.clipboard.writeText(detail?.fen || '')
      message.success('FEN copied')
    } catch { message.error('Clipboard unavailable') }
  }

  return (
    <div className="border-b border-gray-800/60 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-amber-500/[0.04] transition-colors text-left"
      >
        <RightOutlined
          className={`text-[10px] text-gray-500 transition-transform ${expanded ? 'rotate-90 text-amber-400' : ''}`}
        />
        <span className="text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 shrink-0">
          {row.eco}
        </span>
        <span className="text-xs sm:text-sm text-gray-200 flex-1 min-w-0 truncate">
          {row.name}
        </span>
        <span className="text-[10px] text-gray-500 tabular-nums shrink-0">
          {row.plyCount} ply
        </span>
      </button>

      {expanded && (
        <div className="px-3 sm:px-5 pb-4 pt-1 bg-gray-950/40">
          {loadingDetail && (
            <div className="py-4 text-center text-xs text-gray-500">
              <LoadingOutlined className="mr-2" />
              Loading opening details…
            </div>
          )}
          {detailErr && (
            <div className="text-[11px] text-rose-300 font-mono px-2 py-1.5 rounded border border-rose-500/30 bg-rose-500/10">
              {detailErr}
            </div>
          )}

          {detail && (
            <div className="space-y-3">
              {/* Move sequence */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Move sequence</p>
                  <Button size="small" variant="subtle" icon={<CopyOutlined />} onClick={copyPgn}>
                    Copy PGN
                  </Button>
                </div>
                <div className="font-mono text-[12px] leading-relaxed px-2.5 py-2 rounded border border-gray-800 bg-gray-950">
                  {renderPgnPairs(detail.moves)}
                </div>
              </div>

              {/* FEN */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Resulting FEN</p>
                  <Button size="small" variant="subtle" icon={<CopyOutlined />} onClick={copyFen}>
                    Copy FEN
                  </Button>
                </div>
                <div className="font-mono text-[10px] sm:text-[11px] text-gray-300 px-2.5 py-2 rounded border border-gray-800 bg-gray-950 break-all">
                  {detail.fen}
                </div>
              </div>

              {/* Master games (Lichess Opening Explorer) — hidden when
                  Offline mode is on since the masters DB is fetched
                  upstream via Lichess explorer (BE proxy → network). */}
              {!offline && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
                  Master games · top continuations
                </p>
                {loadingMasters && (
                  <div className="py-3 text-center text-xs text-gray-500">
                    <LoadingOutlined className="mr-2" />
                    Fetching from Lichess…
                  </div>
                )}
                {mastersRateLimited && (
                  <div className="text-[11px] text-amber-300 font-mono px-2 py-1.5 rounded border border-amber-500/30 bg-amber-500/10">
                    Master games rate-limited, retry in a moment.
                  </div>
                )}
                {mastersErr && !mastersRateLimited && (
                  <div className="text-[11px] text-rose-300 font-mono px-2 py-1.5 rounded border border-rose-500/30 bg-rose-500/10">
                    Lichess explorer unavailable: {mastersErr}
                  </div>
                )}
                {masters && Array.isArray(masters.moves) && masters.moves.length > 0 && (
                  <div className="rounded border border-gray-800 bg-gray-950 divide-y divide-gray-800/70">
                    {masters.moves.slice(0, 5).map((mv, i) => {
                      const total = gamesTotal(mv)
                      return (
                        <div key={`${mv.uci}-${i}`} className="grid grid-cols-[60px_1fr_70px] sm:grid-cols-[80px_1fr_90px] items-center gap-2 sm:gap-3 px-2.5 py-2">
                          <span className="font-mono text-xs sm:text-sm text-gray-100 font-semibold">
                            {mv.san}
                          </span>
                          <WinBar move={mv} />
                          <span className="text-[10px] sm:text-[11px] text-gray-500 tabular-nums text-right">
                            {total.toLocaleString()}
                          </span>
                        </div>
                      )
                    })}
                    <div className="px-2.5 py-1.5 text-[10px] text-gray-600 italic">
                      Total master games in DB: {(masters.white + masters.draws + masters.black).toLocaleString()}
                    </div>
                  </div>
                )}
                {masters && (!masters.moves || masters.moves.length === 0) && (
                  <div className="text-[11px] text-gray-500 italic px-2 py-1.5">
                    No master continuations recorded for this position.
                  </div>
                )}
              </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function OpeningExplorer({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit] = useState(50)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query, 300)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [expandedSlug, setExpandedSlug] = useState(null)
  // Offline toggle — when on, the row accordion skips the Lichess
  // masters fetch (the only upstream network call in this panel).
  // The opening list + detail still load (they're proxied + cached by
  // our own BE) but the "Master games" subsection is suppressed.
  const [offline, setOffline] = useState(false)

  // Fetch list when (a) panel is opened, (b) page changes, (c) query changes.
  const load = useCallback(async (signal) => {
    setLoading(true); setErr(null)
    const { data, error } = await chessListOpenings({ page, limit, q: debouncedQuery })
    if (signal?.aborted) return
    setLoading(false)
    if (error) { setErr(error); return }
    setItems(Array.isArray(data?.items) ? data.items : [])
    setTotal(data?.total || 0)
  }, [page, limit, debouncedQuery])

  useEffect(() => {
    if (!open) return
    const ctl = new AbortController()
    load(ctl.signal)
    return () => ctl.abort()
  }, [open, load])

  // Reset to page 1 whenever the search query changes — otherwise a
  // search would land us on the last viewed page of the unfiltered list.
  useEffect(() => { setPage(1) }, [debouncedQuery])

  // Collapse any expanded row when paginating — the row goes off-screen
  // anyway, and keeping it open would leak its detail-fetch state into
  // the next page's render.
  useEffect(() => { setExpandedSlug(null) }, [page, debouncedQuery])

  const headerSummary = useMemo(() => {
    if (loading) return 'Loading…'
    if (!open) return 'Browse 3,700+ ECO-classified openings'
    if (debouncedQuery) return `${total.toLocaleString()} match${total === 1 ? '' : 'es'} for "${debouncedQuery}"`
    return `${total.toLocaleString()} openings · ECO A–E`
  }, [loading, open, total, debouncedQuery])

  return (
    <section className="luxe-card mt-5">
      {/* Header — click to expand/collapse */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 p-3 sm:p-4 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <BookOutlined className="text-amber-300 text-base shrink-0" />
          <div className="min-w-0">
            <div className="eyebrow-mono text-[10px] mb-0.5">// ECO opening database</div>
            <h2 className="text-base sm:text-lg font-bold gradient-text-amber leading-tight">
              Chess Openings
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="hidden sm:inline text-[11px] text-gray-500">{headerSummary}</span>
          <span className="text-xs text-gray-400">{open ? 'Hide' : 'Open'}</span>
          <RightOutlined className={`text-[10px] text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-800/60">
          {/* Search bar + offline toggle */}
          <div className="px-3 sm:px-4 py-3 border-b border-gray-800/60 flex items-center gap-2 flex-wrap">
            <Input
              prefix={<SearchOutlined className="text-gray-500" />}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or ECO (e.g. Najdorf, B90, Catalan)…"
              allowClear
              size="middle"
              className="!bg-gray-950 max-w-md"
            />
            {/* Offline mode — hides the Lichess masters subsection so the
                row accordion never hits the upstream network call. The
                opening list + detail are served by our own BE proxy. */}
            <button
              type="button"
              onClick={() => setOffline(o => !o)}
              title={offline ? 'Show master games panel' : 'Hide master games panel (no upstream network)'}
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-lg border inline-flex items-center gap-1.5 ${
                offline
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-gray-800 bg-gray-900/60 text-gray-400 hover:text-gray-200'
              }`}
            >
              Offline{' '}
              <span className={`font-mono ${offline ? 'text-emerald-300' : 'text-gray-500'}`}>
                {offline ? 'ON' : 'OFF'}
              </span>
            </button>
            <span className="sm:hidden text-[11px] text-gray-500 ml-auto">{headerSummary}</span>
          </div>

          {/* Error banner */}
          {err && (
            <div className="m-3 text-[11px] text-rose-300 font-mono px-2 py-1.5 rounded border border-rose-500/30 bg-rose-500/10">
              {err}
            </div>
          )}

          {/* List body */}
          <div className="max-h-[60vh] overflow-y-auto">
            {loading && items.length === 0 && (
              <div className="py-10 text-center text-xs text-gray-500">
                <LoadingOutlined className="mr-2" />
                Loading openings…
              </div>
            )}
            {!loading && !err && items.length === 0 && (
              <div className="py-10 text-center text-xs text-gray-500">
                No openings match that search.
              </div>
            )}
            {items.map(row => (
              <OpeningRow
                key={row.slug}
                row={row}
                expanded={expandedSlug === row.slug}
                onToggle={() => setExpandedSlug(s => s === row.slug ? null : row.slug)}
                offline={offline}
              />
            ))}
          </div>

          {/* Pagination footer */}
          {total > limit && (
            <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-t border-gray-800/60 flex-wrap">
              <span className="text-[10px] text-gray-500 tabular-nums">
                Page {page} · {((page - 1) * limit + 1).toLocaleString()}–{Math.min(page * limit, total).toLocaleString()} of {total.toLocaleString()}
              </span>
              <Pagination
                size="small"
                current={page}
                pageSize={limit}
                total={total}
                onChange={setPage}
                showSizeChanger={false}
                showLessItems
              />
            </div>
          )}

          {/* Footer — credit + license */}
          <div className="px-3 sm:px-4 py-2 border-t border-gray-800/60 text-[10px] text-gray-600 italic flex items-center justify-between gap-2 flex-wrap">
            <span>Opening data: lichess-org/chess-openings (CC0)</span>
            <span>Master games: explorer.lichess.ovh (CC-BY)</span>
          </div>
        </div>
      )}
    </section>
  )
}
