import { useState, useEffect, useCallback } from 'react'
import { Input, Pagination, Modal, Empty, Descriptions, Tag } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { fetchArtworks } from '../../api/nasa'

const IIIF = 'https://www.artic.edu/iiif/2'
const imgUrl = (id, w = 843) => `${IIIF}/${id}/full/${w},/0/default.jpg`

const SUGGESTIONS = ['painting', 'impressionism', 'monet', 'van gogh', 'landscape', 'portrait', 'sculpture', 'abstract', 'japanese', 'renaissance', 'picasso', 'watercolor']

const SkeletonGrid = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {[...Array(9)].map((_, i) => (
      <div key={i} className="animate-pulse rounded-xl overflow-hidden border border-gray-800">
        <div className="bg-gray-800 h-48 sm:h-56" />
        <div className="p-3 space-y-2"><div className="bg-gray-800 h-3 w-3/4 rounded" /><div className="bg-gray-800 h-2 w-1/2 rounded" /></div>
      </div>
    ))}
  </div>
)

const ArtGallery = () => {
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('painting')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState(null)

  const fetchData = useCallback(async (q, pg) => {
    setLoading(true)
    const params = { page: pg, limit: 24, q: q.trim() || 'painting' }
    const { data } = await fetchArtworks(params)
    if (data?.data) {
      setArtworks(data.data.filter(a => a.image_id))
      setTotal(data.pagination?.total || 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData(search, page) }, [page])

  const handleSearch = (val) => { setPage(1); fetchData(val, 1) }
  const handleTag = (tag) => { setSearch(tag); setPage(1); fetchData(tag, 1) }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <Input.Search
          placeholder="Search artworks..."
          allowClear
          size="large"
          enterButton={<SearchOutlined />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onSearch={handleSearch}
          className="flex-1"
        />
      </div>

      {/* Quick tags */}
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map(s => (
          <Tag key={s} className="cursor-pointer capitalize" color={search === s ? 'cyan' : 'default'}
            onClick={() => handleTag(s)}>{s}</Tag>
        ))}
      </div>

      {total > 0 && <div className="text-xs text-gray-500">{total.toLocaleString()} artworks found</div>}

      {loading ? <SkeletonGrid /> : (
        artworks.length === 0 ? (
          <Empty description="No artworks found" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {artworks.map(art => (
              <div key={art.id} onClick={() => setSelected(art)}
                className="cursor-pointer group rounded-xl overflow-hidden border border-gray-800 bg-gray-900 hover:border-gray-600 transition-colors">
                <img src={imgUrl(art.image_id, 400)} alt={art.title} loading="lazy"
                  className="w-full h-48 sm:h-56 object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="p-3">
                  <h3 className="text-white text-sm font-semibold line-clamp-1">{art.title}</h3>
                  <p className="text-gray-500 text-xs line-clamp-1 mt-0.5">{art.artist_display}</p>
                  {art.date_display && <p className="text-gray-600 text-[10px] mt-0.5">{art.date_display}</p>}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {total > 24 && (
        <div className="flex justify-center">
          <Pagination current={page} total={total} pageSize={24} onChange={p => setPage(p)} showSizeChanger={false} />
        </div>
      )}

      <Modal open={!!selected} onCancel={() => setSelected(null)} footer={null} width={720} centered destroyOnClose>
        {selected && (
          <>
            <img src={imgUrl(selected.image_id, 1200)} alt={selected.title} className="w-full max-h-[55vh] object-contain bg-black rounded-lg mb-4" />
            <h2 className="text-xl font-bold mb-1">{selected.title}</h2>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Artist">{selected.artist_display}</Descriptions.Item>
              {selected.date_display && <Descriptions.Item label="Date">{selected.date_display}</Descriptions.Item>}
              {selected.medium_display && <Descriptions.Item label="Medium">{selected.medium_display}</Descriptions.Item>}
              {selected.dimensions && <Descriptions.Item label="Dimensions">{selected.dimensions}</Descriptions.Item>}
            </Descriptions>
          </>
        )}
      </Modal>
    </div>
  )
}

export default ArtGallery
