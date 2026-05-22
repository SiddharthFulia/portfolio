// Spawner — generates rows of obstacles + coins ahead of the player and
// moves them toward the camera at the world speed. Replaces the v1
// plain-box obstacles with composed entity groups: trains have windows
// + headlights + wheels, barriers are striped warning posts, overhangs
// are signed beams. Coins keep their torus + spin.

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { getLanes } from './Track'

const FAR_Z          = -80
const CULL_Z         = 5
const COINS_PER_ARC  = 5
const COIN_SPACING_Z = 1.0

// Each obstacle keeps the same (w,h,d) hitbox the v1 spawner used so the
// useGameLoop AABB collision code keeps working — only the rendered
// meshes change.
const OBSTACLE_TYPES = [
  { type: 'train',    weight: 0.40, dim: [0.9, 2.4, 4.0], y: 1.2 },
  { type: 'barrier',  weight: 0.35, dim: [0.9, 0.6, 0.5], y: 0.3 },
  { type: 'overhang', weight: 0.25, dim: [0.9, 0.5, 0.5], y: 1.9 },
]

const pickObstacle = () => {
  const r = Math.random()
  let acc = 0
  for (const t of OBSTACLE_TYPES) {
    acc += t.weight
    if (r <= acc) return t
  }
  return OBSTACLE_TYPES[0]
}

let _id = 1
const nextId = () => _id++

const Spawner = forwardRef(function Spawner({ speedRef, isPortrait }, ref) {
  const obstacles    = useRef([])
  const coins        = useRef([])
  const powerups     = useRef([])
  const lastSpawnZ   = useRef(FAR_Z)
  const lanes        = getLanes(isPortrait)

  // 10Hz tick to re-render React tree so new spawns show. Per-frame
  // position updates happen via per-mesh refs (no rerender).
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 100)
    return () => clearInterval(id)
  }, [])

  const meshMap = useMemo(() => new Map(), [])

  const spawnRow = (z) => {
    const numBlocked = Math.random() < 0.3 ? 2 : 1
    const laneIdxs = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, numBlocked)
    const blockedSet = new Set(laneIdxs)
    laneIdxs.forEach((laneIdx) => {
      const tpl = pickObstacle()
      obstacles.current.push({
        id: nextId(),
        type: tpl.type,
        laneIdx,
        dim: tpl.dim,
        position: { x: lanes[laneIdx], y: tpl.y, z },
        alive: true,
      })
    })
    const emptyLanes = [0, 1, 2].filter(i => !blockedSet.has(i))
    if (emptyLanes.length) {
      const chosen = emptyLanes[Math.floor(Math.random() * emptyLanes.length)]
      if (Math.random() < 1 / 30) {
        powerups.current.push({
          id: nextId(), laneIdx: chosen,
          position: { x: lanes[chosen], y: 0.9, z },
          alive: true,
        })
      } else {
        for (let i = 0; i < COINS_PER_ARC; i++) {
          coins.current.push({
            id: nextId(), laneIdx: chosen,
            position: { x: lanes[chosen], y: 0.7, z: z - i * COIN_SPACING_Z },
            alive: true,
          })
        }
      }
    }
  }

  useFrame((_s, delta) => {
    const speed = speedRef?.current ?? 0
    const dz = speed * delta

    const advance = (arr) => {
      for (const item of arr) {
        if (!item.alive) continue
        item.position.z += dz
        if (item.position.z > CULL_Z) item.alive = false
      }
    }
    advance(obstacles.current)
    advance(coins.current)
    advance(powerups.current)

    if (obstacles.current.length > 60) obstacles.current = obstacles.current.filter(o => o.alive)
    if (coins.current.length > 200)    coins.current     = coins.current.filter(c => c.alive)
    if (powerups.current.length > 20)  powerups.current  = powerups.current.filter(p => p.alive)

    // Sync mesh world positions + coin spin.
    const apply = (arr) => {
      for (const item of arr) {
        const m = meshMap.get(item.id)
        if (!m) continue
        m.position.set(item.position.x, item.position.y, item.position.z)
        m.visible = item.alive
      }
    }
    apply(obstacles.current)
    apply(coins.current)
    apply(powerups.current)
    for (const c of coins.current) {
      const m = meshMap.get(c.id)
      if (m) m.rotation.z += 0.08
    }

    const gap = Math.max(2.5, Math.min(8, 8 - speed * 0.15))
    lastSpawnZ.current += dz
    if (lastSpawnZ.current > FAR_Z + gap) {
      spawnRow(FAR_Z)
      lastSpawnZ.current = FAR_Z
    }
  })

  useImperativeHandle(ref, () => ({
    getObstacles: () => obstacles.current,
    getCoins:     () => coins.current,
    getPowerups:  () => powerups.current,
    removeObstacle(id) { const it = obstacles.current.find(o => o.id === id); if (it) it.alive = false },
    removeCoin(id)     { const it = coins.current.find(c => c.id === id);    if (it) it.alive = false },
    removePowerup(id)  { const it = powerups.current.find(p => p.id === id); if (it) it.alive = false },
    reset() {
      obstacles.current = []; coins.current = []; powerups.current = []
      lastSpawnZ.current = FAR_Z
    },
  }), [])

  return (
    <group>
      {obstacles.current.filter(o => o.alive).map(o => (
        <Obstacle
          key={o.id}
          o={o}
          meshRef={(m) => { if (m) meshMap.set(o.id, m); else meshMap.delete(o.id) }}
        />
      ))}
      {coins.current.filter(c => c.alive).map(c => (
        <mesh
          key={c.id}
          ref={(m) => { if (m) meshMap.set(c.id, m); else meshMap.delete(c.id) }}
          position={[c.position.x, c.position.y, c.position.z]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[0.18, 0.05, 8, 18]} />
          <meshStandardMaterial color='#fbbf24' emissive='#a16207' metalness={0.7} roughness={0.2} />
        </mesh>
      ))}
      {powerups.current.filter(p => p.alive).map(p => (
        <group
          key={p.id}
          ref={(m) => { if (m) meshMap.set(p.id, m); else meshMap.delete(p.id) }}
          position={[p.position.x, p.position.y, p.position.z]}
        >
          {/* Hoverboard powerup — neon deck with glowing trim */}
          <mesh castShadow>
            <boxGeometry args={[0.5, 0.18, 1.5]} />
            <meshStandardMaterial color='#22d3ee' emissive='#06b6d4' emissiveIntensity={0.7} metalness={0.4} roughness={0.2} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <boxGeometry args={[0.55, 0.04, 1.55]} />
            <meshBasicMaterial color='#67e8f9' transparent opacity={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
})

// ── Composed obstacle entities ──
function Obstacle({ o, meshRef }) {
  const handleRef = (m) => {
    if (typeof meshRef === 'function') meshRef(m)
  }
  if (o.type === 'train')    return <Train    o={o} bindRef={handleRef} />
  if (o.type === 'barrier')  return <Barrier  o={o} bindRef={handleRef} />
  if (o.type === 'overhang') return <Overhang o={o} bindRef={handleRef} />
  return null
}

// Subway-Surfers-style train car. Long box with windows along the side,
// chunky headlight on the front, wheel pairs at the base.
function Train({ o, bindRef }) {
  // Slight per-instance colour variety so a row of trains doesn't look stamped.
  const palette = useMemo(() => {
    const choices = ['#3b82f6', '#10b981', '#ef4444', '#a855f7', '#facc15']
    return choices[Math.floor(o.id) % choices.length] || '#3b82f6'
  }, [o.id])
  return (
    <group
      ref={bindRef}
      position={[o.position.x, o.position.y, o.position.z]}
    >
      {/* Body */}
      <mesh castShadow>
        <boxGeometry args={[o.dim[0], o.dim[1], o.dim[2]]} />
        <meshStandardMaterial color={palette} roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Roof beam */}
      <mesh castShadow position={[0, o.dim[1] / 2 + 0.06, 0]}>
        <boxGeometry args={[o.dim[0] + 0.08, 0.12, o.dim[2]]} />
        <meshStandardMaterial color='#1f2937' roughness={0.7} />
      </mesh>
      {/* Window strip (long thin emissive box on each side) */}
      <mesh position={[ o.dim[0] / 2 + 0.001, 0.4, 0]}>
        <boxGeometry args={[0.02, 0.5, o.dim[2] - 0.6]} />
        <meshStandardMaterial color='#fef9c3' emissive='#facc15' emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[-o.dim[0] / 2 - 0.001, 0.4, 0]}>
        <boxGeometry args={[0.02, 0.5, o.dim[2] - 0.6]} />
        <meshStandardMaterial color='#fef9c3' emissive='#facc15' emissiveIntensity={0.6} />
      </mesh>
      {/* Window mullions — split the strip into 3 windows */}
      {[-1, 0, 1].map((i) => (
        <mesh key={i} position={[0, 0.4, i * (o.dim[2] / 3)]}>
          <boxGeometry args={[o.dim[0] + 0.04, 0.6, 0.06]} />
          <meshStandardMaterial color={palette} roughness={0.6} />
        </mesh>
      ))}
      {/* Front face — colored darker, plus 2 round headlights */}
      <mesh position={[0, -0.2, -o.dim[2] / 2 - 0.001]}>
        <boxGeometry args={[o.dim[0] - 0.05, o.dim[1] - 0.4, 0.04]} />
        <meshStandardMaterial color='#0f172a' roughness={0.7} />
      </mesh>
      <mesh position={[-0.22, 0.0, -o.dim[2] / 2 - 0.04]}>
        <cylinderGeometry args={[0.10, 0.10, 0.08, 16]} />
        <meshStandardMaterial color='#fef3c7' emissive='#fde047' emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[ 0.22, 0.0, -o.dim[2] / 2 - 0.04]}>
        <cylinderGeometry args={[0.10, 0.10, 0.08, 16]} />
        <meshStandardMaterial color='#fef3c7' emissive='#fde047' emissiveIntensity={1.2} />
      </mesh>
      {/* Wheels — pairs of small dark cylinders along the underside */}
      {[-0.95, 0.95].map((zOff) => (
        <group key={zOff} position={[0, -o.dim[1] / 2 + 0.15, zOff]}>
          <mesh castShadow rotation={[0, 0, Math.PI / 2]} position={[-o.dim[0] / 2 - 0.02, 0, 0]}>
            <cylinderGeometry args={[0.18, 0.18, 0.08, 14]} />
            <meshStandardMaterial color='#111827' roughness={0.8} />
          </mesh>
          <mesh castShadow rotation={[0, 0, Math.PI / 2]} position={[ o.dim[0] / 2 + 0.02, 0, 0]}>
            <cylinderGeometry args={[0.18, 0.18, 0.08, 14]} />
            <meshStandardMaterial color='#111827' roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// Striped warning barrier — short bench-height obstacle with diagonal hazard stripes.
function Barrier({ o, bindRef }) {
  return (
    <group
      ref={bindRef}
      position={[o.position.x, o.position.y, o.position.z]}
    >
      <mesh castShadow>
        <boxGeometry args={[o.dim[0], o.dim[1], o.dim[2]]} />
        <meshStandardMaterial color='#fbbf24' roughness={0.6} />
      </mesh>
      {/* Black diagonal stripes — fake them as thin angled boxes */}
      {[-0.25, 0, 0.25].map((zOff) => (
        <mesh
          key={zOff}
          position={[0, 0, zOff]}
          rotation={[0.4, 0, 0]}
        >
          <boxGeometry args={[o.dim[0] + 0.01, o.dim[1] - 0.05, 0.06]} />
          <meshStandardMaterial color='#0f172a' roughness={0.7} />
        </mesh>
      ))}
      {/* Tiny posts on each end */}
      <mesh castShadow position={[-o.dim[0] / 2 - 0.05, 0.15, 0]}>
        <boxGeometry args={[0.1, 0.9, 0.1]} />
        <meshStandardMaterial color='#1f2937' roughness={0.7} />
      </mesh>
      <mesh castShadow position={[ o.dim[0] / 2 + 0.05, 0.15, 0]}>
        <boxGeometry args={[0.1, 0.9, 0.1]} />
        <meshStandardMaterial color='#1f2937' roughness={0.7} />
      </mesh>
    </group>
  )
}

// Overhead obstacle — horizontal beam with hanging warning sign and supports.
function Overhang({ o, bindRef }) {
  return (
    <group
      ref={bindRef}
      position={[o.position.x, o.position.y, o.position.z]}
    >
      {/* Beam */}
      <mesh castShadow>
        <boxGeometry args={[o.dim[0] + 0.4, o.dim[1], o.dim[2]]} />
        <meshStandardMaterial color='#dc2626' roughness={0.6} />
      </mesh>
      {/* Yellow warning stripe along the front face */}
      <mesh position={[0, 0, o.dim[2] / 2 + 0.01]}>
        <boxGeometry args={[o.dim[0] + 0.4, o.dim[1] * 0.6, 0.02]} />
        <meshStandardMaterial color='#fde047' emissive='#facc15' emissiveIntensity={0.3} />
      </mesh>
      {/* Two supports descending from the beam to suggest a frame */}
      <mesh castShadow position={[-(o.dim[0] / 2 + 0.18), -0.3, 0]}>
        <boxGeometry args={[0.08, 0.6, o.dim[2]]} />
        <meshStandardMaterial color='#1f2937' roughness={0.7} />
      </mesh>
      <mesh castShadow position={[ (o.dim[0] / 2 + 0.18), -0.3, 0]}>
        <boxGeometry args={[0.08, 0.6, o.dim[2]]} />
        <meshStandardMaterial color='#1f2937' roughness={0.7} />
      </mesh>
    </group>
  )
}

export default Spawner
