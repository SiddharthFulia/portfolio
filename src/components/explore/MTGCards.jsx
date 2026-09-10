// Magic: The Gathering — card browser.
//
// Data source: Scryfall (via /api/proxy/mtg on sid-be). Two modes:
//   • search — `?q=<query>` returns paginated results, `has_more` flag
//   • random — `?random=true` returns a single random card
// The random button fires 8 in parallel to fill the grid.
//
// Colour identity chips render the classic W U B R G in-line.

import { useState, useEffect, useCallback } from 'react'
import { Input, Modal, Tag, Empty, message } from 'antd'
import { SearchOutlined, ReloadOutlined, DownloadOutlined, CopyOutlined } from '@ant-design/icons'
import { Button } from '../ui'
import { LuxeLoader } from '../loaders'
import AnimatedCard from './AnimatedCard'
import { fetchMTG } from '../../api/nasa'

const RARITY_COLORS = { common: 'default', uncommon: 'silver', rare: 'gold', mythic: 'orange' }

const COLOR_STYLES = {
  W: { bg: '#f9f4d4', fg: '#7a6b1f', label: 'White' },
  U: { bg: '#c9e0f6', fg: '#1c4b8b', label: 'Blue' },
  B: { bg: '#c5bfba', fg: '#242220', label: 'Black' },
  R: { bg: '#f7c9c1', fg: '#8f2b17', label: 'Red' },
  G: { bg: '#c8dfc4', fg: '#1f5a2a', label: 'Green' },
}

const ManaPip = ({ c }) => {
  const s = COLOR_STYLES[c]
  if (!s) return null
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black shadow-sm ring-1 ring-black/20"
      style={{ background: s.bg, color: s.fg }}
      title={s.label}
    >
      {c}
    </span>
  )
}

const MTGCards = () => {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)

  const loadRandom = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSearch('')
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => fetchMTG({ random: 'true' }))
    )
    const results = []
    const seen = new Set()
    for (const { data } of responses) {
      if (data?.image_uris && !seen.has(data.id)) {
        seen.add(data.id)
        results.push(data)
      }
    }
    setCards(results)
    setHasMore(false)
    setLoading(false)
  }, [])

  const searchCards = useCallback(async (q, pg = 1, append = false) => {
    if (!q.trim()) { loadRandom(); return }
    if (append) setLoadingMore(true); else setLoading(true)
    setError(null)
    const { data, error: err } = await fetchMTG({ q: q.trim(), page: pg })
    if (err) {
      setError(err)
      if (!append) setCards([])
      setHasMore(false)
    } else if (data?.data) {
      const withArt = data.data.filter(c => c.image_uris)
      setCards(prev => append ? [...prev, ...withArt] : withArt)
      setHasMore(!!data.has_more)
      setPage(pg)
    } else {
      if (!append) setCards([])
      setHasMore(false)
    }
    if (append) setLoadingMore(false); else setLoading(false)
  }, [loadRandom])

  useEffect(() => { loadRandom() }, [loadRandom])

  const handleSearch = (val) => { setPage(1); searchCards(val, 1, false) }

  const download = async (url, name) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${name}.jpg`
      a.click()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      window.open(url, '_blank')
    }
  }

  const copyOracle = async (card) => {
    const text = `${card.name}${card.mana_cost ? ` — ${card.mana_cost}` : ''}\n${card.type_line || ''}\n${card.oracle_text || ''}`
    try {
      await navigator.clipboard.writeText(text.trim())
      message.success('Card text copied')
    } catch {
      message.error('Could not copy')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <Input.Search
          placeholder='Try "dragon", "lightning bolt", or "type:planeswalker"'
          allowClear size="large"
          enterButton={<SearchOutlined />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onSearch={handleSearch}
          className="flex-1"
        />
        <Button variant="secondary" size="large" icon={<ReloadOutlined />} onClick={loadRandom}>
          Random 8
        </Button>
      </div>
      <p className="text-xs text-gray-500 -mt-3">
        Full-text search — name, oracle text, type line, keywords, and Scryfall operators.
      </p>

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{cards.length} card{cards.length !== 1 ? 's' : ''}</span>
        {error && <span className="text-rose-400">{error}</span>}
      </div>

      {loading ? (
        <div className="flex justify-center py-14">
          <LuxeLoader variant="cosmos" size="lg" label="Shuffling the library…" />
        </div>
      ) : cards.length === 0 ? (
        <Empty description={<span className="text-gray-500">No cards found.</span>} />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {cards.map(c => (
              <AnimatedCard key={c.id} tiltAmount={15}
                effect={c.rarity === 'mythic' ? 'fire' : c.rarity === 'rare' ? 'electric' : c.rarity === 'uncommon' ? 'grass' : 'default'}
                onClick={() => setSelected(c)}
                className="cursor-pointer rounded-xl overflow-hidden ring-1 ring-white/5 hover:ring-white/20 transition-all">
                <img src={c.image_uris?.normal || c.image_uris?.small} alt={c.name} loading="lazy"
                  className="w-full rounded-xl" />
              </AnimatedCard>
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="primary"
                loading={loadingMore}
                onClick={() => searchCards(search, page + 1, true)}
              >
                {loadingMore ? 'Loading more…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Detail modal — real MTG card + oracle text side-by-side */}
      <Modal open={!!selected} onCancel={() => setSelected(null)} footer={null} width={640} centered destroyOnClose>
        {selected && (
          <div className="flex flex-col sm:flex-row gap-4">
            <img
              src={selected.image_uris?.large || selected.image_uris?.normal}
              alt={selected.name}
              className="w-full sm:w-56 rounded-xl shrink-0 ring-1 ring-white/10"
            />
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <h3 className="text-lg font-bold text-white leading-tight">{selected.name}</h3>
                {selected.mana_cost && (
                  <p className="text-gray-400 text-xs mt-1">{selected.mana_cost}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Tag color={RARITY_COLORS[selected.rarity] || 'default'} className="capitalize">
                  {selected.rarity}
                </Tag>
                {selected.type_line && <Tag>{selected.type_line}</Tag>}
              </div>

              {selected.color_identity?.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide">Colours</span>
                  <div className="flex gap-1">{selected.color_identity.map(c => <ManaPip key={c} c={c} />)}</div>
                </div>
              )}

              {selected.oracle_text && (
                <p className="text-gray-300 text-xs leading-relaxed whitespace-pre-line border-l-2 border-amber-500/40 pl-3">
                  {selected.oracle_text}
                </p>
              )}

              {selected.flavor_text && (
                <p className="italic text-gray-500 text-xs">"{selected.flavor_text}"</p>
              )}

              {selected.power && (
                <p className="text-white font-bold text-sm">
                  {selected.power} / {selected.toughness}
                </p>
              )}

              {selected.set_name && (
                <p className="text-gray-600 text-[10px]">
                  {selected.set_name}{selected.collector_number ? ` #${selected.collector_number}` : ''}
                </p>
              )}

              <div className="flex flex-wrap gap-1.5 pt-2">
                <Button variant="primary" size="small" icon={<DownloadOutlined />}
                  onClick={() => download(selected.image_uris?.large || selected.image_uris?.normal, selected.name)}>
                  Download
                </Button>
                <Button variant="secondary" size="small" icon={<CopyOutlined />} onClick={() => copyOracle(selected)}>
                  Copy text
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default MTGCards
