// APODViewer — Astronomy Picture of the Day.
//
// Composition (matches the Cosmos hub aesthetic):
//   1. Hero strip with gradient title + eyebrow + subtitle
//   2. Live stats — image date, media type, copyright, days-since-launch
//   3. Date navigator — Prev / Next / Today / Random (chips + date picker)
//   4. Large image (or embedded video) with click-to-zoom
//   5. Title + copyright chip + explanation

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchAPOD, todayStr } from '../../api/nasa'
import { LuxeLoader } from '../loaders'
import { ModuleHero, StatCard, SectionHeader, FriendlyError } from './ModuleShell'

const APOD_START = new Date(1995, 5, 16).getTime() // 1995-06-16

/* ── Fullscreen modal with wheel-zoom + drag-pan ── */
const ImageModal = ({ src, title, onClose }) => {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    setZoom(z => Math.max(0.5, Math.min(5, z + (e.deltaY > 0 ? -0.2 : 0.2))))
  }, [])

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
      onWheel={handleWheel}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-gray-800/80 text-white hover:bg-gray-700 flex items-center justify-center text-xl font-bold transition-colors"
      >
        ×
      </button>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 rounded-full px-4 py-2 border border-gray-800">
        <button onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(0.5, z - 0.3)) }} className="text-white hover:text-cyan-400 text-lg font-bold">−</button>
        <span className="text-gray-400 text-sm min-w-[3rem] text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(5, z + 0.3)) }} className="text-white hover:text-cyan-400 text-lg font-bold">+</button>
        <button onClick={(e) => { e.stopPropagation(); setZoom(1); setPan({ x: 0, y: 0 }) }} className="text-gray-400 hover:text-white text-xs ml-2">reset</button>
      </div>

      <div
        className="max-w-[92vw] max-h-[92vh] cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => { dragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY } }}
        onMouseMove={(e) => {
          if (!dragging.current) return
          setPan(p => ({ x: p.x + (e.clientX - lastPos.current.x), y: p.y + (e.clientY - lastPos.current.y) }))
          lastPos.current = { x: e.clientX, y: e.clientY }
        }}
        onMouseUp={() => { dragging.current = false }}
        onMouseLeave={() => { dragging.current = false }}
      >
        <img
          src={src}
          alt={title}
          className="max-w-full max-h-[88vh] object-contain rounded-lg select-none"
          style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }}
          draggable={false}
        />
      </div>

      <p className="absolute top-4 left-4 text-white/80 text-sm font-medium max-w-xs truncate">{title}</p>
    </div>
  )
}

const APODViewer = () => {
  const [date, setDate] = useState(todayStr())
  const [apod, setApod] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [updated, setUpdated] = useState(null)
  const abortRef = useRef(null)

  const loadAPOD = useCallback(async (selectedDate) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)

    const { data, error: err } = await fetchAPOD({ date: selectedDate }, { signal: controller.signal })

    if (err) { setError(err); setLoading(false); return }
    if (data) { setApod(data); setExpanded(false); setUpdated(new Date()) }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAPOD(date)
    return () => { if (abortRef.current) abortRef.current.abort() }
  }, [date, loadAPOD])

  const goRandom = () => {
    const end = new Date().getTime()
    const random = new Date(APOD_START + Math.random() * (end - APOD_START))
    setDate(random.toISOString().slice(0, 10))
  }
  const goPrev = () => {
    const d = new Date(date); d.setDate(d.getDate() - 1)
    if (d >= new Date(APOD_START)) setDate(d.toISOString().slice(0, 10))
  }
  const goNext = () => {
    const d = new Date(date); d.setDate(d.getDate() + 1)
    if (d <= new Date()) setDate(d.toISOString().slice(0, 10))
  }

  const daysArchived = useMemo(() => {
    return Math.floor((Date.now() - APOD_START) / 86_400_000)
  }, [])

  const isToday = date === todayStr()
  const isFuture = new Date(date) >= new Date()

  return (
    <div className="space-y-6 sm:space-y-8">
      <ModuleHero
        eyebrow="APOD · NASA feed"
        title="Picture of the Day"
        subtitle="A different astronomy image or photo, curated by NASA astronomers every day since June 1995. Browse three decades of the universe, one frame at a time."
        updated={updated}
        accent="amber"
      />

      {/* Telemetry */}
      <div>
        <SectionHeader>Live telemetry</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard
            tone="amber" label="Selected date"
            value={date} ctx={isToday ? 'today' : isFuture ? 'future — no data' : 'archive'}
            loading={loading}
          />
          <StatCard
            tone="cyan" label="Media type"
            value={apod?.media_type ? apod.media_type[0].toUpperCase() + apod.media_type.slice(1) : '—'}
            ctx={apod?.media_type === 'video' ? 'external video' : 'still image'}
            loading={loading}
          />
          <StatCard
            tone="emerald" label="Credit"
            value={apod?.copyright ? apod.copyright.split(/[,\n]/)[0].trim().slice(0, 24) : 'Public domain'}
            ctx="attribution as provided"
            loading={loading}
          />
          <StatCard
            tone="violet" label="Days archived"
            value={daysArchived.toLocaleString()} ctx="since 1995-06-16"
            loading={false} live={false}
          />
        </div>
      </div>

      {/* Date navigator */}
      <div>
        <SectionHeader>Browse the archive</SectionHeader>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={goPrev} className="luxe-press tap-44 px-3 py-2 rounded-full text-xs font-semibold border border-gray-800 bg-gray-900/40 text-gray-300 hover:border-gray-700 hover:text-white transition-colors">
            ← Prev
          </button>
          <div className="relative">
            <input
              type="date"
              value={date}
              min="1995-06-16"
              max={todayStr()}
              onChange={(e) => setDate(e.target.value)}
              aria-label="APOD date"
              className="px-3 py-2 bg-gray-900/60 border border-gray-800 rounded-full text-white text-xs sm:text-sm font-mono focus:outline-none focus:border-amber-500/50 transition-colors"
            />
          </div>
          <button onClick={goNext} disabled={isToday} className="luxe-press tap-44 px-3 py-2 rounded-full text-xs font-semibold border border-gray-800 bg-gray-900/40 text-gray-300 hover:border-gray-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Next →
          </button>
          <button onClick={() => setDate(todayStr())} className="luxe-press tap-44 px-3 py-2 rounded-full text-xs font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors">
            Today
          </button>
          <button onClick={goRandom} className="luxe-press tap-44 px-3 py-2 rounded-full text-xs font-semibold border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300 hover:bg-fuchsia-500/20 transition-colors">
            Random
          </button>
          <span className="text-[10px] text-gray-600 ml-auto font-mono">tip: pick any day since 1995</span>
        </div>
      </div>

      <FriendlyError error={error} onRetry={() => loadAPOD(date)} />

      {loading && (
        <div className="py-16 flex items-center justify-center">
          <LuxeLoader variant="cosmos" size="lg" label="fetching the cosmos…" />
        </div>
      )}

      {!loading && !error && apod && (
        <div className="luxe-card overflow-hidden">
          {apod.media_type === 'image' ? (
            <div className="relative group cursor-zoom-in" onClick={() => setShowModal(true)}>
              <img
                src={apod.hdurl || apod.url}
                alt={apod.title}
                className="w-full max-h-[70vh] object-contain bg-black"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900/80 border border-gray-700 rounded-full px-3 py-1.5 text-xs text-white flex items-center gap-1.5 pointer-events-none">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
                click to zoom
              </div>
            </div>
          ) : (
            <div className="aspect-video bg-black">
              <iframe
                src={apod.url}
                title={apod.title}
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
          )}

          <div className="p-5 sm:p-6 space-y-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-bold text-white">{apod.title}</h2>
              <span className="shrink-0 px-3 py-1 bg-amber-500/10 text-amber-300 text-xs font-mono rounded-full border border-amber-500/30">
                {apod.date}
              </span>
            </div>

            {apod.copyright && (
              <p className="text-gray-500 text-xs">Credit: {apod.copyright}</p>
            )}

            <p className={`text-gray-300 text-sm leading-relaxed ${!expanded ? 'line-clamp-4' : ''}`}>
              {apod.explanation}
            </p>

            {apod.explanation && apod.explanation.length > 300 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-amber-300 hover:text-amber-200 text-sm font-semibold transition-colors"
              >
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        </div>
      )}

      {showModal && apod?.media_type === 'image' && (
        <ImageModal
          src={apod.hdurl || apod.url}
          title={apod.title}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

export default APODViewer
