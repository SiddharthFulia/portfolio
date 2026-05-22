// Track — scrolling ground + 3-lane visual markers.
// Lane positions are aspect-aware so the player never goes off-screen
// on phones (portrait packs the lanes in tighter).

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export const LANES_DESKTOP  = [-2,    0,  2]
export const LANES_PORTRAIT = [-1.4,  0,  1.4]
export const getLanes = (isPortrait) => (isPortrait ? LANES_PORTRAIT : LANES_DESKTOP)

const SEGMENT_LENGTH = 200
const TRACK_WIDTH    = 12
// Two segments leapfrog past each other so the ground is endless without
// allocating new geometry every frame.
const SEGMENTS = [
  { z: 0,                z0: 0,                len: SEGMENT_LENGTH },
  { z: -SEGMENT_LENGTH,  z0: -SEGMENT_LENGTH,  len: SEGMENT_LENGTH },
]

export default function Track({ speedRef, isPortrait }) {
  const segRefs = [useRef(null), useRef(null)]
  const lanes = getLanes(isPortrait)

  useFrame((_state, delta) => {
    const speed = speedRef?.current ?? 0
    for (let i = 0; i < SEGMENTS.length; i++) {
      const m = segRefs[i].current
      if (!m) continue
      m.position.z += speed * delta
      // Once a segment is fully past the camera, jump it to the far end.
      if (m.position.z > SEGMENT_LENGTH / 2 + 20) {
        m.position.z -= SEGMENT_LENGTH * SEGMENTS.length
      }
    }
  })

  return (
    <group>
      {/* Two leap-frogging ground segments */}
      {SEGMENTS.map((seg, i) => (
        <mesh
          key={i}
          ref={segRefs[i]}
          position={[0, 0, seg.z - SEGMENT_LENGTH / 2 + 20]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[TRACK_WIDTH, seg.len]} />
          <meshStandardMaterial color='#1a1a24' roughness={0.9} metalness={0.05} />
        </mesh>
      ))}

      {/* Glowing lane dividers — left + right edges only (the 3 lanes are
          implied by the obstacles). Tinted slate so they're visible but
          not distracting. */}
      {lanes.map((x, i) => (
        <mesh key={i} position={[x, 0.005, -SEGMENT_LENGTH / 4]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.08, SEGMENT_LENGTH * 1.5]} />
          <meshBasicMaterial color={i === 1 ? '#fbbf24' : '#475569'} transparent opacity={0.45} />
        </mesh>
      ))}

      {/* Side rails — tall thin walls so the playing field reads as
          bounded. Subtle slate colour, no texture needed. */}
      <mesh position={[-TRACK_WIDTH / 2 + 0.5, 0.6, -SEGMENT_LENGTH / 4]}>
        <boxGeometry args={[0.1, 1.2, SEGMENT_LENGTH * 1.5]} />
        <meshStandardMaterial color='#0f172a' />
      </mesh>
      <mesh position={[TRACK_WIDTH / 2 - 0.5, 0.6, -SEGMENT_LENGTH / 4]}>
        <boxGeometry args={[0.1, 1.2, SEGMENT_LENGTH * 1.5]} />
        <meshStandardMaterial color='#0f172a' />
      </mesh>
    </group>
  )
}
