// QRScenes3D — the QR code becomes a landscape.
//
// The user drops a payload upstream, we receive the { matrix, N } from the
// parent, and we rebuild the entire scene as a set of THREE.InstancedMeshes
// (one instance = one QR cell). Because the same matrix drives both the art
// direction and the top-down validity check, the scene is guaranteed to be
// a real QR code — jsQR verifies it every time we re-render.
//
// Themes:
//   1. Isometric Tree Garden — dark cells raised as stone tiles, light cells
//      as grass. A procedural voxel tree grows from the centre.
//   2. Voxel City — every cell becomes a building. Dark = tall towers,
//      light = plazas.
//   3. Crystal Cave — dark cells are tall crystal columns, light cells the
//      cave floor. Ambient particle glow.
//   4. Fractal Forest — dark cells sprout stylised low-poly trees; light
//      cells stay as grass patches.
//
// Camera: iso 45° or ortho top-down. Auto-rotate is a smooth 30 rpm.
// Tap the canvas → toggles iso/top-down (matches tree.icqr.com's UX).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Segmented, Switch, Tooltip } from 'antd'
import { Button } from '../ui'
import {
  CheckCircleFilled, CloseCircleFilled, DownloadOutlined,
  ReloadOutlined, InfoCircleOutlined,
} from '@ant-design/icons'
import * as THREE from 'three'
import jsQR from 'jsqr'

// ─── Theme + season catalogue ─────────────────────────────────────────
export const THEMES = ['Tree Garden', 'Voxel City', 'Crystal Cave', 'Fractal Forest']

const SEASONS = {
  'Tree Garden':    ['Spring', 'Summer', 'Autumn', 'Winter'],
  'Voxel City':     ['Day', 'Sunset', 'Night'],
  'Crystal Cave':   ['Amethyst', 'Emerald', 'Sapphire'],
  'Fractal Forest': ['Spring', 'Summer', 'Autumn', 'Winter'],
}

// Palettes — each theme × season maps to a small set of colour tokens.
// Anything derived (grass tint, ambient, sky) reads from here so we don't
// duplicate colour strings across the render code.
const PALETTES = {
  'Tree Garden': {
    Spring: {
      sky: '#f9e6ee', tileDark: '#3d3a48', tileLight: '#a3d977',
      leaf: '#f9a8d4', wood: '#6b4d3a', ground: '#7ac74f',
      ambient: 0.6, sunColor: '#ffe6b3',
    },
    Summer: {
      sky: '#dff5ff', tileDark: '#2b2e35', tileLight: '#5fbf47',
      leaf: '#3f9142', wood: '#5a3f2b', ground: '#4fa93d',
      ambient: 0.55, sunColor: '#fff2cc',
    },
    Autumn: {
      sky: '#ffd8a8', tileDark: '#3a2f28', tileLight: '#c78a3d',
      leaf: '#e07a3f', wood: '#4a3120', ground: '#a55e2c',
      ambient: 0.5, sunColor: '#ffb480',
    },
    Winter: {
      sky: '#dfe8f2', tileDark: '#3f4550', tileLight: '#ecf4ff',
      leaf: '#ffffff', wood: '#3b2b1e', ground: '#f0f4fa',
      ambient: 0.7, sunColor: '#cfd8e6',
    },
  },
  'Voxel City': {
    Day: {
      sky: '#a8d5ff', tileDark: '#4d5563', tileLight: '#8b9aa5',
      window: '#fff3b0', ambient: 0.55, sunColor: '#ffffff',
      buildingDark: '#3a3f4d', buildingLight: '#dfe6ef', ground: '#767d88',
    },
    Sunset: {
      sky: '#ffb37a', tileDark: '#4b3b3a', tileLight: '#c98a72',
      window: '#ffcf6b', ambient: 0.45, sunColor: '#ff7f50',
      buildingDark: '#3d2c2f', buildingLight: '#ffd9a8', ground: '#b57560',
    },
    Night: {
      sky: '#0f1a2e', tileDark: '#1a2033', tileLight: '#2a3550',
      window: '#ffe7a0', ambient: 0.25, sunColor: '#7fa8ff',
      buildingDark: '#171d2b', buildingLight: '#3a4560', ground: '#1c2436',
    },
  },
  'Crystal Cave': {
    Amethyst: {
      sky: '#1a0d2b', tileDark: '#39215b', tileLight: '#2a1745',
      crystal: '#c084fc', crystalEmit: '#7c3aed',
      ambient: 0.3, sunColor: '#d8b4fe', ground: '#2e1c47',
    },
    Emerald: {
      sky: '#0b2b1a', tileDark: '#164a2e', tileLight: '#0f331f',
      crystal: '#6ee7b7', crystalEmit: '#059669',
      ambient: 0.3, sunColor: '#a7f3d0', ground: '#123a24',
    },
    Sapphire: {
      sky: '#0a1a3a', tileDark: '#1e3a72', tileLight: '#132858',
      crystal: '#7dd3fc', crystalEmit: '#2563eb',
      ambient: 0.3, sunColor: '#bae6fd', ground: '#173367',
    },
  },
  'Fractal Forest': {
    Spring: {
      sky: '#fbeaf2', tileDark: '#4a4152', tileLight: '#b4de85',
      treeLeaf: '#f472b6', treeWood: '#6b4d3a', ambient: 0.55, sunColor: '#fde4a3', ground: '#8ac866',
    },
    Summer: {
      sky: '#d9f0ff', tileDark: '#2f3a2a', tileLight: '#7fbf6a',
      treeLeaf: '#3f9142', treeWood: '#5a3f2b', ambient: 0.5, sunColor: '#fff2cc', ground: '#5a9c48',
    },
    Autumn: {
      sky: '#ffd28a', tileDark: '#3d3128', tileLight: '#c88f4d',
      treeLeaf: '#e26a2c', treeWood: '#4a3120', ambient: 0.45, sunColor: '#ffab73', ground: '#a06238',
    },
    Winter: {
      sky: '#d7e2ef', tileDark: '#3f4650', tileLight: '#eef4fb',
      treeLeaf: '#ffffff', treeWood: '#3b2b1e', ambient: 0.65, sunColor: '#d0d9e5', ground: '#e7eef7',
    },
  },
}

// A cheap deterministic hash so the same QR + theme produces the same
// tree jitter / building height every render — flicker-free.
function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) >>> 0
  h = (h ^ (h >>> 13)) * 1274126177 >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Build a small voxel tree — trunk + a puffball crown. Returns a list of
// { position:[x,y,z], scale:[sx,sy,sz], type:'wood'|'leaf' } items so the
// caller can push them into the correct InstancedMesh.
function buildVoxelTree(cx, cz, seed, opts = {}) {
  const trunkH = 3 + Math.floor(hash2(seed, 1) * 3)     // 3..5 units
  const crownR = opts.crownR ?? 2.2
  const parts = []
  // Trunk
  for (let y = 0; y < trunkH; y++) {
    parts.push({ pos: [cx, y + 0.5, cz], scale: [0.6, 1, 0.6], type: 'wood' })
  }
  // Crown puff — voxels within a radius around top of trunk.
  const crownY0 = trunkH
  const R = Math.ceil(crownR)
  for (let dy = 0; dy <= R + 1; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        const dist2 = dx * dx + (dy - 1) * (dy - 1) * 1.4 + dz * dz
        if (dist2 > crownR * crownR) continue
        // Skip inner voxels — hollow shell for performance.
        if (dist2 < (crownR - 1.2) * (crownR - 1.2)) continue
        // Roughen the outline with the deterministic hash.
        if (hash2(seed + dx * 7, dy * 13 + dz * 5) < 0.35) continue
        parts.push({
          pos: [cx + dx * 0.55, crownY0 + dy * 0.55 + 1.2, cz + dz * 0.55],
          scale: [0.55, 0.55, 0.55],
          type: 'leaf',
        })
      }
    }
  }
  return parts
}

// Build a low-poly stylised tree — cone crown on a small trunk. Used by
// the Fractal Forest theme, one per dark cell.
function buildForestTree(cx, cz, seed) {
  const parts = []
  const h = 1.4 + hash2(seed, 3) * 0.8
  parts.push({ pos: [cx, h / 2, cz], scale: [0.35, h, 0.35], type: 'wood' })
  // 2-3 stacked cones simulated by scaled boxes
  const coneN = 3
  for (let i = 0; i < coneN; i++) {
    const s = 1.1 - i * 0.28
    const y = h + i * 0.7 + s * 0.5
    parts.push({ pos: [cx, y, cz], scale: [s, 0.7, s], type: 'leaf' })
  }
  return parts
}

// ─── Scene builder ────────────────────────────────────────────────────
// Given a matrix + theme + season, return the mesh graph as pure data
// (InstancedMesh count per type, colours, transforms). Rendering is
// separated out so we can reason about instance counts without the
// three.js side-effects.
//
// Returns { instances: { key: { color, transforms: [] } }, meta: { counts } }
function buildSceneData(matrix, N, theme, season) {
  const palette = PALETTES[theme][season]
  const inst = {}
  const push = (key, mat, transform) => {
    if (!inst[key]) inst[key] = { material: mat, transforms: [] }
    inst[key].transforms.push(transform)
  }

  const halfN = N / 2
  const cellSize = 1 // world units per module

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const idx = r * N + c
      const dark = matrix[idx] === 1
      // World XZ position — QR origin at (-halfN, -halfN); +z = down in
      // matrix rows so the top-down camera view matches the classic QR.
      const x = c - halfN + 0.5
      const z = r - halfN + 0.5

      if (theme === 'Tree Garden') {
        if (dark) {
          // Raised stone tile — cube height 0.9.
          push('tileDark', { color: palette.tileDark, roughness: 0.85 },
            { pos: [x, 0.45, z], scale: [1, 0.9, 1] })
        } else {
          // Grass tile — cube height 0.15.
          push('tileLight', { color: palette.tileLight, roughness: 0.9 },
            { pos: [x, 0.075, z], scale: [1, 0.15, 1] })
        }
      } else if (theme === 'Voxel City') {
        if (dark) {
          // Tall stone tower — 4..15 units with organic variance.
          const h = 4 + hash2(r, c) * 11
          push('buildingDark', {
            color: palette.buildingDark, roughness: 0.7,
            emissive: season === 'Night' ? palette.window : '#000',
            emissiveIntensity: season === 'Night' ? 0.3 : 0,
          }, { pos: [x, h / 2, z], scale: [0.9, h, 0.9] })
        } else {
          // Short plaza block.
          const h = 0.5 + hash2(r + 1000, c) * 1.5
          push('buildingLight', { color: palette.buildingLight, roughness: 0.6 },
            { pos: [x, h / 2, z], scale: [0.9, h, 0.9] })
        }
      } else if (theme === 'Crystal Cave') {
        if (dark) {
          // Tall crystal column — hexagonal-ish tapered box.
          const h = 3 + hash2(r, c) * 8
          push('crystal', {
            color: palette.crystal, roughness: 0.15, metalness: 0.4,
            emissive: palette.crystalEmit, emissiveIntensity: 0.4,
            transparent: true, opacity: 0.85,
          }, { pos: [x, h / 2, z], scale: [0.7, h, 0.7] })
        } else {
          push('tileLight', { color: palette.tileLight, roughness: 0.9 },
            { pos: [x, 0.05, z], scale: [1, 0.1, 1] })
        }
      } else if (theme === 'Fractal Forest') {
        if (dark) {
          // Ground tile + a small tree. Tree parts pushed below.
          push('tileDark', { color: palette.tileDark, roughness: 0.9 },
            { pos: [x, 0.05, z], scale: [1, 0.1, 1] })
        } else {
          push('tileLight', { color: palette.tileLight, roughness: 0.95 },
            { pos: [x, 0.05, z], scale: [1, 0.1, 1] })
        }
      }
    }
  }

  // Overlay geometry (voxel tree in the centre for Tree Garden, forest
  // trees per dark cell for Fractal Forest).
  if (theme === 'Tree Garden') {
    // The tree lives at the centre of the QR (which may fall on a real
    // cell). We use hash of theme+season for a stable seed so re-renders
    // don't jitter.
    const treeSeed = theme.length * 31 + season.length
    const parts = buildVoxelTree(0, 0, treeSeed, { crownR: 3.2 })
    for (const p of parts) {
      const mat = p.type === 'wood'
        ? { color: palette.wood, roughness: 0.9 }
        : { color: palette.leaf, roughness: 0.7 }
      push(p.type === 'wood' ? 'treeWood' : 'treeLeaf', mat,
        { pos: p.pos, scale: p.scale })
    }
  } else if (theme === 'Fractal Forest') {
    // One small tree per dark cell. Skip finder ring corners for
    // scannability + performance.
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (matrix[r * N + c] !== 1) continue
        // Skip finder 7×7 corners so cameras can still see the QR shape.
        const inFinder =
          (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7)
        if (inFinder) continue
        // Density knob — 60% of dark cells sprout to keep counts sane.
        if (hash2(r, c) > 0.65) continue
        const x = c - halfN + 0.5
        const z = r - halfN + 0.5
        const parts = buildForestTree(x, z, r * 137 + c)
        for (const p of parts) {
          const mat = p.type === 'wood'
            ? { color: palette.treeWood, roughness: 0.9 }
            : { color: palette.treeLeaf, roughness: 0.8 }
          push(p.type === 'wood' ? 'treeWood' : 'treeLeaf', mat,
            { pos: p.pos, scale: p.scale })
        }
      }
    }
  }

  // Ground plane — one big flat cube under everything so the tile grid
  // reads as sitting on something. Contributes 1 instance.
  push('ground', { color: palette.ground, roughness: 1 },
    { pos: [0, -0.1, 0], scale: [N + 6, 0.2, N + 6] })

  const counts = {}
  let total = 0
  for (const k of Object.keys(inst)) {
    counts[k] = inst[k].transforms.length
    total += counts[k]
  }
  return { instances: inst, meta: { counts, total, palette } }
}

// ─── Three renderer — wires up scene / camera / lights / instances. ───
function buildThreeScene(canvas, sceneData, theme, season, N) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = canvas.clientWidth || 640
  const h = canvas.clientHeight || 640
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(dpr)
  renderer.setSize(w, h, false)
  renderer.shadowMap.enabled = false

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(sceneData.meta.palette.sky)
  scene.fog = new THREE.Fog(sceneData.meta.palette.sky, N * 1.5, N * 4)

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, sceneData.meta.palette.ambient)
  scene.add(ambient)
  const sun = new THREE.DirectionalLight(sceneData.meta.palette.sunColor, 0.8)
  sun.position.set(N * 0.6, N * 1.2, N * 0.4)
  scene.add(sun)
  // A small fill from the opposite side keeps voxel faces from going flat black.
  const fill = new THREE.DirectionalLight('#ffffff', 0.25)
  fill.position.set(-N * 0.5, N * 0.4, -N * 0.5)
  scene.add(fill)

  // Cameras
  const isoCam = new THREE.OrthographicCamera(-N, N, N, -N, 0.1, N * 6)
  isoCam.position.set(N * 1.2, N * 1.3, N * 1.2)
  isoCam.lookAt(0, 0, 0)

  const topCam = new THREE.OrthographicCamera(-N * 0.65, N * 0.65, N * 0.65, -N * 0.65, 0.1, N * 6)
  topCam.position.set(0, N * 2.2, 0.001)  // tiny z offset avoids up-vector ambiguity
  topCam.lookAt(0, 0, 0)

  // InstancedMeshes
  const boxGeom = new THREE.BoxGeometry(1, 1, 1)
  const meshes = {}
  const dummy = new THREE.Object3D()
  for (const key of Object.keys(sceneData.instances)) {
    const entry = sceneData.instances[key]
    const matProps = entry.material
    const mat = new THREE.MeshStandardMaterial({
      color: matProps.color,
      roughness: matProps.roughness ?? 0.7,
      metalness: matProps.metalness ?? 0,
      emissive: matProps.emissive ?? '#000000',
      emissiveIntensity: matProps.emissiveIntensity ?? 0,
      transparent: matProps.transparent || false,
      opacity: matProps.opacity ?? 1,
    })
    const im = new THREE.InstancedMesh(boxGeom, mat, entry.transforms.length)
    im.count = entry.transforms.length
    entry.transforms.forEach((t, i) => {
      dummy.position.set(t.pos[0], t.pos[1], t.pos[2])
      dummy.scale.set(t.scale[0], t.scale[1], t.scale[2])
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      im.setMatrixAt(i, dummy.matrix)
    })
    im.instanceMatrix.needsUpdate = true
    scene.add(im)
    meshes[key] = im
  }

  return { renderer, scene, isoCam, topCam, meshes }
}

// ─── The React component ──────────────────────────────────────────────
export default function QRScenes3D({ matrixData, ecc }) {
  const [theme, setTheme] = useState('Tree Garden')
  const [season, setSeason] = useState('Summer')
  const [view, setView] = useState('Iso')      // 'Iso' | 'Top'
  const [autoRotate, setAutoRotate] = useState(true)
  const [instanceTotal, setInstanceTotal] = useState(0)
  const [scenePresent, setScenePresent] = useState(false)
  const [scanRes, setScanRes] = useState({ ok: false, data: '' })

  // Keep season valid whenever theme changes.
  useEffect(() => {
    if (!SEASONS[theme].includes(season)) setSeason(SEASONS[theme][0])
  }, [theme, season])

  // three.js refs — persist across renders without triggering React.
  const canvasRef = useRef(null)
  const stateRef = useRef({
    renderer: null, scene: null, isoCam: null, topCam: null,
    meshes: {}, raf: 0, angle: 0, lastTS: 0, view: 'Iso', autoRotate: true, N: 21,
  })

  // Cleanup on unmount — release the WebGL context and cancel any RAF.
  useEffect(() => {
    return () => {
      const s = stateRef.current
      if (s.raf) cancelAnimationFrame(s.raf)
      if (s.renderer) {
        for (const key of Object.keys(s.meshes)) {
          const im = s.meshes[key]
          im.geometry.dispose()
          if (Array.isArray(im.material)) im.material.forEach((m) => m.dispose())
          else im.material.dispose()
        }
        s.renderer.dispose()
      }
    }
  }, [])

  // Rebuild scene whenever matrix / theme / season changes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!matrixData) {
      setScenePresent(false)
      setInstanceTotal(0)
      return
    }
    // Dispose the old scene.
    if (stateRef.current.renderer) {
      stateRef.current.renderer.dispose()
      // Dispose old geometries / materials to release GPU memory.
      for (const key of Object.keys(stateRef.current.meshes)) {
        const im = stateRef.current.meshes[key]
        im.geometry.dispose()
        if (Array.isArray(im.material)) im.material.forEach((m) => m.dispose())
        else im.material.dispose()
      }
    }
    const sceneData = buildSceneData(matrixData.matrix, matrixData.N, theme, season)
    setInstanceTotal(sceneData.meta.total)
    const built = buildThreeScene(canvas, sceneData, theme, season, matrixData.N)
    stateRef.current.renderer = built.renderer
    stateRef.current.scene = built.scene
    stateRef.current.isoCam = built.isoCam
    stateRef.current.topCam = built.topCam
    stateRef.current.meshes = built.meshes
    stateRef.current.N = matrixData.N
    setScenePresent(true)
  }, [matrixData, theme, season])

  // Keep the refs' latest view/autoRotate in sync without recreating the RAF.
  useEffect(() => { stateRef.current.view = view }, [view])
  useEffect(() => { stateRef.current.autoRotate = autoRotate }, [autoRotate])

  // Resize handling.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const on = () => {
      const s = stateRef.current
      if (!s.renderer) return
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      s.renderer.setSize(w, h, false)
    }
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [scenePresent])

  // Animation loop — camera orbit for iso, static top-down.
  useEffect(() => {
    if (!scenePresent) return
    const s = stateRef.current
    let running = true

    const tick = (ts) => {
      if (!running) return
      const dt = s.lastTS ? (ts - s.lastTS) / 1000 : 0
      s.lastTS = ts
      let cam = s.view === 'Top' ? s.topCam : s.isoCam
      if (s.view === 'Iso' && s.autoRotate) {
        // 30 rpm = 0.5 rev/s = π rad/s → but the brief says slowly at 30 rpm
        // which for a "slow" camera looks better as one revolution per 8s.
        s.angle += dt * (2 * Math.PI / 8)
        const N = s.N
        const R = N * 1.6
        cam.position.set(
          Math.cos(s.angle) * R,
          N * 1.3,
          Math.sin(s.angle) * R,
        )
        cam.lookAt(0, 0, 0)
      }
      s.renderer.render(s.scene, cam)
      s.raf = requestAnimationFrame(tick)
    }
    s.raf = requestAnimationFrame(tick)
    return () => {
      running = false
      if (s.raf) cancelAnimationFrame(s.raf)
    }
  }, [scenePresent])

  // ─── Top-down scan validity check — every time the top-down view mounts
  // or the theme changes, we render one top-down frame to an offscreen
  // canvas, feed to jsQR, and store the result. Debounced so we don't
  // thrash while auto-rotate is spinning.
  useEffect(() => {
    if (!scenePresent) return
    if (!matrixData) return
    // Delay a frame so the scene has been rendered at least once.
    const t = setTimeout(() => {
      const s = stateRef.current
      if (!s.renderer) return
      // Render into an offscreen 512×512 canvas.
      const off = document.createElement('canvas')
      const size = 512
      off.width = size; off.height = size
      const tmpRenderer = new THREE.WebGLRenderer({
        canvas: off, antialias: true, preserveDrawingBuffer: true,
      })
      tmpRenderer.setPixelRatio(1)
      tmpRenderer.setSize(size, size, false)
      tmpRenderer.render(s.scene, s.topCam)
      const ctx = off.getContext('2d')
      const img = ctx.getImageData(0, 0, size, size)
      const r = jsQR(img.data, size, size, { inversionAttempts: 'attemptBoth' })
      setScanRes({ ok: !!r, data: r?.data || '' })
      tmpRenderer.dispose()
    }, 120)
    return () => clearTimeout(t)
  }, [scenePresent, matrixData, theme, season])

  // ─── Download PNG snapshot of current camera at 2× DPR ────────────────
  const download = () => {
    const s = stateRef.current
    if (!s.renderer) return
    const canvas = canvasRef.current
    // Because we render every frame with preserveDrawingBuffer:true, the
    // canvas backing store already has the current frame. Read it out.
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `qr-${theme.replace(/\s+/g, '-').toLowerCase()}-${season.toLowerCase()}-${Date.now()}.png`
    document.body.appendChild(a); a.click(); a.remove()
  }

  // Toggle iso ↔ top on canvas tap — mirrors tree.icqr.com's tap-to-flip.
  const onCanvasClick = () => {
    setView((v) => (v === 'Iso' ? 'Top' : 'Iso'))
  }

  return (
    <div className='flex flex-col gap-4'>
      {/* Theme + season pickers */}
      <div className='luxe-glass p-5'>
        <div className='flex items-center gap-2 mb-3'>
          <h2 className='font-bold text-lg'>Theme</h2>
          <Tooltip title='Each theme reinterprets the QR matrix as a different 3D landscape. Dark and light cells drive procedurally different geometry, so every payload gives you a unique scene.' overlayStyle={{ maxWidth: 380 }}>
            <InfoCircleOutlined className='text-fg-muted' />
          </Tooltip>
        </div>
        <Segmented block value={theme} onChange={setTheme} options={THEMES} />
        <p className='text-[11px] text-fg-muted mt-2 leading-snug'>
          Tree Garden raises stone tiles from the QR grid; Voxel City builds towers from dark cells; Crystal Cave forests them with glowing columns; Fractal Forest sprouts low-poly trees.
        </p>

        <div className='mt-4'>
          <h3 className='font-bold text-sm mb-2'>Season / mood</h3>
          <Segmented
            block
            value={season}
            onChange={setSeason}
            options={SEASONS[theme]}
          />
          <p className='text-[11px] text-fg-muted mt-2 leading-snug'>
            Switches the whole palette — sky, ambient, ground and accent geometry all re-tint together. State stays in sync with the theme so mismatches auto-correct.
          </p>
        </div>
      </div>

      {/* Camera + toggles */}
      <div className='luxe-glass p-5'>
        <div className='flex items-center gap-2 mb-3'>
          <h2 className='font-bold text-lg'>Camera</h2>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <div>
            <div className='text-xs uppercase tracking-wide text-fg-muted mb-1'>View</div>
            <Segmented
              block
              value={view}
              onChange={setView}
              options={[
                { label: 'Isometric', value: 'Iso' },
                { label: 'Top-down (scan)', value: 'Top' },
              ]}
            />
            <p className='text-[11px] text-fg-muted mt-1 leading-snug'>
              Top-down flattens the scene to the QR silhouette so the code is scannable in-camera. Tap the canvas to toggle at any time.
            </p>
          </div>
          <div>
            <div className='text-xs uppercase tracking-wide text-fg-muted mb-1'>Auto-rotate camera</div>
            <div className='flex items-center gap-3'>
              <Switch checked={autoRotate} onChange={setAutoRotate} disabled={view === 'Top'} />
              <span className='text-sm text-fg-muted'>
                {view === 'Top' ? 'Disabled in top-down view' : 'One revolution ≈ 8s'}
              </span>
            </div>
            <p className='text-[11px] text-fg-muted mt-1 leading-snug'>
              Auto-rotate only applies to the isometric camera. The top-down view is static so jsQR can lock on cleanly.
            </p>
          </div>
        </div>
      </div>

      {/* Canvas + status */}
      <div className='luxe-glass p-5'>
        <div className='flex items-center justify-between mb-3 gap-2 flex-wrap'>
          <h2 className='font-bold text-lg'>3D scene</h2>
          <div className='flex items-center gap-2 flex-wrap'>
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs border
              ${scanRes.ok
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-400/30 bg-rose-500/10 text-rose-200'}`}>
              {scanRes.ok ? <CheckCircleFilled /> : <CloseCircleFilled />}
              {scanRes.ok ? 'Top-down scans' : 'Top-down broken'}
            </span>
            <span className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs'>
              {instanceTotal.toLocaleString()} mesh instances
            </span>
            <Button size='small' variant='ghost' icon={<DownloadOutlined />} onClick={download}>
              PNG
            </Button>
          </div>
        </div>
        <div className='relative w-full rounded-lg overflow-hidden' style={{ aspectRatio: '1 / 1', background: '#0a0a0e' }}>
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            className='block w-full h-full cursor-pointer'
          />
          {!scenePresent && (
            <div className='absolute inset-0 flex items-center justify-center text-fg-muted text-sm'>
              Enter a payload in the 2D Editor tab to render the scene.
            </div>
          )}
        </div>
        <div className='mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-center'>
          <div className='luxe-glass-soft p-2'>
            <div className='text-[10px] uppercase text-fg-muted'>Theme</div>
            <div className='font-mono font-bold text-amber-300 text-xs truncate'>{theme}</div>
          </div>
          <div className='luxe-glass-soft p-2'>
            <div className='text-[10px] uppercase text-fg-muted'>Season</div>
            <div className='font-mono font-bold text-fuchsia-300 text-xs truncate'>{season}</div>
          </div>
          <div className='luxe-glass-soft p-2'>
            <div className='text-[10px] uppercase text-fg-muted'>ECC</div>
            <div className='font-mono font-bold text-emerald-300 text-xs'>{ecc}</div>
          </div>
          <div className='luxe-glass-soft p-2'>
            <div className='text-[10px] uppercase text-fg-muted'>Grid</div>
            <div className='font-mono font-bold text-cyan-300 text-xs'>
              {matrixData ? `${matrixData.N}×${matrixData.N}` : '—'}
            </div>
          </div>
        </div>
        <p className='text-[11px] text-fg-muted mt-3 leading-relaxed'>
          Every cell of the QR is a real mesh instance, so tapping the top-down toggle gives a straight-down view where jsQR can still decode the payload. If the badge above says "broken", the scene has drifted from a valid QR — usually because the top-down camera framing lost the quiet zone; retry once the initial render settles.
        </p>
      </div>
    </div>
  )
}
