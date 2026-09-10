// Rick & Morty character browser.
//
// The Rick & Morty API paginates at 20 chars/page and returns
// `info.pages` for the total. We keep the classic pagination model
// because there are 826 characters and infinite scroll gets ugly on
// filtered result sets.

import { useState, useEffect, useCallback } from 'react'
import { Input, Tag, Modal, Descriptions, Select, Pagination } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { LuxeLoader } from '../loaders'
import AnimatedCard from './AnimatedCard'
import { fetchRickMorty } from '../../api/nasa'

const STATUS_COLORS = { Alive: 'green', Dead: 'red', unknown: 'default' }
const STATUS_DOT = {
  Alive: 'bg-emerald-500 shadow-emerald-500/50',
  Dead: 'bg-rose-500 shadow-rose-500/50',
  unknown: 'bg-gray-500 shadow-gray-500/50',
}

const RickMorty = () => {
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [speciesFilter, setSpeciesFilter] = useState('')

  const fetchData = useCallback(async (name, pg, status, species) => {
    setLoading(true)
    setError(null)
    const params = { page: pg }
    if (name.trim()) params.name = name.trim()
    if (status) params.status = status
    if (species) params.species = species
    const { data, error: err } = await fetchRickMorty(params)
    if (err) {
      setError(err)
      setCharacters([])
      setTotal(0)
    } else if (data?.results) {
      setCharacters(data.results)
      setTotal(data.info?.count || 0)
    } else {
      // API returns 404 when no matches; not a "real" error.
      setCharacters([])
      setTotal(0)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData(search, page, statusFilter, speciesFilter) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, statusFilter, speciesFilter])

  const handleSearch = (val) => { setPage(1); fetchData(val, 1, statusFilter, speciesFilter) }

  return (
    <div className="space-y-6">
      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input.Search
          placeholder="Search characters..."
          allowClear size="large"
          enterButton={<SearchOutlined />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onSearch={handleSearch}
          className="flex-1"
        />
        <Select
          placeholder="Status"
          allowClear size="large"
          value={statusFilter || undefined}
          onChange={v => { setStatusFilter(v || ''); setPage(1) }}
          style={{ minWidth: 140 }}
          options={[
            { value: 'alive', label: 'Alive' },
            { value: 'dead', label: 'Dead' },
            { value: 'unknown', label: 'Unknown' },
          ]}
        />
        <Select
          placeholder="Species"
          allowClear size="large"
          value={speciesFilter || undefined}
          onChange={v => { setSpeciesFilter(v || ''); setPage(1) }}
          style={{ minWidth: 160 }}
          options={[
            { value: 'human', label: 'Human' },
            { value: 'alien', label: 'Alien' },
            { value: 'humanoid', label: 'Humanoid' },
            { value: 'robot', label: 'Robot' },
            { value: 'animal', label: 'Animal' },
            { value: 'poopybutthole', label: 'Poopybutthole' },
          ]}
        />
      </div>
      <p className="text-xs text-gray-500 -mt-3">
        Filter by any combination of name, status, or species. Click a card for origin, location, and episode count.
      </p>

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">
          {total > 0 ? `${total} characters` : loading ? '' : 'No characters found'}
        </span>
        {error && <span className="text-rose-400">{error}</span>}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-14">
          <LuxeLoader variant="cosmos" size="lg" label="Loading characters…" />
        </div>
      ) : characters.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-10 text-center">
          <p className="text-gray-400 text-sm">No characters match those filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {characters.map(c => (
            <AnimatedCard
              key={c.id}
              effect={c.status === 'Alive' ? 'grass' : c.status === 'Dead' ? 'fire' : 'ghost'}
              onClick={() => setSelected(c)}
              className="cursor-pointer rounded-xl overflow-hidden border border-white/5 bg-white/[0.02] hover:border-white/20 transition-colors"
            >
              <div className="relative">
                <img src={c.image} alt={c.name} className="w-full aspect-square object-cover" loading="lazy" />
                <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/70 backdrop-blur">
                  <span className={`inline-block w-2 h-2 rounded-full shadow-sm ${STATUS_DOT[c.status] || STATUS_DOT.unknown}`} />
                  <span className="text-white text-[10px] font-semibold">{c.status}</span>
                </div>
              </div>
              <div className="p-3">
                <p className="text-white text-sm font-semibold line-clamp-1">{c.name}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <Tag color="blue" className="text-[10px] m-0">{c.species}</Tag>
                  {c.type && <Tag className="text-[10px] m-0">{c.type}</Tag>}
                </div>
              </div>
            </AnimatedCard>
          ))}
        </div>
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
        width={520}
        centered
        destroyOnClose
      >
        {selected && (
          <div className="flex flex-col items-center">
            <img src={selected.image} alt={selected.name} className="w-full max-w-[280px] rounded-xl mb-4 ring-1 ring-white/10" />
            <h2 className="text-xl font-bold text-white mb-2">{selected.name}</h2>
            <div className="flex gap-2 mb-4 flex-wrap justify-center">
              <Tag color={STATUS_COLORS[selected.status]}>{selected.status}</Tag>
              <Tag color="blue">{selected.species}</Tag>
              {selected.gender && <Tag>{selected.gender}</Tag>}
              {selected.type && <Tag>{selected.type}</Tag>}
            </div>
            <Descriptions column={1} size="small" bordered className="w-full">
              <Descriptions.Item label="Origin">{selected.origin?.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Location">{selected.location?.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Episodes">{selected.episode?.length} appearances</Descriptions.Item>
              <Descriptions.Item label="First seen">
                {selected.episode?.[0] ? `Episode ${selected.episode[0].split('/').pop()}` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Created">
                {selected.created ? new Date(selected.created).toLocaleDateString() : '—'}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default RickMorty
