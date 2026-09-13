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
//
// ─── Scan-validity architecture ───────────────────────────────────────
// The iso view is fully artistic — trees, towers, crystals, forests, lights.
// But that same geometry would obscure the finder patterns and code modules
// in a top-down snapshot, so jsQR can never lock on.
//
// So we keep the top-down snapshot on a SEPARATE code path
// (renderTopDownFrame). It:
//   • hides every "artistic" mesh (trees, towers, crystals, forest trees)
//   • swaps the tile grid to pure black/white MeshBasic (no lighting)
//   • frames the QR + a 4-module quiet zone
//   • renders to an offscreen 720×720 canvas
//   • feeds the ImageData to jsQR, retrying at 90/180/270°
//   • restores the artistic scene for the next iso frame
// A "Debug frame" button dumps that offscreen buffer as PNG so we can
// inspect exactly what jsQR is decoding.

import { useEffect, useRef, useState } from 'react'
import { Segmented, Switch, Tooltip, Progress } from 'antd'
import { Button } from '../ui'
import {
  CheckCircleFilled, CloseCircleFilled, DownloadOutlined,
  InfoCircleOutlined, BugOutlined,
} from '@ant-design/icons'
import * as THREE from 'three'
import jsQR from 'jsqr'

// ─── Theme + season catalogue ─────────────────────────────────────────
export const THEMES = ['Tree Garden', 'Voxel City', 'Crystal Cave', 'Fractal Forest', 'Tattoo Bloom']

const SEASONS = {
  'Tree Garden':    ['Spring', 'Summer', 'Autumn', 'Winter'],
  'Voxel City':     ['Day', 'Sunset', 'Night'],
  'Crystal Cave':   ['Amethyst', 'Emerald', 'Sapphire'],
  'Fractal Forest': ['Spring', 'Summer', 'Autumn', 'Winter'],
  // Tattoo Bloom — three moods. Palette hexes get overridden at scene-build
  // time from the actual tattoo palette prop; season only picks the
  // atmosphere (sky, ambient warmth) and the neutral fallback tones the
  // scene shows when no palette has been supplied yet.
  'Tattoo Bloom':   ['Ink', 'Blossom', 'Noir'],
}

// Palettes — each theme × season maps to a small set of colour tokens.
// Anything derived (grass tint, ambient, sky) reads from here so we don't
// duplicate colour strings across the render code.
const PALETTES = {
  'Tree Garden': {
    Spring: {
      sky: '#f9e6ee', tileDark: '#3d3a48', tileLight: '#8ec96a',
      leaf: '#f9a8d4', wood: '#4a2f1c', ground: '#7ac74f',
      ambient: 0.55, sunColor: '#ffe6b3',
      // Per-leaf palette — a pastel spring mix (pink blossom + cream + tender green).
      leafPalette: ['#f9c5d5', '#fbd6e4', '#fff1c1', '#c6e6a4', '#a2d47a'],
      grassTuft: '#5b9b3a', snow: null,
    },
    Summer: {
      sky: '#dff5ff', tileDark: '#2b2e35', tileLight: '#5fbf47',
      leaf: '#3f9142', wood: '#4a2f1c', ground: '#4fa93d',
      ambient: 0.5, sunColor: '#fff2cc',
      // Rich mixed greens — deep shadow → mid canopy → sunlit tips.
      leafPalette: ['#2f7a34', '#3f9142', '#4faa4f', '#6bbf5c', '#88cc6b'],
      grassTuft: '#357a2c', snow: null,
    },
    Autumn: {
      sky: '#ffd8a8', tileDark: '#3a2f28', tileLight: '#c78a3d',
      leaf: '#e07a3f', wood: '#4a2f1c', ground: '#a55e2c',
      ambient: 0.5, sunColor: '#ffb480',
      // Mustard yellow + burnt orange + brick red + brown.
      leafPalette: ['#d4a017', '#e07a3f', '#c85a2b', '#8f3b1c', '#6b3a20'],
      grassTuft: '#8c5a2c', snow: null,
    },
    Winter: {
      sky: '#dfe8f2', tileDark: '#3f4550', tileLight: '#ecf4ff',
      leaf: '#ffffff', wood: '#3b2b1e', ground: '#f0f4fa',
      ambient: 0.7, sunColor: '#cfd8e6',
      // A few sparse snow-white leaves + a snow cap on the trunk.
      leafPalette: ['#ffffff', '#f4f8fb', '#e7edf3'],
      grassTuft: '#c9d3dd', snow: '#ffffff',
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
  // Tattoo Bloom — the palette tokens act as *fallbacks*. When the caller
  // supplies a real palette (from BE deep-vision), buildSceneDataTattoo
  // overrides skin/ink/bloomTop/bloomStub with the palette's brightest hex,
  // its darkest hex, its most saturated hex, and a mid accent — so every
  // tattoo drives its own unique bloom colouring.
  'Tattoo Bloom': {
    Ink: {
      // Warm skin-tone floor, black ink, magenta/violet accents.
      sky: '#f4e2d3', tileDark: '#1a1a20', tileLight: '#f2d5b8',
      skin: '#f2d5b8', ink: '#141418',
      bloomTop: '#d946ef', bloomStub: '#fb7185',
      ground: '#e8c4a2', ambient: 0.55, sunColor: '#fff1d8',
    },
    Blossom: {
      // Cream skin, deep charcoal ink, rose + peach bloom.
      sky: '#fdeef1', tileDark: '#232028', tileLight: '#fbe0e6',
      skin: '#fbe0e6', ink: '#1b1720',
      bloomTop: '#f472b6', bloomStub: '#fca5a5',
      ground: '#f5cdd2', ambient: 0.6, sunColor: '#ffe4ec',
    },
    Noir: {
      // Cool low-key mood — pale bluish skin, jet ink, cyan/amber accents.
      sky: '#dfe5ef', tileDark: '#0f1218', tileLight: '#c9d3e0',
      skin: '#c9d3e0', ink: '#0b0d13',
      bloomTop: '#22d3ee', bloomStub: '#fbbf24',
      ground: '#a7b3c2', ambient: 0.4, sunColor: '#e0e8f2',
    },
  },
}

// Mesh keys that represent "artistic" geometry — everything that must be
// hidden when we take the top-down scan snapshot. The tile grid + finder
// pattern stays visible. `ground` is a big under-plate that also needs to
// stay hidden so the QR sits on a clean quiet-zone white background.
const ARTISTIC_KEYS = new Set([
  'treeWood', 'treeLeaf',      // Tree Garden voxel tree, Fractal Forest trees
  'buildingDark', 'buildingLight', // Voxel City towers (both dark towers + light plazas
                                    // — light plazas are also raised blocks that
                                    // would occlude the flat scan grid)
  'crystal',                    // Crystal Cave columns
  'tattooBloomTower',           // Tattoo Bloom tall silhouette columns
  'tattooBloomStub',            // Tattoo Bloom mid-height silhouette stubs
  'tattooFloor',                // Tattoo Bloom raised QR floor cells (dark)
  'tattooGround',               // Tattoo Bloom flat skin ground (light)
  'ground',                     // Big fog-tinted under-plate
])

// A cheap deterministic hash so the same QR + theme produces the same
// tree jitter / building height every render — flicker-free.
function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) >>> 0
  h = (h ^ (h >>> 13)) * 1274126177 >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Deterministic RNG that walks forward — useful when we need a stream of
// pseudo-randoms per tree (branches, leaves, tufts) but still want the
// same shape on re-render.
function makeRng(seed) {
  let s = (seed | 0) || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// Convert a hex to a THREE.Color, then jitter its HSL slightly so a batch
// of "the same colour" reads as a hand-painted variance range instead of
// a flat block.
function jitterColor(hex, rng, satJ = 0.1, lightJ = 0.1) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  hsl.s = Math.max(0, Math.min(1, hsl.s + (rng() - 0.5) * satJ * 2))
  hsl.l = Math.max(0, Math.min(1, hsl.l + (rng() - 0.5) * lightJ * 2))
  c.setHSL(hsl.h, hsl.s, hsl.l)
  return c
}

// easeInOutCubic — used for the iso ↔ top-down camera transition.
const easeInOutCubic = (t) => (t < 0.5
  ? 4 * t * t * t
  : 1 - Math.pow(-2 * t + 2, 3) / 2)

// ─── Tattoo Bloom palette derivation ──────────────────────────────────
// Take a BE-supplied palette (array of { hex, weight }) and pick out four
// semantic slots:
//   • skin     — the brightest (highest luminance) entry, used as the flat
//                ground the QR sits on
//   • ink      — the darkest entry (already used as tileDark)
//   • bloomTop — the most saturated entry, used to tint tall bloom towers
//   • bloomStub — the second-most-saturated entry, used for shorter stubs
// If the palette is missing or too small, callers get null slots and the
// existing per-season fallback palette handles it.
function resolveTattooPalette(basePalette, external) {
  if (!Array.isArray(external) || external.length === 0) return basePalette
  const hexes = external.map((c) => (c?.hex || '').trim()).filter(Boolean)
  if (hexes.length === 0) return basePalette
  const stats = hexes.map((hex) => {
    const rgb = [0, 0, 0]
    const s = hex.replace('#', '')
    const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16)
    rgb[0] = (n >> 16) & 255; rgb[1] = (n >> 8) & 255; rgb[2] = n & 255
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
    const max = Math.max(rgb[0], rgb[1], rgb[2])
    const min = Math.min(rgb[0], rgb[1], rgb[2])
    const sat = max === 0 ? 0 : (max - min) / max
    return { hex, lum, sat }
  })
  const brightest = [...stats].sort((a, b) => b.lum - a.lum)[0]
  const darkest   = [...stats].sort((a, b) => a.lum - b.lum)[0]
  const bySat     = [...stats].sort((a, b) => b.sat - a.sat)
  const bloomTop  = bySat[0]
  const bloomStub = bySat[1] || bySat[0]
  return {
    ...basePalette,
    skin:      brightest?.hex || basePalette.skin,
    tileLight: brightest?.hex || basePalette.tileLight,
    ground:    brightest?.hex || basePalette.ground,
    ink:       darkest?.hex   || basePalette.ink,
    tileDark:  darkest?.hex   || basePalette.tileDark,
    bloomTop:  bloomTop?.hex  || basePalette.bloomTop,
    bloomStub: bloomStub?.hex || basePalette.bloomStub,
  }
}

// ─── Tree Garden — hand-crafted centrepiece tree ──────────────────────
// Returns a THREE.Group with a tapered LatheGeometry trunk, 4-5 tapered
// cylinder branches + twigs, an InstancedMesh of icosahedron leaf clusters
// (200-500 leaves tinted from a per-season palette with per-leaf HSL
// jitter), an optional Winter snow cap, and two soft ground-shadow rings.
// Every material that needs to fade during the iso↔top transition is
// pushed into `group.userData.fadeMaterials`.
function buildTreeGardenCentrepiece(palette, season) {
  const group = new THREE.Group()
  group.name = 'treeGardenCentrepiece'
  const rng = makeRng((season.length * 271) + 13)

  const fadeMaterials = []
  const registerFade = (mat) => {
    mat.transparent = true
    mat.opacity = 1
    fadeMaterials.push(mat)
  }

  // Trunk — tapered LatheGeometry silhouette; base flare → narrow at fork.
  const trunkH = 4.2
  const trunkPoints = [
    new THREE.Vector2(0.62, 0.0),
    new THREE.Vector2(0.58, 0.35),
    new THREE.Vector2(0.48, 0.9),
    new THREE.Vector2(0.42, 1.7),
    new THREE.Vector2(0.36, 2.6),
    new THREE.Vector2(0.30, 3.4),
    new THREE.Vector2(0.24, trunkH),
  ]
  const trunkGeom = new THREE.LatheGeometry(trunkPoints, 14)
  const trunkMat = new THREE.MeshStandardMaterial({
    color: palette.wood, roughness: 0.95, metalness: 0,
  })
  registerFade(trunkMat)
  const trunk = new THREE.Mesh(trunkGeom, trunkMat)
  trunk.castShadow = true; trunk.receiveShadow = true
  group.add(trunk)

  // Branches — 4 or 5 tapered cylinders splayed outward + up.
  const branchCount = 4 + Math.floor(rng() * 2)
  const branchTips = []
  for (let i = 0; i < branchCount; i++) {
    const azimuth = (i / branchCount) * Math.PI * 2 + rng() * 0.35
    const yStart = trunkH * (0.55 + rng() * 0.15)
    const length = 1.6 + rng() * 0.6
    const tilt = 0.55 + rng() * 0.25
    const rBase = 0.18, rTip = 0.07

    const geom = new THREE.CylinderGeometry(rTip, rBase, length, 8, 1, false)
    geom.translate(0, length / 2, 0)   // pivot at base
    const mesh = new THREE.Mesh(geom, trunkMat)
    mesh.rotation.set(0, azimuth, tilt)
    mesh.position.set(0, yStart, 0)
    mesh.castShadow = true
    group.add(mesh)

    const dirX = Math.sin(azimuth) * Math.sin(tilt)
    const dirZ = Math.cos(azimuth) * Math.sin(tilt)
    const dirY = Math.cos(tilt)
    branchTips.push({
      x: dirX * length,
      y: yStart + dirY * length,
      z: dirZ * length,
    })

    // 2-3 twigs per branch.
    const twigCount = 2 + Math.floor(rng() * 2)
    for (let t = 0; t < twigCount; t++) {
      const twigLen = 0.5 + rng() * 0.4
      const alongT = 0.55 + rng() * 0.35
      const twigTilt = tilt - 0.35 - rng() * 0.25
      const twigAz = azimuth + (rng() - 0.5) * 0.9
      const twigGeom = new THREE.CylinderGeometry(0.03, 0.06, twigLen, 6, 1, false)
      twigGeom.translate(0, twigLen / 2, 0)
      const twig = new THREE.Mesh(twigGeom, trunkMat)
      twig.rotation.set(0, twigAz, twigTilt)
      twig.position.set(
        dirX * length * alongT,
        yStart + dirY * length * alongT,
        dirZ * length * alongT,
      )
      group.add(twig)

      const twigDirX = Math.sin(twigAz) * Math.sin(twigTilt)
      const twigDirZ = Math.cos(twigAz) * Math.sin(twigTilt)
      const twigDirY = Math.cos(twigTilt)
      branchTips.push({
        x: dirX * length * alongT + twigDirX * twigLen,
        y: yStart + dirY * length * alongT + twigDirY * twigLen,
        z: dirZ * length * alongT + twigDirZ * twigLen,
        small: true,
      })
    }
  }

  // Leaves — InstancedMesh of icosahedra with per-instance palette colour.
  const isWinter = season === 'Winter'
  const leavesPerAnchor = isWinter ? 4 : 22
  const crownExtraLeaves = isWinter ? 18 : 130

  const anchors = branchTips.map((t) => ({
    ...t, count: t.small ? Math.floor(leavesPerAnchor * 0.6) : leavesPerAnchor,
  }))
  const totalLeaves = anchors.reduce((s, a) => s + a.count, 0) + crownExtraLeaves

  const leafGeom = new THREE.IcosahedronGeometry(0.42, 1)
  const leafMat = new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 0.75, metalness: 0,
  })
  registerFade(leafMat)
  const leafMesh = new THREE.InstancedMesh(leafGeom, leafMat, totalLeaves)
  leafMesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(totalLeaves * 3), 3,
  )

  const dummy = new THREE.Object3D()
  let li = 0
  const palettePool = palette.leafPalette || [palette.leaf]
  const putLeaf = (px, py, pz, scale) => {
    dummy.position.set(px, py, pz)
    const s = scale * (0.75 + rng() * 0.6)
    dummy.scale.set(s, s, s)
    dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI)
    dummy.updateMatrix()
    leafMesh.setMatrixAt(li, dummy.matrix)
    const baseHex = palettePool[Math.floor(rng() * palettePool.length)]
    const c = jitterColor(baseHex, rng, 0.12, 0.12)
    leafMesh.instanceColor.setXYZ(li, c.r, c.g, c.b)
    li++
  }

  for (const a of anchors) {
    for (let k = 0; k < a.count; k++) {
      const jr = 0.35 + rng() * 0.4
      const dx = (rng() - 0.5) * jr * 2
      const dy = (rng() - 0.5) * jr * 1.6
      const dz = (rng() - 0.5) * jr * 2
      putLeaf(a.x + dx, a.y + dy, a.z + dz, a.small ? 0.8 : 1.0)
    }
  }
  // Extra puff inside an ellipsoid above the trunk — reads as one canopy.
  const crownCentreY = trunkH + 0.9
  for (let k = 0; k < crownExtraLeaves; k++) {
    const u = rng(), v = rng(), w = rng()
    const r = Math.cbrt(u) * 2.1
    const theta = Math.acos(1 - 2 * v)
    const phi = 2 * Math.PI * w
    const dx = r * Math.sin(theta) * Math.cos(phi)
    const dy = r * Math.cos(theta) * 0.7
    const dz = r * Math.sin(theta) * Math.sin(phi)
    putLeaf(dx, crownCentreY + dy, dz, 1.0)
  }
  leafMesh.count = li
  leafMesh.instanceMatrix.needsUpdate = true
  leafMesh.instanceColor.needsUpdate = true
  group.add(leafMesh)

  // Winter snow cap on the trunk head.
  if (isWinter && palette.snow) {
    const snowMat = new THREE.MeshStandardMaterial({
      color: palette.snow, roughness: 1, metalness: 0,
    })
    registerFade(snowMat)
    const snowGeom = new THREE.SphereGeometry(
      0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2,
    )
    const cap = new THREE.Mesh(snowGeom, snowMat)
    cap.position.set(0, trunkH + 0.05, 0)
    cap.scale.set(1, 0.6, 1)
    group.add(cap)
  }

  // Ground shadow — two rings simulate a radial falloff cheaply.
  const shadowMat = new THREE.MeshBasicMaterial({
    color: '#000000', transparent: true, opacity: 0.24, depthWrite: false,
  })
  fadeMaterials.push(shadowMat)
  const shadow = new THREE.Mesh(new THREE.RingGeometry(0.1, 3.8, 40, 1), shadowMat)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 1.05  // sits above raised stone tiles
  group.add(shadow)

  const shadow2Mat = new THREE.MeshBasicMaterial({
    color: '#000000', transparent: true, opacity: 0.18, depthWrite: false,
  })
  fadeMaterials.push(shadow2Mat)
  const shadow2 = new THREE.Mesh(new THREE.RingGeometry(0.1, 2.4, 40, 1), shadow2Mat)
  shadow2.rotation.x = -Math.PI / 2
  shadow2.position.y = 1.055
  group.add(shadow2)

  group.userData.fadeMaterials = fadeMaterials
  return group
}

// Grass tufts + snow scatter on ~20-60% of light cells — one InstancedMesh
// of tiny icosahedrons so hundreds render in a single draw call.
function buildTreeGardenGroundDressing(matrix, N, palette, season) {
  const group = new THREE.Group()
  group.name = 'treeGardenGround'
  const isWinter = season === 'Winter'
  const halfN = N / 2

  const grassCells = []
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (matrix[r * N + c] === 1) continue
      const h = hash2(r * 11 + 3, c * 17 + 5)
      const inFinderQuiet =
        (r < 8 && c < 8) || (r < 8 && c >= N - 8) || (r >= N - 8 && c < 8)
      const nearTrunk = Math.abs(c - halfN + 0.5) < 1.2 && Math.abs(r - halfN + 0.5) < 1.2
      if (inFinderQuiet || nearTrunk) continue
      const threshold = isWinter ? 0.55 : 0.78
      if (h < threshold) continue
      grassCells.push({ r, c })
    }
  }
  if (grassCells.length === 0) return group

  const tuftGeom = new THREE.IcosahedronGeometry(0.06, 0)
  const tuftMat = new THREE.MeshStandardMaterial({
    color: isWinter ? (palette.snow || '#ffffff') : palette.grassTuft,
    roughness: 0.9, metalness: 0,
  })
  tuftMat.transparent = true; tuftMat.opacity = 1
  const im = new THREE.InstancedMesh(tuftGeom, tuftMat, grassCells.length * 3)
  const dummy = new THREE.Object3D()
  let i = 0
  const rng = makeRng(matrix.length * 7 + N * 13)
  for (const { r, c } of grassCells) {
    const x = c - halfN + 0.5
    const z = r - halfN + 0.5
    const n = 1 + Math.floor(rng() * 3)
    for (let k = 0; k < n; k++) {
      const jx = (rng() - 0.5) * 0.6
      const jz = (rng() - 0.5) * 0.6
      const sy = 0.8 + rng() * 0.9
      dummy.position.set(x + jx, 0.19 + (isWinter ? 0.02 : 0), z + jz)
      dummy.scale.set(1, sy, 1)
      dummy.rotation.set(0, rng() * Math.PI, 0)
      dummy.updateMatrix()
      im.setMatrixAt(i, dummy.matrix)
      i++
    }
  }
  im.count = i
  im.instanceMatrix.needsUpdate = true
  group.add(im)
  group.userData.fadeMaterials = [tuftMat]
  return group
}

// Build a small voxel tree — trunk + a puffball crown. Returns a list of
// { position:[x,y,z], scale:[sx,sy,sz], type:'wood'|'leaf' } items so the
// caller can push them into the correct InstancedMesh.
// NOTE: retained for reference; Tree Garden theme now uses
// buildTreeGardenCentrepiece() for a more realistic result.
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
// The output also carries a "scan" companion for every cell — a pure
// black/white flat tile at y=0 that the top-down snapshot uses. Those
// tiles live under separate keys (`scanDark`, `scanLight`, `scanQuiet`)
// so we can toggle them independently of the artistic geometry.
//
// Returns { instances: { key: { color, transforms: [] } }, meta: { counts } }
function buildSceneData(matrix, N, theme, season, maskGrid = null, externalPalette = null) {
  // Defensive resolve — when the user switches theme, `season` may be stale
  // for one render (e.g. Tree Garden's "Autumn" → Voxel City which only has
  // Day/Sunset/Night). The season-sync useEffect corrects this on the next
  // paint, but scene rebuild fires first. Fall back to the theme's first
  // season if the pair is missing.
  const themePalette = PALETTES[theme] || PALETTES[THEMES[0]]
  let palette = themePalette[season] || themePalette[Object.keys(themePalette)[0]]
  // Tattoo Bloom takes an external palette from the BE and re-derives
  // skin/ink/bloom hexes from it, so every tattoo drives its own bloom.
  if (theme === 'Tattoo Bloom') {
    palette = resolveTattooPalette(palette, externalPalette)
  }
  const inst = {}
  const push = (key, mat, transform) => {
    if (!inst[key]) inst[key] = { material: mat, transforms: [] }
    inst[key].transforms.push(transform)
  }

  const halfN = N / 2
  const QUIET = 4  // modules of quiet zone on each side — jsQR needs ≥4

  // ── Flat scan tiles (used only by top-down snapshot) ──
  // One pure-black tile per dark module, one pure-white tile per light
  // module. Rendered as thin flat cubes at y = 0.02 so they always sit
  // ABOVE the ground plane and BELOW any artistic geometry.
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const dark = matrix[r * N + c] === 1
      const x = c - halfN + 0.5
      const z = r - halfN + 0.5
      if (dark) {
        push('scanDark', { color: '#000000' },
          { pos: [x, 0.02, z], scale: [1, 0.02, 1] })
      } else {
        push('scanLight', { color: '#ffffff' },
          { pos: [x, 0.02, z], scale: [1, 0.02, 1] })
      }
    }
  }
  // Quiet-zone ring — a single big white plate under the QR, extending
  // QUIET modules past each side. Sits at y = 0.015 so it's below the
  // per-cell scan tiles. During snapshot everything else is hidden so
  // this reads as a clean white margin.
  push('scanQuiet', { color: '#ffffff' },
    { pos: [0, 0.015, 0], scale: [N + QUIET * 2, 0.01, N + QUIET * 2] })

  // ── Artistic tiles (iso view) ──
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
          // Raised stone tile — cube height 0.9. Per-instance shade adds
          // a low-frequency brightness variance so the field of stones
          // reads as slightly weathered instead of flat blocks.
          const h1 = hash2(r + 17, c + 91)
          const shade = 0.85 + h1 * 0.3
          push('tileDark', { color: palette.tileDark, roughness: 0.95 },
            { pos: [x, 0.45, z], scale: [1, 0.9, 1], shade })
        } else {
          // Grass tile — cube height 0.15. Slight per-instance hue jitter
          // so tufts sit on subtly different greens (or snows).
          const h1 = hash2(r * 3 + 7, c * 5 + 11)
          const shade = 0.9 + h1 * 0.25
          push('tileLight', { color: palette.tileLight, roughness: 0.95 },
            { pos: [x, 0.075, z], scale: [1, 0.15, 1], shade })
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
      } else if (theme === 'Tattoo Bloom') {
        // Tattoo Bloom — every module is a column whose height is chosen
        // from four tiers based on (dark? ink-mask?):
        //   dark + ink  → tallest, bloom top colour   (y_top = 1.9)
        //   light + ink → mid, bloom stub colour      (y_top = 1.2)
        //   dark + ¬ink → QR floor, dark charcoal     (y_top = 0.4)
        //   light + ¬ink → flat skin ground           (y_top = 0)
        // The four tiers become four InstancedMesh buckets so counts stay
        // low. Silhouette rises out of the QR floor as a topo bloom.
        const inMask = maskGrid && maskGrid[r * N + c] === 1
        if (dark && inMask) {
          // Bloom tower — tall column tinted by the palette's dominant
          // saturated colour. Slight per-instance shade variance so the
          // silhouette reads as an organic surface, not a solid slab.
          const h1 = hash2(r + 71, c + 13)
          const height = 1.7 + h1 * 0.4
          push('tattooBloomTower', {
            color: palette.bloomTop, roughness: 0.55, metalness: 0.05,
          }, { pos: [x, height / 2, z], scale: [0.94, height, 0.94], shade: 0.9 + h1 * 0.2 })
        } else if (!dark && inMask) {
          // Bloom stub — shorter, uses the secondary palette accent.
          const h1 = hash2(r + 41, c + 61)
          const height = 1.0 + h1 * 0.4
          push('tattooBloomStub', {
            color: palette.bloomStub, roughness: 0.7, metalness: 0.0,
          }, { pos: [x, height / 2, z], scale: [0.9, height, 0.9], shade: 0.9 + h1 * 0.2 })
        } else if (dark) {
          // Plain QR floor (dark cell, no ink) — flat charcoal, y = 0.4.
          push('tattooFloor', {
            color: palette.ink, roughness: 0.9,
          }, { pos: [x, 0.2, z], scale: [1, 0.4, 1] })
        } else {
          // Bare skin — thin flat tile at y ≈ 0.
          push('tattooGround', {
            color: palette.skin, roughness: 0.95,
          }, { pos: [x, 0.05, z], scale: [1, 0.1, 1], shade: 0.94 + hash2(r + 3, c + 7) * 0.12 })
        }
      }
    }
  }

  // Overlay geometry. Tree Garden's centrepiece tree lives outside the
  // instance graph as a THREE.Group (see buildTreeGardenCentrepiece) so
  // we can fade its opacity independently during camera transitions and
  // the sibling top-down scan pass can hide it without touching the tiles.
  // Fractal Forest still uses the instance path — one small tree per dark cell.
  if (theme === 'Fractal Forest') {
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
  return { instances: inst, meta: { counts, total, palette, quiet: QUIET } }
}

// Keys used by the scan-only render path. Everything else stays hidden
// during the snapshot.
const SCAN_KEYS = new Set(['scanDark', 'scanLight', 'scanQuiet'])

// ─── Renderer init — the ONLY place a WebGL context gets allocated. ───
// Called ONCE per component mount. All scene rebuilds reuse the same
// renderer so we never leak WebGL contexts across theme/season/mask
// changes. Browsers cap contexts at ~8-16 per tab — recreating the
// renderer on every state change quickly blows that budget.
function initRenderer(canvas, opts = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, opts.lowPower ? 1 : 2)
  const w = canvas.clientWidth || 640
  const h = canvas.clientHeight || 640
  const rendererOpts = opts.lowPower
    ? { canvas, antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false }
    : { canvas, antialias: true,  alpha: false, preserveDrawingBuffer: true,  powerPreference: 'high-performance' }
  const renderer = new THREE.WebGLRenderer(rendererOpts)
  renderer.setPixelRatio(dpr)
  renderer.setSize(w, h, false)
  renderer.shadowMap.enabled = !opts.lowPower
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  return renderer
}

// ─── Scene graph — cheap to build/dispose, no WebGL context involved. ───
// Called on every matrix/theme/season/mask/palette change. Old scene
// children are disposed (geometries + materials release GPU memory) but
// the RENDERER stays alive.
function buildSceneGraph(sceneData, theme, season, N, matrix) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(sceneData.meta.palette.sky)
  scene.fog = new THREE.Fog(sceneData.meta.palette.sky, N * 1.5, N * 4)

  // Lights — kept as refs so the scan pass can temporarily neutralise
  // them (we want unlit black/white for jsQR).
  const ambient = new THREE.AmbientLight(
    0xffffff, Math.min(sceneData.meta.palette.ambient, 0.4),
  )
  scene.add(ambient)
  const sun = new THREE.DirectionalLight(sceneData.meta.palette.sunColor, 0.9)
  sun.position.set(N * 0.6, N * 1.2, N * 0.4)
  scene.add(sun)
  // HemisphereLight — sky/ground wrap-around. Reads as gentle bounce
  // light and stops voxel faces from going flat black.
  const hemi = new THREE.HemisphereLight(
    sceneData.meta.palette.sky, sceneData.meta.palette.ground || '#333', 0.35,
  )
  scene.add(hemi)
  const fill = new THREE.DirectionalLight('#ffffff', 0.2)
  fill.position.set(-N * 0.5, N * 0.4, -N * 0.5)
  scene.add(fill)

  // Cameras
  const isoCam = new THREE.OrthographicCamera(-N, N, N, -N, 0.1, N * 6)
  isoCam.position.set(N * 1.2, N * 1.3, N * 1.2)
  isoCam.up.set(0, 1, 0)
  isoCam.lookAt(0, 0, 0)

  // Top-down camera — pure ortho, tight framing = N + 2*quiet zone. We
  // use up=(0,0,-1) so matrix row 0 (top of the QR) renders at the top
  // of the image; that matches jsQR's row-major expectation exactly.
  const quiet = sceneData.meta.quiet ?? 4
  const half = (N + quiet * 2) / 2
  const topCam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, N * 6)
  topCam.position.set(0, N * 3, 0.001)  // near-vertical, tiny z avoids up-vector nan
  topCam.up.set(0, 0, -1)
  topCam.lookAt(0, 0, 0)
  topCam.updateProjectionMatrix()

  // liveCam — the camera we actually render with each frame. Its position
  // + up are lerped between isoCam and topCam whenever the user toggles
  // the view, giving a smooth easeInOutCubic transition instead of a snap.
  const liveCam = new THREE.OrthographicCamera(-N, N, N, -N, 0.1, N * 6)
  liveCam.position.copy(isoCam.position)
  liveCam.up.copy(isoCam.up)
  liveCam.lookAt(0, 0, 0)
  liveCam.updateProjectionMatrix()

  // InstancedMeshes for tiles / buildings / crystals / fractal-forest trees.
  const boxGeom = new THREE.BoxGeometry(1, 1, 1)
  const meshes = {}
  const dummy = new THREE.Object3D()
  for (const key of Object.keys(sceneData.instances)) {
    const entry = sceneData.instances[key]
    const matProps = entry.material
    // Scan tiles are unlit — MeshBasic gives us pure #000/#fff regardless
    // of ambient / directional lights, which is exactly what jsQR wants.
    const mat = SCAN_KEYS.has(key)
      ? new THREE.MeshBasicMaterial({ color: matProps.color, toneMapped: false })
      : new THREE.MeshStandardMaterial({
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
    // Per-instance shade — if any transform carries a `shade` field, we
    // build an instanceColor attribute so tiles/stones shimmer with a
    // low-frequency brightness variance instead of reading as flat.
    if (entry.transforms.some((t) => t.shade !== undefined)) {
      const baseColor = new THREE.Color(matProps.color)
      const arr = new Float32Array(entry.transforms.length * 3)
      for (let i = 0; i < entry.transforms.length; i++) {
        const shade = entry.transforms[i].shade ?? 1
        const c = baseColor.clone().multiplyScalar(shade)
        arr[i * 3 + 0] = c.r
        arr[i * 3 + 1] = c.g
        arr[i * 3 + 2] = c.b
      }
      im.instanceColor = new THREE.InstancedBufferAttribute(arr, 3)
      im.instanceColor.needsUpdate = true
    }
    // Tile grid receives shadows so the tree's cast reads.
    if (key === 'tileDark' || key === 'tileLight') im.receiveShadow = true
    // Scan meshes stay hidden by default — iso view never shows them.
    if (SCAN_KEYS.has(key)) im.visible = false
    scene.add(im)
    meshes[key] = im
  }

  // Tree Garden centrepiece + ground dressing live outside the instance
  // graph so we can fade them independently during camera transitions
  // AND the sibling top-down scan pass can hide them wholesale.
  let treeOverlay = null
  let groundOverlay = null
  if (theme === 'Tree Garden' && matrix) {
    treeOverlay = buildTreeGardenCentrepiece(sceneData.meta.palette, season)
    scene.add(treeOverlay)
    groundOverlay = buildTreeGardenGroundDressing(
      matrix, N, sceneData.meta.palette, season,
    )
    scene.add(groundOverlay)
  }

  return {
    scene, isoCam, topCam, liveCam, meshes,
    treeOverlay, groundOverlay,
    lights: { ambient, sun, fill, hemi },
  }
}

// Fully dispose a scene graph's GPU resources without touching the renderer.
// Called before every scene rebuild so old geometries/materials release
// their VRAM. The renderer keeps its WebGL context.
function disposeSceneGraph(graph) {
  if (!graph) return
  const scene = graph.scene
  if (scene) {
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.()
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.())
      else if (obj.material) obj.material.dispose?.()
    })
    while (scene.children.length) scene.remove(scene.children[0])
  }
}

// ─── Top-down scan-frame renderer ─────────────────────────────────────
// Renders the QR + quiet-zone as a pure black/white top-down snapshot
// into `outCanvas` (a 2D canvas — used only for the debug PNG), and
// returns the RGBA ImageData for jsQR.
//
// Implementation note: three.js WebGLRenderer takes over a canvas's
// context, so we can't share one canvas between WebGL rendering + 2D
// pixel reads. We render to an internal WebGL canvas, then blit into
// the caller's 2D canvas via drawImage so `getImageData` and
// `toDataURL` both work on `outCanvas`.
function renderTopDownFrame(state, outCanvas) {
  const size = outCanvas.width
  // Lazily create ONE snap renderer per component lifetime — reuse across
  // every scan. Recreating a WebGLRenderer on every scan tick leaked
  // contexts fast (Chrome caps ~16, Safari ~8) and eventually blew the
  // browser's WebGL budget. Cached on state so it lives with the main
  // renderer and disposes on unmount.
  if (!state.snapRenderer) {
    const glCanvas = document.createElement('canvas')
    glCanvas.width = size
    glCanvas.height = size
    state.snapCanvas = glCanvas
    state.snapRenderer = new THREE.WebGLRenderer({
      canvas: glCanvas, antialias: false, preserveDrawingBuffer: true, alpha: false,
      powerPreference: 'low-power',
    })
    state.snapRenderer.setPixelRatio(1)
    state.snapRenderer.setSize(size, size, false)
    state.snapRenderer.setClearColor(new THREE.Color('#ffffff'), 1)
  } else if (state.snapCanvas.width !== size) {
    // Payload got longer → module count grew → snap canvas needs resize.
    state.snapCanvas.width = size
    state.snapCanvas.height = size
    state.snapRenderer.setSize(size, size, false)
  }
  const snap = state.snapRenderer
  const glCanvas = state.snapCanvas

  // Stash + swap: hide artistic meshes, show scan meshes.
  const prevVis = {}
  for (const key of Object.keys(state.meshes)) {
    prevVis[key] = state.meshes[key].visible
  }
  for (const key of Object.keys(state.meshes)) {
    if (SCAN_KEYS.has(key)) state.meshes[key].visible = true
    else state.meshes[key].visible = false
  }
  // Tree Garden overlay Groups (centrepiece + ground dressing) live
  // outside the instance graph — hide them for the snapshot too.
  const prevTreeVis = state.treeOverlay?.visible
  const prevGroundVis = state.groundOverlay?.visible
  if (state.treeOverlay) state.treeOverlay.visible = false
  if (state.groundOverlay) state.groundOverlay.visible = false

  // Stash + neutralise background/fog. Scan meshes are MeshBasic so
  // lights don't matter, but killing the fog also removes the sky-tinted
  // haze from the render.
  const prevBg = state.scene.background
  const prevFog = state.scene.fog
  state.scene.background = new THREE.Color('#ffffff')
  state.scene.fog = null

  snap.render(state.scene, state.topCam)

  // Blit the WebGL frame into the 2D canvas so downstream getImageData /
  // toDataURL calls work.
  const ctx = outCanvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  ctx.drawImage(glCanvas, 0, 0, size, size)
  const img = ctx.getImageData(0, 0, size, size)

  // Restore artistic scene.
  for (const key of Object.keys(state.meshes)) {
    state.meshes[key].visible = prevVis[key]
  }
  if (state.treeOverlay) state.treeOverlay.visible = prevTreeVis
  if (state.groundOverlay) state.groundOverlay.visible = prevGroundVis
  state.scene.background = prevBg
  state.scene.fog = prevFog

  // NOT disposed — reused across every scan for the lifetime of the
  // component. Cleanup happens in the mount effect's unmount handler.
  return img
}

// Rotate an RGBA ImageData 90° clockwise into a fresh ImageData.
function rotateImageData90(img) {
  const w = img.width, h = img.height
  const out = new ImageData(h, w)
  const src = img.data, dst = out.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4
      const dx = h - 1 - y
      const dy = x
      const di = (dy * h + dx) * 4
      dst[di] = src[si]
      dst[di + 1] = src[si + 1]
      dst[di + 2] = src[si + 2]
      dst[di + 3] = src[si + 3]
    }
  }
  return out
}

// Compute contrast between mean dark-cell luminance and mean light-cell
// luminance in an ImageData. Returns { contrast, meanDark, meanLight }
// on a 0..255 scale. Used for the failure-reason heuristic.
function measureContrast(img) {
  const { data, width, height } = img
  let sumDark = 0, cntDark = 0, sumLight = 0, cntLight = 0
  // Sample every 4th pixel to keep the maths fast on 720×720.
  for (let i = 0; i < data.length; i += 16) {
    const l = (data[i] + data[i + 1] + data[i + 2]) / 3
    if (l < 96)      { sumDark += l;  cntDark++ }
    else if (l > 160) { sumLight += l; cntLight++ }
  }
  const meanDark = cntDark ? sumDark / cntDark : 0
  const meanLight = cntLight ? sumLight / cntLight : 255
  return { contrast: meanLight - meanDark, meanDark, meanLight }
}

// Run jsQR at 4 rotations and return the first hit. `expected` is the
// payload we're supposed to be encoding — if jsQR returns something
// but it doesn't match, we treat that as a data mismatch (still a fail).
function decodeWithRotations(img, expected) {
  const attempts = []
  let cur = img
  for (let rot = 0; rot < 4; rot++) {
    if (rot > 0) cur = rotateImageData90(cur)
    const r = jsQR(cur.data, cur.width, cur.height, { inversionAttempts: 'attemptBoth' })
    attempts.push({ rot: rot * 90, hit: !!r, data: r?.data ?? null })
    if (r) {
      // Success if we didn't specify an expected payload, OR if it matches
      // exactly. If we got a QR but the data is wrong, keep trying — but
      // remember it in case nothing else works.
      if (!expected || r.data === expected) {
        return { ok: true, data: r.data, rot: rot * 90, attempts }
      }
    }
  }
  // Nothing matched. If jsQR decoded SOMETHING (even a mismatch), report
  // that specifically. Otherwise report "no decode".
  const anyHit = attempts.find((a) => a.hit)
  return {
    ok: false,
    data: anyHit?.data ?? '',
    rot: anyHit?.rot ?? null,
    mismatch: !!anyHit,
    attempts,
  }
}

// ─── The React component ──────────────────────────────────────────────
export default function QRScenes3D({ matrixData, ecc, payload, silhouetteMask = null, palette = null }) {
  const [theme, setTheme] = useState('Tree Garden')

  // When a silhouette mask arrives (user clicked "View as 3D scene" in
  // Vision or Tattoo Studio), auto-flip to Tattoo Bloom so the tattoo is
  // immediately visible as the topographical bloom. Users can switch back
  // to any other theme after — this only fires on the mask flipping from
  // null to a data URL, so it doesn't fight the user's manual choice.
  const prevMaskRef = useRef(null)
  useEffect(() => {
    if (silhouetteMask && silhouetteMask !== prevMaskRef.current) {
      setTheme('Tattoo Bloom')
    }
    prevMaskRef.current = silhouetteMask
  }, [silhouetteMask])

  const [season, setSeason] = useState('Summer')
  const [view, setView] = useState('Iso')      // 'Iso' | 'Top'
  const [autoRotate, setAutoRotate] = useState(true)
  const [instanceTotal, setInstanceTotal] = useState(0)
  const [scenePresent, setScenePresent] = useState(false)
  // scanRes: { ok, data, rot, reason?, contrast?, pxPerModule? }
  const [scanRes, setScanRes] = useState({ ok: false, data: '', reason: 'pending' })
  const [debugPngUrl, setDebugPngUrl] = useState(null)

  // ─── Tattoo Bloom mask → N×N grid ─────────────────────────────────
  // Sibling BE agent's /api/vision/extract-subject endpoint returns a
  // 1-bit PNG of the tattoo silhouette (data URL). We resample it to the
  // QR module grid (N×N) so every cell knows whether it's under ink.
  // Uses the red channel (mask is grayscale) — a value > 128 marks ink.
  //
  // Edge cases handled:
  //   • mask=null → maskGrid=null (Tattoo Bloom still renders as a flat QR
  //     floor since the buildSceneData branch treats `!maskGrid` as no bloom)
  //   • mask smaller than QR grid → drawImage stretches it, mask quality
  //     degrades but rendering still works
  //   • mask empty (all zeros) → no bloom towers/stubs are pushed, scene
  //     reads as plain QR floor + skin ground
  //   • image load errors → maskGrid stays null; console warns once
  const [maskGrid, setMaskGrid] = useState(null)
  useEffect(() => {
    if (!silhouetteMask || !matrixData?.N) { setMaskGrid(null); return }
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      try {
        const N = matrixData.N
        const off = document.createElement('canvas')
        off.width = N
        off.height = N
        const ctx = off.getContext('2d')
        // Fill with black first so any transparent pixels count as "not ink".
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, N, N)
        ctx.drawImage(img, 0, 0, N, N)
        const px = ctx.getImageData(0, 0, N, N).data
        const grid = new Uint8Array(N * N)
        for (let i = 0; i < grid.length; i++) {
          // Red channel > 128 = ink. Standard grayscale mask convention.
          grid[i] = px[i * 4] > 128 ? 1 : 0
        }
        setMaskGrid(grid)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[QRScenes3D] silhouette mask decode failed', err)
        setMaskGrid(null)
      }
    }
    img.onerror = () => {
      if (cancelled) return
      // eslint-disable-next-line no-console
      console.warn('[QRScenes3D] silhouette mask load failed')
      setMaskGrid(null)
    }
    img.src = silhouetteMask
    return () => { cancelled = true }
  }, [silhouetteMask, matrixData?.N])

  // Keep season valid whenever theme changes.
  useEffect(() => {
    if (!SEASONS[theme].includes(season)) setSeason(SEASONS[theme][0])
  }, [theme, season])

  // Progress bar % during the iso↔top camera transition (0 when idle).
  const [transitionPct, setTransitionPct] = useState(0)

  // WebGL failure state — surfaces a friendly panel instead of crashing
  // the whole page when the browser can't allocate a WebGL context (mobile
  // context limit, WebGL disabled, headless env, etc.). `webglRetry` is a
  // counter the "Retry" button bumps to trigger a fresh init attempt.
  const [webglError, setWebglError] = useState(null)
  const [webglRetry, setWebglRetry] = useState(0)

  // three.js refs — persist across renders without triggering React.
  const canvasRef = useRef(null)
  const stateRef = useRef({
    renderer: null, scene: null,
    isoCam: null, topCam: null, liveCam: null,
    meshes: {}, treeOverlay: null, groundOverlay: null,
    lights: null, raf: 0, angle: 0, lastTS: 0,
    view: 'Iso', autoRotate: true, N: 21,
    // Cached offscreen scan canvas — 720 px gives ~24 px/module on a
    // 30-module QR, plenty of headroom for jsQR's ≥10 px/module target.
    scanCanvas: null,
    // Reusable snap renderer + its WebGL canvas — created once per
    // component mount, disposed on unmount. See renderTopDownFrame().
    snapRenderer: null, snapCanvas: null,
    // Camera easing state. `transition` is null when settled, otherwise
    // holds { fromPos, fromUp, toPos, toUp, targetMode, start, dur }.
    // `currentMode` is where we're settled ('Iso' or 'Top').
    transition: null, currentMode: 'Iso',
  })

  // ─── Renderer init — ONE WebGL context per component mount ────────
  // Runs exactly once (or once more if the user hits Retry via webglRetry).
  // Never re-fires on scene/theme/mask changes. Cleanup on unmount
  // disposes the renderer (which releases the WebGL context) + any RAF.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let renderer
    try {
      renderer = initRenderer(canvas)
      setWebglError(null)
    } catch (err) {
      console.warn('QRScenes3D: WebGL init failed (high-perf) —', err?.message || err)
      try {
        renderer = initRenderer(canvas, { lowPower: true })
        setWebglError(null)
        console.info('QRScenes3D: recovered via low-power renderer')
      } catch (err2) {
        console.warn('QRScenes3D: WebGL init failed (low-power) —', err2?.message || err2)
        setWebglError(err2?.message || err?.message || 'WebGL is unavailable on this device')
        setScenePresent(false)
        return
      }
    }
    stateRef.current.renderer = renderer
    return () => {
      const s = stateRef.current
      if (s.raf) cancelAnimationFrame(s.raf)
      disposeSceneGraph({ scene: s.scene })
      if (s.snapRenderer) { s.snapRenderer.dispose(); s.snapRenderer = null }
      if (s.renderer) { s.renderer.dispose(); s.renderer = null }
    }
  }, [webglRetry])

  // ─── Scene rebuild — reuses the renderer, only rebuilds meshes ────
  // Fires on matrix / theme / season / mask / palette change. Disposes
  // old scene GPU resources (geometries + materials) but the WebGLRenderer
  // stays alive.
  useEffect(() => {
    if (!stateRef.current.renderer) return
    if (!matrixData) {
      setScenePresent(false)
      setInstanceTotal(0)
      return
    }
    disposeSceneGraph({ scene: stateRef.current.scene })
    const sceneData = buildSceneData(
      matrixData.matrix, matrixData.N, theme, season, maskGrid, palette,
    )
    setInstanceTotal(sceneData.meta.total)
    const built = buildSceneGraph(
      sceneData, theme, season, matrixData.N, matrixData.matrix,
    )
    stateRef.current.scene = built.scene
    stateRef.current.isoCam = built.isoCam
    stateRef.current.topCam = built.topCam
    stateRef.current.liveCam = built.liveCam
    stateRef.current.meshes = built.meshes
    stateRef.current.treeOverlay = built.treeOverlay
    stateRef.current.groundOverlay = built.groundOverlay
    stateRef.current.lights = built.lights
    stateRef.current.N = matrixData.N
    // Cache the iso sky / fog on the scene itself so the animation tick
    // can restore them cleanly after a top-down frame. Storing on
    // stateRef would leak across scene rebuilds; storing on the scene
    // makes it self-contained.
    stateRef.current.scene.userData.isoBg = built.scene.background
    stateRef.current.scene.userData.isoFog = built.scene.fog
    // Re-seat the live camera to whichever mode is currently selected.
    // No transition on scene rebuild — it's a hard reset.
    const targetCam = view === 'Top' ? built.topCam : built.isoCam
    built.liveCam.position.copy(targetCam.position)
    built.liveCam.up.copy(targetCam.up)
    built.liveCam.lookAt(0, 0, 0)
    built.liveCam.updateProjectionMatrix()
    stateRef.current.currentMode = view
    stateRef.current.transition = null
    setTransitionPct(0)
    setScenePresent(true)
  }, [matrixData, theme, season, maskGrid, palette])

  // Keep the refs' latest view/autoRotate in sync without recreating the RAF.
  useEffect(() => { stateRef.current.view = view }, [view])
  useEffect(() => { stateRef.current.autoRotate = autoRotate }, [autoRotate])

  // View toggle → schedule a smooth easeInOutCubic camera transition.
  // Iso ↔ Top interpolates position + up over ~750ms. Auto-rotate is
  // implicitly suppressed by the loop while `transition` is non-null.
  //
  // Interruptible: if a transition is already in flight and the user
  // toggles again, we snapshot the CURRENT interpolated camera pose +
  // current artistic opacity as the new `from*` values, then re-target.
  // No queueing, no waiting — feels immediate and stays consistent under
  // rapid Iso ↔ Top ↔ Iso mashing.
  useEffect(() => {
    const s = stateRef.current
    if (!s.liveCam || !s.isoCam || !s.topCam) return
    if (s.currentMode === view && !s.transition) return
    const targetCam = view === 'Top' ? s.topCam : s.isoCam
    // Sample the current artistic opacity so we crossfade from wherever
    // we visually are, not from a hard 0 or 1. Fixes the "opacity jump"
    // artefact when interrupting a mid-flight fade.
    let fromOpacity = s.currentMode === 'Iso' ? 1 : 0
    for (const key of Object.keys(s.meshes || {})) {
      if (SCAN_KEYS.has(key)) continue
      const mat = s.meshes[key]?.material
      if (mat && typeof mat.opacity === 'number') {
        fromOpacity = mat.opacity
        break
      }
    }
    s.transition = {
      fromPos: s.liveCam.position.clone(),
      fromUp: s.liveCam.up.clone(),
      toPos: targetCam.position.clone(),
      toUp: targetCam.up.clone(),
      fromOpacity,
      toOpacity: view === 'Top' ? 0 : 1,
      targetMode: view,
      start: performance.now(),
      dur: 750,   // ms — comfortable easeInOutCubic in the 600-900 range
    }
    setTransitionPct(1)
  }, [view])

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

  // Animation loop — camera orbit for iso, static top-down, and a smooth
  // easeInOutCubic blend between the two whenever the user toggles view.
  //
  // During a transition:
  //   • liveCam.position + liveCam.up lerp toward the target pose
  //   • artistic geometry (tiles/buildings/etc + Tree Garden overlay)
  //     opacity-fades so the top-down snapshot lands clean
  //   • scan meshes stay hidden — sibling agent's scan pass runs off-screen
  //     against the same scene, we just don't reveal the raw B/W tiles
  //     until we've settled at the top pose
  //
  // When settled:
  //   • iso mode → artistic meshes visible + solid, scan meshes hidden,
  //     palette-tinted sky/fog restored, auto-rotate resumes
  //   • top mode → scan meshes visible + white background (sibling's
  //     established "clean preview" behaviour), artistic meshes hidden
  useEffect(() => {
    if (!scenePresent) return
    const s = stateRef.current
    let running = true

    const whiteBg = new THREE.Color('#ffffff')

    // Snap mesh visibility for a settled mode.
    const settleMeshVisibility = (mode) => {
      for (const key of Object.keys(s.meshes)) {
        const im = s.meshes[key]
        if (SCAN_KEYS.has(key)) im.visible = mode === 'top'
        else im.visible = mode === 'iso'
      }
      if (s.treeOverlay) s.treeOverlay.visible = mode === 'iso'
      if (s.groundOverlay) s.groundOverlay.visible = mode === 'iso'
    }

    // During a transition we keep artistic geometry visible but crossfade
    // its opacity. Overlays fade via their fadeMaterials array.
    const applyTransitionOpacity = (artisticOpacity) => {
      for (const key of Object.keys(s.meshes)) {
        if (SCAN_KEYS.has(key)) { s.meshes[key].visible = false; continue }
        const im = s.meshes[key]
        im.visible = true
        const mat = im.material
        if (mat) {
          mat.transparent = true
          mat.opacity = artisticOpacity
          mat.depthWrite = artisticOpacity > 0.98
        }
      }
      for (const overlay of [s.treeOverlay, s.groundOverlay]) {
        if (!overlay) continue
        overlay.visible = true
        const mats = overlay.userData?.fadeMaterials || []
        for (const m of mats) {
          m.transparent = true
          m.opacity = artisticOpacity
        }
      }
    }

    // Restore artistic meshes' materials to a fully-opaque state (used
    // when a transition settles at Iso — we don't want the tile grid to
    // stay transparent forever). Idempotent — safe to call more than once.
    const resetArtisticOpacity = () => {
      for (const key of Object.keys(s.meshes)) {
        if (SCAN_KEYS.has(key)) continue
        const mat = s.meshes[key].material
        if (mat) {
          // Only reset materials we might have touched. Crystal Cave
          // columns are naturally transparent — leave those alone.
          if (key === 'crystal') { mat.opacity = 0.85; continue }
          mat.opacity = 1
          mat.transparent = false
          mat.depthWrite = true
        }
      }
      for (const overlay of [s.treeOverlay, s.groundOverlay]) {
        if (!overlay) continue
        for (const m of (overlay.userData?.fadeMaterials || [])) {
          m.opacity = 1
          m.transparent = true   // keep transparent flag so next fade works
        }
      }
    }

    // Invariant check — after every settle, artistic + scan meshes should
    // be in a mutually exclusive visibility state. Warn (once per event
    // loop) if we detect drift so future regressions surface loudly.
    let lastInvariantWarn = 0
    const assertConsistentVisibility = (mode) => {
      const now = performance.now()
      if (now - lastInvariantWarn < 500) return
      let artisticVisible = 0, artisticHidden = 0, scanVisible = 0, scanHidden = 0
      for (const key of Object.keys(s.meshes)) {
        const v = s.meshes[key].visible
        if (SCAN_KEYS.has(key)) { v ? scanVisible++ : scanHidden++ }
        else                     { v ? artisticVisible++ : artisticHidden++ }
      }
      const bad = mode === 'iso'
        ? (scanVisible > 0 || artisticHidden > 0)
        : (artisticVisible > 0 || scanHidden > 0)
      if (bad) {
        lastInvariantWarn = now
        // eslint-disable-next-line no-console
        console.warn('[QRScenes3D] visibility invariant broken', {
          mode, artisticVisible, artisticHidden, scanVisible, scanHidden,
        })
      }
    }

    const tick = (ts) => {
      if (!running) return
      const dt = s.lastTS ? (ts - s.lastTS) / 1000 : 0
      s.lastTS = ts

      const cam = s.liveCam
      const N = s.N

      if (s.transition) {
        // Camera easing.
        const rawT = Math.min(1, (ts - s.transition.start) / s.transition.dur)
        const k = easeInOutCubic(rawT)
        cam.position.lerpVectors(s.transition.fromPos, s.transition.toPos, k)
        cam.up.copy(s.transition.fromUp).lerp(s.transition.toUp, k).normalize()
        cam.lookAt(0, 0, 0)
        cam.updateProjectionMatrix()

        // Artistic opacity: lerp from wherever we started (captured when
        // this transition began — may be mid-fade if we interrupted) to
        // the target end-state (0 for Top, 1 for Iso).
        const fromO = s.transition.fromOpacity ?? (s.transition.targetMode === 'Top' ? 1 : 0)
        const toO   = s.transition.toOpacity   ?? (s.transition.targetMode === 'Top' ? 0 : 1)
        const artisticOpacity = fromO + (toO - fromO) * k
        applyTransitionOpacity(artisticOpacity)

        // Keep the palette sky during Iso→Top so the artistic geometry
        // fades against its natural background; switch to white right as
        // we settle so the top preview reads clean.
        s.scene.background = s.scene.userData.isoBg ?? s.scene.background
        s.scene.fog = s.scene.userData.isoFog ?? s.scene.fog

        setTransitionPct(Math.round(k * 100))

        if (rawT >= 1) {
          s.currentMode = s.transition.targetMode
          s.transition = null
          setTransitionPct(0)
          // Always reset material opacity to a clean state on settle,
          // regardless of destination — that way the NEXT transition
          // starts from a known-good baseline. settleMeshVisibility then
          // hides whichever set of meshes shouldn't be seen.
          resetArtisticOpacity()
          settleMeshVisibility(s.currentMode === 'Top' ? 'top' : 'iso')
          assertConsistentVisibility(s.currentMode === 'Top' ? 'top' : 'iso')
        }
      } else {
        // Settled — sibling agent's mode logic controls the on-screen view.
        const mode = s.view === 'Top' ? 'top' : 'iso'
        settleMeshVisibility(mode)
        if (mode === 'top') {
          s.scene.background = whiteBg
          s.scene.fog = null
        } else {
          s.scene.background = s.scene.userData.isoBg ?? s.scene.background
          s.scene.fog = s.scene.userData.isoFog ?? s.scene.fog
        }

        if (mode === 'iso' && s.autoRotate) {
          // Slow premium orbit — one revolution every 14s.
          s.angle += dt * (2 * Math.PI / 14)
          const R = N * 1.6
          cam.position.set(
            Math.cos(s.angle) * R,
            N * 1.3,
            Math.sin(s.angle) * R,
          )
          cam.up.set(0, 1, 0)
          // Mirror onto isoCam so a subsequent transition starts from the
          // same pose the user was watching.
          s.isoCam.position.copy(cam.position)
          s.isoCam.up.copy(cam.up)
          cam.lookAt(0, 0, 0)
          cam.updateProjectionMatrix()
        } else if (mode === 'top') {
          cam.position.copy(s.topCam.position)
          cam.up.copy(s.topCam.up)
          cam.lookAt(0, 0, 0)
          cam.updateProjectionMatrix()
        }
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

  // ─── Top-down scan validity check ─────────────────────────────────
  // Fired 200ms after scene / theme / season changes (debounced so we
  // don't thrash during auto-rotate). Renders the pure black/white QR
  // to a 720×720 offscreen canvas and feeds jsQR at all four rotations.
  useEffect(() => {
    if (!scenePresent) return
    if (!matrixData) return
    const t = setTimeout(() => {
      const s = stateRef.current
      if (!s.renderer || !s.scene || !s.topCam) return

      // Lazily create the 720×720 offscreen canvas — reused across scans.
      if (!s.scanCanvas) {
        s.scanCanvas = document.createElement('canvas')
        s.scanCanvas.width = 720
        s.scanCanvas.height = 720
      }
      const off = s.scanCanvas

      const img = renderTopDownFrame(s, off)
      const decoded = decodeWithRotations(img, payload || '')
      const { contrast, meanDark, meanLight } = measureContrast(img)
      const pxPerModule = Math.round(720 / (matrixData.N + 8))

      // Cache the debug PNG so the button works even if the user hasn't
      // rescanned. `toDataURL` is heavy — only do it when we actually
      // have a fresh scan to expose.
      try { setDebugPngUrl(off.toDataURL('image/png')) } catch { /* CORS should never bite here */ }

      if (decoded.ok) {
        setScanRes({
          ok: true, data: decoded.data, rot: decoded.rot,
          contrast, meanDark, meanLight, pxPerModule,
        })
      } else {
        // Pick a specific reason.
        let reason
        if (decoded.mismatch) {
          reason = 'decoded but payload mismatch'
        } else if (contrast < 80) {
          reason = `not enough contrast (${Math.round(contrast)}/255)`
        } else if (pxPerModule < 6) {
          reason = `resolution too low (${pxPerModule} px per module)`
        } else {
          reason = 'finder pattern obscured or quiet zone insufficient'
        }
        setScanRes({
          ok: false, data: decoded.data, rot: decoded.rot,
          contrast, meanDark, meanLight, pxPerModule, reason,
        })
      }
    }, 200)
    return () => clearTimeout(t)
  }, [scenePresent, matrixData, theme, season, payload])

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

  // Save the last top-down scan snapshot so we can eyeball what jsQR sees.
  const downloadDebugFrame = () => {
    if (!debugPngUrl) return
    const a = document.createElement('a')
    a.href = debugPngUrl
    a.download = `qr-scan-debug-${theme.replace(/\s+/g, '-').toLowerCase()}-${season.toLowerCase()}-${Date.now()}.png`
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
          Tree Garden raises stone tiles from the QR grid; Voxel City builds towers from dark cells; Crystal Cave forests them with glowing columns; Fractal Forest sprouts low-poly trees; Tattoo Bloom extrudes a tattoo silhouette out of the QR floor, coloured by the tattoo&apos;s own palette.
        </p>
        {theme === 'Tattoo Bloom' && !silhouetteMask && (
          <div className='mt-2 rounded-md border border-fuchsia-400/25 bg-fuchsia-400/[0.06] px-3 py-2'>
            <p className='text-[11px] leading-snug text-fuchsia-100'>
              <span className='font-bold'>No silhouette yet.</span> Upload a tattoo in Vision Studio and hit &ldquo;Use this style&rdquo; — the extracted mask will extrude here as a topographical bloom. Right now the scene renders as a plain QR floor.
            </p>
          </div>
        )}

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
              Top-down flattens the scene to the QR silhouette so the code is scannable in-camera. Tap the canvas to toggle — the camera eases between poses over ~750ms with an easeInOutCubic curve.
            </p>
          </div>
          <div>
            <div className='text-xs uppercase tracking-wide text-fg-muted mb-1'>Auto-rotate camera</div>
            <div className='flex items-center gap-3'>
              <Switch
                checked={autoRotate}
                onChange={setAutoRotate}
                disabled={view === 'Top' || transitionPct > 0}
              />
              <span className='text-sm text-fg-muted'>
                {view === 'Top'
                  ? 'Disabled in top-down view'
                  : transitionPct > 0
                    ? 'Paused during transition'
                    : 'One revolution ≈ 14s'}
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
            <Tooltip
              title={
                scanRes.ok
                  ? `jsQR decoded at ${scanRes.rot ?? 0}°. Contrast ${Math.round(scanRes.contrast ?? 0)}/255, ${scanRes.pxPerModule ?? '?'} px per module.`
                  : scanRes.reason
                    ? `Reason: ${scanRes.reason}. Contrast ${Math.round(scanRes.contrast ?? 0)}/255, ${scanRes.pxPerModule ?? '?'} px per module.`
                    : 'Scanning…'
              }
            >
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs border cursor-help
                ${scanRes.ok
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-400/30 bg-rose-500/10 text-rose-200'}`}>
                {scanRes.ok ? <CheckCircleFilled /> : <CloseCircleFilled />}
                {scanRes.ok ? 'Top-down scans' : 'Top-down broken'}
              </span>
            </Tooltip>
            <span className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs'>
              {instanceTotal.toLocaleString()} mesh instances
            </span>
            <Button size='small' variant='ghost' icon={<BugOutlined />} onClick={downloadDebugFrame} disabled={!debugPngUrl}>
              Debug frame
            </Button>
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
          {!scenePresent && !webglError && (
            <div className='absolute inset-0 flex items-center justify-center text-fg-muted text-sm'>
              Enter a payload in the 2D Editor tab to render the scene.
            </div>
          )}
          {webglError && (
            <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 py-8 overflow-auto'>
              <div className='text-4xl'>{'◇'}</div>
              <div className='font-bold text-base'>3D isn't available right now</div>
              <div className='text-fg-muted text-xs max-w-sm leading-snug'>
                Your browser couldn't start a WebGL renderer. Common causes:
              </div>
              <ul className='text-fg-muted text-[11px] max-w-sm leading-snug text-left list-disc pl-6 space-y-1'>
                <li>Too many tabs open with 3D/games — close a few and retry.</li>
                <li>Hardware acceleration is off — check <span className='font-mono'>chrome://settings/system</span>.</li>
                <li>Private / incognito mode with strict GPU blocking.</li>
                <li>Older mobile browser without WebGL2.</li>
              </ul>
              <div className='flex flex-wrap gap-2 justify-center mt-2'>
                <Button variant='primary' size='small' onClick={() => setWebglRetry((n) => n + 1)}>
                  Retry
                </Button>
                <Button variant='ghost' size='small' onClick={() => window.location.reload()}>
                  Full reload
                </Button>
              </div>
              <div className='text-[10px] text-fg-muted font-mono opacity-60 max-w-sm break-all'>{webglError}</div>
            </div>
          )}
          {transitionPct > 0 && (
            <div className='absolute bottom-3 left-3 md:w-56 w-[calc(100%-1.5rem)] pointer-events-none'>
              <div className='rounded-md bg-black/55 backdrop-blur-sm px-3 py-2 border border-white/10'>
                <div className='text-[10px] uppercase tracking-wide text-fg-muted mb-1'>
                  Camera transition
                </div>
                <Progress
                  percent={transitionPct}
                  showInfo={false}
                  strokeColor={{ from: '#fbbf24', to: '#f43f5e' }}
                  trailColor='rgba(255,255,255,0.08)'
                  size='small'
                />
              </div>
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
          The iso view is fully artistic — trees, towers, crystals, lights. The scan check runs on a separate offscreen pass that hides all that geometry and renders the QR as pure black-and-white cells with a 4-module quiet zone, then feeds it to jsQR at four rotations. Hit the "Debug frame" button to download exactly what the scanner sees.
        </p>
      </div>
    </div>
  )
}
