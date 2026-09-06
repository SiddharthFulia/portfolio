// Cosmos — the NASA hub landing page.
//
// Composition (mirrors the Chernobyl / Atoms / OsintHub playbook):
//   1. Hero strip           — gradient title + eyebrow + subtitle + live pill
//   2. Live telemetry row   — 6 cards, polled every 30 s from NASA / open-notify
//   3. Category chips       — All · Imagery · Space Weather · Objects · Missions
//   4. Module grid          — 11 cards with distinct accent, icon, description,
//                             a Live / Catalog pill, and an on-hover preview
//                             (APOD thumb, EPIC frame, ISS coords, etc.)
//   5. Stats footer         — proxied API count, cache TTL, archive size
//
// All existing /science/:module sub-routes still work — module ids are
// preserved (apod, asteroids, weather, earth, epic, media, imagery, mars,
// tech, fireballs, satellites).

import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAPOD, fetchISS as fetchISSPosition, fetchAstros, fetchAsteroids,
  fetchFlares, fetchEPIC, todayStr, daysAgo, formatDistance,
} from '../api/nasa'

/* ── Category chips ── */
const CATEGORIES = [
  { key: 'all',      label: 'All' },
  { key: 'imagery',  label: 'Imagery' },
  { key: 'weather',  label: 'Space Weather' },
  { key: 'objects',  label: 'Objects' },
  { key: 'missions', label: 'Missions' },
]

/* ── Module registry ──
 * `cat` maps to a chip. `live` = realtime data feed; false = static catalog.
 * `accent` is one Tailwind hue used for the accent bar, icon glow, and pill. */
const MODULES = [
  { id: 'apod',       label: 'Picture of the Day',  api: 'APOD',         desc: 'Daily astronomy image with full expert context.',                cat: 'imagery',  accent: 'amber',   live: true  },
  { id: 'epic',       label: 'EPIC Earth Camera',    api: 'EPIC',         desc: 'Daily full-disk Earth photos from DSCOVR at L1, 1.5 M km out.',  cat: 'imagery',  accent: 'cyan',    live: true  },
  { id: 'imagery',    label: 'Earth Imagery',         api: 'Landsat',      desc: 'Landsat 8 satellite crops of any lat / lng on the planet.',      cat: 'imagery',  accent: 'emerald', live: false },
  { id: 'media',      label: 'Media Library',        api: 'Images',       desc: 'Search millions of NASA-catalogued images, videos & audio.',    cat: 'imagery',  accent: 'blue',    live: false },
  { id: 'weather',    label: 'Space Weather',        api: 'DONKI',        desc: 'Solar flares, geomagnetic storms & CMEs (last 30 days).',       cat: 'weather',  accent: 'yellow',  live: true  },
  { id: 'earth',      label: 'Earth Events',         api: 'EONET',        desc: 'Live wildfires, volcanoes, storms tracked from orbit.',         cat: 'weather',  accent: 'lime',    live: true  },
  { id: 'asteroids',  label: 'Asteroid Tracker',     api: 'NeoWs',        desc: 'Every near-Earth object detected this week + hazard flags.',    cat: 'objects',  accent: 'orange',  live: true  },
  { id: 'fireballs',  label: 'Fireball Tracker',     api: 'CNEOS',        desc: 'Atmospheric fireball events — energy, velocity, impact zones.', cat: 'objects',  accent: 'rose',    live: true  },
  { id: 'satellites', label: 'Satellite Tracker',    api: 'TLE / ISS',    desc: 'Live ISS lat/lng, altitude, and orbital elements.',             cat: 'missions', accent: 'violet',  live: true  },
  { id: 'tech',       label: 'Tech Portal',          api: 'TechTransfer', desc: 'Search NASA patents, tech transfer catalogue, spinoffs.',       cat: 'missions', accent: 'sky',     live: false },
  { id: 'mars',       label: 'Mars Rovers',          api: 'Mars',         desc: 'Rover mission info — Curiosity, Perseverance (API retired).',   cat: 'missions', accent: 'red',     live: false, retired: true },
]

/* ── Colour maps (Tailwind class strings — must be static so JIT keeps them) ── */
const ACCENT_STYLES = {
  amber:   { bar: 'bg-amber-500',   dot: 'bg-amber-400',   ring: 'hover:border-amber-500/50', ico: 'text-amber-300',   pill: 'text-amber-300 bg-amber-500/15 border-amber-500/30' },
  orange:  { bar: 'bg-orange-500',  dot: 'bg-orange-400',  ring: 'hover:border-orange-500/50', ico: 'text-orange-300', pill: 'text-orange-300 bg-orange-500/15 border-orange-500/30' },
  yellow:  { bar: 'bg-yellow-500',  dot: 'bg-yellow-400',  ring: 'hover:border-yellow-500/50', ico: 'text-yellow-300', pill: 'text-yellow-300 bg-yellow-500/15 border-yellow-500/30' },
  lime:    { bar: 'bg-lime-500',    dot: 'bg-lime-400',    ring: 'hover:border-lime-500/50', ico: 'text-lime-300',     pill: 'text-lime-300 bg-lime-500/15 border-lime-500/30' },
  emerald: { bar: 'bg-emerald-500', dot: 'bg-emerald-400', ring: 'hover:border-emerald-500/50', ico: 'text-emerald-300', pill: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
  cyan:    { bar: 'bg-cyan-500',    dot: 'bg-cyan-400',    ring: 'hover:border-cyan-500/50', ico: 'text-cyan-300',     pill: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30' },
  sky:     { bar: 'bg-sky-500',     dot: 'bg-sky-400',     ring: 'hover:border-sky-500/50', ico: 'text-sky-300',        pill: 'text-sky-300 bg-sky-500/15 border-sky-500/30' },
  blue:    { bar: 'bg-blue-500',    dot: 'bg-blue-400',    ring: 'hover:border-blue-500/50', ico: 'text-blue-300',      pill: 'text-blue-300 bg-blue-500/15 border-blue-500/30' },
  violet:  { bar: 'bg-violet-500',  dot: 'bg-violet-400',  ring: 'hover:border-violet-500/50', ico: 'text-violet-300', pill: 'text-violet-300 bg-violet-500/15 border-violet-500/30' },
  rose:    { bar: 'bg-rose-500',    dot: 'bg-rose-400',    ring: 'hover:border-rose-500/50', ico: 'text-rose-300',     pill: 'text-rose-300 bg-rose-500/15 border-rose-500/30' },
  red:     { bar: 'bg-red-500',     dot: 'bg-red-400',     ring: 'hover:border-red-500/50', ico: 'text-red-300',       pill: 'text-red-300 bg-red-500/15 border-red-500/30' },
}

/* ── Icons (heroicons-ish, matching the previous set) ── */
const ICONS = {
  apod:       (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V4.5a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v15a1.5 1.5 0 001.5 1.5z" /></svg>),
  asteroids:  (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><circle cx="12" cy="12" r="6" /><path strokeLinecap="round" d="M8 4l1 2M16 4l-1 2M4 16l2-1M20 16l-2-1M6 7l1.5 1M18 7l-1.5 1" /></svg>),
  weather:    (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><circle cx="12" cy="12" r="4" /><path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" /></svg>),
  earth:      (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>),
  epic:       (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><circle cx="12" cy="13" r="3" /></svg>),
  media:      (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>),
  mars:       (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M8 10c1-2 3-3 4-3s3 1 4 3M9 15c1 1 2 1.5 3 1.5s2-.5 3-1.5" /></svg>),
  tech:       (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>),
  fireballs:  (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" /></svg>),
  satellites: (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 01-1.326-3.538c0-1.326.493-2.538 1.326-3.538m7.424 7.076a5.25 5.25 0 001.326-3.538c0-1.326-.493-2.538-1.326-3.538M12 8.25v7.5m-6 3.75h12a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H6A1.5 1.5 0 004.5 6v12A1.5 1.5 0 006 19.5z" /></svg>),
  imagery:    (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9.015 9.015 0 003 12c0-1.605.42-3.113 1.157-4.418" /></svg>),
}

/* ── Live telemetry hook ─────────────────────────────────────
 * Fires all six feeds in parallel every 30 s. Individual failures
 * leave that slot's last-known value in place — no red toasts. */
function useTelemetry() {
  const [state, setState] = useState({
    apod:      { loading: true, data: null },
    asteroid:  { loading: true, data: null },
    flares:    { loading: true, data: null },
    iss:       { loading: true, data: null },
    astros:    { loading: true, data: null },
    epic:      { loading: true, data: null },
  })
  const [updated, setUpdated] = useState(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const now = todayStr()
      const weekAgo = daysAgo(6)
      const [apod, asteroid, flares, iss, astros, epic] = await Promise.allSettled([
        fetchAPOD({}),
        fetchAsteroids({ start_date: weekAgo, end_date: now }),
        fetchFlares({ startDate: daysAgo(1), endDate: now }),
        fetchISSPosition(),
        fetchAstros(),
        fetchEPIC(),
      ])
      if (cancelled) return
      setState({
        apod:     { loading: false, data: apod.status     === 'fulfilled' ? apod.value.data     : null },
        asteroid: { loading: false, data: asteroid.status === 'fulfilled' ? asteroid.value.data : null },
        flares:   { loading: false, data: flares.status   === 'fulfilled' ? flares.value.data   : null },
        iss:      { loading: false, data: iss.status      === 'fulfilled' ? iss.value.data      : null },
        astros:   { loading: false, data: astros.status   === 'fulfilled' ? astros.value.data   : null },
        epic:     { loading: false, data: epic.status     === 'fulfilled' ? epic.value.data     : null },
      })
      setUpdated(new Date())
    }

    load()
    const t = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  return { ...state, updated }
}

/* ── Small stat card used in the telemetry row ── */
const StatCard = ({ tone = 'amber', label, icon, value, ctx, loading, href }) => {
  const s = ACCENT_STYLES[tone] || ACCENT_STYLES.amber
  const body = (
    <div className={`relative overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70 p-3 sm:p-4 h-full transition-colors ${s.ring}`}>
      <div className={`absolute inset-x-0 top-0 h-0.5 ${s.bar} opacity-60`} />
      <div className="flex items-center gap-2 mb-1.5">
        <span className={s.ico}>{icon}</span>
        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{label}</span>
        <span className={`ml-auto w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse`} title="live" />
      </div>
      {loading ? (
        <div className="animate-pulse h-6 w-2/3 bg-gray-800 rounded" />
      ) : (
        <div className="text-white font-bold text-base sm:text-lg leading-tight truncate" title={typeof value === 'string' ? value : undefined}>{value ?? '—'}</div>
      )}
      {ctx && <div className="text-[10px] text-gray-500 mt-1 leading-snug line-clamp-2">{ctx}</div>}
    </div>
  )
  return href ? <Link to={href} className="block h-full">{body}</Link> : body
}

/* ── Hero — big gradient title, eyebrow, live pill, refresh time ── */
const Hero = ({ updated }) => {
  const relTime = useMemo(() => {
    if (!updated) return 'syncing…'
    return updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }, [updated])

  return (
    <div className="relative max-w-6xl mx-auto px-6 pt-32 pb-8 overflow-hidden">
      <div aria-hidden className="ambient-orb ambient-orb-cool -top-48 -left-32 opacity-70" />
      <div aria-hidden className="ambient-orb -top-24 right-0 opacity-50" />

      <div className="relative">
        <div className="eyebrow-mono mb-3 flex items-center gap-2 text-cyan-300/90">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          11 live NASA feeds
        </div>

        <h1 className="font-poppins font-black tracking-tight leading-[0.95] text-5xl sm:text-6xl md:text-7xl">
          <span className="gradient-text-amber">Cosmos</span>
        </h1>

        <p className="text-gray-400 mt-5 text-base sm:text-lg max-w-2xl leading-relaxed">
          A single portal into eleven live space feeds — daily astronomy imagery,
          near-Earth objects, solar weather, Earth events from orbit, and the
          full NASA image archive. Every module is proxied and cached; no key
          hits your browser.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-300 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live · refresh 30 s
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-700 bg-gray-900/60 text-[11px] text-gray-400 font-mono">
            last sync {relTime}
          </span>
          <Link
            to="/science/apod"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-300 font-semibold hover:bg-amber-500/20 transition-colors"
          >
            Start with today's APOD →
          </Link>
        </div>
      </div>
    </div>
  )
}

/* ── Telemetry row (6 cards) ─────────────────────────────── */
const TelemetryRow = ({ t }) => {
  // APOD title
  const apodTitle = t.apod.data?.title || '—'
  const apodDate  = t.apod.data?.date

  // Nearest asteroid this week: pick lowest miss distance
  let nearest = null
  if (t.asteroid.data?.near_earth_objects) {
    const all = Object.values(t.asteroid.data.near_earth_objects).flat()
    nearest = all
      .map(a => ({
        name: a.name,
        km: parseFloat(a?.close_approach_data?.[0]?.miss_distance?.kilometers || 'NaN'),
      }))
      .filter(a => !isNaN(a.km))
      .sort((a, b) => a.km - b.km)[0]
  }

  // Solar flares last 24h
  const flareCount = Array.isArray(t.flares.data) ? t.flares.data.length : null

  // ISS lat/lng
  const issPos = t.iss.data?.iss_position
  const issTxt = issPos ? `${(+issPos.latitude).toFixed(2)}°, ${(+issPos.longitude).toFixed(2)}°` : null

  // Astros in space
  const astrosCount = t.astros.data?.number ?? null
  const crafts = t.astros.data?.people ? [...new Set(t.astros.data.people.map(p => p.craft))].join(' · ') : null

  // Latest EPIC frame timestamp
  const latestEpic = Array.isArray(t.epic.data) && t.epic.data.length ? t.epic.data[0] : null
  const epicTs = latestEpic?.date ? latestEpic.date.split(' ')[0] : null

  return (
    <div className="max-w-6xl mx-auto px-6 pb-6">
      <div className="eyebrow-mono mb-3 text-gray-500">// Live telemetry</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <StatCard
          tone="amber" label="APOD today" icon={ICONS.apod}
          value={apodTitle.length > 28 ? apodTitle.slice(0, 26) + '…' : apodTitle}
          ctx={apodDate || 'astronomy pic of the day'}
          loading={t.apod.loading} href="/science/apod"
        />
        <StatCard
          tone="orange" label="Nearest NEO" icon={ICONS.asteroids}
          value={nearest ? nearest.name.replace(/[()]/g, '') : '—'}
          ctx={nearest ? `miss ${formatDistance(nearest.km)}` : 'this week · NeoWs'}
          loading={t.asteroid.loading} href="/science/asteroids"
        />
        <StatCard
          tone="yellow" label="Solar flares 24h" icon={ICONS.weather}
          value={flareCount === null ? '—' : flareCount}
          ctx="DONKI · last 24 hours"
          loading={t.flares.loading} href="/science/weather"
        />
        <StatCard
          tone="violet" label="ISS position" icon={ICONS.satellites}
          value={issTxt || '—'}
          ctx="live lat / lng · open-notify"
          loading={t.iss.loading} href="/science/satellites"
        />
        <StatCard
          tone="cyan" label="Astros in space" icon={ICONS.epic}
          value={astrosCount ?? '—'}
          ctx={crafts || 'currently orbiting'}
          loading={t.astros.loading} href="/science/satellites"
        />
        <StatCard
          tone="emerald" label="EPIC latest" icon={ICONS.earth}
          value={epicTs || '—'}
          ctx="DSCOVR L1 · full-disk Earth"
          loading={t.epic.loading} href="/science/epic"
        />
      </div>
    </div>
  )
}

/* ── Module card ─────────────────────────────────────────── */
const ModuleCard = ({ m, preview }) => {
  const s = ACCENT_STYLES[m.accent] || ACCENT_STYLES.amber

  return (
    <Link
      to={`/science/${m.id}`}
      className={`group relative block h-full rounded-2xl border border-gray-800 bg-gray-900/70 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.6)] ${s.ring}`}
    >
      {/* Top accent bar */}
      <div className={`absolute inset-x-0 top-0 h-1 ${s.bar} opacity-70 group-hover:opacity-100 transition-opacity`} />

      {/* Preview strip — hidden on mobile to save vertical space,
          revealed on hover on md+ */}
      {preview && (
        <div className="hidden md:block relative overflow-hidden">
          <div className="h-0 md:group-hover:h-24 transition-[height] duration-300 ease-out overflow-hidden">
            {preview}
          </div>
        </div>
      )}

      <div className="p-4 sm:p-5 flex flex-col h-full">
        <div className="flex items-start gap-3">
          <div className={`shrink-0 ${s.ico} transition-transform group-hover:scale-105`}>
            {ICONS[m.id]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-white font-bold text-sm">{m.label}</span>
              {m.retired && (
                <span className="text-[9px] text-yellow-500 bg-yellow-900/30 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">Retired</span>
              )}
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">{m.desc}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-auto pt-4 border-t border-gray-800/60 flex-wrap">
          <span className="text-[10px] text-gray-500 font-mono bg-gray-800/60 px-1.5 py-0.5 rounded">{m.api}</span>
          {m.live ? (
            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${s.pill} font-semibold`}>
              <span className={`w-1 h-1 rounded-full ${s.dot} animate-pulse`} />
              Live
            </span>
          ) : (
            <span className="text-[10px] text-gray-400 bg-gray-800/60 px-1.5 py-0.5 rounded border border-gray-700/50">Catalog</span>
          )}
          <svg className="w-4 h-4 text-gray-700 group-hover:text-cyan-400 transition-colors ml-auto shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </div>
    </Link>
  )
}

/* ── FadeIn wrapper ─────────────────────────────────────── */
function FadeIn({ children, delay = 0, className = '' }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay * 1000)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(20px)',
      transition: 'opacity 0.5s ease, transform 0.5s ease',
    }}>{children}</div>
  )
}

/* ── Main page ────────────────────────────────────────── */
const Science = () => {
  const [filter, setFilter] = useState('all')
  const t = useTelemetry()

  const filtered = useMemo(
    () => filter === 'all' ? MODULES : MODULES.filter(m => m.cat === filter),
    [filter]
  )

  // Per-module hover preview thumbnails — pulled from the telemetry hook so
  // we don't fire another N HTTP requests for hover states.
  const previews = useMemo(() => {
    const map = {}
    if (t.apod.data?.media_type === 'image' && t.apod.data?.url) {
      map.apod = (
        <img
          src={t.apod.data.url}
          alt=""
          className="w-full h-24 object-cover"
          loading="lazy"
        />
      )
    }
    const latestEpic = Array.isArray(t.epic.data) && t.epic.data[0]
    if (latestEpic?.image && latestEpic?.date) {
      const d = latestEpic.date.split(' ')[0].replace(/-/g, '/')
      const src = `https://epic.gsfc.nasa.gov/archive/natural/${d}/thumbs/${latestEpic.image}.jpg`
      map.epic = <img src={src} alt="" className="w-full h-24 object-cover" loading="lazy" />
    }
    if (t.iss.data?.iss_position) {
      const p = t.iss.data.iss_position
      map.satellites = (
        <div className="w-full h-24 bg-gradient-to-r from-violet-900/40 to-indigo-900/40 flex items-center justify-center font-mono text-violet-200 text-xs">
          {(+p.latitude).toFixed(3)}°, {(+p.longitude).toFixed(3)}°
        </div>
      )
    }
    return map
  }, [t.apod.data, t.epic.data, t.iss.data])

  return (
    <div className="min-h-screen bg-gray-950 text-white text-fg-primary">
      {/* Hero */}
      <FadeIn>
        <Hero updated={t.updated} />
      </FadeIn>

      {/* Telemetry */}
      <FadeIn delay={0.08}>
        <TelemetryRow t={t} />
      </FadeIn>

      {/* Category chips + module grid */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        <FadeIn delay={0.15}>
          <div className="eyebrow-mono mb-3 text-gray-500">// Filter feeds</div>
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {CATEGORIES.map(c => {
              const isActive = filter === c.key
              const count = c.key === 'all' ? MODULES.length : MODULES.filter(m => m.cat === c.key).length
              return (
                <button
                  key={c.key}
                  onClick={() => setFilter(c.key)}
                  className={`luxe-press tap-44 px-4 py-2 rounded-full text-xs font-semibold border transition-colors flex items-center gap-2 ${
                    isActive
                      ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200'
                      : 'border-gray-800 bg-gray-900/40 text-gray-400 hover:border-gray-700 hover:text-gray-200'
                  }`}
                >
                  {c.label}
                  <span className="tabular-nums opacity-70 text-[10px]">{count}</span>
                </button>
              )
            })}
            <span className="text-gray-600 text-xs ml-2 tabular-nums">{filtered.length} shown</span>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filtered.map((m, i) => (
            <FadeIn key={m.id} delay={0.2 + i * 0.03}>
              <ModuleCard m={m} preview={previews[m.id]} />
            </FadeIn>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20 luxe-card mt-6 p-8">
            <p className="text-gray-300 font-semibold mb-1">No feeds in this category</p>
            <p className="text-gray-500 text-sm mb-4">Try a different filter or browse all eleven.</p>
            <button onClick={() => setFilter('all')} className="luxe-btn luxe-btn-secondary tap-44">
              View all feeds
            </button>
          </div>
        )}
      </div>

      {/* Stats footer */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        <FadeIn delay={0.3}>
          <div className="eyebrow-mono mb-3 text-gray-500">// By the numbers</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {[
              { n: '11',    l: 'live modules',       c: 'text-cyan-300',    sub: 'each a distinct NASA / CNEOS feed' },
              { n: '19+',   l: 'proxy routes',       c: 'text-amber-300',   sub: 'BE hides every API key' },
              { n: '500 M', l: 'images archived',    c: 'text-emerald-300', sub: 'NASA Image & Video Library' },
              { n: '10 min', l: 'cache TTL',         c: 'text-fuchsia-300', sub: 'stale fallback on 429' },
            ].map(({ n, l, c, sub }) => (
              <div key={l} className="luxe-card p-4 sm:p-5">
                <div className={`text-2xl sm:text-3xl font-black tabular-nums ${c}`}>{n}</div>
                <div className="text-[11px] text-gray-500 uppercase tracking-widest font-bold mt-1">{l}</div>
                <div className="text-[11px] text-gray-500 mt-1 leading-snug">{sub}</div>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>

      {/* Footer CTA */}
      <div className="max-w-6xl mx-auto px-6 pb-24">
        <div className="luxe-card p-6 sm:p-8 text-center relative overflow-hidden">
          <div aria-hidden className="ambient-orb ambient-orb-cool -top-32 left-1/2 -translate-x-1/2 opacity-40" />
          <div className="relative">
            <div className="eyebrow-mono mb-2 text-gray-500">// Beyond NASA</div>
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
              Try the rest of the lab.
            </h3>
            <p className="text-gray-400 text-sm max-w-xl mx-auto mb-5">
              17 interactive demos, 13 creative experiments, and 9 public-API modules.
              Everything is browser-native.
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <Link to="/lab" className="luxe-btn luxe-btn-primary tap-44">Open Lab</Link>
              <Link to="/explore" className="luxe-btn luxe-btn-secondary tap-44">Public APIs</Link>
              <Link to="/creative" className="luxe-btn luxe-btn-ghost tap-44">Creative UI</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Science
