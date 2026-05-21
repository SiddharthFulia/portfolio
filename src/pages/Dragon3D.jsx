import { useState } from 'react'
import SplineScene from '../components/luxe/SplineScene'
import PromptToThree from '../components/luxe/PromptToThree'

// /3d — two modes:
//   1) Generate — type a prompt → Groq returns a constrained JSON
//      scene DSL → live Three.js render (no fixed scene URL).
//   2) Showcase — a static Spline community scene as a fallback /
//      gallery option. Swap SCENE_URL with any .splinecode URL.
//
// The Spline runtime is lazy-loaded inside <SplineScene>, so the
// Showcase tab only pulls the heavy WebGL runtime when picked.

const SHOWCASE_SCENE_URL =
  'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode'

const Dragon3D = () => {
  const [tab, setTab] = useState('generate')   // 'generate' | 'showcase'

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-20 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="text-center mb-6 sm:mb-10">
          <p className="luxe-eyebrow text-violet-300/80">— Interactive 3D</p>
          <h1 className="luxe-section-title text-4xl sm:text-5xl text-white mt-3">
            Generate a 3D scene
          </h1>
          <p className="luxe-body-muted mt-3 max-w-xl mx-auto">
            Type a description — Groq writes a Three.js scene spec in JSON,
            we render it live. No fixed URL, no fixed model. Drag to orbit,
            scroll to zoom.
          </p>
        </header>

        {/* Tabs */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {[
            { id: 'generate', label: '✨ Generate from prompt' },
            { id: 'showcase', label: '🎬 Spline showcase' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`luxe-btn text-xs sm:text-sm ${
                tab === t.id ? 'luxe-btn-primary' : 'luxe-btn-secondary'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Active tab */}
        {tab === 'generate' ? (
          <PromptToThree />
        ) : (
          <>
            <div className="luxe-card overflow-hidden">
              <div className="relative w-full" style={{ height: 'min(72vh, 640px)' }}>
                <SplineScene scene={SHOWCASE_SCENE_URL} className="!w-full !h-full" />
                <div className="absolute top-4 right-4 luxe-card px-3 py-2 text-[11px] text-gray-300">
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                    Drag · Scroll · Click
                  </span>
                </div>
              </div>
            </div>
            <p className="luxe-body-muted text-xs mt-3 text-center">
              Showcase scene URL is configurable —
              swap <code className="bg-gray-900/80 border border-gray-800 rounded px-1.5 py-0.5 text-[11px] text-gray-300">SHOWCASE_SCENE_URL</code> in{' '}
              <code className="bg-gray-900/80 border border-gray-800 rounded px-1.5 py-0.5 text-[11px] text-gray-300">src/pages/Dragon3D.jsx</code>
              {' '}for any{' '}
              <a href="https://app.spline.design" target="_blank" rel="noreferrer" className="text-violet-300 hover:underline">
                Spline
              </a>{' '}export.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default Dragon3D
