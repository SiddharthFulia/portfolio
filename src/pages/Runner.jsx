import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { Modal, Input, Select, message as antMessage } from 'antd'
import { CrownOutlined, ThunderboltOutlined, RedoOutlined, HeartOutlined, PauseOutlined, PlayCircleOutlined, UserOutlined } from '@ant-design/icons'
import {
  listGamePlayers, createGamePlayer, submitGameScore, getGameLeaderboard,
} from '../api/ai'

// ─── Hand-gesture endless runner ─────────────────────────────────────
// 3 lanes (left/center/right), trains + barriers + low overhangs, jump &
// roll. Hand gestures drive the character via MediaPipe:
//   • Hand X position (mirrored, 0..1) → maps to lane
//   • Hand Y above 0.30 (image normalized) → jump
//   • Hand Y below 0.75                   → roll
// Keyboard ← → ↑ ↓ also work for fallback / desktop without a webcam.
//
// Difficulty modulates starting speed + acceleration:
//   easy    — 5 m/s, accel 0.05/s²
//   medium  — 8 m/s, accel 0.10/s²
//   hard    — 12 m/s, accel 0.18/s²
//   classic — 6 m/s, accel 0.04/s² but uncapped (gets impossibly fast)

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const LANE_X = [-2.2, 0, 2.2]   // x positions for the 3 lanes
const LAST_PLAYER_KEY = 'sid-runner-last-player'

const DIFFICULTIES = {
  easy:    { label: 'Easy',    speed:  5, accel: 0.05, maxSpeed: 18, color: 'emerald' },
  medium:  { label: 'Medium',  speed:  8, accel: 0.10, maxSpeed: 24, color: 'amber'  },
  hard:    { label: 'Hard',    speed: 12, accel: 0.18, maxSpeed: 32, color: 'rose'   },
  classic: { label: 'Classic', speed:  6, accel: 0.04, maxSpeed: Infinity, color: 'fuchsia' },
}

// One unit of frontend distance ≈ 1 meter for the purposes of scoring.
// 1 point per meter + 50 per coin.
const COIN_VALUE = 50

export default function Runner() {
  // ── App-level (menu, player, leaderboard) ──
  const [phase, setPhase] = useState('menu')   // 'menu' | 'playing' | 'paused' | 'gameover' | 'leaderboard'
  const [players, setPlayers] = useState([])
  const [playerName, setPlayerName] = useState('')
  const [difficulty, setDifficulty] = useState('medium')
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardFilter, setLeaderboardFilter] = useState('')   // '' = all

  // ── In-game state (kept also in refs because the render loop can't
  // see React state without re-binding the closure every frame) ──
  const [score, setScore] = useState(0)
  const [distance, setDistance] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [revived, setRevived] = useState(false)
  const [reviveAvailable, setReviveAvailable] = useState(true)

  // ── Refs shared by Three.js + hand loop ──
  const containerRef = useRef(null)
  const videoRef = useRef(null)
  const landmarkerRef = useRef(null)
  const streamRef = useRef(null)
  const rafGameRef = useRef(null)
  const rafHandRef = useRef(null)
  // gameRef holds the *entire* mutable game state so the loop closure
  // doesn't get stale React values. setX() calls are throttled HUD updates.
  const gameRef = useRef(null)

  useEffect(() => { document.title = 'Runner · Sid' }, [])

  // Pull existing players + last-used name on mount so the menu feels warm
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await listGamePlayers({ limit: 200 })
      if (cancelled) return
      const items = data?.items || []
      setPlayers(items)
      try {
        const last = localStorage.getItem(LAST_PLAYER_KEY)
        if (last && items.some(p => p.name.toLowerCase() === last.toLowerCase())) {
          setPlayerName(last)
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [])

  // ── Build / dispose the Three.js scene ─────────────────────────
  const initScene = useCallback(() => {
    const container = containerRef.current
    if (!container) return null

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x0a0a14, 25, 80)
    scene.background = new THREE.Color(0x0a0a14)

    const camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 200)
    camera.position.set(0, 4.5, 8)
    camera.lookAt(0, 1.2, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)

    // ── Lights ──
    const sun = new THREE.DirectionalLight(0xfde68a, 1.1)
    sun.position.set(10, 18, 6)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -15; sun.shadow.camera.right = 15
    sun.shadow.camera.top = 15;   sun.shadow.camera.bottom = -15
    scene.add(sun)
    scene.add(new THREE.AmbientLight(0x404060, 0.7))
    scene.add(new THREE.HemisphereLight(0xa78bfa, 0x1f2937, 0.45))

    // ── Track (two scrolling road segments looped) ──
    const trackGeo = new THREE.PlaneGeometry(8, 80)
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x1f1f2e, roughness: 0.9, metalness: 0.1 })
    const trackA = new THREE.Mesh(trackGeo, trackMat); trackA.rotation.x = -Math.PI / 2; trackA.receiveShadow = true; trackA.position.z = 0
    const trackB = trackA.clone(); trackB.position.z = -80
    scene.add(trackA); scene.add(trackB)

    // Lane stripes — painted as thin emissive boxes between lanes
    for (const t of [trackA, trackB]) {
      for (const x of [-1.1, 1.1]) {
        const s = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.02, 78),
          new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xfde68a, emissiveIntensity: 0.4 }),
        )
        s.position.set(x, 0.01, 0)
        t.add(s)
      }
    }

    // Side rails — adds depth + emphasises the lane bounds
    const railGeo = new THREE.BoxGeometry(0.4, 0.8, 160)
    const railMat = new THREE.MeshStandardMaterial({ color: 0x6366f1, emissive: 0x6366f1, emissiveIntensity: 0.4, metalness: 0.4 })
    const railL = new THREE.Mesh(railGeo, railMat); railL.position.set(-4, 0.4, -40)
    const railR = railL.clone();                    railR.position.set( 4, 0.4, -40)
    scene.add(railL); scene.add(railR)

    // ── Character — stylised box-on-box (placeholder; reads as a runner) ──
    const charGroup = new THREE.Group()
    charGroup.position.set(0, 0, 4.5)
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.4, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x0e7490, emissiveIntensity: 0.2, metalness: 0.3, roughness: 0.4 }),
    )
    body.position.y = 1.1; body.castShadow = true
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.55, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.2, roughness: 0.6 }),
    )
    head.position.y = 2.15; head.castShadow = true
    charGroup.add(body); charGroup.add(head)
    scene.add(charGroup)

    return { scene, camera, renderer, trackA, trackB, charGroup, body, head }
  }, [])

  // ── Hand tracking init / shutdown ──
  const startHandLoop = useCallback(async () => {
    try {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
      const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM)
      const lm = await HandLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
      landmarkerRef.current = lm

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30 } },
        audio: false,
      })
      streamRef.current = stream
      const v = videoRef.current
      v.srcObject = stream
      await v.play()

      const tick = () => {
        const g = gameRef.current
        if (!g) return
        const now = performance.now()
        let res
        try { res = lm.detectForVideo(v, now) } catch { res = null }
        const hands = res?.landmarks || []
        if (hands.length > 0) {
          // Index-finger tip is landmark 8 — most reliable single anchor
          const tip = hands[0][8]
          // Mirror X so moving hand right physically moves character right
          const x = 1 - tip.x
          const y = tip.y
          // Lane decision: 3 zones
          if (x < 0.33)      g.targetLane = 0
          else if (x > 0.66) g.targetLane = 2
          else               g.targetLane = 1
          // Jump / roll gestures — only commit if not already in air/rolling
          if (y < 0.28 && g.jumpVel === 0 && !g.rolling) {
            g.jumpVel = 11
          } else if (y > 0.78 && g.jumpVel === 0 && !g.rolling) {
            g.rolling = true
            g.rollTimer = 0.45
          }
        }
        rafHandRef.current = requestAnimationFrame(tick)
      }
      rafHandRef.current = requestAnimationFrame(tick)
    } catch (e) {
      console.warn('[Runner] hand-control unavailable:', e.message)
      antMessage.info('Webcam unavailable — using keyboard (← → ↑ ↓)')
    }
  }, [])

  const stopHandLoop = () => {
    if (rafHandRef.current) { cancelAnimationFrame(rafHandRef.current); rafHandRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null
    landmarkerRef.current?.close?.(); landmarkerRef.current = null
  }

  // ── Game start ──
  const beginRun = async (opts = {}) => {
    const fromRevive = !!opts.revive

    // Save the chosen name so it appears at the top of the picker next time
    try { if (playerName) localStorage.setItem(LAST_PLAYER_KEY, playerName) } catch {}

    const setup = initScene()
    if (!setup) return
    const diff = DIFFICULTIES[difficulty]

    const g = {
      ...setup,
      // Tunables
      diff,
      speed: fromRevive ? gameRef.current.speed : diff.speed,
      distance: fromRevive ? gameRef.current.distance : 0,
      score: fromRevive ? gameRef.current.score : 0,
      // Character
      lane: fromRevive ? gameRef.current.lane : 1,
      targetLane: 1,
      jumpVel: 0,
      jumpY: 0,
      rolling: false,
      rollTimer: 0,
      // Obstacles
      obstacles: [],
      coins: [],
      nextSpawnAt: 0,
      // Misc
      alive: true,
      lastTs: performance.now(),
    }
    gameRef.current = g
    setScore(g.score); setDistance(g.distance); setSpeed(diff.speed)
    if (!fromRevive) { setRevived(false); setReviveAvailable(true) }

    setPhase('playing')
    startHandLoop()
    requestAnimationFrame(gameLoop)
  }

  // ── Main game loop ──
  const gameLoop = (ts) => {
    const g = gameRef.current
    if (!g || !g.alive) return
    const dt = Math.min(0.05, (ts - g.lastTs) / 1000)
    g.lastTs = ts

    // ── Speed + score accumulation ──
    if (g.diff.maxSpeed === Infinity) {
      g.speed += g.diff.accel * dt   // classic — uncapped
    } else {
      g.speed = Math.min(g.diff.maxSpeed, g.speed + g.diff.accel * dt)
    }
    const moved = g.speed * dt
    g.distance += moved
    g.score = Math.floor(g.distance) + g.collectedCoins * COIN_VALUE | 0
    if (!g.collectedCoins) g.collectedCoins = 0

    // ── Character lane lerp ──
    const targetX = LANE_X[g.targetLane]
    g.charGroup.position.x += (targetX - g.charGroup.position.x) * Math.min(1, dt * 12)

    // ── Jump physics ──
    if (g.jumpVel !== 0 || g.jumpY > 0) {
      g.jumpVel -= 28 * dt   // gravity
      g.jumpY += g.jumpVel * dt
      if (g.jumpY < 0) { g.jumpY = 0; g.jumpVel = 0 }
    }
    g.charGroup.position.y = g.jumpY

    // ── Roll timer + visual squash ──
    if (g.rolling) {
      g.rollTimer -= dt
      g.body.scale.set(1, 0.45, 1)
      g.body.position.y = 0.5
      g.head.position.y = 1.2
      if (g.rollTimer <= 0) {
        g.rolling = false
        g.body.scale.set(1, 1, 1); g.body.position.y = 1.1; g.head.position.y = 2.15
      }
    }

    // ── Scroll track + reset segments ──
    for (const t of [g.trackA, g.trackB]) {
      t.position.z += moved
      if (t.position.z > 40) t.position.z -= 160
    }

    // ── Spawn obstacles + coins ──
    g.nextSpawnAt -= moved
    if (g.nextSpawnAt <= 0) {
      g.nextSpawnAt = 9 + Math.random() * 6 - Math.min(4, g.speed * 0.15)
      spawnObstacleRow(g)
    }

    // ── Move + cull obstacles ──
    const charBox = new THREE.Box3()
    g.body.updateMatrixWorld(); g.head.updateMatrixWorld()
    charBox.setFromObject(g.charGroup)
    // Tighten hitbox a touch so close-but-not-touching doesn't kill
    charBox.expandByScalar(-0.05)

    for (let i = g.obstacles.length - 1; i >= 0; i--) {
      const o = g.obstacles[i]
      o.mesh.position.z += moved
      if (o.mesh.position.z > 8) {
        g.scene.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose()
        g.obstacles.splice(i, 1)
        continue
      }
      // Collision — only if same lane band and within range
      const ob = new THREE.Box3().setFromObject(o.mesh)
      if (charBox.intersectsBox(ob)) {
        // Allow jump over BARRIER (low), roll under OVERHANG (high)
        if (o.kind === 'barrier' && g.jumpY > 0.8) continue
        if (o.kind === 'overhang' && g.rolling)   continue
        return gameOver()
      }
    }

    // ── Coin collection ──
    for (let i = g.coins.length - 1; i >= 0; i--) {
      const c = g.coins[i]
      c.mesh.position.z += moved
      c.mesh.rotation.y += dt * 4
      if (c.mesh.position.z > 8) {
        g.scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose()
        g.coins.splice(i, 1)
        continue
      }
      const cb = new THREE.Box3().setFromObject(c.mesh)
      if (charBox.intersectsBox(cb)) {
        g.scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose()
        g.coins.splice(i, 1)
        g.collectedCoins += 1
      }
    }

    // ── Render ──
    g.renderer.render(g.scene, g.camera)

    // ── HUD updates (throttled — React state) ──
    if (!g.hudTimer || g.lastTs - g.hudTimer > 100) {
      g.hudTimer = g.lastTs
      setScore(g.score)
      setDistance(Math.floor(g.distance))
      setSpeed(g.speed)
    }

    rafGameRef.current = requestAnimationFrame(gameLoop)
  }

  // ── Spawning helpers ──
  const spawnObstacleRow = (g) => {
    // Pick how many of the 3 lanes to block (1 or 2; never all)
    const lanes = [0, 1, 2]
    const blockCount = Math.random() < 0.4 ? 2 : 1
    const blocked = []
    while (blocked.length < blockCount) {
      const k = lanes.splice(Math.floor(Math.random() * lanes.length), 1)[0]
      blocked.push(k)
    }
    for (const lane of blocked) {
      const r = Math.random()
      let mesh, kind
      if (r < 0.45) {
        // Train — full lane, must change lane
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.7, 2.4, 6),
          new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x7f1d1d, emissiveIntensity: 0.2 }),
        )
        mesh.position.set(LANE_X[lane], 1.2, -60)
        kind = 'train'
      } else if (r < 0.75) {
        // Low barrier — must jump
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 0.8, 0.6),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.3 }),
        )
        mesh.position.set(LANE_X[lane], 0.4, -60)
        kind = 'barrier'
      } else {
        // Overhang — must roll under
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 0.5, 0.6),
          new THREE.MeshStandardMaterial({ color: 0xa78bfa, emissive: 0x6d28d9, emissiveIntensity: 0.35 }),
        )
        mesh.position.set(LANE_X[lane], 1.8, -60)
        kind = 'overhang'
      }
      mesh.castShadow = true
      g.scene.add(mesh)
      g.obstacles.push({ mesh, kind, lane })
    }
    // Drop a coin row in the free lane (if any)
    const freeLane = [0, 1, 2].find(l => !blocked.includes(l))
    if (freeLane != null) {
      for (let k = 0; k < 3; k++) {
        const coin = new THREE.Mesh(
          new THREE.TorusGeometry(0.25, 0.08, 12, 24),
          new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xfacc15, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.2 }),
        )
        coin.rotation.x = Math.PI / 2
        coin.position.set(LANE_X[freeLane], 1.0, -60 - k * 2.2)
        g.scene.add(coin)
        g.coins.push({ mesh: coin })
      }
    }
  }

  // ── Game over ──
  const gameOver = async () => {
    const g = gameRef.current
    if (!g) return
    g.alive = false
    if (rafGameRef.current) { cancelAnimationFrame(rafGameRef.current); rafGameRef.current = null }
    stopHandLoop()
    setPhase('gameover')

    if (playerName) {
      const { error } = await submitGameScore({
        playerName,
        score: g.score,
        distance: Math.floor(g.distance),
        difficulty,
        revived,
      })
      if (error) console.warn('[Runner] submit score failed:', error)
    }
  }

  // ── Revive (one-shot) ──
  const revive = () => {
    if (!reviveAvailable) return
    setReviveAvailable(false); setRevived(true)
    // Clear obstacles + coins in the danger zone so we don't insta-die again
    const g = gameRef.current
    if (g) {
      for (const o of g.obstacles) {
        g.scene.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose()
      }
      g.obstacles.length = 0
      for (const c of g.coins) {
        g.scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose()
      }
      g.coins.length = 0
      g.alive = true
      g.lastTs = performance.now()
    }
    setPhase('playing')
    startHandLoop()
    requestAnimationFrame(gameLoop)
  }

  const quit = () => {
    const g = gameRef.current
    if (g) {
      g.alive = false
      g.renderer.dispose()
      if (g.renderer.domElement.parentNode) g.renderer.domElement.parentNode.removeChild(g.renderer.domElement)
    }
    if (rafGameRef.current) cancelAnimationFrame(rafGameRef.current)
    stopHandLoop()
    setPhase('menu')
  }

  // ── Keyboard fallback ──
  useEffect(() => {
    const onKey = (e) => {
      if (phase !== 'playing') return
      const g = gameRef.current
      if (!g) return
      if (e.key === 'ArrowLeft')  g.targetLane = Math.max(0, g.targetLane - 1)
      if (e.key === 'ArrowRight') g.targetLane = Math.min(2, g.targetLane + 1)
      if (e.key === 'ArrowUp' && g.jumpVel === 0 && !g.rolling && g.jumpY === 0) g.jumpVel = 11
      if (e.key === 'ArrowDown' && !g.rolling && g.jumpY === 0) { g.rolling = true; g.rollTimer = 0.45 }
      if (e.key === 'Escape') setPhase('paused')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  // ── Resize ──
  useEffect(() => {
    const onResize = () => {
      const g = gameRef.current
      if (!g || !containerRef.current) return
      g.camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      g.camera.updateProjectionMatrix()
      g.renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Load leaderboard on open ──
  const openLeaderboard = async () => {
    setPhase('leaderboard')
    const { data } = await getGameLeaderboard({
      difficulty: leaderboardFilter || undefined,
      limit: 50,
    })
    setLeaderboard(data?.items || [])
  }
  useEffect(() => {
    if (phase !== 'leaderboard') return
    ;(async () => {
      const { data } = await getGameLeaderboard({
        difficulty: leaderboardFilter || undefined,
        limit: 50,
      })
      setLeaderboard(data?.items || [])
    })()
  }, [leaderboardFilter, phase])

  // ── UI ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-gray-100 relative overflow-hidden">
      {/* Three.js canvas */}
      <div ref={containerRef} className="absolute inset-0" />
      {/* Hidden video feed used by MediaPipe */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* HUD */}
      {phase === 'playing' && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-4 left-4 luxe-card px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-cyan-300/80 mb-0.5">Score</p>
            <p className="text-3xl font-bold text-white font-mono">{score.toLocaleString()}</p>
          </div>
          <div className="absolute top-4 right-4 luxe-card px-3 py-2 space-y-1 text-right">
            <p className="text-[10px] text-gray-400">{Math.floor(distance)} m · {speed.toFixed(1)} m/s</p>
            <p className="text-[10px] uppercase tracking-wider text-fuchsia-300">{DIFFICULTIES[difficulty].label}</p>
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 luxe-card px-4 py-2 flex items-center gap-3 text-[11px] text-gray-300">
            <span>← → swipe to switch lanes</span><span className="text-gray-700">·</span>
            <span>↑ raise hand to jump</span><span className="text-gray-700">·</span>
            <span>↓ lower hand to roll</span>
          </div>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-auto">
            <button onClick={() => setPhase('paused')}
              className="luxe-btn luxe-btn-secondary text-xs">
              <PauseOutlined /> Pause
            </button>
          </div>
        </div>
      )}

      {/* Menu */}
      {phase === 'menu' && (
        <MenuPanel
          players={players}
          playerName={playerName} setPlayerName={setPlayerName}
          difficulty={difficulty} setDifficulty={setDifficulty}
          onStart={beginRun}
          onLeaderboard={openLeaderboard}
          onPlayerCreated={(p) => { setPlayers(prev => prev.find(x => x.id === p.id) ? prev : [p, ...prev]); setPlayerName(p.name) }}
        />
      )}

      {/* Paused */}
      {phase === 'paused' && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center">
          <div className="luxe-card p-6 text-center space-y-3 min-w-[280px]">
            <h2 className="text-2xl font-bold">Paused</h2>
            <button onClick={() => { setPhase('playing'); gameRef.current.lastTs = performance.now(); requestAnimationFrame(gameLoop); startHandLoop() }}
              className="luxe-btn luxe-btn-primary w-full">
              <PlayCircleOutlined /> Resume
            </button>
            <button onClick={quit} className="luxe-btn luxe-btn-secondary w-full">
              Quit run
            </button>
          </div>
        </div>
      )}

      {/* Game over */}
      {phase === 'gameover' && (
        <GameOverPanel
          score={score} distance={Math.floor(distance)}
          difficulty={DIFFICULTIES[difficulty].label}
          revived={revived} reviveAvailable={reviveAvailable}
          onRevive={revive}
          onRestart={() => { quit(); setTimeout(() => beginRun(), 50) }}
          onLeaderboard={openLeaderboard}
          onMenu={quit}
        />
      )}

      {/* Leaderboard */}
      {phase === 'leaderboard' && (
        <LeaderboardPanel
          items={leaderboard}
          filter={leaderboardFilter} setFilter={setLeaderboardFilter}
          onClose={() => setPhase('menu')}
        />
      )}
    </div>
  )
}

// ─── Menu panel ──────────────────────────────────────────────────
function MenuPanel({ players, playerName, setPlayerName, difficulty, setDifficulty, onStart, onLeaderboard, onPlayerCreated }) {
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const createNew = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    const { data, error: err } = await createGamePlayer(name)
    setCreating(false)
    if (err) { antMessage.error(err); return }
    onPlayerCreated(data.player)
    setNewName('')
  }

  return (
    <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="luxe-card p-6 sm:p-8 max-w-md w-full space-y-5">
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
            Hand Runner
          </h1>
          <p className="text-xs text-gray-400 mt-1">Subway-Surfers-style, controlled by your hand.</p>
        </div>

        {/* Player picker */}
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5 block">
            <UserOutlined /> Player
          </label>
          {players.length > 0 ? (
            <Select className="w-full" value={playerName || undefined}
              placeholder="Pick a returning player"
              onChange={setPlayerName} allowClear
              options={players.map(p => ({ value: p.name, label: p.name }))} />
          ) : null}
          <div className="flex items-center gap-1.5 mt-2">
            <Input value={newName} onChange={e => setNewName(e.target.value)}
              onPressEnter={createNew}
              placeholder="…or type a new name" maxLength={32} />
            <button onClick={createNew} disabled={creating || !newName.trim()}
              className="luxe-btn luxe-btn-secondary text-xs whitespace-nowrap">
              {creating ? '…' : '+ Add'}
            </button>
          </div>
        </div>

        {/* Difficulty picker */}
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5 block">Difficulty</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(DIFFICULTIES).map(([id, d]) => (
              <button key={id} onClick={() => setDifficulty(id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  difficulty === id
                    ? `border-${d.color}-400/60 bg-${d.color}-500/10 ring-1 ring-${d.color}-400/40`
                    : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                }`}>
                <div className={`text-sm font-bold ${difficulty === id ? `text-${d.color}-300` : 'text-white'}`}>{d.label}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {d.speed} m/s start{d.maxSpeed === Infinity ? ' · uncapped' : ` · cap ${d.maxSpeed}`}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <button onClick={onStart} disabled={!playerName}
            className={`luxe-btn luxe-btn-primary w-full ${!playerName ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <ThunderboltOutlined /> {playerName ? `Run as ${playerName}` : 'Pick a player first'}
          </button>
          <button onClick={onLeaderboard} className="luxe-btn luxe-btn-secondary w-full">
            <CrownOutlined /> Leaderboard
          </button>
        </div>

        <p className="text-[10px] text-gray-500 text-center">
          Allow camera for hand control · ←→↑↓ also works
        </p>
      </div>
    </div>
  )
}

// ─── Game-over panel ─────────────────────────────────────────────
function GameOverPanel({ score, distance, difficulty, revived, reviveAvailable, onRevive, onRestart, onLeaderboard, onMenu }) {
  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="luxe-card p-6 sm:p-8 max-w-md w-full text-center space-y-4">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-rose-300 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
          Run ended
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Score', value: score.toLocaleString() },
            { label: 'Distance', value: `${distance} m` },
            { label: 'Mode', value: difficulty },
          ].map(s => (
            <div key={s.label} className="rounded-lg bg-gray-900/60 border border-gray-800 p-3">
              <p className="text-[9px] uppercase tracking-wider text-gray-500">{s.label}</p>
              <p className="text-base font-bold font-mono mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
        {revived && (
          <p className="text-[11px] text-amber-300 font-semibold">
            <HeartOutlined /> Score includes a revive
          </p>
        )}
        <div className="space-y-2">
          {reviveAvailable && (
            <button onClick={onRevive}
              className="luxe-btn luxe-btn-primary w-full bg-gradient-to-r from-rose-500 via-fuchsia-500 to-amber-500">
              <HeartOutlined /> Revive (1 free per run)
            </button>
          )}
          <button onClick={onRestart} className="luxe-btn luxe-btn-secondary w-full">
            <RedoOutlined /> New run
          </button>
          <button onClick={onLeaderboard} className="luxe-btn luxe-btn-ghost w-full">
            <CrownOutlined /> See leaderboard
          </button>
          <button onClick={onMenu} className="luxe-btn luxe-btn-ghost w-full text-gray-500">
            Back to menu
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Leaderboard panel ────────────────────────────────────────────
function LeaderboardPanel({ items, filter, setFilter, onClose }) {
  const fmtDate = (s) => {
    if (!s) return ''
    const d = new Date(s)
    return `${d.toLocaleDateString()} ${d.toTimeString().slice(0, 5)}`
  }
  return (
    <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="luxe-card p-6 max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-300 to-fuchsia-300 bg-clip-text text-transparent">
            <CrownOutlined /> Leaderboard
          </h2>
          <button onClick={onClose} className="luxe-btn luxe-btn-secondary text-xs">Close</button>
        </div>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {[
            { id: '',        label: 'All' },
            { id: 'easy',    label: 'Easy' },
            { id: 'medium',  label: 'Medium' },
            { id: 'hard',    label: 'Hard' },
            { id: 'classic', label: 'Classic' },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                filter === f.id
                  ? 'border-amber-400/60 bg-amber-500/10 text-amber-300'
                  : 'border-gray-800 bg-gray-900/40 text-gray-400 hover:text-gray-200'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto rounded-lg border border-gray-800/60">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-950/95 backdrop-blur text-[10px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="text-left py-2 px-3">#</th>
                <th className="text-left py-2 px-3">Player</th>
                <th className="text-right py-2 px-3">Score</th>
                <th className="text-right py-2 px-3 hidden sm:table-cell">Distance</th>
                <th className="text-left py-2 px-3 hidden sm:table-cell">Mode</th>
                <th className="text-right py-2 px-3 hidden md:table-cell">When</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500 text-xs">No scores yet — be the first.</td></tr>
              ) : items.map((r, i) => (
                <tr key={r.id} className="border-t border-gray-800/60 hover:bg-white/[0.02]">
                  <td className="py-2 px-3 font-mono text-gray-500">{i + 1}</td>
                  <td className="py-2 px-3 font-semibold text-white">{r.playerName}{r.revived ? ' ♥' : ''}</td>
                  <td className="py-2 px-3 text-right font-mono text-amber-300">{r.score.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-gray-400 hidden sm:table-cell">{r.distance} m</td>
                  <td className="py-2 px-3 text-gray-400 hidden sm:table-cell">{r.difficulty}</td>
                  <td className="py-2 px-3 text-right text-[10px] text-gray-500 hidden md:table-cell font-mono">{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
