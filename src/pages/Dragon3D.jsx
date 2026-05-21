import { useState } from 'react'
import SplineScene from '../components/luxe/SplineScene'

// /3d — interactive 3D scene page (placeholder: a Spline community
// scene). To swap in your own dragon scene later:
//   1. Build / export the dragon in Spline (https://app.spline.design)
//   2. Click "Export → Code → React → Copy the .splinecode URL"
//   3. Paste the URL into SCENE_URL below
//
// The runtime is lazy-loaded inside <SplineScene> so the heavy WebGL
// runtime only ships when this route mounts.

const SCENE_URL =
  // Placeholder: Spline community "Robot" scene. Swap for any
  // .splinecode URL (dragon, mascot, abstract — your call).
  'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode'

const Dragon3D = () => {
  const [info, setInfo] = useState(true)

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-20 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="text-center mb-6 sm:mb-10">
          <p className="luxe-eyebrow text-violet-300/80">— Interactive 3D</p>
          <h1 className="luxe-section-title text-4xl sm:text-5xl text-white mt-3">
            3D Scene
          </h1>
          <p className="luxe-body-muted mt-3 max-w-xl mx-auto">
            Drag to rotate, scroll to zoom. Built with Spline + Three.js.
            Replace the scene URL to swap in any model you want.
          </p>
        </header>

        {/* The 3D stage */}
        <div className="luxe-card overflow-hidden">
          <div className="relative w-full" style={{ height: 'min(72vh, 640px)' }}>
            <SplineScene scene={SCENE_URL} className="!w-full !h-full" />

            {/* Hint pill — dismissable */}
            {info && (
              <button
                onClick={() => setInfo(false)}
                className="absolute top-4 right-4 luxe-card px-3 py-2 text-[11px] text-gray-300 hover:text-white transition-colors group">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  Drag · Scroll · Click
                  <span className="text-gray-500 group-hover:text-rose-300 ml-2">✕</span>
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Notes / instructions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="luxe-card p-5">
            <p className="luxe-eyebrow text-cyan-300/80">— Customise</p>
            <h3 className="text-white font-semibold mt-2">Bring your own scene</h3>
            <p className="luxe-body-muted text-sm mt-2">
              Build any 3D model on{' '}
              <a href="https://app.spline.design" target="_blank" rel="noreferrer"
                className="text-violet-300 hover:underline">
                app.spline.design
              </a>
              , export → React, copy the .splinecode URL, paste it into{' '}
              <code className="bg-gray-900/80 border border-gray-800 rounded px-1.5 py-0.5 text-xs text-gray-300">
                src/pages/Dragon3D.jsx
              </code>{' '}
              and you're live.
            </p>
          </div>
          <div className="luxe-card p-5">
            <p className="luxe-eyebrow text-fuchsia-300/80">— Performance</p>
            <h3 className="text-white font-semibold mt-2">Lazy-loaded runtime</h3>
            <p className="luxe-body-muted text-sm mt-2">
              The Spline runtime is React-lazy + Suspense, so the WebGL engine
              only ships when this route loads. Other pages stay fast.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dragon3D
