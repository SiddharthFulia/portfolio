// TowerDefense.jsx — grid-based tower defense.
// Fixed enemy path drawn as a tiled cobblestone road on grass tiles.
// Four tower types with distinct attack patterns, three-tier upgrades,
// gold economy, wave preview, boss every 10 waves.
//
// Rendered on a single <canvas>. All simulation happens in refs so we
// don't rerender React on every frame — HUD state comes from a small
// snapshot pushed once per animation frame.

import { useCallback, useEffect, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

// ── Grid & path ────────────────────────────────────────────────
const COLS = 20
const ROWS = 12
const TILE = 36            // rendered tile size in css pixels
const CANVAS_W = COLS * TILE
const CANVAS_H = ROWS * TILE

// Enemy path — cells the road passes through, in order. Enemies walk from
// the first cell (left edge) to the last (right edge). Everything not on
// the path is buildable grass.
const PATH = [
  [0, 6], [1, 6], [2, 6], [3, 6],
  [3, 5], [3, 4], [3, 3], [3, 2],
  [4, 2], [5, 2], [6, 2], [7, 2],
  [7, 3], [7, 4], [7, 5], [7, 6], [7, 7], [7, 8], [7, 9],
  [8, 9], [9, 9], [10, 9], [11, 9], [12, 9],
  [12, 8], [12, 7], [12, 6], [12, 5], [12, 4], [12, 3],
  [13, 3], [14, 3], [15, 3], [16, 3],
  [16, 4], [16, 5], [16, 6], [16, 7], [16, 8], [16, 9],
  [17, 9], [18, 9], [19, 9],
]
const PATH_SET = new Set(PATH.map(([c, r]) => `${c},${r}`))
const PATH_POINTS = PATH.map(([c, r]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 }))
const isOnPath = (c, r) => PATH_SET.has(`${c},${r}`)

// ── Tower catalogue ────────────────────────────────────────────
const TOWERS = {
  arrow: {
    name: 'Arrow',
    accent: '#fbbf24',
    desc: 'Fast single-shot. Cheap and reliable.',
    tiers: [
      { cost: 40,  range: 3.4, dmg: 12,  fire: 0.55, projSpeed: 12, splash: 0 },
      { cost: 60,  range: 3.8, dmg: 22,  fire: 0.45, projSpeed: 14, splash: 0 },
      { cost: 110, range: 4.2, dmg: 40,  fire: 0.35, projSpeed: 16, splash: 0 },
    ],
  },
  cannon: {
    name: 'Cannon',
    accent: '#f97316',
    desc: 'Slow shell + splash damage.',
    tiers: [
      { cost: 70,  range: 2.8, dmg: 32,  fire: 1.2,  projSpeed: 7,  splash: 1.1 },
      { cost: 90,  range: 3.2, dmg: 55,  fire: 1.0,  projSpeed: 8,  splash: 1.3 },
      { cost: 150, range: 3.6, dmg: 95,  fire: 0.9,  projSpeed: 9,  splash: 1.5 },
    ],
  },
  frost: {
    name: 'Frost',
    accent: '#67e8f9',
    desc: 'Chills a wide radius. Low damage.',
    tiers: [
      { cost: 55,  range: 2.6, dmg: 6,   fire: 0.9,  projSpeed: 10, splash: 1.6, slow: 0.55, slowDur: 1.3 },
      { cost: 80,  range: 3.0, dmg: 11,  fire: 0.8,  projSpeed: 11, splash: 1.9, slow: 0.42, slowDur: 1.6 },
      { cost: 140, range: 3.4, dmg: 18,  fire: 0.7,  projSpeed: 12, splash: 2.2, slow: 0.28, slowDur: 2.0 },
    ],
  },
  lightning: {
    name: 'Lightning',
    accent: '#a78bfa',
    desc: 'Chains between up to 4 enemies.',
    tiers: [
      { cost: 90,  range: 3.2, dmg: 20,  fire: 0.9,  projSpeed: 0,  chain: 2 },
      { cost: 120, range: 3.6, dmg: 34,  fire: 0.8,  projSpeed: 0,  chain: 3 },
      { cost: 190, range: 4.0, dmg: 60,  fire: 0.7,  projSpeed: 0,  chain: 4 },
    ],
  },
}
const TOWER_KEYS = Object.keys(TOWERS)

function buildWave(n) {
  const isBoss = n % 10 === 0
  const count = isBoss ? 1 + Math.floor(n / 10) : 6 + Math.min(30, Math.floor(n * 1.4))
  const enemies = []
  for (let i = 0; i < count; i++) {
    const roll = Math.random()
    let type = 'grunt'
    if (isBoss && i === 0) type = 'boss'
    else if (n >= 3 && roll < 0.15 + Math.min(0.35, n * 0.01)) type = 'runner'
    else if (n >= 5 && roll < 0.30) type = 'tank'
    else if (n >= 8 && roll < 0.40) type = 'shielded'
    enemies.push({ type, at: i * 0.55 })
  }
  return { n, enemies, isBoss }
}

const ENEMY_KINDS = {
  grunt:    { hp: 40,  speed: 1.6, gold: 5,  color: '#f87171', size: 10 },
  runner:   { hp: 26,  speed: 3.0, gold: 6,  color: '#fbbf24', size: 8 },
  tank:     { hp: 120, speed: 1.0, gold: 12, color: '#94a3b8', size: 13 },
  shielded: { hp: 60,  speed: 1.4, gold: 10, color: '#c4b5fd', size: 11, armor: 0.4 },
  boss:     { hp: 900, speed: 0.8, gold: 80, color: '#ef4444', size: 18 },
}

function scaleEnemy(kind, wave) {
  const s = 1 + Math.pow(wave, 1.35) * 0.055
  return {
    hp: Math.round(kind.hp * s),
    maxHp: Math.round(kind.hp * s),
    speed: kind.speed * (1 + Math.min(0.6, wave * 0.02)),
    gold: kind.gold + Math.floor(wave * 0.6),
    color: kind.color,
    size: kind.size,
    armor: kind.armor || 0,
  }
}

export default function TowerDefense() {
  const canvasRef = useRef(null)
  const sfxRef = useRef(getSfx())

  const [gold, setGold] = useState(180)
  const [lives, setLives] = useState(20)
  const [wave, setWave] = useState(0)
  const [best, setBest] = useState(0)
  const [status, setStatus] = useState('ready')
  const [selectedType, setSelectedType] = useState('arrow')
  const [selectedTower, setSelectedTower] = useState(null)
  const [hover, setHover] = useState(null)
  const [soundOn, setSoundOn] = useState(true)
  const [inWave, setInWave] = useState(false)
  const [nextWavePreview, setNextWavePreview] = useState(buildWave(1))

  const stateRef = useRef({
    towers: [], enemies: [], projectiles: [], zaps: [],
    particles: [], damageNums: [], spawnQueue: [],
    waveT: 0, running: true, paused: false, tick: 0,
    goldFloat: 180, livesFloat: 20,
  })

  useEffect(() => { sfxRef.current.setEnabled(soundOn) }, [soundOn])
  useEffect(() => { try { setBest(Number(localStorage.getItem('sid-td-best') || 0)) } catch {} }, [])

  const syncHud = useCallback(() => {
    const s = stateRef.current
    setGold(Math.floor(s.goldFloat))
    setLives(Math.floor(s.livesFloat))
  }, [])

  const reset = useCallback(() => {
    stateRef.current.towers = []
    stateRef.current.enemies = []
    stateRef.current.projectiles = []
    stateRef.current.zaps = []
    stateRef.current.particles = []
    stateRef.current.damageNums = []
    stateRef.current.spawnQueue = []
    stateRef.current.waveT = 0
    stateRef.current.goldFloat = 180
    stateRef.current.livesFloat = 20
    stateRef.current.running = true
    stateRef.current.paused = false
    setGold(180); setLives(20); setWave(0); setInWave(false)
    setSelectedTower(null); setStatus('ready')
    setNextWavePreview(buildWave(1))
  }, [])

  const startWave = useCallback(() => {
    if (inWave || status === 'over') return
    const n = wave + 1
    const w = buildWave(n)
    stateRef.current.spawnQueue = w.enemies.map((e) => ({ ...e }))
    stateRef.current.waveT = 0
    setInWave(true); setWave(n); setStatus('playing')
    setNextWavePreview(buildWave(n + 1))
    sfxRef.current.chirp()
  }, [inWave, status, wave])

  const placeTower = useCallback((c, r) => {
    const s = stateRef.current
    if (isOnPath(c, r)) return
    if (s.towers.some((t) => t.c === c && t.r === r)) return
    const info = TOWERS[selectedType].tiers[0]
    if (s.goldFloat < info.cost) { sfxRef.current.hit(); return }
    s.goldFloat -= info.cost
    s.towers.push({ c, r, type: selectedType, tier: 0, cd: 0 })
    sfxRef.current.coin()
    setGold(Math.floor(s.goldFloat))
  }, [selectedType])

  const upgradeTower = useCallback((idx) => {
    const s = stateRef.current
    const t = s.towers[idx]
    if (!t || t.tier >= 2) return
    const nextInfo = TOWERS[t.type].tiers[t.tier + 1]
    if (s.goldFloat < nextInfo.cost) { sfxRef.current.hit(); return }
    s.goldFloat -= nextInfo.cost
    t.tier += 1
    sfxRef.current.coin()
    setGold(Math.floor(s.goldFloat))
  }, [])

  const sellTower = useCallback((idx) => {
    const s = stateRef.current
    const t = s.towers[idx]; if (!t) return
    let refund = 0
    for (let i = 0; i <= t.tier; i++) refund += TOWERS[t.type].tiers[i].cost
    refund = Math.floor(refund * 0.65)
    s.goldFloat += refund
    s.towers.splice(idx, 1)
    setGold(Math.floor(s.goldFloat))
    setSelectedTower(null)
    sfxRef.current.pop()
  }, [])

  const onCanvasClick = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvasRef.current.width / rect.width
    const scaleY = canvasRef.current.height / rect.height
    const x = (e.clientX - rect.left) * scaleX / dpr
    const y = (e.clientY - rect.top) * scaleY / dpr
    const c = Math.floor(x / TILE)
    const r = Math.floor(y / TILE)
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return
    const existingIdx = stateRef.current.towers.findIndex((t) => t.c === c && t.r === r)
    if (existingIdx !== -1) { setSelectedTower(existingIdx); return }
    if (isOnPath(c, r)) { sfxRef.current.hit(); return }
    setSelectedTower(null)
    placeTower(c, r)
  }, [placeTower])

  const onCanvasMove = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvasRef.current.width / rect.width
    const scaleY = canvasRef.current.height / rect.height
    const x = (e.clientX - rect.left) * scaleX / dpr
    const y = (e.clientY - rect.top) * scaleY / dpr
    const c = Math.floor(x / TILE)
    const r = Math.floor(y / TILE)
    setHover({ c, r })
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    canvas.width = CANVAS_W * dpr
    canvas.height = CANVAS_H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let raf = 0
    let last = performance.now()
    let hudTimer = 0

    const applyDamage = (enemy, dmg, s) => {
      const eff = dmg * (1 - (enemy.armor || 0))
      enemy.hp -= eff
      s.damageNums.push({ x: enemy.x + (Math.random()*10-5), y: enemy.y - 10, val: Math.round(eff), life: 0.7 })
    }

    const explode = (x, y, color, s) => {
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 60 + Math.random() * 120
        s.particles.push({ x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, life: 0.5 + Math.random()*0.3, color, size: 3 })
      }
    }

    const tick = (dt) => {
      const s = stateRef.current
      s.tick += dt
      s.waveT += dt
      while (s.spawnQueue.length && s.spawnQueue[0].at <= s.waveT) {
        const spec = s.spawnQueue.shift()
        const kind = ENEMY_KINDS[spec.type]
        const scaled = scaleEnemy(kind, wave)
        s.enemies.push({
          pathIdx: 0, t: 0,
          x: PATH_POINTS[0].x, y: PATH_POINTS[0].y,
          type: spec.type, ...scaled,
          slow: 1, slowUntil: 0,
        })
      }

      const survivors = []
      for (const e of s.enemies) {
        if (e.hp <= 0) {
          s.goldFloat += e.gold
          for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2
            s.particles.push({ x: e.x, y: e.y, vx: Math.cos(a)*60, vy: Math.sin(a)*60, life: 0.5, color: e.color, size: 3 })
          }
          continue
        }
        const slowFactor = s.tick < e.slowUntil ? e.slow : 1
        const from = PATH_POINTS[e.pathIdx]
        const to = PATH_POINTS[e.pathIdx + 1]
        if (!to) {
          s.livesFloat -= e.type === 'boss' ? 5 : 1
          sfxRef.current.hit(); continue
        }
        const segLen = Math.hypot(to.x - from.x, to.y - from.y)
        const step = (e.speed * slowFactor * TILE * 0.9) * dt
        e.t += step / segLen
        if (e.t >= 1) {
          e.t = 0; e.pathIdx += 1
          if (!PATH_POINTS[e.pathIdx + 1]) {
            s.livesFloat -= e.type === 'boss' ? 5 : 1
            sfxRef.current.hit(); continue
          }
        }
        const nfrom = PATH_POINTS[e.pathIdx]
        const nto = PATH_POINTS[e.pathIdx + 1]
        e.x = nfrom.x + (nto.x - nfrom.x) * e.t
        e.y = nfrom.y + (nto.y - nfrom.y) * e.t
        survivors.push(e)
      }
      s.enemies = survivors

      for (const t of s.towers) {
        const info = TOWERS[t.type].tiers[t.tier]
        t.cd -= dt
        if (t.cd > 0) continue
        const tx = t.c * TILE + TILE / 2
        const ty = t.r * TILE + TILE / 2
        let bestE = null; let bestScore = -Infinity
        for (const e of s.enemies) {
          const dx = e.x - tx, dy = e.y - ty
          const d = Math.hypot(dx, dy) / TILE
          if (d > info.range) continue
          const score = e.pathIdx * 100 + e.t * 100
          if (score > bestScore) { bestScore = score; bestE = e }
        }
        if (!bestE) continue
        t.cd = info.fire
        const angle = Math.atan2(bestE.y - ty, bestE.x - tx)
        if (t.type === 'lightning') {
          const chainPts = [{ x: tx, y: ty }]
          const hit = new Set()
          let cur = bestE
          for (let i = 0; i < info.chain; i++) {
            if (!cur) break
            hit.add(cur)
            applyDamage(cur, info.dmg, s)
            chainPts.push({ x: cur.x, y: cur.y })
            let next = null; let nd = Infinity
            for (const e of s.enemies) {
              if (hit.has(e) || e.hp <= 0) continue
              const d = Math.hypot(e.x - cur.x, e.y - cur.y) / TILE
              if (d < 2.2 && d < nd) { nd = d; next = e }
            }
            cur = next
          }
          s.zaps.push({ chain: chainPts, ttl: 0.15 })
          sfxRef.current.chirp()
        } else {
          s.projectiles.push({
            x: tx, y: ty,
            vx: Math.cos(angle) * info.projSpeed * TILE,
            vy: Math.sin(angle) * info.projSpeed * TILE,
            dmg: info.dmg, splash: info.splash,
            slow: info.slow || 0, slowDur: info.slowDur || 0,
            color: TOWERS[t.type].accent, target: bestE, trail: [],
            type: t.type, ttl: 1.5,
          })
          if (t.type === 'arrow') sfxRef.current.pop()
          else if (t.type === 'cannon') sfxRef.current.hit()
          else if (t.type === 'frost') sfxRef.current.chirp()
        }
      }

      const liveProj = []
      for (const p of s.projectiles) {
        p.ttl -= dt
        if (p.ttl <= 0) continue
        p.trail.push({ x: p.x, y: p.y })
        if (p.trail.length > 6) p.trail.shift()
        if (p.target && p.target.hp > 0) {
          const a = Math.atan2(p.target.y - p.y, p.target.x - p.x)
          const sp = Math.hypot(p.vx, p.vy)
          const dvx = Math.cos(a) * sp, dvy = Math.sin(a) * sp
          p.vx = p.vx * 0.85 + dvx * 0.15
          p.vy = p.vy * 0.85 + dvy * 0.15
        }
        p.x += p.vx * dt; p.y += p.vy * dt
        let impacted = null
        for (const e of s.enemies) {
          if (e.hp <= 0) continue
          if (Math.hypot(e.x - p.x, e.y - p.y) < e.size + 4) { impacted = e; break }
        }
        if (impacted) {
          if (p.splash) {
            for (const e of s.enemies) {
              const d = Math.hypot(e.x - p.x, e.y - p.y) / TILE
              if (d <= p.splash) {
                const scale = 1 - Math.min(1, d / p.splash) * 0.4
                applyDamage(e, p.dmg * scale, s)
                if (p.slow) { e.slow = Math.min(e.slow, p.slow); e.slowUntil = s.tick + p.slowDur }
              }
            }
            explode(p.x, p.y, p.color, s)
            sfxRef.current.boom()
          } else {
            applyDamage(impacted, p.dmg, s)
            for (let i = 0; i < 4; i++) {
              const a = Math.random() * Math.PI * 2
              s.particles.push({ x: p.x, y: p.y, vx: Math.cos(a)*40, vy: Math.sin(a)*40, life: 0.3, color: p.color, size: 2 })
            }
          }
          continue
        }
        if (p.x < -20 || p.x > CANVAS_W + 20 || p.y < -20 || p.y > CANVAS_H + 20) continue
        liveProj.push(p)
      }
      s.projectiles = liveProj

      for (const z of s.zaps) z.ttl -= dt
      s.zaps = s.zaps.filter((z) => z.ttl > 0)
      for (const p of s.particles) {
        p.x += p.vx * dt; p.y += p.vy * dt
        p.vx *= 0.92; p.vy *= 0.92
        p.life -= dt
      }
      s.particles = s.particles.filter((p) => p.life > 0)
      for (const d of s.damageNums) { d.life -= dt; d.y -= 20 * dt }
      s.damageNums = s.damageNums.filter((d) => d.life > 0)

      if (s.spawnQueue.length === 0 && s.enemies.length === 0 && inWave) {
        s.goldFloat += 30 + wave * 3
        setInWave(false); setStatus('ready')
        sfxRef.current.win()
      }
      if (s.livesFloat <= 0 && s.running) {
        s.livesFloat = 0; s.running = false
        setStatus('over')
        sfxRef.current.death()
        try {
          if (wave > best) { localStorage.setItem('sid-td-best', String(wave)); setBest(wave) }
        } catch {}
      }
    }

    const draw = () => {
      const s = stateRef.current
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const on = isOnPath(c, r)
          if (on) {
            ctx.fillStyle = '#5f4b3a'
            ctx.fillRect(c*TILE, r*TILE, TILE, TILE)
            ctx.fillStyle = '#7a6249'
            const sx = c*TILE, sy = r*TILE
            ctx.fillRect(sx+4, sy+4, 10, 8)
            ctx.fillRect(sx+16, sy+6, 12, 10)
            ctx.fillRect(sx+6, sy+20, 14, 10)
            ctx.fillRect(sx+22, sy+22, 10, 8)
            ctx.strokeStyle = 'rgba(0,0,0,0.25)'
            ctx.lineWidth = 1
            ctx.strokeRect(sx+4, sy+4, 10, 8)
            ctx.strokeRect(sx+16, sy+6, 12, 10)
            ctx.strokeRect(sx+6, sy+20, 14, 10)
            ctx.strokeRect(sx+22, sy+22, 10, 8)
          } else {
            const shade = (c + r) % 2 === 0 ? '#22532a' : '#1f4a25'
            ctx.fillStyle = shade
            ctx.fillRect(c*TILE, r*TILE, TILE, TILE)
            ctx.fillStyle = 'rgba(255,255,255,0.06)'
            ctx.fillRect(c*TILE + ((c*7+r*11)%12) + 4, r*TILE + ((c*13+r*5)%12) + 4, 3, 2)
            ctx.fillRect(c*TILE + ((c*3+r*17)%12) + 12, r*TILE + ((c*9+r*23)%12) + 18, 3, 2)
          }
        }
      }

      if (hover && !inWave) {
        const { c, r } = hover
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
          if (isOnPath(c, r)) {
            ctx.fillStyle = 'rgba(239,68,68,0.25)'
          } else {
            const existing = s.towers.some((t) => t.c === c && t.r === r)
            ctx.fillStyle = existing ? 'rgba(255,255,255,0.10)' : 'rgba(251,191,36,0.30)'
          }
          ctx.fillRect(c*TILE, r*TILE, TILE, TILE)
          if (!isOnPath(c, r) && !s.towers.some((t) => t.c === c && t.r === r)) {
            const info = TOWERS[selectedType].tiers[0]
            ctx.beginPath()
            ctx.arc(c*TILE + TILE/2, r*TILE + TILE/2, info.range * TILE, 0, Math.PI*2)
            ctx.fillStyle = 'rgba(251,191,36,0.10)'
            ctx.fill()
            ctx.strokeStyle = 'rgba(251,191,36,0.45)'
            ctx.stroke()
          }
        }
      }

      s.towers.forEach((t, idx) => {
        const info = TOWERS[t.type].tiers[t.tier]
        const cx = t.c * TILE + TILE/2
        const cy = t.r * TILE + TILE/2
        if (selectedTower === idx) {
          ctx.beginPath()
          ctx.arc(cx, cy, info.range * TILE, 0, Math.PI*2)
          ctx.fillStyle = TOWERS[t.type].accent + '20'
          ctx.fill()
          ctx.strokeStyle = TOWERS[t.type].accent
          ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([])
        }
        drawTower(ctx, cx, cy, t.type, t.tier)
      })

      for (const e of s.enemies) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.beginPath(); ctx.ellipse(e.x, e.y + e.size*0.8, e.size*0.9, e.size*0.35, 0, 0, Math.PI*2); ctx.fill()
        ctx.fillStyle = e.color
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI*2); ctx.fill()
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke()
        if (s.tick < e.slowUntil) {
          ctx.fillStyle = 'rgba(103,232,249,0.35)'
          ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI*2); ctx.fill()
        }
        if (e.type === 'boss') {
          ctx.fillStyle = '#fef08a'
          ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'
          ctx.fillText('★', e.x, e.y + 4)
        }
        const bw = e.size * 2.2
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(e.x - bw/2, e.y - e.size - 8, bw, 4)
        ctx.fillStyle = e.hp/e.maxHp > 0.5 ? '#22c55e' : e.hp/e.maxHp > 0.25 ? '#fbbf24' : '#ef4444'
        ctx.fillRect(e.x - bw/2, e.y - e.size - 8, bw * (e.hp/e.maxHp), 4)
      }

      for (const p of s.projectiles) {
        ctx.strokeStyle = p.color
        ctx.lineWidth = 2
        ctx.beginPath()
        for (let i = 0; i < p.trail.length; i++) {
          const tr = p.trail[i]
          if (i === 0) ctx.moveTo(tr.x, tr.y); else ctx.lineTo(tr.x, tr.y)
        }
        ctx.lineTo(p.x, p.y); ctx.stroke()
        ctx.fillStyle = p.color
        ctx.beginPath()
        if (p.type === 'cannon' || p.type === 'frost') ctx.arc(p.x, p.y, 5, 0, Math.PI*2)
        else ctx.arc(p.x, p.y, 3, 0, Math.PI*2)
        ctx.fill()
      }

      for (const z of s.zaps) {
        ctx.strokeStyle = `rgba(167,139,250,${z.ttl / 0.15})`
        ctx.lineWidth = 2.5
        ctx.beginPath()
        for (let i = 0; i < z.chain.length; i++) {
          const p = z.chain[i]
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x + (Math.random()*4-2), p.y + (Math.random()*4-2))
        }
        ctx.stroke()
      }

      for (const p of s.particles) {
        ctx.globalAlpha = Math.max(0, p.life / 0.5)
        ctx.fillStyle = p.color
        ctx.fillRect(p.x, p.y, p.size, p.size)
      }
      ctx.globalAlpha = 1

      ctx.font = 'bold 12px ui-monospace, monospace'; ctx.textAlign = 'center'
      for (const d of s.damageNums) {
        ctx.fillStyle = `rgba(254, 240, 138, ${Math.min(1, d.life/0.7)})`
        ctx.fillText(String(d.val), d.x, d.y)
      }

      const g = ctx.createRadialGradient(CANVAS_W/2, CANVAS_H/2, CANVAS_W*0.4, CANVAS_W/2, CANVAS_H/2, CANVAS_W*0.75)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,0.35)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    }

    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = stateRef.current
      if (!s.paused && s.running) tick(dt)
      draw()
      hudTimer += dt
      if (hudTimer > 0.1) { hudTimer = 0; syncHud() }
      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [selectedType, selectedTower, hover, inWave, wave, best, syncHud])

  const onPause = () => {
    const s = stateRef.current
    s.paused = !s.paused
    setStatus(s.paused ? 'paused' : (inWave ? 'playing' : 'ready'))
  }

  const onRestart = () => {
    stateRef.current.running = true
    stateRef.current.paused = false
    reset()
  }

  const towerAtSelected = selectedTower != null ? stateRef.current.towers[selectedTower] : null

  const extraStats = (
    <>
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Gold</span>
        <span className="text-xl sm:text-2xl font-bold tabular-nums text-amber-300">{gold}</span>
      </div>
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Lives</span>
        <span className="text-xl sm:text-2xl font-bold tabular-nums text-rose-300">{lives}</span>
      </div>
    </>
  )

  return (
    <GameShell
      title="Tower Defense"
      category="Strategy"
      score={wave}
      best={best}
      level={wave}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={onRestart}
      onPause={onPause}
      extraStats={extraStats}
      controls={[
        { key: '1-4', label: 'Pick tower type' },
        { key: 'Click', label: 'Place / select' },
        { key: 'U', label: 'Upgrade selected' },
        { key: 'S', label: 'Sell selected' },
        { key: 'Space', label: 'Start next wave' },
      ]}
      footer={
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Buy tower</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TOWER_KEYS.map((k) => {
                const t = TOWERS[k]
                const cost = t.tiers[0].cost
                const active = k === selectedType
                return (
                  <button
                    type="button"
                    key={k}
                    onClick={() => setSelectedType(k)}
                    className={`rounded-lg border p-2 text-left transition-all ${active ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 hover:border-white/30'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-3 h-3 rounded-full" style={{ background: t.accent }} />
                      <span className="text-sm font-semibold">{t.name}</span>
                    </div>
                    <div className="text-[10px] text-white/60 leading-tight mb-1">{t.desc}</div>
                    <div className="text-xs text-amber-300 font-bold">{cost}g</div>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Selected</div>
            {towerAtSelected ? (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-semibold" style={{ color: TOWERS[towerAtSelected.type].accent }}>
                    {TOWERS[towerAtSelected.type].name}
                  </span>{' '}
                  <span className="text-white/60">Tier {towerAtSelected.tier + 1}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={towerAtSelected.tier >= 2 || gold < (TOWERS[towerAtSelected.type].tiers[towerAtSelected.tier + 1]?.cost || Infinity)}
                    onClick={() => upgradeTower(selectedTower)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-semibold disabled:opacity-40 hover:bg-emerald-500/30"
                  >
                    Upgrade{towerAtSelected.tier < 2 ? ` (${TOWERS[towerAtSelected.type].tiers[towerAtSelected.tier + 1].cost}g)` : ' Max'}
                  </button>
                  <button
                    type="button"
                    onClick={() => sellTower(selectedTower)}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs font-semibold hover:bg-rose-500/30"
                  >
                    Sell
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-white/50">Click a tower to see its stats + upgrade path.</div>
            )}
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="text-[11px] uppercase tracking-widest text-white/50 mb-1">Next wave preview</div>
              <div className="text-xs text-white/80">
                Wave {nextWavePreview.n}{nextWavePreview.isBoss ? ' — BOSS' : ''} · {nextWavePreview.enemies.length} enemies
              </div>
              <button
                type="button"
                onClick={startWave}
                disabled={inWave || status === 'over'}
                className="mt-2 w-full px-3 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 text-white text-sm font-semibold disabled:opacity-40"
              >
                {inWave ? 'Wave in progress' : 'Start next wave'}
              </button>
            </div>
          </div>
        </div>
      }
      overlay={status === 'over' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-4xl font-bold bg-gradient-to-r from-amber-300 to-rose-300 bg-clip-text text-transparent mb-2">
              Game Over
            </div>
            <div className="text-white/70 mb-4">Reached wave {wave}</div>
            <button
              type="button"
              onClick={onRestart}
              className="px-5 py-2 rounded-lg bg-white text-black font-semibold hover:bg-white/90"
            >
              Try again
            </button>
          </div>
        </div>
      ) : null}
    >
      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        onMouseMove={onCanvasMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => {
          const t = e.touches[0]; if (!t) return
          onCanvasClick({ clientX: t.clientX, clientY: t.clientY })
        }}
        onKeyDown={(e) => {
          if (e.key === '1') setSelectedType('arrow')
          if (e.key === '2') setSelectedType('cannon')
          if (e.key === '3') setSelectedType('frost')
          if (e.key === '4') setSelectedType('lightning')
          if (e.key === 'u' && selectedTower != null) upgradeTower(selectedTower)
          if (e.key === 's' && selectedTower != null) sellTower(selectedTower)
          if (e.key === ' ') startWave()
        }}
        tabIndex={0}
        style={{ width: '100%', maxHeight: '80vh', imageRendering: 'pixelated', cursor: 'crosshair', display: 'block' }}
      />
    </GameShell>
  )
}

function drawTower(ctx, cx, cy, type, tier) {
  const size = 14 + tier * 2
  ctx.fillStyle = '#3f3f46'
  ctx.beginPath(); ctx.arc(cx, cy + 6, size * 0.85, 0, Math.PI*2); ctx.fill()
  ctx.strokeStyle = '#18181b'; ctx.lineWidth = 1.5; ctx.stroke()

  if (type === 'arrow') {
    ctx.fillStyle = '#78350f'
    ctx.fillRect(cx - size*0.7, cy - size*0.2, size*1.4, size*0.4)
    ctx.strokeRect(cx - size*0.7, cy - size*0.2, size*1.4, size*0.4)
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(cx, cy - 4, size*0.7, Math.PI*0.75, Math.PI*0.25); ctx.stroke()
    ctx.strokeStyle = '#fef3c7'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx + size*0.9, cy - 4); ctx.stroke()
    if (tier >= 1) { ctx.fillStyle = '#fef08a'; ctx.font = '8px system-ui'; ctx.textAlign = 'center'; ctx.fillText('★'.repeat(tier + 1), cx, cy + 14) }
  } else if (type === 'cannon') {
    ctx.fillStyle = '#78716c'
    ctx.beginPath(); ctx.arc(cx, cy, size*0.65, 0, Math.PI*2); ctx.fill()
    ctx.strokeStyle = '#1c1917'; ctx.stroke()
    ctx.fillStyle = '#292524'
    ctx.fillRect(cx - 3, cy - 2, size*0.9, 4)
    ctx.strokeRect(cx - 3, cy - 2, size*0.9, 4)
    ctx.fillStyle = '#f97316'
    ctx.fillRect(cx + size*0.85, cy - 3, 3, 6)
    if (tier >= 1) { ctx.fillStyle = '#fef08a'; ctx.font = '8px system-ui'; ctx.textAlign = 'center'; ctx.fillText('★'.repeat(tier + 1), cx, cy + 14) }
  } else if (type === 'frost') {
    ctx.fillStyle = '#67e8f9'
    ctx.beginPath()
    ctx.moveTo(cx, cy - size*0.9)
    ctx.lineTo(cx + size*0.55, cy)
    ctx.lineTo(cx, cy + size*0.6)
    ctx.lineTo(cx - size*0.55, cy)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#0e7490'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = '#e0f2fe'
    ctx.fillRect(cx - 2, cy - 8, 2, 2)
    ctx.fillRect(cx + 4, cy - 2, 2, 2)
    if (tier >= 1) { ctx.fillStyle = '#a5f3fc'; ctx.font = '8px system-ui'; ctx.textAlign = 'center'; ctx.fillText('★'.repeat(tier + 1), cx, cy + 14) }
  } else if (type === 'lightning') {
    ctx.fillStyle = '#6d28d9'
    ctx.beginPath(); ctx.arc(cx, cy - 4, size*0.55, 0, Math.PI*2); ctx.fill()
    ctx.strokeStyle = '#1e1b4b'; ctx.stroke()
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx - size*0.4, cy - 10); ctx.lineTo(cx, cy - size*1.1); ctx.lineTo(cx + size*0.4, cy - 10); ctx.stroke()
    ctx.fillStyle = '#e9d5ff'
    ctx.fillRect(cx - 1, cy - size*1.15, 2, 2)
    if (tier >= 1) { ctx.fillStyle = '#c4b5fd'; ctx.font = '8px system-ui'; ctx.textAlign = 'center'; ctx.fillText('★'.repeat(tier + 1), cx, cy + 14) }
  }
}
