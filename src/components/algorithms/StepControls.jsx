// StepControls — universal transport bar every algorithm page uses.
//
// Props (built to match `useStepEngine`'s return shape 1:1):
//   playing      — boolean
//   onPlay       — () => void
//   onPause      — () => void
//   onStep       — (dir: 1 | -1) => void
//   onReset      — () => void
//   speed        — 0.25 → 4
//   onSpeed      — (n) => void
//   canStepBack  — optional dim guard
//   canStepNext  — optional dim guard
//   step, totalSteps — informational
//   disabled     — lock everything
//   compact      — skip the "Shortcuts" hint row (tight layouts)
//
// Backward-compat shim: if the caller only passes `onPlayPause`, we
// wire it to the play button.
//
// Keyboard: Space = play/pause · ← / → = step · R = reset.
// Ignored while an <input>/<textarea> has focus so parameter editors
// don't lose keystrokes.

import { useEffect } from 'react'
import { Button, Slider } from '../ui'
import {
  CaretRightOutlined,
  PauseOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  ReloadOutlined,
} from '@ant-design/icons'

const isTypingTarget = (el) => {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

export default function StepControls({
  playing = false,
  onPlay,
  onPause,
  onPlayPause,
  onStep,
  onReset,
  speed = 1,
  onSpeed,
  canStepBack = true,
  canStepNext = true,
  step,
  totalSteps,
  disabled = false,
  compact = false,
}) {
  const togglePlay = () => {
    if (onPlayPause) return onPlayPause()
    if (playing) return onPause?.()
    return onPlay?.()
  }

  useEffect(() => {
    const onKey = (e) => {
      if (disabled) return
      if (isTypingTarget(document.activeElement)) return
      if (e.code === 'Space')       { e.preventDefault(); togglePlay() }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); onStep?.(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onStep?.(+1) }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); onReset?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // togglePlay depends on onPlay/onPause/onPlayPause/playing — listing
    // primitives here is enough (function identities don't matter for
    // correctness, only that the handler reads latest state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, onPlay, onPause, onPlayPause, playing, onStep, onReset])

  const speedLabel = speed >= 1 ? `${speed.toFixed(2).replace(/\.?0+$/, '')}x` : `${speed}x`

  return (
    <div className="luxe-card p-3 sm:p-4 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="small"
          disabled={disabled || !canStepBack}
          onClick={() => onStep?.(-1)}
          icon={<StepBackwardOutlined />}
          title="Step back (Left arrow)"
          aria-label="Step back"
        />
        <Button
          variant={playing ? 'danger' : 'primary'}
          onClick={togglePlay}
          disabled={disabled}
          icon={playing ? <PauseOutlined /> : <CaretRightOutlined />}
          title="Play / Pause (Space)"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button
          variant="ghost"
          size="small"
          disabled={disabled || !canStepNext}
          onClick={() => onStep?.(+1)}
          icon={<StepForwardOutlined />}
          title="Step forward (Right arrow)"
          aria-label="Step forward"
        />
        <Button
          variant="subtle"
          size="small"
          disabled={disabled}
          onClick={onReset}
          icon={<ReloadOutlined />}
          title="Reset (R)"
        >
          Reset
        </Button>

        <div className="flex-1 min-w-[140px] flex items-center gap-2 pl-1 sm:pl-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 shrink-0">Speed</span>
          <div className="flex-1 min-w-0">
            <Slider
              accent="amber"
              min={0.25}
              max={4}
              step={0.25}
              value={speed}
              onChange={onSpeed}
              disabled={disabled}
              tooltip={{ formatter: (v) => `${v}x` }}
            />
          </div>
          <span className="text-[10.5px] font-mono text-amber-300 shrink-0 w-14 text-right">
            {speedLabel}
          </span>
        </div>

        {typeof step === 'number' && typeof totalSteps === 'number' && (
          <div className="text-[11px] font-mono text-gray-400 whitespace-nowrap shrink-0">
            Step <span className="text-white">{step}</span>
            <span className="text-gray-600"> / </span>
            <span className="text-gray-300">{totalSteps}</span>
          </div>
        )}
      </div>

      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-gray-500 leading-snug">
          <span className="uppercase tracking-wider text-gray-600">Shortcuts</span>
          <kbd className="px-1 py-[1px] rounded bg-white/[0.04] border border-white/10 text-gray-400">Space</kbd>
          <span className="text-gray-600">play·pause</span>
          <kbd className="px-1 py-[1px] rounded bg-white/[0.04] border border-white/10 text-gray-400">←</kbd>
          <kbd className="px-1 py-[1px] rounded bg-white/[0.04] border border-white/10 text-gray-400">→</kbd>
          <span className="text-gray-600">step</span>
          <kbd className="px-1 py-[1px] rounded bg-white/[0.04] border border-white/10 text-gray-400">R</kbd>
          <span className="text-gray-600">reset</span>
        </div>
      )}
    </div>
  )
}
