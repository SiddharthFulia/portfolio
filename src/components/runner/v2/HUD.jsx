// HUD — score / coins / distance / speed overlay + touch-mode corner
// buttons. Absolutely positioned over the GameCanvas. Pure presentation;
// every interaction is forwarded to the page shell.

import { useGameState } from './hooks/useGameState'

const fmtScore = (n) => Math.floor(n || 0).toLocaleString()
const fmtMeters = (n) => `${Math.floor(n || 0).toLocaleString()} m`
const fmtSpeed = (n) => `${(n || 0).toFixed(1)} m/s`

export default function HUD({
  onPause, onLeft, onRight, onJump, onRoll,
  handStatus, handVideoRef,
  showTouchControls,
}) {
  const { score, coins, distance, speed, status, highScore } = useGameState()

  return (
    <>
      {/* Top bar: score on the left, speed + pause on the right.
          Stacks tighter under sm: so phones don't run out of room. */}
      <div className='absolute top-3 left-3 right-3 z-20 flex items-start justify-between gap-2 pointer-events-none'
        style={{ fontVariantNumeric: 'tabular-nums' }}>
        <div className='pointer-events-auto'>
          <div className='text-3xl sm:text-4xl font-bold leading-none bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-300 bg-clip-text text-transparent'>
            {fmtScore(score)}
          </div>
          <div className='mt-1 flex items-center gap-3 text-[11px] sm:text-xs text-gray-300'>
            <span className='inline-flex items-center gap-1'><span aria-hidden>🪙</span> {coins}</span>
            <span className='text-gray-500'>{fmtMeters(distance)}</span>
          </div>
          {highScore > 0 && (
            <div className='mt-0.5 text-[10px] text-amber-400/80 font-mono'>Best · {fmtScore(highScore)}</div>
          )}
        </div>

        <div className='flex items-center gap-2 pointer-events-auto'>
          <span className='hidden sm:inline-block text-[10px] sm:text-xs font-mono text-gray-400 px-2 py-1 rounded-full bg-gray-900/60 border border-gray-800'>
            {fmtSpeed(speed)}
          </span>
          <button
            onClick={onPause}
            className='text-xs font-semibold px-3 py-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 min-h-[40px] min-w-[40px]'>
            {status === 'paused' ? '▶' : '⏸'}
          </button>
        </div>
      </div>

      {/* Hand-tracking mini preview (bottom-left). Only renders if the
          page passed a handVideoRef. */}
      {handVideoRef && (
        <div className='absolute bottom-3 left-3 z-20 pointer-events-none'>
          <div className='rounded-lg border border-cyan-500/40 bg-black/60 overflow-hidden'>
            <video
              ref={handVideoRef}
              autoPlay
              playsInline
              muted
              className='w-24 h-[72px] sm:w-32 sm:h-24 object-cover transform scale-x-[-1]'
            />
          </div>
          <div className='mt-1 text-[10px] font-mono text-gray-400'>
            {handStatus?.error
              ? <span className='text-rose-300'>{handStatus.error}</span>
              : handStatus?.active
                ? <>👋 {handStatus.lastGesture || 'tracking'}</>
                : 'starting…'}
          </div>
        </div>
      )}

      {/* Touch controls — corner D-pad. Only visible on touch devices.
          The page passes showTouchControls based on matchMedia. */}
      {showTouchControls && (
        <div className='absolute inset-x-0 bottom-3 z-20 px-3 pointer-events-none'>
          <div className='max-w-md mx-auto flex items-end justify-between'>
            {/* Left rocker */}
            <div className='flex flex-col items-center gap-2 pointer-events-auto'>
              <PadButton label='↑' onClick={onJump} accent='emerald' />
              <div className='flex items-center gap-2'>
                <PadButton label='←' onClick={onLeft} accent='cyan' />
                <PadButton label='→' onClick={onRight} accent='cyan' />
              </div>
            </div>
            <div className='pointer-events-auto'>
              <PadButton label='↓' onClick={onRoll} accent='amber' big />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const ACCENTS = {
  cyan:    'border-cyan-500/40    bg-cyan-500/15    text-cyan-100',
  emerald: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100',
  amber:   'border-amber-500/40   bg-amber-500/15   text-amber-100',
}
function PadButton({ label, onClick, accent = 'cyan', big = false }) {
  return (
    <button
      onClick={onClick}
      className={`select-none touch-manipulation rounded-full border backdrop-blur-md ${ACCENTS[accent]} ${big ? 'w-20 h-20 text-3xl' : 'w-16 h-16 text-2xl'} font-bold active:scale-95 transition-transform`}>
      {label}
    </button>
  )
}
