import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { fetchNASA, nasaUrl, getRateLimitRemaining, corsProxy } from '../components/science/utils'

/* ── Categories for filter ── */
const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'imagery', label: 'Imagery' },
  { key: 'tracking', label: 'Tracking' },
  { key: 'data', label: 'Data & Search' },
]

/* ── Section definitions ── */
const SECTIONS = [
  { id: 'apod',       label: 'Picture of the Day',  color: 'from-purple-500 to-pink-500',   desc: 'Daily astronomy image with full context',   api: 'APOD',         cat: 'imagery',  hasDate: true },
  { id: 'asteroids',  label: 'Asteroid Tracker',     color: 'from-orange-500 to-red-500',    desc: 'Near-Earth objects this week',               api: 'NeoWs',        cat: 'tracking', hasDate: true },
  { id: 'weather',    label: 'Space Weather',        color: 'from-yellow-500 to-orange-500', desc: 'Solar flares, storms & CMEs',                api: 'DONKI',        cat: 'tracking', hasDate: true },
  { id: 'earth',      label: 'Earth Events',         color: 'from-green-500 to-emerald-500', desc: 'Wildfires, volcanoes, storms from orbit',    api: 'EONET',        cat: 'tracking', hasDate: false },
  { id: 'epic',       label: 'EPIC Earth Camera',    color: 'from-blue-500 to-cyan-500',     desc: 'Daily Earth photos from DSCOVR',             api: 'EPIC',         cat: 'imagery',  hasDate: true },
  { id: 'media',      label: 'Media Library',        color: 'from-indigo-500 to-blue-500',   desc: 'Search millions of space images & videos',   api: 'Images',       cat: 'data',     hasDate: false },
  { id: 'mars',       label: 'Mars Rovers',          color: 'from-red-500 to-orange-500',    desc: 'Curiosity, Perseverance & more',             api: 'Mars',         cat: 'imagery',  hasDate: true },
  { id: 'tech',       label: 'Tech Portal',          color: 'from-cyan-500 to-teal-500',     desc: 'Space agency patents & tech transfer',       api: 'TechTransfer', cat: 'data',     hasDate: false },
  { id: 'fireballs',  label: 'Fireball Tracker',     color: 'from-amber-500 to-red-600',     desc: 'Atmospheric fireball events worldwide',      api: 'CNEOS',        cat: 'tracking', hasDate: true },
  { id: 'satellites', label: 'Satellite Tracker',    color: 'from-violet-500 to-purple-500', desc: 'Live ISS position & satellite orbits',       api: 'TLE/ISS',      cat: 'tracking', hasDate: false },
]

const ICONS = {
  apod: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V4.5a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v15a1.5 1.5 0 001.5 1.5z" /></svg>,
  asteroids: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><circle cx="12" cy="12" r="6" /><path strokeLinecap="round" d="M8 4l1 2M16 4l-1 2M4 16l2-1M20 16l-2-1M6 7l1.5 1M18 7l-1.5 1" /></svg>,
  weather: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><circle cx="12" cy="12" r="4" /><path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" /></svg>,
  earth: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>,
  epic: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><circle cx="12" cy="13" r="3" /></svg>,
  media: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>,
  mars: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M8 10c1-2 3-3 4-3s3 1 4 3M9 15c1 1 2 1.5 3 1.5s2-.5 3-1.5" /></svg>,
  tech: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>,
  fireballs: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" /></svg>,
  satellites: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 01-1.326-3.538c0-1.326.493-2.538 1.326-3.538m7.424 7.076a5.25 5.25 0 001.326-3.538c0-1.326-.493-2.538-1.326-3.538M12 8.25v7.5m-6 3.75h12a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H6A1.5 1.5 0 004.5 6v12A1.5 1.5 0 006 19.5z" /></svg>,
}

/* ── Info tooltip ── */
const InfoTooltip = () => {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(o => !o)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        className="w-7 h-7 rounded-full border border-gray-700 bg-gray-800 text-gray-500 hover:text-cyan-400 hover:border-cyan-700 flex items-center justify-center transition-colors text-xs font-bold">
        i
      </button>
      {open && (() => {
        const remaining = getRateLimitRemaining()
        return (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-gray-900 border border-gray-700 rounded-xl shadow-xl shadow-black/40 z-50 text-left">
            <div className="text-xs text-gray-300 font-semibold mb-2">API Rate Limits</div>
            {remaining !== null && (
              <div className="flex items-center gap-2 mb-2 p-2 bg-gray-800 rounded-lg">
                <div className={`w-2 h-2 rounded-full ${remaining > 10 ? 'bg-green-500' : remaining > 0 ? 'bg-yellow-500' : 'bg-red-500'}`} />
                <span className="text-xs text-gray-300 font-mono">{remaining}</span>
                <span className="text-[11px] text-gray-500">requests remaining</span>
              </div>
            )}
            <ul className="text-[11px] text-gray-400 space-y-1">
              <li className="flex items-start gap-1.5"><span className="text-yellow-500 mt-0.5">&#9679;</span><span>Demo key: <span className="text-gray-300">30/hr</span>, <span className="text-gray-300">50/day</span></span></li>
              <li className="flex items-start gap-1.5"><span className="text-green-500 mt-0.5">&#9679;</span><span>Free key: <span className="text-gray-300">1,000/hr</span></span></li>
              <li className="flex items-start gap-1.5"><span className="text-cyan-500 mt-0.5">&#9679;</span><span>Get one at <a href="https://api.nasa.gov/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">api.nasa.gov</a></span></li>
            </ul>
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-700" />
          </div>
        )
      })()}
    </div>
  )
}

/* ── Featured APOD banner (auto-fetches today's image) ── */
const FeaturedAPOD = () => {
  const [apod, setApod] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchNASA(nasaUrl('https://api.nasa.gov/planetary/apod'), { signal: controller.signal })
      .then(({ data }) => { if (data) setApod(data) })
    return () => controller.abort()
  }, [])

  if (!apod) return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/80 overflow-hidden animate-pulse">
      <div className="h-64 sm:h-80 bg-gray-800" />
    </div>
  )

  return (
    <Link to="/science/apod" className="group block rounded-2xl border border-gray-800 bg-gray-900/80 overflow-hidden hover:border-gray-600 transition-colors">
      <div className="relative">
        {apod.media_type === 'image' ? (
          <img src={apod.url} alt={apod.title} className="w-full h-64 sm:h-80 object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-64 sm:h-80 bg-gray-800 flex items-center justify-center text-gray-500">Video</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-purple-600/80 text-white text-[10px] font-bold rounded uppercase tracking-wider">APOD</span>
            <span className="text-gray-400 text-xs">{apod.date}</span>
          </div>
          <h3 className="text-white font-bold text-lg sm:text-xl leading-snug mb-1 group-hover:text-cyan-300 transition-colors">{apod.title}</h3>
          <p className="text-gray-400 text-sm line-clamp-2">{apod.explanation}</p>
        </div>
      </div>
    </Link>
  )
}

/* ── Live ISS mini widget ── */
const ISSWidget = () => {
  const [pos, setPos] = useState(null)
  const [people, setPeople] = useState(null)

  useEffect(() => {
    const fetchISS = () => {
      fetch(corsProxy('http://api.open-notify.org/iss-now.json'))
        .then(r => r.json()).then(d => setPos(d.iss_position)).catch(() => {})
    }
    fetch(corsProxy('http://api.open-notify.org/astros.json'))
      .then(r => r.json()).then(d => setPeople(d.number)).catch(() => {})
    fetchISS()
    const iv = setInterval(fetchISS, 10000)
    return () => clearInterval(iv)
  }, [])

  return (
    <Link to="/science/satellites" className="group block rounded-2xl border border-gray-800 bg-gray-900/80 p-5 hover:border-violet-500/40 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-green-400 text-xs font-semibold uppercase tracking-wider">Live ISS</span>
      </div>
      {pos ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-gray-500 mb-0.5">Latitude</div>
            <div className="text-white font-mono text-sm">{parseFloat(pos.latitude).toFixed(4)}°</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 mb-0.5">Longitude</div>
            <div className="text-white font-mono text-sm">{parseFloat(pos.longitude).toFixed(4)}°</div>
          </div>
        </div>
      ) : (
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-24 bg-gray-800 rounded" />
          <div className="h-4 w-20 bg-gray-800 rounded" />
        </div>
      )}
      {people && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <span className="text-cyan-400 font-bold text-lg">{people}</span>
          <span className="text-gray-500 text-xs ml-1.5">people in space right now</span>
        </div>
      )}
      <div className="mt-3 text-xs text-gray-600 group-hover:text-violet-400 transition-colors font-medium">
        Open Satellite Tracker →
      </div>
    </Link>
  )
}

/* ── Quick asteroid count widget ── */
const AsteroidWidget = () => {
  const [count, setCount] = useState(null)
  const [hazardous, setHazardous] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const today = new Date().toISOString().slice(0, 10)
    const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
    fetchNASA(nasaUrl('https://api.nasa.gov/neo/rest/v1/feed', { start_date: weekAgo, end_date: today }), { signal: controller.signal })
      .then(({ data }) => {
        if (!data) return
        setCount(data.element_count)
        const all = Object.values(data.near_earth_objects || {}).flat()
        setHazardous(all.filter(a => a.is_potentially_hazardous_asteroid).length)
      })
    return () => controller.abort()
  }, [])

  return (
    <Link to="/science/asteroids" className="group block rounded-2xl border border-gray-800 bg-gray-900/80 p-5 hover:border-orange-500/40 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-orange-400">{ICONS.asteroids}</span>
        <span className="text-orange-400 text-xs font-semibold uppercase tracking-wider">This Week</span>
      </div>
      {count !== null ? (
        <div className="flex items-baseline gap-4">
          <div>
            <div className="text-white font-black text-3xl">{count}</div>
            <div className="text-gray-500 text-xs">near-Earth objects</div>
          </div>
          {hazardous > 0 && (
            <div>
              <div className="text-red-400 font-black text-2xl">{hazardous}</div>
              <div className="text-gray-500 text-xs">hazardous</div>
            </div>
          )}
        </div>
      ) : (
        <div className="animate-pulse"><div className="h-9 w-16 bg-gray-800 rounded" /></div>
      )}
      <div className="mt-3 text-xs text-gray-600 group-hover:text-orange-400 transition-colors font-medium">
        Open Asteroid Tracker →
      </div>
    </Link>
  )
}

/* ── FadeIn ── */
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
    }}>
      {children}
    </div>
  )
}

/* ── Main Science index page ── */
const Science = () => {
  const [filter, setFilter] = useState('all')

  const filtered = filter === 'all' ? SECTIONS : SECTIONS.filter(s => s.cat === filter)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-32 pb-6">
        <FadeIn>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-400 text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Live Space Data
          </div>
        </FadeIn>

        <FadeIn delay={0.05}>
          <h1 className="font-poppins font-black text-5xl md:text-7xl leading-tight">
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
              Space Science
            </span>
            <br />
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent text-4xl md:text-5xl">
              Explorer
            </span>
          </h1>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="flex flex-wrap items-center gap-8 mt-6">
            {[
              ['10', 'Data Feeds', 'text-cyan-400'],
              ['7+', 'Live APIs', 'text-blue-400'],
              ['Live', 'ISS Tracking', 'text-green-400'],
              ['30yr+', 'Image Archive', 'text-purple-400'],
            ].map(([n, l, c]) => (
              <div key={l} className="text-center">
                <div className={`text-2xl font-black ${c}`}>{n}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{l}</div>
              </div>
            ))}
            <InfoTooltip />
          </div>
        </FadeIn>
      </div>

      {/* Featured row: APOD + live widgets */}
      <div className="max-w-6xl mx-auto px-6 pb-8">
        <FadeIn delay={0.15}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <FeaturedAPOD />
            </div>
            <div className="flex flex-col gap-4">
              <ISSWidget />
              <AsteroidWidget />
            </div>
          </div>
        </FadeIn>
      </div>

      {/* Category filter + module grid */}
      <div className="max-w-6xl mx-auto px-6 pb-24">
        <FadeIn delay={0.2}>
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {CATEGORIES.map(c => (
              <button
                key={c.key}
                onClick={() => setFilter(c.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  filter === c.key
                    ? 'bg-cyan-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {c.label}
              </button>
            ))}
            <span className="text-gray-600 text-xs ml-2">{filtered.length} modules</span>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s, i) => (
            <FadeIn key={s.id} delay={0.25 + i * 0.03}>
              <Link
                to={`/science/${s.id}`}
                className="group relative block rounded-2xl border border-gray-800 bg-gray-900/80 overflow-hidden hover:border-gray-600 transition-colors"
              >
                {/* Top gradient bar */}
                <div className={`h-1 bg-gradient-to-r ${s.color} opacity-40 group-hover:opacity-100 transition-opacity`} />

                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="text-gray-500 group-hover:text-gray-300 transition-colors mt-0.5">
                      {ICONS[s.id]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-bold text-sm">{s.label}</span>
                      </div>
                      <p className="text-gray-500 text-xs leading-relaxed">{s.desc}</p>
                    </div>
                  </div>

                  {/* Footer row with tags */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-800/60">
                    <span className="text-[10px] text-gray-600 font-mono bg-gray-800/60 px-1.5 py-0.5 rounded">{s.api}</span>
                    {s.hasDate && (
                      <span className="text-[10px] text-purple-400/70 bg-purple-900/20 px-1.5 py-0.5 rounded">Date Filter</span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      s.cat === 'imagery' ? 'text-blue-400/70 bg-blue-900/20' :
                      s.cat === 'tracking' ? 'text-green-400/70 bg-green-900/20' :
                      'text-cyan-400/70 bg-cyan-900/20'
                    }`}>
                      {s.cat === 'imagery' ? 'Imagery' : s.cat === 'tracking' ? 'Live Tracking' : 'Search'}
                    </span>
                    <svg className="w-4 h-4 text-gray-700 group-hover:text-cyan-400 transition-colors ml-auto shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              </Link>
            </FadeIn>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Science
