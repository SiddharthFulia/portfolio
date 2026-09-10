// Space Launches — upcoming rocket launches from The Space Devs' LL2
// API, proxied via /api/proxy/launches. Each card shows the mission,
// provider, rocket, pad, and a live T-minus countdown.
//
// Note: the BE proxy is hard-locked to the `upcoming` endpoint (see
// sid-be/services/nasa.js). Previous launches aren't reachable without
// a BE change, so this UI is upcoming-only.

import { useState, useEffect, useMemo } from 'react'
import { Tag, Modal, Descriptions, Input, Select } from 'antd'
import { RocketOutlined, SearchOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { Button } from '../ui'
import { LuxeLoader } from '../loaders'
import AnimatedCard from './AnimatedCard'
import { fetchLaunches } from '../../api/nasa'

const STATUS_COLORS = { 1: 'green', 2: 'orange', 3: 'blue', 4: 'red', 5: 'purple', 6: 'cyan' }

const formatDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// T-minus formatter: returns { text, isImminent } where imminent = <24h.
// Recomputed off a shared 1s tick so the string updates smoothly.
const countdownParts = (target, now) => {
  if (!target) return null
  const diff = new Date(target) - now
  if (diff < 0) return null
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins  = Math.floor((diff % 3600000) / 60000)
  const secs  = Math.floor((diff % 60000) / 1000)
  return {
    days, hours, mins, secs,
    text: days > 0
      ? `T-${days}d ${hours}h ${String(mins).padStart(2, '0')}m`
      : `T-${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
    isImminent: days === 0,
  }
}

const SpaceLaunches = () => {
  const [launches, setLaunches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [provider, setProvider] = useState(null)
  const [visible, setVisible] = useState(20)
  const [now, setNow] = useState(() => new Date())

  // 1Hz clock tick for countdowns — cheap even at 50 cards.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchLaunches({ limit: 50 }).then(({ data, error: err }) => {
      if (cancelled) return
      if (err) setError(err)
      else if (data?.results) setLaunches(data.results)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const providers = useMemo(() => {
    const names = new Set(launches.map(l => l.launch_service_provider?.name).filter(Boolean))
    return [...names].sort().map(n => ({ value: n, label: n }))
  }, [launches])

  const filtered = useMemo(() => {
    let list = launches
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(l =>
        l.name?.toLowerCase().includes(q) ||
        l.mission?.name?.toLowerCase().includes(q) ||
        l.rocket?.configuration?.full_name?.toLowerCase().includes(q)
      )
    }
    if (provider) list = list.filter(l => l.launch_service_provider?.name === provider)
    return list
  }, [launches, search, provider])

  const imminentCount = filtered.filter(l => {
    const c = countdownParts(l.net, now)
    return c?.isImminent
  }).length

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search rocket, mission, or provider..."
          prefix={<SearchOutlined className="text-gray-500" />}
          allowClear size="large"
          value={search}
          onChange={e => { setSearch(e.target.value); setVisible(20) }}
          className="flex-1"
        />
        <Select
          placeholder="All providers"
          allowClear size="large"
          value={provider}
          onChange={v => { setProvider(v); setVisible(20) }}
          options={providers}
          style={{ minWidth: 200 }}
        />
      </div>
      <p className="text-xs text-gray-500 -mt-3">
        Countdowns tick live. Cards flip to red once T-minus falls under 24 hours.
      </p>

      {/* Stats strip */}
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-gray-400">
          <RocketOutlined className="text-cyan-400" />
          {filtered.length} upcoming
        </span>
        {imminentCount > 0 && (
          <span className="flex items-center gap-1.5 text-rose-300">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            {imminentCount} within 24h
          </span>
        )}
        {error && <span className="text-rose-400 ml-auto">{error}</span>}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-14">
          <LuxeLoader variant="cosmos" size="lg" label="Fetching upcoming launches…" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-10 text-center">
          <p className="text-gray-400 text-sm">No launches match those filters.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {filtered.slice(0, visible).map(l => {
              const cd = countdownParts(l.net, now)
              const img = l.image?.image_url || (typeof l.image === 'string' ? l.image : null)
              return (
                <AnimatedCard key={l.id} tiltAmount={6} effect="fire" onClick={() => setSelected(l)}
                  className="cursor-pointer rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden hover:border-white/20 transition-colors flex">
                  {img && img.startsWith('http') && (
                    <img src={img} alt="" className="w-28 sm:w-40 h-28 sm:h-40 object-cover shrink-0" loading="lazy" />
                  )}
                  <div className="p-4 flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-white text-sm font-bold line-clamp-2 leading-tight">{l.name}</h3>
                      {cd && (
                        <span className={`shrink-0 px-2 py-0.5 text-[10px] font-mono font-bold rounded ${
                          cd.isImminent ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30' : 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/25'
                        }`}>{cd.text}</span>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs mb-2">{l.launch_service_provider?.name || '—'}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Tag color={STATUS_COLORS[l.status?.id] || 'default'} className="text-[10px] m-0">{l.status?.name || 'Unknown'}</Tag>
                      {l.pad?.location?.name && <Tag className="text-[10px] m-0">{l.pad.location.name}</Tag>}
                    </div>
                    <div className="text-gray-600 text-[10px] mt-2 flex items-center gap-1">
                      <ClockCircleOutlined /> {formatDate(l.net)}
                    </div>
                  </div>
                </AnimatedCard>
              )
            })}
          </div>

          {visible < filtered.length && (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" onClick={() => setVisible(v => v + 20)}>
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
        width={640}
        centered
        destroyOnClose
      >
        {selected && (
          <div>
            {(() => {
              const img = selected.image?.image_url || (typeof selected.image === 'string' ? selected.image : null)
              return img ? (
                <img src={img} alt="" className="w-full h-56 object-cover rounded-lg mb-4" />
              ) : null
            })()}
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-xl font-bold text-white">{selected.name}</h2>
              {(() => {
                const cd = countdownParts(selected.net, now)
                return cd ? (
                  <span className={`shrink-0 px-2 py-1 text-xs font-mono font-bold rounded ${
                    cd.isImminent ? 'bg-rose-500/20 text-rose-300' : 'bg-cyan-500/15 text-cyan-300'
                  }`}>{cd.text}</span>
                ) : null
              })()}
            </div>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Provider">{selected.launch_service_provider?.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Rocket">{selected.rocket?.configuration?.full_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Status">{selected.status?.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="NET">{formatDate(selected.net)}</Descriptions.Item>
              <Descriptions.Item label="Pad">{selected.pad?.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Location">{selected.pad?.location?.name || '—'}</Descriptions.Item>
              {selected.mission && (
                <Descriptions.Item label="Mission">
                  {selected.mission.name}{selected.mission.type ? ` — ${selected.mission.type}` : ''}
                </Descriptions.Item>
              )}
            </Descriptions>
            {selected.mission?.description && (
              <p className="text-gray-400 text-sm mt-4 leading-relaxed">{selected.mission.description}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default SpaceLaunches
