// Browser port of hammyhamster/main.py. MediaPipe tasks-vision (hand + face
// + pose) on webcam frames -> 15 gestures -> hamster meme swaps. Assets
// live under /public/gesture-hammy/.
import { useEffect, useRef, useState } from 'react'

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14'
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

const MEMES = {
  default:      'pokerham.jpg',
  thumbs_up:    'thumb.jpg',
  thumbs_down:  'thumbs down.jpg',
  side_eye:     'sideyee.jpg',
  fist_by_head: 'happylollypop.webp',
  two_hands:    '2 arms out .jpg',
  glasses:      'discord mod.jpg',
  bicep:        'bicep.jpg',
  cross_arms:   'cross arms .jpg',
  finger_mouth: 'one finger mouth .jpg',
  nerd:         'nerd.jpg',
  shy:          'cinamoroll ham.jpg',
  thinking:     'think .jpg',
  hug:          'plushie.jpg',
  sad:          'look down side .jpg',
}
const memeUrl = (g) => `/gesture-hammy/${encodeURIComponent(MEMES[g] || MEMES.default)}`

const STABLE_FRAMES_REQUIRED = 5

// Tuning knobs — mirror main.py.
const YAW_THRESHOLD_DEG = 18
const PITCH_THRESHOLD_DEG = 15
const GLASSES_NEAR_FACE_DIST = 0.28
const MOUTH_NEAR_DIST = 0.14
const ELBOW_BEND_MAX_DEG = 100
const POSE_VISIBILITY_MIN = 0.5
const HANDS_TOGETHER_DIST = 0.12
const HANDS_APART_MIN_DIST = 0.15
const THINKING_NEAR_MOUTH_DIST = 0.25
const SHY_NEAR_FACE_DIST = 0.30
const SHY_HEIGHT_TOLERANCE = 0.18
const HUG_BELOW_FACE_DIST = 0.20
const MOUTH_LANDMARK = 13

// BlazePose ids.
const LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12
const LEFT_ELBOW = 13, RIGHT_ELBOW = 14
const LEFT_WRIST = 15, RIGHT_WRIST = 16
const LEFT_HIP = 23, RIGHT_HIP = 24

// Non-thumb finger (tip, base) pairs, wrist-relative.
const FINGER_JOINTS = [[8, 5], [12, 9], [16, 13], [20, 17]]

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const centerOf = (lms) => {
  let x = 0, y = 0
  for (const p of lms) { x += p.x; y += p.y }
  return { x: x / lms.length, y: y / lms.length }
}
const vlen = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

const fingersUp = (lm) => {
  const wrist = lm[0]
  const pinkyBase = lm[17]
  const thumbExt = dist2(lm[4], pinkyBase) > dist2(lm[2], pinkyBase) * 1.1
  const out = [thumbExt ? 1 : 0]
  for (const [tip, base] of FINGER_JOINTS) {
    out.push(dist2(wrist, lm[tip]) > dist2(wrist, lm[base]) * 1.15 ? 1 : 0)
  }
  return out
}

const classifySingleHand = (f) => {
  const [thumb, index, middle, ring, pinky] = f
  const fourCurled = !(index || middle || ring || pinky)
  if (fourCurled) return thumb ? 'thumbs_up' : 'fist'
  if (index && middle && ring && pinky && thumb) return 'open_palm'
  if (index && !middle && !ring && !pinky) return 'pointer'
  return null
}

const thumbDyRatio = (lm) => {
  const scale = dist2(lm[0], lm[9])
  if (scale < 1e-6) return 0
  return (lm[4].y - lm[0].y) / scale
}
const thumbPointsDown = (lm) => thumbDyRatio(lm) > 0.35

const isPinch = (lm) => {
  const scale = dist2(lm[0], lm[9])
  if (scale < 1e-6) return false
  const ti = dist2(lm[4], lm[8])
  const tm = dist2(lm[4], lm[12])
  return ti < scale * 0.5 && ti < tm * 0.7
}

const poseVisible = (p) => (p?.visibility ?? 1) >= POSE_VISIBILITY_MIN

const elbowAngleDeg = (s, e, w) => {
  const v1x = s.x - e.x, v1y = s.y - e.y
  const v2x = w.x - e.x, v2y = w.y - e.y
  const n1 = Math.hypot(v1x, v1y), n2 = Math.hypot(v2x, v2y)
  if (n1 < 1e-6 || n2 < 1e-6) return null
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (n1 * n2)))
  return Math.acos(cos) * 180 / Math.PI
}

const bicepSignals = (pose) => {
  if (!pose) return null
  let best = null
  for (const [si, ei, wi] of [[LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST], [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST]]) {
    const s = pose[si], e = pose[ei], w = pose[wi]
    if (!(poseVisible(s) && poseVisible(e) && poseVisible(w))) continue
    const a = elbowAngleDeg(s, e, w)
    if (a === null) continue
    const wristAbove = s.y - w.y
    const elbowOut = Math.abs(e.x - s.x)
    if (best === null || a < best.angle) best = { angle: a, wristAbove, elbowOut }
  }
  return best
}

const detectBicep = (pose) => {
  const s = bicepSignals(pose)
  if (!s) return false
  return s.angle < ELBOW_BEND_MAX_DEG && s.wristAbove > 0.06 && s.elbowOut > 0.06
}

const detectCrossArms = (pose) => {
  if (!pose) return false
  const lw = pose[LEFT_WRIST], rw = pose[RIGHT_WRIST]
  const ls = pose[LEFT_SHOULDER], rs = pose[RIGHT_SHOULDER]
  if (!(poseVisible(lw) && poseVisible(rw) && poseVisible(ls) && poseVisible(rs))) return false
  const lh = pose[LEFT_HIP], rh = pose[RIGHT_HIP]
  const chestTop = Math.min(ls.y, rs.y)
  const chestBottom = (poseVisible(lh) && poseVisible(rh)) ? Math.max(lh.y, rh.y) : chestTop + 0.35
  const wristsClose = dist2(lw, rw) < 0.18
  const avgY = (lw.y + rw.y) / 2
  return wristsClose && chestTop < avgY && avgY < chestBottom
}

const twoHandCenters = (handsLms) => {
  if (handsLms.length !== 2) return null
  return [centerOf(handsLms[0]), centerOf(handsLms[1])]
}

const detectShy = (handsLms, headCenter) => {
  const c = twoHandCenters(handsLms)
  if (!c || !headCenter) return false
  if (vlen(c[0], c[1]) <= HANDS_APART_MIN_DIST) return false
  return c.every(p =>
    vlen(p, headCenter) < SHY_NEAR_FACE_DIST &&
    Math.abs(p.y - headCenter.y) < SHY_HEIGHT_TOLERANCE
  )
}

const detectThinking = (handsLms, mouth) => {
  const c = twoHandCenters(handsLms)
  if (!c || !mouth) return false
  if (vlen(c[0], c[1]) >= HANDS_TOGETHER_DIST) return false
  const avg = { x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2 }
  return vlen(avg, mouth) < THINKING_NEAR_MOUTH_DIST
}

const detectHug = (handsLms, headCenter) => {
  const c = twoHandCenters(handsLms)
  if (!c || !headCenter) return false
  if (vlen(c[0], c[1]) >= HANDS_TOGETHER_DIST) return false
  const avgY = (c[0].y + c[1].y) / 2
  return avgY - headCenter.y > HUG_BELOW_FACE_DIST
}

// Face transform-matrix -> yaw/pitch. tasks-vision returns row-major flat 16.
const headYawDeg = (m) => Math.asin(Math.max(-1, Math.min(1, m[2]))) * 180 / Math.PI
const headPitchDeg = (m) => Math.asin(Math.max(-1, Math.min(1, -m[6]))) * 180 / Math.PI

const classifyGesture = (handRes, faceRes, poseRes) => {
  const hands = handRes?.landmarks || []
  const pose = poseRes?.landmarks?.[0] || null

  let headCenter = { x: 0.5, y: 0.3 }
  let mouthPoint = null
  let yawDeg = null, pitchDeg = null
  if (faceRes?.faceLandmarks?.length) {
    const fl = faceRes.faceLandmarks[0]
    headCenter = centerOf(fl)
    mouthPoint = { x: fl[MOUTH_LANDMARK].x, y: fl[MOUTH_LANDMARK].y }
  }
  if (faceRes?.facialTransformationMatrixes?.length) {
    const m = faceRes.facialTransformationMatrixes[0].data
    yawDeg = headYawDeg(m)
    pitchDeg = headPitchDeg(m)
  }

  // Per-hand shape/position first.
  for (const lm of hands) {
    const hc = centerOf(lm)

    if (isPinch(lm)) {
      if (vlen(hc, headCenter) < GLASSES_NEAR_FACE_DIST) return { gesture: 'glasses', yawDeg, pitchDeg }
      continue
    }

    const fingers = fingersUp(lm)
    const g = classifySingleHand(fingers)

    if (g === 'fist' || g === 'thumbs_up') {
      const besideHead =
        Math.abs(hc.y - headCenter.y) < 0.15 &&
        Math.abs(hc.x - headCenter.x) > 0.08 &&
        Math.abs(hc.x - headCenter.x) < 0.30
      if (besideHead) return { gesture: 'fist_by_head', yawDeg, pitchDeg }
      if (g === 'thumbs_up') {
        return { gesture: thumbPointsDown(lm) ? 'thumbs_down' : 'thumbs_up', yawDeg, pitchDeg }
      }
      continue
    }

    if (g === 'pointer') {
      const tip = { x: lm[8].x, y: lm[8].y }
      if (mouthPoint && vlen(tip, mouthPoint) < MOUTH_NEAR_DIST) {
        return { gesture: 'finger_mouth', yawDeg, pitchDeg }
      }
      return { gesture: 'nerd', yawDeg, pitchDeg }
    }
  }

  // Two-hand shape/position gestures next.
  const faceSeen = !!(faceRes?.faceLandmarks?.length)
  if (detectShy(hands, faceSeen ? headCenter : null)) return { gesture: 'shy', yawDeg, pitchDeg }
  if (detectThinking(hands, mouthPoint)) return { gesture: 'thinking', yawDeg, pitchDeg }
  if (detectHug(hands, faceSeen ? headCenter : null)) return { gesture: 'hug', yawDeg, pitchDeg }

  // Pose-based fallbacks.
  if (detectCrossArms(pose)) return { gesture: 'cross_arms', yawDeg, pitchDeg }
  if (detectBicep(pose)) return { gesture: 'bicep', yawDeg, pitchDeg }

  if (hands.length === 2) return { gesture: 'two_hands', yawDeg, pitchDeg }

  if (pitchDeg !== null && pitchDeg > PITCH_THRESHOLD_DEG) return { gesture: 'sad', yawDeg, pitchDeg }
  if (yawDeg !== null && Math.abs(yawDeg) > YAW_THRESHOLD_DEG) return { gesture: 'side_eye', yawDeg, pitchDeg }

  return { gesture: 'default', yawDeg, pitchDeg }
}

const prettyName = (g) => g.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const GESTURE_REF = [
  ['Poker face',        'Nothing / no match'],
  ['Thumbs up',         'Thumb up, away from face'],
  ['Thumbs down',       'Thumb down, away from face'],
  ['Lollipop',          'Closed fist beside head'],
  ['Glasses',           'Pinch (thumb + index) near face'],
  ['Finger near mouth', 'Index finger near mouth'],
  ['Nerd',              'Index up, away from mouth'],
  ['Bicep',             'Bent elbow, wrist above shoulder'],
  ['Crossed arms',      'Both wrists together at chest'],
  ['Shy',               'One hand on each cheek'],
  ['Thinking',          'Hands clasped at mouth/chin'],
  ['Hug',               'Hands clasped below face'],
  ['Sad',               'Head tilted down'],
  ['Truck',             'Two hands visible, no other match'],
  ['Side-eye',          'Turn head to the side'],
]

export default function GestureHammy() {
  const videoRef = useRef(null)
  const [gesture, setGesture] = useState('default')
  const [yaw, setYaw] = useState(0)
  const [pitch, setPitch] = useState(0)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showHud, setShowHud] = useState(true)
  const stateRef = useRef({
    handLM: null, faceLM: null, poseLM: null,
    lastVideoTime: -1,
    current: 'default', candidate: 'default', streak: 0,
  })

  useEffect(() => { document.title = 'Hammy Hamster · Sid' }, [])

  const start = async () => {
    setError(null)
    setLoading(true)
    try {
      const { HandLandmarker, FaceLandmarker, PoseLandmarker, FilesetResolver } =
        await import(/* @vite-ignore */ `${CDN}/vision_bundle.mjs`)
      const fileset = await FilesetResolver.forVisionTasks(`${CDN}/wasm`)
      stateRef.current.handLM = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.6, minTrackingConfidence: 0.6,
      })
      stateRef.current.faceLM = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO', numFaces: 1,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.6, minTrackingConfidence: 0.6,
      })
      stateRef.current.poseLM = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
      })
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setLoading(false)
      setRunning(true)
      requestAnimationFrame(loop)
    } catch (e) {
      setLoading(false)
      setError(e.message || String(e))
    }
  }

  const stop = () => {
    setRunning(false)
    const v = videoRef.current
    if (v?.srcObject) v.srcObject.getTracks().forEach(t => t.stop())
  }

  useEffect(() => () => stop(), [])

  const apply = (g) => {
    const st = stateRef.current
    if (g === st.current) return
    st.current = g
    setGesture(g)
  }

  const loop = () => {
    const st = stateRef.current
    const v = videoRef.current
    if (!v || !st.handLM || !st.faceLM || !st.poseLM) return
    if (v.currentTime !== st.lastVideoTime) {
      st.lastVideoTime = v.currentTime
      const ts = performance.now()
      const hr = st.handLM.detectForVideo(v, ts)
      const fr = st.faceLM.detectForVideo(v, ts)
      const pr = st.poseLM.detectForVideo(v, ts)
      const { gesture: g, yawDeg, pitchDeg } = classifyGesture(hr, fr, pr)
      if (yawDeg !== null) setYaw(yawDeg)
      if (pitchDeg !== null) setPitch(pitchDeg)
      if (g === st.candidate) st.streak++
      else { st.candidate = g; st.streak = 1 }
      if (st.streak >= STABLE_FRAMES_REQUIRED) apply(g)
    }
    if (videoRef.current?.srcObject) requestAnimationFrame(loop)
  }

  return (
    <div className='min-h-screen bg-[var(--luxe-bg-base)] text-fg-primary pt-24 sm:pt-28 pb-16 px-3 sm:px-6'>
      <div className='max-w-6xl mx-auto'>
        <header className='mb-6'>
          <p className='eyebrow-mono mb-2 text-amber-300/80'>— Hand + Face + Pose · MediaPipe</p>
          <h1 className='text-3xl sm:text-4xl font-bold gradient-text-amber leading-tight'>Hammy Hamster</h1>
          <p className='text-sm text-fg-muted mt-1 max-w-2xl'>
            Point your camera at yourself. 15 gestures — hand shapes, head angles, and full-body pose —
            each swaps in a matching hamster meme. Runs 100% in your browser via MediaPipe tasks-vision.
          </p>
        </header>

        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
          <div className='luxe-glass p-3 flex flex-col gap-3'>
            <div className='relative rounded-xl overflow-hidden bg-black aspect-[4/3]'>
              <video ref={videoRef} playsInline muted className='w-full h-full object-cover [transform:scaleX(-1)]' />
              {!running && !loading && (
                <div className='absolute inset-0 flex items-center justify-center bg-black/50'>
                  <button onClick={start} className='luxe-btn luxe-btn-primary'>Start camera</button>
                </div>
              )}
              {loading && (
                <div className='absolute inset-0 flex items-center justify-center bg-black/70 text-amber-200 text-sm font-mono'>
                  loading hand + face + pose models…
                </div>
              )}
              {running && showHud && (
                <div className='absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-[11px] font-mono text-amber-200 leading-snug'>
                  gesture: {prettyName(gesture)}<br />
                  yaw: {yaw >= 0 ? '+' : ''}{yaw.toFixed(1)}° (thr ±{YAW_THRESHOLD_DEG})<br />
                  pitch: {pitch >= 0 ? '+' : ''}{pitch.toFixed(1)}° (thr &gt;{PITCH_THRESHOLD_DEG})
                </div>
              )}
              {running && (
                <div className='absolute top-2 right-2 px-2 py-1 rounded-full bg-amber-300/90 text-neutral-900 text-[11px] font-semibold'>
                  {prettyName(gesture)}
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
              src={memeUrl(gesture)}
              alt={gesture}
              className='max-w-full max-h-[420px] object-contain rounded-xl'
            />
          </div>
        </div>

        <div className='mt-6 luxe-glass p-4'>
          <p className='eyebrow-mono mb-3 text-amber-300/80'>— How to trigger each meme</p>
          <ul className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-xs'>
            {GESTURE_REF.map(([name, how]) => (
              <li key={name}><b className='text-amber-200'>{name}</b> — {how}</li>
            ))}
          </ul>
          <p className='mt-3 text-[11px] text-fg-muted leading-snug'>
            Priority: pinch → fist-beside-head/thumbs → pointer → shy/thinking/hug → crossed-arms/bicep →
            two-hands → head-down (sad) → head-turn (side-eye) → default.
          </p>
        </div>
      </div>
    </div>
  )
}
