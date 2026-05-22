// GameOverModal — antd modal shown when the run ends.
// Submits the score to the existing BE leaderboard endpoint
// automatically (no extra click) and offers "Play again" + "Leaderboard"
// follow-ups.

import { useEffect, useState } from 'react'
import { Modal, message as antMessage } from 'antd'
import { submitGameScore } from '../../../api/ai'
import { useGameState } from './hooks/useGameState'

export default function GameOverModal({ open, onPlayAgain, onLeaderboard, onClose }) {
  const { score, coins, distance, highScore, playerName, difficulty } = useGameState()
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const isNewBest = score > 0 && score >= highScore

  // Submit the score exactly once when the modal opens.
  useEffect(() => {
    if (!open || submitted || submitting) return
    if (!playerName || !score) return
    setSubmitting(true)
    // BE wants `playerName` (not `name`) and doesn't track coins on the
    // leaderboard — coin count is local-only score flavour. The helper
    // signature also expects floored ints.
    submitGameScore({
      playerName,
      score:    Math.floor(score),
      distance: Math.floor(distance),
      difficulty,
    }).then(({ data, error }) => {
      setSubmitting(false)
      if (error) {
        setSubmitError(error)
        antMessage.error(`Score submit failed: ${error}`)
      } else {
        setSubmitted(true)
        antMessage.success('Score submitted to leaderboard')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      maskClosable={false}
      width={420}
      title={null}
    >
      <div className='text-center space-y-4 py-2'>
        <p className='text-[10px] uppercase tracking-[0.3em] text-gray-500 font-mono'>Run Complete</p>
        <h2 className='text-3xl sm:text-4xl font-bold leading-tight pb-1 bg-gradient-to-r from-amber-300 via-rose-400 to-fuchsia-400 bg-clip-text text-transparent' style={{ fontVariantNumeric: 'tabular-nums' }}>
          {Math.floor(score).toLocaleString()}
        </h2>
        {isNewBest && (
          <p className='text-sm font-semibold text-amber-300'>🏆 New high score!</p>
        )}
        <div className='grid grid-cols-3 gap-2 pt-2'>
          <Stat label='Distance' value={`${Math.floor(distance).toLocaleString()} m`} />
          <Stat label='Coins' value={coins.toLocaleString()} icon='🪙' />
          <Stat label='Best' value={Math.max(score, highScore).toLocaleString()} />
        </div>
        {submitError && (
          <p className='text-[11px] font-mono text-rose-400'>✗ {submitError}</p>
        )}
        {submitting && (
          <p className='text-[11px] font-mono text-gray-500'>Submitting score…</p>
        )}
        <div className='flex items-center justify-center gap-2 pt-2'>
          <button
            onClick={onLeaderboard}
            className='text-xs font-semibold px-4 py-2.5 rounded-full border border-gray-300 hover:border-gray-500 text-gray-700 min-h-[44px]'>
            🏆 Leaderboard
          </button>
          <button
            onClick={onPlayAgain}
            className='text-sm font-bold px-6 py-2.5 rounded-full border border-amber-500/50 bg-gradient-to-r from-amber-500/20 to-rose-500/20 text-amber-700 hover:from-amber-500/30 hover:to-rose-500/30 min-h-[44px]'>
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
