// Player — low-poly humanoid with a procedural running cycle.
// Limbs are simple boxes/cylinders rotated each frame to fake a run; on
// jump the cycle pauses + arms swing up; on roll the figure curls into
// a ball + Y-scale tucks the hitbox. forwardRef exposes the imperative
// API consumed by useInput callbacks.

import { forwardRef, useImperativeHandle, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { getLanes } from './Track'

const GRAVITY      = -22
const JUMP_VEL     = 9.5
const BASE_Y       = 0.9
const LANE_LERP    = 0.18
const ROLL_TIME    = 0.6
const ROLL_SCALE_Y = 0.55
const HOVER_TIME   = 5.0

const lerp = (a, b, t) => a + (b - a) * t

const Player = forwardRef(function Player({ isPortrait }, ref) {
  const groupRef    = useRef(null)
  const rigRef      = useRef(null)        // body rig that scales on roll
  const haloRef     = useRef(null)
  const leftArmRef  = useRef(null)
  const rightArmRef = useRef(null)
  const leftLegRef  = useRef(null)
  const rightLegRef = useRef(null)
  const headRef     = useRef(null)

  // Per-frame mutable state (no React re-renders in the loop).
  const state = useRef({
    laneIdx: 1,
    targetLaneIdx: 1,
    y: BASE_Y,
    vy: 0,
    rollTimer: 0,
    hoverTimer: 0,
    runPhase: 0,
  })

  useFrame((_s, delta) => {
    const g = groupRef.current
    if (!g) return
    const lanes = getLanes(isPortrait)
    const s = state.current

    // Lane lerp.
    g.position.x = lerp(g.position.x, lanes[s.targetLaneIdx], LANE_LERP)

    // Vertical physics.
    const airborne = s.y > BASE_Y || s.vy !== 0
    if (airborne) {
      s.vy += GRAVITY * delta
      s.y  += s.vy * delta
      if (s.y <= BASE_Y) { s.y = BASE_Y; s.vy = 0 }
    }
    g.position.y = s.y

    // Roll countdown.
    if (s.rollTimer > 0) s.rollTimer = Math.max(0, s.rollTimer - delta)
    const rolling = s.rollTimer > 0

    // Hoverboard countdown + glow pulse.
    if (s.hoverTimer > 0) s.hoverTimer = Math.max(0, s.hoverTimer - delta)
    if (haloRef.current) {
      haloRef.current.visible = s.hoverTimer > 0
      if (haloRef.current.visible) {
        const a = s.hoverTimer < 1.5 ? 0.4 + Math.sin(performance.now() / 80) * 0.25 : 0.55
        haloRef.current.material.opacity = a
      }
    }

    // Run cycle — phase ticks faster the faster the world moves, but we
    // don't read speed here; a static cadence reads as "running" fine.
    // Pause the cycle while airborne, and curl up during a roll.
    if (!airborne && !rolling) {
      s.runPhase += delta * 8
      const swing = Math.sin(s.runPhase) * 0.9
      if (leftLegRef.current)  leftLegRef.current.rotation.x  =  swing
      if (rightLegRef.current) rightLegRef.current.rotation.x = -swing
      if (leftArmRef.current)  leftArmRef.current.rotation.x  = -swing * 0.7
      if (rightArmRef.current) rightArmRef.current.rotation.x =  swing * 0.7
      if (headRef.current)     headRef.current.position.y    = 1.05 + Math.abs(Math.sin(s.runPhase)) * 0.04
    } else if (airborne) {
      // Pose: arms forward, legs slightly bent.
      if (leftArmRef.current)  leftArmRef.current.rotation.x  = -0.9
      if (rightArmRef.current) rightArmRef.current.rotation.x = -0.9
      if (leftLegRef.current)  leftLegRef.current.rotation.x  =  0.35
      if (rightLegRef.current) rightLegRef.current.rotation.x = -0.35
    }

    // Roll: tuck body — squash Y on the rig group + tilt forward.
    if (rigRef.current) {
      if (rolling) {
        rigRef.current.scale.y = ROLL_SCALE_Y
        rigRef.current.rotation.x = -0.7
        // Hide limbs — the tuck reads better as a curled ball.
        if (leftArmRef.current)  leftArmRef.current.rotation.x  = -1.4
        if (rightArmRef.current) rightArmRef.current.rotation.x = -1.4
        if (leftLegRef.current)  leftLegRef.current.rotation.x  =  1.4
        if (rightLegRef.current) rightLegRef.current.rotation.x =  1.4
      } else {
        rigRef.current.scale.y = 1
        rigRef.current.rotation.x = 0
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
      if (s.y > BASE_Y + 0.02) return
      s.vy = JUMP_VEL
    },
    roll() {
      const s = state.current
      if (s.y > BASE_Y + 0.02) return
      s.rollTimer = ROLL_TIME
    },
    activateHoverboard() { state.current.hoverTimer = HOVER_TIME },
    isHoverboardActive() { return state.current.hoverTimer > 0 },
    getHitbox() {
      const g = groupRef.current
      if (!g) return null
      const rolling = state.current.rollTimer > 0
      return {
        x: g.position.x, y: g.position.y, z: g.position.z,
        width: 0.8, height: rolling ? 0.8 : 1.6, depth: 0.6,
      }
    },
  }), [])

  return (
    <group ref={groupRef} position={[0, BASE_Y, 2]}>
      {/* Rig group — scales/rotates on roll without affecting hitbox. */}
      <group ref={rigRef}>
        {/* Torso */}
        <mesh castShadow position={[0, 0.2, 0]}>
          <boxGeometry args={[0.6, 0.8, 0.4]} />
          <meshStandardMaterial color='#fb923c' roughness={0.55} />
        </mesh>
        {/* Backpack — Subway Surfers vibe */}
        <mesh castShadow position={[0, 0.3, -0.27]}>
          <boxGeometry args={[0.45, 0.55, 0.18]} />
          <meshStandardMaterial color='#7c3aed' roughness={0.6} />
        </mesh>
        {/* Head */}
        <group ref={headRef} position={[0, 1.05, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.3, 16, 14]} />
            <meshStandardMaterial color='#fde7c7' roughness={0.7} />
          </mesh>
          {/* Cap */}
          <mesh position={[0, 0.18, 0]} castShadow>
            <cylinderGeometry args={[0.32, 0.32, 0.18, 16]} />
            <meshStandardMaterial color='#ef4444' roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.10, 0.30]} castShadow>
            <boxGeometry args={[0.4, 0.05, 0.20]} />
            <meshStandardMaterial color='#ef4444' roughness={0.5} />
          </mesh>
          {/* Eyes */}
          <mesh position={[-0.10, 0.04, 0.27]}><sphereGeometry args={[0.05, 10, 10]} /><meshBasicMaterial color='#0f172a' /></mesh>
          <mesh position={[ 0.10, 0.04, 0.27]}><sphereGeometry args={[0.05, 10, 10]} /><meshBasicMaterial color='#0f172a' /></mesh>
        </group>
        {/* Arms — attached at the shoulder pivot so rotation looks natural */}
        <group ref={leftArmRef}  position={[-0.40, 0.50, 0]}>
          <mesh castShadow position={[0, -0.30, 0]}>
            <boxGeometry args={[0.18, 0.7, 0.18]} />
            <meshStandardMaterial color='#fb923c' roughness={0.55} />
          </mesh>
        </group>
        <group ref={rightArmRef} position={[ 0.40, 0.50, 0]}>
          <mesh castShadow position={[0, -0.30, 0]}>
            <boxGeometry args={[0.18, 0.7, 0.18]} />
            <meshStandardMaterial color='#fb923c' roughness={0.55} />
          </mesh>
        </group>
        {/* Legs */}
        <group ref={leftLegRef}  position={[-0.18, -0.20, 0]}>
          <mesh castShadow position={[0, -0.35, 0]}>
            <boxGeometry args={[0.22, 0.75, 0.22]} />
            <meshStandardMaterial color='#1e293b' roughness={0.7} />
          </mesh>
          {/* Shoe */}
          <mesh castShadow position={[0, -0.78, 0.08]}>
            <boxGeometry args={[0.26, 0.14, 0.36]} />
            <meshStandardMaterial color='#fafaf9' roughness={0.6} />
          </mesh>
        </group>
        <group ref={rightLegRef} position={[ 0.18, -0.20, 0]}>
          <mesh castShadow position={[0, -0.35, 0]}>
            <boxGeometry args={[0.22, 0.75, 0.22]} />
            <meshStandardMaterial color='#1e293b' roughness={0.7} />
          </mesh>
          <mesh castShadow position={[0, -0.78, 0.08]}>
            <boxGeometry args={[0.26, 0.14, 0.36]} />
            <meshStandardMaterial color='#fafaf9' roughness={0.6} />
          </mesh>
        </group>
      </group>
      {/* Hoverboard halo — outside the rig so its visibility is independent of roll. */}
      <mesh ref={haloRef} visible={false} position={[0, -0.85, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.9, 32]} />
        <meshBasicMaterial color='#22d3ee' transparent opacity={0.55} />
      </mesh>
    </group>
  )
})

export default Player
