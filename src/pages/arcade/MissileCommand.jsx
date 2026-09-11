// Missile Command — 6 defended cities, incoming ICBMs from above,
// cursor-aim + click-to-launch counter-missiles from 3 silos. MIRVs
// split, smart bombs dodge counter-missile blasts, ammo management.
//
// Controls:
//   • Mouse / touch — aim
//   • Click / tap   — fire counter missile from nearest silo with ammo
//   • Q / A / E     — force fire from left / mid / right silo (with mouse aim)
//   • Space         — pause (shell)
//
// Every missile is a warhead + smoke trail (not a stick line). Cities
// have skyline silhouettes.  Silos have visible ammo bar.

import { useEffect, useRef, useState, useCallback } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const W = 800
const H = 600
const GROUND_Y = H - 60
const SILO_POS = [80, W / 2, W - 80]

const cityOffsets = [
  160, 240, 340, // left cluster
  460, 560, 660, // right cluster
]

const rand = (a, b) => a + Math.random() * (b - a)

export default function MissileCommand() {
  const canvasRef = useRef(null)
  const sfx = useRef(getSfx()).current

  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [status, setStatus] = useState('playing')
  const [soundOn, setSoundOn] = useState(true)

  const stateRef = useRef({
    cities: cityOffsets.map((x) => ({ x, alive: true, burn: 0 })),
    silos: SILO_POS.map((x) => ({ x, ammo: 10, alive: true })),
    icbms: [], // { x1,y1, x2,y2, x,y, vx,vy, mirv, smart, life }
    counters: [], // { x, y, targetX, targetY, vx, vy, exploded, radius, maxR }
    explosions: [], // { x, y, r, maxR, life, from, hue }
    particles: [],
    popups: [],
    shake: 0,
    aimX: W / 2, aimY: H / 2,
    waveIcbms: 0,
    waveTimer: 40,
    waveActive: false,
    spawnTimer: 0,
    reduced: false,
  })

  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const startWave = useCallback((lv) => {
    const s = stateRef.current
    s.waveIcbms = 8 + lv * 3
    s.waveTimer = 30
    s.waveActive = true
    s.spawnTimer = 0
    s.silos.forEach((si) => { si.ammo = 10; si.alive = true })
  }, [])

  const reset = useCallback(() => {
    setScore(0); setLevel(1); setStatus('playing')
    stateRef.current.cities = cityOffsets.map((x) => ({ x, alive: true, burn: 0 }))
    stateRef.current.silos = SILO_POS.map((x) => ({ x, ammo: 10, alive: true }))
    stateRef.current.icbms = []
    stateRef.current.counters = []
    stateRef.current.explosions = []
    stateRef.current.particles = []
    startWave(1)
  }, [startWave])

  useEffect(() => { startWave(1) }, [startWave])

  // Pointer input on canvas.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = stateRef.current
    const toCanvas = (e) => {
      const rect = canvas.getBoundingClientRect()
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      return { x: (clientX - rect.left) / rect.width * W, y: (clientY - rect.top) / rect.height * H }
    }
    const move = (e) => {
      const { x, y } = toCanvas(e)
      s.aimX = x; s.aimY = y
    }
    const launch = (silo) => {
      if (!silo || !silo.alive || silo.ammo <= 0) { sfx.beep({ freq: 200, dur: 0.06, gain: 0.04 }); return }
      silo.ammo -= 1
      const dx = s.aimX - silo.x
      const dy = s.aimY - (GROUND_Y - 4)
      const dist = Math.hypot(dx, dy) || 1
      const vx = dx / dist * 6.4
      const vy = dy / dist * 6.4
      s.counters.push({
        x: silo.x, y: GROUND_Y - 4,
        targetX: s.aimX, targetY: s.aimY,
        vx, vy, exploded: false, radius: 0, maxR: 42, life: 200, hue: 200,
      })
      sfx.pop()
    }
    const nearestSilo = () => {
      let best = null, bestDist = Infinity
      for (const si of s.silos) {
        if (!si.alive || si.ammo <= 0) continue
        const d = Math.abs(si.x - s.aimX)
        if (d < bestDist) { bestDist = d; best = si }
      }
      return best
    }
    const down = (e) => {
      e.preventDefault()
      const { x, y } = toCanvas(e)
      s.aimX = x; s.aimY = y
      launch(nearestSilo())
    }
    canvas.addEventListener('mousemove', move)
    canvas.addEventListener('touchmove', move, { passive: false })
    canvas.addEventListener('mousedown', down)
    canvas.addEventListener('touchstart', down, { passive: false })

    // Keyboard silo shortcuts.
    const kd = (e) => {
      if (e.key === 'q' || e.key === 'Q') launch(s.silos[0])
      if (e.key === 'a' || e.key === 'A') launch(s.silos[1])
      if (e.key === 'e' || e.key === 'E') launch(s.silos[2])
    }
    window.addEventListener('keydown', kd)
    return () => {
      canvas.removeEventListener('mousemove', move)
      canvas.removeEventListener('touchmove', move)
      canvas.removeEventListener('mousedown', down)
      canvas.removeEventListener('touchstart', down)
      window.removeEventListener('keydown', kd)
    }
  }, [sfx])

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

    const spawnICBM = (lv) => {
      const s = stateRef.current
      const x1 = Math.random() * W
      const y1 = -20
      // Target city or silo.
      const targets = [
        ...s.cities.filter((c) => c.alive).map((c) => ({ x: c.x, y: GROUND_Y - 20 })),
        ...s.silos.filter((si) => si.alive).map((si) => ({ x: si.x, y: GROUND_Y - 4 })),
      ]
      const t = targets[Math.floor(Math.random() * Math.max(1, targets.length))] || { x: W / 2, y: GROUND_Y }
      const dx = t.x - x1
      const dy = t.y - y1
      const dist = Math.hypot(dx, dy) || 1
      const speed = 0.7 + lv * 0.1
      const smart = lv >= 3 && Math.random() < 0.15
      const mirv = lv >= 2 && Math.random() < 0.2 ? 3 : 0
      s.icbms.push({
        x1, y1, x2: t.x, y2: t.y,
        x: x1, y: y1,
        vx: dx / dist * speed, vy: dy / dist * speed,
        mirv, smart, life: 0,
        trail: [],
      })
    }

    const tick = (now) => {
      let dt = (now - last) / 16.666; last = now
      if (dt > 3) dt = 3
      const s = stateRef.current

      if (status === 'playing') {
        // Wave pacing.
        if (s.waveActive) {
          s.spawnTimer -= dt
          if (s.spawnTimer <= 0 && s.waveIcbms > 0) {
            spawnICBM(level)
            s.waveIcbms -= 1
            s.spawnTimer = Math.max(15, 60 - level * 3) - Math.random() * 30
          }
          const noneLeft = s.waveIcbms <= 0 && s.icbms.length === 0
          if (noneLeft) {
            s.waveActive = false
            // Wave bonus.
            const cityBonus = s.cities.filter((c) => c.alive).length * 100
            const ammoBonus = s.silos.reduce((sum, si) => sum + (si.alive ? si.ammo * 5 : 0), 0)
            setScore((v) => v + cityBonus + ammoBonus)
            popup(W / 2, H / 2, `+${cityBonus + ammoBonus} BONUS`, '#a3e635')
            sfx.win()
            setTimeout(() => {
              setLevel((l) => {
                const nl = l + 1
                startWave(nl)
                return nl
              })
            }, 1200)
          }
        }

        // ICBMs.
        for (const icbm of s.icbms) {
          if (icbm.smart) {
            // Steer around explosions.
            let ax = 0, ay = 0
            for (const ex of s.explosions) {
              if (!ex.exploded) continue
              const dx = icbm.x - ex.x
              const dy = icbm.y - ex.y
              const d = Math.hypot(dx, dy) || 1
              if (d < ex.radius * 2.2) {
                ax += (dx / d) * 0.06
                ay += (dy / d) * 0.03
              }
            }
            icbm.vx += ax * dt; icbm.vy += ay * dt
          }
          icbm.x += icbm.vx * dt
          icbm.y += icbm.vy * dt
          icbm.life += dt
          icbm.trail.push({ x: icbm.x, y: icbm.y })
          if (icbm.trail.length > 40) icbm.trail.shift()
          // MIRV split at mid-air.
          if (icbm.mirv > 0 && icbm.y > 200 + Math.random() * 60) {
            for (let i = 0; i < icbm.mirv; i++) {
              const t = s.cities.filter((c) => c.alive)
              const tgt = t.length ? t[Math.floor(Math.random() * t.length)] : { x: rand(60, W - 60) }
              const dx = tgt.x - icbm.x
              const dy = GROUND_Y - icbm.y
              const dist = Math.hypot(dx, dy) || 1
              const spd = 0.9 + level * 0.1
              s.icbms.push({
                x1: icbm.x, y1: icbm.y, x2: tgt.x, y2: GROUND_Y,
                x: icbm.x, y: icbm.y,
                vx: dx / dist * spd, vy: dy / dist * spd,
                mirv: 0, smart: icbm.smart, life: 0,
                trail: [],
              })
            }
            icbm.mirv = 0
            icbm.dead = true
            spawnParticles(icbm.x, icbm.y, '#f0abfc', 12, 2)
            sfx.chirp()
          }
        }
        s.icbms = s.icbms.filter((i) => {
          if (i.dead) return false
          if (i.y > GROUND_Y) {
            // Hit ground.
            let hit = false
            for (const c of s.cities) {
              if (c.alive && Math.abs(c.x - i.x) < 30) { c.alive = false; c.burn = 60; hit = true; break }
            }
            if (!hit) {
              for (const si of s.silos) {
                if (si.alive && Math.abs(si.x - i.x) < 30) { si.alive = false; si.ammo = 0; hit = true; break }
              }
            }
            s.explosions.push({ x: i.x, y: GROUND_Y - 6, r: 0, maxR: 40, life: 60, exploded: true, from: 'icbm', hue: 350 })
            spawnParticles(i.x, GROUND_Y - 6, '#f43f5e', 30, 4)
            shake(6)
            sfx.boom()
            return false
          }
          return true
        })

        // Counter missiles.
        for (const c of s.counters) {
          if (c.exploded) continue
          c.x += c.vx * dt; c.y += c.vy * dt
          const dx = c.x - c.targetX
          const dy = c.y - c.targetY
          const passed = (Math.sign(c.vx) === Math.sign(dx) || Math.abs(dx) < 3) &&
                         (Math.sign(c.vy) === Math.sign(dy) || Math.abs(dy) < 3)
          if (passed) {
            c.exploded = true
            s.explosions.push({ x: c.x, y: c.y, r: 0, maxR: c.maxR, life: 40, exploded: true, from: 'counter', hue: 200 })
            spawnParticles(c.x, c.y, '#22d3ee', 26, 3)
            shake(2)
            sfx.boom()
          }
        }
        s.counters = s.counters.filter((c) => !c.exploded)

        // Explosions grow, damage nearby ICBMs.
        for (const ex of s.explosions) {
          ex.life -= dt
          const t = 1 - ex.life / 40
          ex.r = ex.maxR * Math.sin(Math.min(1, t) * Math.PI)
          if (ex.from === 'counter' && ex.life > 0) {
            for (let i = s.icbms.length - 1; i >= 0; i--) {
              const im = s.icbms[i]
              if (Math.hypot(im.x - ex.x, im.y - ex.y) < ex.r) {
                s.icbms.splice(i, 1)
                spawnParticles(im.x, im.y, im.smart ? '#f0abfc' : '#fbbf24', 24, 3)
                shake(2)
                const pts = im.smart ? 50 : 25
                setScore((v) => v + pts)
                popup(im.x, im.y, `+${pts}`, im.smart ? '#f0abfc' : '#fde68a')
                sfx.boom()
              }
            }
          }
        }
        s.explosions = s.explosions.filter((ex) => ex.life > 0)

        // City burning.
        s.cities.forEach((c) => { if (c.burn > 0) c.burn -= dt })

        // Game over: no cities.
        if (!s.cities.some((c) => c.alive)) {
          setStatus('over'); sfx.death()
        }

        s.particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.06 * dt; p.life -= p.decay * dt })
        s.particles = s.particles.filter((p) => p.life > 0)
        s.popups.forEach((p) => { p.y -= 0.6 * dt; p.t -= 0.014 * dt })
        s.popups = s.popups.filter((p) => p.t > 0)
        s.shake *= Math.pow(0.86, dt)
      }

      // ─── render ───
      ctx.clearRect(0, 0, W, H)
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#0a0a1e'); bg.addColorStop(0.7, '#180a1e'); bg.addColorStop(1, '#000')
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
      // Stars.
      ctx.fillStyle = '#fff'
      for (let i = 0; i < 60; i++) {
        const x = (i * 137) % W, y = (i * 91) % (GROUND_Y - 40)
        ctx.globalAlpha = 0.35 + ((i * 7) % 5) / 12
        ctx.fillRect(x, y, 1, 1)
      }
      ctx.globalAlpha = 1

      const shakeX = s.shake ? (Math.random() - 0.5) * s.shake : 0
      const shakeY = s.shake ? (Math.random() - 0.5) * s.shake : 0
      ctx.save()
      ctx.translate(shakeX, shakeY)

      // Ground.
      const grad = ctx.createLinearGradient(0, GROUND_Y, 0, H)
      grad.addColorStop(0, '#374151'); grad.addColorStop(1, '#111827')
      ctx.fillStyle = grad
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)
      ctx.strokeStyle = '#94a3b8'
      ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke()

      // Cities.
      for (const c of s.cities) {
        if (c.alive) {
          // Skyline: 5 rects of varying heights.
          const seed = c.x
          for (let i = -2; i <= 2; i++) {
            const h = 18 + ((seed + i * 13) % 22)
            const bx = c.x + i * 8 - 4
            const by = GROUND_Y - h
            const g = ctx.createLinearGradient(bx, by, bx, GROUND_Y)
            g.addColorStop(0, '#f0abfc'); g.addColorStop(1, '#5b21b6')
            ctx.fillStyle = g
            ctx.fillRect(bx, by, 6, h)
            // window dots
            ctx.fillStyle = '#fef3c7'
            for (let wy = by + 4; wy < GROUND_Y - 2; wy += 6) {
              ctx.fillRect(bx + 1, wy, 1, 1)
              ctx.fillRect(bx + 3, wy, 1, 1)
            }
          }
        } else {
          // Rubble.
          ctx.fillStyle = '#4b5563'
          ctx.fillRect(c.x - 14, GROUND_Y - 5, 28, 5)
          if (c.burn > 0) {
            spawnParticles(c.x + rand(-10, 10), GROUND_Y - 6, '#f97316', 1, 1)
          }
        }
      }

      // Silos.
      for (const si of s.silos) {
        if (si.alive) {
          ctx.fillStyle = '#65a30d'
          ctx.beginPath()
          ctx.moveTo(si.x - 18, GROUND_Y)
          ctx.lineTo(si.x - 12, GROUND_Y - 18)
          ctx.lineTo(si.x + 12, GROUND_Y - 18)
          ctx.lineTo(si.x + 18, GROUND_Y)
          ctx.closePath()
          ctx.fill()
          // Missiles stacked.
          for (let i = 0; i < si.ammo; i++) {
            const mx = si.x - 8 + (i % 5) * 4
            const my = GROUND_Y - 6 - Math.floor(i / 5) * 4
            ctx.fillStyle = '#fef3c7'
            ctx.fillRect(mx, my, 2, 3)
          }
          // Ammo bar.
          ctx.fillStyle = 'rgba(255,255,255,0.2)'
          ctx.fillRect(si.x - 18, GROUND_Y + 4, 36, 4)
          ctx.fillStyle = si.ammo > 3 ? '#22c55e' : '#f97316'
          ctx.fillRect(si.x - 18, GROUND_Y + 4, 36 * (si.ammo / 10), 4)
        } else {
          ctx.fillStyle = '#4b5563'
          ctx.fillRect(si.x - 18, GROUND_Y - 4, 36, 4)
        }
      }

      // Counter missiles + trail.
      for (const c of s.counters) {
        ctx.strokeStyle = 'rgba(34,211,238,0.4)'
        ctx.beginPath(); ctx.moveTo(SILO_POS.find((sx) => Math.abs(sx - c.x) < 300) || c.x, GROUND_Y - 4); ctx.lineTo(c.x, c.y); ctx.stroke()
        // Warhead.
        ctx.fillStyle = '#22d3ee'
        ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2); ctx.fill()
      }

      // ICBMs (smoke trail + warhead).
      for (const im of s.icbms) {
        ctx.strokeStyle = im.smart ? 'rgba(240,171,252,0.7)' : 'rgba(248,113,113,0.6)'
        ctx.lineWidth = 2
        ctx.beginPath()
        for (let i = 0; i < im.trail.length; i++) {
          const t = im.trail[i]
          if (i === 0) ctx.moveTo(t.x, t.y)
          else ctx.lineTo(t.x, t.y)
        }
        ctx.stroke()
        // Warhead.
        ctx.fillStyle = im.smart ? '#f0abfc' : '#f87171'
        ctx.beginPath(); ctx.arc(im.x, im.y, im.smart ? 4 : 3, 0, Math.PI * 2); ctx.fill()
        // Fins.
        ctx.strokeStyle = '#fff'
        ctx.beginPath()
        ctx.moveTo(im.x - im.vx * 3, im.y - im.vy * 3)
        ctx.lineTo(im.x + im.vy * 2, im.y - im.vx * 2)
        ctx.moveTo(im.x - im.vx * 3, im.y - im.vy * 3)
        ctx.lineTo(im.x - im.vy * 2, im.y + im.vx * 2)
        ctx.stroke()
      }
      ctx.lineWidth = 1

      // Explosions.
      for (const ex of s.explosions) {
        const grad = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, Math.max(1, ex.r))
        if (ex.from === 'counter') {
          grad.addColorStop(0, 'rgba(34,211,238,0.9)')
          grad.addColorStop(0.5, 'rgba(56,189,248,0.6)')
          grad.addColorStop(1, 'rgba(2,132,199,0)')
        } else {
          grad.addColorStop(0, 'rgba(254,240,138,0.95)')
          grad.addColorStop(0.5, 'rgba(244,63,94,0.6)')
          grad.addColorStop(1, 'rgba(190,18,60,0)')
        }
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(ex.x, ex.y, Math.max(1, ex.r), 0, Math.PI * 2); ctx.fill()
      }

      // Particles.
      for (const p of s.particles) {
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      }
      ctx.globalAlpha = 1

      // Aim reticle.
      ctx.strokeStyle = '#a3e635'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(s.aimX, s.aimY, 12, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(s.aimX - 18, s.aimY); ctx.lineTo(s.aimX - 6, s.aimY)
      ctx.moveTo(s.aimX + 6, s.aimY); ctx.lineTo(s.aimX + 18, s.aimY)
      ctx.moveTo(s.aimX, s.aimY - 18); ctx.lineTo(s.aimX, s.aimY - 6)
      ctx.moveTo(s.aimX, s.aimY + 6); ctx.lineTo(s.aimX, s.aimY + 18)
      ctx.stroke()
      ctx.lineWidth = 1

      // Popups.
      for (const pu of s.popups) {
        ctx.globalAlpha = Math.max(0, pu.t)
        ctx.fillStyle = pu.color
        ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'
        ctx.fillText(pu.text, pu.x, pu.y)
      }
      ctx.globalAlpha = 1

      // HUD.
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.font = '13px system-ui'; ctx.textAlign = 'left'
      ctx.fillText(`CITIES ${s.cities.filter((c) => c.alive).length} / 6`, 20, 30)
      ctx.textAlign = 'right'
      ctx.fillText(`WAVE ${level}`, W - 20, 30)

      ctx.restore()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [status, level, startWave, sfx])

  return (
    <GameShell
      slug="missile-command"
      title="Missile Command"
      category="Arcade"
      score={score} level={level} status={status}
      soundOn={soundOn} onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={reset}
      onPause={() => setStatus((v) => v === 'paused' ? 'playing' : (v === 'playing' ? 'paused' : v))}
      controls={[
        { key: 'Mouse', label: 'Aim' },
        { key: 'Click', label: 'Fire nearest silo' },
        { key: 'Q A E', label: 'Force left / mid / right silo' },
        { key: 'Space', label: 'Pause' },
      ]}
      subtitle="Six cities. Ten counter-missiles per silo. MIRVs split, smart bombs dodge. Save who you can."
    >
      <canvas ref={canvasRef} width={W} height={H} className="w-full h-auto max-h-[78vh] block bg-black cursor-crosshair" />
    </GameShell>
  )
}
