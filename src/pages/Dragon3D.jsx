import { useState } from 'react'
import { Tabs } from 'antd'
import {
  ThunderboltOutlined, VideoCameraOutlined, BulbOutlined,
  AppstoreOutlined, EyeOutlined,
} from '@ant-design/icons'
import SplineScene from '../components/luxe/SplineScene'
import PromptToThree from '../components/luxe/PromptToThree'
import PromptToMesh from '../components/luxe/PromptToMesh'
import MeshLibrary from '../components/luxe/MeshLibrary'
import MeshVisualize from '../components/luxe/MeshVisualize'

// /3d — five tabs:
//   1) Generate          — Groq DSL → live Three.js
//   2) Studio Pro        — text → 5090-generated GLB (PromptToMesh)
//   3) Library           — every past mesh job, paginated, with status,
//                          reference image, params, and "open in viewer"
//                          that hands the URL back to Studio Pro
//   4) Visualize         — drop any GLB/GLTF/OBJ/STL/PLY and view it in
//                          the same canvas (no generation)
//   5) Showcase          — static Spline community scene
//
// The Spline runtime is lazy-loaded inside <SplineScene>, so the
// Showcase tab only pulls the heavy WebGL runtime when picked.

const SHOWCASE_SCENE_URL =
  'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode'

export default function Dragon3D() {
  const [tab, setTab] = useState('generate')
  // When the user clicks "Open in viewer" on a Library row, we set this
  // and switch to Studio Pro so the existing PromptToMesh viewer renders
  // the historical GLB. PromptToMesh reads it via a `presetGlbUrl` prop.
  const [presetGlbUrl, setPresetGlbUrl] = useState('')

  const onPickFromLibrary = (row) => {
    if (!row?.glbUrl) return
    setPresetGlbUrl(row.glbUrl)
    setTab('5090')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-20 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-6 sm:mb-10">
          <p className="luxe-eyebrow text-cyan-300/80">— Interactive 3D</p>
          <h1 className="luxe-section-title text-4xl sm:text-5xl text-white mt-3">
            Generate a 3D scene
          </h1>
          <p className="luxe-body-muted mt-3 max-w-xl mx-auto">
            Type a description — get a Three.js scene live, render a real
            mesh on the 5090, browse past jobs, or drop in your own model.
          </p>
        </header>

        <Tabs
          activeKey={tab}
          onChange={setTab}
          size="large"
          items={[
            {
              key: 'generate',
              label: <span><BulbOutlined /> Generate</span>,
              children: <PromptToThree />,
            },
            {
              key: '5090',
              label: <span><ThunderboltOutlined /> Studio Pro</span>,
              children: <PromptToMesh presetGlbUrl={presetGlbUrl} clearPreset={() => setPresetGlbUrl('')} />,
            },
            {
              key: 'library',
              label: <span><AppstoreOutlined /> Library</span>,
              children: <MeshLibrary onPickRow={onPickFromLibrary} />,
            },
            {
              key: 'visualize',
              label: <span><EyeOutlined /> Visualize</span>,
              children: <MeshVisualize />,
            },
            {
              key: 'showcase',
              label: <span><VideoCameraOutlined /> Showcase</span>,
              children: (
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
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
