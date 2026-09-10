// ScienceModule — per-module wrapper for /science/:module.
//
// Every module owns its own hero (via ModuleHero from ModuleShell). This
// wrapper just handles: lazy import, the "back to Cosmos" link, and the
// Suspense fallback (branded LuxeLoader).

import { lazy, Suspense } from 'react'
import { useParams, Link } from 'react-router-dom'
import { LuxeLoader } from '../components/loaders'

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
  imagery:    lazy(() => import('../components/science/EarthImagery')),
}

const VALID = new Set(Object.keys(COMPONENTS))

const ScienceModule = () => {
  const { module } = useParams()
  const Component = COMPONENTS[module]

  if (!VALID.has(module) || !Component) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="eyebrow-mono mb-3 text-gray-500">// 404</div>
          <h1 className="font-poppins font-black text-3xl mb-2">
            <span className="gradient-text-amber">Uncharted</span>
          </h1>
          <p className="text-gray-400 text-sm mb-6">
            That module isn't part of the Cosmos catalogue. It may have been retired or renamed.
          </p>
          <Link to="/science" className="luxe-btn luxe-btn-primary tap-44 inline-block">
            Back to Cosmos
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white text-fg-primary">
      <div className="max-w-6xl mx-auto px-6 pt-28 sm:pt-32 pb-4">
        <Link
          to="/science"
          className="inline-flex items-center gap-2 tap-44 -ml-2 px-2 text-gray-500 hover:text-white text-sm font-medium transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          All feeds
        </Link>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-24">
        <Suspense
          fallback={
            <div className="py-24 flex items-center justify-center">
              <LuxeLoader variant="cosmos" size="lg" label="tuning the feed…" />
            </div>
          }
        >
          <Component />
        </Suspense>
      </div>
    </div>
  )
}

export default ScienceModule
