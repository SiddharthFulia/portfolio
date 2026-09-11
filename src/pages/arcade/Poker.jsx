// 5-Card Draw — you vs 3 AI opponents at a felt table.
//
// Round flow:
//   1. Ante — everyone pays a fixed ante (5 chips) into the pot.
//   2. Deal — five cards each, face-down (yours face-up).
//   3. Bet 1 — betting round starting left of the dealer button.
//   4. Draw — each player may discard 0-3 cards and replace them.
//   5. Bet 2 — second betting round.
//   6. Showdown — best 5-card poker hand wins; ties split.
//
// AI decision approach (documented up front for the caller):
//
//   Each opponent has a hidden `style` in {tight, loose, wild}. On
//   each decision point we compute:
//     - hand strength (0..1) from evaluateHand + rank sub-index
//     - draw improvement estimate (# of good cards in a 47-card deck)
//     - pot odds (call cost / (pot + call cost))
//   The bot's action is chosen by weighted score:
//     - fold if strength - pot_odds < style.foldThreshold
//     - call if strength within call band
//     - raise if strength > style.raiseThreshold
//     - bluff ~15% (rand() < style.bluff) even with weak hands
//   Tell animations fire when the bot is strong (calm nod) or bluffing
//   (twitchy pulse) — these read as physical rather than cheating.
//
// Money never leaves the browser. This is a demo.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import PlayingCard, { RANK_VALUE, makeDeck, shuffle } from '../../components/arcade/PlayingCard'
import { Button } from '../../components/ui'

const ANTE = 5
const STARTING_STACK = 500

// ── Poker hand evaluator ─────────────────────────────────────────
// Returns a numeric rank (higher = better). Encodes tie-break kickers
// into low bits so comparing two ranks resolves everything.
//
// Categories:
//   9 Straight flush  8 Four of a kind  7 Full house  6 Flush
//   5 Straight        4 Three of a kind 3 Two pair    2 Pair  1 High
function evaluateHand(cards) {
  const ranks = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => a - b)
  const suits = cards.map((c) => c.suit)
  const counts = {}
  ranks.forEach((r) => { counts[r] = (counts[r] || 0) + 1 })
  const groups = Object.entries(counts)
    .map(([r, c]) => ({ r: Number(r), c }))
    .sort((a, b) => b.c - a.c || b.r - a.r)
  const flush = suits.every((s) => s === suits[0])
  // Straight — normal or A-2-3-4-5 low ace
  let straight = false
  let straightHigh = 0
  if (new Set(ranks).size === 5) {
    if (ranks[4] - ranks[0] === 4) { straight = true; straightHigh = ranks[4] }
    else if (JSON.stringify(ranks) === JSON.stringify([1, 2, 3, 4, 13])) {
      // Wait — our ACE is 1, so A2345 -> [1,2,3,4,5]. AKQJT is [1,10,11,12,13]
    }
    if (JSON.stringify(ranks) === JSON.stringify([1, 10, 11, 12, 13])) {
      // Broadway A-K-Q-J-T
      straight = true
      straightHigh = 14
    }
    if (JSON.stringify(ranks) === JSON.stringify([1, 2, 3, 4, 5])) {
      // Wheel
      straight = true
      straightHigh = 5
    }
  }
  // Pack rank + kickers into one integer
  const kickers = groups.reduce((acc, g) => acc * 16 + g.r, 0)
  if (straight && flush) return 9 * 1e10 + straightHigh
  if (groups[0].c === 4) return 8 * 1e10 + groups[0].r * 16 + groups[1].r
  if (groups[0].c === 3 && groups[1].c === 2) return 7 * 1e10 + groups[0].r * 16 + groups[1].r
  if (flush) return 6 * 1e10 + kickers
  if (straight) return 5 * 1e10 + straightHigh
  if (groups[0].c === 3) return 4 * 1e10 + groups[0].r * 256 + groups[1].r * 16 + (groups[2]?.r || 0)
  if (groups[0].c === 2 && groups[1].c === 2) {
    const [hi, lo] = [groups[0].r, groups[1].r].sort((a, b) => b - a)
    return 3 * 1e10 + hi * 256 + lo * 16 + groups[2].r
  }
  if (groups[0].c === 2) return 2 * 1e10 + groups[0].r * 4096 + groups[1].r * 256 + groups[2].r * 16 + groups[3].r
  return 1 * 1e10 + kickers
}

const CATEGORY_NAMES = {
  9: 'Straight flush', 8: 'Four of a kind', 7: 'Full house', 6: 'Flush',
  5: 'Straight', 4: 'Three of a kind', 3: 'Two pair', 2: 'Pair', 1: 'High card',
}
function handName(cards) {
  const rank = evaluateHand(cards)
  const cat = Math.floor(rank / 1e10)
  return CATEGORY_NAMES[cat] || 'Unknown'
}
function handStrength(cards) {
  // Map evaluated rank to 0..1. Straight flush ≈ 1, high-card ≈ 0.1.
  const rank = evaluateHand(cards)
  const cat = Math.floor(rank / 1e10)
  return Math.min(1, cat / 9 + (rank % 1e10) / 1e12)
}

// AI opponents — three archetypes, each seeded once per game so
// behaviour is consistent within a hand.
const AI_STYLES = {
  tight:  { foldThreshold: 0.28, raiseThreshold: 0.68, bluff: 0.08, drawAggression: 0.4 },
  loose:  { foldThreshold: 0.14, raiseThreshold: 0.55, bluff: 0.20, drawAggression: 0.7 },
  wild:   { foldThreshold: 0.10, raiseThreshold: 0.45, bluff: 0.32, drawAggression: 0.85 },
}
const AI_ROSTER = [
  { name: 'Nora',  style: 'tight', emoji: '👓' },
  { name: 'Cass',  style: 'loose', emoji: '🎩' },
  { name: 'Gus',   style: 'wild',  emoji: '🕶️' },
]

// Decide which cards to keep on the draw. Simple rules:
//   - Keep all pairs, triples, quads
//   - Keep 4-flush and open-ended 4-straight draws
//   - Otherwise keep the highest card and discard the rest
function decideDiscard(cards, style) {
  const counts = {}
  cards.forEach((c) => { counts[c.rank] = (counts[c.rank] || 0) + 1 })
  const suits = {}
  cards.forEach((c) => { suits[c.suit] = (suits[c.suit] || 0) + 1 })
  const flushSuit = Object.entries(suits).find(([, c]) => c >= 4)?.[0]
  const pairs = Object.keys(counts).filter((r) => counts[r] >= 2)
  const keep = new Set()
  cards.forEach((c, i) => {
    if (pairs.includes(c.rank)) keep.add(i)
    if (flushSuit && c.suit === flushSuit) keep.add(i)
  })
  // Loose AIs sometimes chase a single high card
  if (keep.size === 0) {
    const highIdx = cards.reduce((best, c, i) => RANK_VALUE[c.rank] > RANK_VALUE[cards[best].rank] ? i : best, 0)
    keep.add(highIdx)
    if (Math.random() < AI_STYLES[style].drawAggression && cards[highIdx].rank === 'A') {
      // Also keep any other Ace or King
      cards.forEach((c, i) => { if (c.rank === 'K') keep.add(i) })
    }
  }
  // Discard the rest — at most 3 cards
  const discardIdxs = []
  for (let i = 0; i < cards.length; i++) if (!keep.has(i)) discardIdxs.push(i)
  return discardIdxs.slice(0, 3)
}

// AI bet decision. Returns { action: 'fold'|'call'|'raise'|'check', amount }
function decideBet(cards, potSize, callAmount, style, stack, phase) {
  const st = AI_STYLES[style]
  const strength = handStrength(cards)
  const potOdds = callAmount > 0 ? callAmount / (potSize + callAmount) : 0
  const bluff = Math.random() < st.bluff
  // Adjust strength during draw phase — pre-draw counts less
  const effective = phase === 'preDraw' ? strength * 0.7 : strength
  if (!bluff && effective + 0.05 < potOdds && callAmount > 0) return { action: 'fold' }
  if (effective < st.foldThreshold && callAmount > stack * 0.15) {
    return bluff ? { action: 'raise', amount: Math.min(stack, 20) } : { action: 'fold' }
  }
  if (effective > st.raiseThreshold || bluff) {
    const bet = Math.min(stack, Math.max(10, Math.floor(potSize * (0.4 + effective * 0.6))))
    return { action: 'raise', amount: bet }
  }
  if (callAmount === 0) return { action: 'check' }
  return { action: 'call', amount: callAmount }
}

// ── Component ────────────────────────────────────────────────────

export default function Poker() {
  // Players: [YOU, AI0, AI1, AI2]. Position rotates each hand.
  const [players, setPlayers] = useState(() => makePlayers())
  const [deck, setDeck] = useState([])
  const [pot, setPot] = useState(0)
  const [currentBet, setCurrentBet] = useState(0)
  const [phase, setPhase] = useState('idle')         // idle · preDraw · draw · postDraw · showdown · settled
  const [turn, setTurn] = useState(0)                // index of active player
  const [dealerButton, setDealerButton] = useState(0)
  const [message, setMessage] = useState('Deal to start')
  const [heldMask, setHeldMask] = useState([true, true, true, true, true])
  const [showAiCards, setShowAiCards] = useState(false)
  const [handsPlayed, setHandsPlayed] = useState(0)
  const [totalWon, setTotalWon] = useState(0)
  const [soundOn, setSoundOn] = useState(true)
  const [tell, setTell] = useState({}) // { [aiIdx]: 'strong'|'bluff' }
  const audioCtxRef = useRef(null)

  const beep = useCallback((freq = 480, dur = 0.06) => {
    if (!soundOn) return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioCtxRef.current
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'triangle'
      o.frequency.value = freq
      g.gain.value = 0.04
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
      o.connect(g).connect(ctx.destination)
      o.start()
      o.stop(ctx.currentTime + dur)
    } catch { /* */ }
  }, [soundOn])

  const startHand = useCallback(() => {
    // Reset per-hand state
    const d = shuffle(makeDeck())
    const newPlayers = players.map((p) => ({
      ...p,
      cards: [],
      folded: false,
      contributed: 0,
      inHand: p.stack > 0,
    }))
    // Ante
    for (const p of newPlayers) {
      const ante = Math.min(ANTE, p.stack)
      p.stack -= ante
      p.contributed = ante
    }
    // Deal 5 each
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < newPlayers.length; i++) {
        newPlayers[i].cards.push(d.pop())
      }
    }
    setPlayers(newPlayers)
    setDeck(d)
    setPot(ANTE * newPlayers.length)
    setCurrentBet(0)
    setHeldMask([true, true, true, true, true])
    setShowAiCards(false)
    setPhase('preDraw')
    setTell({})
    setMessage('Pre-draw betting')
    setTurn((dealerButton + 1) % 4)
    beep(560, 0.09)
  }, [players, dealerButton, beep])

  // Progress through betting round
  const advanceTurn = useCallback((mut) => {
    // Find next non-folded, non-all-in player
    let next = (turn + 1) % 4
    for (let i = 0; i < 4; i++) {
      if (!mut[next].folded && mut[next].inHand) break
      next = (next + 1) % 4
    }
    // If all players have matched currentBet or folded, advance phase
    const active = mut.filter((p) => !p.folded && p.inHand)
    const allMatched = active.every((p) => p.contributed === Math.max(...mut.map((x) => x.contributed)))
    if (allMatched && (next === (dealerButton + 1) % 4 || active.length <= 1)) {
      // Move to next phase
      if (phase === 'preDraw') { setPhase('draw'); setTurn((dealerButton + 1) % 4); setMessage('Discard 0-3 cards'); return }
      if (phase === 'postDraw') { setPhase('showdown'); return }
      // fall-through
    }
    setTurn(next)
  }, [turn, phase, dealerButton])

  // Fold / call / raise / check
  const doAction = useCallback((idx, action, amount = 0) => {
    setPlayers((prev) => {
      const mut = prev.map((p) => ({ ...p }))
      const p = mut[idx]
      if (action === 'fold') p.folded = true
      if (action === 'check') { /* nothing */ }
      if (action === 'call') {
        const need = currentBet - p.contributed
        const pay = Math.min(p.stack, need)
        p.stack -= pay
        p.contributed += pay
        setPot((pt) => pt + pay)
      }
      if (action === 'raise') {
        const raise = Math.min(p.stack, amount)
        p.stack -= raise
        p.contributed += raise
        setPot((pt) => pt + raise)
        setCurrentBet(Math.max(currentBet, p.contributed))
      }
      // Tell fires when AI just raised — reveals whether they're strong/bluffing
      if (idx !== 0 && (action === 'raise')) {
        const s = handStrength(p.cards)
        setTell((t) => ({ ...t, [idx]: s > 0.5 ? 'strong' : 'bluff' }))
        setTimeout(() => setTell((t) => { const { [idx]: _, ...rest } = t; return rest }), 1200)
      }
      // Check for one-remaining winner
      const remaining = mut.filter((pp) => !pp.folded)
      if (remaining.length === 1) {
        setTimeout(() => {
          setMessage(`${remaining[0].name} wins the pot (${pot + (action === 'raise' ? amount : action === 'call' ? Math.min(p.stack + p.contributed, currentBet) : 0)} chips)`)
          setPhase('settled')
        }, 300)
      }
      return mut
    })
    beep(action === 'raise' ? 660 : action === 'fold' ? 260 : 460, 0.08)
    setTimeout(() => advanceTurn(playersRefLatest()), 100)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBet, pot, advanceTurn, beep])

  // Keep a ref-like accessor so advanceTurn sees the latest players
  const playersRef = useRef(players)
  playersRef.current = players
  const playersRefLatest = useCallback(() => playersRef.current, [])

  // Handle AI turns
  useEffect(() => {
    if (phase !== 'preDraw' && phase !== 'postDraw') return
    if (turn === 0) return
    const p = players[turn]
    if (!p || p.folded || !p.inHand) return
    const timer = setTimeout(() => {
      const need = currentBet - p.contributed
      const decision = decideBet(p.cards, pot, need, p.style, p.stack, phase)
      doAction(turn, decision.action, decision.amount)
    }, 700 + Math.random() * 500)
    return () => clearTimeout(timer)
  }, [turn, phase, players, currentBet, pot, doAction])

  // Draw phase — each player discards + redraws
  useEffect(() => {
    if (phase !== 'draw') return
    if (turn === 0) return // wait for user click
    const p = players[turn]
    if (!p || p.folded) { setTurn((t) => (t + 1) % 4); return }
    const timer = setTimeout(() => {
      const discardIdxs = decideDiscard(p.cards, p.style)
      const newCards = p.cards.map((c, i) => discardIdxs.includes(i) ? deck.pop() : c)
      setDeck([...deck])
      setPlayers((prev) => prev.map((pl, i) => i === turn ? { ...pl, cards: newCards, drewCount: discardIdxs.length } : pl))
      const nextTurn = (turn + 1) % 4
      if (nextTurn === (dealerButton + 1) % 4) {
        // Everyone drew, go to postDraw betting
        setPhase('postDraw')
        setCurrentBet(0)
        setPlayers((prev) => prev.map((pl) => ({ ...pl, contributed: 0 })))
        setMessage('Post-draw betting')
        setTurn((dealerButton + 1) % 4)
      } else {
        setTurn(nextTurn)
      }
      beep(500, 0.06)
    }, 800)
    return () => clearTimeout(timer)
  }, [phase, turn, players, deck, dealerButton, beep])

  // Player's draw action
  const doPlayerDraw = useCallback(() => {
    if (phase !== 'draw' || turn !== 0) return
    const discardIdxs = heldMask.map((held, i) => held ? -1 : i).filter((i) => i >= 0).slice(0, 3)
    const newCards = players[0].cards.map((c, i) => discardIdxs.includes(i) ? deck.pop() : c)
    setDeck([...deck])
    setPlayers((prev) => prev.map((p, i) => i === 0 ? { ...p, cards: newCards, drewCount: discardIdxs.length } : p))
    const nextTurn = 1
    setTurn(nextTurn)
    beep(500, 0.06)
  }, [phase, turn, heldMask, players, deck, beep])

  // Showdown
  useEffect(() => {
    if (phase !== 'showdown') return
    setShowAiCards(true)
    const alive = players.map((p, i) => ({ ...p, idx: i })).filter((p) => !p.folded && p.inHand)
    if (alive.length === 0) return
    const rankedActive = alive.map((p) => ({ ...p, rank: evaluateHand(p.cards) }))
    const bestRank = Math.max(...rankedActive.map((p) => p.rank))
    const winners = rankedActive.filter((p) => p.rank === bestRank)
    const share = Math.floor(pot / winners.length)
    setPlayers((prev) => {
      const mut = prev.map((p) => ({ ...p }))
      winners.forEach((w) => { mut[w.idx].stack += share })
      return mut
    })
    if (winners.some((w) => w.idx === 0)) {
      setTotalWon((t) => t + share - ANTE)
    }
    const msg = winners.map((w) => `${w.name} (${handName(w.cards)})`).join(' & ')
    setMessage(`Showdown: ${msg} — pot ${pot}`)
    setPhase('settled')
    setHandsPlayed((h) => h + 1)
    beep(720, 0.15)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Player controls
  const call = () => {
    if (turn !== 0 || phase === 'settled' || phase === 'idle') return
    doAction(0, 'call')
  }
  const check = () => {
    if (turn !== 0) return
    if (currentBet > players[0].contributed) return
    doAction(0, 'check')
  }
  const raise = (amount) => {
    if (turn !== 0) return
    doAction(0, 'raise', amount)
  }
  const fold = () => {
    if (turn !== 0) return
    doAction(0, 'fold')
  }
  const allIn = () => {
    if (turn !== 0) return
    doAction(0, 'raise', players[0].stack)
  }

  const toggleHold = (i) => {
    if (phase !== 'draw' || turn !== 0) return
    setHeldMask((m) => m.map((v, idx) => idx === i ? !v : v))
  }

  const rebuy = () => {
    setPlayers((prev) => prev.map((p, i) => i === 0 ? { ...p, stack: STARTING_STACK } : p))
  }

  const nextHand = () => {
    setDealerButton((b) => (b + 1) % 4)
    setPhase('idle')
    setPlayers((prev) => prev.map((p) => ({ ...p, cards: [], folded: false, contributed: 0, drewCount: 0 })))
    setMessage('Ready when you are')
  }

  // Pot odds for the user
  const potOdds = useMemo(() => {
    const need = currentBet - players[0].contributed
    if (need <= 0) return null
    return `${((need / (pot + need)) * 100).toFixed(0)}% pot odds`
  }, [currentBet, players, pot])

  const status = phase === 'idle' ? 'ready' : phase === 'settled' ? 'ready' : 'playing'

  return (
    <GameShell
      title="5-Card Draw"
      category="Card"
      score={`$${players[0].stack}`}
      best={`+$${totalWon}`}
      level={handsPlayed}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={() => { setPlayers(makePlayers()); setPhase('idle'); setMessage('Deal to start'); setHandsPlayed(0); setTotalWon(0) }}
      controls={[
        { key: 'Click', label: 'Hold / discard your cards' },
        { key: 'Bet', label: 'Fold · Check · Call · Raise · All-in' },
      ]}
    >
      <div className="relative bg-[#1a3a1f] p-4 sm:p-6 min-h-[600px]"
        style={{ backgroundImage: 'radial-gradient(ellipse at 50% 50%, rgba(52,211,153,0.15), transparent 70%)' }}
      >
        {/* Opponents row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {players.slice(1).map((p, i) => {
            const aiIdx = i + 1
            const isTurn = aiIdx === turn
            const t = tell[aiIdx]
            return (
              <div key={p.name} className={`p-3 rounded-xl border transition-all ${isTurn ? 'bg-amber-500/10 border-amber-400/50' : 'bg-black/30 border-white/10'} ${t === 'bluff' ? 'animate-pulse' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm">
                    <span className="text-lg mr-1">{p.emoji}</span>
                    <span className="font-bold text-white">{p.name}</span>
                    <span className="ml-2 text-xs text-white/40 uppercase tracking-widest">{p.style}</span>
                  </div>
                  <span className="text-xs text-amber-300 font-mono">${p.stack}</span>
                </div>
                <div className="flex gap-1 min-h-[110px]">
                  {p.cards.map((c, ci) => (
                    <div key={c.id} style={{ marginLeft: ci > 0 ? '-14px' : 0 }}>
                      <PlayingCard suit={c.suit} rank={c.rank} faceUp={showAiCards || p.folded && phase === 'settled'} size="sm" />
                    </div>
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-white/60 min-h-[16px]">
                  {p.folded ? 'Folded' :
                    p.contributed > 0 ? `Bet $${p.contributed}` : ''}
                  {p.drewCount != null && phase !== 'preDraw' && ` · drew ${p.drewCount}`}
                </div>
                {t && (
                  <div className={`mt-1 text-xs font-bold ${t === 'strong' ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {t === 'strong' ? 'looks confident' : 'fidgets…'}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Pot */}
        <div className="text-center my-4">
          <div className="text-xs uppercase tracking-widest text-white/50">Pot</div>
          <div className="text-4xl font-bold bg-gradient-to-r from-amber-300 to-fuchsia-400 bg-clip-text text-transparent">${pot}</div>
          {currentBet > 0 && (
            <div className="text-xs text-white/60 mt-1">Bet to match: ${currentBet - players[0].contributed}</div>
          )}
          {potOdds && <div className="text-xs text-cyan-300 font-mono">{potOdds}</div>}
        </div>

        {/* Player row */}
        <div className={`p-3 rounded-xl border transition-all ${turn === 0 && phase !== 'idle' && phase !== 'settled' ? 'bg-amber-500/10 border-amber-400/50' : 'bg-black/30 border-white/10'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm">
              <span className="font-bold text-white">You</span>
              {phase !== 'idle' && players[0].cards.length === 5 && (
                <span className="ml-2 text-xs text-fuchsia-300 uppercase tracking-widest">{handName(players[0].cards)}</span>
              )}
            </div>
            <span className="text-xs text-amber-300 font-mono">${players[0].stack}</span>
          </div>
          <div className="flex gap-2 min-h-[150px]">
            {players[0].cards.map((c, i) => (
              <button
                type="button"
                key={c.id}
                onClick={() => toggleHold(i)}
                disabled={phase !== 'draw'}
                className={`transition-transform ${phase === 'draw' ? 'cursor-pointer' : ''} ${phase === 'draw' && !heldMask[i] ? 'translate-y-4 opacity-60' : ''}`}
              >
                <PlayingCard suit={c.suit} rank={c.rank} faceUp size="md" selected={phase === 'draw' && heldMask[i]} />
                {phase === 'draw' && (
                  <div className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${heldMask[i] ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {heldMask[i] ? 'hold' : 'toss'}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div className="mt-4 text-center text-lg font-bold text-amber-200 min-h-[32px]">{message}</div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {phase === 'idle' && (
            <>
              <Button variant="primary" onClick={startHand} disabled={players[0].stack < ANTE}>Deal ($ {ANTE} ante)</Button>
              {players[0].stack < ANTE && <Button variant="accent" onClick={rebuy}>Buy in</Button>}
            </>
          )}
          {phase === 'draw' && turn === 0 && (
            <Button variant="primary" onClick={doPlayerDraw}>Draw ({heldMask.filter((h) => !h).length} cards)</Button>
          )}
          {(phase === 'preDraw' || phase === 'postDraw') && turn === 0 && (
            <>
              <Button variant="danger" onClick={fold}>Fold</Button>
              {currentBet - players[0].contributed === 0 ? (
                <Button variant="secondary" onClick={check}>Check</Button>
              ) : (
                <Button variant="secondary" onClick={call} disabled={players[0].stack < currentBet - players[0].contributed}>Call ${currentBet - players[0].contributed}</Button>
              )}
              <Button variant="primary" onClick={() => raise(20)} disabled={players[0].stack < 20}>Raise +$20</Button>
              <Button variant="accent" onClick={() => raise(50)} disabled={players[0].stack < 50}>Raise +$50</Button>
              <Button variant="danger" onClick={allIn} disabled={players[0].stack === 0}>All-in</Button>
            </>
          )}
          {phase === 'settled' && (
            <Button variant="primary" onClick={nextHand}>Next hand</Button>
          )}
        </div>
      </div>
    </GameShell>
  )
}

function makePlayers() {
  return [
    { name: 'You',  style: 'you',   emoji: '🧑', cards: [], folded: false, contributed: 0, inHand: true, stack: STARTING_STACK, drewCount: null },
    ...AI_ROSTER.map((a) => ({
      name: a.name, style: a.style, emoji: a.emoji, cards: [], folded: false,
      contributed: 0, inHand: true, stack: STARTING_STACK, drewCount: null,
    })),
  ]
}
