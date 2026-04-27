import { useState, lazy, Suspense } from 'react'

const FaceAI = lazy(() => import('../components/vision/FaceAI'))
const ObjectDetect = lazy(() => import('../components/vision/ObjectDetect'))
const OCRTool = lazy(() => import('../components/vision/OCRTool'))
const FaceLab = lazy(() => import('../components/vision/FaceLab'))

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

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-6 pt-32 pb-24">
        <h1 className="font-poppins font-black text-5xl md:text-6xl bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent leading-tight mb-2">
          Vision AI
        </h1>
        <p className="text-gray-400 text-sm max-w-xl mb-6">
          Real-time face analysis, object detection & OCR — powered by OpenCV, TensorFlow.js & Tesseract.js.
        </p>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-8">
          {[
            { id: 'face', label: 'Face AI', gradient: 'from-[#e91e8c] to-[#b388ff]' },
            { id: 'object', label: 'Object Detection', gradient: 'from-pink-600 to-orange-600' },
            { id: 'ocr', label: 'OCR / Text', gradient: 'from-amber-600 to-yellow-600' },
            { id: 'lab', label: 'Face Lab', gradient: 'from-violet-600 to-fuchsia-600' },
          ].map(t => (
            <button key={t.id} onClick={() => setMode(t.id)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                mode === t.id ? `bg-gradient-to-r ${t.gradient} text-white` : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <Suspense fallback={<Skeleton />}>
          {mode === 'face' && <FaceAI />}
          {mode === 'object' && <ObjectDetect />}
          {mode === 'ocr' && <OCRTool />}
          {mode === 'lab' && <FaceLab />}
        </Suspense>
      </div>
    </div>
  )
}

export default FaceDetection
