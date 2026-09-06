// StartMenu — landing card for /runner. Player name, difficulty,
// optional hand-tracking toggle, "▶ Play" button, and a controls
// reference for the three input modes.

import { useState } from 'react'
import { Input, Segmented, Switch } from 'antd'
import { useGameState, DIFFICULTIES } from './hooks/useGameState'

export default function StartMenu({ onPlay, onLeaderboard }) {
  const { playerName, difficulty, setPlayerName, setDifficulty, highScore } = useGameState()
  const [name, setName] = useState(playerName || '')
  const [diff, setDiff] = useState(difficulty || 'medium')
  const [handOn, setHandOn] = useState(false)

  const canPlay = name.trim().length >= 2

  const handlePlay = () => {
    if (!canPlay) return
    const cleanName = name.trim().slice(0, 24)
    setPlayerName(cleanName)
    setDifficulty(diff)
    onPlay?.({ playerName: cleanName, difficulty: diff, handEnabled: handOn })
  }

  return (
    <div className='relative min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16 px-4 sm:px-6 flex items-center justify-center overflow-hidden'>
      {/* Atmosphere */}
      <div aria-hidden className='pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full bg-gradient-to-br from-amber-500/20 via-rose-500/15 to-fuchsia-500/15 blur-3xl' />
      <div aria-hidden className='pointer-events-none absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full bg-gradient-to-br from-cyan-500/15 via-violet-500/10 to-transparent blur-3xl' />

      <div className='relative w-full max-w-xl'>
        <header className='mb-6 text-center'>
          <p className='text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80'>Endless Runner</p>
          <h1 className='mt-2 text-4xl sm:text-5xl font-bold leading-tight pb-1 bg-gradient-to-r from-amber-200 via-rose-300 to-fuchsia-300 bg-clip-text text-transparent'>
            Hand Runner
          </h1>
          <p className='mt-2 text-sm text-gray-400'>
            Subway-Surfers-style 3-lane endless runner. Play with keyboard, touch, or your hand.
          </p>
          {highScore > 0 && (
            <p className='mt-2 text-xs font-mono text-amber-300/80'>
              🏆 Best · <span className='tabular-nums'>{highScore.toLocaleString()}</span>
            </p>
          )}
        </header>

        <div className='luxe-card p-5 sm:p-6 space-y-5'>
          {/* Name */}
          <div>
            <label className='block text-[11px] uppercase tracking-wider text-gray-400 mb-1.5'>Your name</label>
            <Input
              size='large'
              maxLength={24}
              placeholder='SiddRunner'
              value={name}
              onChange={(e) => setName(e.target.value)}
              onPressEnter={handlePlay}
            />
          </div>

          {/* Difficulty */}
          <div>
            <label className='block text-[11px] uppercase tracking-wider text-gray-400 mb-1.5'>Difficulty</label>
            <Segmented
              block
              value={diff}
              onChange={setDiff}
              options={Object.entries(DIFFICULTIES).map(([id, d]) => ({
                value: id,
                label: <span className='text-xs'>{d.label}</span>,
              }))}
            />
            <p className='mt-1 text-[10px] text-gray-500 font-mono'>
              Start speed {DIFFICULTIES[diff].speed} m/s · accel {DIFFICULTIES[diff].accel.toFixed(2)}/s²
              {DIFFICULTIES[diff].maxSpeed !== Infinity && <> · cap {DIFFICULTIES[diff].maxSpeed}</>}
            </p>
          </div>

          {/* Hand tracking opt-in */}
          <div className='flex items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3'>
            <div className='min-w-0'>
              <p className='text-sm font-semibold text-cyan-200'>✋ Hand tracking</p>
              <p className='text-[11px] text-gray-400'>Single hand · move it in the air like a joystick. Center = idle, up = jump, down = roll, left/right = lane change.</p>
            </div>
            <Switch checked={handOn} onChange={setHandOn} />
          </div>

          {/* Controls table */}
          <div className='rounded-xl border border-gray-800 bg-gray-950/50 p-3'>
            <p className='text-[10px] uppercase tracking-wider text-gray-500 mb-2'>Controls</p>
            <table className='w-full text-[11px]'>
              <thead>
                <tr className='text-gray-500'>
                  <th className='text-left font-medium pb-1'>Action</th>
                  <th className='text-left font-medium pb-1'>Keyboard</th>
                  <th className='text-left font-medium pb-1'>Touch</th>
                  <th className='text-left font-medium pb-1'>Hand</th>
                </tr>
              </thead>
              <tbody className='text-gray-300 font-mono'>
                <tr><td>Left lane</td><td>← / A</td><td>swipe ←</td><td>hand left</td></tr>
                <tr><td>Right lane</td><td>→ / D</td><td>swipe →</td><td>hand right</td></tr>
                <tr><td>Jump</td><td>↑ / W / Space</td><td>swipe ↑</td><td>hand up</td></tr>
                <tr><td>Roll</td><td>↓ / S</td><td>swipe ↓</td><td>hand down</td></tr>
                <tr><td>Reset</td><td>—</td><td>—</td><td>hand center</td></tr>
                <tr><td>Pause</td><td>Esc / P</td><td>tap ⏸</td><td>—</td></tr>
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className='flex items-center gap-2 justify-end pt-1'>
            <button
              onClick={onLeaderboard}
              className='text-xs font-semibold px-4 py-2.5 rounded-full border border-gray-800 hover:border-gray-600 text-gray-300 min-h-[44px]'>
              🏆 Leaderboard
            </button>
            <button
              onClick={handlePlay}
              disabled={!canPlay}
              className='text-sm font-bold px-6 py-2.5 rounded-full border border-amber-500/50 bg-gradient-to-r from-amber-500/20 to-rose-500/20 text-amber-100 hover:from-amber-500/30 hover:to-rose-500/30 disabled:opacity-50 min-h-[44px]'>
              ▶ Play
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
