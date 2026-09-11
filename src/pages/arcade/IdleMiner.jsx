// IdleMiner.jsx — Idle-clicker mining simulation
//
// Sim game #3 of 5. Click to swing your pickaxe, earn gold per swing, spend
// gold on:
//   • Pickaxes — auto-swingers that mine on their own (auto-click).
//   • Shafts — parallel worker crews that produce a flat rate per second.
//   • Prestige — reset progress in exchange for a permanent gold multiplier
//                (based on total gold ever earned).
//
// Growth curve:
//   Upgrade cost curve is `base * 1.15^owned` — the same shape that made
//   Cookie Clicker feel like every purchase is *almost* out of reach but
//   never blocking. Base costs are seeded so early upgrades cost < 20 gold
//   and the endgame tier crosses into the billions.
//
// Rendering:
//   Left-side mineshaft cross-section (SVG) with an animated pickaxe blow
//   that swings on every click + a slow autoclick tick. Floating "+GOLD"
//   numbers pop from the swing point and drift upward.
//
// Persistence:
//   Whole state (gold, ownedTiers, prestigeMult, lastTs) → localStorage on
//   every state change. Offline earnings are computed at mount from the delta
//   between `lastTs` and `now`, capped at 12 h so you don't come back to an
//   overflow.
//
// Achievements:
//   9 milestone achievements — first click, first pickaxe, million gold, first
//   prestige, all-tier-owned, etc. Toast on unlock; the side panel lists them
//   grayed until earned.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

// ── Upgrade tiers ── 12 tiers. Costs scale on purchase via 1.15^owned.
const TIERS = [
  { id: 'wooden',   name: 'Wooden Pickaxe',   baseCost: 15,        cps: 0.1,     icon: '⛏️' },
  { id: 'stone',    name: 'Stone Pickaxe',    baseCost: 100,       cps: 1,       icon: '🪨' },
  { id: 'iron',     name: 'Iron Pickaxe',     baseCost: 1100,      cps: 8,       icon: '🔩' },
  { id: 'gold',     name: 'Gold Pickaxe',     baseCost: 12000,     cps: 47,      icon: '🏆' },
  { id: 'diamond',  name: 'Diamond Pickaxe',  baseCost: 130000,    cps: 260,     icon: '💎' },
  { id: 'shaft-1',  name: 'Small Shaft Crew', baseCost: 1.4e6,     cps: 1400,    icon: '👷' },
  { id: 'shaft-2',  name: 'Big Shaft Crew',   baseCost: 20e6,      cps: 7800,    icon: '🚧' },
  { id: 'shaft-3',  name: 'Mining Rig',       baseCost: 330e6,     cps: 44000,   icon: '🛠️' },
  { id: 'drill',    name: 'Auto-Drill',       baseCost: 5.1e9,     cps: 260000,  icon: '🌀' },
  { id: 'quarry',   name: 'Quarry',           baseCost: 75e9,      cps: 1.6e6,   icon: '🏔️' },
  { id: 'refinery', name: 'Refinery',         baseCost: 1e12,      cps: 10e6,    icon: '🏭' },
  { id: 'core',     name: 'Planetary Core',   baseCost: 14e12,     cps: 65e6,    icon: '🌋' },
]

// ── Achievements ──
const ACHIEVEMENTS = [
  { id: 'first-swing',   name: 'First Swing',    desc: 'Land your first pickaxe blow.',           check: (s) => s.totalClicks >= 1 },
  { id: 'first-pickaxe', name: 'Iron Grip',      desc: 'Buy your first pickaxe upgrade.',         check: (s) => s.totalBought >= 1 },
  { id: 'thousand',      name: 'Making Bank',    desc: 'Earn a total of 1 000 gold.',              check: (s) => s.totalEarned >= 1_000 },
  { id: 'million',       name: 'Millionaire',    desc: 'Earn a total of 1 000 000 gold.',          check: (s) => s.totalEarned >= 1_000_000 },
  { id: 'billion',       name: 'Billionaire',    desc: 'Earn a total of 1 000 000 000 gold.',      check: (s) => s.totalEarned >= 1_000_000_000 },
  { id: 'first-prestige',name: 'Reset & Rise',   desc: 'Prestige for the first time.',            check: (s) => s.prestiges >= 1 },
  { id: 'auto-100',      name: 'Automation',     desc: 'Reach 100 gold/sec passive income.',      check: (s) => s.cps >= 100 },
  { id: 'auto-1m',       name: 'Industrial',     desc: 'Reach 1M gold/sec passive income.',       check: (s) => s.cps >= 1_000_000 },
  { id: 'all-tiers',     name: 'Completionist',  desc: 'Own at least 1 of every tier.',           check: (s) => TIERS.every(t => (s.owned[t.id] || 0) >= 1) },
]

const STORAGE_KEY = 'sid-idle-miner-v1'
const OFFLINE_CAP_MS = 12 * 3600 * 1000

// Format big numbers as e.g. 1.23K, 15.7M, 4.2B, 12.5T.
function fmt(n) {
  if (!isFinite(n)) return '∞'
  if (n < 1000) return Math.floor(n).toString()
  const units = ['K', 'M', 'B', 'T', 'Q', 'Qi', 'Sx', 'Sp']
  let u = -1
  while (n >= 1000 && u < units.length - 1) { n /= 1000; u++ }
  return `${n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0)}${units[u]}`
}

function costOf(tier, owned) {
  return Math.ceil(tier.baseCost * Math.pow(1.15, owned))
}

function cpsForOwned(owned) {
  let cps = 0
  for (const t of TIERS) cps += (owned[t.id] || 0) * t.cps
  return cps
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

export default function IdleMiner() {
  const now = Date.now()
  const initial = useMemo(() => {
    const saved = loadState()
    if (!saved) return {
      gold: 0, totalEarned: 0, totalClicks: 0, totalBought: 0,
      owned: {}, prestigeMult: 1, prestiges: 0, unlocked: {}, lastTs: now,
    }
    // Compute offline earnings.
    const cps = cpsForOwned(saved.owned || {}) * (saved.prestigeMult || 1)
    const delta = Math.min(OFFLINE_CAP_MS, Math.max(0, now - (saved.lastTs || now)))
    const offline = (cps * delta) / 1000
    return {
      gold: (saved.gold || 0) + offline,
      totalEarned: (saved.totalEarned || 0) + offline,
      totalClicks: saved.totalClicks || 0,
      totalBought: saved.totalBought || 0,
      owned: saved.owned || {},
      prestigeMult: saved.prestigeMult || 1,
      prestiges: saved.prestiges || 0,
      unlocked: saved.unlocked || {},
      lastTs: now,
      offlineEarnings: offline,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [gold, setGold]           = useState(initial.gold)
  const [totalEarned, setEarned]  = useState(initial.totalEarned)
  const [totalClicks, setClicks]  = useState(initial.totalClicks)
  const [totalBought, setBought]  = useState(initial.totalBought)
  const [owned, setOwned]         = useState(initial.owned)
  const [prestigeMult, setMult]   = useState(initial.prestigeMult)
  const [prestiges, setPrestiges] = useState(initial.prestiges)
  const [unlocked, setUnlocked]   = useState(initial.unlocked)
  const [soundOn, setSoundOn]     = useState(true)
  const [swing, setSwing]         = useState(0)          // click animation seed
  const [floaters, setFloaters]   = useState([])         // +gold popups
  const [toast, setToast]         = useState(null)       // achievement unlock
  const [offlineMsg, setOffline]  = useState(initial.offlineEarnings > 1 ? initial.offlineEarnings : 0)

  const sfx = useMemo(() => getSfx(), [])
  useEffect(() => sfx.setEnabled(soundOn), [soundOn, sfx])

  const cps = useMemo(() => cpsForOwned(owned) * prestigeMult, [owned, prestigeMult])
  const goldPerClick = useMemo(() => Math.max(1, 1 * prestigeMult), [prestigeMult])

  // Passive income tick — 10 Hz so counters feel alive without hammering
  // localStorage.
  useEffect(() => {
    let last = performance.now()
    let raf = 0
    const loop = (t) => {
      const dt = (t - last) / 1000
      if (dt >= 0.1) {
        setGold(g => g + cps * dt)
        setEarned(e => e + cps * dt)
        last = t
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [cps])

  // Persist to localStorage on state change (debounced by react's own batch).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        gold, totalEarned, totalClicks, totalBought, owned,
        prestigeMult, prestiges, unlocked, lastTs: Date.now(),
      }))
    } catch { /* quota exceeded — ignore */ }
  }, [gold, totalEarned, totalClicks, totalBought, owned, prestigeMult, prestiges, unlocked])

  // Achievement checks — run when any counter changes.
  useEffect(() => {
    const snap = { gold, totalEarned, totalClicks, totalBought, prestiges, cps, owned }
    let pending = null
    for (const a of ACHIEVEMENTS) {
      if (!unlocked[a.id] && a.check(snap)) {
        setUnlocked(prev => ({ ...prev, [a.id]: Date.now() }))
        pending = a
        break
      }
    }
    if (pending) {
      setToast(pending)
      sfx.win()
      setTimeout(() => setToast(t => t?.id === pending.id ? null : t), 3000)
    }
  }, [gold, totalEarned, totalClicks, totalBought, prestiges, cps, owned, unlocked, sfx])

  // Floaters cleanup.
  useEffect(() => {
    if (!floaters.length) return
    const cutoff = Date.now() - 1200
    const timer = setTimeout(() => {
      setFloaters(f => f.filter(x => x.ts > cutoff))
    }, 400)
    return () => clearTimeout(timer)
  }, [floaters])

  // ── Interactions ──
  const clickMine = useCallback((e) => {
    setGold(g => g + goldPerClick)
    setEarned(g => g + goldPerClick)
    setClicks(c => c + 1)
    setSwing(s => s + 1)
    sfx.hit()
    // Add a floater at click point.
    const rect = e.currentTarget.getBoundingClientRect()
    const cx = (e.clientX ?? (e.touches?.[0]?.clientX)) - rect.left
    const cy = (e.clientY ?? (e.touches?.[0]?.clientY)) - rect.top
    setFloaters(f => {
      const next = [...f, { id: Math.random(), x: cx || 100, y: cy || 100, amt: goldPerClick, ts: Date.now() }]
      return next.slice(-20)   // cap floaters
    })
  }, [goldPerClick, sfx])

  const buy = useCallback((tier) => {
    const have = owned[tier.id] || 0
    const cost = costOf(tier, have)
    if (gold < cost) return
    setGold(g => g - cost)
    setOwned(o => ({ ...o, [tier.id]: (o[tier.id] || 0) + 1 }))
    setBought(b => b + 1)
    sfx.coin()
  }, [gold, owned, sfx])

  const prestigeGain = useMemo(() => {
    // 1 point per 10^12 gold earned (rounded down), min 0.
    return Math.floor(Math.sqrt(totalEarned / 1e9))
  }, [totalEarned])

  const doPrestige = () => {
    if (prestigeGain < 1) return
    if (!confirm(`Prestige for +${prestigeGain}× production multiplier?\n\nYou'll reset gold + upgrades but keep the multiplier permanently.`)) return
    setMult(m => m + prestigeGain)
    setPrestiges(p => p + 1)
    setGold(0)
    setOwned({})
    setBought(0)
    setClicks(0)
    // totalEarned intentionally preserved so achievements don't unlock twice.
    sfx.win()
  }

  const resetAll = () => {
    if (!confirm('Wipe everything (gold, upgrades, prestige, achievements)?')) return
    localStorage.removeItem(STORAGE_KEY)
    setGold(0); setEarned(0); setClicks(0); setBought(0)
    setOwned({}); setMult(1); setPrestiges(0); setUnlocked({})
  }

  return (
    <GameShell
      title="Idle Miner"
      category="Sim"
      score={Math.floor(totalEarned)}
      best={Math.floor(cps)}
      level={prestigeMult}
      status="playing"
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn(v => !v)}
      onPause={() => {}}
      onRestart={resetAll}
      extraStats={
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Gold</span>
          <span className="text-xl sm:text-2xl font-bold text-amber-300 tabular-nums">{fmt(gold)}</span>
        </div>
      }
      controls={[
        { key: 'Click', label: 'Swing pickaxe' },
        { key: 'Tap',   label: 'Mine (mobile)' },
      ]}
    >
      <div className="p-3 sm:p-4 flex flex-col gap-3 lg:flex-row min-h-[60vh]">
        {/* Mineshaft + click area */}
        <div className="flex-1 relative min-w-0">
          <div
            className="relative rounded-xl overflow-hidden border border-white/10 bg-gradient-to-b from-[#231610] via-[#140b08] to-[#08050a] select-none cursor-pointer"
            onMouseDown={clickMine}
            onTouchStart={(e) => { e.preventDefault(); clickMine({
              currentTarget: e.currentTarget,
              clientX: e.touches[0].clientX,
              clientY: e.touches[0].clientY,
            }) }}
            style={{ minHeight: '480px', aspectRatio: '4 / 5', touchAction: 'manipulation' }}
          >
            <MineshaftScene swing={swing} />
            {/* Floaters */}
            {floaters.map((f) => {
              const dt = (Date.now() - f.ts) / 1000
              const opacity = Math.max(0, 1 - dt / 1.2)
              return (
                <div key={f.id}
                  className="absolute pointer-events-none text-amber-200 font-bold text-lg drop-shadow"
                  style={{
                    left: f.x, top: f.y - dt * 60,
                    opacity,
                    transform: `translate(-50%, -50%) scale(${1 + dt * 0.6})`,
                  }}
                >
                  +{fmt(f.amt)}
                </div>
              )
            })}
            {/* Bottom stat overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-black/40 backdrop-blur-sm border-t border-white/10 text-xs flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-white/60">Rate: <span className="text-emerald-300 font-mono">{fmt(cps)}/s</span></span>
              <span className="text-white/60">/click: <span className="text-amber-300 font-mono">{fmt(goldPerClick)}</span></span>
              <span className="text-white/60">Prestige: <span className="text-fuchsia-300 font-mono">×{prestigeMult}</span></span>
              <span className="ml-auto text-white/60">Total: <span className="text-white font-mono">{fmt(totalEarned)}</span></span>
            </div>
          </div>
          {offlineMsg > 1 && (
            <div
              className="absolute top-2 left-2 right-2 sm:right-auto p-3 rounded-lg bg-black/70 border border-amber-400/40 text-amber-100 text-sm cursor-pointer"
              onClick={() => setOffline(0)}
            >
              💤 Welcome back — you earned <b className="text-amber-200">{fmt(offlineMsg)}</b> gold while away. <span className="text-white/50">(tap to dismiss)</span>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="w-full lg:w-96 shrink-0 space-y-3">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] uppercase tracking-widest text-white/40">Upgrades</div>
              <div className="text-[11px] text-white/50">Cost ×1.15 per owned</div>
            </div>
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {TIERS.map((t, idx) => {
                const have = owned[t.id] || 0
                const cost = costOf(t, have)
                const canAfford = gold >= cost
                const unlocked_ = idx === 0 || (owned[TIERS[idx - 1]?.id] || 0) >= 1 || have > 0
                if (!unlocked_) return null
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => buy(t)}
                    disabled={!canAfford}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors flex items-center gap-3 ${canAfford ? 'bg-amber-500/10 border-amber-400/30 hover:bg-amber-500/20 text-white' : 'bg-white/5 border-white/10 text-white/40 cursor-not-allowed'}`}
                  >
                    <span className="text-2xl leading-none">{t.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <span className="font-semibold text-sm truncate">{t.name}</span>
                        <span className="text-[11px] text-white/50 shrink-0 ml-2">×{have}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-emerald-300">+{fmt(t.cps)}/s</span>
                        <span className={canAfford ? 'text-amber-300' : 'text-white/40'}>{fmt(cost)}g</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Prestige</div>
            <div className="text-xs text-white/60 mb-2">
              Current multiplier: <span className="text-fuchsia-300 font-mono">×{prestigeMult}</span>
              &nbsp;·&nbsp; Resets: <span className="text-white/80 font-mono">{prestiges}</span>
            </div>
            <button
              type="button"
              onClick={doPrestige}
              disabled={prestigeGain < 1}
              className={`w-full px-3 py-2 rounded-lg font-semibold border transition-colors text-sm ${prestigeGain >= 1 ? 'bg-fuchsia-500/20 border-fuchsia-400/40 text-fuchsia-100 hover:bg-fuchsia-500/30' : 'bg-white/5 border-white/10 text-white/40 cursor-not-allowed'}`}
            >
              Prestige +{prestigeGain}×
            </button>
            <p className="mt-2 text-[11px] text-white/50">Reset gold + upgrades. Keep the permanent multiplier.</p>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Achievements ({Object.keys(unlocked).length} / {ACHIEVEMENTS.length})</div>
            <div className="space-y-1">
              {ACHIEVEMENTS.map((a) => {
                const got = !!unlocked[a.id]
                return (
                  <div key={a.id} className={`text-[11px] flex gap-2 items-start ${got ? 'text-emerald-300' : 'text-white/40'}`}>
                    <span>{got ? '★' : '☆'}</span>
                    <div>
                      <div className="font-semibold">{a.name}</div>
                      <div className="text-white/50">{a.desc}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Achievement toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 shadow-lg">
            <div className="text-[11px] uppercase tracking-widest text-emerald-300/80">Achievement</div>
            <div className="font-semibold">{toast.name}</div>
            <div className="text-xs opacity-80">{toast.desc}</div>
          </div>
        )}
      </div>
    </GameShell>
  )
}

// ── Mineshaft SVG scene ──
function MineshaftScene({ swing }) {
  // Animated pickaxe: rotates on `swing` change (React key trick).
  const rockChunks = useMemo(() => {
    const arr = []
    for (let i = 0; i < 24; i++) {
      arr.push({
        x: 10 + Math.random() * 80,
        y: 15 + Math.random() * 80,
        r: 2 + Math.random() * 3,
        c: ['#4a3020', '#5b4530', '#3a2018', '#6a4d33'][Math.floor(Math.random() * 4)],
      })
    }
    return arr
  }, [])

  return (
    <svg viewBox="0 0 100 130" className="w-full h-full block" preserveAspectRatio="xMidYMid meet">
      {/* Ambient light gradient */}
      <defs>
        <radialGradient id="miner-light" cx="50%" cy="20%" r="80%">
          <stop offset="0%" stopColor="rgba(251, 191, 36, 0.35)" />
          <stop offset="60%" stopColor="rgba(251, 113, 133, 0.08)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <linearGradient id="miner-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a2418" />
          <stop offset="100%" stopColor="#1a0f0a" />
        </linearGradient>
      </defs>

      {/* Ceiling / sky sliver */}
      <rect x="0" y="0" width="100" height="10" fill="#1a1626" />
      <circle cx="20" cy="5" r="1" fill="#e879f9" opacity="0.5" />
      <circle cx="80" cy="4" r="1" fill="#fbbf24" opacity="0.5" />

      {/* Shaft walls */}
      <rect x="0" y="10" width="100" height="120" fill="url(#miner-wall)" />
      <rect x="0" y="10" width="100" height="120" fill="url(#miner-light)" />

      {/* Rocks + veins */}
      {rockChunks.map((r, i) => (
        <circle key={i} cx={r.x} cy={r.y + 10} r={r.r} fill={r.c} opacity="0.85" />
      ))}
      {/* Gold veins */}
      <path d="M20 40 Q30 45 45 42 T80 48" stroke="#fbbf24" strokeWidth="0.6" fill="none" opacity="0.7" />
      <path d="M15 80 Q40 90 65 82 T95 95" stroke="#fbbf24" strokeWidth="0.5" fill="none" opacity="0.6" />
      <path d="M5  110 Q30 105 55 112 T95 115" stroke="#fb7185" strokeWidth="0.4" fill="none" opacity="0.4" />

      {/* Support beams */}
      <rect x="8" y="10" width="3" height="120" fill="#2a1a10" />
      <rect x="89" y="10" width="3" height="120" fill="#2a1a10" />

      {/* Pickaxe (animated via CSS keyframes keyed on `swing`) */}
      <g key={swing} style={{
        transformOrigin: '50px 65px',
        animation: 'sid-miner-swing 400ms cubic-bezier(.4, .0, .3, 1)',
      }}>
        <line x1="50" y1="65" x2="60" y2="90" stroke="#8a5a35" strokeWidth="2" strokeLinecap="round" />
        <path d="M42 60 L58 70 L54 72 L48 68 L44 66 Z" fill="#9ca3af" stroke="#e5e7eb" strokeWidth="0.4" />
        <circle cx="60" cy="90" r="1.5" fill="#5a3a20" />
      </g>

      {/* Miner cartoon */}
      <circle cx="65" cy="95" r="4" fill="#f7d5a3" />
      <rect x="61" y="98" width="8" height="10" fill="#3b82f6" />
      <rect x="61" y="91" width="8" height="4" fill="#f59e0b" />        {/* helmet */}
      <circle cx="65" cy="93" r="0.8" fill="#fbbf24" />                  {/* helmet lamp */}
      <rect x="61" y="107" width="3" height="4" fill="#1f2937" />
      <rect x="66" y="107" width="3" height="4" fill="#1f2937" />

      {/* Keyframe once — cheap and self-contained. */}
      <style>{`
        @keyframes sid-miner-swing {
          0%   { transform: rotate(-40deg); }
          40%  { transform: rotate(20deg); }
          100% { transform: rotate(0deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes sid-miner-swing { 0%, 100% { transform: rotate(0deg); } }
        }
      `}</style>
    </svg>
  )
}
