import { useState } from 'react'
import { ThunderboltOutlined, VideoCameraOutlined, BulbOutlined } from '@ant-design/icons'
import SplineScene from '../components/luxe/SplineScene'
import PromptToThree from '../components/luxe/PromptToThree'
import PromptToMesh from '../components/luxe/PromptToMesh'

// /3d — three modes:
//   1) Generate — type a prompt → Groq returns a constrained JSON
//      scene DSL → live Three.js render (no fixed scene URL).
//   2) 5090 — type a prompt → BE Shap-E worker on the 5090 produces
//      a real .glb mesh → drei loads it.
//   3) Showcase — a static Spline community scene as a fallback /
//      gallery option. Swap SCENE_URL with any .splinecode URL.
//
// The Spline runtime is lazy-loaded inside <SplineScene>, so the
// Showcase tab only pulls the heavy WebGL runtime when picked.

const SHOWCASE_SCENE_URL =
  'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode'

const tabs = [
  { id: 'generate', label: 'Generate from prompt', icon: <BulbOutlined /> },
  { id: '5090',     label: 'Studio Pro · real mesh', icon: <ThunderboltOutlined /> },
  { id: 'showcase', label: 'Spline showcase', icon: <VideoCameraOutlined /> },
]

const Dragon3D = () => {
  const [tab, setTab] = useState('generate')   // 'generate' | '5090' | 'showcase'

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-20 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="text-center mb-6 sm:mb-10">
          <p className="luxe-eyebrow text-cyan-300/80">— Interactive 3D</p>
          <h1 className="luxe-section-title text-4xl sm:text-5xl text-white mt-3">
            Generate a 3D scene
          </h1>
          <p className="luxe-body-muted mt-3 max-w-xl mx-auto">
            Type a description — get a Three.js scene live, or render a real
            generated mesh on the 5090 GPU.
          </p>
        </header>

        {/* Tabs */}
        <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`luxe-btn text-xs sm:text-sm inline-flex items-center gap-2 ${
                tab === t.id ? 'luxe-btn-primary' : 'luxe-btn-secondary'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Active tab */}
        {tab === 'generate' && <PromptToThree />}
        {tab === '5090'     && <PromptToMesh />}
        {tab === 'showcase' && (
          <div className="luxe-card overflow-hidden">
            <div className="relative w-full" style={{ height: 'min(72vh, 640px)' }}>
              <SplineScene scene={SHOWCASE_SCENE_URL} className="!w-full !h-full" />
              <div className="absolute top-4 right-4 luxe-card px-3 py-2 text-[11px] text-gray-300">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  Drag · Scroll · Click
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dragon3D
