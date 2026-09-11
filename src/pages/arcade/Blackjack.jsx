// Blackjack — 6-deck shoe, dealer stands on soft 17, blackjack pays 3:2.
//
// Rules:
//   - 6-deck shoe, reshuffled at ~25% penetration.
//   - Player: hit / stand / double / split. Insurance offered on
//     dealer Ace. Split up to 4 hands. Double after split allowed.
//   - Dealer draws to 17, stands on soft 17.
//   - Blackjack (A + 10-value) pays 3:2, dealer BJ ties.
//   - Bankroll starts at 1,000. Bet 5 / 25 / 100 / 500 chips.
//   - Optional "count assist" HUD: running count (Hi-Lo), true count,
//     penetration bar. Purely educational.
//
// The dealer is not a bot; it plays fixed basic strategy. Player is
// prompted per-hand with the right action so the tutorial is inline.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import PlayingCard, { bjPoint, makeShoe, shuffle } from '../../components/arcade/PlayingCard'
import { Button } from '../../components/ui'

const STARTING_BANK = 1000
const DECKS_IN_SHOE = 6

// Hi-Lo count table
function huLoValue(rank) {
  if (['2', '3', '4', '5', '6'].includes(rank)) return 1
  if (['10', 'J', 'Q', 'K', 'A'].includes(rank)) return -1
  return 0
}

function handValue(cards) {
  let total = 0
  let aces = 0
  for (const c of cards) {
    total += bjPoint(c.rank)
    if (c.rank === 'A') aces += 1
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces -= 1
  }
  return { value: total, soft: aces > 0 && total <= 21 }
}

function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards).value === 21
}

// Basic strategy tutor — H17, DAS. Returns H / S / D / P.
function basicStrategyHint(hand, dealerUp, canDouble, canSplit) {
  const player = handValue(hand)
  const dealer = dealerUp === 'A' ? 11 : bjPoint(dealerUp)
  if (canSplit && hand.length === 2 && hand[0].rank === hand[1].rank) {
    const r = hand[0].rank
    if (r === 'A' || r === '8') return 'P'
    if (r === '9' && ![7, 10, 11].includes(dealer)) return 'P'
    if (r === '7' && dealer <= 7) return 'P'
    if (r === '6' && dealer <= 6) return 'P'
    if ((r === '2' || r === '3') && dealer <= 7) return 'P'
  }
  if (player.soft) {
    if (player.value >= 19) return 'S'
    if (player.value === 18) return dealer <= 8 ? 'S' : 'H'
    if (player.value >= 15 && dealer >= 4 && dealer <= 6 && canDouble) return 'D'
    return 'H'
  }
  if (player.value >= 17) return 'S'
  if (player.value >= 13 && dealer <= 6) return 'S'
  if (player.value === 12 && dealer >= 4 && dealer <= 6) return 'S'
  if (player.value === 11 && canDouble) return 'D'
  if (player.value === 10 && dealer <= 9 && canDouble) return 'D'
  if (player.value === 9 && dealer >= 3 && dealer <= 6 && canDouble) return 'D'
  return 'H'
}

export default function Blackjack() {
  const [shoe, setShoe] = useState(() => shuffle(makeShoe(DECKS_IN_SHOE)))
  const [dealtCount, setDealtCount] = useState(0)
  const [bank, setBank] = useState(() => {
    const v = Number(localStorage.getItem('arcade.blackjack.bank') || STARTING_BANK)
    return Number.isFinite(v) && v > 0 ? v : STARTING_BANK
  })
  const [best, setBest] = useState(() => {
    const v = Number(localStorage.getItem('arcade.blackjack.best') || STARTING_BANK)
    return Number.isFinite(v) ? v : STARTING_BANK
  })
  const [bet, setBet] = useState(25)
  const [hands, setHands] = useState([])
  const [dealer, setDealer] = useState([])
  const [dealerHidden, setDealerHidden] = useState(true)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [phase, setPhase] = useState('bet')
  const [runningCount, setRunningCount] = useState(0)
  const [assist, setAssist] = useState(false)
  const [message, setMessage] = useState('Place your bet')
  const [soundOn, setSoundOn] = useState(true)
  const audioCtxRef = useRef(null)
  const shoeRef = useRef(shoe)
  const dealtRef = useRef(0)
  shoeRef.current = shoe
  dealtRef.current = dealtCount

  useEffect(() => { localStorage.setItem('arcade.blackjack.bank', String(bank)) }, [bank])
  useEffect(() => { localStorage.setItem('arcade.blackjack.best', String(best)) }, [best])

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

  const drawCard = useCallback((faceUp = true) => {
    if (dealtRef.current >= shoeRef.current.length - 4) {
      const fresh = shuffle(makeShoe(DECKS_IN_SHOE))
      shoeRef.current = fresh
      dealtRef.current = 0
      setShoe(fresh)
      setDealtCount(0)
      setRunningCount(0)
    }
    const card = { ...shoeRef.current[dealtRef.current], faceUp }
    dealtRef.current += 1
    setDealtCount(dealtRef.current)
    if (faceUp) setRunningCount((c) => c + huLoValue(card.rank))
    return card
  }, [])

  const startRound = useCallback(() => {
    if (bank < bet) { setMessage('Not enough chips'); return }
    setBank((b) => b - bet)
    const p1 = drawCard(true)
    const d1 = drawCard(true)
    const p2 = drawCard(true)
    const d2 = drawCard(false)
    setHands([{ cards: [p1, p2], bet, done: false, doubled: false, isSplit: false, insurance: 0 }])
    setDealer([d1, d2])
    setActiveIdx(0)
    setDealerHidden(true)
    beep(560, 0.1)

    if (d1.rank === 'A') {
      setPhase('insurance')
      setMessage('Dealer shows Ace — take insurance?')
    } else {
      const bj = isBlackjack([p1, p2])
      if (bj) {
        setPhase('reveal')
        setMessage('Blackjack!')
      } else {
        setPhase('play')
        setMessage('Your move')
      }
    }
  }, [bank, bet, drawCard, beep])

  const currentHand = hands[activeIdx]

  const nextHandOrDealer = useCallback((updated) => {
    const nextIdx = updated.findIndex((h, i) => i > activeIdx && !h.done)
    if (nextIdx === -1) {
      setActiveIdx(-1)
      setPhase('reveal')
    } else {
      setActiveIdx(nextIdx)
    }
  }, [activeIdx])

  const hit = useCallback(() => {
    if (phase !== 'play' || !currentHand) return
    const card = drawCard(true)
    const cards = [...currentHand.cards, card]
    const val = handValue(cards).value
    const done = val >= 21
    const updated = hands.map((h, i) => i === activeIdx ? { ...h, cards, done } : h)
    setHands(updated)
    beep(430, 0.06)
    if (done) nextHandOrDealer(updated)
  }, [phase, currentHand, drawCard, hands, activeIdx, nextHandOrDealer, beep])

  const stand = useCallback(() => {
    if (phase !== 'play' || !currentHand) return
    const updated = hands.map((h, i) => i === activeIdx ? { ...h, done: true } : h)
    setHands(updated)
    beep(360, 0.05)
    nextHandOrDealer(updated)
  }, [phase, currentHand, hands, activeIdx, nextHandOrDealer, beep])

  const doubleDown = useCallback(() => {
    if (phase !== 'play' || !currentHand) return
    if (currentHand.cards.length !== 2) return
    if (bank < currentHand.bet) { setMessage('Not enough chips to double'); return }
    setBank((b) => b - currentHand.bet)
    const card = drawCard(true)
    const cards = [...currentHand.cards, card]
    const updated = hands.map((h, i) => i === activeIdx ? { ...h, cards, bet: h.bet * 2, doubled: true, done: true } : h)
    setHands(updated)
    beep(680, 0.1)
    nextHandOrDealer(updated)
  }, [phase, currentHand, bank, drawCard, hands, activeIdx, nextHandOrDealer, beep])

  const split = useCallback(() => {
    if (phase !== 'play' || !currentHand) return
    if (currentHand.cards.length !== 2) return
    if (currentHand.cards[0].rank !== currentHand.cards[1].rank) return
    if (bank < currentHand.bet) { setMessage('Not enough chips to split'); return }
    if (hands.length >= 4) return
    setBank((b) => b - currentHand.bet)
    const [c1, c2] = currentHand.cards
    const newA = { ...currentHand, cards: [c1, drawCard(true)], isSplit: true }
    const newB = { cards: [c2, drawCard(true)], bet: currentHand.bet, done: false, doubled: false, isSplit: true, insurance: 0 }
    const updated = [...hands.slice(0, activeIdx), newA, newB, ...hands.slice(activeIdx + 1)]
    setHands(updated)
    beep(500, 0.08)
  }, [phase, currentHand, bank, drawCard, hands, activeIdx, beep])

  const takeInsurance = useCallback((want) => {
    if (phase !== 'insurance') return
    const insBet = want ? Math.floor(bet / 2) : 0
    if (insBet > 0) setBank((b) => b - insBet)
    setHands((hs) => hs.map((h, i) => i === 0 ? { ...h, insurance: insBet } : h))
    if (dealer.length === 2) {
      const val = handValue([dealer[0], { ...dealer[1], faceUp: true }]).value
      if (val === 21) setPhase('reveal')
      else { setPhase('play'); setMessage('Your move') }
    }
  }, [phase, bet, dealer])

  // Dealer play + settlement
  useEffect(() => {
    if (phase !== 'reveal') return
    setDealerHidden(false)
    setRunningCount((c) => c + huLoValue(dealer[1].rank))
    let cards = dealer.map((c, i) => i === 1 ? { ...c, faceUp: true } : c)
    const activeHands = hands.filter((h) => handValue(h.cards).value <= 21 && !isBlackjack(h.cards))
    if (activeHands.length > 0) {
      let loop = 0
      while (loop++ < 30) {
        const { value } = handValue(cards)
        if (value >= 17) break
        cards = [...cards, drawCard(true)]
      }
      setDealer(cards)
    }
    const t = setTimeout(() => settle(cards), 850)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const settle = useCallback((finalDealer) => {
    const d = finalDealer || dealer
    const dv = handValue(d).value
    const dealerBJ = isBlackjack(d)
    let winnings = 0
    let results = []
    for (const h of hands) {
      const pv = handValue(h.cards).value
      const pBJ = isBlackjack(h.cards) && !h.isSplit
      if (h.insurance > 0 && dealerBJ) winnings += h.insurance * 3
      if (pBJ && dealerBJ) { winnings += h.bet; results.push('Push'); continue }
      if (pBJ) { winnings += h.bet + Math.floor(h.bet * 3 / 2); results.push('Blackjack 3:2'); continue }
      if (pv > 21) { results.push('Bust'); continue }
      if (dv > 21) { winnings += h.bet * 2; results.push('Dealer bust'); continue }
      if (pv > dv) { winnings += h.bet * 2; results.push('Win'); continue }
      if (pv === dv) { winnings += h.bet; results.push('Push'); continue }
      results.push('Lose')
    }
    setBank((b) => {
      const next = b + winnings
      if (next > best) setBest(next)
      return next
    })
    setMessage(results.join(' · '))
    setPhase('settled')
    beep(720, 0.15)
  }, [dealer, hands, beep, best])

  const clearRound = useCallback(() => {
    setHands([])
    setDealer([])
    setActiveIdx(-1)
    setPhase('bet')
    setDealerHidden(true)
    setMessage('Place your bet')
  }, [])

  const rebuy = useCallback(() => {
    setBank(STARTING_BANK)
    setMessage('Chips replenished')
  }, [])

  const hint = useMemo(() => {
    if (phase !== 'play' || !currentHand) return null
    const canDouble = currentHand.cards.length === 2 && bank >= currentHand.bet
    const canSplit = currentHand.cards.length === 2 && currentHand.cards[0].rank === currentHand.cards[1].rank && bank >= currentHand.bet && hands.length < 4
    return basicStrategyHint(currentHand.cards, dealer[0]?.rank, canDouble, canSplit)
  }, [phase, currentHand, dealer, bank, hands.length])

  const trueCount = useMemo(() => {
    const remaining = shoe.length - dealtCount
    const decksRemaining = Math.max(0.5, remaining / 52)
    return (runningCount / decksRemaining).toFixed(1)
  }, [runningCount, shoe.length, dealtCount])

  const penetration = useMemo(() => (dealtCount / shoe.length) * 100, [dealtCount, shoe.length])

  const status = phase === 'settled' ? 'ready' : phase === 'bet' ? 'ready' : 'playing'

  return (
    <GameShell
      title="Blackjack"
      category="Card"
      score={`$${bank}`}
      best={`$${best}`}
      level={`${hands.length || 0}`}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={() => { clearRound(); rebuy() }}
      controls={[
        { key: 'Hit', label: 'Take a card' },
        { key: 'Stand', label: 'Stay put' },
        { key: 'Dbl', label: 'Double bet, one card' },
        { key: 'Split', label: 'Same-rank two hands' },
      ]}
      extraStats={
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Assist</span>
          <button
            type="button"
            onClick={() => setAssist((v) => !v)}
            className={`mt-0.5 text-xs px-2 py-0.5 rounded font-bold ${assist ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white/60'}`}
          >
            {assist ? 'on' : 'off'}
          </button>
        </div>
      }
    >
      <div className="relative bg-[#0d3f2b] p-4 sm:p-6 min-h-[600px]"
        style={{ backgroundImage: 'radial-gradient(circle at 50% 30%, rgba(52,211,153,0.12), transparent 60%)' }}
      >
        {/* Dealer */}
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-white/50 mb-2">Dealer · {dealerHidden ? '?' : handValue(dealer).value}</div>
          <div className="flex gap-2 min-h-[130px]">
            {dealer.map((c, i) => (
              <div key={c.id} style={{ marginLeft: i > 0 ? '-16px' : 0 }} className="transition-transform">
                <PlayingCard suit={c.suit} rank={c.rank} faceUp={i === 1 ? !dealerHidden : c.faceUp} size="md" />
              </div>
            ))}
          </div>
        </div>

        {/* Player hands */}
        <div className="space-y-6">
          {hands.map((h, i) => {
            const val = handValue(h.cards)
            const isActive = i === activeIdx
            return (
              <div key={i} className={`p-3 rounded-xl transition-all ${isActive ? 'bg-amber-500/10 ring-2 ring-amber-400/40' : 'bg-white/[0.02]'}`}>
                <div className="flex flex-wrap items-center gap-3 mb-2 text-xs">
                  <span className="text-white/60 uppercase tracking-widest">Hand {i + 1}</span>
                  <span className="text-amber-300 font-bold">${h.bet}</span>
                  <span className={`px-2 py-0.5 rounded font-bold ${val.value > 21 ? 'bg-rose-500/25 text-rose-200' : val.value === 21 ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 text-white/80'}`}>
                    {val.value}{val.soft && val.value !== 21 ? ' soft' : ''}
                  </span>
                  {h.doubled && <span className="text-fuchsia-300 text-[10px] uppercase tracking-widest">2x</span>}
                  {h.insurance > 0 && <span className="text-cyan-300 text-[10px] uppercase tracking-widest">ins ${h.insurance}</span>}
                </div>
                <div className="flex min-h-[130px]">
                  {h.cards.map((c, ci) => (
                    <div key={c.id} style={{ marginLeft: ci > 0 ? '-16px' : 0 }} className="transition-transform">
                      <PlayingCard suit={c.suit} rank={c.rank} faceUp size="md" highlighted={isActive && ci === h.cards.length - 1} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Message */}
        <div className="mt-4 text-center text-lg font-bold text-amber-200 min-h-[32px]">{message}</div>

        {/* Chip / actions */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {phase === 'bet' && (
            <>
              <span className="text-white/50 text-sm">Bet:</span>
              {[5, 25, 100, 500].map((v) => (
                <ChipButton key={v} value={v} active={bet === v} onClick={() => setBet(v)} disabled={bank < v} />
              ))}
              <Button variant="primary" onClick={startRound} disabled={bank < bet}>Deal</Button>
              {bank <= 0 && <Button variant="accent" onClick={rebuy}>Buy in</Button>}
            </>
          )}
          {phase === 'insurance' && (
            <>
              <Button variant="primary" onClick={() => takeInsurance(true)} disabled={bank < Math.floor(bet / 2)}>Insurance +${Math.floor(bet / 2)}</Button>
              <Button variant="secondary" onClick={() => takeInsurance(false)}>Skip</Button>
            </>
          )}
          {phase === 'play' && currentHand && (
            <>
              <Button variant={hint === 'H' ? 'primary' : 'secondary'} onClick={hit}>Hit</Button>
              <Button variant={hint === 'S' ? 'primary' : 'secondary'} onClick={stand}>Stand</Button>
              <Button
                variant={hint === 'D' ? 'primary' : 'secondary'}
                onClick={doubleDown}
                disabled={currentHand.cards.length !== 2 || bank < currentHand.bet}
              >Double</Button>
              <Button
                variant={hint === 'P' ? 'primary' : 'secondary'}
                onClick={split}
                disabled={
                  currentHand.cards.length !== 2 ||
                  currentHand.cards[0].rank !== currentHand.cards[1].rank ||
                  bank < currentHand.bet ||
                  hands.length >= 4
                }
              >Split</Button>
              {assist && hint && <span className="text-xs px-2 py-1 rounded bg-emerald-500/15 text-emerald-200 border border-emerald-400/30">Book: {hint}</span>}
            </>
          )}
          {(phase === 'settled') && (
            <Button variant="primary" onClick={clearRound}>Next hand</Button>
          )}
        </div>

        {/* Count assist HUD */}
        {assist && (
          <div className="mt-6 p-3 rounded-xl bg-black/40 border border-white/10 text-xs text-white/70 font-mono flex flex-wrap gap-4">
            <span>Running: <b className={runningCount > 0 ? 'text-emerald-300' : runningCount < 0 ? 'text-rose-300' : 'text-white'}>{runningCount > 0 ? '+' : ''}{runningCount}</b></span>
            <span>True: <b>{trueCount}</b></span>
            <span>Pen: {penetration.toFixed(0)}%</span>
            <div className="flex-1 min-w-[100px] flex items-center gap-1">
              <div className="flex-1 h-1.5 bg-white/10 rounded overflow-hidden">
                <div className="h-full bg-emerald-400 transition-all" style={{ width: `${penetration}%` }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </GameShell>
  )
}

function ChipButton({ value, active, onClick, disabled }) {
  const colors = {
    5: { face: '#dc2626', ring: '#7f1d1d' },
    25: { face: '#16a34a', ring: '#166534' },
    100: { face: '#0f172a', ring: '#020617' },
    500: { face: '#7e22ce', ring: '#4c1d95' },
  }
  const c = colors[value] || colors[25]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative w-14 h-14 rounded-full transition-all disabled:opacity-40 ${active ? 'scale-110 ring-4 ring-amber-300/60' : 'hover:scale-105'}`}
      style={{ background: c.face, boxShadow: `inset 0 -3px 0 ${c.ring}, 0 4px 6px rgba(0,0,0,0.5)` }}
    >
      <span className="absolute inset-1 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center text-white font-bold text-sm">
        {value}
      </span>
    </button>
  )
}
