// /runner — Hand Runner v2.
//
// Subway-Surfers-style 3-lane endless runner. Three input modes wired
// in parallel: keyboard, touch swipe, MediaPipe hand gestures.
// Aspect-ratio aware camera + lane spacing so it plays the same on a
// phone in portrait, a tablet, or a wide desktop.
//
// Architecture lives in src/components/runner/v2/:
//   GameStateProvider + useGameState ─ score / status / persistence
//   useInput  ─ keyboard + touch + hand → callback fan-out
//   GameCanvas ─ Three.js scene root (Track + Player + Spawner + loop)
//   HUD / StartMenu / GameOverModal / Leaderboard ─ React UI

import { useEffect, useRef, useState } from 'react'
import { GameStateProvider, useGameState } from '../components/runner/v2/hooks/useGameState'
import useInput from '../components/runner/v2/hooks/useInput'
import GameCanvas from '../components/runner/v2/GameCanvas'
import StartMenu from '../components/runner/v2/StartMenu'
import HUD from '../components/runner/v2/HUD'
import GameOverModal from '../components/runner/v2/GameOverModal'
import Leaderboard from '../components/runner/v2/Leaderboard'

export default function Runner() {
  useEffect(() => { document.title = 'Hand Runner · Sid' }, [])
  return (
    <GameStateProvider>
      <RunnerInner />
    </GameStateProvider>
  )
}

function RunnerInner() {
  const playerRef = useRef(null)
  const [view, setView] = useState('menu')           // 'menu' | 'game' | 'leaderboard'
  const [handEnabled, setHandEnabled] = useState(false)

  const { status, start, pause, resume, reset, continueRun, playerName, difficulty } = useGameState()

  // Touch-device detection — drives whether the HUD shows on-screen
  // D-pad buttons.
  const [isTouch, setIsTouch] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsTouch(window.matchMedia('(hover: none)').matches)
  }, [])

  // Pause callback is enabled even when status is not 'playing' so the
  // user can resume from paused state via the same key. The useInput
  // hook handles that by gating non-pause callbacks on `enabled`.
  const handlePause = () => {
    if (status === 'playing') pause()
    else if (status === 'paused') resume()
  }

  const { handStatus, handVideoRef } = useInput({
    enabled:     status === 'playing',
    handEnabled: handEnabled && (status === 'playing' || status === 'paused'),
    onLeft:  () => playerRef.current?.changeLane(-1),
    onRight: () => playerRef.current?.changeLane(+1),
    onJump:  () => playerRef.current?.jump(),
    onRoll:  () => playerRef.current?.roll(),
    onPause: handlePause,
  })

  // Switch back to the menu view whenever the run hits idle (after a
  // game-over modal close + reset()).
  useEffect(() => {
    if (status === 'idle' && view === 'game') setView('menu')
  }, [status, view])

  // ── Leaderboard view (independent of the canvas) ──
  if (view === 'leaderboard') {
    return <Leaderboard onBack={() => setView('menu')} />
  }

  // ── Menu view ──
  if (view === 'menu' && status === 'idle') {
    return (
      <StartMenu
        onPlay={({ playerName: pn, difficulty: d, handEnabled: he }) => {
          setHandEnabled(!!he)
          setView('game')
          start({ playerName: pn, difficulty: d })
        }}
        onLeaderboard={() => setView('leaderboard')}
      />
    )
  }

  // ── In-game view ──
  return (
    <div className='relative min-h-screen bg-[#0a0a0e] overflow-hidden'>
      {/* Three.js scene — fills the viewport via absolute inset. */}
      <GameCanvas playerRef={playerRef} />

      {/* HUD overlay */}
      <HUD
        onPause={handlePause}
        onLeft={()  => playerRef.current?.changeLane(-1)}
        onRight={() => playerRef.current?.changeLane(+1)}
        onJump={()  => playerRef.current?.jump()}
        onRoll={()  => playerRef.current?.roll()}
        handStatus={handStatus}
        handVideoRef={handEnabled ? handVideoRef : null}
        showTouchControls={isTouch}
      />

      {/* Paused overlay — gentle dim + resume CTA. */}
      {status === 'paused' && (
        <div className='absolute inset-0 z-30 bg-black/55 backdrop-blur-sm flex items-center justify-center'>
          <div className='luxe-card p-6 text-center max-w-xs'>
            <p className='text-xs uppercase tracking-[0.3em] text-gray-400 font-mono'>Paused</p>
            <h2 className='mt-2 text-2xl font-bold bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-300 bg-clip-text text-transparent'>
              Catch your breath
            </h2>
            <div className='mt-4 flex items-center gap-2 justify-center'>
              <button onClick={resume}
                className='text-sm font-bold px-5 py-2.5 rounded-full border border-emerald-500/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 min-h-[44px]'>
                ▶ Resume
              </button>
              <button onClick={() => { reset(); setView('menu') }}
                className='text-xs font-semibold px-4 py-2.5 rounded-full border border-gray-700 hover:border-gray-500 text-gray-300 min-h-[44px]'>
                ↩ Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game-over modal — submits score on Play Again / Leaderboard /
          Close. Continue does NOT submit (the run isn't really over) and
          fires playerRef.activateHoverboard() so the killer obstacle
          gets vaporised during the 5s immunity window when the player
          resumes from the exact spot they died. */}
      <GameOverModal
        open={status === 'gameover'}
        onContinue={() => {
          playerRef.current?.activateHoverboard?.()
          continueRun()
        }}
        onPlayAgain={() => {
          reset()
          // Brief defer so the modal-close animation finishes before we
          // tear down + remount the canvas via state transitions.
          setTimeout(() => start({ playerName, difficulty }), 50)
        }}
        onLeaderboard={() => { reset(); setView('leaderboard') }}
        onClose={() => { reset(); setView('menu') }}
      />
    </div>
  )
}
