import { useState, useEffect, useRef, useCallback } from 'react'
import { analyzeFace, checkFaceHealth } from '../../api/face'

const LANDMARK_GROUPS = {
  jaw: { indices: Array.from({ length: 17 }, (_, i) => i), color: '#4fc3f7' },
  leftEyebrow: { indices: [17, 18, 19, 20, 21], color: '#ff9800' },
  rightEyebrow: { indices: [22, 23, 24, 25, 26], color: '#ff9800' },
  noseBridge: { indices: [27, 28, 29, 30], color: '#b388ff' },
  noseBottom: { indices: [31, 32, 33, 34, 35], color: '#b388ff' },
  leftEye: { indices: [36, 37, 38, 39, 40, 41, 36], color: '#4caf50' },
  rightEye: { indices: [42, 43, 44, 45, 46, 47, 42], color: '#4caf50' },
  outerLips: { indices: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 48], color: '#e91e8c' },
  innerLips: { indices: [60, 61, 62, 63, 64, 65, 66, 67, 60], color: '#e91e8c' },
}

const MOOD_EMOJIS = { happy: '😊', sad: '😢', surprised: '😮', angry: '😠', neutral: '😐', sleepy: '😴' }
const MOOD_COLORS = { happy: '#4caf50', sad: '#42a5f5', surprised: '#ff9800', angry: '#f44336', neutral: '#9e9e9e', sleepy: '#7e57c2' }

function getLandmarkColor(i) {
  if (i <= 16) return '#4fc3f7'
  if (i <= 26) return '#ff9800'
  if (i <= 35) return '#b388ff'
  if (i <= 47) return '#4caf50'
  return '#e91e8c'
}

function GlassCard({ title, children, style = {} }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0d0d2bee, #1a1a3ecc)',
      borderRadius: 14, padding: 16,
      border: '1px solid #ffffff08',
      boxShadow: '0 4px 24px #00000040',
      ...style,
    }}>
      {title && <div style={{ fontSize: 11, fontWeight: 600, color: '#b388ff99', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{title}</div>}
      {children}
    </div>
  )
}

function FeatureBar({ label, value, color }) {
  const pct = Math.min(100, Math.max(0, Math.round((value <= 1 ? value * 100 : value))))
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: '#ccc' }}>{label}</span>
        <span style={{ color, fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: '#1a1a3e', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}66, ${color})`, borderRadius: 3, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  )
}

function ToggleBtn({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 8,
      border: `1px solid ${active ? '#e91e8c55' : '#ffffff15'}`,
      background: active ? 'linear-gradient(135deg, #e91e8c22, #b388ff15)' : '#0d0d2b',
      color: active ? '#e91e8c' : '#666', fontSize: 12, fontWeight: 500,
      cursor: 'pointer', transition: 'all 0.2s ease', outline: 'none',
    }}>{label}</button>
  )
}

const FaceAI = () => {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const pendingRef = useRef(false)
  const intervalRef = useRef(null)
  const streamRef = useRef(null)
  const bounceRef = useRef(0)

  const [serviceOnline, setServiceOnline] = useState(null)
  const [isPaused, setIsPaused] = useState(false)
  const [showLandmarks, setShowLandmarks] = useState(true)
  const [showBox, setShowBox] = useState(true)
  const [faceData, setFaceData] = useState(null)
  const [noFace, setNoFace] = useState(false)
  const [moodHistory, setMoodHistory] = useState([])
  const [fps, setFps] = useState(0)
  const [processMs, setProcessMs] = useState(0)
  const [cameraError, setCameraError] = useState(null)
  const [videoDims, setVideoDims] = useState({ w: 0, h: 0 })
  const fpsCounter = useRef({ frames: 0, lastTime: Date.now() })

  useEffect(() => { checkFaceHealth().then(v => setServiceOnline(!!v)) }, [])

  // Auto-start camera
  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 400 }, height: { ideal: 533 } }, audio: false })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (err) { setCameraError(err.message) }
    }
    start()
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  const handleVideoReady = useCallback(() => {
    const v = videoRef.current
    if (v) setVideoDims({ w: v.videoWidth, h: v.videoHeight })
  }, [])

  // Detection loop
  useEffect(() => {
    if (isPaused || !serviceOnline) return
    intervalRef.current = setInterval(() => {
      if (pendingRef.current) return
      const video = videoRef.current, canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) return
      const vw = video.videoWidth, vh = video.videoHeight
      if (!vw || !vh) return
      // Downscale for speed — send smaller image to backend
      const scale = Math.min(1, 320 / Math.max(vw, vh))
      canvas.width = Math.round(vw * scale)
      canvas.height = Math.round(vh * scale)
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      const base64 = canvas.toDataURL('image/jpeg', 0.5)
      pendingRef.current = true
      const t0 = performance.now()
      analyzeFace(base64).then(({ data: res }) => {
        setProcessMs(Math.round(performance.now() - t0))
        fpsCounter.current.frames++
        const now = Date.now()
        if (now - fpsCounter.current.lastTime >= 1000) {
          setFps(fpsCounter.current.frames)
          fpsCounter.current = { frames: 0, lastTime: now }
        }
        const d = res?.data || res
        if (d?.faces?.length > 0) {
          setFaceData(d); setNoFace(false)
          const mood = d.faces[0].mood
          if (mood) setMoodHistory(prev => [...prev, { mood, confidence: d.faces[0].moodConfidence || 0 }].slice(-10))
        } else { setFaceData(d); setNoFace(true) }
      }).catch(() => setNoFace(true)).finally(() => { pendingRef.current = false })
    }, 200)
    return () => clearInterval(intervalRef.current)
  }, [isPaused, serviceOnline])

  // Draw overlay
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    const w = overlay.width, h = overlay.height
    ctx.clearRect(0, 0, w, h)
    if (!faceData?.faces?.length) return
    // Use imageSize from backend (the actual dimensions it processed)
    const vw = faceData.imageSize?.width || videoRef.current?.videoWidth || 400
    const vh = faceData.imageSize?.height || videoRef.current?.videoHeight || 533
    const scaleX = w / vw, scaleY = h / vh
    const mirrorX = (x) => w - x * scaleX
    const mapY = (y) => y * scaleY

    faceData.faces.forEach(face => {
      const bb = face.boundingBox
      if (showBox && bb) {
        ctx.strokeStyle = '#e91e8c'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4])
        ctx.strokeRect(mirrorX(bb.x + bb.width), mapY(bb.y), bb.width * scaleX, bb.height * scaleY)
        ctx.setLineDash([])
      }
      const pts = face.landmarks?.points
      const groups = face.landmarks?.groups
      if (showLandmarks && pts?.length >= 68) {
        const mapped = pts.map(p => [mirrorX(p.x ?? p[0]), mapY(p.y ?? p[1])])

        // Draw 68-point connected lines
        Object.values(LANDMARK_GROUPS).forEach(group => {
          ctx.beginPath(); ctx.strokeStyle = group.color + 'bb'; ctx.lineWidth = 1.5
          group.indices.forEach((idx, i) => { const [px, py] = mapped[idx]; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py) })
          ctx.stroke()
        })

        // Draw detailed contour groups if available (lips, eyes)
        const drawContour = (groupPts, color, fill) => {
          if (!groupPts?.length) return
          const mp = groupPts.map(p => [mirrorX(p.x), mapY(p.y)])
          ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2
          mp.forEach(([px, py], i) => { i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py) })
          ctx.closePath(); ctx.stroke()
          if (fill) { ctx.fillStyle = fill; ctx.fill() }
        }

        if (groups) {
          drawContour(groups.outerLip, '#e91e8ccc', face.features?.smiling ? '#e91e8c22' : null)
          drawContour(groups.innerLip, '#e91e8c99', '#e91e8c11')
          drawContour(groups.leftEye, '#4caf50cc', '#4caf5015')
          drawContour(groups.rightEye, '#4caf50cc', '#4caf5015')
        }

        // Dots
        mapped.forEach(([px, py], idx) => { ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fillStyle = getLandmarkColor(idx); ctx.fill() })
      }
      const mood = typeof face.mood === 'string' ? face.mood : face.mood?.label
      if (mood && bb) {
        bounceRef.current = (bounceRef.current + 1) % 60
        const bY = Math.sin((bounceRef.current / 60) * Math.PI * 2) * 4
        ctx.font = '40px serif'; ctx.textAlign = 'center'
        ctx.fillText(MOOD_EMOJIS[mood] || '😐', mirrorX(bb.x + bb.width / 2), mapY(bb.y) - 20 + bY)
      }
    })
  }, [faceData, showLandmarks, showBox])

  // Resize overlay
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const container = overlay.parentElement
    if (!container || typeof ResizeObserver === 'undefined') return
    const sync = () => { const r = container.getBoundingClientRect(); overlay.width = r.width; overlay.height = r.height }
    sync()
    const ro = new ResizeObserver(sync); ro.observe(container)
    return () => ro.disconnect()
  }, [videoDims])

  const face = faceData?.faces?.[0]
  const confidence = Math.round((face?.confidence ?? 0) * 100)
  const moodLabel = typeof face?.mood === 'string' ? face.mood : face?.mood?.label || ''
  const moodConf = Math.round((face?.moodConfidence ?? 0) * 100)
  const features = face?.features
  const faceAngle = face?.faceAngle ?? 0
  const faceCount = faceData?.faceCount ?? 0
  const confColor = confidence > 90 ? '#4caf50' : confidence > 70 ? '#ffc107' : '#f44336'

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* Camera */}
      <div style={{ flex: '0 0 auto', width: '100%', maxWidth: 400 }}>
        <div style={{ position: 'relative', width: '100%', paddingBottom: '133.33%', borderRadius: 16, overflow: 'hidden', background: '#0d0d2b', border: '1px solid #e91e8c33', boxShadow: '0 0 40px #e91e8c15' }}>
          <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={handleVideoReady}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <canvas ref={overlayRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
          {noFace && serviceOnline && (
            <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: '#07071acc', padding: '8px 16px', borderRadius: 20, fontSize: 13, color: '#ffc107', whiteSpace: 'nowrap' }}>
              No face detected — look at the camera!
            </div>
          )}
          {cameraError && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', color: '#f44336', padding: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
              <div style={{ fontSize: 14 }}>{cameraError}</div>
            </div>
          )}
          {serviceOnline === false && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', padding: 24, width: '80%' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔧</div>
              <div style={{ fontSize: 15, color: '#e91e8c', marginBottom: 8, fontWeight: 600 }}>Face Service Offline</div>
              <div style={{ fontSize: 12, color: '#999' }}>Start the Python face service on the backend</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, justifyContent: 'center' }}>
          <ToggleBtn active={!isPaused} onClick={() => setIsPaused(p => !p)} label={isPaused ? 'Resume' : 'Pause'} />
          <ToggleBtn active={showLandmarks} onClick={() => setShowLandmarks(l => !l)} label="Landmarks" />
          <ToggleBtn active={showBox} onClick={() => setShowBox(b => !b)} label="Box" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#888', padding: '6px 10px', background: '#0d0d2b', borderRadius: 8, border: '1px solid #ffffff10' }}>
            <span style={{ color: '#b388ff', fontWeight: 600 }}>{fps}</span> FPS
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ flex: '1 1 280px', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <GlassCard title="Confidence">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: confColor, lineHeight: 1 }}>{confidence}%</span>
            <span style={{ fontSize: 12, color: '#888' }}>detection</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: '#1a1a3e', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${confidence}%`, background: `linear-gradient(90deg, ${confColor}88, ${confColor})`, borderRadius: 3, transition: 'width 0.3s ease' }} />
          </div>
        </GlassCard>

        <GlassCard title="Mood">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 36 }}>{moodLabel ? (MOOD_EMOJIS[moodLabel] || '😐') : '—'}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: moodLabel ? (MOOD_COLORS[moodLabel] || '#fff') : '#555', textTransform: 'capitalize' }}>{moodLabel || 'Unknown'}</div>
              <div style={{ fontSize: 12, color: '#888' }}>{moodLabel ? `${moodConf}% confident` : 'Waiting...'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }}>
            {moodHistory.length === 0 && <span style={{ fontSize: 11, color: '#555' }}>No mood history yet</span>}
            {moodHistory.map((m, i) => (
              <div key={i} title={`${m.mood} (${Math.round(m.confidence * 100)}%)`}
                style={{ flex: 1, height: `${Math.max(10, m.confidence * 100)}%`, background: MOOD_COLORS[m.mood] || '#666', borderRadius: '2px 2px 0 0', transition: 'height 0.3s ease', minWidth: 8, opacity: 0.5 + (i / moodHistory.length) * 0.5 }} />
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Last {moodHistory.length} readings</div>
        </GlassCard>

        <GlassCard title="Face Angle">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 50, height: 50, borderRadius: '50%', border: '2px solid #b388ff44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 22, height: 2, background: 'linear-gradient(90deg, #e91e8c, #b388ff)', borderRadius: 2, transform: `rotate(${faceAngle}deg)`, transition: 'transform 0.3s ease' }} />
            </div>
            <div>
              <span style={{ fontSize: 24, fontWeight: 700, color: '#b388ff' }}>{typeof faceAngle === 'number' ? faceAngle.toFixed(1) : '0.0'}°</span>
              <div style={{ fontSize: 11, color: '#888' }}>rotation</div>
            </div>
          </div>
        </GlassCard>

        <GlassCard title="Features">
          <FeatureBar label="Mouth Open" value={features?.mouthOpen ?? 0} color="#e91e8c" />
          <FeatureBar label="Left Eye" value={features?.leftEyeOpen ?? 0} color="#4caf50" />
          <FeatureBar label="Right Eye" value={features?.rightEyeOpen ?? 0} color="#4caf50" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: features?.smiling ? '#4caf50' : '#555', display: 'inline-block', boxShadow: features?.smiling ? '0 0 6px #4caf50' : 'none' }} />
            <span style={{ fontSize: 13, color: '#ccc' }}>Smiling</span>
            <span style={{ fontSize: 12, color: features?.smiling ? '#4caf50' : '#666', marginLeft: 'auto' }}>{features?.smiling ? 'Yes' : 'No'}</span>
          </div>
        </GlassCard>

        <div style={{ display: 'flex', gap: 12 }}>
          <GlassCard title="Face Count" style={{ flex: 1 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#e91e8c' }}>{faceCount}</span>
          </GlassCard>
          <GlassCard title="Processing" style={{ flex: 1 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#b388ff' }}>{processMs}</span>
            <span style={{ fontSize: 13, color: '#888', marginLeft: 4 }}>ms</span>
          </GlassCard>
        </div>
      </div>
    </div>
  )
}

export default FaceAI
