import { useState, useEffect, useRef, useCallback } from 'react'
import { analyzeFace, checkFaceHealth } from '../api/face'

const MOOD_EMOJI = { happy: '😄', sad: '😢', angry: '😠', surprised: '😲', sleepy: '😴', neutral: '😐' }
const MOOD_COLORS = {
  happy: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40', hex: '#facc15' },
  sad: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/40', hex: '#60a5fa' },
  angry: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40', hex: '#f87171' },
  surprised: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/40', hex: '#c084fc' },
  sleepy: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/40', hex: '#818cf8' },
  neutral: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/40', hex: '#9ca3af' },
}

const LANDMARK_COLORS = {
  jaw: '#4fc3f7', eyebrow: '#ff9800', nose: '#b388ff', eye: '#4caf50', lip: '#e91e8c',
}

function getLandmarkColor(i) {
  if (i <= 16) return LANDMARK_COLORS.jaw
  if (i <= 26) return LANDMARK_COLORS.eyebrow
  if (i <= 35) return LANDMARK_COLORS.nose
  if (i <= 47) return LANDMARK_COLORS.eye
  return LANDMARK_COLORS.lip
}

const FaceDetection = () => {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)
  const pendingRef = useRef(false)
  const bounceRef = useRef(0)

  const [serviceOnline, setServiceOnline] = useState(null)
  const [faceData, setFaceData] = useState(null)
  const [noFace, setNoFace] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [fps, setFps] = useState(0)
  const [processMs, setProcessMs] = useState(0)
  const [moodHistory, setMoodHistory] = useState([])
  const [showLandmarks, setShowLandmarks] = useState(true)
  const [showBox, setShowBox] = useState(true)
  const [videoDims, setVideoDims] = useState({ w: 0, h: 0 })

  const fpsCounter = useRef({ frames: 0, lastTime: Date.now() })

  // Check health
  useEffect(() => {
    checkFaceHealth().then(setServiceOnline)
  }, [])

  // Auto-start camera
  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } }, audio: false
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (err) {
        setCameraError(err.message || 'Camera access denied')
      }
    }
    start()
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  const handleVideoReady = useCallback(() => {
    const v = videoRef.current
    if (v) setVideoDims({ w: v.videoWidth, h: v.videoHeight })
  }, [])

  // Continuous detection loop (every 150ms = ~6-7 FPS max)
  useEffect(() => {
    if (isPaused || !serviceOnline) return

    intervalRef.current = setInterval(() => {
      if (pendingRef.current) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) return

      const vw = video.videoWidth
      const vh = video.videoHeight
      if (!vw || !vh) return

      // Downscale for faster processing
      const scale = Math.min(1, 320 / Math.max(vw, vh))
      canvas.width = Math.round(vw * scale)
      canvas.height = Math.round(vh * scale)
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      const base64 = canvas.toDataURL('image/jpeg', 0.5)

      pendingRef.current = true
      const t0 = performance.now()

      analyzeFace(base64)
        .then(({ data }) => {
          setProcessMs(Math.round(performance.now() - t0))
          fpsCounter.current.frames++
          const now = Date.now()
          if (now - fpsCounter.current.lastTime >= 1000) {
            setFps(fpsCounter.current.frames)
            fpsCounter.current = { frames: 0, lastTime: now }
          }

          if (data?.faces?.length > 0) {
            setFaceData(data)
            setNoFace(false)
            const mood = data.faces[0].mood
            if (mood) setMoodHistory(prev => [...prev, { mood, confidence: data.faces[0].moodConfidence || 0 }].slice(-20))
          } else {
            setFaceData(data)
            setNoFace(true)
          }
        })
        .catch(() => setNoFace(true))
        .finally(() => { pendingRef.current = false })
    }, 150)

    return () => clearInterval(intervalRef.current)
  }, [isPaused, serviceOnline])

  // Landmark group indices for connected lines (like Amrita)
  const LANDMARK_LINES = {
    jaw: Array.from({ length: 17 }, (_, i) => i),
    leftEyebrow: [17, 18, 19, 20, 21],
    rightEyebrow: [22, 23, 24, 25, 26],
    noseBridge: [27, 28, 29, 30],
    noseBottom: [31, 32, 33, 34, 35],
    leftEye: [36, 37, 38, 39, 40, 41, 36],
    rightEye: [42, 43, 44, 45, 46, 47, 42],
    outerLips: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 48],
    innerLips: [60, 61, 62, 63, 64, 65, 66, 67, 60],
  }

  // Draw overlay
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    const w = overlay.width
    const h = overlay.height
    ctx.clearRect(0, 0, w, h)

    if (!faceData?.faces?.length) return
    // Use the actual image size returned by the backend (downscaled coords)
    const imgW = faceData.imageSize?.width || 320
    const imgH = faceData.imageSize?.height || 240
    const scaleX = w / imgW
    const scaleY = h / imgH
    const mirrorX = (x) => w - x * scaleX
    const mapY = (y) => y * scaleY

    faceData.faces.forEach(face => {
      const bb = face.boundingBox

      // Bounding box with corner brackets
      if (showBox && bb) {
        const bx = mirrorX(bb.x + bb.width)
        const by = mapY(bb.y)
        const bw = bb.width * scaleX
        const bh = bb.height * scaleY
        const corner = 14

        ctx.strokeStyle = '#22d3ee'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.strokeRect(bx, by, bw, bh)
        ctx.setLineDash([])

        // Corner accents
        ctx.lineWidth = 3
        ctx.beginPath(); ctx.moveTo(bx, by + corner); ctx.lineTo(bx, by); ctx.lineTo(bx + corner, by); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(bx + bw - corner, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + corner); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(bx, by + bh - corner); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + corner, by + bh); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(bx + bw - corner, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + bh - corner); ctx.stroke()

        // Confidence label
        if (face.confidence) {
          ctx.font = 'bold 11px monospace'
          ctx.fillStyle = '#22d3ee'
          ctx.textAlign = 'left'
          ctx.fillText(`${Math.round(face.confidence * 100)}%`, bx + 4, by + bh + 14)
        }
      }

      const pts = face.landmarks?.points
      if (showLandmarks && pts?.length === 68) {
        const mapped = pts.map(p => {
          const px = Array.isArray(p) ? p[0] : p.x
          const py = Array.isArray(p) ? p[1] : p.y
          return [mirrorX(px), mapY(py)]
        })

        // Connected lines per group
        Object.entries(LANDMARK_LINES).forEach(([group, indices]) => {
          ctx.beginPath()
          ctx.strokeStyle = getLandmarkColor(indices[0]) + 'aa'
          ctx.lineWidth = 1.5
          indices.forEach((idx, i) => {
            const [px, py] = mapped[idx]
            if (i === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          })
          ctx.stroke()
        })

        // Dots
        mapped.forEach(([px, py], idx) => {
          ctx.beginPath()
          ctx.arc(px, py, 2, 0, Math.PI * 2)
          ctx.fillStyle = getLandmarkColor(idx)
          ctx.fill()
        })
      }

      // Mood emoji + label floating above face
      const mood = face.mood
      if (mood && bb) {
        bounceRef.current = (bounceRef.current + 1) % 60
        const bounceY = Math.sin((bounceRef.current / 60) * Math.PI * 2) * 5
        const cx = mirrorX(bb.x + bb.width / 2)
        const cy = mapY(bb.y) - 20 + bounceY

        // Emoji
        ctx.font = '32px serif'
        ctx.textAlign = 'center'
        ctx.fillText(MOOD_EMOJI[mood] || '😐', cx, cy)

        // Mood text below emoji
        ctx.font = 'bold 12px system-ui'
        ctx.fillStyle = MOOD_COLORS[mood]?.hex || '#9ca3af'
        ctx.fillText(mood.toUpperCase(), cx, cy + 18)
      }

      // Smile indicator on the face itself
      if (face.features?.smiling && bb) {
        const cx = mirrorX(bb.x + bb.width / 2)
        const cy = mapY(bb.y + bb.height) + 8
        ctx.font = '10px system-ui'
        ctx.fillStyle = '#4ade80'
        ctx.textAlign = 'center'
        ctx.fillText('SMILING', cx, cy)
      }
    })
  }, [faceData, showLandmarks, showBox])

  // Resize overlay to match video container
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const container = overlay.parentElement
    if (!container || typeof ResizeObserver === 'undefined') return
    const sync = () => { const r = container.getBoundingClientRect(); overlay.width = r.width; overlay.height = r.height }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(container)
    return () => ro.disconnect()
  }, [videoDims])

  const face = faceData?.faces?.[0]
  const moodColor = MOOD_COLORS[face?.mood] || MOOD_COLORS.neutral

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-6 pt-32 pb-24">
        {/* Header */}
        <h1 className="font-poppins font-black text-5xl md:text-6xl bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent leading-tight mb-2">
          Face Detection
        </h1>
        <p className="text-gray-400 text-sm max-w-xl mb-6">
          Real-time face analysis — 68-point landmarks, mood recognition, and feature extraction. Camera starts automatically.
        </p>

        {/* Status bar */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${serviceOnline === null ? 'bg-gray-600 animate-pulse' : serviceOnline ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-gray-500">{serviceOnline === null ? 'Checking...' : serviceOnline ? 'Online' : 'Offline'}</span>
          </div>
          {serviceOnline && !isPaused && (
            <>
              <div className="text-xs text-gray-600"><span className="text-cyan-400 font-mono">{fps}</span> FPS</div>
              <div className="text-xs text-gray-600"><span className="text-purple-400 font-mono">{processMs}</span>ms</div>
              <div className="text-xs text-gray-600"><span className="text-green-400 font-mono">{faceData?.faceCount || 0}</span> face{faceData?.faceCount !== 1 ? 's' : ''}</div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl overflow-hidden border border-gray-800 bg-black">
              {cameraError ? (
                <div className="aspect-video flex items-center justify-center text-red-400 text-sm p-6 text-center">{cameraError}</div>
              ) : (
                <div className="relative aspect-video">
                  <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={handleVideoReady}
                    className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                  <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
                  <canvas ref={canvasRef} className="hidden" />
                  {noFace && <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/60 rounded text-xs text-gray-400">No face detected</div>}
                </div>
              )}

              {/* Controls */}
              <div className="flex items-center gap-2 p-3 border-t border-gray-800">
                <button onClick={() => setIsPaused(p => !p)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${isPaused ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button onClick={() => setShowLandmarks(l => !l)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${showLandmarks ? 'bg-purple-600/30 text-purple-400' : 'bg-gray-800 text-gray-500'}`}>
                  Landmarks
                </button>
                <button onClick={() => setShowBox(b => !b)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${showBox ? 'bg-cyan-600/30 text-cyan-400' : 'bg-gray-800 text-gray-500'}`}>
                  Bounding Box
                </button>
              </div>
            </div>
          </div>

          {/* Results panel */}
          <div className="space-y-4">
            {/* Mood */}
            {face?.mood ? (
              <div className={`p-5 rounded-2xl border ${moodColor.border} ${moodColor.bg}`}>
                <div className="text-center">
                  <div className="text-5xl mb-2">{MOOD_EMOJI[face.mood]}</div>
                  <div className={`text-xl font-black capitalize ${moodColor.text}`}>{face.mood}</div>
                  {face.moodConfidence != null && <div className="text-xs text-gray-500 mt-1">{Math.round(face.moodConfidence * 100)}%</div>}
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-2xl border border-gray-800 bg-gray-900 text-center text-gray-600">
                <div className="text-4xl mb-2">👤</div>
                <div className="text-sm">Waiting for face...</div>
              </div>
            )}

            {/* Features */}
            {face?.features && (
              <div className="p-5 rounded-2xl border border-gray-800 bg-gray-900 space-y-3">
                <h3 className="text-white font-bold text-sm">Features</h3>
                {[
                  { label: 'Left Eye', value: face.features.leftEyeOpen, max: 0.4 },
                  { label: 'Right Eye', value: face.features.rightEyeOpen, max: 0.4 },
                  { label: 'Mouth', value: face.features.mouthOpen, max: 0.6 },
                ].map(f => (
                  <div key={f.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">{f.label}</span>
                      <span className="text-cyan-400 font-mono">{(f.value * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (f.value / f.max) * 100)}%` }} />
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-gray-800">
                  <span className="text-xs text-gray-500">Smiling</span>
                  <span className={`text-xs font-bold ${face.features.smiling ? 'text-green-400' : 'text-gray-600'}`}>{face.features.smiling ? 'Yes' : 'No'}</span>
                </div>
              </div>
            )}

            {/* Head tilt */}
            {face?.faceAngle != null && (
              <div className="p-4 rounded-2xl border border-gray-800 bg-gray-900 flex items-center gap-4">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 border-2 border-gray-700 rounded-full" />
                  <div className="absolute inset-1.5 border-2 border-cyan-500 rounded-full" style={{ transform: `rotate(${face.faceAngle}deg)` }}>
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-2 h-2 bg-cyan-400 rounded-full" />
                  </div>
                </div>
                <div>
                  <div className="text-white font-mono text-sm">{face.faceAngle.toFixed(1)}°</div>
                  <div className="text-gray-500 text-[10px]">{Math.abs(face.faceAngle) < 3 ? 'Straight' : face.faceAngle > 0 ? 'Tilted right' : 'Tilted left'}</div>
                </div>
              </div>
            )}

            {/* Mood history */}
            {moodHistory.length > 3 && (
              <div className="p-4 rounded-2xl border border-gray-800 bg-gray-900">
                <h3 className="text-gray-400 text-xs font-semibold mb-2">Mood History</h3>
                <div className="flex gap-0.5 items-end h-8">
                  {moodHistory.map((m, i) => (
                    <div key={i} className="flex-1 rounded-sm transition-all duration-200"
                      style={{ height: `${Math.max(20, m.confidence * 100)}%`, backgroundColor: MOOD_COLORS[m.mood]?.hex || '#666' }}
                      title={`${m.mood} (${Math.round(m.confidence * 100)}%)`} />
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-gray-600">oldest</span>
                  <span className="text-[9px] text-gray-600">now</span>
                </div>
              </div>
            )}

            {/* Landmarks count */}
            {face?.landmarks && (
              <div className="p-3 rounded-2xl border border-gray-800 bg-gray-900 flex justify-between items-center">
                <span className="text-gray-400 text-xs">Landmarks</span>
                <span className="text-purple-400 font-bold text-sm">{face.landmarks.points?.length || 0} pts</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default FaceDetection
