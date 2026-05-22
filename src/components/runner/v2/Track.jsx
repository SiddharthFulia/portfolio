// Track — scrolling ground + 3-lane visual markers + railway sleepers
// + light arches every ~25 units for tunnel-y atmosphere. Lane
// positions are aspect-aware so the player never goes off-screen on
// phones (portrait packs the lanes in tighter).

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export const LANES_DESKTOP  = [-2,    0,  2]
export const LANES_PORTRAIT = [-1.4,  0,  1.4]
export const getLanes = (isPortrait) => (isPortrait ? LANES_PORTRAIT : LANES_DESKTOP)

const SEGMENT_LENGTH = 200
const TRACK_WIDTH    = 12
const SEGMENTS = [
  { z0: 0 },
  { z0: -SEGMENT_LENGTH },
]

// Sleeper (railroad tie) spacing along Z. Each sleeper is a thin dark
// box. We pool ~40 sleepers and recycle them as they pass the camera.
const SLEEPER_COUNT   = 40
const SLEEPER_SPACING = 6
// Arches every ARCH_SPACING units — a stylised gate above the track for
// vertical interest. Pooled like sleepers.
const ARCH_COUNT      = 8
const ARCH_SPACING    = 28

export default function Track({ speedRef, isPortrait }) {
  const segRefs = [useRef(null), useRef(null)]
  const sleeperRefs = useRef([])
  const archRefs    = useRef([])
  const lanes = getLanes(isPortrait)

  // Pre-compute starting z values for sleepers + arches so they're
  // evenly distributed at mount.
  const initialSleeperZ = useMemo(
    () => Array.from({ length: SLEEPER_COUNT }, (_, i) => -SLEEPER_SPACING * i),
    []
  )
  const initialArchZ = useMemo(
    () => Array.from({ length: ARCH_COUNT }, (_, i) => -ARCH_SPACING * i - 10),
    []
  )

  useFrame((_state, delta) => {
    const speed = speedRef?.current ?? 0
    const dz = speed * delta

    // Ground segments leap-frog.
    for (let i = 0; i < SEGMENTS.length; i++) {
      const m = segRefs[i].current
      if (!m) continue
      m.position.z += dz
      if (m.position.z > SEGMENT_LENGTH / 2 + 20) {
        m.position.z -= SEGMENT_LENGTH * SEGMENTS.length
      }
    }

    // Sleepers slide forward; recycle past camera.
    const totalSleeperLen = SLEEPER_COUNT * SLEEPER_SPACING
    for (let i = 0; i < SLEEPER_COUNT; i++) {
      const m = sleeperRefs.current[i]
      if (!m) continue
      m.position.z += dz
      if (m.position.z > 10) m.position.z -= totalSleeperLen
    }

    // Arches recycle on their own cadence.
    const totalArchLen = ARCH_COUNT * ARCH_SPACING
    for (let i = 0; i < ARCH_COUNT; i++) {
      const m = archRefs.current[i]
      if (!m) continue
      m.position.z += dz
      if (m.position.z > 15) m.position.z -= totalArchLen
    }
  })

  return (
    <group>
      {/* Two leap-frogging ground segments — concrete-dark with subtle
          warmth so emissive lights pop against it. */}
      {SEGMENTS.map((seg, i) => (
        <mesh
          key={i}
          ref={segRefs[i]}
          position={[0, 0, seg.z0 - SEGMENT_LENGTH / 2 + 20]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[TRACK_WIDTH, SEGMENT_LENGTH]} />
          <meshStandardMaterial color='#0f0f17' roughness={0.95} metalness={0.05} />
        </mesh>
      ))}

      {/* Pooled sleepers — thin dark planks across the track. */}
      {initialSleeperZ.map((z, i) => (
        <mesh
          key={i}
          ref={(m) => { sleeperRefs.current[i] = m }}
          position={[0, 0.02, z]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[TRACK_WIDTH - 1, 0.6]} />
          <meshStandardMaterial color='#1c1917' roughness={0.95} />
        </mesh>
      ))}

      {/* Lane dividers — subtle glowing lines on the floor between lanes.
          We render two thin strips per lane edge. */}
      {lanes.map((x, i) => (
        <mesh
          key={i}
          position={[x, 0.03, -SEGMENT_LENGTH / 4]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.06, SEGMENT_LENGTH * 1.5]} />
          <meshBasicMaterial color={i === 1 ? '#fbbf24' : '#475569'} transparent opacity={0.5} />
        </mesh>
      ))}

      {/* Side rails — tall thin walls so the playing field reads as bounded. */}
      <mesh position={[-TRACK_WIDTH / 2 + 0.5, 0.6, -SEGMENT_LENGTH / 4]}>
        <boxGeometry args={[0.1, 1.2, SEGMENT_LENGTH * 1.5]} />
        <meshStandardMaterial color='#0f172a' />
      </mesh>
      <mesh position={[TRACK_WIDTH / 2 - 0.5, 0.6, -SEGMENT_LENGTH / 4]}>
        <boxGeometry args={[0.1, 1.2, SEGMENT_LENGTH * 1.5]} />
        <meshStandardMaterial color='#0f172a' />
      </mesh>

      {/* Pooled arches — stylised gates above the track that scroll
          toward the player. Adds vertical depth + a sense of tunnel. */}
      {initialArchZ.map((z, i) => (
        <group
          key={i}
          ref={(m) => { archRefs.current[i] = m }}
          position={[0, 0, z]}
        >
          {/* Left pillar */}
          <mesh castShadow position={[-(TRACK_WIDTH / 2 - 0.3), 1.6, 0]}>
            <boxGeometry args={[0.4, 3.2, 0.5]} />
            <meshStandardMaterial color='#0f172a' roughness={0.6} />
          </mesh>
          {/* Right pillar */}
          <mesh castShadow position={[ (TRACK_WIDTH / 2 - 0.3), 1.6, 0]}>
            <boxGeometry args={[0.4, 3.2, 0.5]} />
            <meshStandardMaterial color='#0f172a' roughness={0.6} />
          </mesh>
          {/* Crossbeam */}
          <mesh castShadow position={[0, 3.2, 0]}>
            <boxGeometry args={[TRACK_WIDTH - 0.4, 0.5, 0.5]} />
            <meshStandardMaterial color='#0f172a' roughness={0.6} />
          </mesh>
          {/* Underside lamp strip — gives the impression of station lighting */}
          <mesh position={[0, 3.0, 0]}>
            <boxGeometry args={[TRACK_WIDTH - 1, 0.06, 0.2]} />
            <meshStandardMaterial color='#fef9c3' emissive='#fbbf24' emissiveIntensity={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
