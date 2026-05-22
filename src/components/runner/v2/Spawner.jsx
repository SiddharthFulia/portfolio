// Spawner — generates rows of obstacles + coins ahead of the player
// and moves them toward the camera at the world speed. Exposes
// imperative getObstacles/getCoins/getPowerups (+ remove*) so the game
// loop can run collision + pickup tests without paying React's rerender
// cost.

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { getLanes } from './Track'

const FAR_Z       = -80
const CULL_Z      = 5
const COINS_PER_ARC = 5
const COIN_SPACING_Z = 1.0

const OBSTACLE_TYPES = [
  { type: 'train',    weight: 0.40, dim: [0.9, 2.4, 4.0], y: 1.2, color: '#475569' },
  { type: 'barrier',  weight: 0.35, dim: [0.9, 0.6, 0.5], y: 0.3, color: '#f87171' },
  { type: 'overhang', weight: 0.25, dim: [0.9, 0.5, 0.5], y: 1.9, color: '#fbbf24' },
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
  const groupRef = useRef(null)
  // Pools — we keep React out of the hot path entirely and just push/pop
  // meshes from a vanilla array. Refs get added to the scene graph via a
  // useFrame hook that swaps them in.
  const obstacles = useRef([])
  const coins     = useRef([])
  const powerups  = useRef([])
  const lastSpawnZ = useRef(FAR_Z)

  const lanes = getLanes(isPortrait)

  // Spawn one "row" of obstacles + opportunistic coin arc.
  const spawnRow = (z) => {
    // Decide how many lanes are blocked this row: 1 obstacle (70%) or 2 (30%).
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
        color: tpl.color,
        position: { x: lanes[laneIdx], y: tpl.y, z },
        alive: true,
      })
    })
    // Coins in any empty lane (pick one randomly to keep score-pacing sane).
    const emptyLanes = [0, 1, 2].filter(i => !blockedSet.has(i))
    if (emptyLanes.length) {
      const chosenLane = emptyLanes[Math.floor(Math.random() * emptyLanes.length)]
      // 1-in-30 powerup vs coin arc.
      if (Math.random() < 1 / 30) {
        powerups.current.push({
          id: nextId(),
          laneIdx: chosenLane,
          position: { x: lanes[chosenLane], y: 0.9, z },
          alive: true,
        })
      } else {
        for (let i = 0; i < COINS_PER_ARC; i++) {
          coins.current.push({
            id: nextId(),
            laneIdx: chosenLane,
            position: { x: lanes[chosenLane], y: 0.7, z: z - i * COIN_SPACING_Z },
            alive: true,
          })
        }
      }
    }
  }

  useFrame((_s, delta) => {
    const speed = speedRef?.current ?? 0
    const dz = speed * delta

    // Advance every alive item; cull past the camera.
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

    // GC: keep arrays small by filtering when many are dead.
    if (obstacles.current.length > 60) obstacles.current = obstacles.current.filter(o => o.alive)
    if (coins.current.length > 200)    coins.current     = coins.current.filter(c => c.alive)
    if (powerups.current.length > 20)  powerups.current  = powerups.current.filter(p => p.alive)

    // Decide whether to spawn a new row. Gap shrinks as speed grows.
    const gap = Math.max(2.5, Math.min(8, 8 - speed * 0.15))
    lastSpawnZ.current += dz   // last-spawn drifts with the world
    if (lastSpawnZ.current > FAR_Z + gap) {
      spawnRow(FAR_Z)
      lastSpawnZ.current = FAR_Z
    }
  })

  useImperativeHandle(ref, () => ({
    getObstacles: () => obstacles.current,
    getCoins:     () => coins.current,
    getPowerups:  () => powerups.current,
    removeObstacle(id) {
      const it = obstacles.current.find(o => o.id === id); if (it) it.alive = false
    },
    removeCoin(id)     { const it = coins.current.find(c => c.id === id);    if (it) it.alive = false },
    removePowerup(id)  { const it = powerups.current.find(p => p.id === id); if (it) it.alive = false },
    reset() {
      obstacles.current = []
      coins.current     = []
      powerups.current  = []
      lastSpawnZ.current = FAR_Z
    },
  }), [])

  return (
    <group ref={groupRef}>
      {/* Render meshes by mapping over the *current* item arrays. We
          re-render on each tick via a state-less SpawnerMeshes helper
          that uses useFrame to sync positions. To keep this simple
          (and avoid a second hook layer) we just render straight from
          the refs — React rerenders are driven by RefreshTick. */}
      <SpawnerMeshes obstacles={obstacles} coins={coins} powerups={powerups} />
    </group>
  )
})

// Sub-component that owns the meshes. Re-runs render cheaply because we
// use the ref arrays directly and three.js does the actual lifting.
function SpawnerMeshes({ obstacles, coins, powerups }) {
  const groupRef = useRef(null)
  // Force a regular React rerender ~10x/sec so newly spawned items show.
  // (Position updates between rerenders happen via per-mesh refs below.)
  const [, force] = useTickState()

  // Per-item mesh refs so we can write position each frame.
  const meshMap = useMemo(() => new Map(), [])

  useFrame(() => {
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
    // Spin coins on Y.
    for (const c of coins.current) {
      const m = meshMap.get(c.id)
      if (m) m.rotation.z += 0.08
    }
  })

  // Tick once on mount + periodically so React picks up new spawns.
  // (Avoids the more invasive "re-render every frame" pattern.)
  // 10Hz is fine for spawn cadence; positions update per frame anyway.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useTickInterval(() => force(n => n + 1), 100)

  return (
    <group ref={groupRef}>
      {obstacles.current.filter(o => o.alive).map(o => (
        <mesh
          key={o.id}
          ref={(m) => { if (m) meshMap.set(o.id, m); else meshMap.delete(o.id) }}
          position={[o.position.x, o.position.y, o.position.z]}
          castShadow
        >
          <boxGeometry args={o.dim} />
          <meshStandardMaterial color={o.color} roughness={0.6} />
        </mesh>
      ))}
      {coins.current.filter(c => c.alive).map(c => (
        <mesh
          key={c.id}
          ref={(m) => { if (m) meshMap.set(c.id, m); else meshMap.delete(c.id) }}
          position={[c.position.x, c.position.y, c.position.z]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[0.18, 0.05, 8, 18]} />
          <meshStandardMaterial color='#fbbf24' emissive='#92400e' metalness={0.7} roughness={0.2} />
        </mesh>
      ))}
      {powerups.current.filter(p => p.alive).map(p => (
        <mesh
          key={p.id}
          ref={(m) => { if (m) meshMap.set(p.id, m); else meshMap.delete(p.id) }}
          position={[p.position.x, p.position.y, p.position.z]}
        >
          <boxGeometry args={[0.5, 0.2, 1.5]} />
          <meshStandardMaterial color='#22d3ee' emissive='#0e7490' metalness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

// Tiny helpers — kept inline so this component file stays self-contained.
import { useEffect, useState } from 'react'
function useTickState() { return useState(0) }
function useTickInterval(fn, ms) {
  useEffect(() => {
    const id = setInterval(fn, ms)
    return () => clearInterval(id)
  }, [fn, ms])
}

export default Spawner
