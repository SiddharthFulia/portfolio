// EPICViewer — daily Earth photos from NASA's DSCOVR spacecraft at L1.
//
// Composition:
//   1. Hero strip
//   2. Telemetry — image count, latest capture time, centroid lat/lng, Sun distance
//   3. Date navigator (Older / Newer / Today) + native date picker
//   4. Hero: full-quality latest frame with metadata
//   5. Horizontal filmstrip of today's frames (or the picked day)

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchEPIC, fetchEPICByDate, fetchEPICDates } from '../../api/nasa'
import { LuxeLoader } from '../loaders'
import { ModuleHero, StatCard, SectionHeader, FriendlyError } from './ModuleShell'

/* ── Build EPIC image URL from a frame descriptor ── */
const buildImageUrl = (image) => {
  if (!image?.date || !image?.image) return ''
  const d = new Date(image.date)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `https://epic.gsfc.nasa.gov/archive/natural/${y}/${m}/${day}/png/${image.image}.png`
}

const EPICViewer = () => {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [availableDates, setAvailableDates] = useState([]) // YYYY-MM-DD sorted DESC
  const [pickedDate, setPickedDate] = useState('') // '' = latest
  const [updated, setUpdated] = useState(null)
  const abortRef = useRef(null)

  const fetchImages = useCallback(async (dateStr) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)

    const { data, error: err } = dateStr
      ? await fetchEPICByDate(dateStr, { signal: controller.signal })
      : await fetchEPIC({ signal: controller.signal })
    if (err) { setError(err); setLoading(false); return }
    if (data && Array.isArray(data)) {
      setImages(data)
      setSelectedIdx(0)
      setUpdated(new Date())
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchEPICDates({ signal: controller.signal }).then(({ data }) => {
      if (Array.isArray(data)) setAvailableDates(data.map(d => d.date).sort().reverse())
    })
    fetchImages()
    return () => { controller.abort(); if (abortRef.current) abortRef.current.abort() }
  }, [fetchImages])

  const currentDate = pickedDate || (availableDates[0] || '')
  const currentIdx = availableDates.indexOf(currentDate)

  const goNewer = () => {
    if (currentIdx <= 0) return
    const next = availableDates[currentIdx - 1]
    setPickedDate(next)
    fetchImages(next)
  }
  const goOlder = () => {
    if (currentIdx < 0 || currentIdx >= availableDates.length - 1) return
    const next = availableDates[currentIdx + 1]
    setPickedDate(next)
    fetchImages(next)
  }
  const goLatest = () => {
    setPickedDate('')
    fetchImages()
  }

  const onPickDate = (e) => {
    const v = e.target.value
    setPickedDate(v)
    fetchImages(v)
  }

  const current = images[selectedIdx]
  const centroidLat = current?.centroid_coordinates?.lat
  const centroidLng = current?.centroid_coordinates?.lon
  const captureTime = useMemo(() => {
    if (!current?.date) return null
    try { return new Date(current.date).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' }
    catch { return current.date }
  }, [current])

  return (
    <div className="space-y-6 sm:space-y-8">
      <ModuleHero
        eyebrow="EPIC · DSCOVR L1"
        title="EPIC Earth Camera"
        subtitle="Full-disk Earth photos captured by NASA's DSCOVR spacecraft at Lagrange point L1 — a stable spot 1.5 million kilometres out where Earth stays perfectly framed."
        updated={updated}
        accent="cyan"
      />

      {/* Telemetry */}
      <div>
        <SectionHeader>Live telemetry</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard tone="cyan"    label="Frames today"    value={images.length} ctx="unique full-disk photos" loading={loading} />
          <StatCard tone="blue"    label="Latest capture"  value={captureTime ? captureTime.slice(11, 19) : '—'} ctx={captureTime ? captureTime.slice(0, 10) : 'awaiting downlink'} loading={loading} />
          <StatCard tone="emerald" label="Centroid"        value={centroidLat != null ? `${(+centroidLat).toFixed(1)}°, ${(+centroidLng).toFixed(1)}°` : '—'} ctx="point directly under camera" loading={loading} />
          <StatCard tone="violet"  label="Distance from Earth" value="1.5 M km" ctx="Lagrange L1 · steady view" loading={false} live={false} />
        </div>
      </div>

      {/* Navigator */}
      <div>
        <SectionHeader>Browse capture dates</SectionHeader>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={goOlder} disabled={currentIdx < 0 || currentIdx >= availableDates.length - 1} className="luxe-press tap-44 px-3 py-2 rounded-full text-xs font-semibold border border-gray-800 bg-gray-900/40 text-gray-300 hover:border-gray-700 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            ← Older
          </button>
          <input
            type="date"
            value={currentDate}
            max={availableDates[0] || undefined}
            min={availableDates[availableDates.length - 1] || undefined}
            onChange={onPickDate}
            aria-label="EPIC capture date"
            className="px-3 py-2 bg-gray-900/60 border border-gray-800 rounded-full text-white text-xs sm:text-sm font-mono focus:outline-none focus:border-cyan-500/50 transition-colors"
          />
          <button onClick={goNewer} disabled={currentIdx <= 0} className="luxe-press tap-44 px-3 py-2 rounded-full text-xs font-semibold border border-gray-800 bg-gray-900/40 text-gray-300 hover:border-gray-700 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            Newer →
          </button>
          <button onClick={goLatest} className="luxe-press tap-44 px-3 py-2 rounded-full text-xs font-semibold border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-colors">
            Latest
          </button>
          <span className="text-[10px] text-gray-600 ml-auto font-mono">{availableDates.length} days in archive</span>
        </div>
      </div>

      <FriendlyError error={error} onRetry={() => fetchImages(pickedDate || null)} />

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <LuxeLoader variant="cosmos" size="lg" label="downloading from L1…" />
        </div>
      ) : (!error && images.length === 0) ? (
        <div className="luxe-card p-6 text-center">
          <p className="text-gray-300 font-semibold mb-1">No frames captured for this day</p>
          <p className="text-gray-500 text-sm">DSCOVR relays a batch every few hours; try the latest date.</p>
        </div>
      ) : (!error && current) ? (
        <>
          {/* Hero frame */}
          <div className="luxe-card overflow-hidden">
            <div className="relative bg-black">
              <img
                src={buildImageUrl(current)}
                alt={`Earth from DSCOVR · ${current.date}`}
                className="w-full max-h-[70vh] object-contain mx-auto"
                loading="lazy"
              />
              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-cyan-500/40 bg-black/70 text-[11px] text-cyan-300 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Full-disk · natural colour
              </div>
            </div>
            <div className="p-5 sm:p-6 space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold text-white">DSCOVR / EPIC Earth capture</h2>
                <span className="shrink-0 px-3 py-1 bg-cyan-500/10 text-cyan-300 text-xs font-mono rounded-full border border-cyan-500/30">
                  frame {selectedIdx + 1} / {images.length}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest">Capture time (UTC)</div>
                  <div className="text-white font-mono text-xs mt-0.5">{captureTime || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest">Centroid latitude</div>
                  <div className="text-cyan-300 font-mono text-xs mt-0.5">{centroidLat != null ? centroidLat.toFixed(2) + '°' : '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest">Centroid longitude</div>
                  <div className="text-cyan-300 font-mono text-xs mt-0.5">{centroidLng != null ? centroidLng.toFixed(2) + '°' : '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest">Position (J2000)</div>
                  <div className="text-fuchsia-300 font-mono text-xs mt-0.5">
                    {current.sun_j2000_position ? `${(current.sun_j2000_position.x / 1e6).toFixed(1)} M km` : '—'}
                  </div>
                </div>
              </div>
              {current.caption && <p className="text-gray-400 text-sm">{current.caption}</p>}
            </div>
          </div>

          {/* Filmstrip */}
          <div>
            <SectionHeader trailing={<span className="text-[10px] text-gray-600 font-mono">{images.length} frames</span>}>
              Today's filmstrip
            </SectionHeader>
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin">
              {images.map((img, i) => (
                <button
                  key={img.identifier || i}
                  onClick={() => setSelectedIdx(i)}
                  className={`shrink-0 snap-start relative rounded-xl overflow-hidden transition-all duration-300 ${
                    selectedIdx === i
                      ? 'ring-2 ring-cyan-400 scale-[1.02] shadow-lg shadow-cyan-900/30'
                      : 'opacity-60 hover:opacity-100 border border-gray-800'
                  }`}
                >
                  <img
                    src={buildImageUrl(img).replace('/png/', '/thumbs/').replace('.png', '.jpg')}
                    alt={`Earth ${img.date}`}
                    className="w-24 h-24 sm:w-28 sm:h-28 object-cover"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.src = buildImageUrl(img) }}
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                    <span className="text-white text-[10px] font-mono">
                      {new Date(img.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default EPICViewer
