// Baccarat — punto banco, the version you see in most casinos.
//
// Rules baked in:
//   - Bet Player / Banker / Tie before the deal. Optional side bets:
//     Pair (either), Perfect Pair (same suit), Big (5-6 cards dealt),
//     Small (4 cards dealt only).
//   - Player and Banker each get 2 cards. Card totals are mod 10 —
//     A=1, 2..9=face, 10/J/Q/K=0.
//   - Third-card rules (tableau) are displayed on the side panel so
//     the player can follow along:
//       Player has 0-5: draws a third card
//       Player has 6-7: stands
//       Player has 8-9: natural (Banker also stands)
//       Banker rules depend on Banker total AND Player's third card
//   - 5% commission on Banker wins (paid out of winnings).
//   - Big Road + Bead Plate scorecard — the two most common casino
//     tracking sheets. Bead Plate is time-ordered by result, Big
//     Road groups by "run" (same result in a column until a break).
//   - History-based prediction display — clearly labelled EDUCATIONAL:
//     shows the empirical frequency of Player / Banker / Tie over the
//     shoe, plus a next-column suggestion by "follow the Big Road" and
//     "against the Big Road" (labelled "not a real prediction — the
//     shoe is memoryless").

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import PlayingCard, { makeShoe, shuffle } from '../../components/arcade/PlayingCard'
import { Button } from '../../components/ui'

const RULES = [
  { heading: 'Goal', body: 'Bet on which of two hands — Player or Banker — will end up closer to 9, or bet on Tie. You do not decide any card actions; the tableau (drawing rules) plays out automatically.' },
  { heading: 'Card values', body: 'Aces = 1. 2 through 9 = face value. 10s and face cards (J, Q, K) = 0. Hand total is the sum mod 10, so 7+8 = 15 = "5".' },
  { heading: 'Deal & natural', body: 'Player and Banker are each dealt two cards. If either has an 8 or 9 total ("natural"), both hands stand — no more cards. Otherwise the tableau kicks in.' },
  { heading: 'Third-card rules', body: 'Player rule — draws a third card on 0–5, stands on 6–7.\nBanker rule — depends on Banker\'s total AND Player\'s third card:\n• Banker 0-2: always draws.\n• Banker 3: draws unless Player\'s 3rd was an 8.\n• Banker 4: draws only if Player\'s 3rd was 2-7.\n• Banker 5: draws only if Player\'s 3rd was 4-7.\n• Banker 6: draws only if Player\'s 3rd was 6 or 7.\n• Banker 7+: always stands.' },
  { heading: 'Payouts', body: 'Player win = 1:1. Banker win = 1:1 minus 5% commission (0.95:1). Tie = 8:1. Side bets (Pair, Perfect Pair, Big, Small) pay long odds when they hit.' },
  { heading: 'Scorecard', body: 'Big Road groups outcomes in vertical columns by run (same result). Bead Plate is time-ordered. Neither predicts the future — the shoe is memoryless — but they are traditional trackers.' },
  { heading: 'Difficulty', body: 'Easy uses a low ante, no commission, side bets enabled and quick card display. Hard uses higher minimum, standard 5% commission, no side bets and slower dramatic reveal. Custom exposes min bet, commission rate, side bets and card animation speed.' },
]

const DIFFICULTIES = {
  Easy:   { minBet: 5,  commission: 0.00, sideBets: true,  dealSpeed: 200 },
  Medium: { minBet: 25, commission: 0.05, sideBets: true,  dealSpeed: 400 },
  Hard:   { minBet: 50, commission: 0.05, sideBets: false, dealSpeed: 700 },
}

const CUSTOM_SCHEMA = {
  minBet:     { label: 'Minimum bet',    min: 5,   max: 200, step: 5,   default: 25 },
  commission: { label: 'Commission %',   min: 0,   max: 0.10,step: 0.01,default: 0.05 },
  sideBets:   { label: 'Side bets (0/1)',min: 0,   max: 1,   step: 1,   default: 1 },
  dealSpeed:  { label: 'Deal speed (ms/card)', min: 100, max: 1000, step: 50, default: 400 },
}

// Card -> baccarat value (0 for 10/J/Q/K, 1 for A, face otherwise)
function bacValue(rank) {
  if (rank === 'A') return 1
  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 0
  return Number(rank)
}
function total(cards) {
  return cards.reduce((s, c) => s + bacValue(c.rank), 0) % 10
}

// Banker third-card rule table. Given banker total (before drawing)
// and player's third card value (or null if player didn't draw),
// returns whether banker draws.
function bankerDraws(bankerTotal, playerThird) {
  if (playerThird === null) {
    // Player didn't draw — banker draws on 0-5, stands on 6-7
    return bankerTotal <= 5
  }
  const t = playerThird
  if (bankerTotal <= 2) return true
  if (bankerTotal === 3) return t !== 8
  if (bankerTotal === 4) return t >= 2 && t <= 7
  if (bankerTotal === 5) return t >= 4 && t <= 7
  if (bankerTotal === 6) return t === 6 || t === 7
  return false // banker 7+ stands
}

// Play out a hand, returning the sequence and final result
function playHand(shoe, cursor) {
  let idx = cursor
  const player = [shoe[idx++], shoe[idx++]]
  const banker = [shoe[idx++], shoe[idx++]]
  let pTotal = total(player)
  let bTotal = total(banker)
  let playerThird = null
  let bankerThird = null
  // Naturals — either side has 8 or 9, both stand
  if (pTotal >= 8 || bTotal >= 8) {
    // both stand
  } else {
    // Player rules
    if (pTotal <= 5) {
      const c = shoe[idx++]
      player.push(c)
      playerThird = bacValue(c.rank)
      pTotal = total(player)
    }
    // Banker rules
    if (bankerDraws(bTotal, playerThird)) {
      const c = shoe[idx++]
      banker.push(c)
      bankerThird = bacValue(c.rank)
      bTotal = total(banker)
    }
  }
  let winner
  if (pTotal > bTotal) winner = 'P'
  else if (bTotal > pTotal) winner = 'B'
  else winner = 'T'
  return { player, banker, pTotal, bTotal, winner, cursor: idx }
}

// Build the Big Road grid from a history of results. Ties attach to
// the previous cell as a marker; a new column starts on a P/B change.
function buildBigRoad(history) {
  // Filter out standalone tie streaks — ties attach to the last non-tie
  const cells = []
  let col = -1
  let row = 0
  let lastNonTie = null
  for (const h of history) {
    if (h.winner === 'T') {
      // Attach a tie badge to the last cell if any
      const last = cells[cells.length - 1]
      if (last) last.ties = (last.ties || 0) + 1
      else cells.push({ result: 'T', col: 0, row: 0, ties: 1 })
      continue
    }
    if (h.winner !== lastNonTie) {
      col += 1
      row = 0
    } else {
      row += 1
    }
    cells.push({ result: h.winner, col, row, ties: 0 })
    lastNonTie = h.winner
  }
  return cells
}

const HAND_MIN = 5
const HAND_MAX = 500
const DECKS = 8

export default function Baccarat() {
  const [shellDifficulty, setShellDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState(() => Object.fromEntries(
    Object.entries(CUSTOM_SCHEMA).map(([k, v]) => [k, v.default])
  ))
  const shellCfg = useMemo(
    () => shellDifficulty === 'Custom' ? customValues : DIFFICULTIES[shellDifficulty] || DIFFICULTIES.Medium,
    [shellDifficulty, customValues],
  )
  const [shoe, setShoe] = useState(() => shuffle(makeShoe(DECKS)))
  const [cursor, setCursor] = useState(0)
  const [bank, setBank] = useState(() => {
    const v = Number(localStorage.getItem('arcade.baccarat.bank') || 1000)
    return Number.isFinite(v) && v > 0 ? v : 1000
  })
  const [best, setBest] = useState(() => {
    const v = Number(localStorage.getItem('arcade.baccarat.best') || 1000)
    return Number.isFinite(v) ? v : 1000
  })
  const [bets, setBets] = useState({ player: 0, banker: 0, tie: 0, pair: 0, perfectPair: 0, big: 0, small: 0 })
  const [chip, setChip] = useState(25)
  const [phase, setPhase] = useState('bet')
  const [hand, setHand] = useState(null)
  const [history, setHistory] = useState([])
  const [message, setMessage] = useState('Place your bets')
  const [soundOn, setSoundOn] = useState(true)
  const audioCtxRef = useRef(null)

  useEffect(() => { localStorage.setItem('arcade.baccarat.bank', String(bank)) }, [bank])
  useEffect(() => { localStorage.setItem('arcade.baccarat.best', String(best)) }, [best])

  const beep = useCallback((freq = 480, dur = 0.06) => {
    if (!soundOn) return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioCtxRef.current
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.value = 0.05
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
      o.connect(g).connect(ctx.destination)
      o.start()
      o.stop(ctx.currentTime + dur)
    } catch { /* */ }
  }, [soundOn])

  const totalBets = useMemo(() => Object.values(bets).reduce((a, b) => a + b, 0), [bets])

  const placeChip = useCallback((slot) => {
    if (phase !== 'bet') return
    if (bank < chip) { setMessage('Not enough chips'); return }
    setBets((b) => ({ ...b, [slot]: b[slot] + chip }))
    setBank((b) => b - chip)
    beep(600, 0.05)
  }, [phase, bank, chip, beep])

  const clearBets = useCallback(() => {
    if (phase !== 'bet') return
    setBank((b) => b + totalBets)
    setBets({ player: 0, banker: 0, tie: 0, pair: 0, perfectPair: 0, big: 0, small: 0 })
  }, [phase, totalBets])

  const deal = useCallback(() => {
    if (phase !== 'bet') return
    if (totalBets === 0) { setMessage('Place a bet first'); return }
    // Reshuffle if near end of shoe
    let s = shoe, c = cursor
    if (c > s.length - 8) {
      s = shuffle(makeShoe(DECKS))
      c = 0
      setShoe(s)
    }
    const h = playHand(s, c)
    setCursor(h.cursor)
    setHand(h)
    setPhase('reveal')
    beep(520, 0.1)
    // Settle after a beat
    setTimeout(() => settle(h), 1200)
  }, [phase, totalBets, shoe, cursor, beep])

  const settle = useCallback((h) => {
    // Compute payouts
    let winnings = 0
    const results = []
    // Main bets
    if (h.winner === 'P' && bets.player > 0) { winnings += bets.player * 2; results.push('Player win 1:1') }
    if (h.winner === 'B' && bets.banker > 0) {
      // Commission is a table rule — 5% is standard.
      const comm = shellCfg.commission ?? 0.05
      const win = bets.banker * (1 - comm)
      winnings += bets.banker + win
      results.push(`Banker win ${(1 - comm).toFixed(2)}:1 (${Math.round(comm * 100)}% comm)`)
    }
    if (h.winner === 'T' && bets.tie > 0) {
      winnings += bets.tie * 9    // 8:1 + stake back
      results.push('Tie 8:1')
    }
    // On tie, main P/B bets return
    if (h.winner === 'T') {
      winnings += bets.player + bets.banker
    }
    // Side bets — Pair
    const pairP = h.player.length >= 2 && h.player[0].rank === h.player[1].rank
    const pairB = h.banker.length >= 2 && h.banker[0].rank === h.banker[1].rank
    if (bets.pair > 0 && (pairP || pairB)) {
      winnings += bets.pair * 12 // 11:1 + stake
      results.push('Pair 11:1')
    }
    const perfectP = pairP && h.player[0].suit === h.player[1].suit
    const perfectB = pairB && h.banker[0].suit === h.banker[1].suit
    if (bets.perfectPair > 0 && (perfectP || perfectB)) {
      winnings += bets.perfectPair * 26  // 25:1
      results.push('Perfect pair 25:1')
    }
    // Big/Small — Small = exactly 4 cards, Big = 5 or 6 cards
    const totalCards = h.player.length + h.banker.length
    if (bets.small > 0 && totalCards === 4) {
      winnings += bets.small * 2.5 // 1.5:1 + stake
      results.push('Small 3:2')
    }
    if (bets.big > 0 && totalCards >= 5) {
      winnings += bets.big * 1.54  // 0.54:1 + stake
      results.push('Big 0.54:1')
    }
    winnings = Math.floor(winnings)
    setBank((b) => {
      const next = b + winnings
      if (next > best) setBest(next)
      return next
    })
    setHistory((hs) => [...hs, h].slice(-100))
    setMessage(`${h.winner === 'P' ? 'Player' : h.winner === 'B' ? 'Banker' : 'Tie'} · ${h.pTotal} vs ${h.bTotal} · ${results.length ? results.join(' · ') : 'no payout'}`)
    setBets({ player: 0, banker: 0, tie: 0, pair: 0, perfectPair: 0, big: 0, small: 0 })
    setPhase('settled')
    beep(720, 0.15)
  }, [bets, best, beep])

  const nextRound = useCallback(() => {
    setPhase('bet')
    setHand(null)
    setMessage('Place your bets')
  }, [])

  const rebuy = useCallback(() => setBank(1000), [])

  // Educational "prediction" panel — pure historical frequency
  const stats = useMemo(() => {
    const nonTies = history.filter((h) => h.winner !== 'T')
    const p = nonTies.filter((h) => h.winner === 'P').length
    const b = nonTies.filter((h) => h.winner === 'B').length
    const t = history.filter((h) => h.winner === 'T').length
    const total = history.length || 1
    return {
      p, b, t, total,
      pPct: ((p / total) * 100).toFixed(1),
      bPct: ((b / total) * 100).toFixed(1),
      tPct: ((t / total) * 100).toFixed(1),
    }
  }, [history])

  // Big Road grid — 6 rows tall, unlimited cols scrolling right
  const bigRoad = useMemo(() => buildBigRoad(history), [history])
  const maxCol = Math.max(0, ...bigRoad.map((c) => c.col))

  return (
    <GameShell
      title="Baccarat"
      category="Card"
      score={`$${bank}`}
      best={`$${best}`}
      level={history.length}
      status={phase === 'settled' || phase === 'bet' ? 'ready' : 'playing'}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={() => { clearBets(); rebuy(); setHistory([]); setHand(null); setPhase('bet'); setMessage('Place your bets') }}
      controls={[
        { key: 'Player', label: 'Bet Player · 1:1' },
        { key: 'Banker', label: 'Bet Banker · 0.95:1' },
        { key: 'Tie', label: 'Bet Tie · 8:1' },
      ]}
      rules={RULES}
      difficulty={shellDifficulty}
      onDifficultyChange={setShellDifficulty}
      difficultyModes={['Easy', 'Medium', 'Hard', 'Custom']}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
    >
      <div className="relative bg-[#0d3f2b] p-4 sm:p-6 min-h-[600px]"
        style={{ backgroundImage: 'radial-gradient(ellipse at 50% 30%, rgba(52,211,153,0.12), transparent 70%)' }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div>
            {/* Cards row */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-xl bg-black/30 border border-blue-400/30">
                <div className="text-xs uppercase tracking-widest text-blue-300 mb-2">Player {hand && `· ${hand.pTotal}`}</div>
                <div className="flex gap-2 min-h-[130px]">
                  {hand?.player.map((c, i) => (
                    <div key={c.id} style={{ marginLeft: i > 0 ? '-16px' : 0 }}>
                      <PlayingCard suit={c.suit} rank={c.rank} faceUp size="md" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-black/30 border border-rose-400/30">
                <div className="text-xs uppercase tracking-widest text-rose-300 mb-2">Banker {hand && `· ${hand.bTotal}`}</div>
                <div className="flex gap-2 min-h-[130px]">
                  {hand?.banker.map((c, i) => (
                    <div key={c.id} style={{ marginLeft: i > 0 ? '-16px' : 0 }}>
                      <PlayingCard suit={c.suit} rank={c.rank} faceUp size="md" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bet slots */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <BetSlot label="Player" pays="1:1" active={bets.player} onClick={() => placeChip('player')} accent="blue" />
              <BetSlot label="Tie" pays="8:1" active={bets.tie} onClick={() => placeChip('tie')} accent="fuchsia" />
              <BetSlot label="Banker" pays="0.95:1" active={bets.banker} onClick={() => placeChip('banker')} accent="rose" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <BetSlot label="Pair" pays="11:1" active={bets.pair} onClick={() => placeChip('pair')} accent="amber" small />
              <BetSlot label="Perfect Pair" pays="25:1" active={bets.perfectPair} onClick={() => placeChip('perfectPair')} accent="amber" small />
              <BetSlot label="Small" pays="3:2" active={bets.small} onClick={() => placeChip('small')} accent="cyan" small />
              <BetSlot label="Big" pays="0.54:1" active={bets.big} onClick={() => placeChip('big')} accent="cyan" small />
            </div>

            {/* Message */}
            <div className="mt-2 text-center text-lg font-bold text-amber-200 min-h-[32px]">{message}</div>

            {/* Actions */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              {phase === 'bet' && (
                <>
                  <span className="text-white/50 text-sm">Chip:</span>
                  {[5, 25, 100, 500].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setChip(v)}
                      className={`w-12 h-12 rounded-full font-bold text-white transition-all ${chip === v ? 'ring-4 ring-amber-300/60 scale-105' : ''}`}
                      style={{
                        background: v === 5 ? '#dc2626' : v === 25 ? '#16a34a' : v === 100 ? '#0f172a' : '#7e22ce',
                      }}
                      disabled={bank < v}
                    >
                      {v}
                    </button>
                  ))}
                  <Button variant="ghost" onClick={clearBets} disabled={totalBets === 0}>Clear</Button>
                  <Button variant="primary" onClick={deal} disabled={totalBets === 0}>Deal</Button>
                  {bank <= 0 && <Button variant="accent" onClick={rebuy}>Buy in</Button>}
                </>
              )}
              {phase === 'settled' && (
                <Button variant="primary" onClick={nextRound}>Next hand</Button>
              )}
            </div>
          </div>

          {/* Side panel — third card rules + scorecards + prediction */}
          <div className="space-y-3">
            {/* Big Road */}
            <div className="p-3 rounded-xl bg-black/40 border border-white/10">
              <div className="text-[10px] uppercase tracking-widest text-white/50 mb-2">Big Road</div>
              <div className="grid grid-flow-col grid-rows-6 gap-[2px] overflow-x-auto max-w-full" style={{ gridTemplateColumns: `repeat(${Math.max(20, maxCol + 2)}, 18px)` }}>
                {Array.from({ length: Math.max(20, maxCol + 2) * 6 }).map((_, i) => {
                  const col = Math.floor(i / 6)
                  const row = i % 6
                  const cell = bigRoad.find((c) => c.col === col && c.row === row)
                  return (
                    <div key={i} className="w-[18px] h-[18px] rounded-full border border-white/5 flex items-center justify-center text-[10px] font-bold">
                      {cell && (
                        <div className={`w-full h-full rounded-full ${cell.result === 'P' ? 'bg-blue-500' : cell.result === 'B' ? 'bg-rose-500' : ''} relative`}>
                          {cell.ties > 0 && (
                            <span className="absolute inset-0 flex items-center justify-center text-emerald-300 text-[8px]">/</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Bead Plate */}
            <div className="p-3 rounded-xl bg-black/40 border border-white/10">
              <div className="text-[10px] uppercase tracking-widest text-white/50 mb-2">Bead Plate</div>
              <div className="grid grid-flow-col grid-rows-6 gap-[2px]" style={{ gridTemplateColumns: `repeat(${Math.max(12, Math.ceil(history.length / 6))}, 16px)` }}>
                {history.map((h, i) => (
                  <div key={i} className={`w-4 h-4 rounded-full ${h.winner === 'P' ? 'bg-blue-500' : h.winner === 'B' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                ))}
              </div>
            </div>

            {/* Educational stats */}
            <div className="p-3 rounded-xl bg-black/40 border border-amber-400/25">
              <div className="text-[10px] uppercase tracking-widest text-amber-300 mb-2">Empirical frequency (this shoe)</div>
              <div className="text-xs text-white/80 space-y-1 font-mono">
                <div>Player: <b>{stats.p}</b> ({stats.pPct}%) · true odds 44.6%</div>
                <div>Banker: <b>{stats.b}</b> ({stats.bPct}%) · true odds 45.9%</div>
                <div>Tie:    <b>{stats.t}</b> ({stats.tPct}%) · true odds 9.5%</div>
              </div>
              <div className="mt-2 text-[10px] text-white/50 italic">
                Each hand is independent — history has zero predictive power. This panel is a live tally, not a forecast.
              </div>
            </div>

            {/* Third-card rules */}
            <details className="p-3 rounded-xl bg-black/40 border border-white/10 text-xs text-white/70">
              <summary className="cursor-pointer text-white/80 font-bold">Third-card rules</summary>
              <div className="mt-2 space-y-1">
                <div><b>Naturals</b> (8 or 9) — both stand.</div>
                <div><b>Player</b>: draws on 0-5, stands on 6-7.</div>
                <div><b>Banker</b> depends on total + Player's third card:</div>
                <ul className="ml-4 list-disc">
                  <li>0-2: always draws</li>
                  <li>3: draws unless Player's 3rd is 8</li>
                  <li>4: draws if Player's 3rd is 2-7</li>
                  <li>5: draws if Player's 3rd is 4-7</li>
                  <li>6: draws if Player's 3rd is 6-7</li>
                  <li>7: always stands</li>
                </ul>
              </div>
            </details>
          </div>
        </div>
      </div>
    </GameShell>
  )
}

function BetSlot({ label, pays, active, onClick, accent, small }) {
  const border = {
    blue: 'border-blue-400/50 hover:border-blue-300 hover:bg-blue-500/10',
    rose: 'border-rose-400/50 hover:border-rose-300 hover:bg-rose-500/10',
    fuchsia: 'border-fuchsia-400/50 hover:border-fuchsia-300 hover:bg-fuchsia-500/10',
    amber: 'border-amber-400/40 hover:border-amber-300 hover:bg-amber-500/10',
    cyan: 'border-cyan-400/40 hover:border-cyan-300 hover:bg-cyan-500/10',
  }[accent] || 'border-white/20'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative p-3 rounded-xl bg-black/25 border ${border} transition-all ${small ? '' : 'py-4'}`}
    >
      <div className={`font-bold ${small ? 'text-sm' : 'text-lg'} text-white`}>{label}</div>
      <div className="text-[10px] uppercase tracking-widest text-white/50">{pays}</div>
      {active > 0 && (
        <div className="absolute top-1 right-1 min-w-[28px] px-1.5 py-0.5 rounded-full bg-amber-500 text-black text-xs font-bold">
          ${active}
        </div>
      )}
    </button>
  )
}
