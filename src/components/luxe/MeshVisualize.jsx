// MeshVisualize — drop any GLB/GLTF/OBJ/STL/PLY file (or any pasted URL)
// into the same MeshViewerCanvas the generator uses. Pure viewer — no
// generation, no BE. The user might have their own meshes and just
// want a quick way to inspect / screenshot / export them in a different
// format.
//
// Loaders: three.js ships GLTF/OBJ/STL/PLY in `examples/jsm/loaders`.
// We lazy-instantiate the loader matching the file extension, parse to a
// THREE.Group, write it out as a Blob URL, and feed it to the existing
// MeshViewerCanvas (which already knows how to load via drei's useGLTF).
//
// For non-GLTF inputs we wrap the parsed scene in a tiny GLTFExporter
// roundtrip so MeshViewerCanvas's GLTF-based render path still works
// without a second code path. The export is sync-fast (single mesh,
// ~50-200ms) so the user doesn't see a hang.

import { useRef, useState } from 'react'
import { Modal, message as antMessage } from 'antd'
import { UploadOutlined, LinkOutlined, ClearOutlined } from '@ant-design/icons'
import * as THREE from 'three'
import { GLTFLoader }   from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader }    from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader }    from 'three/examples/jsm/loaders/STLLoader.js'
import { PLYLoader }    from 'three/examples/jsm/loaders/PLYLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import MeshViewerCanvas from './MeshViewerCanvas'
import useQueryState from '../../hooks/useQueryState'

const ACCEPTED = '.glb,.gltf,.obj,.stl,.ply'
const SUPPORTED_HINT = 'GLB · GLTF · OBJ · STL · PLY'

// Build a Blob URL out of whatever the user dropped. GLB / GLTF go
// straight through. The other three are parsed via three.js loaders,
// wrapped in a Group, exported as a GLB Blob, and that Blob URL is
// what MeshViewerCanvas loads.
async function fileToGlbUrl(file) {
  const lower = file.name.toLowerCase()
  const ext = lower.slice(lower.lastIndexOf('.') + 1)

  if (ext === 'glb' || ext === 'gltf') {
    return URL.createObjectURL(file)
  }

  const arrayBuffer = await file.arrayBuffer()
  let object
  if (ext === 'obj') {
    const text = new TextDecoder().decode(arrayBuffer)
    object = new OBJLoader().parse(text)
  } else if (ext === 'stl') {
    const geometry = new STLLoader().parse(arrayBuffer)
    const material = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.6 })
    object = new THREE.Mesh(geometry, material)
  } else if (ext === 'ply') {
    const geometry = new PLYLoader().parse(arrayBuffer)
    geometry.computeVertexNormals()
    const material = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.6, vertexColors: !!geometry.attributes.color })
    object = new THREE.Mesh(geometry, material)
  } else {
    throw new Error(`Unsupported extension: .${ext}`)
  }

  // Re-export as binary GLB so MeshViewerCanvas's GLTF render path
  // can pick it up without a second code path. Smaller files (<10MB)
  // finish in ~100ms; bigger ones could chug — surface a notice if so.
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter()
    exporter.parse(
      object,
      (result) => {
        const blob = result instanceof ArrayBuffer
          ? new Blob([result], { type: 'model/gltf-binary' })
          : new Blob([JSON.stringify(result)], { type: 'model/gltf+json' })
        resolve(URL.createObjectURL(blob))
      },
      (err) => reject(err),
      { binary: true }
    )
  })
}

export default function MeshVisualize() {
  const [glbUrl, setGlbUrl] = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [pasteUrl, setPasteUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef(null)

  // Render-side state — kept lean for the viewer. The generator tab has
  // the full kit (materials, environments, decimation); here we expose
  // just the essentials so the page stays focused on "look at my mesh".
  // Render-side knobs mirrored to URL so refresh keeps the same material
  // + environment + autorotate combo. `viz` prefix avoids collisions
  // with the same-named keys on other tabs.
  const [materialMode, setMaterialMode] = useQueryState('vizMat', 'original', {
    allowed: ['original', 'matte', 'metal', 'glass', 'wireframe', 'normals'],
  })
  const [envPreset, setEnvPreset]       = useQueryState('vizEnv', 'city', {
    allowed: ['city', 'studio', 'sunset', 'night', 'forest', 'none'],
  })
  const [autoRotate, setAutoRotate]     = useQueryState('vizSpin', true, {
    parse: (s) => s === '1', serialize: (v) => v ? '1' : '0',
  })
  const viewerRef = useRef(null)

  const handleFile = async (file) => {
    if (!file) return
    setLoading(true)
    try {
      const url = await fileToGlbUrl(file)
      // Free any previous Blob URL so we don't pile up DataURLs in memory.
      if (glbUrl?.startsWith('blob:')) URL.revokeObjectURL(glbUrl)
      setGlbUrl(url)
      setSourceLabel(file.name)
    } catch (err) {
      antMessage.error(`Failed to load: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleFileInput = (event) => {
    const file = event.target.files?.[0]
    handleFile(file)
    event.target.value = ''
  }

  const handleDrop = (event) => {
    event.preventDefault()
    const file = event.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }

  const handlePaste = async () => {
    const url = pasteUrl.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      antMessage.warning('URL must start with http(s)://')
      return
    }
    // For pasted URLs we trust the extension. If it's not a GLB/GLTF,
    // the user has to download it locally + drop it in (CORS would
    // block our re-export pass on most public hosts anyway).
    setGlbUrl(url)
    setSourceLabel(url.split('/').pop() || 'pasted URL')
    setPasteUrl('')
  }

  const clear = () => {
    if (glbUrl?.startsWith('blob:')) URL.revokeObjectURL(glbUrl)
    setGlbUrl('')
    setSourceLabel('')
  }

  const screenshot = () => {
    const dataUrl = viewerRef.current?.takeScreenshot?.()
    if (!dataUrl) return
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${sourceLabel.replace(/\.[^.]+$/, '') || 'mesh'}-${Date.now()}.png`
    document.body.appendChild(link); link.click(); link.remove()
  }

  // Untextured-export toggle (same semantics as PromptToMesh): when on,
  // strips materials and bakes a flat clay before exporting. Useful when
  // the user wants the raw geometry for 3D printing or repainting.
  const [exportUntextured, setExportUntextured] = useState(false)

  const exportAs = async (format) => {
    const ok = await viewerRef.current?.exportMesh?.(format, {
      untextured: exportUntextured,
      filename: exportUntextured ? 'mesh-clay' : 'mesh',
    })
    if (!ok) antMessage.error(`Export to .${format} failed`)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Viewer */}
      <div className="lg:col-span-3 luxe-card overflow-hidden">
        <div
          className="relative w-full"
          style={{ height: 'min(60vh, 540px)' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}>
          <MeshViewerCanvas
            ref={viewerRef}
            glbUrl={glbUrl}
            materialMode={materialMode}
            envPreset={envPreset}
            autoRotate={autoRotate}
            background="#06060a"
          />
          {!glbUrl && !loading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center px-6">
                <p className="text-sm text-gray-300 font-medium mb-1">Drop a mesh file here</p>
                <p className="text-[11px] text-gray-500 font-mono">{SUPPORTED_HINT}</p>
              </div>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 mx-auto mb-2 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-gray-300">Parsing mesh…</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right rail — file picker, paste URL, render options, exports */}
      <div className="lg:col-span-2 space-y-3">
        <div className="luxe-card p-4">
          <p className="luxe-eyebrow mb-2">— Visualize a mesh</p>
          <p className="text-xs text-gray-400 mb-3">
            Upload or paste any {SUPPORTED_HINT} file. Renders in the same viewer the generator uses.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            onChange={handleFileInput}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold rounded-md border border-amber-400/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">
            <UploadOutlined /> Choose file
          </button>
          <div className="mt-2 flex gap-1.5">
            <input
              type="text"
              value={pasteUrl}
              onChange={e => setPasteUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePaste()}
              placeholder="https://…/model.glb"
              className="luxe-input text-xs flex-1 font-mono"
            />
            <button
              onClick={handlePaste}
              className="px-2.5 py-1.5 rounded-md text-[11px] border border-gray-800 hover:border-gray-700 text-gray-300 inline-flex items-center gap-1">
              <LinkOutlined /> Load
            </button>
          </div>
          {sourceLabel && (
            <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-mono text-gray-400 border-t border-gray-800 pt-2">
              <span className="truncate">{sourceLabel}</span>
              <button
                onClick={clear}
                className="text-gray-500 hover:text-rose-300 inline-flex items-center gap-1">
                <ClearOutlined /> Clear
              </button>
            </div>
          )}
        </div>

        {/* Quick render controls — minimal subset for the visualize tab */}
        {glbUrl && (
          <div className="luxe-card p-4 space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300 mb-1.5">Material</p>
              <div className="flex flex-wrap gap-1">
                {['original', 'matte', 'metal', 'glass', 'wireframe', 'normals'].map(mode => (
                  <button key={mode}
                    onClick={() => setMaterialMode(mode)}
                    className={`px-2 py-1 rounded text-[10px] font-semibold border ${
                      materialMode === mode
                        ? 'border-amber-400/60 bg-amber-500/12 text-amber-200'
                        : 'border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}>
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300 mb-1.5">Environment</p>
              <div className="flex flex-wrap gap-1">
                {['city', 'studio', 'sunset', 'night', 'forest', 'none'].map(preset => (
                  <button key={preset}
                    onClick={() => setEnvPreset(preset)}
                    className={`px-2 py-1 rounded text-[10px] font-semibold border ${
                      envPreset === preset
                        ? 'border-amber-400/60 bg-amber-500/12 text-amber-200'
                        : 'border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}>
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-300">
              <input type="checkbox" checked={autoRotate} onChange={e => setAutoRotate(e.target.checked)} />
              Auto-rotate
            </label>

            {/* Export — same multi-format roundtrip the generator offers,
                with the Untextured toggle that strips materials before
                writing for a raw-geometry / 3D-print friendly handoff. */}
            <div className="pt-2 border-t border-gray-800">
              <div className="flex items-center justify-between mb-1.5 gap-3 flex-wrap">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">Export as</p>
                <label className="inline-flex items-center gap-1.5 text-[10px] text-gray-300 cursor-pointer">
                  <input type="checkbox"
                    checked={exportUntextured}
                    onChange={e => setExportUntextured(e.target.checked)} />
                  Untextured / clay
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['glb', 'obj', 'stl', 'ply'].map(fmt => (
                  <button key={fmt}
                    onClick={() => exportAs(fmt)}
                    className="text-[10px] font-semibold px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20">
                    .{fmt}
                  </button>
                ))}
                <button
                  onClick={screenshot}
                  className="text-[10px] font-semibold px-2 py-1 rounded border border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20">
                  PNG
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
