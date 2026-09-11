// FarmingSim.jsx — 6×6 tile-based farming loop
//
// Sim game #4 of 5. Player tills soil, plants seeds, waters, watches crops
// grow through 4 stages (seed → sprout → mature → harvest-ready), harvests
// to inventory, and sells to gain gold.
//
// World state:
//   • Tiles are one of: grass, tilled, watered, planted.
//   • A planted tile carries: seedId, growthStage (0..3), stageProgress (0..1),
//     wetness (0..1). Growth advances only while wetness > 0. Rain during
//     rainy weather auto-waters every tile.
//
// Seasons:
//   Spring · Summer · Autumn · Winter, each 5 in-game days (1 tick/sec = 1
//   in-game hour → 24 real seconds per day → 120 real seconds per season).
//   Different seeds are only plantable in their allowed seasons — winter is
//   fallow, so watch the countdown.
//
// Crops (7):
//   Tomato (spring/summer), Corn (summer), Wheat (spring/autumn),
//   Pumpkin (autumn), Blueberry (summer/autumn), Carrot (spring),
//   Sunflower (summer). Each has: seedCost, sellPrice, growthTime
//   (in game hours), season list.
//
// Weather:
//   Sunny, Rain, Clouds. Rolled once per in-game day. Rain waters everything
//   automatically; clouds slow growth a hair.
//
// Persistence:
//   Whole state → localStorage on every save (throttled ~1/sec via a ref) so
//   quitting mid-game recovers exactly where you left off.
//
// Rendering:
//   Pure CSS tile grid. Each tile is a colour + emoji sprite; growth stages
//   are represented by scaling the emoji from 30% → 100% + colour tint. No
//   canvas needed — 36 tiles is trivial to render at 60fps.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const RULES = [
  { heading: 'Goal', body: 'Grow crops, harvest them, sell them, buy more seeds. There\'s no fixed win state — best score is peak gold total. The clock ticks whether you\'re playing or not (with a save cap on offline time).' },
  { heading: 'Controls', body: 'Click a tool from the tool bar. Click a tile to apply it.\n⛏️ Hoe — tills grass into soil.\n💧 Watering — waters a tilled tile.\n🌱 Plant — sows selected seed on a watered tile.\n🧺 Harvest — picks a ripe crop into inventory.\n🗑️ Clear — returns any tile to grass.' },
  { heading: 'Crops', body: 'Seven crops with their own season / cost / growth time / sell price:\nTomato (spring/summer) — 8 → 22 in 12 h.\nCorn (summer) — 12 → 36 in 18 h.\nWheat (spring/autumn) — 5 → 14 in 8 h.\nPumpkin (autumn) — 20 → 80 in 30 h.\nBlueberry (summer/autumn) — 14 → 40 in 20 h.\nCarrot (spring) — 6 → 18 in 10 h.\nSunflower (summer) — 10 → 30 in 14 h.' },
  { heading: 'Seasons', body: 'Spring → Summer → Autumn → Winter, each 5 in-game days. Winter is fallow (growth multiplier 0). Different crops only accept plants in their allowed seasons.' },
  { heading: 'Weather', body: 'Rolled once per in-game day. Sunny (default) — normal growth. Rain — automatically waters every tile that day. Cloudy — 15% slower growth.' },
  { heading: 'Persistence', body: 'The whole farm is saved to localStorage on every action (throttled). Close the tab, reopen it days later — everything is exactly where you left it, including partial growth stages.' },
  { heading: 'Difficulty', body: 'Easy = 500 starting gold, short 12 s days (game moves fast), stable weather, cheap crop variety. Hard = 20 starting gold, long 60 s days, wild weather, only cheap crops. Custom exposes all four.' },
]

const DIFFICULTIES = {
  Easy:   { startFunds: 500, dayLength: 12, weatherVariance: 0.2, cropCount: 7 },
  Medium: { startFunds: 50,  dayLength: 24, weatherVariance: 1.0, cropCount: 7 },
  Hard:   { startFunds: 20,  dayLength: 60, weatherVariance: 2.0, cropCount: 3 },
}

const CUSTOM_SCHEMA = {
  startFunds:      { label: 'Starting gold',       min: 10,  max: 800, step: 10, default: 50 },
  dayLength:       { label: 'Day length (s)',      min: 8,   max: 90,  step: 2,  default: 24 },
  weatherVariance: { label: 'Weather variance',    min: 0.1, max: 3.0, step: 0.1, default: 1.0 },
  cropCount:       { label: 'Crop variety',        min: 2,   max: 7,   step: 1,  default: 7 },
}

const ROWS = 6
const COLS = 6
const TILES = ROWS * COLS

// ── Crops ──
const CROPS = {
  tomato:   { name: 'Tomato',    icon: '🍅', seed: 8,   sell: 22,  time: 12, seasons: ['spring', 'summer'] },
  corn:     { name: 'Corn',      icon: '🌽', seed: 12,  sell: 36,  time: 18, seasons: ['summer'] },
  wheat:    { name: 'Wheat',     icon: '🌾', seed: 5,   sell: 14,  time: 8,  seasons: ['spring', 'autumn'] },
  pumpkin:  { name: 'Pumpkin',   icon: '🎃', seed: 20,  sell: 80,  time: 30, seasons: ['autumn'] },
  blueberry:{ name: 'Blueberry', icon: '🫐', seed: 14,  sell: 40,  time: 20, seasons: ['summer', 'autumn'] },
  carrot:   { name: 'Carrot',    icon: '🥕', seed: 6,   sell: 18,  time: 10, seasons: ['spring'] },
  sunflower:{ name: 'Sunflower', icon: '🌻', seed: 10,  sell: 30,  time: 14, seasons: ['summer'] },
}
const CROP_IDS = Object.keys(CROPS)

const SEASONS = [
  { id: 'spring', name: 'Spring', tint: 'from-emerald-500/30 to-lime-500/10',   emoji: '🌸', grow: 1.0 },
  { id: 'summer', name: 'Summer', tint: 'from-amber-500/30 to-orange-500/10',   emoji: '☀️', grow: 1.2 },
  { id: 'autumn', name: 'Autumn', tint: 'from-orange-500/30 to-rose-500/10',    emoji: '🍂', grow: 0.9 },
  { id: 'winter', name: 'Winter', tint: 'from-sky-500/30 to-slate-500/10',      emoji: '❄️', grow: 0 },
]

const WEATHERS = [
  { id: 'sun',   name: 'Sunny',  emoji: '☀️',  waters: false, growMult: 1.0 },
  { id: 'rain',  name: 'Rain',   emoji: '🌧️', waters: true,  growMult: 1.0 },
  { id: 'cloud', name: 'Cloudy', emoji: '☁️',  waters: false, growMult: 0.85 },
]

// Tools
const TOOLS = [
  { id: 'hoe',    name: 'Hoe',       icon: '⛏️', desc: 'Till grass → tillable soil' },
  { id: 'water', name: 'Watering',   icon: '💧', desc: 'Water a tilled tile' },
  { id: 'seed',   name: 'Plant',     icon: '🌱', desc: 'Plant selected seed on watered tile' },
  { id: 'harvest',name: 'Harvest',   icon: '🧺', desc: 'Collect ripe crops → inventory' },
  { id: 'sell',   name: 'Clear',     icon: '🗑️', desc: 'Return a tile to grass' },
]

const STORAGE_KEY = 'sid-farming-sim-v1'
const HOUR_MS = 1000              // 1 real second = 1 in-game hour
const DAY_HOURS = 24

const makeGrass = () => ({ kind: 'grass' })

function initialState(startFunds = 50) {
  return {
    tiles: Array.from({ length: TILES }, makeGrass),
    inventory: {},                 // crop id → count
    seeds: { tomato: 5, wheat: 5 }, // starter seeds
    gold: startFunds,
    hour: 0,                       // total hours elapsed
    weather: 'sun',
    lastTs: Date.now(),
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!Array.isArray(s.tiles) || s.tiles.length !== TILES) return null
    return s
  } catch { return null }
}

function seasonOf(hour) {
  const day = Math.floor(hour / DAY_HOURS)
  const seasonIdx = Math.floor(day / 5) % 4
  return SEASONS[seasonIdx]
}
function dayInSeason(hour) {
  const day = Math.floor(hour / DAY_HOURS)
  return (day % 5) + 1
}

export default function FarmingSim() {
  const boot = useMemo(() => loadState() || initialState(), [])
  const [tiles, setTiles]        = useState(boot.tiles)
  const [inventory, setInventory]= useState(boot.inventory || {})
  const [seeds, setSeeds]        = useState(boot.seeds || {})
  const [gold, setGold]          = useState(boot.gold ?? 50)
  const [difficulty, setDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState({
    startFunds: CUSTOM_SCHEMA.startFunds.default,
    dayLength: CUSTOM_SCHEMA.dayLength.default,
    weatherVariance: CUSTOM_SCHEMA.weatherVariance.default,
    cropCount: CUSTOM_SCHEMA.cropCount.default,
  })
  const cfg = difficulty === 'Custom' ? customValues : DIFFICULTIES[difficulty]
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg }, [cfg])
  const [hour, setHour]          = useState(boot.hour || 0)
  const [weather, setWeather]    = useState(boot.weather || 'sun')
  const [tool, setTool]          = useState('hoe')
  const [selectedSeed, setSeedSel] = useState('tomato')
  const [soundOn, setSoundOn]    = useState(true)
  const [flash, setFlash]        = useState(null)

  const sfx = useMemo(() => getSfx(), [])
  useEffect(() => sfx.setEnabled(soundOn), [soundOn, sfx])

  const season = seasonOf(hour)
  const seasonDay = dayInSeason(hour)
  const weatherObj = WEATHERS.find(w => w.id === weather) || WEATHERS[0]

  // Persist.
  const saveThrottleRef = useRef(0)
  useEffect(() => {
    const now = Date.now()
    if (now - saveThrottleRef.current < 500) return
    saveThrottleRef.current = now
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tiles, inventory, seeds, gold, hour, weather, lastTs: now,
      }))
    } catch { /* quota — ignore */ }
  }, [tiles, inventory, seeds, gold, hour, weather])

  // ── Time tick ──
  useEffect(() => {
    let last = performance.now()
    const step = () => {
      const t = performance.now()
      if (t - last >= HOUR_MS) {
        last = t
        setHour(h => {
          const next = h + 1
          // Advance crops.
          setTiles(prevTiles => advanceCrops(prevTiles, next, weatherObj, season))
          // Roll weather at each new day.
          if (next % DAY_HOURS === 0) {
            const roll = Math.random()
            const newW = roll < 0.55 ? 'sun' : roll < 0.85 ? 'cloud' : 'rain'
            setWeather(newW)
          }
          return next
        })
      }
      raf = requestAnimationFrame(step)
    }
    let raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weather, season.id])

  const showFlash = (text, kind = 'ok') => {
    setFlash({ text, kind, ts: Date.now() })
    setTimeout(() => setFlash(f => (f && f.text === text ? null : f)), 1400)
  }

  // ── Tile action ──
  const onTileClick = (idx) => {
    const tile = tiles[idx]
    if (tool === 'hoe') {
      if (tile.kind !== 'grass') return
      setTiles(t => t.map((x, i) => i === idx ? { kind: 'tilled', wetness: 0 } : x))
      sfx.hit()
    } else if (tool === 'water') {
      if (tile.kind === 'grass') return
      setTiles(t => t.map((x, i) => i === idx ? { ...x, wetness: 1, kind: x.kind === 'tilled' ? 'watered' : x.kind } : x))
      sfx.pop()
    } else if (tool === 'seed') {
      if (tile.kind !== 'watered' && tile.kind !== 'tilled') { showFlash('Till + water first'); return }
      const crop = CROPS[selectedSeed]
      if (!crop) return
      if (!crop.seasons.includes(season.id)) { showFlash(`${crop.name} won't grow in ${season.name}`); return }
      if (!(seeds[selectedSeed] > 0)) { showFlash('Out of seeds'); return }
      setSeeds(s => ({ ...s, [selectedSeed]: (s[selectedSeed] || 0) - 1 }))
      setTiles(t => t.map((x, i) => i === idx ? {
        kind: 'planted',
        seedId: selectedSeed,
        stage: 0,
        progress: 0,
        wetness: x.wetness || 0.5,
        plantedAt: hour,
      } : x))
      sfx.chirp()
    } else if (tool === 'harvest') {
      if (tile.kind !== 'planted' || tile.stage < 3) { showFlash('Not ripe'); return }
      const cropId = tile.seedId
      setInventory(inv => ({ ...inv, [cropId]: (inv[cropId] || 0) + 1 }))
      setTiles(t => t.map((x, i) => i === idx ? { kind: 'tilled', wetness: 0 } : x))
      sfx.coin()
    } else if (tool === 'sell') {
      setTiles(t => t.map((x, i) => i === idx ? { kind: 'grass' } : x))
      sfx.pop()
    }
  }

  // ── Buy seeds / sell inventory ──
  const buySeed = (id, count = 1) => {
    const crop = CROPS[id]
    const cost = crop.seed * count
    if (gold < cost) { showFlash('Not enough gold'); return }
    setGold(g => g - cost)
    setSeeds(s => ({ ...s, [id]: (s[id] || 0) + count }))
    sfx.coin()
  }
  const sellCrop = (id, count = 1) => {
    const have = inventory[id] || 0
    if (have < count) { showFlash('None to sell'); return }
    const crop = CROPS[id]
    setInventory(inv => ({ ...inv, [id]: have - count }))
    setGold(g => g + crop.sell * count)
    sfx.coin()
  }
  const sellAll = () => {
    let total = 0
    for (const [id, count] of Object.entries(inventory)) {
      if (count > 0) total += (CROPS[id]?.sell || 0) * count
    }
    if (total === 0) { showFlash('Empty basket'); return }
    setGold(g => g + total)
    setInventory({})
    sfx.win()
  }

  const resetAll = () => {
    if (!confirm('Reset the farm? This wipes gold, tiles, and inventory.')) return
    const fresh = initialState(cfgRef.current.startFunds)
    setTiles(fresh.tiles); setInventory({}); setSeeds(fresh.seeds)
    setGold(fresh.gold); setHour(0); setWeather('sun')
  }

  // Derived: total crops in inventory + value.
  const invTotal = useMemo(() => {
    let value = 0, count = 0
    for (const [id, n] of Object.entries(inventory)) {
      value += (CROPS[id]?.sell || 0) * n
      count += n
    }
    return { value, count }
  }, [inventory])

  return (
    <GameShell
      title="Farming Sim"
      category="Sim"
      score={gold}
      best={invTotal.value}
      level={Math.floor(hour / DAY_HOURS) + 1}
      status="playing"
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn(v => !v)}
      onPause={() => {}}
      onRestart={resetAll}
      rules={RULES}
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
      extraStats={
        <div className="flex gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Season</span>
            <span className="text-lg font-bold text-emerald-300">{season.emoji} {season.name}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Day</span>
            <span className="text-lg font-bold text-white">{seasonDay} / 5</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Weather</span>
            <span className="text-lg font-bold text-cyan-300">{weatherObj.emoji} {weatherObj.name}</span>
          </div>
        </div>
      }
      controls={[
        { key: 'Click', label: 'Use selected tool on tile' },
        { key: 'Tap',   label: 'Touch (mobile)' },
      ]}
    >
      <div className="p-3 sm:p-4 flex flex-col gap-3 lg:flex-row">
        {/* Field */}
        <div className="flex-1 min-w-0">
          <div className={`p-3 rounded-xl border border-white/10 bg-gradient-to-br ${season.tint} bg-[#0b0b12]`}>
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
            >
              {tiles.map((t, i) => <Tile key={i} tile={t} onClick={() => onTileClick(i)} tool={tool} />)}
            </div>
          </div>

          {/* Toolbar */}
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {TOOLS.map((tl) => (
              <button
                key={tl.id}
                type="button"
                onClick={() => setTool(tl.id)}
                className={`p-2 rounded-lg border text-xs flex flex-col items-center gap-0.5 transition-colors ${tool === tl.id ? 'bg-amber-500/25 border-amber-400/60 text-white' : 'bg-white/5 border-white/10 hover:border-white/25 text-white/80'}`}
                title={tl.desc}
              >
                <span className="text-xl leading-none">{tl.icon}</span>
                <span className="text-[10px]">{tl.name}</span>
              </button>
            ))}
          </div>
          {flash && (
            <div className={`mt-2 text-xs text-center ${flash.kind === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>
              {flash.text}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="w-full lg:w-80 shrink-0 space-y-3">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] uppercase tracking-widest text-white/40">Seeds</div>
              <span className="text-xs text-amber-300 font-mono">💰 {gold}g</span>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {CROP_IDS.map((id) => {
                const c = CROPS[id]
                const own = seeds[id] || 0
                const inSeason = c.seasons.includes(season.id)
                const isPicked = selectedSeed === id
                return (
                  <div key={id} className={`px-2 py-1.5 rounded-lg border flex items-center gap-2 ${isPicked ? 'bg-amber-500/15 border-amber-400/40' : 'bg-white/5 border-white/10'}`}>
                    <button
                      type="button"
                      onClick={() => setSeedSel(id)}
                      className="flex-1 text-left flex items-center gap-2"
                    >
                      <span className="text-lg leading-none">{c.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold flex items-center gap-1">
                          {c.name}
                          {!inSeason && <span className="text-[9px] text-white/40 border border-white/15 rounded px-1">off</span>}
                        </div>
                        <div className="text-[10px] text-white/50">
                          seed {c.seed}g · sell {c.sell}g · {c.time}h grow
                        </div>
                      </div>
                    </button>
                    <span className="text-xs text-white/80 font-mono w-6 text-right">×{own}</span>
                    <button
                      type="button"
                      onClick={() => buySeed(id)}
                      disabled={gold < c.seed}
                      className={`px-2 py-1 rounded text-[11px] font-semibold border ${gold >= c.seed ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25' : 'border-white/10 bg-white/5 text-white/30 cursor-not-allowed'}`}
                    >
                      Buy
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] uppercase tracking-widest text-white/40">Inventory</div>
              <span className="text-[11px] text-white/50">{invTotal.count} items · <span className="text-amber-300">{invTotal.value}g</span></span>
            </div>
            <div className="space-y-1">
              {CROP_IDS.filter((id) => (inventory[id] || 0) > 0).length === 0 && (
                <div className="text-[11px] text-white/50 italic">Empty. Harvest ripe crops to fill it.</div>
              )}
              {CROP_IDS.map((id) => {
                const n = inventory[id] || 0
                if (!n) return null
                const c = CROPS[id]
                return (
                  <div key={id} className="flex items-center gap-2 px-2 py-1 rounded bg-white/5 border border-white/10 text-xs">
                    <span className="text-base leading-none">{c.icon}</span>
                    <span className="flex-1">{c.name}</span>
                    <span className="text-white/60 font-mono">×{n}</span>
                    <button
                      type="button"
                      onClick={() => sellCrop(id)}
                      className="px-2 py-0.5 rounded border border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 text-[10px] font-semibold"
                    >Sell</button>
                  </div>
                )
              })}
            </div>
            {invTotal.count > 0 && (
              <button
                type="button"
                onClick={sellAll}
                className="mt-2 w-full px-3 py-2 rounded-lg font-semibold border border-amber-400/40 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 text-sm"
              >
                Sell all → +{invTotal.value}g
              </button>
            )}
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-[11px] text-white/60 leading-relaxed">
            <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Loop</div>
            <ol className="list-decimal pl-4 space-y-0.5">
              <li>Hoe grass → tilled soil</li>
              <li>Water tilled → watered</li>
              <li>Plant a seed matching this season</li>
              <li>Wait — rain speeds things up</li>
              <li>Harvest ripe crops, sell for gold</li>
            </ol>
          </div>
        </div>
      </div>
    </GameShell>
  )
}

// ── Tile ──
function Tile({ tile, onClick, tool }) {
  const base = 'aspect-square rounded-lg border cursor-pointer flex items-center justify-center select-none transition-colors'
  let bg = 'bg-green-800/60 border-green-700/40 hover:border-green-500/60'
  let content = null

  if (tile.kind === 'tilled') {
    bg = 'bg-amber-950/70 border-amber-800/50 hover:border-amber-500/50'
  } else if (tile.kind === 'watered') {
    bg = 'bg-amber-900/80 border-cyan-500/40 hover:border-cyan-300/60 shadow-inner'
  } else if (tile.kind === 'planted') {
    const crop = CROPS[tile.seedId]
    const stage = tile.stage
    const scale = stage === 0 ? 0.35 : stage === 1 ? 0.55 : stage === 2 ? 0.78 : 1
    const ready = stage === 3
    bg = ready
      ? 'bg-amber-800/70 border-yellow-400/60 hover:border-yellow-300 shadow-[0_0_16px_-4px_rgba(251,191,36,0.4)]'
      : `bg-amber-900/80 border-amber-700/50 hover:border-amber-500/60`
    content = (
      <span
        className="leading-none transition-transform pointer-events-none"
        style={{
          fontSize: '2rem',
          transform: `scale(${scale}) translateY(${(1 - scale) * 6}px)`,
          filter: ready ? 'drop-shadow(0 0 8px rgba(251,191,36,0.6))' : `saturate(${0.4 + stage * 0.2})`,
        }}
      >
        {crop?.icon || '🌱'}
      </span>
    )
  }

  // Wetness dot
  const wet = tile.wetness > 0
  return (
    <div className={`${base} ${bg}`} onClick={onClick} title={tile.kind}>
      {content}
      {wet && tile.kind !== 'grass' && (
        <span className="absolute mt-6 ml-6 w-1.5 h-1.5 rounded-full bg-cyan-400" style={{ position: 'relative' }} />
      )}
      {/* Tool preview ring */}
      {tool && !content && tile.kind === 'grass' && tool === 'hoe' && (
        <span className="text-emerald-500/40 text-xs">·</span>
      )}
    </div>
  )
}

// ── Time-step: advance every planted tile by 1 in-game hour ──
function advanceCrops(tiles, hour, weather, season) {
  return tiles.map(t => {
    if (t.kind === 'planted') {
      const crop = CROPS[t.seedId]
      if (!crop) return t
      // Growth requires water and non-winter.
      let wet = Math.max(0, (t.wetness || 0) - 0.03)      // slow dry
      if (weather.waters) wet = 1                          // rain restocks
      const canGrow = wet > 0 && season.grow > 0
      const dt = canGrow ? (1 / crop.time) * season.grow * weather.growMult : 0
      let progress = (t.progress || 0) + dt
      let stage = t.stage
      while (progress >= 1 && stage < 3) { progress -= 1; stage++ }
      progress = stage >= 3 ? 1 : progress
      return { ...t, wetness: wet, progress, stage }
    }
    if (t.kind === 'watered') {
      // Watered dries back to tilled after a while.
      let wet = Math.max(0, (t.wetness || 1) - 0.02)
      if (weather.waters) wet = 1
      return wet <= 0 ? { kind: 'tilled', wetness: 0 } : { ...t, wetness: wet }
    }
    if (t.kind === 'tilled' && weather.waters) {
      return { kind: 'watered', wetness: 1 }
    }
    return t
  })
}
