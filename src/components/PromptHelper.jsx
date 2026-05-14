import { useState, useEffect } from 'react'
import { Modal, Input, Tooltip, message as antMessage } from 'antd'
import { BulbOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons'
import { promptCoach } from '../api/ai'

// ─── Family catalog ───────────────────────────────────────────────
// Each family maps to a BE system prompt (services/controllers/v1/ai.js
// PROMPT_COACH_SYSTEMS). FE adds: label, blurb, optional CFG hint, and
// sample prompts the user can click-to-copy.
//
// Image families (sdxl / pony / sdxl-hyper / flux) live in ImageEnhancer's
// PROMPT_SAMPLES — kept there for back-compat with that page's existing
// flow. THIS catalog covers the NEW studio tabs (audio + cinema).
export const FAMILY_TIPS = {
  music: {
    label: 'Music · MusicGen',
    blurb: 'Describe genre, tempo, instruments, mood. 1-2 sentences. Up to 30s output.',
    cfg: '',
  },
  sfx: {
    label: 'SFX · Stable Audio',
    blurb: 'One-shot sound or ambience. Be sensory ("thunderclap echoing in cathedral, low rumble fade-out"). Up to 47s.',
    cfg: '',
  },
  tts: {
    label: 'TTS · Bark',
    blurb: 'Plain text Bark will read aloud. Punctuation matters — Bark respects ! ? , and pauses.',
    cfg: '',
  },
  cinema: {
    label: 'Cinema · Master prompt',
    blurb: 'A single sentence describing the WHOLE story. Groq will split this into N shot prompts. Mention the subject, the setting, and one clear arc.',
    cfg: '',
  },
}

export const PROMPT_SAMPLES = {
  music: [
    { title: '🎹 Synthwave', tags: ['retro', '120bpm'],
      text: 'upbeat synthwave with driving analog bass, shimmering pads, gated reverb snares, 120 BPM, nostalgic 80s mood' },
    { title: '🎻 Cinematic strings', tags: ['epic'],
      text: 'soaring cinematic strings with deep brass swells, slow build, emotional crescendo, film-score quality, hopeful tone' },
    { title: '🥁 Lofi hip hop', tags: ['chill'],
      text: 'mellow lofi hip hop beat with dusty vinyl crackle, soft Rhodes piano, jazzy chords, late-night studying vibe' },
    { title: '🎸 Indie rock', tags: ['guitar'],
      text: 'energetic indie rock with chiming reverb-soaked guitars, driving drums, anthemic hooks, summer festival mood' },
    { title: '🌊 Ambient drone', tags: ['cinematic'],
      text: 'slow evolving ambient drone, warm pad textures, distant bell chimes, contemplative cinematic atmosphere' },
  ],
  sfx: [
    { title: '⚡ Thunderclap', tags: ['nature'],
      text: 'thunderclap echoing in a cathedral, deep low-end rumble, long reverb tail fading to silence' },
    { title: '🚪 Heavy door', tags: ['foley'],
      text: 'heavy iron door creaking open then slamming shut, dungeon ambience, dust settling' },
    { title: '🌧️ Rainy street', tags: ['ambience'],
      text: 'gentle rain falling on a quiet city street at night, distant traffic, occasional puddle splash, melancholy mood' },
    { title: '🔥 Crackling fire', tags: ['ambience'],
      text: 'fireplace crackling, wood popping, soft warm whoosh, intimate living-room atmosphere' },
    { title: '🚀 Sci-fi engine', tags: ['cinematic'],
      text: 'massive sci-fi spaceship engine powering up, low hum building to thrumming bass, mechanical clicks, ready-for-launch' },
  ],
  tts: [
    { title: '📢 Trailer voice', tags: ['narration'],
      text: 'In a world where pixels became dreams... one developer dared to build the impossible.' },
    { title: '🎓 Tutorial intro', tags: ['friendly'],
      text: 'Hey everyone, welcome back to the channel! Today we are diving into something really fun — let me show you.' },
    { title: '🤖 Robot dialogue', tags: ['character'],
      text: 'Greetings, human. My calibration is complete. I am ready to assist with your task.' },
    { title: '📞 Voicemail', tags: ['casual'],
      text: 'Hey, it is me. Just wanted to check in — give me a call back when you have a minute. Talk soon.' },
  ],
  cinema: [
    { title: '🥷 Samurai forest', tags: ['narrative'],
      text: 'A lone samurai walks through a misty bamboo forest at dawn, discovering an abandoned shrine where a mysterious light pulses from within.' },
    { title: '🚀 Astronaut discovery', tags: ['sci-fi'],
      text: 'An astronaut steps out of a crashed pod onto an alien beach, finds glowing crystal formations, plants their flag as twin suns rise.' },
    { title: '🐺 Wolf migration', tags: ['nature'],
      text: 'A wolf pack moves through snowy mountain passes at golden hour, the leader catches a scent, they descend into a hidden valley where their kin wait.' },
    { title: '🏙️ Neon detective', tags: ['noir'],
      text: 'A detective walks through neon-lit rainy streets of a cyberpunk city at night, follows a lead into an underground bar, confronts a mysterious figure.' },
    { title: '🌅 Surfer story', tags: ['cinematic'],
      text: 'A surfer paddles out at sunrise, catches the perfect wave through a barrel of spray, emerges into golden light, paddles back smiling.' },
  ],
}

// ─── Component ────────────────────────────────────────────────────
// Drop-in modal. Open with `open`, fill via `onApply(text)`. Coach state
// is owned by the parent so it persists across open/close — pass
// `idea / setIdea / coachResult / setCoachResult / coachError / setCoachError`.
//
// If `family` doesn't match a known FAMILY_TIPS entry, the helper falls
// back to a generic sdxl-like prompt set.
export default function PromptHelper({
  open, onClose, family = 'music', onApply, onAppend, onApplyNegative,
  currentPrompt = '',
  idea: parentIdea, setIdea: setParentIdea,
  coachResult: parentResult, setCoachResult: setParentResult,
  coachError: parentError, setCoachError: setParentError,
}) {
  const tip = FAMILY_TIPS[family] || { label: family, blurb: '', cfg: '' }
  const samples = PROMPT_SAMPLES[family] || []

  const [localIdea, setLocalIdea] = useState('')
  const [localResult, setLocalResult] = useState(null)
  const [localError, setLocalError] = useState('')
  const idea = setParentIdea ? parentIdea : localIdea
  const setIdea = setParentIdea || setLocalIdea
  const coachResult = setParentResult ? parentResult : localResult
  const setCoachResult = setParentResult || setLocalResult
  const coachError = setParentError ? parentError : localError
  const setCoachError = setParentError || setLocalError

  const [coachLoading, setCoachLoading] = useState(false)

  const copy = async (text, label = 'Prompt') => {
    try {
      await navigator.clipboard.writeText(text)
      antMessage.success(`${label} copied`)
    } catch { antMessage.error('Could not copy — browser blocked clipboard') }
  }

  const askCoach = async () => {
    if (!idea.trim() || idea.trim().length < 3) {
      setCoachError('Tell the coach what you want (at least 3 chars)'); return
    }
    setCoachLoading(true); setCoachError(''); setCoachResult(null)
    const { data, error: err } = await promptCoach({ idea: idea.trim(), family })
    setCoachLoading(false)
    if (err) { setCoachError(err); return }
    setCoachResult(data)
  }

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={760} centered closeIcon={null}
      styles={{
        content: { background: '#0b0f17', padding: 0, borderRadius: 16, border: '1px solid rgba(251,191,36,0.25)', maxWidth: '95vw' },
        body: { padding: 0 },
        mask: { backdropFilter: 'blur(6px)' },
      }}>
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-800/80 bg-gradient-to-r from-amber-500/10 via-fuchsia-500/5 to-transparent">
        <div className="flex items-center gap-2 min-w-0">
          <BulbOutlined className="text-amber-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-white tracking-wide">
              Prompt helper
              <span className="ml-2 text-[10px] font-mono text-amber-300/80">{tip.label}</span>
            </h3>
            <p className="text-[10px] text-gray-500 leading-snug mt-0.5">{tip.blurb}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(idea || coachResult) && (
            <button onClick={() => { setIdea(''); setCoachResult(null); setCoachError('') }}
              className="text-[10px] uppercase tracking-wider text-gray-500 hover:text-amber-300 px-2 py-1 rounded border border-gray-800 hover:border-amber-500/50">
              ↻ Reset
            </button>
          )}
          <button onClick={onClose}
            className="text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-300 px-2 py-1 rounded border border-gray-800 hover:border-gray-700">
            esc
          </button>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-5 space-y-5">
        {/* Ask AI */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-fuchsia-300 font-semibold">
              ✨ Describe what you want
            </span>
            <span className="text-[9px] font-mono text-gray-600">powered by Groq · llama-3.3-70b</span>
          </div>
          <Input.TextArea value={idea}
            onChange={(e) => { setIdea(e.target.value); if (coachError) setCoachError('') }}
            autoSize={{ minRows: 2, maxRows: 5 }}
            placeholder={
              family === 'music' ? 'e.g. "high-energy synthwave for a coding montage"'
              : family === 'sfx' ? 'e.g. "rainy cyberpunk alley at 3 AM"'
              : family === 'tts' ? 'e.g. "calm explainer voice intro"'
              : family === 'cinema' ? 'e.g. "samurai finds an abandoned shrine in misty bamboo"'
              : 'describe what you want in plain English'
            }
            disabled={coachLoading} maxLength={500} showCount
            onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); askCoach() } }}
          />
          {coachError && <p className="text-rose-400 text-xs mt-2">✗ {coachError}</p>}
          <div className="flex items-center justify-between gap-2 mt-2">
            <p className="text-[10px] text-gray-600">
              Press <span className="font-mono text-gray-400">Enter</span> to ask · Shift+Enter for newline
            </p>
            <button onClick={askCoach} disabled={coachLoading || !idea.trim()}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                coachLoading || !idea.trim()
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-fuchsia-500 to-amber-500 text-black hover:scale-[1.02]'
              }`}>
              {coachLoading ? (
                <><span className="w-3 h-3 rounded-full border-2 border-black/30 border-t-black animate-spin" />Thinking…</>
              ) : <>✨ Generate prompt</>}
            </button>
          </div>

          {coachResult && (
            <div className="mt-3 rounded-xl border border-fuchsia-500/40 bg-gradient-to-b from-fuchsia-500/10 to-transparent p-3 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-fuchsia-300 font-semibold">Tuned prompt</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => copy(coachResult.prompt)}
                      className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700">
                      <CopyOutlined /> Copy
                    </button>
                    <button onClick={() => onApply(coachResult.prompt, coachResult.negative)}
                      className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-500/30 hover:bg-fuchsia-500/40 text-fuchsia-200 border border-fuchsia-500/50 font-semibold">
                      <CheckOutlined /> Use {coachResult.negative ? 'both' : 'this'}
                    </button>
                  </div>
                </div>
                <p className="text-[12px] text-gray-200 font-mono leading-relaxed whitespace-pre-wrap break-words">
                  {coachResult.prompt}
                </p>
              </div>
              {coachResult.negative && onApplyNegative && (
                <div className="pt-2 border-t border-fuchsia-500/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wider text-rose-300 font-semibold">Negative prompt (suggested)</span>
                    <button onClick={() => { onApplyNegative(coachResult.negative); antMessage.success('Negative prompt applied') }}
                      className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 font-semibold">
                      <CheckOutlined /> Apply
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 font-mono leading-relaxed whitespace-pre-wrap break-words">{coachResult.negative}</p>
                </div>
              )}
            </div>
          )}
        </section>

        {samples.length > 0 && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden><div className="w-full border-t border-gray-800" /></div>
              <div className="relative flex justify-center">
                <span className="px-2 bg-[#0b0f17] text-[9px] uppercase tracking-widest text-gray-600">or pick a starter</span>
              </div>
            </div>

            <section>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-cyan-300 font-semibold">
                  📋 {samples.length} {tip.label} starters
                </span>
              </div>
              <ul className="space-y-2">
                {samples.map((s, i) => (
                  <li key={i} className="rounded-xl border border-gray-800 bg-gray-900/40 hover:border-cyan-500/40 transition-colors p-3 group">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[12px] font-semibold text-gray-100 truncate">{s.title}</span>
                        <div className="flex gap-1 shrink-0">
                          {(s.tags || []).map(t => (
                            <span key={t} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">{t}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Tooltip title="Copy">
                          <button onClick={() => copy(s.text)}
                            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-gray-800/70 hover:bg-gray-700 text-gray-400 hover:text-gray-200 border border-gray-700/60">
                            <CopyOutlined />
                          </button>
                        </Tooltip>
                        {onAppend && currentPrompt?.trim() && (
                          <Tooltip title="Append to current">
                            <button onClick={() => onAppend(s.text)}
                              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-gray-800/70 hover:bg-gray-700 text-gray-400 hover:text-gray-200 border border-gray-700/60">
                              + add
                            </button>
                          </Tooltip>
                        )}
                        <button onClick={() => onApply(s.text)}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 font-semibold">
                          <CheckOutlined /> Use
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400 font-mono leading-relaxed break-words">{s.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </Modal>
  )
}
