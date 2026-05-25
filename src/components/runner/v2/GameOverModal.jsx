// GameOverModal — antd modal shown when the run ends.
//
// Score submission lives on the user's "I'm done" actions (Play Again /
// Leaderboard / Close) rather than the modal's open effect, so a free
// Continue doesn't accidentally submit a half-finished score that gets
// followed by a higher one later.
//
// Continue: while the user still has their one free retry per run, the
// modal shows a green Continue button as the primary action. The
// Runner shell wires it to (a) trigger continueRun() on the game state
// and (b) hit playerRef.activateHoverboard() so the killer obstacle
// dies harmlessly during the 5s immunity window.

import { useState } from 'react'
import { Modal } from 'antd'
import { notice } from '../../../lib/notice'
import { submitGameScore } from '../../../api/ai'
import { useGameState } from './hooks/useGameState'

export default function GameOverModal({ open, onContinue, onPlayAgain, onLeaderboard, onClose }) {
  const {
    score, coins, distance, highScore, playerName, difficulty,
    freeRetryUsed,
  } = useGameState()
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const isNewBest = score > 0 && score >= highScore
  const canContinue = !freeRetryUsed && score > 0

  // Submit lazily — only when the user proceeds away (Play Again /
  // Leaderboard / Close). Continue doesn't submit. Idempotent: second
  // proceed in the same modal lifecycle is a no-op.
  const submitNow = async () => {
    if (submitted || submitting) return
    if (!playerName || !score)   return
    setSubmitting(true)
    const { error } = await submitGameScore({
      playerName,
      score:    Math.floor(score),
      distance: Math.floor(distance),
      difficulty,
    })
    setSubmitting(false)
    if (error) {
      setSubmitError(error)
      notice.error(`Score submit failed: ${error}`)
    } else {
      setSubmitted(true)
      notice.success('Score submitted to leaderboard')
    }
  }

  const wrap = (fn) => async () => {
    await submitNow()
    fn?.()
  }

  return (
    <Modal
      open={open}
      onCancel={wrap(onClose)}
      footer={null}
      centered
      maskClosable={false}
      width={420}
      title={null}
      afterClose={() => {
        // Reset internal submit flags so the next gameover modal opens
        // fresh, not stuck in "already submitted" land.
        setSubmitted(false)
        setSubmitting(false)
        setSubmitError(null)
      }}
    >
      <div className='text-center space-y-4 py-2'>
        <p className='text-[10px] uppercase tracking-[0.3em] text-gray-500 font-mono'>
          {freeRetryUsed ? 'Run Complete (no retries left)' : 'You crashed'}
        </p>
        <h2 className='text-3xl sm:text-4xl font-bold leading-tight pb-1 bg-gradient-to-r from-amber-300 via-rose-400 to-fuchsia-400 bg-clip-text text-transparent' style={{ fontVariantNumeric: 'tabular-nums' }}>
          {Math.floor(score).toLocaleString()}
        </h2>
        {isNewBest && (
          <p className='text-sm font-semibold text-amber-300'>🏆 New high score!</p>
        )}
        <div className='grid grid-cols-3 gap-2 pt-2'>
          <Stat label='Distance' value={`${Math.floor(distance).toLocaleString()} m`} />
          <Stat label='Coins'    value={coins.toLocaleString()} icon='🪙' />
          <Stat label='Best'     value={Math.max(score, highScore).toLocaleString()} />
        </div>
        {submitError && (
          <p className='text-[11px] font-mono text-rose-400'>✗ {submitError}</p>
        )}
        {submitting && (
          <p className='text-[11px] font-mono text-gray-500'>Submitting score…</p>
        )}

        {/* Free-retry path takes the primary slot when available. */}
        {canContinue && (
          <button
            onClick={onContinue}
            className='w-full text-sm font-bold px-6 py-3 rounded-full border border-emerald-500/60 bg-gradient-to-r from-emerald-500/25 to-cyan-500/25 text-emerald-700 hover:from-emerald-500/35 hover:to-cyan-500/35 min-h-[48px] inline-flex items-center justify-center gap-2'>
            <span className='text-base'>💜</span>
            Continue · one free revive
            <span className='text-[10px] font-mono opacity-70'>5s shield</span>
          </button>
        )}

        <div className='flex items-center justify-center gap-2 pt-1'>
          <button
            onClick={wrap(onLeaderboard)}
            className='text-xs font-semibold px-4 py-2.5 rounded-full border border-gray-300 hover:border-gray-500 text-gray-700 min-h-[44px]'>
            🏆 Leaderboard
          </button>
          <button
            onClick={wrap(onPlayAgain)}
            className={`text-sm font-bold px-6 py-2.5 rounded-full border min-h-[44px] ${
              canContinue
                ? 'border-gray-300 hover:border-gray-500 text-gray-700'
                : 'border-amber-500/50 bg-gradient-to-r from-amber-500/20 to-rose-500/20 text-amber-700 hover:from-amber-500/30 hover:to-rose-500/30'
            }`}>
            ▶ Play again
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Stat({ label, value, icon }) {
  return (
    <div className='rounded-lg border border-gray-200 bg-gray-50 px-2 py-2' style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className='text-[9px] uppercase tracking-wider text-gray-500 font-mono'>{label}</div>
      <div className='text-sm font-bold text-gray-900'>{icon && <span className='mr-1'>{icon}</span>}{value}</div>
    </div>
  )
}
