import { useState, lazy, Suspense } from 'react'

const FaceAI = lazy(() => import('../components/vision/FaceAI'))
const ImageEdit = lazy(() => import('../components/vision/ImageEdit'))
const ObjectDetect = lazy(() => import('../components/vision/ObjectDetect'))
const OCRTool = lazy(() => import('../components/vision/OCRTool'))
const FaceLab = lazy(() => import('../components/vision/FaceLab'))
// AIStudio used to live at /studio. Folded into Vision so all multimodal tools
// (image gen, gemini-vision, TTS) sit alongside the camera-driven ones.
const AIStudio = lazy(() => import('./AIStudio'))

const TOOLS = [
  {
    id: 'face',
    label: 'Face AI',
    blurb: 'Live face mesh + mood, age, smile detection.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r="1" /><circle cx="15" cy="10" r="1" />
        <path d="M9 15c1 1 2 1.5 3 1.5s2-.5 3-1.5" />
      </svg>
    ),
    accent: 'from-pink-500 to-fuchsia-500',
    glow: 'shadow-pink-500/20',
    border: 'border-pink-500/60',
  },
  {
    id: 'edit',
    label: 'Image Edit',
    blurb: 'Upload a photo, describe a change → AI re-paints it.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M3 17.25V21h3.75L17 10.75l-3.75-3.75z" /><path d="M14.06 6.94l3-3 2 2-3 3z" />
      </svg>
    ),
    accent: 'from-purple-500 to-cyan-400',
    glow: 'shadow-purple-500/20',
    border: 'border-purple-500/60',
  },
  {
    id: 'object',
    label: 'Object Detect',
    blurb: 'YOLOv8 finds + boxes objects in real time.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    accent: 'from-orange-500 to-pink-500',
    glow: 'shadow-orange-500/20',
    border: 'border-orange-500/60',
  },
  {
    id: 'ocr',
    label: 'OCR / Text',
    blurb: 'Pull text out of any image with Tesseract.js.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M4 7V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-2" />
        <path d="M7 9h10M7 13h10M7 17h6" />
      </svg>
    ),
    accent: 'from-amber-500 to-yellow-400',
    glow: 'shadow-amber-500/20',
    border: 'border-amber-500/60',
  },
  {
    id: 'lab',
    label: 'Face Lab',
    blurb: 'Filters, swaps & describe-me-in-words AI fun.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M9 3v6L4 19a2 2 0 002 2h12a2 2 0 002-2L15 9V3" /><path d="M9 3h6" /><path d="M9 13h6" />
      </svg>
    ),
    accent: 'from-violet-500 to-fuchsia-500',
    glow: 'shadow-violet-500/20',
    border: 'border-violet-500/60',
  },
  {
    id: 'studio',
    label: 'AI Studio',
    blurb: 'Image gen, Gemini vision Q&A, text-to-speech.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.5L12 16l-4.9 2.6L8 13.1l-4-3.9 5.4-.9z" />
      </svg>
    ),
    accent: 'from-cyan-400 to-blue-500',
    glow: 'shadow-cyan-500/20',
    border: 'border-cyan-500/60',
  },
]

const Skeleton = () => (
  <div className="animate-pulse space-y-4 max-w-[900px] mx-auto">
    <div className="flex flex-wrap gap-6 justify-center">
      <div className="w-full max-w-[400px] bg-gray-800 rounded-2xl" style={{ paddingBottom: '133%' }} />
      <div className="flex-1 min-w-[280px] max-w-[420px] space-y-3">
        {[1,2,3,4].map(i => <div key={i} className="bg-gray-800 h-24 rounded-xl" />)}
      </div>
    </div>
  </div>
)

const FaceDetection = () => {
  const [mode, setMode] = useState('face')
  const active = TOOLS.find(t => t.id === mode) || TOOLS[0]

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/20 via-purple-900/10 to-pink-900/20 pointer-events-none" />
        <div className="absolute -top-40 -left-20 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-28 sm:pt-32 pb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-800/60 border border-gray-700 backdrop-blur-sm mb-3">
            <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse" />
            <span className="text-[11px] uppercase tracking-wider text-gray-300 font-semibold">5 vision tools • 1 page</span>
          </div>
          <h1 className="font-poppins font-black text-4xl sm:text-5xl md:text-6xl bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent leading-tight mb-2">
            Vision AI
          </h1>
          <p className="text-gray-400 text-sm sm:text-base max-w-xl">
            Real-time face analysis, AI image editing, object detection & OCR — all running on your browser, MediaPipe and Cloudflare Workers AI.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 sm:px-6 pb-24">
        {/* Tool cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-8">
          {TOOLS.map(t => {
            const isActive = mode === t.id
            return (
              <button
                key={t.id}
                onClick={() => setMode(t.id)}
                className={`group relative p-3 sm:p-4 rounded-xl text-left transition-all border ${
                  isActive
                    ? `${t.border} bg-gray-900 shadow-lg ${t.glow}`
                    : 'border-gray-800 bg-gray-900/40 hover:bg-gray-900 hover:border-gray-700'
                }`}>
                <div className={`mb-2 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br ${t.accent} text-black/80`}>
                  {t.icon}
                </div>
                <div className={`text-xs sm:text-sm font-bold ${isActive ? 'text-white' : 'text-gray-300'}`}>
                  {t.label}
                </div>
                <div className="text-[10px] sm:text-[11px] text-gray-500 mt-0.5 leading-snug line-clamp-2">
                  {t.blurb}
                </div>
                {isActive && (
                  <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full bg-gradient-to-br ${t.accent} ring-2 ring-gray-950`} />
                )}
              </button>
            )
          })}
        </div>

        {/* Section header for active tool */}
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-1 h-8 rounded-full bg-gradient-to-b ${active.accent}`} />
          <div>
            <div className="text-base font-bold text-white">{active.label}</div>
            <div className="text-[11px] text-gray-500">{active.blurb}</div>
          </div>
        </div>

        <Suspense fallback={<Skeleton />}>
          {mode === 'studio' && <AIStudio />}
          {mode === 'face' && <FaceAI />}
          {mode === 'edit' && <ImageEdit />}
          {mode === 'object' && <ObjectDetect />}
          {mode === 'ocr' && <OCRTool />}
          {mode === 'lab' && <FaceLab />}
        </Suspense>
      </div>
    </div>
  )
}

export default FaceDetection
