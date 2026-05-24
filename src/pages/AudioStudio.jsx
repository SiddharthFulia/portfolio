import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Input, Select, Slider, Tooltip, Upload, Alert, message as antMessage } from 'antd'
import { CustomerServiceOutlined, ThunderboltOutlined, DownloadOutlined, ReloadOutlined, BulbOutlined, CheckOutlined, CloseOutlined, DeleteOutlined, UploadOutlined, CopyOutlined, SyncOutlined, SoundOutlined, AudioOutlined, EditOutlined, ScissorOutlined, VideoCameraOutlined, DesktopOutlined } from '@ant-design/icons'
import { submitAudio, getAudioStatus, listAudioJobs, audioBulkAction, transcribeAudio, fileToDataUrl } from '../api/ai'
import PromptHelper from '../components/PromptHelper'
import StudioLibrary, { SelectCheckbox } from '../components/StudioLibrary'
import AudioRecorder from '../components/AudioRecorder'
import VoiceCloneAnalysis from '../components/VoiceCloneAnalysis'
import { FastTTS } from '../components/aitools'
import useQueryState from '../hooks/useQueryState'

const KINDS = [
  { value: 'fast-tts',     label: 'Fast TTS',          icon: <ThunderboltOutlined />, blurb: 'Instant TTS via Browser voice or Cloud — no queue, sub-second.',       defaultModel: 'browser-or-cloud' },
  { value: 'music',        label: 'Music',             icon: <CustomerServiceOutlined />, blurb: 'Background tracks, soundtracks, loops. Best for video soundtracks.',  defaultModel: 'musicgen' },
  { value: 'sfx',          label: 'SFX / Ambience',    icon: <SoundOutlined />, blurb: 'One-shot effects, foley, drones, ambient textures.',                   defaultModel: 'stable-audio' },
  { value: 'tts',          label: 'Text → Speech',     icon: <AudioOutlined />, blurb: 'Heavy-duty multilingual TTS via Bark on 5090.',                       defaultModel: 'bark' },
  { value: 'stt',          label: 'Speech → Text',     icon: <EditOutlined />, blurb: 'Upload audio → transcript. Whisper, 99 languages, auto-detect.',      defaultModel: 'whisper' },
  { value: 'separate',     label: 'Stem Split',        icon: <ScissorOutlined />, blurb: 'Split a song into vocals / drums / bass / other. Demucs on 5090.',    defaultModel: 'htdemucs' },
  { value: 'voice-clone',  label: 'Voice Clone',       icon: <AudioOutlined />, blurb: 'Upload a 6-30s clip + text → speech in that voice (XTTS-v2, 5090).',  defaultModel: 'xtts-v2' },
  { value: 'voice-sing',   label: 'Cloned Singing',    icon: <CustomerServiceOutlined />, blurb: 'Voice clone rides a melody track to sing your lyrics (XTTS+RVC).',     defaultModel: 'xtts-v2+rvc' },
  // Lip sync was a standalone /lipsync page — now consolidated here as a
  // kind. Render is an iframe so we don't have to refactor 600 lines of
  // form into a sub-component. The /lipsync route still works directly.
  { value: 'lipsync',      label: 'Lip Sync',          icon: <VideoCameraOutlined />, blurb: 'Audio + portrait → talking-head video. LatentSync · MuseTalk · LivePortrait.', defaultModel: 'latentsync' },
]

const MODELS = {
  music:       [{ value: 'musicgen',     label: 'MusicGen Small',        blurb: 'Meta MusicGen — fast, music-tuned. Up to 30s.' }],
  sfx:         [{ value: 'stable-audio', label: 'Stable Audio Open 1.0', blurb: 'Stability AI — best for non-music SFX up to 47s.' }],
  tts:         [{ value: 'bark',         label: 'Bark',                  blurb: 'Multilingual TTS with voice presets. Suno research.' }],
  stt:         [{ value: 'whisper',      label: 'Whisper large-v3',      blurb: 'Whisper transcription. Auto-detect 99 languages.' }],
  separate:    [{ value: 'htdemucs',     label: 'Demucs (htdemucs)',     blurb: 'SOTA 4-stem separator. Splits vocals / drums / bass / other.' }],
  'voice-clone': [{ value: 'xtts-v2',      label: 'XTTS-v2',               blurb: 'Coqui XTTS-v2 — 16-language voice clone from a single 6-30s reference clip.' }],
  'voice-sing':  [{ value: 'xtts-v2+rvc',  label: 'XTTS-v2 + RVC',         blurb: 'XTTS speech driven through RVC against your melody track. Falls back to flat speech if no melody.' }],
}

// Languages XTTS-v2 supports. Selected at submit time so the synth doesn't
// guess the wrong phoneme set for the user's lyrics.
const XTTS_LANGUAGES = [
  { value: 'en', label: '🇬🇧 English' },
  { value: 'hi', label: '🇮🇳 Hindi' },
  { value: 'es', label: '🇪🇸 Spanish' },
  { value: 'fr', label: '🇫🇷 French' },
  { value: 'de', label: '🇩🇪 German' },
  { value: 'it', label: '🇮🇹 Italian' },
  { value: 'pt', label: '🇵🇹 Portuguese' },
  { value: 'pl', label: '🇵🇱 Polish' },
  { value: 'tr', label: '🇹🇷 Turkish' },
  { value: 'ru', label: '🇷🇺 Russian' },
  { value: 'nl', label: '🇳🇱 Dutch' },
  { value: 'cs', label: '🇨🇿 Czech' },
  { value: 'ar', label: '🇸🇦 Arabic' },
  { value: 'zh-cn', label: '🇨🇳 Chinese' },
  { value: 'ja', label: '🇯🇵 Japanese' },
  { value: 'ko', label: '🇰🇷 Korean' },
]

// Optional language hint for Whisper. Empty string = auto-detect (Whisper
// gets this right ~95% of the time for clips ≥10s).
const STT_LANGUAGES = [
  { value: '',   label: 'Auto-detect' },
  { value: 'en', label: '🇬🇧 English' },
  { value: 'hi', label: '🇮🇳 Hindi' },
  { value: 'es', label: '🇪🇸 Spanish' },
  { value: 'fr', label: '🇫🇷 French' },
  { value: 'de', label: '🇩🇪 German' },
  { value: 'it', label: '🇮🇹 Italian' },
  { value: 'ja', label: '🇯🇵 Japanese' },
  { value: 'ko', label: '🇰🇷 Korean' },
  { value: 'zh', label: '🇨🇳 Chinese' },
  { value: 'pt', label: '🇵🇹 Portuguese' },
  { value: 'ru', label: '🇷🇺 Russian' },
  { value: 'ar', label: '🇸🇦 Arabic' },
  { value: 'tr', label: '🇹🇷 Turkish' },
  { value: 'nl', label: '🇳🇱 Dutch' },
]

// Bark ships ~150 official voice presets across 13 languages — these are
// the most usable curated picks. The Select groups them by language so the
// user can scan without scrolling 130 entries. Add more as needed; Bark
// just expects the `v2/<lang>_speaker_N` string.
const BARK_VOICES = [
  // English (UK + US)
  { value: 'v2/en_speaker_0', label: '🇺🇸 en_speaker_0 (male, neutral)' },
  { value: 'v2/en_speaker_1', label: '🇺🇸 en_speaker_1 (US, narration)' },
  { value: 'v2/en_speaker_2', label: '🇺🇸 en_speaker_2 (male, deep)' },
  { value: 'v2/en_speaker_3', label: '🇺🇸 en_speaker_3 (US, casual)' },
  { value: 'v2/en_speaker_4', label: '🇺🇸 en_speaker_4 (male, energetic)' },
  { value: 'v2/en_speaker_5', label: '🇬🇧 en_speaker_5 (female, calm)' },
  { value: 'v2/en_speaker_6', label: '🇬🇧 en_speaker_6 (male, clear)' },
  { value: 'v2/en_speaker_7', label: '🇬🇧 en_speaker_7 (male, husky)' },
  { value: 'v2/en_speaker_8', label: '🇬🇧 en_speaker_8 (male, smooth)' },
  { value: 'v2/en_speaker_9', label: '🇬🇧 en_speaker_9 (female, warm)' },
  // Hindi
  { value: 'v2/hi_speaker_0', label: '🇮🇳 hi_speaker_0 (Hindi, male)' },
  { value: 'v2/hi_speaker_2', label: '🇮🇳 hi_speaker_2 (Hindi, female)' },
  { value: 'v2/hi_speaker_5', label: '🇮🇳 hi_speaker_5 (Hindi, narration)' },
  { value: 'v2/hi_speaker_8', label: '🇮🇳 hi_speaker_8 (Hindi, casual)' },
  // Spanish
  { value: 'v2/es_speaker_0', label: '🇪🇸 es_speaker_0 (Spanish, male)' },
  { value: 'v2/es_speaker_8', label: '🇪🇸 es_speaker_8 (Spanish, female)' },
  // French
  { value: 'v2/fr_speaker_0', label: '🇫🇷 fr_speaker_0 (French, male)' },
  { value: 'v2/fr_speaker_5', label: '🇫🇷 fr_speaker_5 (French, female)' },
  // German
  { value: 'v2/de_speaker_3', label: '🇩🇪 de_speaker_3 (German, male)' },
  { value: 'v2/de_speaker_8', label: '🇩🇪 de_speaker_8 (German, female)' },
  // Italian
  { value: 'v2/it_speaker_0', label: '🇮🇹 it_speaker_0 (Italian, male)' },
  { value: 'v2/it_speaker_4', label: '🇮🇹 it_speaker_4 (Italian, female)' },
  // Japanese
  { value: 'v2/ja_speaker_0', label: '🇯🇵 ja_speaker_0 (Japanese, male)' },
  { value: 'v2/ja_speaker_4', label: '🇯🇵 ja_speaker_4 (Japanese, female)' },
  // Korean
  { value: 'v2/ko_speaker_0', label: '🇰🇷 ko_speaker_0 (Korean, male)' },
  { value: 'v2/ko_speaker_3', label: '🇰🇷 ko_speaker_3 (Korean, female)' },
  // Chinese
  { value: 'v2/zh_speaker_0', label: '🇨🇳 zh_speaker_0 (Mandarin, male)' },
  { value: 'v2/zh_speaker_6', label: '🇨🇳 zh_speaker_6 (Mandarin, female)' },
  // Portuguese
  { value: 'v2/pt_speaker_0', label: '🇵🇹 pt_speaker_0 (Portuguese, male)' },
  { value: 'v2/pt_speaker_4', label: '🇵🇹 pt_speaker_4 (Portuguese, female)' },
  // Russian
  { value: 'v2/ru_speaker_0', label: '🇷🇺 ru_speaker_0 (Russian, male)' },
  { value: 'v2/ru_speaker_5', label: '🇷🇺 ru_speaker_5 (Russian, female)' },
  // Turkish + Polish
  { value: 'v2/tr_speaker_0', label: '🇹🇷 tr_speaker_0 (Turkish, male)' },
  { value: 'v2/pl_speaker_0', label: '🇵🇱 pl_speaker_0 (Polish, male)' },
]

export default function AudioStudio() {
  // ?kind= mirrors the active audio lane so refresh / shared URLs land
  // on the same tool. Default 'music' is omitted from the URL.
  const [kind, setKind] = useQueryState('kind', 'music', {
    allowed: KINDS.map(k => k.value),
  })
  const [model, setModel] = useState('musicgen')
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(10)
  const [voice, setVoice] = useState(BARK_VOICES[0].value)
  const [working, setWorking] = useState(false)
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const pollTimer = useRef(null)
  // STT-specific state (only used when kind === 'stt'). Keeps the form
  // simple — we don't reuse `prompt` for the file since transcription
  // doesn't take a prompt at all.
  const [sttFile, setSttFile] = useState(null)
  const [sttDataUrl, setSttDataUrl] = useState('')
  const [sttLanguage, setSttLanguage] = useState('')
  const [sttResult, setSttResult] = useState(null)
  // Provider: 'cloud' = synchronous via /api/stt (Whisper-small et al.,
  // sub-2s), '5090' = async via /api/audio queue (Whisper-large-v3 on the
  // 5090, ~5-15s but local + private + best quality).
  const [sttProvider, setSttProvider] = useState('cloud')
  // Stem-separation state (only used when kind === 'separate'). Reuses
  // sttFile/sttDataUrl for the upload (same input shape), but renders a
  // separate result panel built around the 4 stem URLs + lyrics.
  const [sepWithLyrics, setSepWithLyrics] = useState(true)
  const [sepResult, setSepResult] = useState(null)
  // Voice-clone state (kind === 'voice-clone' | 'voice-sing'). vcRef* is the
  // target-voice reference clip (6-30s clean speech), vcMelody* is the
  // optional sung/hummed melody for voice-sing. vcLanguage maps directly
  // to XTTS-v2's language code. vcConsent is the rights-attestation gate.
  const [vcRefFile, setVcRefFile] = useState(null)
  const [vcRefDataUrl, setVcRefDataUrl] = useState('')
  const [vcMelodyFile, setVcMelodyFile] = useState(null)
  const [vcMelodyDataUrl, setVcMelodyDataUrl] = useState('')
  const [vcLanguage, setVcLanguage] = useState('en')
  const [vcConsent, setVcConsent] = useState(false)
  // Prompt helper modal — state lives here so closing + reopening keeps the
  // last AI-generated prompt + idea
  const [helperOpen, setHelperOpen] = useState(false)
  const [coachIdea, setCoachIdea] = useState('')
  const [coachResult, setCoachResult] = useState(null)
  const [coachError, setCoachError] = useState('')
  const [libraryRefresh, setLibraryRefresh] = useState(0)

  useEffect(() => { document.title = 'Audio Studio · Sid' }, [])
  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current) }, [])
  useEffect(() => {
    const k = KINDS.find(k => k.value === kind)
    if (k) setModel(k.defaultModel)
  }, [kind])

  const startPolling = (jobId) => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = setInterval(async () => {
      const { data, error: err } = await getAudioStatus(jobId)
      if (err) return
      if (!data) return
      setJob(data)
      if (data.status === 'completed') {
        clearInterval(pollTimer.current); pollTimer.current = null; setWorking(false)
        // STT jobs return text in `transcript`, not a URL. Promote it
        // into sttResult so the existing transcript renderer picks it up.
        if (data.kind === 'stt' && typeof data.transcript === 'string') {
          setSttResult({
            text: data.transcript,
            chunks: [],
            model: data.model || 'whisper-large-v3',
            elapsedMs: data.completedAt && data.createdAt
              ? new Date(data.completedAt) - new Date(data.createdAt) : null,
            provider: '5090',
          })
          antMessage.success('Transcript ready')
        }
        // Stem-separation jobs return a `stems` object — promote to sepResult.
        if (data.kind === 'separate' && data.stems && typeof data.stems === 'object') {
          setSepResult({
            stems: data.stems,
            model: data.model || 'htdemucs',
            elapsedMs: data.completedAt && data.createdAt
              ? new Date(data.completedAt) - new Date(data.createdAt) : null,
          })
          antMessage.success('Stems ready')
        }
        setLibraryRefresh(k => k + 1)
      } else if (data.status === 'failed') {
        clearInterval(pollTimer.current); pollTimer.current = null; setWorking(false)
        setError(data.error || 'Audio generation failed')
      }
    }, 2000)
  }

  const generate = async () => {
    // STT path branches by provider:
    //   • 'cloud' → POST /api/stt — synchronous, sub-2s, smaller Whisper
    //   • '5090'  → POST /api/audio with kind=stt — async via queue,
    //               Whisper-large-v3 locally, ~5-15s. Polls /audio/status
    //               until transcript appears in the job row.
    if (kind === 'stt') {
      if (!sttDataUrl) { setError('Upload an audio file first'); return }
      setError(null); setJob(null); setSttResult(null); setWorking(true)

      if (sttProvider === 'cloud') {
        const { data, error: err } = await transcribeAudio({
          dataUrl: sttDataUrl, language: sttLanguage,
        })
        setWorking(false)
        if (err) { setError(err); return }
        setSttResult(data)
        antMessage.success('Transcript ready')
        return
      }

      // 5090 path: submitAudio({ kind: 'stt', audioDataUrl, language })
      // → returns a jobId. We piggy-back on the existing audio job polling
      // (startPolling) but treat the response's `transcript` field as the
      // result instead of `outputUrl`.
      const { data, error: err } = await submitAudio({
        kind: 'stt',
        model: 'whisper-large-v3',
        audioDataUrl: sttDataUrl,
        language: sttLanguage,
      })
      if (err) { setWorking(false); setError(err); return }
      setJob(data)
      startPolling(data.jobId)
      return
    }

    // Stem separation — async, runs Demucs on 5090. Reuses sttDataUrl as
    // the input slot (same audio upload UI) and polls the audio job until
    // `stems` is set. Always uses 5090 — no cloud demucs API on the free
    // tier worth wiring.
    if (kind === 'separate') {
      if (!sttDataUrl) { setError('Upload a song first'); return }
      setError(null); setJob(null); setSepResult(null); setWorking(true)
      const { data, error: err } = await submitAudio({
        kind: 'separate',
        model: 'htdemucs',
        audioDataUrl: sttDataUrl,
        withLyrics: sepWithLyrics,
      })
      if (err) { setWorking(false); setError(err); return }
      setJob(data)
      startPolling(data.jobId)
      return
    }

    // Voice-clone branches — both kinds share state. voice-sing optionally
    // ships a melody clip too; absence falls through to flat XTTS speech.
    if (kind === 'voice-clone' || kind === 'voice-sing') {
      if (!vcRefDataUrl)   { setError('Upload a 6-30s reference clip of the target voice'); return }
      if (!prompt.trim())  { setError(kind === 'voice-sing' ? 'Add the lyrics to sing' : 'Add the text to speak'); return }
      if (!vcConsent)      { setError('Confirm you have the right to use this voice'); return }
      setError(null); setJob(null); setWorking(true)
      const payload = {
        kind, model,
        prompt: prompt.trim(),
        referenceAudioDataUrl: vcRefDataUrl,
        ...(kind === 'voice-sing' && vcMelodyDataUrl ? { melodyAudioDataUrl: vcMelodyDataUrl } : {}),
      }
      const { data, error: err } = await submitAudio(payload)
      if (err) { setWorking(false); setError(err); return }
      setJob(data)
      startPolling(data.jobId)
      return
    }

    if (!prompt.trim()) { setError('Add a prompt'); return }
    setError(null); setJob(null); setWorking(true)
    const payload = { kind, model, prompt: prompt.trim(), duration }
    if (kind === 'tts') payload.voice = voice
    const { data, error: err } = await submitAudio(payload)
    if (err) { setWorking(false); setError(err); return }
    setJob(data)
    startPolling(data.jobId)
  }

  // Voice-clone uploads — separate slots from sttFile so the user can swap
  // between kinds without losing state. 8 MB cap on each (XTTS reference
  // clips are typically <1 MB; melody tracks rarely exceed a few MB).
  const handleVcRefUpload = async (file) => {
    if (!file) return false
    if (file.size > 8 * 1024 * 1024) { antMessage.error('Reference clip too large (max 8 MB)'); return false }
    try {
      const d = await fileToDataUrl(file)
      setVcRefFile(file); setVcRefDataUrl(d); setError(null)
    } catch { antMessage.error('Could not read file') }
    return false
  }
  const handleVcMelodyUpload = async (file) => {
    if (!file) return false
    if (file.size > 16 * 1024 * 1024) { antMessage.error('Melody clip too large (max 16 MB)'); return false }
    try {
      const d = await fileToDataUrl(file)
      setVcMelodyFile(file); setVcMelodyDataUrl(d); setError(null)
    } catch { antMessage.error('Could not read file') }
    return false
  }

  // Audio (or video — Stem Split lane) → data URL. STT path is capped at
  // 25 MB because HF Whisper Inference rejects larger; Stem Split allows
  // up to 100 MB so users can drop full music videos / 3-minute mp4s.
  const handleSttUpload = async (file) => {
    if (!file) return false
    const cap = kind === 'separate' ? 100 * 1024 * 1024 : 25 * 1024 * 1024
    if (file.size > cap) {
      antMessage.error(`File too large (max ${Math.round(cap / 1024 / 1024)} MB)`)
      return false
    }
    try {
      const d = await fileToDataUrl(file)
      setSttFile(file); setSttDataUrl(d); setError(null); setSttResult(null); setSepResult(null)
    } catch {
      antMessage.error('Could not read file')
    }
    return false   // don't auto-POST via antd
  }

  const copyTranscript = async () => {
    if (!sttResult?.text) return
    try { await navigator.clipboard.writeText(sttResult.text); antMessage.success('Copied') } catch {}
  }

  const kindObj = KINDS.find(k => k.value === kind)

  return (
    <section className="relative min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16 px-4 sm:px-6 overflow-hidden">
      <div aria-hidden className="ambient-orb -top-32 left-1/2 -translate-x-1/2" />
      <div aria-hidden className="ambient-orb ambient-orb-cool -bottom-40 -right-32" />
      <div className="relative max-w-4xl mx-auto">
        <header className="mb-8">
          <p className="eyebrow-mono">— AI Studio · Audio</p>
          <div className="flex items-center gap-3 mt-2">
            <CustomerServiceOutlined className="text-amber-400 text-2xl" />
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight text-white">
              Audio Studio
            </h1>
          </div>
          <p className="mt-3 text-sm text-fg-secondary max-w-2xl leading-relaxed">
            Generate music, sound effects, or voice from text prompts. MusicGen + Stable Audio Open + Bark TTS, all on the 5090.
          </p>
        </header>

        {/* Kind picker — 3D tilt cards. 4 kinds now (music/sfx/tts/stt) so
            use 4-col on sm+ to keep the row tight; falls back to 2-col + 1-col
            on smaller breakpoints. */}
        <section className="mb-6">
          <h2 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Type</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 [perspective:1200px]">
            {KINDS.map(k => (
              <KindCard key={k.value} kind={k} active={kind === k.value}
                onSelect={() => setKind(k.value)} />
            ))}
          </div>
        </section>

        <section className="mb-6 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Model</label>
            <Select className="w-full" value={model} onChange={setModel}
              showSearch allowClear
              placeholder="Search model…"
              optionFilterProp="label"
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={MODELS[kind]} optionLabelProp="label"
              optionRender={(o) => (
                <div className="py-0.5">
                  <div className="text-[12px] font-semibold text-gray-100">{o.data.label}</div>
                  <div className="text-[10px] text-gray-500">{o.data.blurb}</div>
                </div>
              )}
            />
          </div>

          {kind === 'fast-tts' ? (
            // Instant TTS via Browser SpeechSynthesis or Google Cloud
            // (formerly lived in /ai-studio). No worker, no queue —
            // renders inline and bypasses every backend pipeline.
            <FastTTS />
          ) : kind === 'lipsync' ? (
            // Lip sync — the full /lipsync page renders fine standalone
            // but absorbing 600+ lines into a sub-component would risk
            // breakage. Iframe is the pragmatic move: same UX, lives
            // inside the Audio Studio tab so users don't go hunting.
            <div className="rounded-lg border border-amber-500/30 overflow-hidden bg-black"
                 style={{ height: 'min(80vh, 900px)' }}>
              <iframe title="Lip Sync" src="/lipsync"
                allow="camera; microphone; autoplay"
                className="w-full h-full" style={{ border: 0 }} />
            </div>
          ) : kind === 'separate' ? (
            // Stem-separation form: upload song + optional lyrics toggle.
            // Always runs on the 5090 (Demucs needs the GPU); no cloud
            // alternative wired up.
            <>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Song</label>
                {sttDataUrl ? (
                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3 space-y-2">
                    {/* Show as <video> if we got a video file, else <audio>.
                        Sniffing by file.type is good enough — the worker
                        does proper magic-byte detection downstream. */}
                    {sttFile?.type?.startsWith('video/')
                      ? <video src={sttDataUrl} controls className="w-full max-h-48 rounded-lg" />
                      : <audio src={sttDataUrl} controls className="w-full" />}
                    <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 font-mono">
                      <span className="truncate">{sttFile?.name || 'uploaded song'}</span>
                      <button onClick={() => { setSttFile(null); setSttDataUrl(''); setSepResult(null) }}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-rose-500/40 hover:border-rose-400 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 transition-colors">
                        <SyncOutlined className="text-[9px]" /> Replace
                      </button>
                    </div>
                  </div>
                ) : (
                  <Upload.Dragger multiple={false} showUploadList={false}
                    accept="audio/*,video/*"
                    beforeUpload={handleSttUpload}
                    style={{ background: 'transparent', borderColor: '#374151', padding: '24px 0' }}>
                    <UploadOutlined className="text-3xl text-amber-400 mb-2" />
                    <p className="text-sm text-gray-300">Drop a song or music video</p>
                    <p className="text-[10px] text-gray-500 mt-1">mp3 · wav · m4a · mp4 · webm · max 100 MB · audio track auto-extracted from video · runs on 5090</p>
                  </Upload.Dragger>
                )}
              </div>
              <label className="flex items-center justify-between gap-2 p-3 rounded-lg border border-gray-800 bg-gray-900/40 cursor-pointer">
                <span className="flex items-center gap-2">
                  <AudioOutlined className="text-base text-amber-300" />
                  <span className="text-xs font-semibold text-gray-200">Transcribe vocals → lyrics</span>
                  <span className="text-[10px] text-gray-500">+10-20s · Whisper on the vocals stem</span>
                </span>
                <input type="checkbox" checked={sepWithLyrics} onChange={e => setSepWithLyrics(e.target.checked)}
                  className="w-4 h-4 accent-amber-500" />
              </label>
              <p className="text-[10px] text-gray-600 leading-snug">
                Demucs splits the song into 4 audio stems: vocals, drums, bass, and everything else.
                Each comes back as a separate playable / downloadable file. Runs on Sid's RTX 5090 —
                beast.py must be online. First call downloads ~80 MB once.
              </p>
            </>
          ) : kind === 'stt' ? (
            // Speech-to-Text form: file upload + optional language hint.
            // No prompt, no duration slider, no voice picker — Whisper just
            // listens to the audio and returns text.
            <>
              {/* Provider toggle — cloud (fast, smaller model) vs 5090
                  (slower, Whisper-large-v3, fully local). We deliberately
                  don't name the cloud provider — keeps the brand neutral. */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Engine</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'cloud', label: 'Cloud',     icon: <ThunderboltOutlined />, desc: 'Fast · sub-2s · Whisper auto-fallback' },
                    { id: '5090',  label: '5090 Beast', icon: <DesktopOutlined />,    desc: 'Local · ~5-15s · Whisper-large-v3 quality' },
                  ].map(p => {
                    const active = sttProvider === p.id
                    return (
                      <button key={p.id} type="button" onClick={() => setSttProvider(p.id)}
                        className={`p-2.5 rounded-lg border text-left transition-colors ${
                          active
                            ? 'border-amber-400/60 bg-amber-500/12'
                            : 'border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:bg-gray-900'
                        }`}>
                        <div className={`text-xs font-semibold inline-flex items-center gap-1.5 ${active ? 'text-white' : 'text-gray-200'}`}>{p.icon}{p.label}</div>
                        <div className={`text-[10px] leading-snug mt-0.5 ${active ? 'text-white/70' : 'text-gray-500'}`}>{p.desc}</div>
                      </button>
                    )
                  })}
                </div>
                {sttProvider === '5090' && (
                  <p className="text-[10px] text-gray-600 mt-1.5 leading-snug">
                    Runs on Sid's RTX 5090 — beast.py must be online. First call downloads ~3 GB once.
                  </p>
                )}
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Audio</label>
                {sttDataUrl ? (
                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3 space-y-2">
                    <audio src={sttDataUrl} controls className="w-full" />
                    <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 font-mono">
                      <span className="truncate">{sttFile?.name || 'recorded audio'}</span>
                      <button onClick={() => { setSttFile(null); setSttDataUrl(''); setSttResult(null) }}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-rose-500/40 hover:border-rose-400 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 transition-colors">
                        <SyncOutlined className="text-[9px]" /> Replace
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload.Dragger multiple={false} showUploadList={false}
                      accept="audio/*,video/*"
                      beforeUpload={handleSttUpload}
                      style={{ background: 'transparent', borderColor: '#374151', padding: '24px 0' }}>
                      <UploadOutlined className="text-3xl text-amber-400 mb-2" />
                      <p className="text-sm text-gray-300">Drop audio or click to upload</p>
                      <p className="text-[10px] text-gray-500 mt-1">mp3 · wav · m4a · ogg · video (audio track) · max 25 MB</p>
                    </Upload.Dragger>
                    {/* Speak directly into the mic as an alternative to upload.
                        Whisper happily transcribes the webm/opus the recorder
                        produces — no transcode step needed. */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-gray-800" />
                      <span className="text-[10px] uppercase tracking-wider text-gray-600">or</span>
                      <div className="flex-1 h-px bg-gray-800" />
                    </div>
                    <AudioRecorder accentColor="#e879f9" maxSeconds={120}
                      onComplete={(d) => { setSttDataUrl(d); setSttFile(null); setSttResult(null); setError(null) }} />
                  </div>
                )}
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Language hint</label>
                <Select className="w-full" value={sttLanguage} onChange={setSttLanguage} options={STT_LANGUAGES} />
                <p className="text-[10px] text-gray-600 mt-1">
                  Auto-detect works well for clips ≥10s. Set a hint for short / mixed-language clips.
                </p>
              </div>
            </>
          ) : (kind === 'voice-clone' || kind === 'voice-sing') ? (
            // Voice-clone form — reference clip upload + lyrics + language +
            // (for voice-sing) optional melody track + consent gate.
            <>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">
                  Reference voice clip · 6–30s of clean speech
                </label>
                {vcRefDataUrl ? (
                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3 space-y-2">
                    <audio src={vcRefDataUrl} controls className="w-full" />
                    <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 font-mono">
                      <span className="truncate">{vcRefFile?.name || 'recorded clip'}</span>
                      <button onClick={() => { setVcRefFile(null); setVcRefDataUrl('') }}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-rose-500/40 hover:border-rose-400 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 transition-colors">
                        <SyncOutlined className="text-[9px]" /> Replace
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload.Dragger multiple={false} showUploadList={false}
                      accept="audio/*"
                      beforeUpload={handleVcRefUpload}
                      style={{ background: 'transparent', borderColor: '#374151', padding: '24px 0' }}>
                      <UploadOutlined className="text-3xl text-amber-400 mb-2" />
                      <p className="text-sm text-gray-300">Drop a reference clip or click to upload</p>
                      <p className="text-[10px] text-gray-500 mt-1">mp3 · wav · m4a · ogg · max 8 MB · 6–30s ideal</p>
                    </Upload.Dragger>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-gray-800" />
                      <span className="text-[10px] uppercase tracking-wider text-gray-600">or record</span>
                      <div className="flex-1 h-px bg-gray-800" />
                    </div>
                    <AudioRecorder accentColor="#e879f9" maxSeconds={30}
                      onComplete={(d) => { setVcRefDataUrl(d); setVcRefFile(null); setError(null) }} />
                  </div>
                )}
              </div>

              {kind === 'voice-sing' && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">
                    Melody track <span className="text-gray-600 normal-case font-normal">(optional · falls back to flat speech if empty)</span>
                  </label>
                  {vcMelodyDataUrl ? (
                    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3 space-y-2">
                      <audio src={vcMelodyDataUrl} controls className="w-full" />
                      <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 font-mono">
                        <span className="truncate">{vcMelodyFile?.name || 'hummed melody'}</span>
                        <button onClick={() => { setVcMelodyFile(null); setVcMelodyDataUrl('') }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-rose-500/40 hover:border-rose-400 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 transition-colors">
                          <SyncOutlined className="text-[9px]" /> Replace
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload.Dragger multiple={false} showUploadList={false}
                        accept="audio/*"
                        beforeUpload={handleVcMelodyUpload}
                        style={{ background: 'transparent', borderColor: '#374151', padding: '16px 0' }}>
                        <UploadOutlined className="text-2xl text-amber-400 mb-1" />
                        <p className="text-xs text-gray-300">Upload a hummed / sung melody (max 16 MB)</p>
                      </Upload.Dragger>
                      <AudioRecorder accentColor="#fbbf24" maxSeconds={60}
                        onComplete={(d) => { setVcMelodyDataUrl(d); setVcMelodyFile(null); setError(null) }} />
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">
                    {kind === 'voice-sing' ? 'Lyrics' : 'Text to speak'}
                  </label>
                  {prompt && (
                    <button type="button" onClick={() => setPrompt('')}
                      className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">clear</button>
                  )}
                </div>
                <Input.TextArea value={prompt} onChange={e => setPrompt(e.target.value)}
                  autoSize={{ minRows: 3, maxRows: 10 }}
                  placeholder={kind === 'voice-sing'
                    ? 'Lyrics, line by line. Hindi / English / Spanish / 13 more.'
                    : 'The text you want spoken in the cloned voice.'}
                  maxLength={2000} showCount
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Language</label>
                <Select className="w-full" value={vcLanguage} onChange={setVcLanguage}
                  showSearch allowClear
                  placeholder="Search language…"
                  filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  options={XTTS_LANGUAGES} />
                <p className="text-[10px] text-gray-600 mt-1">
                  Pick the language of the lyrics — XTTS chooses the phoneme set from this.
                </p>
              </div>

              <label className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] cursor-pointer">
                <input type="checkbox" checked={vcConsent}
                  onChange={e => setVcConsent(e.target.checked)}
                  className="mt-0.5 accent-amber-400" />
                <span className="text-[11px] text-amber-100/85 leading-relaxed">
                  I confirm I have the right to use this voice (my own, a consenting subject, or a licensed/public-domain source).
                  No real-person impersonation of public figures.
                </span>
              </label>
            </>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">
                    {kind === 'tts' ? 'Text to speak' : 'Prompt'}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setHelperOpen(true)}
                      title="AI prompt helper + sample prompts"
                      className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg border border-amber-500/40 hover:border-amber-400 bg-amber-500/12 hover:bg-amber-500/20 text-amber-300 transition-colors">
                      <BulbOutlined className="text-[10px]" /> Help me write
                    </button>
                    {prompt && (
                      <button type="button" onClick={() => setPrompt('')}
                        className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
                        clear
                      </button>
                    )}
                  </div>
                </div>
                <Input.TextArea value={prompt} onChange={e => setPrompt(e.target.value)}
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  placeholder={
                    kind === 'music' ? 'e.g. "upbeat synthwave with driving bass and warm pads"'
                    : kind === 'sfx' ? 'e.g. "thunderclap echoing in a cathedral, low rumble fade-out"'
                    : 'Hi, this is what I want you to say in this voice.'
                  }
                  maxLength={2000} showCount
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">
                  Duration · <span className="text-amber-300 font-mono">{duration}s</span>
                </label>
                <Slider min={kind === 'tts' ? 1 : 3} max={kind === 'sfx' ? 47 : kind === 'music' ? 30 : 20}
                  value={duration} onChange={setDuration} />
              </div>

              {kind === 'tts' && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Voice</label>
                  <Select className="w-full" value={voice} onChange={setVoice}
                    showSearch allowClear
                    placeholder="Search voice…"
                    filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                    options={BARK_VOICES} />
                </div>
              )}
            </>
          )}
        </section>

        {/* Output — hidden for fast-tts and lipsync (those embed their
            own player / iframe and don't go through the audio queue). */}
        {!['fast-tts', 'lipsync'].includes(kind) && (
        <section className="luxe-card p-4 mb-6">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Output</p>
          {/* Stem-separation result — 4 audio players + optional lyrics */}
          {kind === 'separate' && sepResult ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                {[
                  { key: 'vocals', label: 'Vocals', tint: 'border-amber-500/40 bg-amber-500/5' },
                  { key: 'drums',  label: 'Drums',  tint: 'border-amber-500/40 bg-amber-500/5' },
                  { key: 'bass',   label: 'Bass',   tint: 'border-emerald-500/40 bg-emerald-500/5' },
                  { key: 'other',  label: 'Other',  tint: 'border-cyan-500/40 bg-cyan-500/5' },
                ].map(s => (
                  <div key={s.key} className={`rounded-lg border p-3 ${s.tint}`}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold text-gray-100">{s.label}</span>
                      {sepResult.stems?.[s.key] && (
                        <a href={sepResult.stems[s.key]} download
                          className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">
                          <DownloadOutlined /> Save
                        </a>
                      )}
                    </div>
                    {sepResult.stems?.[s.key] ? (
                      <audio src={sepResult.stems[s.key]} controls className="w-full" />
                    ) : (
                      <p className="text-[10px] text-gray-500">not produced</p>
                    )}
                  </div>
                ))}
              </div>
              {sepResult.stems?.lyrics ? (
                <details className="rounded-lg border border-gray-800 bg-black/40 p-3 mb-3">
                  <summary className="text-xs font-semibold text-amber-300 cursor-pointer inline-flex items-center gap-1.5">
                    <EditOutlined /> Lyrics (Whisper on vocals stem)
                  </summary>
                  <p className="mt-2 text-sm text-gray-100 leading-relaxed whitespace-pre-wrap">
                    {sepResult.stems.lyrics}
                  </p>
                </details>
              ) : sepWithLyrics ? (
                <p className="text-[10px] text-gray-500 mb-3">Lyrics transcription was requested but came back empty.</p>
              ) : null}
              <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 font-mono">
                <span>{sepResult.model}{sepResult.elapsedMs ? ` · ${(sepResult.elapsedMs/1000).toFixed(1)}s` : ''}</span>
                <span>{job?.jobId}</span>
              </div>
            </>
          ) :
          /* STT result — synchronous, no job row */
          kind === 'stt' && sttResult ? (
            <>
              <div className="rounded-lg bg-black/40 border border-gray-800 p-3 mb-3 max-h-72 overflow-y-auto">
                <p className="text-sm text-gray-100 leading-relaxed whitespace-pre-wrap">{sttResult.text || '(empty)'}</p>
              </div>
              {Array.isArray(sttResult.chunks) && sttResult.chunks.length > 0 && (
                <details className="mb-3">
                  <summary className="text-[10px] uppercase tracking-wider text-gray-500 cursor-pointer hover:text-gray-300">
                    Timestamps · {sttResult.chunks.length} segments
                  </summary>
                  <ul className="mt-2 space-y-0.5 max-h-40 overflow-y-auto bg-black/30 rounded p-2">
                    {sttResult.chunks.map((c, i) => (
                      <li key={i} className="text-[10px] font-mono text-gray-400">
                        <span className="text-amber-300">[{(c.timestamp?.[0] ?? 0).toFixed(1)}s → {(c.timestamp?.[1] ?? 0).toFixed(1)}s]</span> {c.text}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] text-gray-500 font-mono">
                  {sttResult.model} · {sttResult.elapsedMs}ms
                </span>
                <button onClick={copyTranscript}
                  className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40">
                  <CopyOutlined /> Copy transcript
                </button>
              </div>
            </>
          ) : job?.outputUrl ? (
            <>
              <audio src={job.outputUrl} controls className="w-full" />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-gray-500 font-mono">{job.jobId}</span>
                <a href={job.outputUrl} download
                  className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40">
                  <DownloadOutlined /> Download
                </a>
              </div>
              {/* Voice-clone analysis card — only renders when the row
                  carries an `analysis` JSON (i.e. voice-clone / voice-sing
                  kinds; music/sfx/tts/stt rows don't have it). */}
              {(job.kind === 'voice-clone' || job.kind === 'voice-sing') && job.analysis && (
                <VoiceCloneAnalysis
                  analysis={job.analysis}
                  referenceUrl={job.sourceUrl}
                  outputUrl={job.outputUrl}
                />
              )}
            </>
          ) : working ? (
            <div className="py-6 flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
              <p className="text-amber-300 text-sm font-semibold">{job?.status === 'processing' ? 'Generating audio…' : 'Queued'}</p>
              {Array.isArray(job?.logs) && job.logs.length > 0 && (
                <ul className="mt-3 w-full max-h-40 overflow-y-auto bg-black/40 rounded-lg p-2 space-y-0.5">
                  {job.logs.slice(-10).map((l, i) => (
                    <li key={i} className="text-[10px] font-mono text-amber-200/80 break-all">{l.msg}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : error ? (
            <Alert
              type="error"
              showIcon
              message="Generation failed"
              description={error}
              action={
                <button onClick={generate}
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/12 text-amber-300 hover:bg-amber-500/20 inline-flex items-center gap-1">
                  <ReloadOutlined /> Retry
                </button>
              }
            />
          ) : (
            <p className="text-xs text-gray-600 text-center py-8">Output will appear here</p>
          )}
        </section>
        )}

        {!['fast-tts', 'lipsync'].includes(kind) && (
        <div className="flex justify-end">
          {(() => {
            const audioRequired = kind === 'stt' || kind === 'separate'
            const isVoiceClone = kind === 'voice-clone' || kind === 'voice-sing'
            const disabled = working
              || (audioRequired ? !sttDataUrl
                  : isVoiceClone ? (!vcRefDataUrl || !prompt.trim() || !vcConsent)
                  : !prompt.trim())
            const label = working
              ? 'Working…'
              : kind === 'stt'
                ? 'Transcribe'
                : kind === 'separate'
                  ? 'Split stems'
                  : kind === 'voice-clone'
                    ? 'Clone voice'
                    : kind === 'voice-sing'
                      ? 'Generate singing'
                      : `Generate ${kindObj?.label.toLowerCase().trim() || 'audio'}`
            return (
              <button onClick={generate} disabled={disabled}
                className={`luxe-btn luxe-btn-primary ${
                  disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}>
                <ThunderboltOutlined />
                {label}
              </button>
            )
          })()}
        </div>
        )}

        <StudioLibrary
          refreshKey={libraryRefresh}
          title="Your Audio"
          listFn={({ status, page, limit }) => listAudioJobs({ status, page, limit })}
          bulkFn={audioBulkAction}
          getId={(it) => it.jobId}
          bulkAccent="amber"
          renderCard={(it, { selectMode, checked, onToggleSelect, onDelete }) => (
            <AudioCard key={it.jobId} item={it}
              selectMode={selectMode} checked={checked}
              onToggleSelect={onToggleSelect} onDelete={onDelete} />
          )}
        />
      </div>

      <PromptHelper
        open={helperOpen} onClose={() => setHelperOpen(false)}
        family={kind} currentPrompt={prompt}
        idea={coachIdea} setIdea={setCoachIdea}
        coachResult={coachResult} setCoachResult={setCoachResult}
        coachError={coachError} setCoachError={setCoachError}
        onApply={(text) => { setPrompt(text); setHelperOpen(false) }}
        onAppend={(text) => setPrompt(prompt.trim() ? `${prompt.trim()}, ${text}` : text)}
      />
    </section>
  )
}

// Library card — audio is rendered as an inline player + metadata
function AudioCard({ item, selectMode, checked, onToggleSelect, onDelete }) {
  const handleClick = (e) => { if (selectMode) { e.preventDefault(); onToggleSelect?.() } }
  const kindIcon = item.kind === 'music' ? <CustomerServiceOutlined />
    : item.kind === 'sfx' ? <SoundOutlined />
    : item.kind === 'tts' ? <AudioOutlined />
    : item.kind === 'stt' ? <EditOutlined />
    : item.kind === 'separate' ? <ScissorOutlined />
    : item.kind === 'voice-clone' ? <AudioOutlined />
    : item.kind === 'voice-sing' ? <CustomerServiceOutlined />
    : <CustomerServiceOutlined />
  // Clicking a still-rendering card navigates to /audio/<jobId> for the
  // full live-log view; completed cards just play in-place (the embedded
  // <audio> controls handle that without a redirect).
  const isActive = item.status !== 'completed'
  // BE already JSON-parses stems for getAudioStatus, but the list endpoint
  // returns raw rows — `stems` is still a string. Inflate here.
  const stemsObj = item.stems
    ? (typeof item.stems === 'string' ? (() => { try { return JSON.parse(item.stems) } catch { return null } })() : item.stems)
    : null
  return (
    <div className={`luxe-card-hover group relative rounded-lg overflow-hidden border transition-colors bg-gray-900/40 p-3 ${
      checked
        ? 'border-amber-400 ring-2 ring-amber-400/40'
        : 'border-gray-800 hover:border-amber-400/50'
    }`} onClick={handleClick}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base text-amber-300">{kindIcon}</span>
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">{item.model}</span>
        <span className="text-[10px] text-gray-600 ml-auto">
          {item.kind === 'separate' && stemsObj ? `${Object.keys(stemsObj).filter(k => k !== 'lyrics').length} stems`
           : item.kind === 'stt' && item.transcript ? `${item.transcript.length} ch`
           : item.duration ? `${item.duration}s`
           : ''}
        </span>
      </div>
      {/* Stem-split completed cards: 4 colour-coded mini players inline */}
      {item.kind === 'separate' && stemsObj ? (
        <div className="grid grid-cols-2 gap-1.5" onClick={e => e.stopPropagation()}>
          {[
            { key: 'vocals', tint: 'border-amber-500/40' },
            { key: 'drums',  tint: 'border-amber-500/40' },
            { key: 'bass',   tint: 'border-emerald-500/40' },
            { key: 'other',  tint: 'border-cyan-500/40' },
          ].map(s => stemsObj[s.key] ? (
            <div key={s.key} className={`rounded-md border ${s.tint} p-1 bg-black/30`}>
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-[9px] uppercase text-gray-500 font-semibold">{s.key}</span>
              </div>
              <audio src={stemsObj[s.key]} controls className="w-full h-6" preload="none"
                style={{ height: '24px' }} />
            </div>
          ) : null)}
        </div>
      ) :
      /* STT completed cards: show the transcript snippet inline */
      item.kind === 'stt' && item.transcript ? (
        <div className="rounded-md border border-gray-800 bg-black/40 p-2 text-[11px] text-gray-200 leading-snug line-clamp-3"
          onClick={e => e.stopPropagation()}>
          {item.transcript}
        </div>
      ) :
      item.outputUrl ? (
        <audio src={item.outputUrl} controls className="w-full" onClick={e => e.stopPropagation()} />
      ) : isActive ? (
        <Link to={`/audio/${encodeURIComponent(item.jobId)}`}
          onClick={(e) => e.stopPropagation()}
          className="h-10 flex flex-col items-center justify-center bg-gray-950 rounded hover:bg-gray-900 transition-colors">
          <span className="text-xs text-amber-300 font-semibold inline-flex items-center gap-1.5">
            {item.status === 'processing' ? <><ThunderboltOutlined /> Watch live logs</> : 'Open detail'}
          </span>
        </Link>
      ) : (
        <div className="h-10 flex items-center justify-center bg-gray-950 rounded">
          <span className="text-xs uppercase tracking-wider text-gray-500 font-mono">failed</span>
        </div>
      )}
      {/* Lyrics teaser line on stem-split cards */}
      {item.kind === 'separate' && stemsObj?.lyrics && (
        <p className="text-[10px] text-amber-300/70 mt-2 line-clamp-2 leading-snug italic">
          <EditOutlined /> {stemsObj.lyrics.slice(0, 100)}{stemsObj.lyrics.length > 100 ? '…' : ''}
        </p>
      )}
      {!(item.kind === 'separate' || item.kind === 'stt') && (
        <p className="text-[10px] text-gray-500 mt-2 line-clamp-2 leading-snug">{item.prompt}</p>
      )}
      {selectMode && <SelectCheckbox checked={checked} onToggle={onToggleSelect} />}
      {item.status !== 'completed' && (
        <div className={`pointer-events-none absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
          item.status === 'failed' ? 'bg-rose-500/80 text-white'
          : item.status === 'processing' ? 'bg-cyan-500/80 text-white'
          : 'bg-amber-500/80 text-black'
        }`}>{item.status}</div>
      )}
      {!selectMode && onDelete && (
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete() }}
          title="Delete"
          className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-lg bg-black/70 hover:bg-rose-600 text-gray-200 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
          <DeleteOutlined className="text-xs" />
        </button>
      )}
    </div>
  )
}

// Flat audio-kind picker card.
function KindCard({ kind: k, active, onSelect }) {
  return (
    <button type="button" onClick={onSelect}
      className={`relative p-3 rounded-lg text-left border-2 transition-colors overflow-hidden group ${
        active
          ? 'border-amber-400/70 bg-amber-500/10'
          : 'border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:bg-gray-900'
      }`}>
      {active && (
        <span aria-hidden className="absolute -top-2 -right-2 w-6 h-6 rounded-lg bg-amber-500 flex items-center justify-center text-black z-10">
          <CheckOutlined className="text-[10px] font-bold" />
        </span>
      )}
      <div className="relative">
        <p className={`text-sm font-bold inline-flex items-center gap-2 ${active ? 'text-white' : 'text-gray-200'}`}>
          {k.icon}{k.label}
        </p>
        <p className={`text-[10px] mt-0.5 leading-snug ${active ? 'text-gray-300' : 'text-gray-500'}`}>{k.blurb}</p>
      </div>
    </button>
  )
}
