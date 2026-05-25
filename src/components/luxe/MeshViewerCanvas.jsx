// MeshViewerCanvas — the rich Three.js stage for /3d.
//
// Responsibilities:
//   - Load the GLB at `url` via drei's useGLTF.
//   - Auto-center + auto-scale to a unit cube so framing always works.
//   - Apply a chosen *material mode* (original | matte | metal | glass |
//     toon | wireframe | normals | x-ray) by walking the scene graph and
//     swapping each mesh's material non-destructively.
//   - Live polygon decimation via SimplifyModifier when the user pulls
//     the decimation slider below 1.0.
//   - Configurable environment HDRI, background color, auto-rotate speed,
//     light intensity.
//   - Imperative handle (via ref) exposing:
//       takeScreenshot()      → png data url
//       exportMesh(format)    → triggers download (glb / obj / stl / ply)
//       resetCamera()         → re-aim to default
//       setCameraView(view)   → 'front' | 'back' | 'top' | 'iso'
//       getStats()            → { vertices, triangles, meshes }
//
// Why imperative: the controls panel lives outside the Canvas tree, so a
// pure-props approach would force the Canvas to re-render on every button
// press. The ref pattern lets parents fire one-shot actions cheaply.

import {
  Suspense, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls, Environment, Grid, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js'

// ── public option lists (also imported by the parent panel) ──────────
export const MATERIAL_MODES = [
  { id: 'original',  label: 'Original',   tint: '#fbbf24' },
  { id: 'matte',     label: 'Matte',      tint: '#e5e7eb' },
  { id: 'metal',     label: 'Metal',      tint: '#94a3b8' },
  { id: 'glass',     label: 'Glass',      tint: '#67e8f9' },
  { id: 'toon',      label: 'Toon',       tint: '#fb7185' },
  { id: 'wireframe', label: 'Wireframe',  tint: '#a78bfa' },
  { id: 'normals',   label: 'Normals',    tint: '#22d3ee' },
  { id: 'xray',      label: 'X-Ray',      tint: '#34d399' },
  { id: 'clay',      label: 'Clay',       tint: '#f97316' },
]

export const ENV_PRESETS = [
  { id: 'none',      label: 'None'      },
  { id: 'city',      label: 'City'      },
  { id: 'studio',    label: 'Studio'    },
  { id: 'sunset',    label: 'Sunset'    },
  { id: 'dawn',      label: 'Dawn'      },
  { id: 'night',     label: 'Night'     },
  { id: 'warehouse', label: 'Warehouse' },
  { id: 'forest',    label: 'Forest'    },
  { id: 'park',      label: 'Park'      },
  { id: 'lobby',     label: 'Lobby'     },
  { id: 'apartment', label: 'Apartment' },
]

export const BACKGROUND_PRESETS = [
  { id: 'void',     label: 'Void',     value: '#06060a' },
  { id: 'ink',      label: 'Ink',      value: '#0a0a0e' },
  { id: 'graphite', label: 'Graphite', value: '#1f2937' },
  { id: 'white',    label: 'White',    value: '#f8fafc' },
  { id: 'amber',    label: 'Amber',    value: '#1c1209' },
  { id: 'violet',   label: 'Violet',   value: '#1a0f2e' },
  { id: 'ocean',    label: 'Ocean',    value: '#0c1b2e' },
]

export const CAMERA_VIEWS = [
  { id: 'iso',   label: 'Iso',   pos: [2.2, 1.8, 2.2] },
  { id: 'front', label: 'Front', pos: [0, 0, 3] },
  { id: 'back',  label: 'Back',  pos: [0, 0, -3] },
  { id: 'top',   label: 'Top',   pos: [0, 3, 0.001] },
  { id: 'side',  label: 'Side',  pos: [3, 0, 0] },
]

// ── material factories ───────────────────────────────────────────────
function makeMaterial(mode) {
  switch (mode) {
    case 'matte':
      return new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 1, metalness: 0 })
    case 'metal':
      return new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.18, metalness: 0.95 })
    case 'glass':
      return new THREE.MeshPhysicalMaterial({
        color: '#a5f3fc', roughness: 0.05, metalness: 0,
        transmission: 0.95, thickness: 0.6, ior: 1.45,
        transparent: true, opacity: 0.6,
      })
    case 'toon':
      return new THREE.MeshToonMaterial({ color: '#fb7185' })
    case 'wireframe':
      return new THREE.MeshBasicMaterial({ color: '#a78bfa', wireframe: true })
    case 'normals':
      return new THREE.MeshNormalMaterial()
    case 'xray':
      return new THREE.MeshBasicMaterial({
        color: '#34d399', transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    case 'clay':
      return new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.85, metalness: 0.05, flatShading: true })
    default:
      return null   // 'original' — keep gltf-baked material
  }
}

// ── GltfModel ────────────────────────────────────────────────────────
// Loads the GLB, clones it (drei caches globally), auto-frames it, then
// applies the chosen material + optional decimation + wireframe overlay.
// resolveGlbUrl — handles both legacy Cloudinary URLs (full http/https)
// and the new BE-served BLOB endpoint (`/api/mesh/file/:jobId`). drei's
// useGLTF won't follow a relative URL, so we prepend VITE_BE_URL when
// the path looks like a BE route. Anything else (data: URIs, blob: URLs
// from Visualize's local file path) passes through unchanged.
function resolveGlbUrl(url) {
  if (!url) return url
  if (/^(https?:|data:|blob:)/i.test(url)) return url
  if (url.startsWith('/')) {
    const beBase = import.meta.env.VITE_BE_URL || ''
    return `${beBase}${url}`
  }
  return url
}

function GltfModel({ url, materialMode, decimation, wireframeOverlay, smoothShading, onLoaded }) {
  const { scene } = useGLTF(resolveGlbUrl(url))

  // Clone-once. Re-clone whenever url changes (parent re-keys Suspense).
  const cloned = useMemo(() => scene.clone(true), [scene])

  // Auto-center + scale to unit cube.
  const framing = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned)
    const size = new THREE.Vector3(); box.getSize(size)
    const c    = new THREE.Vector3(); box.getCenter(c)
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    return { center: c, scale: 1.4 / maxDim }
  }, [cloned])

  // Walk meshes, stash original material, apply chosen mode + optional ops.
  // The wireframe-overlay creates a second wireframe LineSegments child so
  // both the surface AND the edges are visible.
  useEffect(() => {
    const overrideMat = makeMaterial(materialMode)
    let v = 0, t = 0, m = 0

    cloned.traverse(obj => {
      if (!obj.isMesh) return
      m += 1
      // Stash original on first encounter so we can restore.
      if (!obj.userData.__origMat) obj.userData.__origMat = obj.material

      // Decimation — only when factor < 0.99 and geometry is non-trivial.
      let geom = obj.geometry
      const origGeom = obj.userData.__origGeom || obj.geometry
      obj.userData.__origGeom = origGeom

      if (decimation < 0.99 && origGeom.attributes?.position?.count > 60) {
        try {
          // SimplifyModifier needs a flat-indexed BufferGeometry.
          const work = origGeom.clone()
          if (!work.index) {
            // Non-indexed → can't simplify. Skip.
          } else {
            const targetTris = Math.max(20, Math.floor(work.index.count / 3 * decimation))
            const removeCount = Math.max(0, (work.index.count / 3) - targetTris) * 3
            const modifier = new SimplifyModifier()
            geom = modifier.modify(work, Math.floor(removeCount / 3))
          }
        } catch {
          geom = origGeom
        }
      } else {
        geom = origGeom
      }
      obj.geometry = geom

      // Apply material override OR restore original.
      obj.material = overrideMat ? overrideMat.clone() : obj.userData.__origMat
      if (obj.material && smoothShading !== undefined) {
        obj.material.flatShading = !smoothShading
        obj.material.needsUpdate = true
      }

      // Strip any prior wireframe overlay child.
      const prior = obj.children.find(c => c.userData?.__wireOverlay)
      if (prior) obj.remove(prior)

      if (wireframeOverlay && materialMode !== 'wireframe') {
        const wire = new THREE.LineSegments(
          new THREE.WireframeGeometry(geom),
          new THREE.LineBasicMaterial({ color: '#a78bfa', transparent: true, opacity: 0.4 })
        )
        wire.userData.__wireOverlay = true
        obj.add(wire)
      }

      const posAttr = geom.attributes?.position
      if (posAttr) v += posAttr.count
      if (geom.index) t += geom.index.count / 3
      else if (posAttr) t += posAttr.count / 3
    })

    onLoaded?.({ vertices: v, triangles: Math.round(t), meshes: m, root: cloned })
  }, [cloned, materialMode, decimation, wireframeOverlay, smoothShading, onLoaded])

  return (
    <group
      scale={framing.scale}
      position={[
        -framing.center.x * framing.scale,
        -framing.center.y * framing.scale,
        -framing.center.z * framing.scale,
      ]}
    >
      <primitive object={cloned} />
    </group>
  )
}

// ── ImperativeBridge ─────────────────────────────────────────────────
// Sits inside the Canvas so it can capture the renderer + camera +
// controls refs, then exposes them on a ref to the parent.
function ImperativeBridge({ controlsRef, bridgeRef, onCameraReadyRef }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    if (!bridgeRef) return
    bridgeRef.current = {
      gl, scene, camera,
      controls: () => controlsRef.current,
    }
  }, [gl, scene, camera, bridgeRef, controlsRef])
  // Track frames so screenshot reads the latest render.
  useFrame(() => {})
  return null
}

// ── AutoRotateBinder ─────────────────────────────────────────────────
// Drives OrbitControls' autoRotate from outside props. Lives inside the
// Canvas so it can poke controlsRef each frame without re-rendering.
function AutoRotateBinder({ controlsRef, enabled, speed }) {
  useFrame(() => {
    const c = controlsRef.current
    if (!c) return
    c.autoRotate = !!enabled
    c.autoRotateSpeed = speed
    c.update()
  })
  return null
}

// ── Main export ──────────────────────────────────────────────────────
const MeshViewerCanvas = forwardRef(function MeshViewerCanvas({
  glbUrl,
  materialMode      = 'original',
  envPreset         = 'city',
  background        = '#06060a',
  showGrid          = false,
  showShadows       = true,
  autoRotate        = false,
  autoRotateSpeed   = 1.0,
  lightIntensity    = 1.0,
  decimation        = 1.0,
  wireframeOverlay  = false,
  smoothShading     = true,
  onStats,
  className         = '',
}, ref) {
  const controlsRef = useRef(null)
  const bridgeRef   = useRef(null)
  const [modelRoot, setModelRoot] = useState(null)

  const handleLoaded = useMemo(() => (info) => {
    setModelRoot(info.root)
    onStats?.({ vertices: info.vertices, triangles: info.triangles, meshes: info.meshes })
  }, [onStats])

  // Imperative API exposed to the parent.
  useImperativeHandle(ref, () => ({
    takeScreenshot: () => {
      const b = bridgeRef.current
      if (!b) return null
      // Render once explicitly to be sure we capture the current frame.
      b.gl.render(b.scene, b.camera)
      try { return b.gl.domElement.toDataURL('image/png') } catch { return null }
    },
    resetCamera: () => {
      const b = bridgeRef.current
      if (!b) return
      b.camera.position.set(0, 0, 3); b.camera.lookAt(0, 0, 0)
      controlsRef.current?.target?.set(0, 0, 0)
      controlsRef.current?.update?.()
    },
    setCameraView: (view) => {
      const v = CAMERA_VIEWS.find(c => c.id === view) || CAMERA_VIEWS[0]
      const b = bridgeRef.current
      if (!b) return
      b.camera.position.set(...v.pos); b.camera.lookAt(0, 0, 0)
      controlsRef.current?.target?.set(0, 0, 0)
      controlsRef.current?.update?.()
    },
    // exportMesh — saves the mesh in the requested format. `opts`:
    //   - untextured: true  → strip all baked materials and bake a flat
    //                          white-clay material instead. Useful for
    //                          3D printing or as a "raw geometry" download
    //                          when the user wants to repaint elsewhere.
    //   - filename: 'mesh'  → name without extension; defaults to 'mesh'.
    // The override is temporary — materials are restored after the
    // exporter callback fires so the on-screen view doesn't change.
    exportMesh: async (format, opts = {}) => {
      if (!modelRoot) return false
      const { untextured = false, filename = 'mesh' } = opts
      // Stash the live materials (per mesh) and swap to a flat clay
      // before exporting. Restore on the way out — finally-block-safe.
      const stashed = []
      if (untextured) {
        const clay = new THREE.MeshStandardMaterial({
          color: '#e5e7eb', roughness: 1.0, metalness: 0.0,
        })
        modelRoot.traverse(obj => {
          if (!obj.isMesh) return
          stashed.push({ obj, original: obj.material })
          obj.material = clay
        })
      }
      const restore = () => {
        for (const entry of stashed) entry.obj.material = entry.original
      }
      try {
        if (format === 'obj') {
          const exporter = new OBJExporter()
          const text = exporter.parse(modelRoot)
          downloadBlob(new Blob([text], { type: 'text/plain' }), `${filename}.obj`)
        } else if (format === 'stl') {
          const exporter = new STLExporter()
          const text = exporter.parse(modelRoot)
          downloadBlob(new Blob([text], { type: 'text/plain' }), `${filename}.stl`)
        } else if (format === 'ply') {
          const exporter = new PLYExporter()
          await new Promise((resolve, reject) => {
            try {
              exporter.parse(modelRoot, (text) => {
                downloadBlob(new Blob([text], { type: 'text/plain' }), `${filename}.ply`)
                resolve()
              }, { binary: false })
            } catch (e) { reject(e) }
          })
        } else if (format === 'glb') {
          const exporter = new GLTFExporter()
          await new Promise((resolve, reject) => {
            exporter.parse(modelRoot,
              (result) => {
                const blob = result instanceof ArrayBuffer
                  ? new Blob([result], { type: 'model/gltf-binary' })
                  : new Blob([JSON.stringify(result)], { type: 'model/gltf+json' })
                downloadBlob(blob, `${filename}.glb`)
                resolve()
              },
              (e) => reject(e),
              { binary: true }
            )
          })
        }
        return true
      } catch {
        return false
      } finally {
        restore()
      }
    },
  }), [modelRoot])

  return (
    <Canvas
      camera={{ position: [0, 0, 3], fov: 45 }}
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      className={className}
    >
      <Suspense fallback={null}>
        <color attach="background" args={[background]} />
        <ambientLight intensity={0.55 * lightIntensity} />
        <directionalLight position={[4, 6, 5]} intensity={1.2 * lightIntensity} color="#fde68a" />
        <directionalLight position={[-4, -2, -3]} intensity={0.7 * lightIntensity} color="#a78bfa" />

        {glbUrl && (
          <GltfModel
            url={glbUrl}
            materialMode={materialMode}
            decimation={decimation}
            wireframeOverlay={wireframeOverlay}
            smoothShading={smoothShading}
            onLoaded={handleLoaded}
          />
        )}

        {showShadows && glbUrl && (
          <ContactShadows
            position={[0, -0.7, 0]} opacity={0.5} scale={4} blur={2.4} far={1.6}
          />
        )}
        {showGrid && (
          <Grid
            args={[10, 10]} position={[0, -0.7, 0]}
            cellColor="#334155" sectionColor="#475569"
            cellThickness={0.6} sectionThickness={1}
            fadeDistance={8} fadeStrength={1}
          />
        )}

        <OrbitControls
          ref={controlsRef}
          enablePan
          enableZoom
          enableDamping
          dampingFactor={0.08}
          minDistance={1.0}
          maxDistance={10}
        />

        {envPreset !== 'none' && <Environment preset={envPreset} />}

        <AutoRotateBinder controlsRef={controlsRef} enabled={autoRotate} speed={autoRotateSpeed} />
        <ImperativeBridge controlsRef={controlsRef} bridgeRef={bridgeRef} />
      </Suspense>
    </Canvas>
  )
})

export default MeshViewerCanvas

// ── tiny utility ─────────────────────────────────────────────────────
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 1000)
}
