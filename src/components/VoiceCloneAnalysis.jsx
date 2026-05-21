// VoiceCloneAnalysis — renders the comparison card shipped with every
// XTTS voice-clone / voice-sing job. Reads the `analysis` JSON written by
// the worker on completion (stored in audio_jobs.analysis or
// deepfake_jobs.analysis as a TEXT column).
//
// Layout: stats grid (input ref vs cleaned vs output) + a small inline
// canvas waveform per audio if URLs are provided. Designed to feel like a
// "before/after" panel — clean, scannable, no static PNG dependencies.

import { useEffect, useRef } from 'react'

// Render a horizontal waveform from a remote audio URL. Decodes the audio
// in-browser via Web Audio API and reduces samples down to canvas width.
function Waveform({ url, accent = '#22d3ee', height = 56 }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    if (!url) return
    let cancelled = false
    let ctx
    ;(async () => {
      try {
        const res = await fetch(url, { mode: 'cors' })
        if (!res.ok) return
        const buf = await res.arrayBuffer()
        if (cancelled) return
        // Reuse a single OfflineAudioContext where possible — Safari
        // imposes a hard cap on the number of AudioContexts a page can
        // create. We use the standard AudioContext just for decodeAudioData.
        const AC = window.AudioContext || window.webkitAudioContext
        ctx = new AC()
        const audio = await ctx.decodeAudioData(buf)
        if (cancelled) return
        const data = audio.getChannelData(0)
        const canvas = canvasRef.current
        if (!canvas) return
        const dpr = window.devicePixelRatio || 1
        const w = canvas.clientWidth * dpr
        const h = height * dpr
        canvas.width = w; canvas.height = h
        const cctx = canvas.getContext('2d')
        cctx.clearRect(0, 0, w, h)
        // Downsample to one min/max pair per pixel column for a classic
        // "two-color" peak waveform.
        const samplesPerPx = Math.max(1, Math.floor(data.length / w))
        cctx.fillStyle = accent
        for (let x = 0; x < w; x++) {
          let min = 1, max = -1
          const start = x * samplesPerPx
          const end = Math.min(data.length, start + samplesPerPx)
          for (let i = start; i < end; i++) {
            const v = data[i]
            if (v < min) min = v
            if (v > max) max = v
          }
          const y1 = ((1 - max) * h) / 2
          const y2 = ((1 - min) * h) / 2
          cctx.fillRect(x, y1, 1, Math.max(1, y2 - y1))
        }
      } catch {
        // Silently ignore — CORS or decode fail is non-critical; we just
        // skip the waveform and the stats still render.
      } finally {
        try { ctx?.close?.() } catch {}
      }
    })()
    return () => { cancelled = true; try { ctx?.close?.() } catch {} }
  }, [url, accent, height])
  return <canvas ref={canvasRef} className="w-full block rounded-md bg-black/40" style={{ height }} />
}

// Small stat row used inside each column.
function Stat({ label, value, accent }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
      <span className={`text-xs font-mono ${accent || 'text-gray-200'}`}>{value}</span>
    </div>
  )
}

// Format helpers
const fmtSec = (s) => typeof s === 'number' ? `${s.toFixed(1)}s` : '—'
const fmtHz  = (n) => typeof n === 'number' ? `${(n / 1000).toFixed(1)} kHz` : '—'
const fmtDb  = (db) => typeof db === 'number' ? `${db.toFixed(1)} dB` : '—'

export default function VoiceCloneAnalysis({ analysis, referenceUrl, outputUrl }) {
  if (!analysis) return null
  // The worker writes a JSON string; the BE passes it through unchanged
  // so the row's `analysis` field is `string` at this point. Parse safely.
  let data = analysis
  if (typeof analysis === 'string') {
    try { data = JSON.parse(analysis) } catch { return null }
  }
  const ref = data.reference || {}
  const cleaned = data.reference_cleaned || null
  const out = data.output || {}
  const rate = data.words_per_sec
  const chunks = data.chunks
  const rvc = data.rvc

  return (
    <section className="mt-4 rounded-2xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/[0.06] via-rose-500/[0.04] to-amber-500/[0.06] p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <p className="text-xs uppercase tracking-wider text-fuchsia-300 font-semibold">
          📊 Voice clone analysis
        </p>
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          {data.language_used && (
            <span className="px-2 py-0.5 rounded-full border border-gray-700 bg-gray-900/60">
              lang · <span className="text-fuchsia-300">{data.language_used}</span>
            </span>
          )}
          {chunks > 1 && (
            <span className="px-2 py-0.5 rounded-full border border-gray-700 bg-gray-900/60">
              {chunks} chunks
            </span>
          )}
          {rvc === 'applied' && (
            <span className="px-2 py-0.5 rounded-full border border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-200">
              🎶 RVC singing
            </span>
          )}
          {rvc === 'skipped' && (
            <span className="px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-200">
              flat speech (no RVC)
            </span>
          )}
        </div>
      </div>

      {data.script_mismatch_warning && (
        <p className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 mb-3 leading-snug">
          ⚠ {data.script_mismatch_warning}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Reference original */}
        <div className="rounded-xl bg-black/30 border border-gray-800 p-3">
          <p className="text-[10px] uppercase tracking-wider text-cyan-300 mb-1.5 font-semibold">
            Reference (raw)
          </p>
          <Stat label="Duration"   value={fmtSec(ref.duration_s)}   accent="text-cyan-200" />
          <Stat label="Sample"     value={fmtHz(ref.sample_rate)} />
          <Stat label="Loudness"   value={fmtDb(ref.rms_db)} />
          <Stat label="Brightness" value={typeof ref.peak_freq_hz === 'number' ? `${ref.peak_freq_hz} Hz` : '—'} />
          {referenceUrl && (
            <div className="mt-2"><Waveform url={referenceUrl} accent="#67e8f9" /></div>
          )}
        </div>

        {/* Cleaned reference (if preprocessing succeeded) */}
        {cleaned ? (
          <div className="rounded-xl bg-black/30 border border-gray-800 p-3">
            <p className="text-[10px] uppercase tracking-wider text-emerald-300 mb-1.5 font-semibold">
              Reference (cleaned)
            </p>
            <Stat label="Duration"   value={fmtSec(cleaned.duration_s)} accent="text-emerald-200" />
            <Stat label="Sample"     value={fmtHz(cleaned.sample_rate)} />
            <Stat label="Loudness"   value={fmtDb(cleaned.rms_db)} />
            <Stat label="Brightness" value={typeof cleaned.peak_freq_hz === 'number' ? `${cleaned.peak_freq_hz} Hz` : '—'} />
            <p className="text-[9px] text-emerald-300/70 mt-1.5 leading-snug">
              ✓ trim · denoise · normalize before XTTS sees it
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-black/30 border border-gray-800 p-3 flex items-center justify-center min-h-[160px]">
            <p className="text-[10px] text-gray-500 text-center px-3 leading-snug">
              Preprocessing skipped<br/>
              <span className="text-gray-600">{data.preprocess?.preprocess_error?.slice(0, 80) || 'librosa unavailable on worker'}</span>
            </p>
          </div>
        )}

        {/* Output */}
        <div className="rounded-xl bg-black/30 border border-fuchsia-500/30 p-3">
          <p className="text-[10px] uppercase tracking-wider text-fuchsia-300 mb-1.5 font-semibold">
            Cloned output
          </p>
          <Stat label="Duration"   value={fmtSec(out.duration_s)} accent="text-fuchsia-200" />
          <Stat label="Sample"     value={fmtHz(out.sample_rate)} />
          <Stat label="Loudness"   value={fmtDb(out.rms_db)} />
          <Stat label="Brightness" value={typeof out.peak_freq_hz === 'number' ? `${out.peak_freq_hz} Hz` : '—'} />
          {typeof rate === 'number' && (
            <Stat label="Pace" value={`${rate} w/s`} accent="text-amber-300" />
          )}
          {outputUrl && (
            <div className="mt-2"><Waveform url={outputUrl} accent="#f0abfc" /></div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-gray-500 mt-3 leading-snug">
        {data.words ?? '—'} words · {data.chars ?? '—'} characters · synthesised on the 5090
      </p>
    </section>
  )
}
