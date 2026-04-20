import { useState, useEffect, useCallback } from 'react'
import { Input, Modal, Tag, Button, Empty } from 'antd'
import { SearchOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons'
import { fetchMTG } from '../../api/nasa'

const RARITY_COLORS = { common: 'default', uncommon: 'silver', rare: 'gold', mythic: 'orange' }

const SkeletonGrid = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
    {[...Array(8)].map((_, i) => <div key={i} className="animate-pulse bg-gray-800 rounded-xl" style={{ aspectRatio: '488/680' }} />)}
  </div>
)

const MTGCards = () => {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)

  const loadRandom = async () => {
    setLoading(true)
    setSearch('')
    const results = []
    const promises = Array.from({ length: 8 }, () => fetchMTG({ random: 'true' }))
    const responses = await Promise.all(promises)
    responses.forEach(({ data }) => {
      if (data?.image_uris) results.push(data)
    })
    setCards(results)
    setHasMore(false)
    setLoading(false)
  }

  const searchCards = useCallback(async (q, pg = 1) => {
    if (!q.trim()) { loadRandom(); return }
    setLoading(true)
    const { data } = await fetchMTG({ q: q.trim(), page: pg })
    if (data?.data) {
      setCards(pg === 1 ? data.data.filter(c => c.image_uris) : [...cards, ...data.data.filter(c => c.image_uris)])
      setHasMore(data.has_more || false)
      setPage(pg)
    } else {
      if (pg === 1) setCards([])
      setHasMore(false)
    }
    setLoading(false)
  }, [cards])

  useEffect(() => { loadRandom() }, [])

  const handleSearch = (val) => { setPage(1); searchCards(val, 1) }

  const download = (url, name) => {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.download = `${name}.jpg`
    a.click()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <Input.Search
          placeholder="Search cards... (e.g. 'dragon', 'lightning bolt')"
          allowClear size="large"
          enterButton={<SearchOutlined />}
          value={search} onChange={e => setSearch(e.target.value)}
          onSearch={handleSearch}
          className="flex-1"
        />
        <Button size="large" icon={<ReloadOutlined />} onClick={loadRandom}>Random</Button>
      </div>

      {loading ? <SkeletonGrid /> : (
        cards.length === 0 ? <Empty description="No cards found" /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {cards.map(c => (
              <div key={c.id} onClick={() => setSelected(c)}
                className="cursor-pointer rounded-xl overflow-hidden border border-gray-800 hover:border-gray-600 transition-all group hover:scale-[1.03] hover:shadow-lg hover:shadow-purple-900/20">
                <img src={c.image_uris?.normal || c.image_uris?.small} alt={c.name} loading="lazy"
                  className="w-full rounded-xl" />
              </div>
            ))}
          </div>
        )
      )}

      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button onClick={() => searchCards(search, page + 1)}>Load More</Button>
        </div>
      )}

      <Modal open={!!selected} onCancel={() => setSelected(null)} footer={null} width={500} centered destroyOnClose>
        {selected && (
          <div className="flex flex-col sm:flex-row gap-4">
            <img src={selected.image_uris?.large || selected.image_uris?.normal} alt={selected.name}
              className="w-full sm:w-56 rounded-lg shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold mb-1">{selected.name}</h3>
              <div className="flex flex-wrap gap-1 mb-2">
                <Tag color={RARITY_COLORS[selected.rarity] || 'default'} className="capitalize">{selected.rarity}</Tag>
                {selected.type_line && <Tag>{selected.type_line.split('—')[0].trim()}</Tag>}
              </div>
              {selected.mana_cost && <p className="text-gray-500 text-xs mb-1">Mana: {selected.mana_cost}</p>}
              {selected.oracle_text && <p className="text-gray-400 text-xs leading-relaxed mb-3">{selected.oracle_text}</p>}
              {selected.power && <p className="text-gray-500 text-xs">{selected.power}/{selected.toughness}</p>}
              {selected.set_name && <p className="text-gray-600 text-[10px] mt-2">{selected.set_name}</p>}
              <Button type="primary" size="small" icon={<DownloadOutlined />} className="mt-3"
                onClick={() => download(selected.image_uris?.large || selected.image_uris?.normal, selected.name)}>
                Download
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default MTGCards
