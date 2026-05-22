// Player — capsule character with lane-change, jump, roll, hoverboard.
// All per-frame state lives in refs (no React re-renders in the loop).
// Imperative API via useImperativeHandle so the page shell can drive
// movement from useInput callbacks: changeLane(±1), jump(), roll(),
// activateHoverboard(), plus getHitbox() / isHoverboardActive() for the
// collision system.

import { forwardRef, useImperativeHandle, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { getLanes } from './Track'

const GRAVITY      = -22         // units/s²
const JUMP_VEL     = 9.5         // initial jump impulse
const BASE_Y       = 0.9         // capsule centre when grounded
const LANE_LERP    = 0.18        // per-frame lerp factor (≈ 120ms ease)
const ROLL_TIME    = 0.6         // seconds of roll
const ROLL_SCALE_Y = 0.55        // squashed height while rolling
const HOVER_TIME   = 5.0         // hoverboard duration (seconds)

const lerp = (a, b, t) => a + (b - a) * t

const Player = forwardRef(function Player({ isPortrait }, ref) {
  const groupRef = useRef(null)
  const meshRef  = useRef(null)
  const haloRef  = useRef(null)

  // Per-frame mutable state.
  const state = useRef({
    laneIdx: 1,             // start centre
    targetLaneIdx: 1,
    y: BASE_Y,
    vy: 0,
    rollTimer: 0,
    hoverTimer: 0,
  })

  useFrame((_s, delta) => {
    const g = groupRef.current
    if (!g) return
    const lanes = getLanes(isPortrait)
    const s = state.current

    // Lane lerp.
    const targetX = lanes[s.targetLaneIdx]
    g.position.x = lerp(g.position.x, targetX, LANE_LERP)

    // Vertical physics — only if airborne.
    if (s.y > BASE_Y || s.vy !== 0) {
      s.vy += GRAVITY * delta
      s.y  += s.vy * delta
      if (s.y <= BASE_Y) {
        s.y  = BASE_Y
        s.vy = 0
      }
    }

    // Roll countdown.
    if (s.rollTimer > 0) {
      s.rollTimer -= delta
      if (s.rollTimer < 0) s.rollTimer = 0
    }

    // Hoverboard countdown.
    if (s.hoverTimer > 0) {
      s.hoverTimer -= delta
      if (s.hoverTimer < 0) s.hoverTimer = 0
    }

    // Apply transform.
    g.position.y = s.y
    const rolling = s.rollTimer > 0
    if (meshRef.current) {
      meshRef.current.scale.y = rolling ? ROLL_SCALE_Y : 1
    }
    if (haloRef.current) {
      haloRef.current.visible = s.hoverTimer > 0
      // Pulse on its way out so the user knows time's running low.
      if (haloRef.current.visible) {
        const alpha = s.hoverTimer < 1.5 ? 0.4 + Math.sin(performance.now() / 80) * 0.25 : 0.55
        haloRef.current.material.opacity = alpha
      }
    }
  })

  useImperativeHandle(ref, () => ({
    changeLane(dir) {
      const s = state.current
      const next = Math.max(0, Math.min(2, s.targetLaneIdx + Math.sign(dir)))
      s.targetLaneIdx = next
      s.laneIdx = next
    },
    jump() {
      const s = state.current
      if (s.y > BASE_Y + 0.02) return       // already airborne
      s.vy = JUMP_VEL
    },
    roll() {
      const s = state.current
      if (s.y > BASE_Y + 0.02) return       // can't roll mid-air
      s.rollTimer = ROLL_TIME
    },
    activateHoverboard() {
      state.current.hoverTimer = HOVER_TIME
    },
    isHoverboardActive() {
      return state.current.hoverTimer > 0
    },
    getHitbox() {
      const g = groupRef.current
      if (!g) return null
      const rolling = state.current.rollTimer > 0
      return {
        x: g.position.x,
        y: g.position.y,
        z: g.position.z,
        width:  0.8,
        height: rolling ? 0.8 : 1.6,
        depth:  0.6,
      }
    },
  }), [])

  return (
    <group ref={groupRef} position={[0, BASE_Y, 2]}>
      {/* Body capsule. Falls back gracefully on three versions that don't
          have CapsuleGeometry — three >= 0.140 ships it. */}
      <mesh ref={meshRef} castShadow>
        <capsuleGeometry args={[0.35, 0.8, 8, 16]} />
        <meshStandardMaterial color='#fb923c' roughness={0.45} metalness={0.2} />
      </mesh>
      {/* Eyes — purely cosmetic */}
      <mesh position={[-0.13, 0.45, 0.28]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color='#0f172a' />
      </mesh>
      <mesh position={[0.13, 0.45, 0.28]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color='#0f172a' />
      </mesh>
      {/* Hoverboard halo — toggled by hoverTimer */}
      <mesh ref={haloRef} visible={false} position={[0, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.85, 32]} />
        <meshBasicMaterial color='#22d3ee' transparent opacity={0.55} />
      </mesh>
    </group>
  )
})

export default Player
