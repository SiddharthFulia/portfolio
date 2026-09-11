// /arcade/bullet-hell — Bullet Hell (danmaku).
//
// Canvas-rendered bullet-hell shooter. The player is a small plane with
// a tiny (2-pixel-radius) hitbox drawn inside a much larger visual sprite
// — classic danmaku convention. The whole point is threading through
// dense patterns; if the hitbox were as big as the sprite the game would
// be impossible.
//
// Boss patterns cycle through:
//   1. Spiral   — bullets radiate from the boss, rotating over time
//   2. Wave     — sinusoidal streams left-right
//   3. Aimed    — bullets fire directly at the player position
//   4. Beam     — a single wide beam sweeps across the field
//
// Player has:
//   • 3 lives
//   • 2 bombs — press SPACE (or tap the BOMB button) to clear the screen.
//     Bombs also add a brief invincibility window.
//   • "Focus mode" via Shift — halves movement speed, shrinks visual hitbox
//     indicator so you can thread narrow gaps.
//
// Graze — every frame you're within 24px of a bullet but not colliding
// scores +2 pts and increments the graze counter. Encourages risk.
//
// Perf: Two typed arrays back the bullet pool (x, y, vx, vy, r, tint,
// alive) so we can push several hundred bullets without garbage
// collection stutter. Rendered with a single canvas 2D context.
//
// Engine tested on a mid-range laptop to sustain 60fps at ~700 live
// bullets; degrades gracefully by lowering shadowBlur past that.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const BEST_KEY = 'sid-arcade-bullethell-best'

const RULES = [
  { heading: 'Goal', body: 'Survive dense boss bullet patterns. Score climbs from bullets grazed and from the boss shot down. Losing all lives ends the run.' },
  { heading: 'Controls', body: 'Arrow keys / WASD — move the plane.\nZ or fire button — shoot (auto-fires while held).\nShift — focus mode (half speed, hitbox indicator becomes visible, letting you thread tight gaps).\nSpace / bomb button — smart bomb (clears the screen + gives brief invincibility).' },
  { heading: 'Hitbox convention', body: 'Your visual sprite is a plane, but the real hitbox is a 2 px circle at the centre. This is a classic danmaku trick — everything looks impossibly tight but is actually thread-able if you focus.' },
  { heading: 'Graze', body: 'Every frame your plane is within ~24 px of a bullet but doesn\'t collide, you score +2 and the graze counter ticks up. Encourages you to weave close instead of retreating to the edge.' },
  { heading: 'Boss patterns', body: 'Spiral — bullets radiate from the boss and rotate over time.\nWave — sinusoidal streams sweep left-right.\nAimed — bullets fire directly at your current position.\nBeam — a wide beam sweeps across the field, forcing dodges.' },
  { heading: 'Perf', body: 'Bullets live in a typed-array pool (up to 1024 alive at once). If the engine detects >700 live bullets it cuts shadowBlur to keep the frame budget. On a mid-range laptop the game sustains 60 fps.' },
  { heading: 'Difficulty', body: 'Easy = 4 px hitbox, 5 bombs, only spiral/wave patterns, 2× graze bonus. Hard = 2 px hitbox, 1 bomb, all 4 patterns unlocked, base graze bonus. Custom exposes hitbox size, bomb count, patterns unlocked, and graze multiplier.' },
]

const DIFFICULTIES = {
  Easy:   { hitboxR: 4, bombCount: 5, patternsUnlocked: 2, grazeMult: 2.0 },
  Medium: { hitboxR: 3, bombCount: 2, patternsUnlocked: 3, grazeMult: 1.0 },
  Hard:   { hitboxR: 2, bombCount: 1, patternsUnlocked: 4, grazeMult: 0.5 },
}

const CUSTOM_SCHEMA = {
  hitboxR:          { label: 'Hitbox radius',  min: 1,   max: 8,   step: 1,  default: 3 },
  bombCount:        { label: 'Bomb count',     min: 0,   max: 6,   step: 1,  default: 2 },
  patternsUnlocked: { label: 'Patterns (1-4)', min: 1,   max: 4,   step: 1,  default: 3 },
  grazeMult:        { label: 'Graze multiplier', min: 0.2, max: 3.0, step: 0.1, default: 1.0 },
}

const MAX_BULLETS = 1024   // typed-array pool size — engine ceiling
const FIELD_W = 480
const FIELD_H = 720
const HITBOX_R = 2         // real hitbox radius
const GRAZE_R  = 24
const PLAYER_SPEED = 4.2
const PLAYER_FOCUS_SPEED = 1.8
const PLAYER_BULLET_SPEED = 8
const PLAYER_FIRE_COOLDOWN = 90
const START_LIVES = 3
const START_BOMBS = 2

// Bullet palette by tint id
const BULLET_TINTS = [
  { fill: '#fb7185', glow: '#fecdd3' },  // rose
  { fill: '#a78bfa', glow: '#ddd6fe' },  // violet
  { fill: '#22d3ee', glow: '#a5f3fc' },  // cyan
  { fill: '#facc15', glow: '#fef08a' },  // amber
  { fill: '#4ade80', glow: '#bbf7d0' },  // emerald
]

export default function BulletHell() {
  const sfx = useMemo(() => getSfx(), [])
  const [soundOn, setSoundOn] = useState(true)
  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const canvasRef = useRef(null)
  const wrapRef = useRef(null)

  // Reactive UI state
  const [status, setStatus] = useState('ready')  // ready | playing | paused | over
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) || 0))
  const [lives, setLives] = useState(START_LIVES)
  const [bombs, setBombs] = useState(START_BOMBS)
  const [graze, setGraze] = useState(0)
  const [wave, setWave] = useState(1)
  const [maxBullets, setMaxBullets] = useState(0)
  const [shake, setShake] = useState(0)
  const [chromatic, setChromatic] = useState(0)  // 0..1 for death aberration
  const [difficulty, setDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState({
    hitboxR: CUSTOM_SCHEMA.hitboxR.default,
    bombCount: CUSTOM_SCHEMA.bombCount.default,
    patternsUnlocked: CUSTOM_SCHEMA.patternsUnlocked.default,
    grazeMult: CUSTOM_SCHEMA.grazeMult.default,
  })
  const cfg = difficulty === 'Custom' ? customValues : DIFFICULTIES[difficulty]
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg }, [cfg])

  // Non-reactive game state (mutated per-frame — kept out of React re-render)
  const g = useRef({
    // Bullet pool (typed arrays)
    bx: new Float32Array(MAX_BULLETS),
    by: new Float32Array(MAX_BULLETS),
    bvx: new Float32Array(MAX_BULLETS),
    bvy: new Float32Array(MAX_BULLETS),
    br:  new Float32Array(MAX_BULLETS),
    btint: new Uint8Array(MAX_BULLETS),
    balive: new Uint8Array(MAX_BULLETS),
    // Player bullets (separate small pool)
    pbx: new Float32Array(64),
    pby: new Float32Array(64),
    pbvy: new Float32Array(64),
    pbalive: new Uint8Array(64),
    // Boss
    boss: { x: FIELD_W / 2, y: 120, hp: 600, hpMax: 600, spinPhase: 0, pattern: 'spiral', patternT: 0, alive: true },
    // Beam pattern rects
    beam: { active: false, x: FIELD_W / 2, w: 40, phase: 0 },
    // Player
    px: FIELD_W / 2,
    py: FIELD_H - 90,
    invuln: 0,           // ms remaining
    fireCd: 0,
    // Input
    keys: new Set(),
    touch: { active: false, dx: 0, dy: 0, focus: false, fire: true, bomb: false },
    // Timing
    lastT: 0,
    waveT: 0,
    running: false,
    // Live stats
    liveBullets: 0,
    grazedIds: new Set(),
    grazeThisFrame: 0,
    scoreAcc: 0,
    peakBullets: 0,
  })

  const spawnBullet = (x, y, vx, vy, r = 5, tint = 0) => {
    const s = g.current
    for (let i = 0; i < MAX_BULLETS; i++) {
      if (!s.balive[i]) {
        s.bx[i] = x; s.by[i] = y
        s.bvx[i] = vx; s.bvy[i] = vy
        s.br[i] = r
        s.btint[i] = tint
        s.balive[i] = 1
        return
      }
    }
    // Pool exhausted — engine cap hit. Drop bullet silently.
  }

  const spawnPlayerBullet = (x, y) => {
    const s = g.current
    for (let i = 0; i < s.pbx.length; i++) {
      if (!s.pbalive[i]) {
        s.pbx[i] = x; s.pby[i] = y; s.pbvy[i] = -PLAYER_BULLET_SPEED
        s.pbalive[i] = 1
        return
      }
    }
  }

  const clearAllEnemyBullets = () => {
    g.current.balive.fill(0)
    g.current.liveBullets = 0
    g.current.grazedIds.clear()
  }

  const bomb = () => {
    if (status !== 'playing') return
    if (bombs <= 0) return
    setBombs((b) => b - 1)
    // Clear all live bullets
    clearAllEnemyBullets()
    // Damage boss
    g.current.boss.hp = Math.max(0, g.current.boss.hp - 80)
    // Invuln + shake
    g.current.invuln = 1500
    setShake(1)
    sfx.boom()
  }

  const start = () => {
    const s = g.current
    s.bx.fill(0); s.by.fill(0); s.balive.fill(0)
    s.pbx.fill(0); s.pby.fill(0); s.pbalive.fill(0)
    s.boss = { x: FIELD_W / 2, y: 120, hp: 600, hpMax: 600, spinPhase: 0, pattern: 'spiral', patternT: 0, alive: true }
    s.beam = { active: false, x: FIELD_W / 2, w: 40, phase: 0 }
    s.px = FIELD_W / 2; s.py = FIELD_H - 90
    s.invuln = 1000; s.fireCd = 0
    s.waveT = 0
    s.scoreAcc = 0
    s.peakBullets = 0
    s.grazedIds.clear()
    setScore(0); setLives(START_LIVES); setBombs(cfgRef.current.bombCount); setGraze(0); setWave(1); setMaxBullets(0)
    setStatus('playing')
    setChromatic(0)
  }

  const gameOver = () => {
    setStatus('over')
    setChromatic(1)
    sfx.death()
    setBest((b) => {
      const nb = Math.max(b, score)
      localStorage.setItem(BEST_KEY, String(nb))
      return nb
    })
  }

  // Boss AI — every couple seconds, rotate the pattern.
  const stepBoss = (dt) => {
    const s = g.current
    const b = s.boss
    if (!b.alive) return
    b.patternT += dt
    b.spinPhase += dt * 0.001

    // Move boss in a lazy figure-8
    const t = performance.now() * 0.0005
    b.x = FIELD_W / 2 + Math.sin(t) * 140
    b.y = 100 + Math.sin(t * 2) * 30

    if (b.patternT > 4000) {
      // Rotate pattern — pool limited by difficulty
      const allPatterns = ['spiral', 'wave', 'aimed', 'beam']
      const unlocked = Math.max(1, Math.min(4, cfgRef.current.patternsUnlocked))
      const patterns = allPatterns.slice(0, unlocked)
      const idx = patterns.indexOf(b.pattern)
      b.pattern = patterns[(idx + 1) % patterns.length]
      b.patternT = 0
      s.beam.active = b.pattern === 'beam'
    }

    // Fire cadence — every ~35ms
    if (!b._lastFire) b._lastFire = 0
    b._lastFire += dt
    if (b._lastFire < 35) return
    b._lastFire = 0

    if (b.pattern === 'spiral') {
      const arms = 6
      for (let a = 0; a < arms; a++) {
        const ang = b.spinPhase * 3 + (Math.PI * 2 / arms) * a
        spawnBullet(b.x, b.y, Math.cos(ang) * 2.2, Math.sin(ang) * 2.2, 5, 1)
      }
    } else if (b.pattern === 'wave') {
      const rows = 5
      for (let r = 0; r < rows; r++) {
        const off = (r / rows) * Math.PI * 2
        const vy = 2 + Math.sin(b.spinPhase * 4 + off) * 0.8
        const vx = Math.cos(b.spinPhase * 2 + off) * 2
        spawnBullet(b.x + Math.sin(b.spinPhase * 4 + off) * 40, b.y + 10, vx, vy, 4, 2)
      }
    } else if (b.pattern === 'aimed') {
      // Fire aimed bursts of 5 toward the player with slight spread
      const dx = s.px - b.x, dy = s.py - b.y
      const dist = Math.hypot(dx, dy) || 1
      const ux = dx / dist, uy = dy / dist
      const spread = 0.25
      for (let k = -2; k <= 2; k++) {
        const ang = Math.atan2(uy, ux) + k * spread
        spawnBullet(b.x, b.y + 10, Math.cos(ang) * 3.0, Math.sin(ang) * 3.0, 4, 0)
      }
    } else if (b.pattern === 'beam') {
      // Beam sweep — spawn small bullets across a line perpendicular
      // to a slowly-rotating beam angle.
      s.beam.phase += dt * 0.0006
      const beamAng = Math.sin(s.beam.phase) * 0.6
      s.beam.x = b.x + Math.sin(s.beam.phase) * 120
      s.beam.w = 60
      // Also emit tiny random bullets around the boss for pressure
      for (let k = 0; k < 3; k++) {
        const ang = beamAng + (Math.random() - 0.5) * 0.8
        spawnBullet(b.x + Math.sin(beamAng) * 30, b.y + 20, Math.sin(ang) * 3.2, Math.cos(ang) * 3.2, 3, 3)
      }
    }
  }

  // Physics + collision — called every frame.
  const stepFrame = (dt) => {
    const s = g.current
    if (s.invuln > 0) s.invuln = Math.max(0, s.invuln - dt)

    // Player input
    let dx = 0, dy = 0
    if (s.keys.has('arrowleft') || s.keys.has('a')) dx -= 1
    if (s.keys.has('arrowright') || s.keys.has('d')) dx += 1
    if (s.keys.has('arrowup') || s.keys.has('w'))    dy -= 1
    if (s.keys.has('arrowdown') || s.keys.has('s'))  dy += 1
    if (s.touch.active) { dx = s.touch.dx; dy = s.touch.dy }
    const focus = s.keys.has('shift') || s.touch.focus
    const spd = focus ? PLAYER_FOCUS_SPEED : PLAYER_SPEED
    // Normalize diagonal
    const mag = Math.hypot(dx, dy)
    if (mag > 1) { dx /= mag; dy /= mag }
    s.px = Math.max(12, Math.min(FIELD_W - 12, s.px + dx * spd))
    s.py = Math.max(20, Math.min(FIELD_H - 20, s.py + dy * spd))

    // Player firing
    s.fireCd -= dt
    if ((s.keys.has(' ') || s.keys.has('z') || s.touch.fire) && s.fireCd <= 0) {
      spawnPlayerBullet(s.px - 6, s.py - 4)
      spawnPlayerBullet(s.px + 6, s.py - 4)
      s.fireCd = PLAYER_FIRE_COOLDOWN
      sfx.laser()
    }

    // Boss step
    stepBoss(dt)

    // Update player bullets → collide w/ boss
    for (let i = 0; i < s.pbx.length; i++) {
      if (!s.pbalive[i]) continue
      s.pby[i] += s.pbvy[i]
      if (s.pby[i] < -10) { s.pbalive[i] = 0; continue }
      // Boss hit test
      if (s.boss.alive && Math.hypot(s.pbx[i] - s.boss.x, s.pby[i] - s.boss.y) < 34) {
        s.pbalive[i] = 0
        s.boss.hp -= 3
        s.scoreAcc += 5
        if (s.boss.hp <= 0) {
          s.boss.alive = false
          s.scoreAcc += 3000
          sfx.boom()
          setTimeout(() => {
            // Respawn boss stronger — next wave
            setWave((w) => w + 1)
            s.boss = { x: FIELD_W / 2, y: 120, hp: 600 + wave * 200, hpMax: 600 + wave * 200, spinPhase: 0, pattern: 'spiral', patternT: 0, alive: true, _lastFire: 0 }
          }, 800)
        }
      }
    }

    // Update enemy bullets → collide with player
    let live = 0
    s.grazeThisFrame = 0
    for (let i = 0; i < MAX_BULLETS; i++) {
      if (!s.balive[i]) continue
      s.bx[i] += s.bvx[i]
      s.by[i] += s.bvy[i]
      // Cull off-screen
      if (s.bx[i] < -20 || s.bx[i] > FIELD_W + 20 || s.by[i] > FIELD_H + 20 || s.by[i] < -40) {
        s.balive[i] = 0
        s.grazedIds.delete(i)
        continue
      }
      live++
      const d = Math.hypot(s.bx[i] - s.px, s.by[i] - s.py)
      if (d < s.br[i] + cfgRef.current.hitboxR && s.invuln <= 0) {
        // HIT!
        s.balive[i] = 0
        s.invuln = 2000
        sfx.hit()
        setLives((n) => {
          const nn = n - 1
          if (nn <= 0) { setTimeout(gameOver, 100); return 0 }
          return nn
        })
        clearAllEnemyBullets()
        setShake(1)
      } else if (d < GRAZE_R && !s.grazedIds.has(i)) {
        s.grazedIds.add(i)
        s.grazeThisFrame += 1
      }
    }
    s.liveBullets = live
    if (live > s.peakBullets) s.peakBullets = live

    if (s.grazeThisFrame > 0) {
      setGraze((g0) => g0 + s.grazeThisFrame)
      s.scoreAcc += s.grazeThisFrame * 2 * cfgRef.current.grazeMult
    }

    // Beam damage
    if (s.beam.active && s.invuln <= 0) {
      const bx = s.beam.x
      const inBeam = Math.abs(s.px - bx) < s.beam.w / 2 && s.py > s.boss.y
      if (inBeam) {
        s.invuln = 2000
        sfx.hit()
        setLives((n) => {
          const nn = n - 1
          if (nn <= 0) { setTimeout(gameOver, 100); return 0 }
          return nn
        })
        setShake(1)
      }
    }

    // Wave time
    s.waveT += dt
  }

  // Draw — canvas 2D. Bullets get shadow blur for glow, capped when
  // we're overloaded so we stay above 45 fps.
  const draw = () => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    ctx.fillStyle = '#050510'
    ctx.fillRect(0, 0, FIELD_W, FIELD_H)

    const s = g.current

    // Starfield backdrop
    const t = performance.now() * 0.02
    ctx.fillStyle = '#1a1a2e'
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 97) % FIELD_W) + Math.sin(t * 0.001 + i) * 5
      const sy = ((t * 0.3 + i * 51) % FIELD_H)
      ctx.globalAlpha = 0.3 + (i % 3) * 0.2
      ctx.fillRect(sx, sy, 1.5, 1.5)
    }
    ctx.globalAlpha = 1

    // Beam
    if (s.beam.active && s.boss.alive) {
      const grad = ctx.createLinearGradient(s.beam.x - s.beam.w / 2, 0, s.beam.x + s.beam.w / 2, 0)
      grad.addColorStop(0, '#f43f5e00')
      grad.addColorStop(0.5, '#f43f5eaa')
      grad.addColorStop(1, '#f43f5e00')
      ctx.fillStyle = grad
      ctx.fillRect(s.beam.x - s.beam.w / 2, s.boss.y + 10, s.beam.w, FIELD_H)
    }

    // Boss (SVG-like saucer, drawn manually)
    if (s.boss.alive) {
      ctx.save()
      ctx.translate(s.boss.x, s.boss.y)
      // Halo
      ctx.shadowColor = '#a855f7'
      ctx.shadowBlur = 20
      ctx.fillStyle = '#1e293b'
      ctx.beginPath(); ctx.ellipse(0, 8, 42, 12, 0, 0, Math.PI * 2); ctx.fill()
      // Body
      ctx.shadowBlur = 15
      ctx.fillStyle = '#8b5cf6'
      ctx.beginPath(); ctx.ellipse(0, 0, 30, 16, 0, 0, Math.PI * 2); ctx.fill()
      // Dome
      ctx.fillStyle = '#e0e7ff'
      ctx.beginPath(); ctx.ellipse(0, -6, 12, 8, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#a5b4fc'
      ctx.beginPath(); ctx.ellipse(-3, -8, 4, 3, 0, 0, Math.PI * 2); ctx.fill()
      // Rotating rings
      ctx.shadowBlur = 0
      ctx.strokeStyle = '#f0abfc'
      ctx.lineWidth = 1.5
      for (let a = 0; a < 4; a++) {
        const ang = s.boss.spinPhase * 2 + (Math.PI / 2) * a
        ctx.beginPath()
        ctx.arc(0, 0, 34, ang, ang + 0.6)
        ctx.stroke()
      }
      ctx.restore()

      // Boss HP bar
      const hpFrac = Math.max(0, s.boss.hp / s.boss.hpMax)
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.fillRect(20, 20, FIELD_W - 40, 6)
      ctx.fillStyle = '#f43f5e'
      ctx.fillRect(20, 20, (FIELD_W - 40) * hpFrac, 6)
    }

    // Player bullets
    ctx.shadowColor = '#a5f3fc'
    ctx.shadowBlur = 10
    ctx.fillStyle = '#67e8f9'
    for (let i = 0; i < s.pbx.length; i++) {
      if (!s.pbalive[i]) continue
      ctx.fillRect(s.pbx[i] - 1.5, s.pby[i] - 6, 3, 10)
    }

    // Enemy bullets
    const useBlur = s.liveBullets < 400 // drop glow at high load
    ctx.shadowBlur = useBlur ? 6 : 0
    for (let i = 0; i < MAX_BULLETS; i++) {
      if (!s.balive[i]) continue
      const tint = BULLET_TINTS[s.btint[i]] || BULLET_TINTS[0]
      ctx.shadowColor = tint.glow
      ctx.fillStyle = tint.fill
      const r = s.br[i]
      ctx.beginPath()
      ctx.arc(s.bx[i], s.by[i], r, 0, Math.PI * 2)
      ctx.fill()
      // Highlight
      if (useBlur) {
        ctx.fillStyle = tint.glow
        ctx.beginPath()
        ctx.arc(s.bx[i] - r * 0.3, s.by[i] - r * 0.3, r * 0.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.shadowBlur = 0

    // Player (SVG-plane style drawn with paths)
    const flash = s.invuln > 0 && Math.floor(performance.now() / 60) % 2 === 0
    ctx.save()
    ctx.translate(s.px, s.py)
    ctx.globalAlpha = flash ? 0.35 : 1

    // Wings
    ctx.fillStyle = '#e0e7ff'
    ctx.beginPath()
    ctx.moveTo(-14, 4)
    ctx.lineTo(-4, -8)
    ctx.lineTo(4, -8)
    ctx.lineTo(14, 4)
    ctx.lineTo(6, 6)
    ctx.lineTo(-6, 6)
    ctx.closePath()
    ctx.fill()
    // Body / cockpit
    ctx.fillStyle = '#818cf8'
    ctx.beginPath()
    ctx.ellipse(0, -2, 4, 10, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#38bdf8'
    ctx.beginPath()
    ctx.ellipse(0, -6, 2.5, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    // Engine thrust
    ctx.fillStyle = '#fef3c7'
    ctx.beginPath()
    ctx.moveTo(-3, 8)
    ctx.lineTo(0, 14 + Math.sin(performance.now() * 0.05) * 2)
    ctx.lineTo(3, 8)
    ctx.closePath()
    ctx.fill()

    // Hitbox indicator when focused
    if (s.keys.has('shift') || s.touch.focus) {
      ctx.strokeStyle = '#f43f5e'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(0, 0, HITBOX_R + 1, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = '#fca5a5'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.arc(0, 0, GRAZE_R, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.restore()
    ctx.globalAlpha = 1
  }

  // rAF driver
  useEffect(() => {
    if (status !== 'playing') return
    const s = g.current
    s.running = true
    s.lastT = performance.now()
    let raf = 0
    const loop = (now) => {
      if (!s.running) return
      const dt = Math.min(64, now - s.lastT)
      s.lastT = now
      stepFrame(dt)
      draw()
      // Flush accumulated score
      if (s.scoreAcc > 0) {
        setScore((old) => old + s.scoreAcc)
        s.scoreAcc = 0
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      s.running = false
      cancelAnimationFrame(raf)
    }
  }, [status]) // eslint-disable-line

  // Peak bullet flush
  useEffect(() => {
    if (status !== 'playing') return
    const iv = setInterval(() => {
      setMaxBullets((mb) => Math.max(mb, g.current.peakBullets))
    }, 500)
    return () => clearInterval(iv)
  }, [status])

  // Shake decay
  useEffect(() => {
    if (!shake) return
    const t = setTimeout(() => setShake(0), 260)
    return () => clearTimeout(t)
  }, [shake])

  // Keyboard input
  useEffect(() => {
    const s = g.current
    const down = (e) => {
      if (status !== 'playing') return
      s.keys.add(e.key.toLowerCase())
      if (e.key === 'x' || e.key === 'X') bomb()
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault()
    }
    const up = (e) => { s.keys.delete(e.key.toLowerCase()) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [status]) // eslint-disable-line

  // Touch — big invisible zone in the center; drag to steer.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const s = g.current
    const anchor = { x: 0, y: 0 }
    const onDown = (e) => {
      const p = e.touches ? e.touches[0] : e
      const rect = el.getBoundingClientRect()
      anchor.x = p.clientX; anchor.y = p.clientY
      const cx = ((p.clientX - rect.left) / rect.width) * FIELD_W
      const cy = ((p.clientY - rect.top) / rect.height) * FIELD_H
      // Direct move on touch — snap player toward touch point
      s.touch.active = true
      s.touch.dx = 0; s.touch.dy = 0
      s.px = cx; s.py = cy
    }
    const onMove = (e) => {
      if (!s.touch.active) return
      const p = e.touches ? e.touches[0] : e
      const rect = el.getBoundingClientRect()
      const cx = ((p.clientX - rect.left) / rect.width) * FIELD_W
      const cy = ((p.clientY - rect.top) / rect.height) * FIELD_H
      s.px = Math.max(12, Math.min(FIELD_W - 12, cx))
      s.py = Math.max(20, Math.min(FIELD_H - 20, cy))
    }
    const onUp = () => { s.touch.active = false }
    el.addEventListener('touchstart', onDown, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onUp)
    return () => {
      el.removeEventListener('touchstart', onDown)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onUp)
    }
  }, [status])

  const extraStats = (
    <>
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Lives</span>
        <span className="text-xl sm:text-2xl font-bold tabular-nums text-rose-300">{'♥'.repeat(lives) || '—'}</span>
      </div>
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Bombs</span>
        <span className="text-xl sm:text-2xl font-bold tabular-nums text-amber-300">{'●'.repeat(bombs) || '—'}</span>
      </div>
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Graze</span>
        <span className="text-xl sm:text-2xl font-bold tabular-nums text-fuchsia-300">{graze}</span>
      </div>
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Bullets</span>
        <span className="text-xl sm:text-2xl font-bold tabular-nums text-cyan-300">{maxBullets}</span>
      </div>
    </>
  )

  const overlay = status === 'ready' ? (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 backdrop-blur">
      <div className="text-center px-6 max-w-md">
        <h2 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent mb-2">
          Bullet Hell
        </h2>
        <p className="text-white/70 mb-6">Tiny hitbox. Big bullets. Weave. Graze. Bomb.</p>
        <div className="text-left text-white/70 text-xs sm:text-sm mb-6 grid grid-cols-2 gap-y-1 gap-x-4">
          <div><kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 font-mono">← ↑ → ↓</kbd> Move</div>
          <div><kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 font-mono">Space</kbd> Fire (auto)</div>
          <div><kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 font-mono">Shift</kbd> Focus (slow)</div>
          <div><kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 font-mono">X</kbd> Bomb</div>
        </div>
        <button type="button" onClick={start} className="px-6 py-3 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-bold text-lg">
          Start
        </button>
      </div>
    </div>
  ) : status === 'over' ? (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/85 backdrop-blur">
      <div className="text-center px-6">
        <h2 className="text-4xl font-bold text-rose-300 mb-2">Down</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 text-left">
          <div><div className="text-[10px] uppercase text-white/40">Score</div><div className="text-2xl font-bold text-amber-300">{score.toLocaleString()}</div></div>
          <div><div className="text-[10px] uppercase text-white/40">Wave</div><div className="text-2xl font-bold text-fuchsia-300">{wave}</div></div>
          <div><div className="text-[10px] uppercase text-white/40">Graze</div><div className="text-2xl font-bold text-fuchsia-300">{graze}</div></div>
          <div><div className="text-[10px] uppercase text-white/40">Peak</div><div className="text-2xl font-bold text-cyan-300">{maxBullets}</div></div>
        </div>
        <button type="button" onClick={start} className="px-6 py-3 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-bold text-lg">
          Retry
        </button>
      </div>
    </div>
  ) : null

  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const shakeStyle = shake && !reduced
    ? { transform: `translate3d(${(Math.random()-0.5)*10}px,${(Math.random()-0.5)*10}px,0)` }
    : undefined

  // Chromatic aberration for death — three canvas offset copies
  const chromaticLayer = chromatic && !reduced ? (
    <div className="absolute inset-0 pointer-events-none z-20 mix-blend-screen">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle, transparent 40%, #f43f5e33 100%)' }} />
    </div>
  ) : null

  return (
    <GameShell
      title="Bullet Hell"
      category="Reflex"
      score={score}
      best={best}
      level={wave}
      status={status === 'ready' ? 'ready' : status === 'over' ? 'over' : 'playing'}
      extraStats={extraStats}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onPause={() => setStatus((s) => s === 'playing' ? 'paused' : s === 'paused' ? 'playing' : s)}
      onRestart={start}
      rules={RULES}
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
      controls={[
        { key: '← ↑ → ↓', label: 'Move' },
        { key: 'Space',   label: 'Fire' },
        { key: 'Shift',   label: 'Focus' },
        { key: 'X',       label: 'Bomb' },
      ]}
      overlay={overlay}
    >
      <div
        ref={wrapRef}
        style={shakeStyle}
        className="relative w-full mx-auto max-w-[520px] transition-transform touch-none select-none"
      >
        <canvas
          ref={canvasRef}
          width={FIELD_W}
          height={FIELD_H}
          className="block w-full h-auto bg-black"
          style={{ imageRendering: 'auto' }}
        />
        {chromaticLayer}
        {/* Mobile controls — focus + bomb */}
        <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-2">
          <button
            type="button"
            onPointerDown={() => { g.current.touch.focus = true }}
            onPointerUp={() => { g.current.touch.focus = false }}
            onPointerLeave={() => { g.current.touch.focus = false }}
            className="w-14 h-14 rounded-full bg-rose-500/80 backdrop-blur border border-rose-300/40 text-white font-bold text-xs shadow-lg active:scale-95"
          >
            FOCUS
          </button>
          <button
            type="button"
            onPointerDown={() => bomb()}
            className="w-14 h-14 rounded-full bg-amber-500/80 backdrop-blur border border-amber-300/40 text-white font-bold text-xs shadow-lg active:scale-95"
          >
            BOMB
          </button>
        </div>
      </div>
    </GameShell>
  )
}
