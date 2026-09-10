// EarthImagery — Landsat 8 imagery at any lat/lng on Earth.
//
// Composition:
//   1. Hero strip
//   2. Telemetry — selected coordinates, date, zoom, region
//   3. Coordinate inputs + date + zoom slider + "Use my location" button
//   4. Preset location chips (12 cities / features)
//   5. Fetched image display with metadata footer

import { useState, useRef, useCallback, useEffect } from 'react'
import { getEarthImageryURL } from '../../api/nasa'
import { LuxeLoader } from '../loaders'
import { ModuleHero, StatCard, SectionHeader, FilterChips, FriendlyError } from './ModuleShell'

const PRESETS = [
  { key: 'ny',      label: 'New York',        lat: 40.7128,   lon: -74.006 },
  { key: 'london',  label: 'London',          lat: 51.5074,   lon: -0.1278 },
  { key: 'tokyo',   label: 'Tokyo',           lat: 35.6762,   lon: 139.6503 },
  { key: 'sydney',  label: 'Sydney',          lat: -33.8688,  lon: 151.2093 },
  { key: 'dubai',   label: 'Dubai',           lat: 25.2048,   lon: 55.2708 },
  { key: 'paris',   label: 'Paris',           lat: 48.8566,   lon: 2.3522 },
  { key: 'mumbai',  label: 'Mumbai',          lat: 19.076,    lon: 72.8777 },
  { key: 'sp',      label: 'São Paulo',       lat: -23.5505,  lon: -46.6333 },
  { key: 'cairo',   label: 'Cairo',           lat: 30.0444,   lon: 31.2357 },
  { key: 'gc',      label: 'Grand Canyon',    lat: 36.1069,   lon: -112.1129 },
  { key: 'amazon',  label: 'Amazon',          lat: -3.4653,   lon: -62.2159 },
  { key: 'sahara',  label: 'Sahara Desert',   lat: 23.4162,   lon: 25.6628 },
]

const EarthImagery = () => {
  const [lat, setLat] = useState('40.7128')
  const [lon, setLon] = useState('-74.006')
  const [date, setDate] = useState('2024-01-01')
  const [dim, setDim] = useState(0.15)
  const [imageUrl, setImageUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [presetKey, setPresetKey] = useState('ny')
  const [updated, setUpdated] = useState(null)
  const [geoState, setGeoState] = useState('idle') // idle | loading | denied
  const imgRef = useRef(null)

  const fetchImage = useCallback(() => {
    if (!lat || !lon) return
    setLoading(true)
    setError(null)
    const url = getEarthImageryURL({ lat, lon, date, dim })
    setImageUrl(url)
  }, [lat, lon, date, dim])

  const onLoad = () => { setLoading(false); setError(null); setUpdated(new Date()) }
  const onError = () => {
    setLoading(false)
    setError('No Landsat imagery available for this location and date. Try a nearby coordinate or an earlier date.')
    setImageUrl(null)
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoState('denied'); return }
    setGeoState('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(4))
        setLon(pos.coords.longitude.toFixed(4))
        setPresetKey('')
        setGeoState('idle')
      },
      () => setGeoState('denied'),
      { timeout: 8000 }
    )
  }

  const setPreset = (key) => {
    const p = PRESETS.find(x => x.key === key)
    if (!p) return
    setPresetKey(key)
    setLat(String(p.lat))
    setLon(String(p.lon))
  }

  // Reset presetKey if user manually edits coords
  useEffect(() => {
    const active = PRESETS.find(p => String(p.lat) === lat && String(p.lon) === lon)
    setPresetKey(active?.key || '')
  }, [lat, lon])

  const currentPreset = PRESETS.find(p => p.key === presetKey)

  return (
    <div className="space-y-6 sm:space-y-8">
      <ModuleHero
        eyebrow="Landsat 8 · NASA feed"
        title="Earth Imagery"
        subtitle="Satellite crops of any point on the planet from NASA's Landsat 8 archive. Pick a preset, enter your own coordinates, or grant location to see your neighbourhood from orbit."
        updated={updated}
        accent="emerald"
        live={false}
      />

      {/* Telemetry */}
      <div>
        <SectionHeader>Current coordinates</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard tone="emerald" label="Region"    value={currentPreset?.label || 'Custom point'} ctx={`${(+lat).toFixed(3)}°, ${(+lon).toFixed(3)}°`} loading={false} live={false} />
          <StatCard tone="cyan"    label="Date"      value={date} ctx="capture date" loading={false} live={false} />
          <StatCard tone="violet"  label="Zoom (dim)" value={`${dim}°`} ctx="field of view width" loading={false} live={false} />
          <StatCard tone="amber"   label="Source"    value="Landsat 8" ctx="30 m ground resolution" loading={false} live={false} />
        </div>
      </div>

      {/* Inputs */}
      <div>
        <SectionHeader>Query</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1 block">Latitude</label>
            <input
              type="number" step="0.001"
              value={lat} onChange={e => setLat(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-900/60 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
              placeholder="-90 to 90"
              aria-describedby="lat-help"
            />
            <p id="lat-help" className="text-[10px] text-gray-600 mt-1">north (+) to south (−), −90 to 90</p>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1 block">Longitude</label>
            <input
              type="number" step="0.001"
              value={lon} onChange={e => setLon(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-900/60 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
              placeholder="-180 to 180"
              aria-describedby="lon-help"
            />
            <p id="lon-help" className="text-[10px] text-gray-600 mt-1">east (+) to west (−), −180 to 180</p>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1 block">Date</label>
            <input
              type="date"
              value={date} onChange={e => setDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full px-3 py-2.5 bg-gray-900/60 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
              aria-describedby="date-help"
            />
            <p id="date-help" className="text-[10px] text-gray-600 mt-1">not every day has a pass — try nearby dates</p>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1 block">Zoom · dim <span className="text-emerald-300 font-mono">{dim}°</span></label>
            <input
              type="range"
              min="0.02" max="0.5" step="0.01"
              value={dim} onChange={e => setDim(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 mt-3"
              aria-describedby="zoom-help"
            />
            <p id="zoom-help" className="text-[10px] text-gray-600 mt-1">field width in degrees — smaller = closer</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            onClick={fetchImage}
            disabled={loading}
            className="luxe-press tap-44 px-5 py-2.5 rounded-full text-sm font-semibold border border-emerald-500/50 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 transition-colors disabled:opacity-40"
          >
            {loading ? 'Fetching…' : 'Fetch imagery'}
          </button>
          <button
            onClick={useMyLocation}
            disabled={geoState === 'loading'}
            className="luxe-press tap-44 px-4 py-2.5 rounded-full text-sm font-semibold border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
          >
            {geoState === 'loading' ? 'Locating…' : 'Use my location'}
          </button>
          {geoState === 'denied' && (
            <span className="text-[10px] text-yellow-400 font-mono">location permission denied — try a preset</span>
          )}
        </div>
      </div>

      {/* Presets */}
      <div>
        <SectionHeader>Quick locations</SectionHeader>
        <FilterChips
          options={PRESETS.map(p => ({ key: p.key, label: p.label }))}
          value={presetKey}
          onChange={setPreset}
        />
      </div>

      <FriendlyError error={error} onRetry={fetchImage} />

      {/* Result */}
      {imageUrl ? (
        <div className="luxe-card overflow-hidden">
          {loading && (
            <div className="h-96 flex items-center justify-center">
              <LuxeLoader variant="cosmos" size="lg" label="pulling from Landsat 8…" />
            </div>
          )}
          <img
            ref={imgRef}
            src={imageUrl}
            alt={`Landsat imagery at ${lat}, ${lon}`}
            className={`w-full ${loading ? 'hidden' : 'block'}`}
            onLoad={onLoad}
            onError={onError}
          />
          {!loading && !error && (
            <div className="px-4 py-3 border-t border-gray-800/60 flex flex-wrap items-center gap-4 text-[11px] text-gray-500 font-mono">
              <span>lat <span className="text-white">{lat}°</span></span>
              <span>lon <span className="text-white">{lon}°</span></span>
              <span>date <span className="text-white">{date}</span></span>
              <span>dim <span className="text-white">{dim}°</span></span>
              <span className="ml-auto text-emerald-300">Landsat 8</span>
            </div>
          )}
        </div>
      ) : !error && (
        <div className="luxe-card p-10 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
          </div>
          <p className="text-white font-semibold mb-1">Pick a location, then hit "Fetch imagery"</p>
          <p className="text-gray-500 text-sm">Landsat 8 crops load as high-res JPEGs — no key hits your browser.</p>
        </div>
      )}
    </div>
  )
}

export default EarthImagery
