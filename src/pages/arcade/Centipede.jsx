// Centipede — Atari 1980. 30-column × 32-row playfield (top ~24 rows are
// the mushroom field, bottom 6 are the player zone). A centipede snakes
// down through the mushrooms; shooting a middle segment splits it into
// two independent centipedes with new heads. Mushrooms block movement
// and force the centipede to descend one row.
//
// Extras:
//   • Spider ricochets through the player zone, munches mushrooms, and
//     scores 300/600/900 depending on distance.
//   • Flea drops straight down leaving a trail of fresh mushrooms.
//   • Scorpion crosses horizontally poisoning any mushroom it touches.
//     A poisoned mushroom makes the centipede plummet straight down
//     when it hits, ignoring the "descend one row" rule.
//
// Rendering: 16px cells, pixel-block mushrooms shrink through 4 hit
// stages, chunky centipede segments with tracking eyes on the head.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const COLS = 30
const ROWS = 32
const CELL = 16
const PLAYER_ZONE_TOP = 26

const emptyField = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0))

const seedMushrooms = () => {
  const f = emptyField()
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(Math.random() * COLS)
    const y = Math.floor(Math.random() * (PLAYER_ZONE_TOP - 2)) + 1
    f[y][x] = 4
  }
  return f
}

const newCentipede = (level) => {
  const length = 10 + Math.min(4, level - 1)
  const segs = []
  for (let i = 0; i < length; i++) {
    segs.push({ x: length - i - 1, y: 0, dir: 1, head: i === 0, plunge: false })
  }
  return segs
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export default function Centipede() {
  const canvasRef = useRef(null)
  const rafRef = useRef(0)

  const [status, setStatus] = useState('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem('arcade.centipede.best') || 0))
  const [level, setLevel] = useState(1)
  const [lives, setLives] = useState(3)
  const [soundOn, setSoundOn] = useState(true)

  const state = useRef(null)
  const keys = useRef({})
  const sfx = useMemo(() => getSfx(), [])

  const reset = useCallback(() => {
    state.current = {
      field: seedMushrooms(),
      centipedes: [newCentipede(1)],
      player: { x: COLS / 2, y: ROWS - 2 },
      bullets: [],
      spider: null,
      spiderTimer: 300,
      flea: null,
      fleaTimer: 900,
      scorpion: null,
      scorpionTimer: 1500,
      score: 0,
      lives: 3,
      level: 1,
      moveTick: 0,
      shake: 0,
      chromatic: 0,
      popups: [],
      cooldown: 0,
      startCountdown: 60,
    }
    setScore(0); setLives(3); setLevel(1); setStatus('ready')
  }, [])

  useEffect(() => { reset() }, [reset])

  useEffect(() => {
    const down = (e) => {
      keys.current[e.key] = true
      if (e.key === ' ') {
        const s = state.current; if (!s) return
        if (s.cooldown <= 0 && status !== 'over') {
          s.bullets.push({ x: s.player.x, y: s.player.y - 0.4, vy: -0.9 })
          s.cooldown = 6
          if (soundOn) sfx.laser()
        }
      }
      if (e.key === 'p' || e.key === 'P') {
        setStatus(prev => prev === 'paused' ? 'playing' : prev === 'playing' ? 'paused' : prev)
      }
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault()
      if (status === 'ready') setStatus('playing')
    }
    const up = (e) => { keys.current[e.key] = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [status, soundOn, sfx])

  const touchHold = (k, v) => { keys.current[k] = v }
  const touchFire = () => {
    const s = state.current; if (!s) return
    if (s.cooldown <= 0) {
      s.bullets.push({ x: s.player.x, y: s.player.y - 0.4, vy: -0.9 })
      s.cooldown = 6
      if (soundOn) sfx.laser()
    }
    if (status === 'ready') setStatus('playing')
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = COLS * CELL, H = ROWS * CELL
    canvas.width = W; canvas.height = H

    let f = 0

    const loop = () => {
      f++
      if (status === 'playing') step(f)
      draw(f)
      rafRef.current = requestAnimationFrame(loop)
    }

    const damageMushroom = (mx, my) => {
      const s = state.current
      if (mx < 0 || mx >= COLS || my < 0 || my >= ROWS) return false
      const v = s.field[my][mx]
      if (v === 0) return false
      const sign = v < 0 ? -1 : 1
      const abs = Math.abs(v) - 1
      s.field[my][mx] = abs <= 0 ? 0 : sign * abs
      if (abs <= 0) {
        s.score += sign < 0 ? 5 : 4
      } else {
        s.score += 1
      }
      return true
    }

    const killPlayer = () => {
      const s = state.current
      s.lives -= 1
      s.shake = 22
      s.chromatic = 30
      if (soundOn) sfx.death()
      if (s.lives <= 0) {
        setLives(0)
        setStatus('over')
        const prev = Number(localStorage.getItem('arcade.centipede.best') || 0)
        if (s.score > prev) {
          localStorage.setItem('arcade.centipede.best', String(s.score))
          setBest(s.score)
        }
      } else {
        setLives(s.lives)
        s.player.x = COLS / 2
        s.player.y = ROWS - 2
        s.startCountdown = 40
      }
    }

    const step = (f) => {
      const s = state.current; if (!s) return
      if (s.startCountdown > 0) { s.startCountdown--; return }

      s.cooldown = Math.max(0, s.cooldown - 1)

      const speed = 0.22
      if (keys.current.ArrowLeft || keys.current.a || keys.current.A) s.player.x -= speed
      if (keys.current.ArrowRight || keys.current.d || keys.current.D) s.player.x += speed
      if (keys.current.ArrowUp || keys.current.w || keys.current.W) s.player.y -= speed
      if (keys.current.ArrowDown || keys.current.s || keys.current.S) s.player.y += speed
      s.player.x = clamp(s.player.x, 0.5, COLS - 0.5)
      s.player.y = clamp(s.player.y, PLAYER_ZONE_TOP + 0.5, ROWS - 1.5)

      for (const b of s.bullets) b.y += b.vy
      s.bullets = s.bullets.filter(b => b.y > -1)

      for (const b of s.bullets) {
        const bx = Math.round(b.x), by = Math.round(b.y)
        if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS && s.field[by][bx] !== 0) {
          damageMushroom(bx, by)
          b.dead = true
        }
      }
      s.bullets = s.bullets.filter(b => !b.dead)

      // Bullet vs centipede
      for (const b of s.bullets) {
        for (let ci = 0; ci < s.centipedes.length; ci++) {
          const c = s.centipedes[ci]
          for (let i = 0; i < c.length; i++) {
            const seg = c[i]
            if (Math.abs(seg.x - b.x) < 0.5 && Math.abs(seg.y - b.y) < 0.5) {
              const pts = seg.head ? 100 : 10
              s.score += pts
              s.popups.push({ x: seg.x, y: seg.y, text: `+${pts}`, ttl: 30, color: '#ffb8de' })
              s.field[Math.floor(seg.y)][Math.floor(seg.x)] = 4
              if (soundOn) sfx.hit()
              const before = c.slice(0, i)
              const after  = c.slice(i + 1)
              const newCents = []
              if (before.length) {
                before[before.length - 1].head = true
                before[before.length - 1].dir *= -1
                newCents.push(before)
              }
              if (after.length) {
                after[0].head = true
                newCents.push(after)
              }
              s.centipedes.splice(ci, 1, ...newCents)
              b.dead = true
              break
            }
          }
          if (b.dead) break
        }
      }
      s.bullets = s.bullets.filter(b => !b.dead)

      // Bullet vs spider
      if (s.spider) {
        for (const b of s.bullets) {
          if (Math.abs(s.spider.x - b.x) < 0.7 && Math.abs(s.spider.y - b.y) < 0.7) {
            const d = Math.hypot(s.spider.x - s.player.x, s.spider.y - s.player.y)
            const pts = d < 2 ? 900 : d < 4 ? 600 : 300
            s.score += pts
            s.popups.push({ x: s.spider.x, y: s.spider.y, text: `+${pts}`, ttl: 45, color: '#37e0ff' })
            s.spider = null
            b.dead = true
            if (soundOn) sfx.boom()
            break
          }
        }
      }
      // Bullet vs flea
      if (s.flea) {
        for (const b of s.bullets) {
          if (Math.abs(s.flea.x - b.x) < 0.5 && Math.abs(s.flea.y - b.y) < 0.6) {
            s.flea.hits = (s.flea.hits || 0) + 1
            b.dead = true
            if (s.flea.hits >= 2) {
              s.score += 200
              s.popups.push({ x: s.flea.x, y: s.flea.y, text: '+200', ttl: 35, color: '#ffcf5a' })
              s.flea = null
              if (soundOn) sfx.hit()
            } else {
              s.flea.speed *= 2
            }
            break
          }
        }
      }
      // Bullet vs scorpion
      if (s.scorpion) {
        for (const b of s.bullets) {
          if (Math.abs(s.scorpion.x - b.x) < 0.7 && Math.abs(s.scorpion.y - b.y) < 0.7) {
            s.score += 1000
            s.popups.push({ x: s.scorpion.x, y: s.scorpion.y, text: '+1000', ttl: 45, color: '#a3ff9c' })
            s.scorpion = null
            b.dead = true
            if (soundOn) sfx.boom()
            break
          }
        }
      }
      s.bullets = s.bullets.filter(b => !b.dead)

      // Centipede stepping — grid-aligned, 1 tile per moveEvery frames
      s.moveTick = (s.moveTick || 0) + 1
      const moveEvery = Math.max(4, 10 - s.level)
      if (s.moveTick >= moveEvery) {
        s.moveTick = 0
        for (const c of s.centipedes) {
          // Snapshot before mutation for tail-follow
          const snap = c.map(seg => ({ x: seg.x, y: seg.y, dir: seg.dir }))
          // Head
          const head = c[0]
          if (head.plunge) {
            head.y += 1
            if (head.y >= ROWS - 1) head.plunge = false
          } else {
            const nx = head.x + head.dir
            const isBoundary = nx < 0 || nx >= COLS
            const nextCell = !isBoundary && head.y >= 0 && head.y < ROWS ? s.field[head.y][nx] : 1
            if (isBoundary || nextCell !== 0) {
              if (!isBoundary && nextCell < 0) {
                head.plunge = true
                head.y += 1
              } else {
                head.y += 1
                head.dir *= -1
              }
              if (head.y >= ROWS - 1) head.y = ROWS - 1
            } else {
              head.x = nx
            }
          }
          // Body follows previous position
          for (let i = 1; i < c.length; i++) {
            c[i].x = snap[i - 1].x
            c[i].y = snap[i - 1].y
            c[i].dir = snap[i - 1].dir
          }
        }
      }

      // Centipede vs player collision
      for (const c of s.centipedes) {
        for (const seg of c) {
          if (Math.abs(seg.x - s.player.x) < 0.7 && Math.abs(seg.y - s.player.y) < 0.7) {
            killPlayer()
            break
          }
        }
      }

      if (s.centipedes.reduce((a, c) => a + c.length, 0) === 0) {
        if (soundOn) sfx.win()
        s.level += 1
        setLevel(s.level)
        s.centipedes = [newCentipede(s.level)]
        s.startCountdown = 60
        setStatus('playing')
      }

      // Spider
      s.spiderTimer--
      if (!s.spider && s.spiderTimer <= 0) {
        s.spider = {
          x: Math.random() < 0.5 ? 0 : COLS - 1,
          y: PLAYER_ZONE_TOP + Math.random() * (ROWS - PLAYER_ZONE_TOP - 2),
          vx: Math.random() < 0.5 ? 0.09 : -0.09,
          vy: (Math.random() - 0.5) * 0.09,
          munch: 0,
        }
        s.spiderTimer = 400 + Math.random() * 400
      }
      if (s.spider) {
        s.spider.x += s.spider.vx
        s.spider.y += s.spider.vy
        if (s.spider.y < PLAYER_ZONE_TOP) s.spider.vy = Math.abs(s.spider.vy)
        if (s.spider.y > ROWS - 1.5) s.spider.vy = -Math.abs(s.spider.vy)
        if (s.spider.x < -1 || s.spider.x > COLS + 1) s.spider = null
        if (s.spider) {
          const mx = Math.round(s.spider.x), my = Math.round(s.spider.y)
          if (mx >= 0 && mx < COLS && my >= 0 && my < ROWS && s.field[my][mx] !== 0) {
            s.spider.munch = (s.spider.munch || 0) + 1
            if (s.spider.munch > 8) {
              s.field[my][mx] = 0
              s.spider.munch = 0
            }
          }
          if (Math.abs(s.spider.x - s.player.x) < 0.7 && Math.abs(s.spider.y - s.player.y) < 0.7) {
            killPlayer()
          }
        }
      }

      // Flea
      s.fleaTimer--
      const mushroomCount = s.field.slice(0, PLAYER_ZONE_TOP).reduce(
        (a, row) => a + row.filter(v => v > 0).length, 0)
      if (!s.flea && s.fleaTimer <= 0 && mushroomCount < 25) {
        s.flea = { x: Math.random() * COLS, y: -1, speed: 0.12, hits: 0 }
        s.fleaTimer = 700
      }
      if (s.flea) {
        s.flea.y += s.flea.speed
        const fx = Math.round(s.flea.x), fy = Math.round(s.flea.y)
        if (fy >= 0 && fy < PLAYER_ZONE_TOP && fx >= 0 && fx < COLS && Math.random() < 0.25 && s.field[fy][fx] === 0)
          s.field[fy][fx] = 4
        if (s.flea.y > ROWS) s.flea = null
        if (s.flea && Math.abs(s.flea.x - s.player.x) < 0.7 && Math.abs(s.flea.y - s.player.y) < 0.7)
          killPlayer()
      }

      // Scorpion poisons mushrooms
      s.scorpionTimer--
      if (!s.scorpion && s.scorpionTimer <= 0) {
        const y = 4 + Math.floor(Math.random() * (PLAYER_ZONE_TOP - 6))
        s.scorpion = { x: -1, y, vx: 0.12 }
        s.scorpionTimer = 1200
      }
      if (s.scorpion) {
        s.scorpion.x += s.scorpion.vx
        const sx = Math.round(s.scorpion.x), sy = Math.round(s.scorpion.y)
        if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && s.field[sy][sx] > 0)
          s.field[sy][sx] = -s.field[sy][sx]
        if (s.scorpion.x > COLS + 1) s.scorpion = null
      }

      for (const p of s.popups) p.ttl--
      s.popups = s.popups.filter(p => p.ttl > 0)
      if (s.shake > 0) s.shake *= 0.9
      if (s.chromatic > 0) s.chromatic *= 0.9

      setScore(s.score)
    }

    const draw = (f) => {
      const s = state.current; if (!s) return
      ctx.save()
      const reducedEl = document.querySelector('[data-reduced-motion="true"]')
      if (!reducedEl && s.shake > 0.1) {
        ctx.translate((Math.random() - 0.5) * s.shake * 0.4, (Math.random() - 0.5) * s.shake * 0.4)
      }
      ctx.fillStyle = '#03040c'
      ctx.fillRect(0, 0, W, H)

      const grad = ctx.createLinearGradient(0, PLAYER_ZONE_TOP * CELL, 0, ROWS * CELL)
      grad.addColorStop(0, 'rgba(255, 105, 180, 0.05)')
      grad.addColorStop(1, 'rgba(255, 105, 180, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, PLAYER_ZONE_TOP * CELL, W, H - PLAYER_ZONE_TOP * CELL)

      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const v = s.field[y][x]
          if (v === 0) continue
          const poisoned = v < 0
          const stage = Math.abs(v)
          const cx = x * CELL, cy = y * CELL
          const cap = poisoned ? '#c93cff' : (stage === 4 ? '#ff425c' : stage === 3 ? '#ff7d5c' : stage === 2 ? '#ffa05c' : '#d0d0d0')
          const stem = '#f5e29a'
          const px = CELL / 8
          ctx.fillStyle = cap
          ctx.fillRect(cx + 2*px, cy + 1*px, 4*px, 3*px)
          ctx.fillRect(cx + 1*px, cy + 2*px, 6*px, 2*px)
          if (stage >= 3) {
            ctx.fillStyle = '#ffe4e4'
            ctx.fillRect(cx + 3*px, cy + 2*px, 1*px, 1*px)
            ctx.fillRect(cx + 5*px, cy + 3*px, 1*px, 1*px)
          }
          ctx.fillStyle = stem
          ctx.fillRect(cx + 3*px, cy + 4*px, 2*px, 3*px)
        }
      }

      ctx.fillStyle = '#fff2a8'
      for (const b of s.bullets) ctx.fillRect(b.x * CELL + CELL/2 - 1, b.y * CELL, 2, 6)

      for (const c of s.centipedes) {
        for (let i = 0; i < c.length; i++) {
          const seg = c[i]
          const cx = seg.x * CELL + CELL/2
          const cy = seg.y * CELL + CELL/2
          ctx.fillStyle = seg.head ? '#a3ff9c' : '#3ba55c'
          ctx.beginPath()
          ctx.arc(cx, cy, CELL/2 - 2, 0, Math.PI*2)
          ctx.fill()
          if (seg.head) {
            ctx.fillStyle = '#111'
            ctx.beginPath(); ctx.arc(cx - 2 + seg.dir, cy - 1, 1.4, 0, Math.PI*2); ctx.fill()
            ctx.beginPath(); ctx.arc(cx + 2 + seg.dir, cy - 1, 1.4, 0, Math.PI*2); ctx.fill()
          }
        }
      }

      if (s.spider) {
        const sx = s.spider.x * CELL, sy = s.spider.y * CELL
        ctx.fillStyle = '#37e0ff'
        ctx.fillRect(sx + 3, sy + 5, 10, 6)
        ctx.strokeStyle = '#37e0ff'
        ctx.lineWidth = 1
        const legPhase = Math.floor(f / 6) % 2 ? 2 : -2
        for (const dx of [-4, -1, 1, 4]) {
          ctx.beginPath()
          ctx.moveTo(sx + 8 + dx, sy + 8)
          ctx.lineTo(sx + 8 + dx * 2, sy + 12 + legPhase)
          ctx.stroke()
        }
        ctx.fillStyle = '#fff'
        ctx.fillRect(sx + 5, sy + 6, 2, 2)
        ctx.fillRect(sx + 9, sy + 6, 2, 2)
      }

      if (s.flea) {
        const fx = s.flea.x * CELL, fy = s.flea.y * CELL
        ctx.fillStyle = '#ffcf5a'
        ctx.fillRect(fx + 5, fy + 4, 6, 8)
        ctx.fillStyle = '#fff'
        ctx.fillRect(fx + 6, fy + 5, 1, 1)
        ctx.fillRect(fx + 9, fy + 5, 1, 1)
      }

      if (s.scorpion) {
        const sx = s.scorpion.x * CELL, sy = s.scorpion.y * CELL
        ctx.fillStyle = '#c93cff'
        ctx.fillRect(sx + 2, sy + 6, 12, 4)
        ctx.fillRect(sx + 12, sy + 3, 2, 3)
      }

      const px = s.player.x * CELL, py = s.player.y * CELL
      ctx.fillStyle = '#ffe066'
      ctx.fillRect(px - 5, py - 2, 10, 4)
      ctx.fillRect(px - 3, py - 5, 6, 3)
      ctx.fillRect(px - 1, py - 8, 2, 3)

      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      for (const p of s.popups) {
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.min(1, p.ttl / 30)
        ctx.fillText(p.text, p.x * CELL + CELL/2, p.y * CELL - (30 - p.ttl) * 0.5)
      }
      ctx.globalAlpha = 1

      ctx.fillStyle = '#ffe066'
      for (let i = 0; i < s.lives - 1; i++) {
        ctx.fillRect(10 + i * 14, H - 10, 8, 4)
      }

      if (s.startCountdown > 0) {
        ctx.font = 'bold 16px monospace'
        ctx.fillStyle = '#a3ff9c'
        ctx.textAlign = 'center'
        ctx.fillText('READY!', W / 2, H / 2)
      }

      ctx.restore()

      if (s.chromatic > 1 && !reducedEl) {
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = 0.25
        ctx.fillStyle = '#ff2244'
        ctx.fillRect(0, 0, W, H)
        ctx.restore()
      }

      ctx.save()
      ctx.globalAlpha = 0.08
      ctx.fillStyle = '#000'
      for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1)
      ctx.restore()
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [status, soundOn, sfx])

  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  return (
    <GameShell
      title="Centipede"
      category="Retro"
      score={score}
      best={best}
      level={level}
      status={status}
      extraStats={
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Lives</span>
          <span className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-300">{lives}</span>
        </div>
      }
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn(v => !v)}
      onPause={() => setStatus(prev => prev === 'paused' ? 'playing' : prev === 'playing' ? 'paused' : prev)}
      onRestart={reset}
      controls={[
        { key: 'Arrows', label: 'Move' },
        { key: 'Space',  label: 'Fire' },
        { key: 'P',      label: 'Pause' },
      ]}
    >
      <div className="w-full flex items-center justify-center p-2">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-[70vh]"
          style={{ imageRendering: 'pixelated', touchAction: 'none' }}
        />
      </div>
      <div className="sm:hidden grid grid-cols-4 gap-2 p-3 border-t border-white/10 bg-white/5">
        <button type="button" onTouchStart={() => touchHold('ArrowLeft', true)}  onTouchEnd={() => touchHold('ArrowLeft', false)}  className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">←</button>
        <button type="button" onTouchStart={() => touchHold('ArrowUp', true)}    onTouchEnd={() => touchHold('ArrowUp', false)}    className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">↑</button>
        <button type="button" onTouchStart={() => touchHold('ArrowDown', true)}  onTouchEnd={() => touchHold('ArrowDown', false)}  className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">↓</button>
        <button type="button" onTouchStart={() => touchHold('ArrowRight', true)} onTouchEnd={() => touchHold('ArrowRight', false)} className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">→</button>
        <div className="col-span-4">
          <button type="button" onTouchStart={touchFire} className="w-full h-12 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-sm font-semibold active:bg-amber-500/30">FIRE</button>
        </div>
      </div>
    </GameShell>
  )
}
