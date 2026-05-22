// useGameLoop — top-level frame tick for the runner.
// Wired inside GameCanvas. Each frame:
//   1. tick(delta) the game state (distance / speed / score recompute)
//   2. mirror current speed into speedRef so Track + Spawner advance
//   3. AABB-collide player vs obstacles → gameOver() on hit (unless hoverboarding)
//   4. proximity-check coins + powerups → addCoin() / activateHoverboard()

import { useFrame } from '@react-three/fiber'
import { useGameState } from './useGameState'

// Cheap centre-distance AABB overlap test. Player + obstacle dims live in
// the player's getHitbox() and the spawner's per-item dims.
function aabbOverlap(player, ob) {
  const px = player.x, py = player.y, pz = player.z
  const pw = player.width / 2, ph = player.height / 2, pd = player.depth / 2
  const ox = ob.position.x, oy = ob.position.y, oz = ob.position.z
  const ow = ob.dim[0] / 2, oh = ob.dim[1] / 2, od = ob.dim[2] / 2
  return (
    Math.abs(px - ox) < pw + ow &&
    Math.abs(py - oy) < ph + oh &&
    Math.abs(pz - oz) < pd + od
  )
}

function pointProximity(player, item, radius = 0.7) {
  const dx = player.x - item.position.x
  const dy = player.y - item.position.y
  const dz = player.z - item.position.z
  return (dx * dx + dy * dy + dz * dz) < radius * radius
}

export default function useGameLoop({ playerRef, spawnerRef, speedRef }) {
  const { status, speed, tick, gameOver, addCoin } = useGameState()

  useFrame((_state, delta) => {
    if (status !== 'playing') return
    // Update store first so dependent refs pick up new speed.
    tick(delta)
    if (speedRef) speedRef.current = speed
    // Sample player hitbox once.
    const player = playerRef?.current?.getHitbox?.()
    if (!player || !spawnerRef?.current) return
    const hover = playerRef.current.isHoverboardActive?.()

    // Collisions.
    const obstacles = spawnerRef.current.getObstacles()
    for (const ob of obstacles) {
      if (!ob.alive) continue
      if (aabbOverlap(player, ob)) {
        if (hover) {
          // Hoverboard — eat the obstacle for visual flair, no game over.
          ob.alive = false
        } else {
          gameOver()
          return
        }
      }
    }

    // Coin pickups.
    const coins = spawnerRef.current.getCoins()
    for (const c of coins) {
      if (!c.alive) continue
      if (pointProximity(player, c, 0.7)) {
        c.alive = false
        addCoin()
      }
    }

    // Powerup pickups.
    const powerups = spawnerRef.current.getPowerups()
    for (const p of powerups) {
      if (!p.alive) continue
      if (pointProximity(player, p, 0.9)) {
        p.alive = false
        playerRef.current.activateHoverboard?.()
      }
    }
  })
}
