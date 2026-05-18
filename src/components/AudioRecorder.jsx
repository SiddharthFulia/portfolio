import { useState, useRef, useEffect } from 'react'
import { AudioOutlined, StopOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { message as antMessage } from 'antd'

// Reusable mic recorder for STT / Lip Sync / AI Chat. Uses the browser
// MediaRecorder API — no native deps, works on all evergreen browsers.
//
// Props:
//   onComplete(dataUrl, blob)  — fires when the user clicks "Use this"
//   accentColor                 — Tailwind hex string for the record button glow
//   maxSeconds                  — auto-stops after this many seconds (default 60)
//   compact                     — if true, renders inline (single row); else block layout
//
// Why a custom component instead of a library: the MediaRecorder browser
// API is one screenful of code, and we avoid the bundle size + maintenance
// surface of bringing in something like react-audio-voice-recorder.
export default function AudioRecorder({
  onComplete, accentColor = '#a855f7', maxSeconds = 60, compact = false,
}) {
  const [state, setState] = useState('idle') // idle | recording | preview
  const [elapsed, setElapsed] = useState(0)
  const [dataUrl, setDataUrl] = useState('')
  const [blob, setBlob] = useState(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(0)
  const tickRef = useRef(null)
  const streamRef = useRef(null)

  // Stop any open stream when this component unmounts mid-record (route
  // change, parent unmounting, etc.) — otherwise the mic-active indicator
  // in the browser stays on indefinitely.
  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch {}
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      // Prefer audio/webm with opus codec where available — universally
      // decodable by Whisper and tiny on the wire. Fall back to whatever
      // the browser will give us.
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : ''
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        const reader = new FileReader()
        reader.onloadend = () => {
          setDataUrl(reader.result)
          setBlob(finalBlob)
          setState('preview')
        }
        reader.readAsDataURL(finalBlob)
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      recorderRef.current = mr
      mr.start(100)   // 100ms chunks so flush-on-stop is snappy
      startedAtRef.current = Date.now()
      setElapsed(0); setState('recording')
      tickRef.current = setInterval(() => {
        const e = Math.floor((Date.now() - startedAtRef.current) / 1000)
        setElapsed(e)
        // Auto-stop at maxSeconds so a forgotten recording doesn't grow
        // forever in memory.
        if (e >= maxSeconds) stop()
      }, 250)
    } catch (e) {
      antMessage.error(`Could not access mic: ${e.message}`)
    }
  }

  const stop = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch {}
    }
  }

  const reset = () => {
    setDataUrl(''); setBlob(null); setState('idle'); setElapsed(0)
  }

  const accept = () => {
    if (!dataUrl || !blob) return
    onComplete?.(dataUrl, blob)
    reset()
  }

  if (state === 'recording') {
    return (
      <div className={`flex items-center gap-3 ${compact ? '' : 'p-3 rounded-xl bg-rose-500/10 border border-rose-500/30'}`}>
        <button onClick={stop}
          className="relative w-10 h-10 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center text-white shadow-lg shadow-rose-500/40 transition-colors">
          <StopOutlined className="text-base" />
          <span className="absolute inset-0 rounded-full border-2 border-rose-400/70 animate-ping" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-rose-200 font-semibold uppercase tracking-wider">Recording…</div>
          <div className="text-[10px] text-rose-300/80 font-mono">{elapsed}s / {maxSeconds}s max</div>
        </div>
      </div>
    )
  }

  if (state === 'preview' && dataUrl) {
    return (
      <div className={`flex flex-col gap-2 ${compact ? '' : 'p-3 rounded-xl bg-gray-900/40 border border-gray-800'}`}>
        <audio src={dataUrl} controls className="w-full" />
        <div className="flex items-center gap-2">
          <button onClick={accept}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 transition-colors">
            <CheckOutlined /> Use this
          </button>
          <button onClick={reset}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors">
            <CloseOutlined /> Re-record
          </button>
        </div>
      </div>
    )
  }

  // idle
  return (
    <button onClick={start}
      className={`flex items-center justify-center gap-2 ${compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} font-semibold rounded-lg border border-gray-700 hover:border-gray-500 bg-gray-900/60 hover:bg-gray-900 text-gray-200 transition-colors`}
      style={{ boxShadow: `0 0 0 0 ${accentColor}` }}>
      <AudioOutlined style={{ color: accentColor }} />
      Record audio
    </button>
  )
}
