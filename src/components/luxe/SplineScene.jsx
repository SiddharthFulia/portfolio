import { Suspense, lazy } from 'react'

// Lazy-load the heavy Spline runtime — only fetched when this component mounts.
const Spline = lazy(() => import('@splinetool/react-spline'))

/**
 * SplineScene
 * Renders an interactive Spline 3D scene from a `.splinecode` URL.
 *
 * Props:
 *   scene     — URL of the .splinecode file (required)
 *   className — extra classes for the wrapping <Spline/> canvas
 */
const SplineScene = ({ scene, className = '' }) => {
  return (
    <Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <Spline scene={scene} className={className} />
    </Suspense>
  )
}

export default SplineScene
