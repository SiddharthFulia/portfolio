// Ported from meowmeowcatcam/app.js. MediaPipe tasks-vision from npm
// (Vite bundles it); WASM/models pulled from Google CDN at runtime.
import { useEffect, useRef, useState } from 'react'
import { HandLandmarker, FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const GESTURE_MEMES = {
  rockstar:            ['cat.jpg'],
  default:             ['pokercat.jpg'],
  oneFingerUp:         ['profcat.jpg', 'professorcat.jpg'],
  fist:                ['punchcat.jpg'],
  shhh:                ['shhcat.jpg'],
  twoFingersTogether:  ['uwucat.jpg', 'uwucatt.jpg', 'fingers together muehehe .jpg'],
  handCoverFace:       ['hand cover face .jpg'],
  crashOutCat:         ['crashout cat .jpg'],
  twoHandsOnHead:      ['two hands on head .jpg'],
  handStretchedOut:    ['hand stretched out, palm facing up .jpg'],
  sideEyeCat:          ['side eye cat.jpg'],
}
const memeUrl = (name) => `/gesture-memes/${encodeURIComponent(name)}`

const STABLE_FRAMES_REQUIRED = 5
const DEFAULT_FALLBACK_MS = 600
const FACE_STALE_MS = 1200
const SIDE_EYE_YAW_DEG = 15
const HAND_COVER_FACE_DIST_FACE_LOST = 1.3
const HAND_COVER_FACE_DIST_FACE_SEEN = 0.7

const vec = (a, b) => ({ x: b.x - a.x, y: b.y - a.y, z: (b.z || 0) - (a.z || 0) })
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0))
const angleDeg = (v1, v2) => {
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z
  const m1 = Math.hypot(v1.x, v1.y, v1.z)
  const m2 = Math.hypot(v2.x, v2.y, v2.z)
  if (m1 < 1e-9 || m2 < 1e-9) return 180
  return (Math.acos(Math.min(1, Math.max(-1, dot / (m1 * m2)))) * 180) / Math.PI
}
const fingerExtended = (lm, mcp, pip, tip) =>
  angleDeg(vec(lm[mcp], lm[pip]), vec(lm[pip], lm[tip])) < 45

const yawFromMatrix = (m) => {
  const r00 = m[0], r10 = m[4], r20 = m[8]
  const sy = Math.hypot(r00, r10)
  if (sy < 1e-6) return 0
  return (Math.atan2(-r20, sy) * 180) / Math.PI
}

const classifyHand = (lm) => {
  const handScale = dist(lm[0], lm[9]) || 1e-6
  const indexUp  = fingerExtended(lm, 5, 6, 8)
  const middleUp = fingerExtended(lm, 9, 10, 12)
  const ringUp   = fingerExtended(lm, 13, 14, 16)
  const pinkyUp  = fingerExtended(lm, 17, 18, 20)
  const thumbOut = dist(lm[4], lm[17]) / handScale > 1.05
  const curled = [indexUp, middleUp, ringUp, pinkyUp].filter(v => !v).length
  return { indexUp, middleUp, ringUp, pinkyUp, thumbOut, curled, handScale, indexTip: lm[8], palmCenter: lm[9] }
}

const isPointing = h => h.indexUp && !h.middleUp && !h.ringUp && !h.pinkyUp

export default function GestureMemes() {
  const videoRef = useRef(null)
  const [gesture, setGesture] = useState('default')
  const [yaw, setYaw] = useState(0)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)
  const [showHud, setShowHud] = useState(true)
  const stateRef = useRef({
    handLM: null, faceLM: null, lastVideoTime: -1,
    current: 'default', candidate: 'default', streak: 0,
    lastNonDefaultAt: performance.now(), lastFace: null, lastFaceSeen: false,
  })

  useEffect(() => { document.title = 'Gesture Memes · Sid' }, [])

  const start = async () => {
    setError(null)
    try {
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM)
      stateRef.current.handLM = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO', numHands: 2,
      })
      stateRef.current.faceLM = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true,
      })
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setRunning(true)
      requestAnimationFrame(loop)
    } catch (e) {
      setError(e.message || String(e))
    }
  }

  const stop = () => {
    setRunning(false)
    const v = videoRef.current
    if (v?.srcObject) v.srcObject.getTracks().forEach(t => t.stop())
  }

  useEffect(() => () => stop(), [])

  const updateFace = (r) => {
    const now = performance.now()
    const saw = !!(r.faceLandmarks && r.faceLandmarks.length)
    if (saw) {
      const f = r.faceLandmarks[0]
      const upper = f[13], lower = f[14], rc = f[234], lc = f[454]
      const mouthCenter = { x: (upper.x + lower.x) / 2, y: (upper.y + lower.y) / 2, z: ((upper.z || 0) + (lower.z || 0)) / 2 }
      const faceWidth = dist(rc, lc)
      let yawDeg = 0
      if (r.facialTransformationMatrixes?.length) yawDeg = yawFromMatrix(r.facialTransformationMatrixes[0].data)
      stateRef.current.lastFace = { mouthCenter, faceWidth, yawDeg, t: now }
      setYaw(yawDeg)
    }
    stateRef.current.lastFaceSeen = saw
  }

  const decide = (hr) => {
    const st = stateRef.current
    const now = performance.now()
    const faceIsFresh = !!st.lastFace && now - st.lastFace.t < FACE_STALE_MS
    if (!hr.landmarks || !hr.landmarks.length) {
      if (faceIsFresh && Math.abs(st.lastFace.yawDeg) > SIDE_EYE_YAW_DEG) return 'sideEyeCat'
      return 'default'
    }
    const hands = hr.landmarks.map(classifyHand)
    if (hands.length === 2) {
      if (isPointing(hands[0]) && isPointing(hands[1])) {
        const avg = (hands[0].handScale + hands[1].handScale) / 2
        if (dist(hands[0].indexTip, hands[1].indexTip) / avg < 1.4) return 'twoFingersTogether'
      }
      if (faceIsFresh) {
        const { mouthCenter, faceWidth } = st.lastFace
        const nearFace = hands.every(h => dist(h.palmCenter, mouthCenter) / faceWidth < 2.2)
        if (nearFace) {
          const headTopY = mouthCenter.y - faceWidth * 1.1
          return hands.every(h => h.palmCenter.y < headTopY) ? 'twoHandsOnHead' : 'crashOutCat'
        }
      }
    }
    const h = hands[0]
    if (h.curled === 4) return 'fist'
    if (h.thumbOut && h.pinkyUp && !h.indexUp && !h.middleUp && !h.ringUp) return 'rockstar'
    if (h.indexUp && !h.middleUp && !h.ringUp && !h.pinkyUp) {
      if (faceIsFresh) {
        const d = dist(h.indexTip, st.lastFace.mouthCenter) / st.lastFace.faceWidth
        if (d < 0.55) return 'shhh'
      }
      return 'oneFingerUp'
    }
    if (faceIsFresh) {
      const d = dist(h.palmCenter, st.lastFace.mouthCenter) / st.lastFace.faceWidth
      const thr = st.lastFaceSeen ? HAND_COVER_FACE_DIST_FACE_SEEN : HAND_COVER_FACE_DIST_FACE_LOST
      if (d < thr) return 'handCoverFace'
    }
    if (h.curled === 0) return 'handStretchedOut'
    if (faceIsFresh && Math.abs(st.lastFace.yawDeg) > SIDE_EYE_YAW_DEG) return 'sideEyeCat'
    return 'default'
  }

  const apply = (g) => {
    const st = stateRef.current
    if (g === st.current) return
    st.current = g
    setGesture(g)
  }

  const loop = () => {
    const st = stateRef.current
    const v = videoRef.current
    if (!v || !st.handLM) return
    const now = performance.now()
    if (v.currentTime !== st.lastVideoTime) {
      st.lastVideoTime = v.currentTime
      const ts = performance.now()
      const hr = st.handLM.detectForVideo(v, ts)
      const fr = st.faceLM.detectForVideo(v, ts)
      updateFace(fr)
      const g = decide(hr)
      if (g === st.candidate) st.streak++
      else { st.candidate = g; st.streak = 1 }
      if (st.streak >= STABLE_FRAMES_REQUIRED) apply(g)
      if (g !== 'default') st.lastNonDefaultAt = now
      if (now - st.lastNonDefaultAt > DEFAULT_FALLBACK_MS && st.current !== 'default') apply('default')
    }
    if (videoRef.current?.srcObject) requestAnimationFrame(loop)
  }

  const currentMeme = () => {
    const list = GESTURE_MEMES[gesture] || GESTURE_MEMES.default
    return memeUrl(list[Math.floor(Math.random() * list.length)])
  }

  return (
    <div className='min-h-screen bg-[var(--luxe-bg-base)] text-fg-primary pt-24 sm:pt-28 pb-16 px-3 sm:px-6'>
      <div className='max-w-6xl mx-auto'>
        <header className='mb-6'>
          <p className='eyebrow-mono mb-2 text-amber-300/80'>Hand Gesture · MediaPipe</p>
          <h1 className='text-3xl sm:text-4xl font-bold gradient-text-amber leading-tight'>Gesture Memes</h1>
          <p className='text-sm text-fg-muted mt-1 max-w-2xl'>
            Point your camera at yourself. Make one of 11 gestures below and the matching cat meme swaps in live.
            Runs 100% in your browser via MediaPipe tasks-vision — no server, no upload.
          </p>
        </header>

        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
          <div className='luxe-glass p-3 flex flex-col gap-3'>
            <div className='relative rounded-xl overflow-hidden bg-black aspect-[4/3]'>
              <video ref={videoRef} playsInline muted className='w-full h-full object-cover [transform:scaleX(-1)]' />
              {!running && (
                <div className='absolute inset-0 flex items-center justify-center bg-black/50'>
                  <button onClick={start} className='luxe-btn luxe-btn-primary'>Start camera</button>
                </div>
              )}
              {running && showHud && (
                <div className='absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-[11px] font-mono text-amber-200 leading-snug'>
                  gesture: {gesture}<br />
                  yaw: {yaw >= 0 ? '+' : ''}{yaw.toFixed(1)}°  (thr ±{SIDE_EYE_YAW_DEG})
                </div>
              )}
            </div>
            <div className='flex items-center justify-between text-xs'>
              <button onClick={() => setShowHud(s => !s)} className='luxe-btn luxe-btn-ghost text-xs'>
                {showHud ? 'Hide' : 'Show'} debug
              </button>
              {running && <button onClick={stop} className='luxe-btn luxe-btn-secondary text-xs'>Stop</button>}
            </div>
            {error && <p className='text-rose-400 text-xs font-mono'>{error}</p>}
          </div>

          <div className='luxe-glass p-3 flex items-center justify-center'>
            <img
              key={gesture}
              src={currentMeme()}
              alt={gesture}
              className='max-w-full max-h-[420px] object-contain rounded-xl'
            />
          </div>
        </div>

        <div className='mt-6 luxe-glass p-4'>
          <p className='eyebrow-mono mb-3 text-amber-300/80'>How to trigger each meme</p>
          <ul className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-xs'>
            <li><b className='text-amber-200'>Fist</b> — all four fingers curled</li>
            <li><b className='text-amber-200'>Rockstar</b> — thumb + pinky out, others curled</li>
            <li><b className='text-amber-200'>One finger up</b> — index only, held away from face</li>
            <li><b className='text-amber-200'>Shhh</b> — index only, tip near mouth</li>
            <li><b className='text-amber-200'>Two fingers together</b> — both index tips touching</li>
            <li><b className='text-amber-200'>Two hands on head</b> — both hands above head</li>
            <li><b className='text-amber-200'>Crash-out cat</b> — hands beside face, not above</li>
            <li><b className='text-amber-200'>Hand cover face</b> — palm where mouth just was</li>
            <li><b className='text-amber-200'>Hand stretched out</b> — open palm, all fingers extended</li>
            <li><b className='text-amber-200'>Side eye</b> — turn head to the side (yaw &gt; 15°)</li>
            <li><b className='text-amber-200'>Default</b> — nothing in particular</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
