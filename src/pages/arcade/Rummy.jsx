// Gin Rummy — you vs one AI opponent.
//
// Rules:
//   - 10 cards each, dealt from a standard 52-card deck.
//   - Each turn: draw either the top of the stock or the top of the
//     discard pile, then discard one card.
//   - Melds: 3+ cards of the same rank OR 3+ cards of the same suit
//     in a run.
//   - Knock: end the hand when deadwood ≤ 10. Deadwood = sum of
//     card values not in any meld. A=1, 2..10=face, J/Q/K=10.
//   - Gin: deadwood == 0 → 25 bonus points.
//   - Undercut: if opponent's deadwood ≤ knocker's, they get 25 bonus.
//   - Modes: single hand (declare winner at end) or first-to-100.
//
// The best-meld solver is exact for our small hand sizes — enumerate
// all valid melds, then pick the subset that minimises deadwood via
// a small DP. Because the hand is only 10-11 cards it's fast.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import PlayingCard, { RANK_VALUE, makeDeck, shuffle } from '../../components/arcade/PlayingCard'
import { Button } from '../../components/ui'

const HAND_SIZE = 10

// Card deadwood point value (A=1, face=10, else face value)
function deadPoint(rank) {
  if (rank === 'A') return 1
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10
  return Number(rank)
}

// Enumerate all possible melds from a hand:
//   - sets: 3-4 same-rank
//   - runs: 3+ consecutive same-suit (A is low)
function enumerateMelds(hand) {
  const melds = []
  // Sets
  const byRank = {}
  hand.forEach((c) => { byRank[c.rank] = (byRank[c.rank] || []).concat([c]) })
  for (const rank of Object.keys(byRank)) {
    const cards = byRank[rank]
    if (cards.length >= 3) {
      // all triples + quad
      if (cards.length === 4) melds.push(cards.slice())
      // combinations of 3
      for (let a = 0; a < cards.length; a++)
        for (let b = a + 1; b < cards.length; b++)
          for (let c = b + 1; c < cards.length; c++)
            melds.push([cards[a], cards[b], cards[c]])
    }
  }
  // Runs — for each suit, sort by rank value, find consecutive
  const bySuit = { hearts: [], diamonds: [], clubs: [], spades: [] }
  hand.forEach((c) => bySuit[c.suit].push(c))
  for (const suit of Object.keys(bySuit)) {
    const cards = bySuit[suit].sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank])
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 2; j < cards.length; j++) {
        const slice = cards.slice(i, j + 1)
        // Check consecutive
        let ok = true
        for (let k = 1; k < slice.length; k++) {
          if (RANK_VALUE[slice[k].rank] !== RANK_VALUE[slice[k - 1].rank] + 1) { ok = false; break }
        }
        if (ok && slice.length >= 3) melds.push(slice)
      }
    }
  }
  return melds
}

// Choose the meld subset that minimises deadwood. Melds are subsets
// of card ids; we pick a disjoint collection maximising total meld
// value. Brute-force with pruning — fine for hand size ≤ 11.
function bestArrangement(hand) {
  const melds = enumerateMelds(hand)
  const meldMasks = melds.map((m) => new Set(m.map((c) => c.id)))
  let bestScore = -1
  let bestSet = []
  function recurse(startIdx, usedIds, score, chosen) {
    if (score > bestScore) {
      bestScore = score
      bestSet = chosen.slice()
    }
    for (let i = startIdx; i < melds.length; i++) {
      const mask = meldMasks[i]
      let ok = true
      for (const id of mask) { if (usedIds.has(id)) { ok = false; break } }
      if (!ok) continue
      const nextUsed = new Set(usedIds)
      for (const id of mask) nextUsed.add(id)
      const meldValue = melds[i].reduce((s, c) => s + deadPoint(c.rank), 0)
      chosen.push(i)
      recurse(i + 1, nextUsed, score + meldValue, chosen)
      chosen.pop()
    }
  }
  recurse(0, new Set(), 0, [])
  const usedIds = new Set()
  bestSet.forEach((mi) => melds[mi].forEach((c) => usedIds.add(c.id)))
  const deadwood = hand.filter((c) => !usedIds.has(c.id))
  const deadwoodPoints = deadwood.reduce((s, c) => s + deadPoint(c.rank), 0)
  return {
    melds: bestSet.map((i) => melds[i]),
    deadwood,
    deadwoodPoints,
    inMeld: (card) => usedIds.has(card.id),
  }
}

// AI turn:
//   1. Draw — take discard if it completes a meld or drops deadwood
//      by 5+, else draw from stock.
//   2. Discard — throw the card whose removal minimises deadwood
//      (excluding cards that are part of a meld).
//   3. Knock if deadwood ≤ 10 with 50% probability (tight), or ≤ 5
//      always. Never knock on first turn.
function aiTurn(state) {
  const { aiHand, discard } = state
  const currentArrangement = bestArrangement(aiHand)
  // Try taking the discard top
  let drewFromDiscard = false
  let drawnCard
  const discardTop = discard[discard.length - 1]
  if (discardTop) {
    const candidateHand = [...aiHand, discardTop]
    const candidate = bestArrangement(candidateHand)
    if (candidate.deadwoodPoints + deadPoint(discardTop.rank) < currentArrangement.deadwoodPoints - 3) {
      drewFromDiscard = true
      drawnCard = discardTop
    }
  }
  return { drewFromDiscard, drawnCard }
}

// AI discard: pick worst card to discard
function aiPickDiscard(hand) {
  // For each card, remove it and compute deadwood, pick the one with lowest post-discard deadwood
  let bestIdx = 0
  let bestScore = Infinity
  for (let i = 0; i < hand.length; i++) {
    const rest = hand.slice(0, i).concat(hand.slice(i + 1))
    const arr = bestArrangement(rest)
    if (arr.deadwoodPoints < bestScore) {
      bestScore = arr.deadwoodPoints
      bestIdx = i
    }
  }
  return bestIdx
}

// ── Component ────────────────────────────────────────────────────

const MODE_SINGLE = 'single'
const MODE_100 = 'first-to-100'

export default function Rummy() {
  const [mode, setMode] = useState(MODE_100)
  const [deck, setDeck] = useState([])
  const [discard, setDiscard] = useState([])
  const [playerHand, setPlayerHand] = useState([])
  const [aiHand, setAiHand] = useState([])
  const [turn, setTurn] = useState('player') // player / ai
  const [phase, setPhase] = useState('idle') // idle · draw · discard · ended
  const [selected, setSelected] = useState(null) // card id
  const [message, setMessage] = useState('Deal to start')
  const [playerScore, setPlayerScore] = useState(0)
  const [aiScore, setAiScore] = useState(0)
  const [handHistory, setHandHistory] = useState([])
  const [showAiCards, setShowAiCards] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
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
      g.gain.value = 0.05
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
      o.connect(g).connect(ctx.destination)
      o.start()
      o.stop(ctx.currentTime + dur)
    } catch { /* */ }
  }, [soundOn])

  const startHand = useCallback(() => {
    const d = shuffle(makeDeck())
    const pHand = d.splice(0, HAND_SIZE)
    const aHand = d.splice(0, HAND_SIZE)
    const disc = [d.pop()]
    setDeck(d)
    setDiscard(disc)
    setPlayerHand(pHand)
    setAiHand(aHand)
    setTurn('player')
    setPhase('draw')
    setShowAiCards(false)
    setMessage('Your turn — draw from stock or discard')
    beep(560, 0.09)
  }, [beep])

  const playerArrangement = useMemo(() => bestArrangement(playerHand), [playerHand])

  const drawFromStock = useCallback(() => {
    if (turn !== 'player' || phase !== 'draw') return
    if (deck.length === 0) {
      // reshuffle discard except top
      const top = discard[discard.length - 1]
      const newStock = shuffle(discard.slice(0, -1))
      setDeck(newStock)
      setDiscard([top])
    }
    const c = deck.pop()
    setDeck([...deck])
    setPlayerHand([...playerHand, c])
    setPhase('discard')
    setMessage('Now discard a card')
    beep(500, 0.05)
  }, [turn, phase, deck, discard, playerHand, beep])

  const drawFromDiscard = useCallback(() => {
    if (turn !== 'player' || phase !== 'draw') return
    if (discard.length === 0) return
    const c = discard[discard.length - 1]
    setDiscard(discard.slice(0, -1))
    setPlayerHand([...playerHand, c])
    setPhase('discard')
    setMessage('Now discard a card')
    beep(500, 0.05)
  }, [turn, phase, discard, playerHand, beep])

  const playerDiscard = useCallback((cardId) => {
    if (turn !== 'player' || phase !== 'discard') return
    const idx = playerHand.findIndex((c) => c.id === cardId)
    if (idx === -1) return
    const c = playerHand[idx]
    setPlayerHand([...playerHand.slice(0, idx), ...playerHand.slice(idx + 1)])
    setDiscard([...discard, c])
    setSelected(null)
    setPhase('draw')
    setTurn('ai')
    setMessage('Opponent thinks…')
    beep(400, 0.05)
  }, [turn, phase, playerHand, discard, beep])

  const knock = useCallback(() => {
    if (playerArrangement.deadwoodPoints > 10) return
    finalizeHand(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerArrangement])

  // AI turn
  useEffect(() => {
    if (turn !== 'ai' || phase === 'ended') return
    const timer = setTimeout(() => {
      const { drewFromDiscard, drawnCard } = aiTurn({ aiHand, discard })
      let newHand = aiHand.slice()
      let newDeck = deck.slice()
      let newDiscard = discard.slice()
      if (drewFromDiscard) {
        newDiscard.pop()
        newHand.push(drawnCard)
      } else {
        if (newDeck.length === 0) {
          const top = newDiscard.pop()
          newDeck = shuffle(newDiscard)
          newDiscard = [top]
        }
        newHand.push(newDeck.pop())
      }
      // AI discard
      const discardIdx = aiPickDiscard(newHand)
      const discarded = newHand[discardIdx]
      newHand = newHand.slice(0, discardIdx).concat(newHand.slice(discardIdx + 1))
      newDiscard.push(discarded)
      setAiHand(newHand)
      setDeck(newDeck)
      setDiscard(newDiscard)
      // Check AI knock
      const arr = bestArrangement(newHand)
      const shouldKnock = arr.deadwoodPoints <= 5 || (arr.deadwoodPoints <= 10 && Math.random() < 0.5)
      if (shouldKnock) {
        // AI knocks
        setShowAiCards(true)
        setTimeout(() => finalizeHand(false), 800)
      } else {
        setTurn('player')
        setPhase('draw')
        setMessage('Your turn')
      }
      beep(360, 0.06)
    }, 1100)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn])

  const finalizeHand = useCallback((playerKnocked) => {
    const pArr = bestArrangement(playerHand)
    const aArr = bestArrangement(aiHand)
    setShowAiCards(true)
    let pDelta = 0
    let aDelta = 0
    let msg = ''
    if (playerKnocked) {
      // Player knocked
      const pDead = pArr.deadwoodPoints
      const aDead = aArr.deadwoodPoints
      if (pDead === 0) {
        pDelta = aDead + 25
        msg = `Gin! +${pDelta}`
      } else if (aDead <= pDead) {
        // Undercut
        aDelta = pDead - aDead + 25
        msg = `Undercut — opponent +${aDelta}`
      } else {
        pDelta = aDead - pDead
        msg = `Knock — you +${pDelta}`
      }
    } else {
      // AI knocked
      const pDead = pArr.deadwoodPoints
      const aDead = aArr.deadwoodPoints
      if (aDead === 0) {
        aDelta = pDead + 25
        msg = `Opponent Gin! +${aDelta}`
      } else if (pDead <= aDead) {
        pDelta = aDead - pDead + 25
        msg = `Undercut! You +${pDelta}`
      } else {
        aDelta = pDead - aDead
        msg = `Opponent knocks — +${aDelta}`
      }
    }
    setPlayerScore((s) => s + pDelta)
    setAiScore((s) => s + aDelta)
    setHandHistory((h) => [...h, { pDelta, aDelta, msg }])
    setMessage(msg)
    setPhase('ended')
    beep(720, 0.15)
  }, [playerHand, aiHand, beep])

  const nextHand = useCallback(() => {
    if (mode === MODE_100 && (playerScore >= 100 || aiScore >= 100)) {
      // Match over
      setMessage(playerScore >= 100 ? `You reached 100 first! Total ${playerScore} vs ${aiScore}` : `Opponent reached 100. Total ${playerScore} vs ${aiScore}`)
      setPhase('idle')
    } else {
      startHand()
    }
  }, [mode, playerScore, aiScore, startHand])

  const resetMatch = useCallback(() => {
    setPlayerScore(0)
    setAiScore(0)
    setHandHistory([])
    setPhase('idle')
    setPlayerHand([])
    setAiHand([])
    setDeck([])
    setDiscard([])
    setMessage('Deal to start')
  }, [])

  const status = phase === 'ended' ? 'ready' : phase === 'idle' ? 'ready' : 'playing'

  const groupedPlayerHand = useMemo(() => {
    // Order: melded cards grouped first, then deadwood sorted by suit/rank
    const arr = playerArrangement
    const inMeld = playerHand.filter((c) => arr.inMeld(c))
    const dead = playerHand.filter((c) => !arr.inMeld(c))
    dead.sort((a, b) => a.suit.localeCompare(b.suit) || RANK_VALUE[a.rank] - RANK_VALUE[b.rank])
    // Group melded cards by which meld they're in
    const grouped = []
    for (const meld of arr.melds) grouped.push(...meld)
    return { grouped, dead }
  }, [playerHand, playerArrangement])

  return (
    <GameShell
      title="Gin Rummy"
      category="Card"
      score={playerScore}
      best={aiScore}
      level={handHistory.length}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={resetMatch}
      controls={[
        { key: 'Draw', label: 'Stock or discard pile' },
        { key: 'Discard', label: 'Click a card in your hand' },
        { key: 'Knock', label: 'Deadwood ≤ 10' },
      ]}
      extraStats={
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Mode</span>
          <div className="flex gap-1 mt-0.5">
            {[MODE_SINGLE, MODE_100].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`text-[10px] px-2 py-0.5 rounded font-bold ${mode === m ? 'bg-amber-500 text-black' : 'bg-white/10 text-white/60'}`}
              >
                {m === MODE_SINGLE ? '1 hand' : 'to 100'}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="relative bg-[#231a3a] p-4 sm:p-6 min-h-[600px]"
        style={{ backgroundImage: 'radial-gradient(ellipse at 50% 30%, rgba(217,70,239,0.15), transparent 70%)' }}
      >
        {/* AI hand */}
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-white/50 mb-2">
            Opponent · deadwood {showAiCards ? bestArrangement(aiHand).deadwoodPoints : '?'}
          </div>
          <div className="flex">
            {aiHand.map((c, i) => (
              <div key={c.id} style={{ marginLeft: i > 0 ? '-30px' : 0 }}>
                <PlayingCard suit={c.suit} rank={c.rank} faceUp={showAiCards} size="sm" />
              </div>
            ))}
          </div>
        </div>

        {/* Stock + Discard */}
        <div className="flex items-center justify-center gap-6 mb-6">
          <button
            type="button"
            onClick={drawFromStock}
            disabled={phase !== 'draw' || turn !== 'player' || deck.length === 0}
            className="disabled:opacity-40"
          >
            <div className="text-[10px] uppercase tracking-widest text-white/50 mb-1">Stock ({deck.length})</div>
            <PlayingCard faceUp={false} size="md" />
          </button>
          <button
            type="button"
            onClick={drawFromDiscard}
            disabled={phase !== 'draw' || turn !== 'player' || discard.length === 0}
            className="disabled:opacity-40"
          >
            <div className="text-[10px] uppercase tracking-widest text-white/50 mb-1">Discard</div>
            {discard.length > 0 ? (
              <PlayingCard suit={discard[discard.length - 1].suit} rank={discard[discard.length - 1].rank} faceUp size="md" />
            ) : (
              <div className="w-[80px] h-[112px] rounded-lg border-2 border-dashed border-white/20" />
            )}
          </button>
        </div>

        {/* Player hand */}
        <div>
          <div className="text-xs uppercase tracking-widest text-white/50 mb-2">
            You · deadwood <b className={playerArrangement.deadwoodPoints <= 10 ? 'text-emerald-300' : 'text-white'}>{playerArrangement.deadwoodPoints}</b>
            {playerArrangement.melds.length > 0 && (
              <span className="ml-2 text-fuchsia-300">· {playerArrangement.melds.length} meld{playerArrangement.melds.length > 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {[...groupedPlayerHand.grouped, ...groupedPlayerHand.dead].map((c, i) => {
              const inMeld = playerArrangement.inMeld(c)
              const isGroupBreak = i === groupedPlayerHand.grouped.length && i > 0
              return (
                <div key={c.id} className="flex items-end">
                  {isGroupBreak && <div className="w-3" aria-hidden />}
                  <button
                    type="button"
                    onClick={() => phase === 'discard' && turn === 'player' ? playerDiscard(c.id) : setSelected(c.id)}
                    disabled={phase === 'ended'}
                    className={`transition-transform ${selected === c.id ? '-translate-y-2' : ''}`}
                  >
                    <PlayingCard
                      suit={c.suit}
                      rank={c.rank}
                      faceUp
                      size="sm"
                      highlighted={inMeld}
                      selected={selected === c.id}
                    />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Message */}
        <div className="mt-4 text-center text-lg font-bold text-amber-200 min-h-[32px]">{message}</div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {phase === 'idle' && (
            <Button variant="primary" onClick={startHand}>Deal</Button>
          )}
          {phase === 'discard' && turn === 'player' && (
            <>
              <span className="text-white/60 text-sm">Click a card to discard</span>
              <Button
                variant="accent"
                onClick={knock}
                disabled={playerArrangement.deadwoodPoints > 10 || playerHand.length !== HAND_SIZE + 1}
              >
                Knock (deadwood {playerArrangement.deadwoodPoints})
              </Button>
            </>
          )}
          {phase === 'ended' && (
            <>
              {mode === MODE_100 && (playerScore >= 100 || aiScore >= 100)
                ? <Button variant="primary" onClick={resetMatch}>Match complete — new match</Button>
                : <Button variant="primary" onClick={nextHand}>Next hand</Button>}
            </>
          )}
        </div>

        {/* Scores */}
        {mode === MODE_100 && (
          <div className="mt-6 p-3 rounded-xl bg-black/40 border border-white/10 text-xs text-white/70">
            <div className="uppercase tracking-widest text-[10px] text-white/50 mb-2">First to 100</div>
            <div className="flex justify-between font-mono">
              <div>You: <b className="text-emerald-300">{playerScore}</b></div>
              <div>Opponent: <b className="text-rose-300">{aiScore}</b></div>
            </div>
            <div className="mt-2 h-1.5 bg-white/10 rounded overflow-hidden flex">
              <div className="h-full bg-emerald-400" style={{ width: `${Math.min(50, playerScore / 2)}%` }} />
              <div className="h-full bg-rose-400" style={{ width: `${Math.min(50, aiScore / 2)}%` }} />
            </div>
          </div>
        )}
      </div>
    </GameShell>
  )
}
