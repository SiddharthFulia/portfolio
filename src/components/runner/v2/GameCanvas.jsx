// GameCanvas — the Three.js root for the runner v2.
// Mounts Track + Player + Spawner inside a <Canvas>, wires useGameLoop,
// and handles the responsive camera/lane-width adjustment so the playing
// field never gets cut off on phones.

import { forwardRef, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Track from './Track'
import Player from './Player'
import Spawner from './Spawner'
import useGameLoop from './hooks/useGameLoop'

// Read once + on resize. < 0.8 = portrait phones, lane spacing tightens,
// camera pulls back and FOV widens-then-narrows so the player and the
// outer lanes stay on screen.
function useIsPortrait() {
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== 'undefined' && window.innerWidth / window.innerHeight < 0.8
  )
  useEffect(() => {
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setIsPortrait(window.innerWidth / window.innerHeight < 0.8)
      })
    }
    window.addEventListener('resize',     update)
    window.addEventListener('orientationchange', update)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize',     update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])
  return isPortrait
}

const GameCanvas = forwardRef(function GameCanvas({ playerRef: externalPlayerRef }, ref) {
  const isPortrait = useIsPortrait()
  const internalPlayerRef = useRef(null)
  const playerRef = externalPlayerRef || internalPlayerRef
  const spawnerRef = useRef(null)
  const speedRef = useRef(0)

  // Portrait: camera further back + up, slightly wider FOV than before
  // so distant trains stay in frame. Desktop: closer + standard FOV.
  const cameraProps = isPortrait
    ? { position: [0, 6, 10], fov: 62, near: 0.1, far: 260 }
    : { position: [0, 4, 7],  fov: 65, near: 0.1, far: 220 }

  // Fog is the atmosphere cue but it can't be denser than the spawn
  // horizon, otherwise obstacles never enter visibility before they're
  // basically on top of the player. Spawn at z=-80, so fog has to extend
  // well past that on the camera's local axis (90+ units from player).
  const fogArgs = isPortrait
    ? ['#0a0a0e', 50, 170]
    : ['#0a0a0e', 40, 150]

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={cameraProps}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
    >
      <color attach='background' args={['#0a0a0e']} />
      <fog attach='fog' args={fogArgs} />

      <ambientLight intensity={0.55} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      <Track speedRef={speedRef} isPortrait={isPortrait} />
      <Player ref={playerRef} isPortrait={isPortrait} />
      <Spawner ref={spawnerRef} speedRef={speedRef} isPortrait={isPortrait} />

      {/* useFrame must live inside <Canvas>; a null-returning helper
          component is the cheapest way to host the game-loop hook. */}
      <LoopHost playerRef={playerRef} spawnerRef={spawnerRef} speedRef={speedRef} />
    </Canvas>
  )
})

function LoopHost({ playerRef, spawnerRef, speedRef }) {
  useGameLoop({ playerRef, spawnerRef, speedRef })
  return null
}

export default GameCanvas
