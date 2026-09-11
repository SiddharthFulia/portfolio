// MiniRts.jsx — small real-time strategy sandbox.
// Gather → build → army → attack, with an opponent AI that follows the
// same macro heuristics. Tiled grass / forest / rock overlay, top-down
// units with idle-walk animation cycles, click-drag box selection,
// right-click issue move / attack, fog of war on the enemy half.

import { useCallback, useEffect, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const COLS = 40
const ROWS = 22
const TILE = 22
const CANVAS_W = COLS * TILE
const CANVAS_H = ROWS * TILE

const T = { GRASS: 0, FOREST: 1, ROCK: 2 }

function seedMap() {
  const m = new Array(COLS * ROWS)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const noise = (Math.sin(c*12.9898 + r*78.233) * 43758.5453) % 1
      const n = (noise + 1) / 2
      let t = T.GRASS
      if (r < 4 || r > ROWS - 5) { if (n > 0.55) t = T.FOREST }
      else if (c > 10 && c < 30 && r > 7 && r < 15) { if (n > 0.78) t = T.ROCK }
      else if (n > 0.85) t = T.FOREST
      if ((c < 6 && r < 6) || (c > COLS - 7 && r > ROWS - 7)) t = T.GRASS
      m[r * COLS + c] = t
    }
  }
  return m
}

// Counter matrix — attacker → target multiplier.
const COUNTER = {
  sword:   { cavalry: 1.6, archer: 0.7 },
  archer:  { sword: 1.6, cavalry: 0.7 },
  cavalry: { archer: 1.6, sword: 0.7 },
}

const UNITS = {
  peasant: { hp: 40,  dmg: 4,  range: 0.9, speed: 34, cost: { g: 15, w: 0 }, size: 6,  color: '#fbbf24', buildTime: 2.5 },
  sword:   { hp: 90,  dmg: 12, range: 0.9, speed: 32, cost: { g: 30, w: 5 }, size: 7,  color: '#e5e7eb', buildTime: 3.5 },
  archer:  { hp: 60,  dmg: 10, range: 4.5, speed: 30, cost: { g: 25, w: 15 }, size: 6, color: '#a3e635', buildTime: 3.2 },
  cavalry: { hp: 130, dmg: 16, range: 1.0, speed: 48, cost: { g: 60, w: 15 }, size: 8, color: '#f472b6', buildTime: 5.0 },
}

const BUILDINGS = {
  townhall: { hp: 600, tiles: 3, cost: { g: 0, w: 0 },   color: '#c084fc', trains: ['peasant'] },
  farm:     { hp: 250, tiles: 2, cost: { g: 40, w: 20 }, color: '#84cc16', trains: [], popCap: 6 },
  barracks: { hp: 400, tiles: 2, cost: { g: 80, w: 40 }, color: '#f97316', trains: ['sword', 'archer', 'cavalry'] },
  tower:    { hp: 350, tiles: 2, cost: { g: 60, w: 30 }, color: '#38bdf8', trains: [], attack: { range: 5, dmg: 18, cd: 1.0 } },
}

function seedResources() {
  const out = []
  const goldSpots = [ [8,5],[8,7],[9,6],[24,4],[26,5],[25,6],[7,17],[8,18],[30,14],[31,15],[15,10],[16,11] ]
  for (const [c, r] of goldSpots) out.push({ c, r, type: 'gold', amount: 250 })
  const woodSpots = [ [4,10],[5,11],[6,12],[12,3],[13,4],[19,17],[20,18],[28,10],[29,11],[35,12],[36,13],[2,15],[3,16] ]
  for (const [c, r] of woodSpots) out.push({ c, r, type: 'wood', amount: 200 })
  return out
}

export default function MiniRts() {
  const canvasRef = useRef(null)
  const sfxRef = useRef(getSfx())

  const [soundOn, setSoundOn] = useState(true)
  const [status, setStatus] = useState('ready')
  const [best, setBest] = useState(0)
  const [gold, setGold] = useState(120)
  const [wood, setWood] = useState(60)
  const [pop, setPop] = useState({ used: 2, cap: 6 })
  const [selBuilding, setSelBuilding] = useState(null)
  const [showFog, setShowFog] = useState(true)

  useEffect(() => { sfxRef.current.setEnabled(soundOn) }, [soundOn])
  useEffect(() => { try { setBest(Number(localStorage.getItem('sid-rts-best') || 0)) } catch {} }, [])

  const stateRef = useRef(null)

  const addBuilding = (s, c, r, type, side) => {
    const info = BUILDINGS[type]
    s.buildings.push({
      id: Math.random(),
      c, r, type, side,
      hp: info.hp, maxHp: info.hp,
      trainQueue: [], trainT: 0, cd: 0,
    })
  }

  const addUnit = (s, c, r, type, side) => {
    const info = UNITS[type]
    s.units.push({
      id: Math.random(),
      x: c * TILE + TILE / 2, y: r * TILE + TILE / 2,
      tx: c * TILE + TILE / 2, ty: r * TILE + TILE / 2,
      type, side,
      hp: info.hp, maxHp: info.hp,
      task: 'idle', target: null,
      carry: 0, carryType: null,
      speed: info.speed, cd: 0,
      frame: Math.random() * 4,
    })
  }

  const reset = useCallback(() => {
    const map = seedMap()
    stateRef.current = {
      map, resNodes: seedResources(),
      units: [], buildings: [], projectiles: [], particles: [], damageNums: [],
      selection: new Set(), dragStart: null, dragEnd: null,
      goldFloat: 120, woodFloat: 60,
      enemyGold: 100, enemyWood: 60,
      running: true, paused: false,
      tick: 0, elapsed: 0,
      aiTimer: 0,
      fog: new Uint8Array(COLS * ROWS),
      score: 0,
    }
    addBuilding(stateRef.current, 2, 2, 'townhall', 'player')
    addBuilding(stateRef.current, COLS - 5, ROWS - 5, 'townhall', 'enemy')
    for (let i = 0; i < 2; i++) addUnit(stateRef.current, 3 + i, 4, 'peasant', 'player')
    for (let i = 0; i < 3; i++) addUnit(stateRef.current, COLS - 6 + i, ROWS - 6, 'peasant', 'enemy')
    setStatus('playing'); setGold(120); setWood(60); setSelBuilding(null)
    setPop({ used: 2, cap: 6 })
  }, [])

  useEffect(() => { reset() }, [reset])

  const mouseToWorld = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width) / dpr
    const y = (e.clientY - rect.top) * (canvasRef.current.height / rect.height) / dpr
    return { x, y, c: Math.floor(x / TILE), r: Math.floor(y / TILE) }
  }

  const occupied = (s, c, r, tiles) => {
    for (let dr = 0; dr < tiles; dr++) {
      for (let dc = 0; dc < tiles; dc++) {
        const cc = c + dc, rr = r + dr
        if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) return true
        for (const b of s.buildings) {
          if (b.hp <= 0) continue
          const info = BUILDINGS[b.type]
          if (cc >= b.c && cc < b.c + info.tiles && rr >= b.r && rr < b.r + info.tiles) return true
        }
      }
    }
    return false
  }

  const isBadTerrain = (s, c, r, tiles) => {
    for (let dr = 0; dr < tiles; dr++) {
      for (let dc = 0; dc < tiles; dc++) {
        if (s.map[(r + dr) * COLS + (c + dc)] !== T.GRASS) return true
      }
    }
    return false
  }

  const onMouseDown = (e) => {
    if (e.button === 2) return
    const w = mouseToWorld(e)
    const s = stateRef.current; if (!s) return
    if (selBuilding) {
      const info = BUILDINGS[selBuilding]
      if (s.goldFloat >= info.cost.g && s.woodFloat >= info.cost.w) {
        const nearBase = s.buildings.some((b) => b.side === 'player' && b.hp > 0 && Math.hypot(b.c - w.c, b.r - w.r) < 10)
        if (nearBase && !occupied(s, w.c, w.r, info.tiles) && !isBadTerrain(s, w.c, w.r, info.tiles)) {
          s.goldFloat -= info.cost.g; s.woodFloat -= info.cost.w
          addBuilding(s, w.c, w.r, selBuilding, 'player')
          sfxRef.current.pop()
        } else sfxRef.current.hit()
      }
      setSelBuilding(null)
      return
    }
    s.dragStart = { x: w.x, y: w.y }
    s.dragEnd = { x: w.x, y: w.y }
  }

  const onMouseMove = (e) => {
    const s = stateRef.current; if (!s) return
    const w = mouseToWorld(e)
    if (s.dragStart) s.dragEnd = { x: w.x, y: w.y }
  }

  const onMouseUp = (e) => {
    const s = stateRef.current
    if (!s || !s.dragStart) return
    const w = mouseToWorld(e)
    s.dragEnd = { x: w.x, y: w.y }
    const x0 = Math.min(s.dragStart.x, s.dragEnd.x)
    const x1 = Math.max(s.dragStart.x, s.dragEnd.x)
    const y0 = Math.min(s.dragStart.y, s.dragEnd.y)
    const y1 = Math.max(s.dragStart.y, s.dragEnd.y)
    s.selection.clear()
    const dragArea = (x1 - x0) * (y1 - y0)
    if (dragArea < 30) {
      const near = s.units.find((u) => u.side === 'player' && Math.hypot(u.x - w.x, u.y - w.y) < 12)
      if (near) s.selection.add(near.id)
    } else {
      for (const u of s.units) {
        if (u.side !== 'player') continue
        if (u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) s.selection.add(u.id)
      }
    }
    s.dragStart = null; s.dragEnd = null
    if (s.selection.size) sfxRef.current.chirp()
  }

  const onContextMenu = (e) => {
    e.preventDefault()
    const s = stateRef.current; if (!s) return
    const w = mouseToWorld(e)
    let attackTarget = null
    for (const u of s.units) {
      if (u.side === 'enemy' && Math.hypot(u.x - w.x, u.y - w.y) < 12) { attackTarget = u; break }
    }
    if (!attackTarget) {
      for (const b of s.buildings) {
        if (b.side === 'enemy' && b.hp > 0) {
          const size = BUILDINGS[b.type].tiles * TILE
          if (w.x >= b.c*TILE && w.x <= b.c*TILE + size && w.y >= b.r*TILE && w.y <= b.r*TILE + size) {
            attackTarget = b; break
          }
        }
      }
    }
    let gatherTarget = null
    for (const n of s.resNodes) {
      if (n.amount > 0 && Math.abs(n.c - w.c) < 1 && Math.abs(n.r - w.r) < 1) { gatherTarget = n; break }
    }
    for (const u of s.units) {
      if (!s.selection.has(u.id) || u.side !== 'player') continue
      if (attackTarget) {
        u.task = 'attack'; u.target = attackTarget
        u.tx = attackTarget.x != null ? attackTarget.x : attackTarget.c*TILE + TILE
        u.ty = attackTarget.y != null ? attackTarget.y : attackTarget.r*TILE + TILE
      } else if (gatherTarget && u.type === 'peasant') {
        u.task = 'gather'; u.target = gatherTarget
        u.tx = gatherTarget.c * TILE + TILE/2; u.ty = gatherTarget.r * TILE + TILE/2
      } else {
        u.task = 'move'; u.target = null; u.tx = w.x; u.ty = w.y
      }
    }
    sfxRef.current.pop()
  }

  const trainUnit = (buildingId, unitType) => {
    const s = stateRef.current
    const b = s.buildings.find((b) => b.id === buildingId); if (!b) return
    const info = UNITS[unitType]
    if (s.goldFloat < info.cost.g || s.woodFloat < info.cost.w) { sfxRef.current.hit(); return }
    if (pop.used + 1 > pop.cap) { sfxRef.current.hit(); return }
    s.goldFloat -= info.cost.g; s.woodFloat -= info.cost.w
    b.trainQueue.push({ type: unitType, remaining: info.buildTime })
    sfxRef.current.chirp()
    setGold(Math.floor(s.goldFloat)); setWood(Math.floor(s.woodFloat))
  }

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

    const revealArea = (s, cc, rr, radius) => {
      const r0 = Math.max(0, Math.floor(rr - radius))
      const r1 = Math.min(ROWS - 1, Math.ceil(rr + radius))
      const c0 = Math.max(0, Math.floor(cc - radius))
      const c1 = Math.min(COLS - 1, Math.ceil(cc + radius))
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (Math.hypot(c - cc, r - rr) <= radius) s.fog[r * COLS + c] = 2
        }
      }
    }

    const nearestTownhall = (s, u) => s.buildings
      .filter((b) => b.side === u.side && b.type === 'townhall' && b.hp > 0)
      .sort((a, b) => Math.hypot(a.c*TILE - u.x, a.r*TILE - u.y) - Math.hypot(b.c*TILE - u.x, b.r*TILE - u.y))[0]

    const moveToward = (u, dt) => {
      const dx = u.tx - u.x, dy = u.ty - u.y
      const d = Math.hypot(dx, dy)
      if (d < 1) return
      u.x += (dx / d) * u.speed * dt
      u.y += (dy / d) * u.speed * dt
    }

    const placeAIBuilding = (s, type) => {
      const info = BUILDINGS[type]
      const th = s.buildings.find((b) => b.side === 'enemy' && b.type === 'townhall' && b.hp > 0)
      if (!th) return false
      for (let tries = 0; tries < 30; tries++) {
        const c = th.c + Math.floor(Math.random() * 10) - 5
        const r = th.r + Math.floor(Math.random() * 10) - 5
        if (c < 0 || r < 0 || c + info.tiles >= COLS || r + info.tiles >= ROWS) continue
        if (occupied(s, c, r, info.tiles)) continue
        if (isBadTerrain(s, c, r, info.tiles)) continue
        addBuilding(s, c, r, type, 'enemy')
        return true
      }
      return false
    }

    const runAI = (s, dt) => {
      s.aiTimer += dt
      if (s.aiTimer < 0.6) return
      s.aiTimer = 0
      const enemyPeasants = s.units.filter((u) => u.side === 'enemy' && u.type === 'peasant')
      const enemyTH = s.buildings.find((b) => b.side === 'enemy' && b.type === 'townhall' && b.hp > 0)
      if (!enemyTH) return
      if (enemyPeasants.length < 5 && enemyTH.trainQueue.length < 2 && s.enemyGold > 15) {
        s.enemyGold -= 15
        enemyTH.trainQueue.push({ type: 'peasant', remaining: 2.5 })
      }
      for (const p of enemyPeasants) {
        if (p.task === 'idle') {
          const n = s.resNodes
            .filter((rn) => rn.amount > 0)
            .sort((a, b) => Math.hypot(a.c*TILE - p.x, a.r*TILE - p.y) - Math.hypot(b.c*TILE - p.x, b.r*TILE - p.y))[0]
          if (n) { p.task = 'gather'; p.target = n; p.tx = n.c*TILE+TILE/2; p.ty = n.r*TILE+TILE/2 }
        }
      }
      const enemyFarms = s.buildings.filter((b) => b.side === 'enemy' && b.type === 'farm' && b.hp > 0).length
      const enemyBarracks = s.buildings.filter((b) => b.side === 'enemy' && b.type === 'barracks' && b.hp > 0).length
      if (enemyFarms < 2 && s.enemyGold >= 40 && s.enemyWood >= 20) {
        if (placeAIBuilding(s, 'farm')) { s.enemyGold -= 40; s.enemyWood -= 20 }
      } else if (enemyBarracks < 1 && s.enemyGold >= 80 && s.enemyWood >= 40) {
        if (placeAIBuilding(s, 'barracks')) { s.enemyGold -= 80; s.enemyWood -= 40 }
      } else if (enemyBarracks >= 1) {
        const playerArmy = s.units.filter((u) => u.side === 'player' && u.type !== 'peasant')
        const counts = { sword: 0, archer: 0, cavalry: 0 }
        for (const u of playerArmy) counts[u.type]++
        let train = 'sword'
        if (counts.cavalry >= counts.sword && counts.cavalry >= counts.archer) train = 'sword'
        else if (counts.sword >= counts.archer) train = 'archer'
        else train = 'cavalry'
        const info = UNITS[train]
        if (s.enemyGold >= info.cost.g && s.enemyWood >= info.cost.w) {
          const bar = s.buildings.find((b) => b.side === 'enemy' && b.type === 'barracks' && b.hp > 0)
          if (bar && bar.trainQueue.length < 3) {
            s.enemyGold -= info.cost.g; s.enemyWood -= info.cost.w
            bar.trainQueue.push({ type: train, remaining: info.buildTime })
          }
        }
        const enemyArmy = s.units.filter((u) => u.side === 'enemy' && u.type !== 'peasant')
        if (enemyArmy.length >= 5) {
          const playerTH = s.buildings.find((b) => b.side === 'player' && b.type === 'townhall' && b.hp > 0)
          if (playerTH) {
            for (const u of enemyArmy) {
              if (u.task === 'idle') {
                u.task = 'move'
                u.tx = (playerTH.c + 1) * TILE
                u.ty = (playerTH.r + 1) * TILE
              }
            }
          }
        }
      }
    }

    const simulate = (dt) => {
      const s = stateRef.current
      s.elapsed += dt

      // Fog of war
      for (let i = 0; i < s.fog.length; i++) if (s.fog[i] === 2) s.fog[i] = 1
      for (const u of s.units) {
        if (u.side !== 'player') continue
        revealArea(s, u.x / TILE, u.y / TILE, 5)
      }
      for (const b of s.buildings) {
        if (b.side !== 'player' || b.hp <= 0) continue
        revealArea(s, b.c + 1, b.r + 1, 6)
      }

      // Buildings tick
      for (const b of s.buildings) {
        if (b.hp <= 0) continue
        if (b.trainQueue.length) {
          const item = b.trainQueue[0]
          item.remaining -= dt
          if (item.remaining <= 0) {
            b.trainQueue.shift()
            const spawnC = b.c + Math.floor(BUILDINGS[b.type].tiles / 2)
            const spawnR = b.r + BUILDINGS[b.type].tiles
            addUnit(s, spawnC, spawnR, item.type, b.side)
          }
        }
        if (b.type === 'tower') {
          b.cd = Math.max(0, b.cd - dt)
          if (b.cd === 0) {
            const target = s.units.find((u) => u.side !== b.side && u.hp > 0
              && Math.hypot((b.c + 1) * TILE - u.x, (b.r + 1) * TILE - u.y) / TILE < BUILDINGS.tower.attack.range)
            if (target) {
              b.cd = BUILDINGS.tower.attack.cd
              s.projectiles.push({
                x: (b.c + 1) * TILE, y: (b.r + 1) * TILE,
                tx: target.x, ty: target.y,
                target, dmg: BUILDINGS.tower.attack.dmg, side: b.side, color: '#38bdf8',
                speed: 200, ttl: 2,
              })
            }
          }
        }
      }

      // Units tick
      for (const u of s.units) {
        if (u.hp <= 0) continue
        u.frame += dt * u.speed / TILE
        u.cd = Math.max(0, u.cd - dt)
        const info = UNITS[u.type]

        if (u.type === 'peasant') {
          if (u.task === 'gather' && u.target) {
            const n = u.target
            if (n.amount <= 0) { u.task = 'idle'; u.target = null; continue }
            const d = Math.hypot(n.c * TILE + TILE/2 - u.x, n.r * TILE + TILE/2 - u.y)
            if (d < 12) {
              const take = Math.min(n.amount, 3 * dt)
              n.amount -= take
              u.carry += take; u.carryType = n.type
              if (u.carry >= 8) {
                u.task = 'return'
                const th = nearestTownhall(s, u)
                if (th) { u.tx = (th.c + 1) * TILE; u.ty = (th.r + 1) * TILE }
              }
            } else {
              u.tx = n.c * TILE + TILE/2; u.ty = n.r * TILE + TILE/2
              moveToward(u, dt)
            }
            continue
          }
          if (u.task === 'return') {
            const d = Math.hypot(u.tx - u.x, u.ty - u.y)
            if (d < 20) {
              if (u.side === 'player') {
                if (u.carryType === 'gold') s.goldFloat += u.carry * 1.4
                else s.woodFloat += u.carry * 1.4
              } else {
                if (u.carryType === 'gold') s.enemyGold += u.carry * 1.4
                else s.enemyWood += u.carry * 1.4
              }
              u.carry = 0
              if (u.target && u.target.amount > 0) u.task = 'gather'
              else { u.task = 'idle'; u.target = null }
            } else moveToward(u, dt)
            continue
          }
        }

        if (u.task === 'attack' && u.target && (u.target.hp > 0)) {
          const t = u.target
          const tx = t.x != null ? t.x : t.c*TILE + TILE
          const ty = t.y != null ? t.y : t.r*TILE + TILE
          const d = Math.hypot(tx - u.x, ty - u.y) / TILE
          if (d <= info.range + (t.tiles ? t.tiles : 0)) {
            if (u.cd === 0) {
              u.cd = 0.9
              let dmg = info.dmg
              const mult = COUNTER[u.type]?.[t.type]
              if (mult) dmg *= mult
              t.hp -= dmg
              s.damageNums.push({ x: tx, y: ty - 8, val: Math.round(dmg), life: 0.6, color: u.side === 'player' ? '#fef08a' : '#fecaca' })
              if (info.range > 1.5) {
                s.projectiles.push({
                  x: u.x, y: u.y, tx, ty, target: t, dmg: 0, side: u.side, color: '#a3e635',
                  speed: 240, ttl: 1,
                })
              }
              if (t.hp <= 0) {
                for (let i = 0; i < 6; i++) {
                  const a = Math.random() * Math.PI * 2
                  s.particles.push({ x: tx, y: ty, vx: Math.cos(a)*50, vy: Math.sin(a)*50, life: 0.5, color: '#ef4444' })
                }
              }
            }
          } else {
            u.tx = tx; u.ty = ty
            moveToward(u, dt)
          }
          continue
        }

        if (u.task === 'move' || u.task === 'attack') {
          moveToward(u, dt)
          if (Math.hypot(u.tx - u.x, u.ty - u.y) < 4) u.task = 'idle'
          continue
        }

        if (u.task === 'idle' && u.type !== 'peasant') {
          const enemy = s.units.find((v) => v.side !== u.side && v.hp > 0 && Math.hypot(v.x - u.x, v.y - u.y) / TILE < 4.5)
          if (enemy) { u.task = 'attack'; u.target = enemy }
        }
      }

      const liveProj = []
      for (const p of s.projectiles) {
        p.ttl -= dt
        if (p.ttl <= 0) continue
        const a = Math.atan2(p.ty - p.y, p.tx - p.x)
        p.x += Math.cos(a) * p.speed * dt
        p.y += Math.sin(a) * p.speed * dt
        if (Math.hypot(p.tx - p.x, p.ty - p.y) < 8) {
          if (p.target && p.target.hp > 0 && p.dmg > 0) {
            p.target.hp -= p.dmg
            s.damageNums.push({ x: (p.target.x || p.tx), y: (p.target.y || p.ty) - 8, val: Math.round(p.dmg), life: 0.5, color: '#38bdf8' })
          }
          continue
        }
        liveProj.push(p)
      }
      s.projectiles = liveProj

      s.units = s.units.filter((u) => u.hp > 0)
      // Keep dead buildings for one frame to allow rubble, then filter
      s.buildings = s.buildings.filter((b) => b.hp > -100)

      for (const p of s.particles) {
        p.x += p.vx * dt; p.y += p.vy * dt
        p.vx *= 0.9; p.vy *= 0.9
        p.life -= dt
      }
      s.particles = s.particles.filter((p) => p.life > 0)
      for (const d of s.damageNums) { d.life -= dt; d.y -= 12 * dt }
      s.damageNums = s.damageNums.filter((d) => d.life > 0)

      runAI(s, dt)

      const playerAlive = s.buildings.some((b) => b.side === 'player' && b.hp > 0)
      const enemyAlive  = s.buildings.some((b) => b.side === 'enemy'  && b.hp > 0)
      if (!playerAlive && s.running) {
        s.running = false; setStatus('over'); sfxRef.current.death()
      } else if (!enemyAlive && s.running) {
        s.running = false; setStatus('won'); sfxRef.current.win()
        const score = Math.floor(300 - s.elapsed) + s.units.filter((u) => u.side === 'player').length * 10
        s.score = Math.max(0, score)
        try { if (s.score > best) { localStorage.setItem('sid-rts-best', String(s.score)); setBest(s.score) } } catch {}
      }
    }

    const draw = () => {
      const s = stateRef.current; if (!s) return
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const t = s.map[r * COLS + c]
          let fill = '#2b5b34'
          if ((c + r) % 2 === 1) fill = '#26522f'
          if (t === T.FOREST) fill = '#134e29'
          else if (t === T.ROCK) fill = '#57534e'
          ctx.fillStyle = fill
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE)
          if (t === T.FOREST) {
            ctx.fillStyle = '#065f46'
            ctx.beginPath(); ctx.arc(c*TILE+TILE/2, r*TILE+TILE/2, 6, 0, Math.PI*2); ctx.fill()
            ctx.fillStyle = '#022c22'
            ctx.fillRect(c*TILE+TILE/2-1, r*TILE+TILE/2+2, 2, 4)
          } else if (t === T.ROCK) {
            ctx.fillStyle = '#78716c'
            ctx.beginPath(); ctx.moveTo(c*TILE+4, r*TILE+TILE-2)
            ctx.lineTo(c*TILE+TILE/2, r*TILE+4); ctx.lineTo(c*TILE+TILE-4, r*TILE+TILE-2); ctx.closePath(); ctx.fill()
          }
        }
      }

      for (const n of s.resNodes) {
        if (n.amount <= 0) continue
        ctx.fillStyle = n.type === 'gold' ? '#fbbf24' : '#a16207'
        ctx.beginPath(); ctx.arc(n.c*TILE+TILE/2, n.r*TILE+TILE/2, 6 + Math.min(3, n.amount/80), 0, Math.PI*2); ctx.fill()
        ctx.strokeStyle = '#000'; ctx.stroke()
      }

      for (const b of s.buildings) {
        if (b.hp <= 0) {
          const size = BUILDINGS[b.type].tiles * TILE
          ctx.fillStyle = 'rgba(120,120,120,0.35)'
          ctx.fillRect(b.c*TILE, b.r*TILE, size, size)
          continue
        }
        const info = BUILDINGS[b.type]
        const size = info.tiles * TILE
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.fillRect(b.c*TILE + 3, b.r*TILE + 3, size, size)
        ctx.fillStyle = b.side === 'player' ? info.color : '#f87171'
        ctx.fillRect(b.c*TILE, b.r*TILE, size, size)
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5
        ctx.strokeRect(b.c*TILE, b.r*TILE, size, size)
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.fillRect(b.c*TILE, b.r*TILE, size, 6)
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.fillRect(b.c*TILE + 4, b.r*TILE + 10, 6, 6)
        ctx.fillRect(b.c*TILE + size - 10, b.r*TILE + 10, 6, 6)
        if (b.hp < b.maxHp) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)'
          ctx.fillRect(b.c*TILE, b.r*TILE - 5, size, 3)
          ctx.fillStyle = b.hp/b.maxHp > 0.5 ? '#22c55e' : '#ef4444'
          ctx.fillRect(b.c*TILE, b.r*TILE - 5, size * (b.hp/b.maxHp), 3)
        }
        if (b.trainQueue.length) {
          const t = b.trainQueue[0]
          const info2 = UNITS[t.type]
          const pct = 1 - t.remaining / info2.buildTime
          ctx.fillStyle = 'rgba(0,0,0,0.6)'
          ctx.fillRect(b.c*TILE, b.r*TILE + size - 4, size, 4)
          ctx.fillStyle = '#38bdf8'
          ctx.fillRect(b.c*TILE, b.r*TILE + size - 4, size * pct, 4)
        }
      }

      for (const u of s.units) {
        const info = UNITS[u.type]
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.beginPath(); ctx.ellipse(u.x, u.y + 5, info.size, info.size*0.4, 0, 0, Math.PI*2); ctx.fill()
        const bounce = u.task === 'move' || u.task === 'gather' || u.task === 'return' ? Math.sin(u.frame) * 1.5 : 0
        ctx.fillStyle = u.side === 'player' ? info.color : '#fca5a5'
        ctx.beginPath(); ctx.arc(u.x, u.y - bounce, info.size, 0, Math.PI*2); ctx.fill()
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; ctx.stroke()
        ctx.fillStyle = '#000'
        if (u.type === 'sword') {
          ctx.fillRect(u.x + info.size - 1, u.y - info.size, 2, 6)
        } else if (u.type === 'archer') {
          ctx.strokeStyle = '#000'
          ctx.beginPath(); ctx.arc(u.x + info.size, u.y - 2, 4, Math.PI*0.5, Math.PI*1.5); ctx.stroke()
        } else if (u.type === 'cavalry') {
          ctx.fillRect(u.x - 2, u.y + info.size, 6, 2)
        } else if (u.type === 'peasant' && u.carry > 0) {
          ctx.fillStyle = u.carryType === 'gold' ? '#fbbf24' : '#78350f'
          ctx.fillRect(u.x - 2, u.y - info.size - 4, 4, 3)
        }
        if (s.selection.has(u.id)) {
          ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.ellipse(u.x, u.y + 5, info.size + 2, info.size*0.55, 0, 0, Math.PI*2); ctx.stroke()
        }
        if (u.hp < u.maxHp) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)'
          ctx.fillRect(u.x - info.size, u.y - info.size - 5, info.size * 2, 3)
          ctx.fillStyle = u.hp/u.maxHp > 0.5 ? '#22c55e' : '#ef4444'
          ctx.fillRect(u.x - info.size, u.y - info.size - 5, info.size * 2 * (u.hp/u.maxHp), 3)
        }
      }

      for (const p of s.projectiles) {
        ctx.fillStyle = p.color
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill()
      }

      for (const p of s.particles) {
        ctx.globalAlpha = Math.max(0, p.life / 0.5)
        ctx.fillStyle = p.color
        ctx.fillRect(p.x, p.y, 2, 2)
      }
      ctx.globalAlpha = 1

      ctx.font = 'bold 10px ui-monospace, monospace'; ctx.textAlign = 'center'
      for (const d of s.damageNums) {
        const alpha = Math.min(1, d.life/0.6)
        ctx.fillStyle = d.color + Math.floor(alpha * 255).toString(16).padStart(2,'0')
        ctx.fillText(String(d.val), d.x, d.y)
      }

      if (showFog) {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const v = s.fog[r * COLS + c]
            if (v === 0) { ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(c*TILE, r*TILE, TILE, TILE) }
            else if (v === 1) { ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(c*TILE, r*TILE, TILE, TILE) }
          }
        }
      }

      if (s.dragStart && s.dragEnd) {
        const x0 = Math.min(s.dragStart.x, s.dragEnd.x)
        const y0 = Math.min(s.dragStart.y, s.dragEnd.y)
        const w = Math.abs(s.dragEnd.x - s.dragStart.x)
        const h = Math.abs(s.dragEnd.y - s.dragStart.y)
        ctx.fillStyle = 'rgba(251,191,36,0.15)'
        ctx.fillRect(x0, y0, w, h)
        ctx.strokeStyle = '#fbbf24'; ctx.setLineDash([4, 3]); ctx.strokeRect(x0, y0, w, h); ctx.setLineDash([])
      }
    }

    const syncHud = () => {
      const s = stateRef.current; if (!s) return
      setGold(Math.floor(s.goldFloat))
      setWood(Math.floor(s.woodFloat))
      const used = s.units.filter((u) => u.side === 'player').length
      const cap = 6 + s.buildings.filter((b) => b.side === 'player' && b.type === 'farm' && b.hp > 0).length * BUILDINGS.farm.popCap
      setPop({ used, cap })
    }

    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = stateRef.current
      if (s && !s.paused && s.running) simulate(dt)
      draw()
      hudTimer += dt
      if (hudTimer > 0.15) { hudTimer = 0; syncHud() }
      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [showFog, best])

  const s = stateRef.current
  const playerTH = s?.buildings.find((b) => b.side === 'player' && b.type === 'townhall' && b.hp > 0)
  const playerBar = s?.buildings.find((b) => b.side === 'player' && b.type === 'barracks' && b.hp > 0)

  const onPause = () => {
    if (!stateRef.current) return
    stateRef.current.paused = !stateRef.current.paused
    setStatus(stateRef.current.paused ? 'paused' : 'playing')
  }
  const onRestart = () => reset()

  return (
    <GameShell
      title="Mini RTS"
      category="Strategy"
      score={pop.used}
      best={best}
      level={Math.floor((stateRef.current?.elapsed || 0) / 30) + 1}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={onRestart}
      onPause={onPause}
      extraStats={
        <>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Gold</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-amber-300">{gold}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Wood</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-lime-300">{wood}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Pop</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-cyan-300">{pop.used}/{pop.cap}</span>
          </div>
        </>
      }
      controls={[
        { key: 'Drag', label: 'Box select' },
        { key: 'Right-click', label: 'Move / attack' },
        { key: 'B', label: 'Build farm' },
        { key: 'V', label: 'Build barracks' },
        { key: 'T', label: 'Build tower' },
        { key: 'F', label: 'Toggle fog' },
      ]}
      footer={
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Build (click to place)</div>
            <div className="grid grid-cols-3 gap-2">
              {['farm', 'barracks', 'tower'].map((k) => {
                const info = BUILDINGS[k]
                return (
                  <button
                    type="button"
                    key={k}
                    onClick={() => setSelBuilding(k === selBuilding ? null : k)}
                    className={`rounded-lg border p-2 text-left transition-all ${selBuilding === k ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 hover:border-white/30'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-3 h-3 rounded-sm" style={{ background: info.color }} />
                      <span className="text-xs font-semibold capitalize">{k}</span>
                    </div>
                    <div className="text-[10px] text-amber-300">{info.cost.g}g · {info.cost.w}w</div>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Train peasant</div>
            <button
              type="button"
              onClick={() => playerTH && trainUnit(playerTH.id, 'peasant')}
              disabled={!playerTH}
              className="w-full px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-semibold hover:bg-amber-500/30 disabled:opacity-40"
            >
              +Peasant · 15g
            </button>
            <div className="mt-2 text-[10px] text-white/50">
              Queue: {playerTH?.trainQueue.length || 0}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Barracks</div>
            <div className="grid grid-cols-3 gap-1.5">
              {['sword', 'archer', 'cavalry'].map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => playerBar && trainUnit(playerBar.id, k)}
                  disabled={!playerBar}
                  className="rounded-lg border border-white/15 hover:border-white/30 p-1.5 text-[10px] font-semibold disabled:opacity-40"
                  style={{ color: UNITS[k].color }}
                >
                  <div className="capitalize">{k}</div>
                  <div className="text-white/60">{UNITS[k].cost.g}g·{UNITS[k].cost.w}w</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      }
      overlay={status === 'over' || status === 'won' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-4xl font-bold bg-gradient-to-r from-amber-300 to-rose-300 bg-clip-text text-transparent mb-2">
              {status === 'won' ? 'Victory' : 'Defeated'}
            </div>
            <button
              type="button"
              onClick={onRestart}
              className="px-5 py-2 rounded-lg bg-white text-black font-semibold hover:bg-white/90"
            >
              New game
            </button>
          </div>
        </div>
      ) : null}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onContextMenu={onContextMenu}
        onTouchStart={(e) => { const t = e.touches[0]; if (t) onMouseDown({ button: 0, clientX: t.clientX, clientY: t.clientY }) }}
        onTouchMove={(e) => { const t = e.touches[0]; if (t) onMouseMove({ clientX: t.clientX, clientY: t.clientY }) }}
        onTouchEnd={(e) => { const t = e.changedTouches[0]; if (t) onMouseUp({ clientX: t.clientX, clientY: t.clientY }) }}
        onKeyDown={(e) => {
          if (e.key === 'b' || e.key === 'B') setSelBuilding('farm')
          if (e.key === 'v' || e.key === 'V') setSelBuilding('barracks')
          if (e.key === 't' || e.key === 'T') setSelBuilding('tower')
          if (e.key === 'f' || e.key === 'F') setShowFog((v) => !v)
        }}
        tabIndex={0}
        style={{ width: '100%', maxHeight: '80vh', display: 'block', cursor: selBuilding ? 'cell' : 'default' }}
      />
    </GameShell>
  )
}
