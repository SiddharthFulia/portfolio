import { useState, useRef } from 'react'
import { Button, Input, Slider } from 'antd'
import { CameraOutlined, UploadOutlined, DownloadOutlined, EditOutlined } from '@ant-design/icons'
import { editImage } from '../../api/ai'

const PROMPT_PRESETS = [
  'add sunglasses',
  'change background to a beach at sunset',
  'make it look like an oil painting',
  'add a Christmas hat',
  'turn it into a watercolor sketch',
  'change clothing to a tuxedo',
  'add neon cyberpunk lighting',
  'make it look like a Pixar 3D render',
]

const ImageEdit = () => {
  const [image, setImage] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [strength, setStrength] = useState(0.7)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [cameraOn, setCameraOn] = useState(false)
  const fileRef = useRef(null)
  const videoRef = useRef(null)
  const captureCanvasRef = useRef(null)
  const streamRef = useRef(null)

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      setCameraOn(true)
      // Attach stream after the video element mounts
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      }, 0)
    } catch {
      setError('Camera access denied')
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    const canvas = captureCanvasRef.current || document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    setImage(canvas.toDataURL('image/jpeg', 0.85))
    stopCamera()
  }

  const handleUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      // Compress to max 768px to keep payload small + speed up CF inference
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const max = 768
        let w = img.width, h = img.height
        if (w > max || h > max) {
          const scale = max / Math.max(w, h)
          w = Math.round(w * scale); h = Math.round(h * scale)
        }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        setImage(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  const generate = async () => {
    if (!image || !prompt.trim()) return
    setLoading(true); setError(null); setResult(null)
    const { data, error: err } = await editImage(image, prompt.trim(), { strength })
    if (err) setError(err)
    else if (data?.image) setResult(data.image)
    setLoading(false)
  }

  const download = (src, name) => {
    if (!src) return
    const a = document.createElement('a')
    a.href = src; a.download = name || 'edited.png'; a.click()
  }

  const reset = () => {
    setImage(null); setResult(null); setPrompt(''); setError(null)
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="rounded-xl border border-gray-700 bg-gray-900/40 p-4">
        <p className="text-gray-400 text-xs">
          Upload a photo and describe how you want it changed.
        </p>
      </div>

      {/* Step 1: source image */}
      {!image ? (
        <div className="space-y-4">
          {cameraOn ? (
            <div className="rounded-xl overflow-hidden border border-gray-700 bg-black relative mx-auto" style={{ width: '100%', maxWidth: 480 }}>
              <div style={{ position: 'relative', width: '100%', paddingBottom: '75%' }}>
                <video ref={videoRef} autoPlay playsInline muted
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
              </div>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                <Button type="primary" onClick={capturePhoto} icon={<CameraOutlined />}>Capture</Button>
                <Button onClick={stopCamera}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 flex-wrap">
              <Button size="large" icon={<CameraOutlined />} onClick={startCamera}>Take Photo</Button>
              <Button size="large" icon={<UploadOutlined />} onClick={() => fileRef.current?.click()}>Upload Photo</Button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          <canvas ref={captureCanvasRef} className="hidden" />
        </div>
      ) : (
        <>
          {/* Side-by-side comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl overflow-hidden border border-gray-700 bg-black relative">
              <img src={image} alt="Original" className="w-full max-h-80 object-contain" />
              <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-gray-400">Original</div>
            </div>

            {result ? (
              <div className="rounded-xl overflow-hidden border border-gray-700 bg-black relative">
                <img src={result} alt="Edited" className="w-full max-h-80 object-contain" />
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-purple-300">Edited</div>
                <Button size="small" icon={<DownloadOutlined />} className="absolute top-2 right-2"
                  onClick={() => download(result, 'edited.png')}>Save</Button>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-gray-700 bg-gray-900/40 flex items-center justify-center min-h-[200px]">
                <span className="text-gray-600 text-sm">{loading ? 'Generating edit...' : 'Edited image will appear here'}</span>
              </div>
            )}
          </div>

          {/* Prompt + presets */}
          <div className="space-y-3">
            <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Edit Prompt</p>
            <Input.TextArea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe the change — e.g. 'add sunglasses and a beach background'"
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
            <div className="flex flex-wrap gap-2">
              {PROMPT_PRESETS.map(p => (
                <button key={p} onClick={() => setPrompt(p)}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-lg transition-colors">
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Strength slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Strength: how much to change</p>
              <span className="text-purple-400 text-xs font-semibold">{Math.round(strength * 100)}%</span>
            </div>
            <Slider min={0.1} max={0.95} step={0.05} value={strength} onChange={setStrength}
              tooltip={{ formatter: v => `${Math.round(v * 100)}%` }} />
            <p className="text-gray-600 text-[10px]">
              Lower = closer to original. Higher = more creative interpretation.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <Button type="primary" icon={<EditOutlined />} onClick={generate}
              loading={loading} disabled={!prompt.trim()}
              style={{ background: '#7c3aed' }}>
              {loading ? 'Editing...' : 'Generate Edit'}
            </Button>
            <Button onClick={reset}>New Photo</Button>
          </div>

          {error && (
            <div className="p-3 bg-gray-800/60 border border-yellow-700 rounded-lg">
              <p className="text-yellow-400 text-sm">{error}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ImageEdit
