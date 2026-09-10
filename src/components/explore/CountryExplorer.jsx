// Country Explorer — 250 countries: flag, capital, population, area,
// languages, currencies, region, neighbours.
//
// Fix history: the old BE proxy at /api/proxy/countries called the
// restcountries.com/v3.1/all endpoint, which was fully deprecated in
// mid-2026 (returns a "please migrate to v5" error for every request).
// The public v5 requires an API key. We switched to the mledoze dataset
// mirrored on jsDelivr, which is CORS-enabled, free, cached 7d at the
// edge, and ships the same shape we need (name, cca2, cca3, capital,
// population, area, region, subregion, languages, currencies, borders).
//
// Flags: mledoze doesn't ship image URLs, so we use flagcdn.com/w160/{cca2}.png
// — a static CDN with SVG + PNG in every ratio. Emoji flag is also
// available on each country and shown as a fallback in the card.

import { useState, useEffect, useMemo } from 'react'
import { Input, Select, Tag, Modal, Descriptions, Statistic, Segmented } from 'antd'
import { SearchOutlined, GlobalOutlined } from '@ant-design/icons'
import { Button } from '../ui'
import { LuxeLoader } from '../loaders'
import AnimatedCard from './AnimatedCard'
import { fetchCountries } from '../../api/nasa'

const REGIONS = ['All', 'Africa', 'Americas', 'Asia', 'Europe', 'Oceania']

// jsDelivr mirror of mledoze/countries — same shape as restcountries v3
// minus a couple of fields (flag URLs, which we compute from cca2).
const MLEDOZE_URL = 'https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json'

const formatPop = (n) => {
  if (!n) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return n.toLocaleString()
}

// Normalise both restcountries v3 and mledoze schemas into the shape
// the UI expects. Both use `name.common`, `region`, `population`,
// `languages` (object of code → name), `currencies` (object of code →
// {name, symbol}). mledoze doesn't have `flags.png` — synthesize it.
const normalise = (raw) => {
  if (!Array.isArray(raw)) return []
  return raw.map(c => {
    const cca2 = c.cca2?.toLowerCase() || null
    return {
      cca2: c.cca2,
      cca3: c.cca3,
      name: c.name,
      flags: c.flags || (cca2 ? {
        png: `https://flagcdn.com/w160/${cca2}.png`,
        svg: `https://flagcdn.com/${cca2}.svg`,
      } : null),
      flagEmoji: c.flag,
      capital: c.capital,
      population: c.population,
      area: c.area,
      region: c.region,
      subregion: c.subregion,
      languages: c.languages,
      currencies: c.currencies,
      timezones: c.timezones,
      borders: c.borders,
      cca2Upper: c.cca2,
    }
  })
}

const CountryExplorer = () => {
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('All')
  const [sortBy, setSortBy] = useState('name')
  const [selected, setSelected] = useState(null)
  const [visible, setVisible] = useState(60)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)

      // Try the BE proxy first; if it returns the deprecation error (or
      // any non-array), fall back to the mledoze dataset on jsDelivr.
      let list = null
      try {
        const { data } = await fetchCountries()
        if (Array.isArray(data) && data.length > 0) list = data
      } catch {}

      if (!list) {
        try {
          const res = await fetch(MLEDOZE_URL, { headers: { Accept: 'application/json' } })
          if (res.ok) list = await res.json()
        } catch (e) {
          if (!cancelled) setError('Could not load country data')
        }
      }
      if (cancelled) return
      setCountries(normalise(list || []))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    let list = [...countries]
    if (region !== 'All') list = list.filter(c => c.region === region)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.name?.common?.toLowerCase().includes(q) ||
        c.name?.official?.toLowerCase().includes(q) ||
        c.capital?.[0]?.toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      if (sortBy === 'population') return (b.population || 0) - (a.population || 0)
      if (sortBy === 'area') return (b.area || 0) - (a.area || 0)
      return (a.name?.common || '').localeCompare(b.name?.common || '')
    })
    return list
  }, [countries, search, region, sortBy])

  // Neighbour lookup (cca3 → country) for the detail modal.
  const byCca3 = useMemo(() => {
    const m = new Map()
    countries.forEach(c => { if (c.cca3) m.set(c.cca3, c) })
    return m
  }, [countries])

  const neighbours = selected?.borders?.map(code => byCca3.get(code)).filter(Boolean) || []

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search by name or capital..."
          prefix={<SearchOutlined className="text-gray-500" />}
          allowClear size="large"
          value={search}
          onChange={e => { setSearch(e.target.value); setVisible(60) }}
          className="flex-1"
        />
        <Select
          value={region}
          onChange={v => { setRegion(v); setVisible(60) }}
          size="large" style={{ minWidth: 140 }}
          options={REGIONS.map(r => ({ value: r, label: r }))}
        />
        <Select
          value={sortBy}
          onChange={v => { setSortBy(v); setVisible(60) }}
          size="large" style={{ minWidth: 170 }}
          options={[
            { value: 'name', label: 'Sort · A → Z' },
            { value: 'population', label: 'Sort · Population' },
            { value: 'area', label: 'Sort · Area' },
          ]}
        />
      </div>
      <p className="text-xs text-gray-500 -mt-3">
        Filter across country name, official name, or capital. Click any card for full details and neighbours.
      </p>

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">
          <GlobalOutlined className="mr-1.5" />
          {filtered.length} of {countries.length} countries
        </span>
        {error && <span className="text-rose-400">{error}</span>}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <LuxeLoader variant="cosmos" size="lg" label="Loading world atlas…" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-10 text-center">
          <p className="text-gray-400 text-sm">No countries match that filter.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.slice(0, visible).map(c => (
              <AnimatedCard key={c.cca3 || c.name?.common} tiltAmount={8} onClick={() => setSelected(c)}
                className="cursor-pointer rounded-xl border border-white/5 bg-white/[0.02] p-3 hover:border-white/20 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  {c.flags?.png ? (
                    <img src={c.flags.png} alt="" className="w-10 h-7 object-cover rounded ring-1 ring-white/10" loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  ) : (
                    <span className="text-2xl">{c.flagEmoji || '🏳️'}</span>
                  )}
                  <span className="text-white text-xs font-bold line-clamp-2 leading-tight">{c.name?.common}</span>
                </div>
                <div className="text-gray-500 text-[10px]">{c.capital?.[0] || '—'}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-cyan-400 text-[10px] font-mono">{formatPop(c.population)}</span>
                  <Tag className="text-[9px] m-0 !py-0" color="default">{c.region}</Tag>
                </div>
              </AnimatedCard>
            ))}
          </div>

          {visible < filtered.length && (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" onClick={() => setVisible(v => v + 60)}>
                Show more ({filtered.length - visible} remaining)
              </Button>
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      <Modal
        open={!!selected}
        onCancel={() => setSelected(null)}
        footer={null}
        width={560}
        centered
        destroyOnClose
      >
        {selected && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              {selected.flags?.png ? (
                <img src={selected.flags.png} alt="" className="w-20 h-14 object-cover rounded ring-1 ring-white/10" />
              ) : (
                <span className="text-4xl">{selected.flagEmoji || '🏳️'}</span>
              )}
              <div>
                <h2 className="text-xl font-bold text-white">{selected.name?.common}</h2>
                <p className="text-gray-500 text-xs">{selected.name?.official}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Statistic title={<span className="text-gray-500 text-[11px]">Population</span>}
                value={selected.population || 0} valueStyle={{ fontSize: 16, color: '#fff' }} />
              <Statistic title={<span className="text-gray-500 text-[11px]">Area</span>}
                value={selected.area ? `${Math.round(selected.area).toLocaleString()} km²` : '—'}
                valueStyle={{ fontSize: 14, color: '#fff' }} />
              <Statistic title={<span className="text-gray-500 text-[11px]">Region</span>}
                value={selected.region || '—'} valueStyle={{ fontSize: 14, color: '#fff' }} />
            </div>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Capital">{selected.capital?.[0] || '—'}</Descriptions.Item>
              <Descriptions.Item label="Subregion">{selected.subregion || '—'}</Descriptions.Item>
              <Descriptions.Item label="Languages">
                {selected.languages ? Object.values(selected.languages).join(', ') : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Currencies">
                {selected.currencies
                  ? Object.values(selected.currencies).map(cc => `${cc.name}${cc.symbol ? ` (${cc.symbol})` : ''}`).join(', ')
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Timezones">
                {selected.timezones?.slice(0, 3).join(', ') || '—'}
                {selected.timezones?.length > 3 && ` +${selected.timezones.length - 3} more`}
              </Descriptions.Item>
              <Descriptions.Item label="Code">{selected.cca3}</Descriptions.Item>
            </Descriptions>

            {neighbours.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-gray-400 mb-2">NEIGHBOURS</h4>
                <div className="flex flex-wrap gap-1.5">
                  {neighbours.map(n => (
                    <button key={n.cca3}
                      onClick={() => setSelected(n)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded border border-white/10 hover:border-amber-500/50 hover:bg-amber-500/5 transition-colors">
                      {n.flags?.png && <img src={n.flags.png} alt="" className="w-4 h-3 object-cover rounded-sm" />}
                      <span className="text-xs text-white">{n.name?.common}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default CountryExplorer
