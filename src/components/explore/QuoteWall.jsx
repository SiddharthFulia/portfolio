// Quote Wall — masonry of inspiring quotes from ZenQuotes.
//
// Bug history: the old "Load More" button was broken. Root cause:
//   (a) state was capped at `.slice(0, 30)`, so every click after the
//       first flushed back to 30 quotes with no growth.
//   (b) key={q._id || i} used the array index because ZenQuotes has no
//       stable id — repeat quotes rendered as the same key and React
//       silently de-duped visually.
//   (c) no dedup by content, so a rate-limited retry that returned the
//       same 50 quotes appeared to do nothing.
//
// Fix: append fresh quotes to the tail, dedupe by "q|a" signature, no
// cap. Also: surface rate-limit errors (ZenQuotes 429s aggressively —
// ~5 req / 30s per IP), and a "you've reached the end" state once we've
// polled the pool exhaustively.

import { useState, useEffect, useCallback } from 'react'
import { Input, Tag, Tooltip, message } from 'antd'
import { HeartOutlined, HeartFilled, CopyOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button } from '../ui'
import { LuxeLoader } from '../loaders'
import { fetchQuotes } from '../../api/nasa'

const COLORS = [
  'from-cyan-500/10 to-blue-500/10 border-cyan-500/25',
  'from-purple-500/10 to-pink-500/10 border-purple-500/25',
  'from-amber-500/10 to-orange-500/10 border-amber-500/25',
  'from-emerald-500/10 to-teal-500/10 border-emerald-500/25',
  'from-rose-500/10 to-red-500/10 border-rose-500/25',
  'from-indigo-500/10 to-violet-500/10 border-indigo-500/25',
]

// localStorage key for favourites — survives page reloads.
const FAV_KEY = 'sf.quotes.favs'

const sig = (q) => `${q.content}|${q.author}`

const QuoteWall = () => {
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [showFavsOnly, setShowFavsOnly] = useState(false)
  const [favs, setFavs] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')) }
    catch { return new Set() }
  })
  // If two consecutive fetches return zero new (deduped) quotes, we've
  // exhausted the ZenQuotes rotating pool — flip to "end reached" state.
  const [dryStreak, setDryStreak] = useState(0)

  const persistFavs = (next) => {
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])) } catch {}
  }

  const load = useCallback(async (isMore = false) => {
    if (isMore) setLoadingMore(true)
    else setLoading(true)
    setError(null)

    const { data, error: err } = await fetchQuotes()
    if (err) {
      setError(err)
      if (isMore) setLoadingMore(false)
      else setLoading(false)
      return
    }
    if (!Array.isArray(data)) {
      setError('Upstream returned an unexpected shape')
      if (isMore) setLoadingMore(false)
      else setLoading(false)
      return
    }
    const mapped = data.map(q => ({
      content: q.q || q.content,
      author: q.a || q.author || 'Unknown',
      // ZenQuotes ships a numeric "c" (character count) that is stable per
      // quote; use it as a hint in the key while sig() dedupes properly.
      c: q.c,
    })).filter(q => q.content)

    setQuotes(prev => {
      const seen = new Set(prev.map(sig))
      const fresh = mapped.filter(q => !seen.has(sig(q)))
      if (isMore) {
        setDryStreak(fresh.length === 0 ? (s => s + 1) : 0)
      }
      return isMore ? [...prev, ...fresh] : mapped
    })

    if (isMore) setLoadingMore(false)
    else setLoading(false)
  }, [])

  useEffect(() => { load(false) }, [load])

  const toggleFav = (q) => {
    const key = sig(q)
    setFavs(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      persistFavs(next)
      return next
    })
  }

  const copyQuote = async (q) => {
    const text = `"${q.content}" — ${q.author}`
    try {
      await navigator.clipboard.writeText(text)
      message.success('Copied to clipboard')
    } catch {
      message.error('Could not copy')
    }
  }

  const filtered = quotes
    .filter(q => !showFavsOnly || favs.has(sig(q)))
    .filter(q => !search || q.content.toLowerCase().includes(search.toLowerCase()) || q.author.toLowerCase().includes(search.toLowerCase()))

  const exhausted = dryStreak >= 2

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Filter by keyword or author..."
          prefix={<SearchOutlined className="text-gray-500" />}
          allowClear size="large"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1"
        />
        <Button
          variant={showFavsOnly ? 'primary' : 'secondary'}
          icon={showFavsOnly ? <HeartFilled /> : <HeartOutlined />}
          onClick={() => setShowFavsOnly(v => !v)}
        >
          {showFavsOnly ? 'Favourites' : `Favs (${favs.size})`}
        </Button>
      </div>
      <p className="text-xs text-gray-500 -mt-3">
        Filter by any word in the quote or the author's name. Favourites persist in this browser only.
      </p>

      {/* Counter */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">
          {filtered.length} of {quotes.length} quotes
          {favs.size > 0 && ` · ${favs.size} favourited`}
        </span>
        {error && <span className="text-rose-400">{error}</span>}
      </div>

      {/* Content */}
      {loading && quotes.length === 0 ? (
        <div className="flex justify-center py-12">
          <LuxeLoader variant="cosmos" size="lg" label="Loading quotes…" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-10 text-center">
          <p className="text-gray-400 text-sm">
            {showFavsOnly ? 'No favourites yet. Tap the heart on any quote to save it.' :
             search ? 'No quotes match that filter.' : 'No quotes returned.'}
          </p>
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
          {filtered.map((q, i) => {
            const key = sig(q)
            const isFav = favs.has(key)
            return (
              <div key={key}
                className={`break-inside-avoid rounded-xl border bg-gradient-to-br p-5 transition-colors hover:border-white/20 ${COLORS[i % COLORS.length]}`}>
                <svg className="w-6 h-6 text-gray-500 mb-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C9.591 11.69 11 13.17 11 15c0 1.93-1.57 3.5-3.5 3.5-1.073 0-2.099-.49-2.917-1.179zM14.583 17.321C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C19.591 11.69 21 13.17 21 15c0 1.93-1.57 3.5-3.5 3.5-1.073 0-2.099-.49-2.917-1.179z" />
                </svg>
                <p className="text-white text-sm leading-relaxed mb-3">{q.content}</p>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-xs font-medium">— {q.author}</span>
                  <div className="flex items-center gap-1">
                    <Tooltip title="Copy">
                      <button onClick={() => copyQuote(q)}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-amber-400 hover:bg-white/5 transition-colors"
                        aria-label="Copy quote">
                        <CopyOutlined />
                      </button>
                    </Tooltip>
                    <Tooltip title={isFav ? 'Unfavourite' : 'Favourite'}>
                      <button onClick={() => toggleFav(q)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors ${
                          isFav ? 'text-rose-400' : 'text-gray-500 hover:text-rose-400'
                        }`}
                        aria-label={isFav ? 'Remove favourite' : 'Add favourite'}>
                        {isFav ? <HeartFilled /> : <HeartOutlined />}
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Load more */}
      {!loading && (
        <div className="flex flex-col items-center gap-2 pt-2">
          {exhausted ? (
            <div className="text-center text-gray-500 text-xs">
              <Tag color="default" className="mb-2">You've reached the end</Tag>
              <div>
                <button onClick={() => { setDryStreak(0); load(true) }}
                  className="text-amber-400 hover:text-amber-300 underline underline-offset-4 text-xs">
                  Try again anyway
                </button>
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              icon={<ReloadOutlined />}
              loading={loadingMore}
              onClick={() => load(true)}
            >
              {loadingMore ? 'Loading more…' : 'Load more'}
            </Button>
          )}
          <p className="text-[11px] text-gray-600">
            Each request pulls a fresh batch. Duplicates are removed automatically.
          </p>
        </div>
      )}
    </div>
  )
}

export default QuoteWall
