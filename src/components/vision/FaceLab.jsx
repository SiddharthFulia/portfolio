import { useState, useRef, useEffect } from 'react'
import { Button, Input, Tabs } from 'antd'
import { CameraOutlined, UploadOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { generateImage, geminiVision } from '../../api/ai'
import { analyzeFace } from '../../api/face'

const IMAGE_PROVIDERS = [
  { id: 'cloudflare', label: 'Cloudflare', desc: '10k/day free' },
  { id: 'huggingface', label: 'Hugging Face', desc: 'monthly credits' },
]

const STYLES = [
  { id: 'anime', label: 'Anime / Cartoon', prompt: 'Convert this person into anime style art, keep the same face features, hair, and expression. Studio Ghibli style, detailed, vibrant colors.' },
  { id: 'pixar', label: 'Pixar 3D', prompt: 'Convert this person into a Pixar 3D character, same face features and expression, rendered in Pixar animation style, bright lighting.' },
  { id: 'sketch', label: 'Pencil Sketch', prompt: 'Convert this photo into a detailed pencil sketch drawing, same face, artistic, on white paper, charcoal shading.' },
  { id: 'oil', label: 'Oil Painting', prompt: 'Convert this photo into a classical oil painting, renaissance style, dramatic lighting, same face and expression.' },
  { id: 'cyberpunk', label: 'Cyberpunk', prompt: 'Convert this person into cyberpunk style, neon lights, futuristic, same face, cyber implants, dark city background.' },
  { id: 'old', label: 'Old Age', prompt: 'Show how this person would look at 80 years old, add wrinkles, grey hair, but keep the same face structure and features.' },
  { id: 'young', label: 'Young / Baby', prompt: 'Show how this person would look as a 5 year old child, keep similar face features, cute, baby face.' },
  { id: 'zombie', label: 'Zombie', prompt: 'Convert this person into a zombie, scary, pale skin, dark eyes, torn clothes, same face structure, horror style.' },
  { id: 'superhero', label: 'Superhero', prompt: 'Convert this person into a Marvel superhero, wearing a superhero suit, dramatic pose, same face, epic background.' },
  { id: 'professional', label: 'Professional Headshot', prompt: 'Make this into a professional corporate headshot, studio lighting, neutral background, same person, sharp, LinkedIn ready.' },
]

const FILTERS = [
  { id: 'none', label: 'None' },
  { id: 'sunglasses', label: 'Sunglasses' },
  { id: 'mustache', label: 'Mustache' },
  { id: 'crown', label: 'Crown' },
  { id: 'hearts', label: 'Heart Eyes' },
  { id: 'devil', label: 'Devil Horns' },
  { id: 'halo', label: 'Angel Halo' },
  { id: 'tears', label: 'Tears' },
  { id: 'blush', label: 'Blush' },
  { id: 'pixelate', label: 'Pixelate Face' },
]

const FaceLab = () => {
  const [image, setImage] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedStyle, setSelectedStyle] = useState('anime')
  const [selectedFilter, setSelectedFilter] = useState('none')
  const [faceData, setFaceData] = useState(null)
  const [description, setDescription] = useState(null)
  const [describing, setDescribing] = useState(false)
  const [imageProvider, setImageProvider] = useState('cloudflare')
  const fileRef = useRef(null)
  const videoRef = useRef(null)
  const captureCanvasRef = useRef(null)
  const streamRef = useRef(null)
  const filterCanvasRef = useRef(null)
  const [cameraOn, setCameraOn] = useState(false)

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      streamRef.current = stream
      setCameraOn(true)
    } catch { setError('Camera access denied') }
  }

  // Attach stream to video element after it mounts (cameraOn flips true)
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [cameraOn])

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
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    setImage(canvas.toDataURL('image/jpeg', 0.8))
    stopCamera()
  }

  const handleUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      // Compress image to max 640px to avoid 400 errors from large images
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxSize = 800
        let w = img.width, h = img.height
        if (w > maxSize || h > maxSize) {
          const scale = maxSize / Math.max(w, h)
          w = Math.round(w * scale); h = Math.round(h * scale)
        }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        setImage(canvas.toDataURL('image/jpeg', 0.9))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  // Describe face with Gemini (auto on image change)
  const describeFace = async () => {
    if (!image) return
    setDescribing(true); setError(null)
    const { data, error: err } = await geminiVision(image, 'You are describing a person for an AI portrait generator. Write a single paragraph with ONLY physical attributes. Format: "[ethnicity] [gender], [age]yo, [skin tone] skin, [hair description], [face shape], [eye details], [nose], [lips], [expression], wearing [clothing]". Example: "South Asian male, 24yo, medium brown skin, short black straight hair, oval face, dark brown eyes, medium nose, full lips, slight smile, wearing dark blue t-shirt". Be extremely specific about skin color. NO generic descriptions. NO bullet points. Just one detailed sentence.')
    if (err) setError(err)
    else setDescription(data?.reply || '')
    setDescribing(false)
  }

  // Generate styled portrait — uses (possibly user-edited) description
  const generateStyled = async () => {
    if (!image) return
    setLoading(true); setError(null); setResult(null)

    let desc = description
    if (!desc) {
      const { data } = await geminiVision(image, 'Describe this person in one sentence for an AI art generator: ethnicity, skin tone, gender, age, hair, face shape, expression, clothing. Be specific about skin color. Example: "South Asian male, 24yo, brown skin, short black hair, oval face, slight smile, blue shirt"')
      desc = data?.reply || 'a person'
      setDescription(desc)
    }

    const style = STYLES.find(s => s.id === selectedStyle)
    const prompt = `Portrait of a person who looks exactly like this: ${desc.slice(0, 600)}. Style: ${style.prompt}. IMPORTANT: match the skin tone, ethnicity, and facial features exactly as described.`

    const { data, error: err } = await generateImage(prompt, { provider: imageProvider })
    if (err) setError(err)
    else if (data?.image) setResult(data.image)
    setLoading(false)
  }

  // Detect face for filters
  const detectForFilters = async () => {
    if (!image) return
    const { data } = await analyzeFace(image)
    if (data) setFaceData(data)
  }

  // Draw filter on canvas
  useEffect(() => {
    if (!image || selectedFilter === 'none' || !faceData?.faces?.length) return
    const canvas = filterCanvasRef.current
    if (!canvas) return

    const img = new Image()
    img.onload = () => {
      canvas.width = img.width; canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      const face = faceData.faces[0]
      const bb = face.boundingBox
      if (!bb) return

      const cx = bb.x + bb.width / 2
      const cy = bb.y + bb.height / 2

      ctx.font = `${bb.width * 0.4}px serif`
      ctx.textAlign = 'center'

      switch (selectedFilter) {
        case 'sunglasses':
          ctx.font = `${bb.width * 0.5}px serif`
          ctx.fillText('🕶️', cx, bb.y + bb.height * 0.4)
          break
        case 'mustache':
          ctx.font = `${bb.width * 0.3}px serif`
          ctx.fillText('🥸', cx, bb.y + bb.height * 0.65)
          break
        case 'crown':
          ctx.font = `${bb.width * 0.4}px serif`
          ctx.fillText('👑', cx, bb.y - bb.height * 0.05)
          break
        case 'hearts':
          ctx.font = `${bb.width * 0.25}px serif`
          ctx.fillText('❤️', bb.x + bb.width * 0.25, bb.y + bb.height * 0.35)
          ctx.fillText('❤️', bb.x + bb.width * 0.75, bb.y + bb.height * 0.35)
          break
        case 'devil':
          ctx.font = `${bb.width * 0.25}px serif`
          ctx.fillText('😈', bb.x + bb.width * 0.2, bb.y - bb.height * 0.05)
          ctx.fillText('😈', bb.x + bb.width * 0.8, bb.y - bb.height * 0.05)
          break
        case 'halo':
          ctx.font = `${bb.width * 0.3}px serif`
          ctx.fillText('😇', cx, bb.y - bb.height * 0.15)
          break
        case 'tears':
          ctx.font = `${bb.width * 0.15}px serif`
          ctx.fillText('💧', bb.x + bb.width * 0.3, bb.y + bb.height * 0.55)
          ctx.fillText('💧', bb.x + bb.width * 0.7, bb.y + bb.height * 0.55)
          break
        case 'blush':
          ctx.fillStyle = 'rgba(255,100,100,0.3)'
          ctx.beginPath(); ctx.ellipse(bb.x + bb.width * 0.2, bb.y + bb.height * 0.6, bb.width * 0.12, bb.width * 0.08, 0, 0, Math.PI * 2); ctx.fill()
          ctx.beginPath(); ctx.ellipse(bb.x + bb.width * 0.8, bb.y + bb.height * 0.6, bb.width * 0.12, bb.width * 0.08, 0, 0, Math.PI * 2); ctx.fill()
          break
        case 'pixelate': {
          const px = 10
          const region = ctx.getImageData(bb.x, bb.y, bb.width, bb.height)
          for (let y = 0; y < region.height; y += px) {
            for (let x = 0; x < region.width; x += px) {
              const i = (y * region.width + x) * 4
              const r = region.data[i], g = region.data[i+1], b = region.data[i+2]
              for (let dy = 0; dy < px && y+dy < region.height; dy++) {
                for (let dx = 0; dx < px && x+dx < region.width; dx++) {
                  const j = ((y+dy) * region.width + (x+dx)) * 4
                  region.data[j] = r; region.data[j+1] = g; region.data[j+2] = b
                }
              }
            }
          }
          ctx.putImageData(region, bb.x, bb.y)
          break
        }
      }
    }
    img.src = image
  }, [image, selectedFilter, faceData])

  // Auto-detect face + auto-describe when image changes
  useEffect(() => {
    if (image) {
      detectForFilters()
      describeFace()
    }
  }, [image])

  const download = (src, name) => {
    const a = document.createElement('a')
    a.href = src; a.download = name || 'face-lab.png'; a.click()
  }


  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  return (
    <div className="space-y-6">
      {/* Image source */}
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
            <div className="flex gap-3">
              <Button size="large" icon={<CameraOutlined />} onClick={startCamera}>Take Photo</Button>
              <Button size="large" icon={<UploadOutlined />} onClick={() => fileRef.current?.click()}>Upload Photo</Button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          <canvas ref={captureCanvasRef} className="hidden" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Original + result side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl overflow-hidden border border-gray-700 bg-black relative">
              {selectedFilter !== 'none' && faceData ? (
                <canvas ref={filterCanvasRef} className="w-full max-h-80 object-contain" />
              ) : (
                <img src={image} alt="Your photo" className="w-full max-h-80 object-contain" />
              )}
              <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-gray-400">Original</div>
            </div>

            {result && (
              <div className="rounded-xl overflow-hidden border border-gray-700 bg-black relative">
                <img src={result} alt="AI Generated" className="w-full max-h-80 object-contain" />
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-gray-400">AI Generated</div>
                <Button size="small" icon={<DownloadOutlined />} className="absolute top-2 right-2"
                  onClick={() => download(result, `face-${selectedStyle}.png`)}>Save</Button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button size="small" onClick={() => { setImage(null); setResult(null); setFaceData(null); setDescription(null); setSelectedFilter('none') }}>
              New Photo
            </Button>
            {selectedFilter !== 'none' && faceData && (
              <Button size="small" icon={<DownloadOutlined />}
                onClick={() => download(filterCanvasRef.current?.toDataURL('image/png'), `face-${selectedFilter}.png`)}>
                Save Filtered
              </Button>
            )}
          </div>
        </div>
      )}

      {image && (
        <Tabs defaultActiveKey="style" items={[
          {
            key: 'style', label: 'AI Style Transfer',
            children: (
              <div className="space-y-4">
                {/* Editable AI description */}
                <div className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-500 text-[10px] font-semibold uppercase">AI Description (editable)</p>
                    <Button size="small" icon={<ReloadOutlined />} loading={describing} onClick={describeFace}>
                      Re-describe
                    </Button>
                  </div>
                  <Input.TextArea
                    value={description || ''}
                    onChange={e => setDescription(e.target.value)}
                    placeholder={describing ? 'Analyzing face...' : 'Description will appear here. Edit it to tweak skin tone, clothing, expression, etc.'}
                    autoSize={{ minRows: 3, maxRows: 8 }}
                    disabled={describing}
                  />
                  <p className="text-gray-600 text-[10px] mt-1.5">Tip: edit this text to control the output — change clothing color, hair style, expression, background, anything.</p>
                </div>

                {/* Style picker */}
                <div>
                  <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Style</p>
                  <div className="flex flex-wrap gap-2">
                    {STYLES.map(s => (
                      <button key={s.id} onClick={() => setSelectedStyle(s.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          selectedStyle === s.id ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}>{s.label}</button>
                    ))}
                  </div>
                </div>

                {/* Provider picker */}
                <div>
                  <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Provider</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {IMAGE_PROVIDERS.map(p => (
                      <button key={p.id} onClick={() => setImageProvider(p.id)}
                        className={`p-2.5 rounded-lg border text-left transition-colors ${
                          imageProvider === p.id
                            ? 'border-purple-500 bg-purple-600/15'
                            : 'border-gray-700 bg-gray-800/40 hover:bg-gray-800'
                        }`}>
                        <div className={`text-xs font-semibold ${imageProvider === p.id ? 'text-purple-300' : 'text-gray-300'}`}>{p.label}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{p.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <Button type="primary" onClick={generateStyled} loading={loading} disabled={!image || describing}
                  style={{ background: '#7c3aed' }}>
                  {loading ? 'Generating...' : `Generate ${STYLES.find(s => s.id === selectedStyle)?.label}`}
                </Button>

                <p className="text-gray-600 text-[10px]">Note: AI generates a new portrait inspired by the description. It won't be an exact copy of your face — think of it as "what would someone matching my description look like in this style".</p>
              </div>
            )
          },
          {
            key: 'filter', label: 'Face Filters',
            children: (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {FILTERS.map(f => (
                    <button key={f.id} onClick={() => setSelectedFilter(f.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        selectedFilter === f.id ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}>{f.label}</button>
                  ))}
                </div>
                {!faceData && <p className="text-gray-500 text-xs">Detecting face...</p>}
              </div>
            )
          },
        ]} />
      )}

      {error && (
        <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-xl">
          <p className="text-yellow-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}

export default FaceLab
