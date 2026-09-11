// Frogger — cross a 5-lane road (cars, trucks) and a 5-lane river
// (logs, turtles that sink). Reach one of five home slots to score.
// Timer per life, bonus for filling all 5 homes, escalating levels.
//
// Controls:
//   • ← → ↑ ↓ / WASD    — hop
//   • Tap a canvas edge   — hop toward that edge
//   • Space               — pause (shell)
//
// Rendering: frog has jump-squash animation, cars have windshields,
// trucks have cab + trailer split, logs have grain rings, turtles
// have shell segments with flicker before sink.

import { useEffect, useRef, useState, useCallback } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const W = 640
const H = 640
const CELL = 40 // 16 × 16 grid
const COLS = W / CELL   // 16
const ROWS = H / CELL   // 16

// Row types top→bottom on a 16-tall grid:
// 0     : score/homes strip
// 1     : home lane (5 slots)
// 2-6   : river (5 lanes)
// 7     : median (grass)
// 8-12  : road (5 lanes)
// 13-15 : start / bottom safe strip

const HOME_SLOT_X = [1, 4, 7, 10, 13] // column offsets for 5 homes across cols 1..14

export default function Frogger() {
  const canvasRef = useRef(null)
  const sfx = useRef(getSfx()).current

  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [status, setStatus] = useState('playing')
  const [soundOn, setSoundOn] = useState(true)

  const stateRef = useRef({
    frog: { x: (COLS - 1) / 2 * CELL + CELL / 2, y: (ROWS - 2) * CELL + CELL / 2, dir: 0, jumpT: 0, onCarrier: null, ridingVx: 0 },
    lanes: [], // array of { row, kind: 'car'|'truck'|'log'|'turtle', dir: -1|1, speed, spacing, offset, items: [{x, phase?}] }
    homes: HOME_SLOT_X.map(() => false),
    timer: 60,
    particles: [],
    popups: [],
    shake: 0,
    reduced: false,
    animT: 0,
    diedT: 0,
    keys: {},
  })

  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const buildLanes = useCallback((lv) => {
    const lanes = []
    const speedMul = 1 + (lv - 1) * 0.12
    // Road lanes rows 8-12.
    const roadCfg = [
      { row: 8,  kind: 'truck', dir:  1, speed: 0.8 * speedMul, spacing: 5.5, w: 2 },
      { row: 9,  kind: 'car',   dir: -1, speed: 1.4 * speedMul, spacing: 4,   w: 1 },
      { row: 10, kind: 'car',   dir:  1, speed: 1.9 * speedMul, spacing: 4.5, w: 1 },
      { row: 11, kind: 'truck', dir: -1, speed: 1.0 * speedMul, spacing: 6,   w: 2 },
      { row: 12, kind: 'car',   dir:  1, speed: 2.2 * speedMul, spacing: 3.5, w: 1 },
    ]
    // River lanes rows 2-6.
    const riverCfg = [
      { row: 2, kind: 'log',    dir: -1, speed: 1.0 * speedMul, spacing: 5, w: 3 },
      { row: 3, kind: 'turtle', dir:  1, speed: 0.9 * speedMul, spacing: 3.4, w: 1 },
      { row: 4, kind: 'log',    dir:  1, speed: 1.4 * speedMul, spacing: 5.5, w: 4 },
      { row: 5, kind: 'turtle', dir: -1, speed: 1.0 * speedMul, spacing: 3, w: 1 },
      { row: 6, kind: 'log',    dir: -1, speed: 1.2 * speedMul, spacing: 4.5, w: 3 },
    ]
    for (const c of [...roadCfg, ...riverCfg]) {
      const items = []
      const gap = c.spacing * CELL
      const count = Math.ceil(W / gap) + 2
      for (let i = 0; i < count; i++) {
        items.push({
          x: c.dir === 1 ? -i * gap : W + i * gap,
          w: c.w * CELL,
          phase: Math.random() * Math.PI * 2,
        })
      }
      lanes.push({ ...c, items })
    }
    stateRef.current.lanes = lanes
  }, [])

  const resetFrog = useCallback(() => {
    stateRef.current.frog = {
      x: (COLS - 1) / 2 * CELL + CELL / 2,
      y: (ROWS - 2) * CELL + CELL / 2,
      dir: 0, jumpT: 0, onCarrier: null, ridingVx: 0,
    }
    stateRef.current.timer = 60
  }, [])

  const reset = useCallback(() => {
    setScore(0); setLives(3); setLevel(1); setStatus('playing')
    stateRef.current.homes = HOME_SLOT_X.map(() => false)
    buildLanes(1)
    resetFrog()
  }, [buildLanes, resetFrog])

  useEffect(() => { buildLanes(1); resetFrog() }, [buildLanes, resetFrog])

  const hop = useCallback((dx, dy) => {
    const s = stateRef.current
    if (s.frog.jumpT > 0 || s.diedT > 0) return
    const nx = s.frog.x + dx * CELL
    const ny = s.frog.y + dy * CELL
    if (nx < CELL / 2 || nx > W - CELL / 2) return
    if (ny < CELL / 2 || ny > H - CELL / 2) return
    s.frog.x = nx; s.frog.y = ny
    s.frog.dir = dx === 1 ? 0 : dx === -1 ? Math.PI : dy === -1 ? -Math.PI / 2 : Math.PI / 2
    s.frog.jumpT = 8
    s.frog.onCarrier = null
    sfx.jump()
    // Score for forward.
    if (dy === -1) setScore((v) => v + 10)
  }, [sfx])

  // Keyboard.
  useEffect(() => {
    const kd = (e) => {
      if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') { hop(0, -1); e.preventDefault() }
      if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') { hop(0,  1); e.preventDefault() }
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') { hop(-1, 0); e.preventDefault() }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { hop( 1, 0); e.preventDefault() }
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
  }, [hop])

  // Touch — tap a canvas edge.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const tap = (e) => {
      const rect = canvas.getBoundingClientRect()
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      const x = (clientX - rect.left) / rect.width * W
      const y = (clientY - rect.top) / rect.height * H
      const dx = x - stateRef.current.frog.x
      const dy = y - stateRef.current.frog.y
      if (Math.abs(dx) > Math.abs(dy)) hop(Math.sign(dx), 0)
      else hop(0, Math.sign(dy))
    }
    canvas.addEventListener('mousedown', tap)
    canvas.addEventListener('touchstart', tap, { passive: false })
    return () => {
      canvas.removeEventListener('mousedown', tap)
      canvas.removeEventListener('touchstart', tap)
    }
  }, [hop])

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
        const v = 0.5 + Math.random() * spd
        s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: 0.02 + Math.random() * 0.03, size: 1 + Math.random() * 2, color })
      }
    }
    const shake = (v) => {
      if (stateRef.current.reduced) return
      stateRef.current.shake = Math.min(20, stateRef.current.shake + v)
    }
    const popup = (x, y, text, color) => stateRef.current.popups.push({ x, y, t: 1, text, color: color || '#fef3c7' })

    const die = (reason) => {
      const s = stateRef.current
      if (s.diedT > 0) return
      s.diedT = 60
      spawnParticles(s.frog.x, s.frog.y, reason === 'water' ? '#38bdf8' : '#f43f5e', 30, 3)
      shake(6)
      sfx.death()
    }

    const tick = (now) => {
      let dt = (now - last) / 16.666; last = now
      if (dt > 3) dt = 3
      const s = stateRef.current

      if (status === 'playing') {
        s.animT += dt

        // Lanes update.
        for (const lane of s.lanes) {
          const dxTot = lane.dir * lane.speed * dt
          for (const it of lane.items) {
            it.x += dxTot
            if (it.phase !== undefined) it.phase += 0.06 * dt
            // Wrap.
            if (lane.dir > 0 && it.x > W + it.w) it.x -= (lane.items.length * lane.spacing * CELL)
            if (lane.dir < 0 && it.x + it.w < 0) it.x += (lane.items.length * lane.spacing * CELL)
          }
        }

        if (s.frog.jumpT > 0) s.frog.jumpT -= dt
        if (s.diedT > 0) {
          s.diedT -= dt
          if (s.diedT <= 0) {
            setLives((v) => {
              const nl = v - 1
              if (nl <= 0) setStatus('over')
              else resetFrog()
              return nl
            })
          }
        }

        // Collision + carrier detection.
        if (s.diedT <= 0) {
          const row = Math.floor(s.frog.y / CELL)
          const lane = s.lanes.find((l) => l.row === row)
          const inRiver = row >= 2 && row <= 6
          const inRoad  = row >= 8 && row <= 12
          const homeRow = row === 1

          s.frog.onCarrier = null
          s.frog.ridingVx = 0
          if (lane) {
            for (const it of lane.items) {
              if (lane.kind === 'turtle') {
                // Draw as 3 turtle heads horizontally. Sink when phase in a specific window.
                const heads = 3
                for (let h = 0; h < heads; h++) {
                  const hx = it.x + h * CELL
                  const sinking = Math.sin(it.phase - h * 0.5) < -0.7
                  if (!sinking && Math.abs(s.frog.x - (hx + CELL / 2)) < CELL / 2 && s.frog.jumpT <= 0) {
                    s.frog.onCarrier = { x: hx, w: CELL }
                    s.frog.ridingVx = lane.dir * lane.speed
                  }
                }
              } else {
                const rx = it.x
                const rw = it.w
                const overlap = s.frog.x > rx && s.frog.x < rx + rw
                if (overlap) {
                  if (lane.kind === 'log') {
                    s.frog.onCarrier = { x: rx, w: rw }
                    s.frog.ridingVx = lane.dir * lane.speed
                  } else if (inRoad) {
                    die('hit')
                    break
                  }
                }
              }
            }
          }
          if (inRiver && !s.frog.onCarrier && s.frog.jumpT <= 0) {
            die('water')
          }
          if (s.frog.onCarrier) {
            s.frog.x += s.frog.ridingVx * dt
            if (s.frog.x < CELL / 2 || s.frog.x > W - CELL / 2) die('water')
          }

          // Home row.
          if (homeRow) {
            let landed = -1
            for (let i = 0; i < HOME_SLOT_X.length; i++) {
              const sx = HOME_SLOT_X[i] * CELL + CELL / 2
              if (Math.abs(s.frog.x - sx) < CELL / 2 - 4 && !s.homes[i]) {
                landed = i; break
              }
            }
            if (landed >= 0) {
              s.homes[landed] = true
              const bonus = 100 + Math.floor(s.timer) * 10
              setScore((v) => v + bonus)
              popup(HOME_SLOT_X[landed] * CELL + CELL / 2, CELL + 20, `+${bonus}`, '#a3e635')
              sfx.win()
              spawnParticles(HOME_SLOT_X[landed] * CELL + CELL / 2, CELL + 20, '#4ade80', 24, 3)
              if (s.homes.every(Boolean)) {
                setScore((v) => v + 1000)
                popup(W / 2, H / 2, '+1000 ALL HOMES', '#fde68a')
                setLevel((l) => {
                  const nl = l + 1
                  buildLanes(nl)
                  return nl
                })
                s.homes = HOME_SLOT_X.map(() => false)
                sfx.win()
              }
              resetFrog()
            } else {
              // Landed on wall — dies.
              die('wall')
            }
          }
        }

        // Timer.
        s.timer -= dt / 60
        if (s.timer <= 0) die('time')

        s.particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.06 * dt; p.life -= p.decay * dt })
        s.particles = s.particles.filter((p) => p.life > 0)
        s.popups.forEach((p) => { p.y -= 0.6 * dt; p.t -= 0.014 * dt })
        s.popups = s.popups.filter((p) => p.t > 0)
        s.shake *= Math.pow(0.86, dt)
      }

      // ─── render ───
      ctx.clearRect(0, 0, W, H)

      const shakeX = s.shake ? (Math.random() - 0.5) * s.shake : 0
      const shakeY = s.shake ? (Math.random() - 0.5) * s.shake : 0
      ctx.save()
      ctx.translate(shakeX, shakeY)

      // Rows.
      // Row 0 (HUD strip).
      ctx.fillStyle = '#0a0a0e'
      ctx.fillRect(0, 0, W, CELL)
      // Row 1 (home).
      ctx.fillStyle = '#052e16'
      ctx.fillRect(0, CELL, W, CELL)
      // Draw home slots.
      for (let i = 0; i < HOME_SLOT_X.length; i++) {
        const x = HOME_SLOT_X[i] * CELL
        // Grass ledges around each slot area.
        ctx.fillStyle = '#166534'
        ctx.fillRect(x - CELL, CELL, CELL, CELL) // walls
        ctx.fillRect(x + CELL, CELL, CELL, CELL)
        // Home hole.
        ctx.fillStyle = s.homes[i] ? '#4ade80' : '#0f172a'
        ctx.fillRect(x, CELL, CELL, CELL)
        if (s.homes[i]) {
          // Occupied frog silhouette.
          ctx.fillStyle = '#166534'
          ctx.beginPath()
          ctx.arc(x + CELL / 2, CELL + CELL / 2, CELL * 0.32, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      // River (rows 2..6).
      const riverGrad = ctx.createLinearGradient(0, 2 * CELL, 0, 7 * CELL)
      riverGrad.addColorStop(0, '#1e40af'); riverGrad.addColorStop(1, '#1e3a8a')
      ctx.fillStyle = riverGrad
      ctx.fillRect(0, 2 * CELL, W, 5 * CELL)
      // River waves.
      ctx.strokeStyle = 'rgba(96,165,250,0.35)'
      for (let r = 2; r <= 6; r++) {
        for (let x = 0; x < W; x += 30) {
          const yy = r * CELL + CELL / 2 + Math.sin((x + s.animT * 4) * 0.05) * 3
          ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + 15, yy); ctx.stroke()
        }
      }
      // Median (row 7).
      ctx.fillStyle = '#166534'
      ctx.fillRect(0, 7 * CELL, W, CELL)
      // Road (rows 8..12).
      ctx.fillStyle = '#1f2937'
      ctx.fillRect(0, 8 * CELL, W, 5 * CELL)
      // Lane dashed lines.
      ctx.strokeStyle = '#fbbf24'
      ctx.setLineDash([12, 10])
      for (let r = 8; r < 13; r++) {
        ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(W, r * CELL); ctx.stroke()
      }
      ctx.setLineDash([])
      // Start strip (row 13..15).
      ctx.fillStyle = '#14532d'
      ctx.fillRect(0, 13 * CELL, W, 3 * CELL)

      // Lane items.
      for (const lane of s.lanes) {
        const yTop = lane.row * CELL
        for (const it of lane.items) {
          if (lane.kind === 'car') {
            // Body + windshield + wheels.
            const bx = it.x, by = yTop + 6, bw = it.w, bh = CELL - 12
            const carColor = lane.dir > 0 ? '#f97316' : '#ef4444'
            const g = ctx.createLinearGradient(bx, by, bx, by + bh)
            g.addColorStop(0, carColor); g.addColorStop(1, '#7c2d12')
            ctx.fillStyle = g
            ctx.fillRect(bx, by, bw, bh)
            ctx.fillStyle = '#0ea5e9'
            ctx.fillRect(bx + (lane.dir > 0 ? bw - 12 : 4), by + 4, 8, bh - 8)
            ctx.fillStyle = '#000'
            ctx.beginPath(); ctx.arc(bx + 6, by + bh, 3, 0, Math.PI * 2); ctx.fill()
            ctx.beginPath(); ctx.arc(bx + bw - 6, by + bh, 3, 0, Math.PI * 2); ctx.fill()
          } else if (lane.kind === 'truck') {
            const bx = it.x, by = yTop + 4, bw = it.w, bh = CELL - 8
            // Cab.
            const cabX = lane.dir > 0 ? bx + bw - CELL + 4 : bx + 4
            ctx.fillStyle = '#e11d48'
            ctx.fillRect(cabX, by, CELL - 8, bh)
            ctx.fillStyle = '#0ea5e9'
            ctx.fillRect(cabX + 4, by + 3, CELL - 16, bh - 6)
            // Trailer.
            const trX = lane.dir > 0 ? bx : bx + CELL
            const trW = bw - CELL
            ctx.fillStyle = '#fef3c7'
            ctx.fillRect(trX, by, trW, bh)
            ctx.strokeStyle = '#b45309'
            ctx.strokeRect(trX, by, trW, bh)
            ctx.fillStyle = '#000'
            ctx.beginPath(); ctx.arc(bx + 6, by + bh, 3, 0, Math.PI * 2); ctx.fill()
            ctx.beginPath(); ctx.arc(bx + bw - 6, by + bh, 3, 0, Math.PI * 2); ctx.fill()
          } else if (lane.kind === 'log') {
            const bx = it.x, by = yTop + 6, bw = it.w, bh = CELL - 12
            const g = ctx.createLinearGradient(bx, by, bx, by + bh)
            g.addColorStop(0, '#a16207'); g.addColorStop(1, '#4a2f0e')
            ctx.fillStyle = g
            ctx.fillRect(bx, by, bw, bh)
            ctx.strokeStyle = '#78350f'
            for (let i = 8; i < bw; i += 16) {
              ctx.beginPath(); ctx.moveTo(bx + i, by); ctx.lineTo(bx + i, by + bh); ctx.stroke()
            }
            // End rings.
            ctx.fillStyle = '#78350f'
            ctx.beginPath(); ctx.arc(bx + 5, by + bh / 2, 4, 0, Math.PI * 2); ctx.fill()
            ctx.beginPath(); ctx.arc(bx + bw - 5, by + bh / 2, 4, 0, Math.PI * 2); ctx.fill()
          } else if (lane.kind === 'turtle') {
            // Three heads in a row.
            for (let h = 0; h < 3; h++) {
              const hx = it.x + h * CELL + CELL / 2
              const hy = yTop + CELL / 2
              const sinking = Math.sin(it.phase - h * 0.5) < -0.7
              const flickering = !sinking && Math.sin(it.phase - h * 0.5) < -0.4
              if (sinking) continue
              ctx.save()
              if (flickering) ctx.globalAlpha = 0.5
              // Shell.
              const shellR = CELL * 0.4
              const g = ctx.createRadialGradient(hx, hy - 3, 2, hx, hy, shellR)
              g.addColorStop(0, '#a3e635'); g.addColorStop(1, '#365314')
              ctx.fillStyle = g
              ctx.beginPath(); ctx.arc(hx, hy, shellR, 0, Math.PI * 2); ctx.fill()
              // Shell segments.
              ctx.strokeStyle = '#065f46'
              for (let a = 0; a < 6; a++) {
                const ang = a / 6 * Math.PI * 2
                ctx.beginPath()
                ctx.moveTo(hx + Math.cos(ang) * 4, hy + Math.sin(ang) * 4)
                ctx.lineTo(hx + Math.cos(ang) * shellR, hy + Math.sin(ang) * shellR)
                ctx.stroke()
              }
              // Head + feet dots.
              ctx.fillStyle = '#22c55e'
              ctx.beginPath()
              ctx.arc(hx + (lane.dir > 0 ? shellR : -shellR), hy, 4, 0, Math.PI * 2)
              ctx.fill()
              ctx.restore()
            }
          }
        }
      }

      // Frog.
      if (s.diedT <= 0) {
        const squash = s.frog.jumpT > 0 ? 1 + Math.sin((1 - s.frog.jumpT / 8) * Math.PI) * 0.2 : 1
        ctx.save()
        ctx.translate(s.frog.x, s.frog.y)
        ctx.rotate(s.frog.dir)
        ctx.scale(1 / squash, squash)
        const g = ctx.createRadialGradient(0, -2, 2, 0, 0, CELL * 0.4)
        g.addColorStop(0, '#a3e635'); g.addColorStop(1, '#166534')
        ctx.fillStyle = g
        // Body.
        ctx.beginPath(); ctx.ellipse(0, 0, CELL * 0.34, CELL * 0.30, 0, 0, Math.PI * 2); ctx.fill()
        // Head bumps + eyes.
        ctx.fillStyle = '#a3e635'
        ctx.beginPath(); ctx.arc(CELL * 0.22, -CELL * 0.15, CELL * 0.10, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(CELL * 0.22, CELL * 0.15,  CELL * 0.10, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#000'
        ctx.beginPath(); ctx.arc(CELL * 0.26, -CELL * 0.15, 2, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(CELL * 0.26, CELL * 0.15,  2, 0, Math.PI * 2); ctx.fill()
        // Back legs.
        ctx.strokeStyle = '#166534'
        ctx.lineWidth = 3
        ctx.beginPath(); ctx.moveTo(-CELL * 0.24, -CELL * 0.18); ctx.lineTo(-CELL * 0.36, -CELL * 0.30); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(-CELL * 0.24, CELL * 0.18);  ctx.lineTo(-CELL * 0.36, CELL * 0.30);  ctx.stroke()
        ctx.restore()
      } else {
        // Splash / death star.
        const t = 1 - s.diedT / 60
        ctx.strokeStyle = '#f43f5e'
        ctx.lineWidth = 2
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2
          ctx.beginPath()
          ctx.moveTo(s.frog.x + Math.cos(a) * 4, s.frog.y + Math.sin(a) * 4)
          ctx.lineTo(s.frog.x + Math.cos(a) * (10 + t * 14), s.frog.y + Math.sin(a) * (10 + t * 14))
          ctx.stroke()
        }
      }

      // Particles.
      for (const p of s.particles) {
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      }
      ctx.globalAlpha = 1

      // Popups.
      for (const pu of s.popups) {
        ctx.globalAlpha = Math.max(0, pu.t)
        ctx.fillStyle = pu.color
        ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'
        ctx.fillText(pu.text, pu.x, pu.y)
      }
      ctx.globalAlpha = 1

      // HUD strip.
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'left'
      ctx.fillText(`TIME`, 12, 24)
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.fillRect(60, 14, 200, 12)
      ctx.fillStyle = s.timer > 20 ? '#22c55e' : s.timer > 10 ? '#f59e0b' : '#ef4444'
      ctx.fillRect(60, 14, 200 * Math.max(0, s.timer / 60), 12)
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'right'
      ctx.fillText(`LIVES ${lives}   LV ${level}`, W - 12, 24)

      ctx.restore()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [status, level, lives, buildLanes, resetFrog, sfx])

  return (
    <GameShell
      slug="frogger"
      title="Frogger"
      category="Arcade"
      score={score} level={level} status={status}
      extraStats={<div className="flex flex-col items-start"><span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Lives</span><span className="font-poppins font-black tabular-nums text-lg sm:text-xl text-emerald-300">{lives}</span></div>}
      soundOn={soundOn} onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={reset}
      onPause={() => setStatus((v) => v === 'paused' ? 'playing' : (v === 'playing' ? 'paused' : v))}
      controls={[
        { key: '↑ ↓ ← →', label: 'Hop' },
        { key: 'Tap edge', label: 'Touch to hop' },
        { key: 'Space', label: 'Pause' },
      ]}
      subtitle="Five road lanes, five river lanes, five homes. Turtles sink. Timer bar drains. Bonus for a full row of homes."
    >
      <canvas ref={canvasRef} width={W} height={H} className="w-full h-auto max-h-[82vh] block bg-black" />
    </GameShell>
  )
}
