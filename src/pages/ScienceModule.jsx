import { lazy, Suspense } from 'react'
import { useParams, Link } from 'react-router-dom'

/* ── Lazy imports ── */
const COMPONENTS = {
  apod:       lazy(() => import('../components/science/APODViewer')),
  asteroids:  lazy(() => import('../components/science/AsteroidTracker')),
  weather:    lazy(() => import('../components/science/SpaceWeather')),
  earth:      lazy(() => import('../components/science/EarthEvents')),
  epic:       lazy(() => import('../components/science/EPICViewer')),
  media:      lazy(() => import('../components/science/NASAMediaSearch')),
  mars:       lazy(() => import('../components/science/MarsRover')),
  tech:       lazy(() => import('../components/science/TechPortal')),
  fireballs:  lazy(() => import('../components/science/FireballTracker')),
  satellites: lazy(() => import('../components/science/SatelliteViewer')),
}

const META = {
  apod:       { label: 'Picture of the Day',  api: 'APOD',         color: 'from-purple-500 to-pink-500',  skeleton: 'image' },
  asteroids:  { label: 'Asteroid Tracker',     api: 'NeoWs',        color: 'from-orange-500 to-red-500',   skeleton: 'dashboard' },
  weather:    { label: 'Space Weather',        api: 'DONKI',        color: 'from-yellow-500 to-orange-500',skeleton: 'dashboard' },
  earth:      { label: 'Earth Events',         api: 'EONET',        color: 'from-green-500 to-emerald-500',skeleton: 'map' },
  epic:       { label: 'EPIC Earth Camera',    api: 'EPIC',         color: 'from-blue-500 to-cyan-500',    skeleton: 'gallery' },
  media:      { label: 'Media Library',        api: 'Images',       color: 'from-indigo-500 to-blue-500',  skeleton: 'grid' },
  mars:       { label: 'Mars Rovers',          api: 'Mars',         color: 'from-red-500 to-orange-500',   skeleton: 'grid' },
  tech:       { label: 'Tech Portal',          api: 'TechTransfer', color: 'from-cyan-500 to-teal-500',    skeleton: 'list' },
  fireballs:  { label: 'Fireball Tracker',     api: 'CNEOS',        color: 'from-amber-500 to-red-600',    skeleton: 'map' },
  satellites: { label: 'Satellite Tracker',    api: 'TLE/ISS',      color: 'from-violet-500 to-purple-500',skeleton: 'dashboard' },
}

/* ── Skeleton loaders per module type ── */
const P = 'animate-pulse bg-gray-800 rounded'

const ImageSkeleton = () => (
  <div className="space-y-4">
    <div className="flex gap-2">
      {[1,2,3,4].map(i => <div key={i} className={`${P} h-10 w-24`} />)}
    </div>
    <div className={`${P}-xl h-[420px] w-full`} style={{borderRadius:12}} />
    <div className="space-y-2">
      <div className={`${P} h-6 w-2/3`} />
      <div className={`${P} h-4 w-full`} />
      <div className={`${P} h-4 w-5/6`} />
      <div className={`${P} h-4 w-3/4`} />
    </div>
  </div>
)

const DashboardSkeleton = () => (
  <div className="space-y-5">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[1,2,3,4].map(i => <div key={i} className={`${P}-xl h-24`} style={{borderRadius:12}} />)}
    </div>
    <div className={`${P}-xl h-48 w-full`} style={{borderRadius:12}} />
    <div className="space-y-3">
      {[1,2,3,4,5].map(i => <div key={i} className={`${P}-xl h-20`} style={{borderRadius:12}} />)}
    </div>
  </div>
)

const MapSkeleton = () => (
  <div className="space-y-4">
    <div className="flex gap-2">
      {[1,2,3,4,5].map(i => <div key={i} className={`${P} h-8 w-20`} />)}
    </div>
    <div className={`${P}-xl h-[360px] w-full`} style={{borderRadius:12}} />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {[1,2,3,4].map(i => <div key={i} className={`${P}-xl h-28`} style={{borderRadius:12}} />)}
    </div>
  </div>
)

const GallerySkeleton = () => (
  <div className="space-y-4">
    <div className="flex gap-2 overflow-hidden">
      {[1,2,3,4,5,6,7,8].map(i => <div key={i} className={`${P} h-16 w-16 shrink-0`} style={{borderRadius:8}} />)}
    </div>
    <div className={`${P}-xl h-[380px] w-full`} style={{borderRadius:12}} />
    <div className="flex gap-3">
      <div className={`${P} h-4 w-32`} />
      <div className={`${P} h-4 w-24`} />
      <div className={`${P} h-4 w-28`} />
    </div>
  </div>
)

const GridSkeleton = () => (
  <div className="space-y-4">
    <div className={`${P} h-12 w-full`} style={{borderRadius:12}} />
    <div className="flex gap-2">
      {[1,2,3,4].map(i => <div key={i} className={`${P} h-8 w-20`} />)}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {[...Array(8)].map((_, i) => (
        <div key={i} className={`${P}-xl`} style={{borderRadius:12, height: 140 + (i % 3) * 40}} />
      ))}
    </div>
  </div>
)

const ListSkeleton = () => (
  <div className="space-y-4">
    <div className={`${P} h-12 w-full`} style={{borderRadius:12}} />
    <div className="flex gap-2">
      {[1,2,3].map(i => <div key={i} className={`${P} h-8 w-24`} />)}
    </div>
    <div className="space-y-3">
      {[1,2,3,4,5,6].map(i => <div key={i} className={`${P}-xl h-24`} style={{borderRadius:12}} />)}
    </div>
  </div>
)

const SKELETONS = {
  image: ImageSkeleton,
  dashboard: DashboardSkeleton,
  map: MapSkeleton,
  gallery: GallerySkeleton,
  grid: GridSkeleton,
  list: ListSkeleton,
}

const ScienceModule = () => {
  const { module } = useParams()
  const Component = COMPONENTS[module]
  const meta = META[module]

  if (!Component || !meta) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">Module not found</p>
          <Link to="/science" className="text-cyan-400 hover:text-cyan-300 text-sm font-semibold">
            Back to Science
          </Link>
        </div>
      </div>
    )
  }

  const SkeletonFallback = SKELETONS[meta.skeleton] || DashboardSkeleton

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-6 pt-28 pb-6">
        <Link
          to="/science"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-white text-sm font-medium transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          All Modules
        </Link>

        <div className="flex items-center gap-3 mb-1">
          <div className={`h-1 w-12 rounded-full bg-gradient-to-r ${meta.color}`} />
          <h1 className="font-poppins font-black text-3xl md:text-4xl bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
            {meta.label}
          </h1>
          <span className="px-2 py-0.5 bg-gray-800 text-gray-500 text-xs rounded font-mono">{meta.api}</span>
        </div>
        <div className="mt-4 h-px bg-gradient-to-r from-cyan-900/40 via-purple-900/20 to-transparent" />
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-24">
        <Suspense fallback={<SkeletonFallback />}>
          <Component />
        </Suspense>
      </div>
    </div>
  )
}

export default ScienceModule
