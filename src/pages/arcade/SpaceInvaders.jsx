// Space Invaders — 5×11 alien grid, side-to-side march that descends
// on wall hits, UFO bonus ship, destructible bunkers, escalating
// waves with 2-frame sprite animation.
//
// Controls:
//   • ← → / A D           — move ship
//   • Z / Enter / ↑       — fire laser (Space reserved for pause)
//   • Touch buttons       — mobile
//
// Sprite atlas: aliens are drawn from tiny inline binary grids so
// three distinct species show up with a two-frame waddle animation.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const RULES = [
  { heading: 'Goal', body: 'Wipe out every alien in the 5×11 grid before they either reach your line or blast you with bombs. Clearing all 55 aliens rolls the next wave.' },
  { heading: 'Controls', body: '← / → or A / D moves your cannon. Z, ↑ or Enter fires a laser (only one bullet on screen at a time). Space pauses. Touch users get on-screen buttons.' },
  { heading: 'Scoring', body: 'Top row (small squid) = 30 pts. Middle rows (crab) = 20 pts. Bottom rows (octopus) = 10 pts. The pink UFO awards a random 50–300 pt bonus when picked off.' },
  { heading: 'Bunkers', body: 'Four green bunkers sit above the player. They erode with every bullet (yours OR alien bombs) that hits them, so use them sparingly.' },
  { heading: 'Alien behaviour', body: 'The whole formation shifts side-to-side and steps down when it hits a wall. Aliens speed up as their numbers thin out. From level 3, some bombs are "smart bombs" that home in on you.' },
  { heading: 'UFO', body: 'The pink saucer streaks across the top every 400–800 ticks. It is worth big points but never bombs you.' },
  { heading: 'Lives', body: 'You start with 3 lives. Getting bombed costs a life (and a small stun frame). Zero lives ends the game.' },
  { heading: 'Difficulty', body: 'Easy slows the march, lowers bomb frequency and gives 4 lives. Hard doubles bomb rate, speeds the march, and raises smart-bomb chance. Custom exposes march speed, fire rate, UFO frequency and bunker HP.' },
]

const DIFFICULTIES = {
  Easy:   { stepBase: 60, shootChance: 0.18, ufoInterval: 800, bunkerHp: 4 },
  Medium: { stepBase: 45, shootChance: 0.30, ufoInterval: 500, bunkerHp: 3 },
  Hard:   { stepBase: 30, shootChance: 0.55, ufoInterval: 300, bunkerHp: 2 },
}

const CUSTOM_SCHEMA = {
  stepBase:    { label: 'March interval (lower = faster)', min: 10, max: 80,  step: 2,    default: 45 },
  shootChance: { label: 'Bomb frequency',                  min: 0.05, max: 0.9, step: 0.05, default: 0.3 },
  ufoInterval: { label: 'UFO interval',                    min: 150, max: 1500, step: 50, default: 500 },
  bunkerHp:    { label: 'Bunker HP',                       min: 1,   max: 6,   step: 1,    default: 3 },
}

const W = 800
const H = 600
const ROWS = 5
const COLS = 11
const CELL_W = 42
const CELL_H = 34
const PLAYER_Y = H - 60
const PLAYER_W = 46
const PLAYER_H = 20
const BULLET_SPEED = 8
const BOMB_SPEED   = 3

// Sprite atlas (each frame is 8 rows × 8 cols).
const SPRITE_A = [
  ['00011000', '00111100', '01111110', '11011011', '11111111', '00100100', '01011010', '10100101'],
  ['00011000', '00111100', '01111110', '11011011', '11111111', '01011010', '10011001', '01000010'],
]
const SPRITE_B = [
  ['00100100', '00100100', '01111110', '11011011', '11111111', '10111101', '00100100', '01000010'],
  ['10100101', '10100101', '11111111', '11011011', '11111111', '01111110', '10011001', '01000010'],
]
const SPRITE_C = [
  ['00011000', '00111100', '01111110', '01100110', '01111110', '00011000', '00100100', '01000010'],
  ['00011000', '00111100', '01111110', '01100110', '01111110', '00100100', '01000010', '10000001'],
]
const SPECIES = [
  { grid: SPRITE_C, color: '#f0abfc', points: 30 },
  { grid: SPRITE_B, color: '#fbbf24', points: 20 },
  { grid: SPRITE_B, color: '#fbbf24', points: 20 },
  { grid: SPRITE_A, color: '#34d399', points: 10 },
  { grid: SPRITE_A, color: '#34d399', points: 10 },
]

const BUNKER_SPRITE = [
  '000111111111000',
  '011111111111110',
  '111111111111111',
  '111111111111111',
  '111111000111111',
  '111110000011111',
  '111100000001111',
]

const drawSprite = (ctx, grid, x, y, cell, color) => {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '1') {
        ctx.fillStyle = color
        ctx.fillRect(x + c * cell, y + r * cell, cell, cell)
      }
    }
  }
}

export default function SpaceInvaders() {
  const canvasRef = useRef(null)
  const sfx = useRef(getSfx()).current

  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [lives, setLives] = useState(3)
  const [status, setStatus] = useState('playing')
  const [soundOn, setSoundOn] = useState(true)
  const [difficulty, setDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState(() => Object.fromEntries(
    Object.entries(CUSTOM_SCHEMA).map(([k, v]) => [k, v.default])
  ))
  const cfg = useMemo(
    () => difficulty === 'Custom' ? customValues : DIFFICULTIES[difficulty] || DIFFICULTIES.Medium,
    [difficulty, customValues],
  )
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg }, [cfg])

  const stateRef = useRef({
    player: { x: W / 2 - PLAYER_W / 2, hit: 0 },
    aliens: [],
    bullets: [],
    bombs: [],
    bunkers: [],
    ufo: null,
    ufoTimer: 500,
    dir: 1,
    stepTimer: 0,
    stepInterval: 45,
    animFrame: 0,
    particles: [],
    popups: [],
    shake: 0,
    keys: { left: false, right: false, fire: false },
    fireCd: 0,
    reduced: false,
  })

  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const buildWave = useCallback((lvl) => {
    const aliens = []
    const startX = 80, startY = 80
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        aliens.push({
          r, c,
          x: startX + c * (CELL_W + 8),
          y: startY + r * (CELL_H + 6),
          alive: true,
          species: SPECIES[r],
        })
      }
    }
    const bunkers = []
    for (let i = 0; i < 4; i++) {
      const bx = 80 + i * (W - 160) / 3
      const by = H - 160
      const bunkerHp = cfgRef.current.bunkerHp || 3
      const cells = BUNKER_SPRITE.map((row) => row.split('').map((v) => v === '1' ? bunkerHp : 0))
      bunkers.push({ x: bx, y: by, cells, cellSize: 6 })
    }
    const s = stateRef.current
    s.aliens = aliens; s.bunkers = bunkers
    s.bullets = []; s.bombs = []
    const ufoBase = cfgRef.current.ufoInterval || 500
    s.ufo = null; s.ufoTimer = ufoBase * 0.8 + Math.random() * ufoBase * 0.8
    s.dir = 1; s.stepTimer = 0
    s.stepInterval = Math.max(6, (cfgRef.current.stepBase || 45) - lvl * 3)
    s.animFrame = 0
  }, [])

  const reset = useCallback(() => {
    setScore(0); setLevel(1); setLives(3); setStatus('playing')
    stateRef.current.player = { x: W / 2 - PLAYER_W / 2, hit: 0 }
    buildWave(1)
  }, [buildWave])

  useEffect(() => { buildWave(1) }, [buildWave])

  // Input.
  useEffect(() => {
    const s = stateRef.current
    const kd = (e) => {
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') s.keys.left = true
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') s.keys.right = true
      if (e.code === 'KeyZ' || e.code === 'Enter' || e.code === 'ArrowUp') { s.keys.fire = true; e.preventDefault() }
    }
    const ku = (e) => {
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') s.keys.left = false
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') s.keys.right = false
      if (e.code === 'KeyZ' || e.code === 'Enter' || e.code === 'ArrowUp') s.keys.fire = false
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [])

  // Main loop.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf = 0
    let last = performance.now()
    stateRef.current.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const spawnParticles = (x, y, color, n = 20, spd = 3) => {
      const s = stateRef.current
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const v = 0.6 + Math.random() * spd
        s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: 0.025 + Math.random() * 0.03, size: 1 + Math.random() * 2.2, color })
      }
    }
    const shake = (v) => {
      if (stateRef.current.reduced) return
      stateRef.current.shake = Math.min(20, stateRef.current.shake + v)
    }
    const popup = (x, y, text, color) => stateRef.current.popups.push({ x, y, t: 1, text, color: color || '#fef3c7' })

    const erode = (x, y, radius) => {
      for (const b of stateRef.current.bunkers) {
        const cs = b.cellSize
        for (let r = 0; r < b.cells.length; r++) {
          for (let c = 0; c < b.cells[r].length; c++) {
            if (b.cells[r][c] <= 0) continue
            const cx = b.x + c * cs + cs / 2
            const cy = b.y + r * cs + cs / 2
            if (Math.hypot(cx - x, cy - y) < radius) b.cells[r][c] = Math.max(0, b.cells[r][c] - 2)
          }
        }
      }
    }
    const bunkerHit = (x, y) => {
      for (const b of stateRef.current.bunkers) {
        const cs = b.cellSize
        const cx = Math.floor((x - b.x) / cs)
        const cy = Math.floor((y - b.y) / cs)
        if (cy >= 0 && cy < b.cells.length && cx >= 0 && cx < b.cells[0].length && b.cells[cy][cx] > 0) {
          erode(x, y, cs * 1.6); return true
        }
      }
      return false
    }

    const tick = (now) => {
      let dt = (now - last) / 16.666; last = now
      if (dt > 3) dt = 3
      const s = stateRef.current

      if (status === 'playing') {
        const spd = 5 * dt
        if (s.keys.left)  s.player.x -= spd
        if (s.keys.right) s.player.x += spd
        s.player.x = Math.max(20, Math.min(W - PLAYER_W - 20, s.player.x))

        s.fireCd -= dt
        if (s.keys.fire && s.fireCd <= 0 && s.bullets.length < 2) {
          s.bullets.push({ x: s.player.x + PLAYER_W / 2, y: PLAYER_Y - 4 })
          s.fireCd = 22
          sfx.laser()
        }

        s.stepTimer += dt
        if (s.stepTimer >= s.stepInterval) {
          s.stepTimer = 0
          s.animFrame = (s.animFrame + 1) % 2
          const step = 10
          let hitEdge = false
          const alive = s.aliens.filter((a) => a.alive)
          for (const a of alive) {
            const nx = a.x + s.dir * step
            if (nx < 20 || nx + CELL_W > W - 20) hitEdge = true
          }
          if (hitEdge) {
            s.dir *= -1
            for (const a of s.aliens) a.y += 14
          } else {
            for (const a of s.aliens) a.x += s.dir * step
          }
          const bottoms = new Map()
          for (const a of alive) {
            const prev = bottoms.get(a.c)
            if (!prev || a.y > prev.y) bottoms.set(a.c, a)
          }
          const candidates = [...bottoms.values()]
          if (candidates.length && Math.random() < (cfgRef.current.shootChance || 0.3) + level * 0.05) {
            const bomber = candidates[Math.floor(Math.random() * candidates.length)]
            const type = Math.random() < 0.15 && level >= 3 ? 'smart' : 'plain'
            s.bombs.push({ x: bomber.x + CELL_W / 2, y: bomber.y + CELL_H, type, vx: 0, wobble: Math.random() * Math.PI * 2 })
          }
          sfx.beep({ freq: 90 + s.animFrame * 40, type: 'square', dur: 0.06, gain: 0.03 })
        }

        const aliveCount = s.aliens.filter((a) => a.alive).length
        s.stepInterval = Math.max(4, ((cfgRef.current.stepBase || 45) - level * 3) * (aliveCount / (ROWS * COLS)) + 6)

        for (const b of s.bullets) b.y -= BULLET_SPEED * dt
        s.bullets = s.bullets.filter((b) => {
          if (b.y < 0) return false
          if (bunkerHit(b.x, b.y)) { spawnParticles(b.x, b.y, '#84cc16', 6, 1.5); return false }
          for (const a of s.aliens) {
            if (!a.alive) continue
            if (b.x > a.x && b.x < a.x + CELL_W && b.y > a.y && b.y < a.y + CELL_H) {
              a.alive = false
              setScore((v) => v + a.species.points)
              popup(a.x + CELL_W / 2, a.y, `+${a.species.points}`, a.species.color)
              spawnParticles(a.x + CELL_W / 2, a.y + CELL_H / 2, a.species.color, 20, 3)
              shake(1.5); sfx.boom()
              return false
            }
          }
          if (s.ufo && b.x > s.ufo.x - 22 && b.x < s.ufo.x + 22 && b.y > s.ufo.y - 8 && b.y < s.ufo.y + 12) {
            const pts = [50, 100, 150, 300][Math.floor(Math.random() * 4)]
            setScore((v) => v + pts)
            popup(s.ufo.x, s.ufo.y, `+${pts}`, '#f0abfc')
            spawnParticles(s.ufo.x, s.ufo.y, '#f0abfc', 40, 4)
            shake(4); s.ufo = null; sfx.win()
            return false
          }
          return true
        })

        for (const bm of s.bombs) {
          if (bm.type === 'smart') {
            const targetX = s.player.x + PLAYER_W / 2
            bm.vx += Math.sign(targetX - bm.x) * 0.06 * dt
            bm.vx *= 0.98
            bm.x += bm.vx * dt
          } else {
            bm.wobble += 0.2 * dt
            bm.x += Math.sin(bm.wobble) * 0.3 * dt
          }
          bm.y += BOMB_SPEED * dt * (bm.type === 'smart' ? 1.3 : 1)
        }
        s.bombs = s.bombs.filter((bm) => {
          if (bm.y > H) return false
          if (bunkerHit(bm.x, bm.y)) { spawnParticles(bm.x, bm.y, '#fca5a5', 8, 2); return false }
          if (bm.y > PLAYER_Y && bm.x > s.player.x && bm.x < s.player.x + PLAYER_W && s.player.hit <= 0) {
            s.player.hit = 90
            spawnParticles(s.player.x + PLAYER_W / 2, PLAYER_Y + PLAYER_H / 2, '#f43f5e', 40, 4)
            shake(8); sfx.death()
            setLives((v) => {
              const nl = v - 1
              if (nl <= 0) setStatus('over')
              return nl
            })
            return false
          }
          return true
        })
        if (s.player.hit > 0) s.player.hit -= dt

        s.ufoTimer -= dt
        if (s.ufoTimer <= 0 && !s.ufo) {
          const fromLeft = Math.random() < 0.5
          s.ufo = { x: fromLeft ? -30 : W + 30, y: 50, vx: fromLeft ? 2 : -2 }
          s.ufoTimer = (cfgRef.current.ufoInterval || 500) * 1.4 + Math.random() * (cfgRef.current.ufoInterval || 500) * 1.4
          sfx.chirp()
        }
        if (s.ufo) {
          s.ufo.x += s.ufo.vx * dt
          if (s.ufo.x < -60 || s.ufo.x > W + 60) s.ufo = null
        }

        if (s.aliens.some((a) => a.alive && a.y + CELL_H > PLAYER_Y - 20)) {
          setStatus('over'); sfx.death()
        }
        if (aliveCount === 0) {
          setLevel((l) => l + 1)
          buildWave(level + 1)
          popup(W / 2, H / 2, 'WAVE CLEAR', '#a3e635')
          sfx.win()
        }

        s.particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.06 * dt; p.life -= p.decay * dt })
        s.particles = s.particles.filter((p) => p.life > 0)
        s.popups.forEach((p) => { p.y -= 0.6 * dt; p.t -= 0.014 * dt })
        s.popups = s.popups.filter((p) => p.t > 0)
        s.shake *= Math.pow(0.86, dt)
      }

      // Render.
      ctx.clearRect(0, 0, W, H)
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#050510'); bg.addColorStop(1, '#000')
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

      ctx.fillStyle = '#fff'
      for (let i = 0; i < 60; i++) {
        const x = (i * 137 + s.animFrame * 3) % W
        const y = (i * 91) % H
        ctx.globalAlpha = 0.3 + ((i * 13) % 6) / 10
        ctx.fillRect(x, y, 1, 1)
      }
      ctx.globalAlpha = 1

      const shakeX = s.shake ? (Math.random() - 0.5) * s.shake : 0
      const shakeY = s.shake ? (Math.random() - 0.5) * s.shake : 0
      ctx.save()
      ctx.translate(shakeX, shakeY)

      const cellPx = 4
      for (const a of s.aliens) {
        if (!a.alive) continue
        drawSprite(ctx, a.species.grid[s.animFrame], a.x + 4, a.y + 2, cellPx, a.species.color)
      }

      for (const b of s.bunkers) {
        for (let r = 0; r < b.cells.length; r++) {
          for (let c = 0; c < b.cells[r].length; c++) {
            const hp = b.cells[r][c]
            if (hp <= 0) continue
            const col = hp >= 3 ? '#22c55e' : hp === 2 ? '#84cc16' : '#eab308'
            ctx.fillStyle = col
            ctx.fillRect(b.x + c * b.cellSize, b.y + r * b.cellSize, b.cellSize, b.cellSize)
          }
        }
      }

      ctx.fillStyle = '#fef3c7'
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 6
      for (const b of s.bullets) ctx.fillRect(b.x - 2, b.y - 8, 4, 12)
      ctx.shadowBlur = 0

      for (const bm of s.bombs) {
        ctx.fillStyle = bm.type === 'smart' ? '#f0abfc' : '#f43f5e'
        ctx.beginPath()
        ctx.moveTo(bm.x, bm.y + 8)
        ctx.lineTo(bm.x - 4, bm.y - 4)
        ctx.lineTo(bm.x + 4, bm.y - 4)
        ctx.closePath()
        ctx.fill()
      }

      if (s.ufo) {
        ctx.save()
        ctx.translate(s.ufo.x, s.ufo.y)
        const ufoGrad = ctx.createLinearGradient(0, -6, 0, 8)
        ufoGrad.addColorStop(0, '#f0abfc'); ufoGrad.addColorStop(1, '#7e22ce')
        ctx.fillStyle = ufoGrad
        ctx.beginPath(); ctx.ellipse(0, 4, 24, 6, 0, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.ellipse(0, -2, 14, 8, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#fff'
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 6, 5, 1.5, 0, Math.PI * 2); ctx.fill() }
        ctx.restore()
      }

      if (!(s.player.hit > 0 && Math.floor(s.player.hit / 5) % 2 === 0)) {
        const px = s.player.x, py = PLAYER_Y
        const g = ctx.createLinearGradient(px, py, px, py + PLAYER_H)
        g.addColorStop(0, '#34d399'); g.addColorStop(1, '#065f46')
        ctx.fillStyle = g
        ctx.fillRect(px, py + 6, PLAYER_W, PLAYER_H - 6)
        ctx.fillRect(px + PLAYER_W / 2 - 3, py, 6, 8)
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fillRect(px, py + 6, PLAYER_W, 2)
      }

      for (const p of s.particles) {
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      }
      ctx.globalAlpha = 1
      for (const pu of s.popups) {
        ctx.globalAlpha = Math.max(0, pu.t)
        ctx.fillStyle = pu.color
        ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'
        ctx.fillText(pu.text, pu.x, pu.y)
      }
      ctx.globalAlpha = 1

      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.font = '13px system-ui'; ctx.textAlign = 'left'
      ctx.fillText('LIVES', 20, 30)
      for (let i = 0; i < lives; i++) {
        const px = 65 + i * 26
        ctx.fillStyle = '#34d399'
        ctx.fillRect(px, 22, 20, 6)
        ctx.fillRect(px + 8, 16, 4, 6)
      }
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.fillText(`WAVE ${level}`, W - 20, 30)

      ctx.restore()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [status, level, lives, buildWave, sfx])

  // Touch button binder.
  const bindTouch = (key, on) => (e) => {
    e.preventDefault()
    stateRef.current.keys[key] = on
  }

  const mobilePad = (
    <div className="flex items-center gap-3">
      <button type="button"
        onTouchStart={bindTouch('left', true)} onTouchEnd={bindTouch('left', false)}
        onMouseDown={bindTouch('left', true)} onMouseUp={bindTouch('left', false)} onMouseLeave={bindTouch('left', false)}
        className="w-14 h-14 rounded-full bg-white/10 border border-white/30 text-white text-2xl font-bold active:bg-white/20">←</button>
      <button type="button"
        onTouchStart={bindTouch('right', true)} onTouchEnd={bindTouch('right', false)}
        onMouseDown={bindTouch('right', true)} onMouseUp={bindTouch('right', false)} onMouseLeave={bindTouch('right', false)}
        className="w-14 h-14 rounded-full bg-white/10 border border-white/30 text-white text-2xl font-bold active:bg-white/20">→</button>
      <button type="button"
        onTouchStart={bindTouch('fire', true)} onTouchEnd={bindTouch('fire', false)}
        onMouseDown={bindTouch('fire', true)} onMouseUp={bindTouch('fire', false)} onMouseLeave={bindTouch('fire', false)}
        className="w-16 h-16 rounded-full bg-rose-500/30 border border-rose-400 text-white text-sm font-bold active:bg-rose-500/50">FIRE</button>
    </div>
  )

  return (
    <GameShell
      slug="space-invaders"
      title="Space Invaders"
      category="Arcade"
      score={score} level={level} status={status}
      extraStats={<div className="flex flex-col items-start"><span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Lives</span><span className="font-poppins font-black tabular-nums text-lg sm:text-xl text-emerald-300">{lives}</span></div>}
      soundOn={soundOn} onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={reset}
      onPause={() => setStatus((s) => s === 'paused' ? 'playing' : (s === 'playing' ? 'paused' : s))}
      controls={[
        { key: '← →', label: 'Move' },
        { key: 'Z', label: 'Fire' },
        { key: 'Space', label: 'Pause' },
      ]}
      mobile={mobilePad}
      subtitle="Waddling squids, marching crabs, one lonely cannon. Duck the smart bombs, cover under bunkers, chase the pink UFO."
      rules={RULES}
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      difficultyModes={['Easy', 'Medium', 'Hard', 'Custom']}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
    >
      <canvas ref={canvasRef} width={W} height={H} className="w-full h-auto max-h-[78vh] block bg-black" />
    </GameShell>
  )
}
