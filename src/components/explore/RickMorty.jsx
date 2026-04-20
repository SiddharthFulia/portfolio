import { useState, useEffect, useCallback } from 'react'
import { Input, Card, Tag, Badge, Pagination, Modal, Descriptions, Empty, Select } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { fetchRickMorty } from '../../api/nasa'

const STATUS_COLORS = { Alive: 'green', Dead: 'red', unknown: 'default' }
const STATUS_DOTS = { Alive: 'bg-green-500', Dead: 'bg-red-500', unknown: 'bg-gray-500' }

const SkeletonGrid = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
    {[...Array(12)].map((_, i) => (
      <div key={i} className="animate-pulse rounded-xl overflow-hidden border border-gray-800">
        <div className="bg-gray-800 aspect-square" />
        <div className="p-3 space-y-2"><div className="bg-gray-800 h-3 w-2/3 rounded" /><div className="bg-gray-800 h-2 w-1/2 rounded" /></div>
      </div>
    ))}
  </div>
)

const RickMorty = () => {
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')

  const fetchData = useCallback(async (name, pg, status) => {
    setLoading(true)
    const params = { page: pg }
    if (name.trim()) params.name = name.trim()
    if (status) params.status = status
    const { data } = await fetchRickMorty(params)
    if (data?.results) {
      setCharacters(data.results)
      setTotal(data.info?.count || 0)
    } else {
      setCharacters([])
      setTotal(0)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData(search, page, statusFilter) }, [page])

  const handleSearch = (val) => { setPage(1); fetchData(val, 1, statusFilter) }
  const handleStatusChange = (val) => { setStatusFilter(val); setPage(1); fetchData(search, 1, val) }

  return (
    <div className="space-y-6">
      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input.Search
          placeholder="Search characters..."
          allowClear
          size="large"
          enterButton={<SearchOutlined />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onSearch={handleSearch}
          className="flex-1"
          styles={{ input: { background: '#1f2937', color: '#fff', border: '1px solid #374151' } }}
        />
        <Select
          placeholder="Status"
          allowClear
          size="large"
          value={statusFilter || undefined}
          onChange={handleStatusChange}
          style={{ width: 140 }}
          options={[
            { value: 'alive', label: 'Alive' },
            { value: 'dead', label: 'Dead' },
            { value: 'unknown', label: 'Unknown' },
          ]}
        />
      </div>

      {total > 0 && <div className="text-xs text-gray-500">{total} characters found</div>}

      {/* Grid */}
      {loading ? <SkeletonGrid /> : (
        characters.length === 0 ? (
          <Empty description={<span className="text-gray-500">No characters found</span>} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {characters.map(c => (
              <Card
                key={c.id}
                hoverable
                onClick={() => setSelected(c)}
                className="bg-gray-900 border-gray-800 overflow-hidden"
                styles={{ body: { padding: 12 } }}
                cover={
                  <div className="relative">
                    <img src={c.image} alt={c.name} className="w-full aspect-square object-cover" loading="lazy" />
                    <Badge
                      count={c.status}
                      color={STATUS_COLORS[c.status]}
                      className="absolute top-2 right-2"
                    />
                  </div>
                }
              >
                <Card.Meta
                  title={<span className="text-white text-sm">{c.name}</span>}
                  description={
                    <div className="flex items-center gap-2 mt-1">
                      <Tag color="blue" className="text-[10px] m-0">{c.species}</Tag>
                      {c.type && <Tag className="text-[10px] m-0">{c.type}</Tag>}
                    </div>
                  }
                />
              </Card>
            ))}
          </div>
        )
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center">
          <Pagination
            current={page}
            total={total}
            pageSize={20}
            onChange={p => setPage(p)}
            showSizeChanger={false}
            showTotal={(t) => `${t} total`}
          />
        </div>
      )}

      {/* Detail modal */}
      <Modal
        open={!!selected}
        onCancel={() => setSelected(null)}
        footer={null}
        width={480}
        centered
        className="dark-modal"
      >
        {selected && (
          <div className="flex flex-col items-center">
            <img src={selected.image} alt={selected.name} className="w-full max-w-[280px] rounded-xl mb-4" />
            <h2 className="text-xl font-bold mb-2">{selected.name}</h2>
            <div className="flex gap-2 mb-4">
              <Tag color={STATUS_COLORS[selected.status]}>{selected.status}</Tag>
              <Tag color="blue">{selected.species}</Tag>
              <Tag>{selected.gender}</Tag>
            </div>
            <Descriptions column={1} size="small" className="w-full" bordered>
              <Descriptions.Item label="Origin">{selected.origin?.name}</Descriptions.Item>
              <Descriptions.Item label="Location">{selected.location?.name}</Descriptions.Item>
              <Descriptions.Item label="Episodes">{selected.episode?.length} episodes</Descriptions.Item>
              {selected.type && <Descriptions.Item label="Type">{selected.type}</Descriptions.Item>}
              <Descriptions.Item label="Created">{new Date(selected.created).toLocaleDateString()}</Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default RickMorty
