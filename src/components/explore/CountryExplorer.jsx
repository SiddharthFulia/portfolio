import { useState, useEffect, useMemo } from 'react'
import { Input, Select, Tag, Modal, Descriptions, Statistic, Empty } from 'antd'
import { SearchOutlined, GlobalOutlined } from '@ant-design/icons'
import { fetchCountries } from '../../api/nasa'

const REGIONS = ['All', 'Africa', 'Americas', 'Asia', 'Europe', 'Oceania']

const SkeletonGrid = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
    {[...Array(20)].map((_, i) => (
      <div key={i} className="animate-pulse rounded-xl border border-gray-800 p-3 space-y-2">
        <div className="bg-gray-800 w-10 h-7 rounded" />
        <div className="bg-gray-800 h-3 w-3/4 rounded" />
        <div className="bg-gray-800 h-2 w-1/2 rounded" />
      </div>
    ))}
  </div>
)

const formatPop = (n) => {
  if (!n) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return n.toLocaleString()
}

const CountryExplorer = () => {
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('All')
  const [sortBy, setSortBy] = useState('name')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetchCountries().then(({ data }) => {
      if (Array.isArray(data)) setCountries(data)
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    let list = [...countries]
    if (region !== 'All') list = list.filter(c => c.region === region)
    if (search) list = list.filter(c => c.name?.common?.toLowerCase().includes(search.toLowerCase()))
    list.sort((a, b) => {
      if (sortBy === 'population') return (b.population || 0) - (a.population || 0)
      if (sortBy === 'area') return (b.area || 0) - (a.area || 0)
      return (a.name?.common || '').localeCompare(b.name?.common || '')
    })
    return list
  }, [countries, search, region, sortBy])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <Input placeholder="Search countries..." prefix={<SearchOutlined />} allowClear size="large"
          value={search} onChange={e => setSearch(e.target.value)} className="flex-1" />
        <Select value={region} onChange={setRegion} size="large" style={{ width: 140 }}
          options={REGIONS.map(r => ({ value: r, label: r }))} />
        <Select value={sortBy} onChange={setSortBy} size="large" style={{ width: 160 }}
          options={[{ value: 'name', label: 'Sort: Name' }, { value: 'population', label: 'Sort: Population' }, { value: 'area', label: 'Sort: Area' }]} />
      </div>

      <div className="text-xs text-gray-500">{filtered.length} countries</div>

      {loading ? <SkeletonGrid /> : (
        filtered.length === 0 ? <Empty /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.slice(0, 60).map(c => (
              <div key={c.name?.common} onClick={() => setSelected(c)}
                className="cursor-pointer rounded-xl border border-gray-800 bg-gray-900 p-3 hover:border-gray-600 transition-colors">
                {c.flags?.png && <img src={c.flags.png} alt="" className="w-10 h-7 object-cover rounded mb-2" loading="lazy" />}
                <h3 className="text-white text-xs font-semibold line-clamp-1">{c.name?.common}</h3>
                <div className="text-gray-500 text-[10px] mt-0.5">{c.capital?.[0] || '—'}</div>
                <div className="text-cyan-400 text-[10px] font-mono">{formatPop(c.population)}</div>
              </div>
            ))}
          </div>
        )
      )}

      <Modal open={!!selected} onCancel={() => setSelected(null)} footer={null} width={500} centered destroyOnClose>
        {selected && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              {selected.flags?.png && <img src={selected.flags.png} alt="" className="w-16 h-11 object-cover rounded" />}
              <div>
                <h2 className="text-xl font-bold">{selected.name?.common}</h2>
                <p className="text-gray-500 text-xs">{selected.name?.official}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Statistic title="Population" value={selected.population || 0} valueStyle={{ fontSize: 16 }} />
              <Statistic title="Area" value={selected.area ? `${selected.area.toLocaleString()} km²` : '—'} valueStyle={{ fontSize: 14 }} />
              <Statistic title="Region" value={selected.region || '—'} valueStyle={{ fontSize: 14 }} />
            </div>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Capital">{selected.capital?.[0] || '—'}</Descriptions.Item>
              <Descriptions.Item label="Subregion">{selected.subregion || '—'}</Descriptions.Item>
              <Descriptions.Item label="Languages">{selected.languages ? Object.values(selected.languages).join(', ') : '—'}</Descriptions.Item>
              <Descriptions.Item label="Currencies">{selected.currencies ? Object.values(selected.currencies).map(c => `${c.name} (${c.symbol || ''})`).join(', ') : '—'}</Descriptions.Item>
              <Descriptions.Item label="Timezones">{selected.timezones?.slice(0, 3).join(', ') || '—'}</Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default CountryExplorer
