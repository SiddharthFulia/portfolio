// Galaga — Namco 1981, vertical shooter. Enemies enter the screen along
// bezier flight paths, take up a slot in a formation grid, and then
// break out one at a time to dive-attack the player also along beziers.
//
// Formation:
//   5 rows × 10 columns near the top. Row 0 = bosses (2 slots), rows 1-4
//   = fighters. Formation gently sways left/right.
//
// Bezier attack paths:
//   Each enemy stores a list of cubic bezier control points. A phase
//   variable 0..1 walks the current segment. When phase hits 1 we advance
//   to the next segment. Cubics give the classic loop-de-loop dive.
//
// Boss tractor beam:
//   When a boss dives directly overhead of the player without firing,
//   it may activate a "tractor beam" cone. If the beam catches the
//   player fighter, the player loses a life but the fighter is
//   *captured* and displayed next to the boss. Shooting the captor
//   frees the fighter and it docks onto the surviving player,
//   producing a dual-fighter (double firepower for a while).
//
// Challenge stages:
//   Every 4th stage is a "challenging stage" — enemies fly formations
//   without firing. Bonus score for every hit; extra bonus for full
//   sweep.
//
// Rendering: 16px chunky pixel sprites, 2-frame wing animation, star
// field parallax background, subtle scanlines.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const CANVAS_W = 480
const CANVAS_H = 640
const FORMATION_COLS = 10
const FORMATION_ROWS = 5

const RULES = [
  { heading: 'Goal', body: 'Shoot down every enemy in the formation before they wipe you out. Each stage refills the grid with a mix of bosses, fighters and drones.' },
  { heading: 'Controls', body: '← → / A D — move the fighter left/right along the bottom of the screen.\nSpace / ↑ / W — fire (one bullet on-screen at a time unless dual-fighter is active).\nP pauses; R restarts.' },
  { heading: 'Formation', body: 'Enemies enter along cubic bezier paths and settle into a 5×10 grid: row 0 is bosses (worth more, take 2 hits), rows 1-4 are fighters. The grid sways left/right hypnotically.' },
  { heading: 'Dive attacks', body: 'From formation, enemies periodically break out and dive at you along a looping bezier trajectory. Diving enemies also drop bullets. Higher stages send more divers at once.' },
  { heading: 'Tractor beam', body: 'A boss diving directly overhead may unfurl a green tractor beam. Getting caught costs a life but leaves your fighter captive above the boss. Shoot the captor boss to free the fighter — it docks with the survivor for a "dual fighter" wide shot.' },
  { heading: 'Challenging stages', body: 'Every 4th stage is a bonus round. Enemies fly the formation paths without firing. Each hit scores double and clearing the entire wave grants a big sweep bonus.' },
  { heading: 'Difficulty', body: 'Easy = slow dives, sparse dual-fighter drops, challenge stage every 3 rounds. Hard = frequent dives, common tractor beams, challenge stage every 8. Custom exposes dive frequency, dual-fighter chance, challenge cadence, and attack complexity.' },
]

const DIFFICULTIES = {
  Easy:   { diveChance: 0.003, dualChance: 0.02, challengeEvery: 3, attackComplex: 0.7 },
  Medium: { diveChance: 0.005, dualChance: 0.008, challengeEvery: 4, attackComplex: 1.0 },
  Hard:   { diveChance: 0.008, dualChance: 0.02, challengeEvery: 8, attackComplex: 1.5 },
}

const CUSTOM_SCHEMA = {
  diveChance:     { label: 'Dive frequency',   min: 0.001, max: 0.015, step: 0.001, default: 0.005 },
  dualChance:     { label: 'Dual-fighter drop', min: 0.001, max: 0.05, step: 0.001, default: 0.008 },
  challengeEvery: { label: 'Challenge every',  min: 2,   max: 10,  step: 1, default: 4 },
  attackComplex:  { label: 'Attack complexity', min: 0.5, max: 2.0, step: 0.1, default: 1.0 },
}
const FORMATION_TOP = 90
const FORMATION_LEFT = 60
const CELL_W = 36
const CELL_H = 32

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// Cubic bezier helper: p0 + 3(1-t)²t·p1 + 3(1-t)t²·p2 + t³·p3
const bezier = (t, p0, p1, p2, p3) => {
  const u = 1 - t
  return {
    x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
    y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
  }
}

// Compute the formation slot's screen position, factoring in sway.
const formationPos = (row, col, swayT) => ({
  x: FORMATION_LEFT + col * CELL_W + Math.sin(swayT + row * 0.4) * 20,
  y: FORMATION_TOP + row * CELL_H,
})

// Build the entry path for a wave. Enemies stream in from the left or
// right, loop, then settle into their formation slot. `slot` is
// { row, col }. Returns [segments] where each segment is 4 bezier points.
const entryPathTo = (slot, side, swayT) => {
  const target = formationPos(slot.row, slot.col, swayT)
  const startX = side === 'left' ? -30 : CANVAS_W + 30
  const startY = 40 + Math.random() * 100
  const midX1 = side === 'left' ? 60 : CANVAS_W - 60
  const midY1 = 100
  const midX2 = side === 'left' ? CANVAS_W * 0.75 : CANVAS_W * 0.25
  const midY2 = 240
  return [
    // Big swoop
    [
      { x: startX, y: startY },
      { x: midX1, y: midY1 },
      { x: midX2, y: midY2 - 60 },
      { x: midX2, y: midY2 },
    ],
    // Loop to formation
    [
      { x: midX2, y: midY2 },
      { x: target.x + (side === 'left' ? 80 : -80), y: 120 },
      { x: target.x + (side === 'left' ? -40 : 40), y: 90 },
      { x: target.x, y: target.y },
    ],
  ]
}

// Attack dive: enemy leaves formation and swoops toward the bottom half,
// looping past the player's approximate x.
const attackPath = (from, playerX) => [
  [
    { x: from.x, y: from.y },
    { x: from.x + (Math.random() - 0.5) * 200, y: from.y + 100 },
    { x: playerX + (Math.random() - 0.5) * 120, y: 340 },
    { x: playerX + (Math.random() - 0.5) * 60,  y: 460 },
  ],
  [
    { x: playerX + (Math.random() - 0.5) * 60,  y: 460 },
    { x: playerX - 180, y: 640 },
    { x: from.x - 40,   y: 520 },
    { x: from.x,        y: from.y }, // returns to slot
  ],
]

const newEnemy = (row, col, side, swayT) => ({
  row, col,
  slot: { row, col },
  x: side === 'left' ? -30 : CANVAS_W + 30,
  y: 40,
  state: 'entering',       // entering | formation | attacking | captured
  path: entryPathTo({ row, col }, side, swayT),
  seg: 0,
  t: 0,
  speed: 0.008 + Math.random() * 0.004,
  boss: row === 0,
  angle: 0,
  captiveOfBoss: null,
  hasCaptive: false,
  cooldown: Math.random() * 2 + 1,
})

export default function Galaga() {
  const canvasRef = useRef(null)
  const rafRef = useRef(0)

  const [status, setStatus] = useState('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem('arcade.galaga.best') || 0))
  const [stage, setStage] = useState(1)
  const [lives, setLives] = useState(3)
  const [soundOn, setSoundOn] = useState(true)
  const [difficulty, setDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState({
    diveChance: CUSTOM_SCHEMA.diveChance.default,
    dualChance: CUSTOM_SCHEMA.dualChance.default,
    challengeEvery: CUSTOM_SCHEMA.challengeEvery.default,
    attackComplex: CUSTOM_SCHEMA.attackComplex.default,
  })
  const cfg = difficulty === 'Custom' ? customValues : DIFFICULTIES[difficulty]
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg }, [cfg])

  const state = useRef(null)
  const keys = useRef({})
  const sfx = useMemo(() => getSfx(), [])

  const reset = useCallback(() => {
    state.current = {
      player: { x: CANVAS_W / 2, y: CANVAS_H - 60, dual: false, dualTimer: 0, alive: true, deathT: 0, captured: false, capturedByBoss: null },
      bullets: [],
      enemyBullets: [],
      enemies: [],
      stars: Array.from({ length: 70 }, () => ({ x: Math.random() * CANVAS_W, y: Math.random() * CANVAS_H, s: Math.random() * 2 + 0.5, layer: Math.floor(Math.random()*3) })),
      score: 0,
      stage: 1,
      lives: 3,
      swayT: 0,
      spawnQueue: [],
      spawnDelay: 0,
      stageIntroT: 90,
      isChallenging: false,
      challengeHits: 0,
      challengeMax: 0,
      shake: 0,
      chromatic: 0,
      popups: [],
      cooldown: 0,
      beam: null,             // { boss: enemyRef, alpha }
    }
    setScore(0); setStage(1); setLives(3); setStatus('ready')
    queueStage(1)
  }, [])

  const queueStage = (stg) => {
    const s = state.current
    s.stage = stg
    s.isChallenging = stg % cfgRef.current.challengeEvery === 0
    s.challengeHits = 0
    s.stageIntroT = 90
    // Fill queue with { row, col, side }
    const q = []
    for (let row = 0; row < FORMATION_ROWS; row++) {
      for (let col = 0; col < FORMATION_COLS; col++) {
        // Row 0 gets fewer bosses
        if (row === 0 && (col < 4 || col >= 6)) continue
        q.push({ row, col, side: col < FORMATION_COLS / 2 ? 'left' : 'right' })
      }
    }
    // Shuffle for variety
    q.sort(() => Math.random() - 0.5)
    s.spawnQueue = q
    s.challengeMax = q.length
  }

  useEffect(() => { reset() }, [reset])

  useEffect(() => {
    const down = (e) => {
      keys.current[e.key] = true
      if (e.key === ' ') fire()
      if (e.key === 'p' || e.key === 'P') setStatus(p => p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p)
      if (['ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault()
      if (status === 'ready') setStatus('playing')
    }
    const up = (e) => { keys.current[e.key] = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const fire = useCallback(() => {
    const s = state.current; if (!s) return
    if (s.cooldown > 0 || !s.player.alive) return
    s.bullets.push({ x: s.player.x, y: s.player.y - 20, vy: -9 })
    if (s.player.dual) s.bullets.push({ x: s.player.x + 20, y: s.player.y - 20, vy: -9 })
    s.cooldown = 8
    if (soundOn) sfx.laser()
    if (status === 'ready') setStatus('playing')
  }, [soundOn, sfx, status])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = CANVAS_W; canvas.height = CANVAS_H

    let last = performance.now()
    let frame = 0

    const loop = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t
      frame++
      if (status === 'playing') step(dt, frame)
      draw(frame)
      rafRef.current = requestAnimationFrame(loop)
    }

    const killPlayer = () => {
      const s = state.current
      if (!s.player.alive) return
      s.player.alive = false
      s.player.deathT = 0
      s.shake = 22
      s.chromatic = 30
      if (soundOn) sfx.death()
    }

    const step = (dt, f) => {
      const s = state.current; if (!s) return
      s.stageIntroT = Math.max(0, s.stageIntroT - 1)
      s.swayT += dt * 0.6

      // Player death animation
      if (!s.player.alive) {
        s.player.deathT += dt
        if (s.player.deathT > 1.2) {
          if (s.lives <= 1) {
            s.lives = 0
            setLives(0)
            setStatus('over')
            const prev = Number(localStorage.getItem('arcade.galaga.best') || 0)
            if (s.score > prev) {
              localStorage.setItem('arcade.galaga.best', String(s.score))
              setBest(s.score)
            }
            return
          }
          s.lives--
          setLives(s.lives)
          s.player.alive = true
          s.player.deathT = 0
          s.player.dual = false
          s.player.captured = false
          s.player.x = CANVAS_W / 2
        }
        return
      }

      s.cooldown = Math.max(0, s.cooldown - 1)

      // Player movement
      const spd = 240
      if (keys.current.ArrowLeft || keys.current.a || keys.current.A) s.player.x -= spd * dt
      if (keys.current.ArrowRight || keys.current.d || keys.current.D) s.player.x += spd * dt
      s.player.x = clamp(s.player.x, 24, CANVAS_W - 24 - (s.player.dual ? 20 : 0))

      // Dual timer
      if (s.player.dual) {
        s.player.dualTimer -= dt
        if (s.player.dualTimer <= 0) s.player.dual = false
      }

      // Stars
      for (const st of s.stars) {
        st.y += (st.layer + 1) * 0.4
        if (st.y > CANVAS_H) { st.y = 0; st.x = Math.random() * CANVAS_W }
      }

      // Spawn enemies from queue
      if (s.spawnQueue.length && s.stageIntroT === 0) {
        s.spawnDelay -= dt
        if (s.spawnDelay <= 0) {
          const spec = s.spawnQueue.shift()
          s.enemies.push(newEnemy(spec.row, spec.col, spec.side, s.swayT))
          s.spawnDelay = 0.35
        }
      }

      // Enemy bullets
      for (const b of s.enemyBullets) b.y += b.vy
      s.enemyBullets = s.enemyBullets.filter(b => b.y < CANVAS_H + 10 && !b.dead)

      // Player bullets
      for (const b of s.bullets) b.y += b.vy
      s.bullets = s.bullets.filter(b => b.y > -10 && !b.dead)

      // Enemy updates
      for (const e of s.enemies) {
        if (e.state === 'entering' || e.state === 'attacking') {
          e.t += e.speed
          const seg = e.path[e.seg]
          if (seg) {
            const p = bezier(Math.min(1, e.t), seg[0], seg[1], seg[2], seg[3])
            const pd = bezier(Math.min(1, e.t + 0.02), seg[0], seg[1], seg[2], seg[3])
            e.x = p.x; e.y = p.y
            e.angle = Math.atan2(pd.y - p.y, pd.x - p.x)
          }
          if (e.t >= 1) {
            e.t = 0
            e.seg++
            if (e.seg >= e.path.length) {
              if (e.state === 'entering') {
                e.state = 'formation'
              } else {
                e.state = 'formation'
              }
            }
          }
          // Bosses may fire tractor beam during attack (once)
          if (e.state === 'attacking' && e.boss && !e.hasCaptive &&
              Math.abs(e.x - s.player.x) < 30 && e.y < s.player.y - 40 && !s.beam) {
            if (Math.random() < cfgRef.current.dualChance) {
              s.beam = { boss: e, alpha: 0 }
            }
          }
        } else if (e.state === 'formation') {
          const fp = formationPos(e.slot.row, e.slot.col, s.swayT)
          e.x = fp.x; e.y = fp.y
          e.angle = Math.PI / 2 // point down
          e.cooldown -= dt
          if (!s.isChallenging && e.cooldown <= 0 && Math.random() < cfgRef.current.diveChance + s.stage * 0.001) {
            // Break out
            e.state = 'attacking'
            e.path = attackPath({ x: e.x, y: e.y }, s.player.x)
            e.seg = 0
            e.t = 0
            e.cooldown = 3 + Math.random() * 3
          }
          // Random shot
          if (!s.isChallenging && Math.random() < 0.0015 + s.stage * 0.0003) {
            s.enemyBullets.push({ x: e.x, y: e.y + 12, vy: 4 + Math.random() * 2 })
          }
        }
        // Off-screen recovery
        if (e.y > CANVAS_H + 30) {
          e.y = -20
          e.x = CANVAS_W / 2 + (Math.random() - 0.5) * 100
          e.t = 0
          e.seg = 1
          e.state = 'entering'
          e.path = entryPathTo(e.slot, e.x < CANVAS_W / 2 ? 'left' : 'right', s.swayT)
        }
      }

      // Beam tractoring the player
      if (s.beam) {
        s.beam.alpha = Math.min(1, s.beam.alpha + dt * 2)
        const boss = s.beam.boss
        if (boss.state !== 'attacking' || Math.hypot(boss.x - s.player.x, boss.y - s.player.y) > 400) {
          s.beam = null
        } else if (Math.abs(boss.x - s.player.x) < 22 && boss.y < s.player.y - 30) {
          // Player captured
          if (!s.player.captured && s.player.alive) {
            s.player.captured = true
            s.player.capturedByBoss = boss
            boss.hasCaptive = true
            s.player.alive = false
            s.player.deathT = 0.6 // shorter penalty
            s.popups.push({ x: s.player.x, y: s.player.y, text: 'CAPTURED!', ttl: 60, color: '#ff425c' })
            s.shake = 15
            if (soundOn) sfx.hit()
            s.beam = null
          }
        }
      }

      // Bullet vs enemy
      for (const b of s.bullets) {
        for (const e of s.enemies) {
          if (Math.abs(e.x - b.x) < 14 && Math.abs(e.y - b.y) < 14) {
            const pts = e.boss ? (e.state === 'attacking' ? 400 : 150) : (e.state === 'attacking' ? 100 : 50)
            s.score += pts
            s.popups.push({ x: e.x, y: e.y, text: `+${pts}`, ttl: 30, color: e.boss ? '#ffb8de' : '#37e0ff' })
            e.dead = true
            b.dead = true
            s.challengeHits++
            if (e.hasCaptive && s.player.captured) {
              // Free the fighter, dual mode!
              s.player.captured = false
              s.player.dual = true
              s.player.dualTimer = 20
              s.player.alive = true
              s.popups.push({ x: s.player.x, y: s.player.y - 30, text: 'DUAL FIGHTER!', ttl: 60, color: '#a3ff9c' })
              if (soundOn) sfx.win()
            }
            if (soundOn) sfx.hit()
            break
          }
        }
      }
      s.enemies = s.enemies.filter(e => !e.dead)
      s.bullets = s.bullets.filter(b => !b.dead)

      // Enemy bullet vs player
      if (s.player.alive) {
        for (const b of s.enemyBullets) {
          if (Math.abs(b.x - s.player.x) < 12 && Math.abs(b.y - s.player.y) < 14) {
            killPlayer()
            b.dead = true
            break
          }
        }
        // Enemy body vs player (kamikaze)
        for (const e of s.enemies) {
          if (e.state === 'attacking' && Math.abs(e.x - s.player.x) < 16 && Math.abs(e.y - s.player.y) < 16) {
            killPlayer()
            e.dead = true
            break
          }
        }
        s.enemies = s.enemies.filter(e => !e.dead)
      }

      // Popups + decay
      for (const p of s.popups) p.ttl--
      s.popups = s.popups.filter(p => p.ttl > 0)
      if (s.shake > 0) s.shake *= 0.9
      if (s.chromatic > 0) s.chromatic *= 0.92

      setScore(s.score)

      // Stage clear
      if (s.spawnQueue.length === 0 && s.enemies.length === 0 && !s.beam) {
        if (s.isChallenging) {
          if (s.challengeHits === s.challengeMax) {
            s.score += 10000
            s.popups.push({ x: CANVAS_W / 2, y: CANVAS_H / 2, text: 'PERFECT +10000', ttl: 90, color: '#a3ff9c' })
          }
        }
        queueStage(s.stage + 1)
        setStage(s.stage)
        if (soundOn) sfx.win()
      }
    }

    const drawSprite = (e, f) => {
      const wing = Math.floor(f / 8) % 2 === 0
      ctx.save()
      ctx.translate(e.x, e.y)
      // rotate a bit if attacking
      if (e.state === 'attacking' || e.state === 'entering') {
        ctx.rotate(e.angle - Math.PI / 2)
      }
      if (e.boss) {
        ctx.fillStyle = '#88ff88'
        ctx.fillRect(-8, -6, 16, 12)
        ctx.fillStyle = '#ffe066'
        ctx.fillRect(-6, -10, 12, 4)
        ctx.fillStyle = '#ff425c'
        ctx.fillRect(-2, 4, 4, 4)
        ctx.fillStyle = '#88ff88'
        ctx.fillRect(-12, wing ? -4 : -2, 4, 6)
        ctx.fillRect(8, wing ? -4 : -2, 4, 6)
      } else {
        ctx.fillStyle = '#ff425c'
        ctx.fillRect(-6, -6, 12, 12)
        ctx.fillStyle = '#fff'
        ctx.fillRect(-4, -4, 8, 3)
        ctx.fillStyle = '#37e0ff'
        ctx.fillRect(wing ? -10 : -8, 0, 6, 4)
        ctx.fillRect(wing ? 4 : 2, 0, 6, 4)
      }
      if (e.hasCaptive) {
        ctx.fillStyle = '#ffe066'
        ctx.fillRect(-4, 12, 8, 6)
      }
      ctx.restore()
    }

    const draw = (f) => {
      const s = state.current; if (!s) return
      ctx.save()
      const reducedEl = document.querySelector('[data-reduced-motion="true"]')
      if (!reducedEl && s.shake > 0.1) {
        ctx.translate((Math.random() - 0.5) * s.shake * 0.4, (Math.random() - 0.5) * s.shake * 0.4)
      }
      // background
      ctx.fillStyle = '#000010'
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      // stars
      for (const st of s.stars) {
        ctx.fillStyle = st.layer === 0 ? '#3652ff' : st.layer === 1 ? '#7d8bff' : '#fff'
        ctx.fillRect(st.x, st.y, st.s, st.s)
      }

      // Beam
      if (s.beam) {
        const boss = s.beam.boss
        ctx.save()
        ctx.globalAlpha = s.beam.alpha * 0.5
        const grd = ctx.createLinearGradient(boss.x, boss.y, boss.x, CANVAS_H)
        grd.addColorStop(0, 'rgba(255,180,255,0.8)')
        grd.addColorStop(1, 'rgba(255,180,255,0)')
        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.moveTo(boss.x, boss.y + 8)
        ctx.lineTo(boss.x - 60, CANVAS_H)
        ctx.lineTo(boss.x + 60, CANVAS_H)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }

      // Enemies
      for (const e of s.enemies) drawSprite(e, f)

      // Bullets
      ctx.fillStyle = '#fff2a8'
      for (const b of s.bullets) ctx.fillRect(b.x - 1, b.y, 2, 8)
      ctx.fillStyle = '#ff6ad5'
      for (const b of s.enemyBullets) ctx.fillRect(b.x - 1, b.y, 2, 6)

      // Player
      if (s.player.alive) {
        drawPlayerAt(ctx, s.player.x, s.player.y)
        if (s.player.dual) drawPlayerAt(ctx, s.player.x + 20, s.player.y)
      } else if (!s.player.captured) {
        // Explosion frames
        const t = s.player.deathT
        const rad = 2 + t * 40
        ctx.strokeStyle = '#ff425c'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(s.player.x, s.player.y, rad, 0, Math.PI*2); ctx.stroke()
        ctx.strokeStyle = '#ffcf5a'
        ctx.beginPath(); ctx.arc(s.player.x, s.player.y, rad * 0.6, 0, Math.PI*2); ctx.stroke()
      }

      // Popups
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'center'
      for (const p of s.popups) {
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.min(1, p.ttl / 60)
        ctx.fillText(p.text, p.x, p.y - (60 - p.ttl) * 0.4)
      }
      ctx.globalAlpha = 1

      // Stage intro
      if (s.stageIntroT > 0) {
        ctx.font = 'bold 24px monospace'
        ctx.fillStyle = s.isChallenging ? '#a3ff9c' : '#ffe066'
        ctx.textAlign = 'center'
        ctx.fillText(s.isChallenging ? 'CHALLENGING STAGE' : `STAGE ${s.stage}`, CANVAS_W/2, CANVAS_H/2)
      }

      ctx.restore()

      if (!reducedEl && s.chromatic > 2) {
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = 0.35
        ctx.drawImage(canvas, s.chromatic * 0.3, 0)
        ctx.restore()
      }

      ctx.save()
      ctx.globalAlpha = 0.08
      ctx.fillStyle = '#000'
      for (let y = 0; y < CANVAS_H; y += 2) ctx.fillRect(0, y, CANVAS_W, 1)
      ctx.restore()
    }

    const drawPlayerAt = (ctx, x, y) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x - 8, y + 4, 16, 4)
      ctx.fillRect(x - 4, y - 4, 8, 8)
      ctx.fillRect(x - 1, y - 10, 2, 6)
      ctx.fillStyle = '#37e0ff'
      ctx.fillRect(x - 10, y + 8, 4, 4)
      ctx.fillRect(x + 6,  y + 8, 4, 4)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [status, soundOn, sfx])

  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const touchHold = (k, v) => { keys.current[k] = v }

  return (
    <GameShell
      title="Galaga"
      category="Retro"
      score={score}
      best={best}
      level={stage}
      status={status}
      extraStats={
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Lives</span>
          <span className="text-xl sm:text-2xl font-bold tabular-nums text-cyan-300">{lives}</span>
        </div>
      }
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn(v => !v)}
      onPause={() => setStatus(p => p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p)}
      onRestart={reset}
      rules={RULES}
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
      controls={[
        { key: '← →',   label: 'Move' },
        { key: 'Space', label: 'Fire' },
        { key: 'P',     label: 'Pause' },
      ]}
    >
      <div className="w-full flex items-center justify-center p-2">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-[70vh]"
          style={{ imageRendering: 'pixelated', touchAction: 'none' }}
        />
      </div>
      <div className="sm:hidden grid grid-cols-3 gap-2 p-3 border-t border-white/10 bg-white/5">
        <button type="button" onTouchStart={() => touchHold('ArrowLeft', true)}  onTouchEnd={() => touchHold('ArrowLeft', false)}  className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">←</button>
        <button type="button" onTouchStart={fire} className="h-12 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-sm font-semibold active:bg-amber-500/30">FIRE</button>
        <button type="button" onTouchStart={() => touchHold('ArrowRight', true)} onTouchEnd={() => touchHold('ArrowRight', false)} className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">→</button>
      </div>
    </GameShell>
  )
}
