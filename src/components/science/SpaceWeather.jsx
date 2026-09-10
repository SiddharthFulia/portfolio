// SpaceWeather — DONKI solar activity feeds for the last 30 days.
//
// Composition:
//   1. Hero strip
//   2. Telemetry — flare / storm / CME counts + strongest event
//   3. Tabs — Solar Flares · Geomagnetic Storms · Coronal Mass Ejections
//   4. SVG timeline chart under the active tab (30-day density)
//   5. Card list of the top events for the active tab

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { fetchFlares, fetchStorms, fetchCMEs, daysAgo, todayStr } from '../../api/nasa'
import { LuxeLoader } from '../loaders'
import { ModuleHero, StatCard, SectionHeader, FilterChips, FriendlyError } from './ModuleShell'

/* ── Severity buckets ── */
const severityFromFlare = (c = '') => {
  const u = c.toUpperCase()
  if (u.startsWith('X')) return { level: 3, label: 'Severe',  color: '#ef4444' }
  if (u.startsWith('M')) return { level: 2, label: 'Strong',  color: '#f97316' }
  if (u.startsWith('C')) return { level: 1, label: 'Moderate', color: '#eab308' }
  return { level: 0, label: 'Minor', color: '#22d3ee' }
}
const severityFromKp = (kp) => {
  const n = parseFloat(kp) || 0
  if (n >= 8) return { level: 3, label: 'G4/G5', color: '#ef4444' }
  if (n >= 6) return { level: 2, label: 'G2/G3', color: '#f97316' }
  if (n >= 5) return { level: 1, label: 'G1',    color: '#eab308' }
  return { level: 0, label: 'Quiet', color: '#22d3ee' }
}
const severityFromCmeSpeed = (spd) => {
  const s = parseFloat(spd) || 0
  if (s >= 1500) return { level: 3, label: 'Fast', color: '#ef4444' }
  if (s >= 800)  return { level: 2, label: 'Moderate', color: '#f97316' }
  if (s >= 400)  return { level: 1, label: 'Slow', color: '#eab308' }
  return { level: 0, label: 'Gentle', color: '#22d3ee' }
}

/* ── 30-day timeline chart (SVG) ── */
const Timeline = ({ events, accent }) => {
  const days = 30
  const now = Date.now()

  // Bucket events by day-index (0 = 30 days ago, 29 = today)
  const buckets = useMemo(() => {
    const b = Array(days).fill(0)
    events.forEach(ev => {
      const t = new Date(ev.date).getTime()
      const idx = days - 1 - Math.floor((now - t) / 86_400_000)
      if (idx >= 0 && idx < days) b[idx]++
    })
    return b
  }, [events, now])

  const max = Math.max(...buckets, 1)
  const W = 800, H = 120, PAD = 12
  const barW = (W - PAD * 2) / days

  return (
    <div className="luxe-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">30-day cadence</div>
        <div className="text-[10px] text-gray-600 font-mono">{events.length} events</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24 sm:h-32">
        {/* Baseline */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#1f2937" strokeWidth="1" />
        {/* Bars */}
        {buckets.map((count, i) => {
          const barH = (count / max) * (H - PAD * 2)
          const x = PAD + i * barW
          const y = H - PAD - barH
          return (
            <rect
              key={i}
              x={x + 1} y={y}
              width={Math.max(1, barW - 2)}
              height={barH}
              fill={accent}
              opacity={count > 0 ? 0.85 : 0.15}
              rx={1}
            />
          )
        })}
        {/* Today marker */}
        <line x1={W - PAD - barW / 2} y1={PAD} x2={W - PAD - barW / 2} y2={H - PAD} stroke={accent} strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />
      </svg>
      <div className="flex items-center justify-between mt-1 text-[10px] text-gray-600 font-mono">
        <span>30 d ago</span>
        <span>today</span>
      </div>
    </div>
  )
}

/* ── Event card ── */
const EventCard = ({ event, type }) => {
  let title, meta, sev, timeStr
  const rawDate = event.beginTime || event.startTime || event.startDate || event.date
  timeStr = rawDate ? new Date(rawDate).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  if (type === 'flare') {
    title = `Solar flare ${event.classType || ''}`.trim()
    meta = `Source region: ${event.sourceLocation || 'unknown'}`
    sev = severityFromFlare(event.classType)
  } else if (type === 'storm') {
    const kp = event.allKpIndex?.[0]?.kpIndex
    title = 'Geomagnetic storm'
    meta = `Kp index ${kp ?? '?'}`
    sev = severityFromKp(kp)
  } else {
    const spd = event.cmeAnalyses?.[0]?.speed
    title = 'Coronal mass ejection'
    meta = `Speed ${spd ? Math.round(spd) + ' km/s' : 'unknown'}`
    sev = severityFromCmeSpeed(spd)
  }

  return (
    <div className="luxe-card p-4 hover:border-cyan-500/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sev.color, boxShadow: `0 0 6px ${sev.color}` }} />
            <p className="text-white text-sm font-semibold truncate">{title}</p>
          </div>
          <p className="text-gray-500 text-xs mt-0.5">{meta}</p>
          <p className="text-gray-600 text-[10px] font-mono mt-1">{timeStr}</p>
        </div>
        <span
          className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
          style={{ color: sev.color, backgroundColor: sev.color + '20', borderColor: sev.color + '60' }}
        >
          {sev.label}
        </span>
      </div>
    </div>
  )
}

const SpaceWeather = () => {
  const [flares, setFlares] = useState([])
  const [storms, setStorms] = useState([])
  const [cmes, setCmes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('flares')
  const [updated, setUpdated] = useState(null)
  const abortRef = useRef(null)

  const fetchAll = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)

    const startDate = daysAgo(30)
    const endDate = todayStr()
    const opts = { signal: controller.signal }

    const [f, s, c] = await Promise.all([
      fetchFlares({ startDate, endDate }, opts),
      fetchStorms({ startDate, endDate }, opts),
      fetchCMEs({ startDate, endDate }, opts),
    ])

    if (f.error && s.error && c.error) {
      setError(f.error || s.error || c.error)
    } else {
      if (Array.isArray(f.data)) setFlares(f.data)
      if (Array.isArray(s.data)) setStorms(s.data)
      if (Array.isArray(c.data)) setCmes(c.data)
    }
    setUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    return () => { if (abortRef.current) abortRef.current.abort() }
  }, [fetchAll])

  // Normalise each event set to have a `date` field
  const flaresD = useMemo(() => flares.map(f => ({ ...f, date: f.beginTime })), [flares])
  const stormsD = useMemo(() => storms.map(s => ({ ...s, date: s.startTime })), [storms])
  const cmesD   = useMemo(() => cmes.map(c => ({ ...c, date: c.startTime || (c.activityID?.slice(0, 19)) })), [cmes])

  const severeFlares = useMemo(
    () => flares.filter(f => /^[MX]/i.test(f.classType || '')).length,
    [flares]
  )

  const activeEvents = tab === 'flares' ? flaresD : tab === 'storms' ? stormsD : cmesD
  const activeAccent = tab === 'flares' ? '#f97316' : tab === 'storms' ? '#a855f7' : '#22d3ee'

  const sortedEvents = useMemo(() => {
    return [...activeEvents].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [activeEvents])

  return (
    <div className="space-y-6 sm:space-y-8">
      <ModuleHero
        eyebrow="DONKI · NASA feed"
        title="Space Weather"
        subtitle="Thirty days of the Sun-Earth interaction — solar flares, geomagnetic storms, and coronal mass ejections. Sourced from NASA's DONKI notification database."
        updated={updated}
        accent="yellow"
      />

      {/* Telemetry */}
      <div>
        <SectionHeader>Live telemetry</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard tone="orange" label="Solar flares" value={flares.length} ctx={`${severeFlares} severe (M/X)`} loading={loading} />
          <StatCard tone="violet" label="Geomag storms" value={storms.length} ctx="last 30 days" loading={loading} />
          <StatCard tone="cyan"   label="CMEs"          value={cmes.length}   ctx="Sun ejecta detected" loading={loading} />
          <StatCard tone="yellow" label="Total events"  value={flares.length + storms.length + cmes.length} ctx="all three feeds" loading={loading} />
        </div>
      </div>

      <FriendlyError error={error} onRetry={fetchAll} />

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <LuxeLoader variant="cosmos" size="lg" label="reading the Sun…" />
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div>
            <SectionHeader>Feed selector</SectionHeader>
            <FilterChips
              options={[
                { key: 'flares', label: 'Solar Flares',        count: flares.length },
                { key: 'storms', label: 'Geomagnetic Storms',  count: storms.length },
                { key: 'cmes',   label: 'Coronal Mass Ejections', count: cmes.length },
              ]}
              value={tab}
              onChange={setTab}
            />
            <p className="text-[10px] text-gray-600 mt-2 font-mono">tip: pick a feed to see its 30-day cadence and top events</p>
          </div>

          {/* Timeline */}
          <Timeline events={activeEvents} accent={activeAccent} />

          {/* Event list */}
          <div>
            <SectionHeader>Latest events</SectionHeader>
            {sortedEvents.length === 0 ? (
              <div className="luxe-card p-6 text-center">
                <p className="text-gray-300 font-semibold mb-1">Quiet Sun</p>
                <p className="text-gray-500 text-sm">No {tab === 'flares' ? 'flares' : tab === 'storms' ? 'storms' : 'CMEs'} recorded in the last 30 days.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sortedEvents.slice(0, 30).map((ev, i) => (
                  <EventCard key={`${tab}-${i}`} event={ev} type={tab === 'flares' ? 'flare' : tab === 'storms' ? 'storm' : 'cme'} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default SpaceWeather
