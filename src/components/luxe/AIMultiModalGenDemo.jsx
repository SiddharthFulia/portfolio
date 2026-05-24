// AI Multi-Modal Generation — DEMO / showcase component.
//
// Ported from a TSX shadcn original (see E:\Siddharth\FE components\AI Gen.txt).
// This is *not* a real generation lane — the three "Generate" buttons each
// route out to the existing real pages (/image-enhancer, /ai-video,
// /ai-video?tab=cinema). The history items, loader, settings, etc. are all
// presentational. A future iteration can wire actual gen by replacing the
// `routeToRealLane()` call in `handleSubmit` with the real API call.
//
// Replacements vs. the original:
//   • shadcn Tabs / Card / Label / Textarea / Input / Button → inline Tailwind
//   • shadcn Select / Slider / Switch / Popover               → antd
//   • next/image  → plain <img>
//   • Simulated wait + history mutation → window.open() to the real lanes

import { useState, useEffect } from 'react'
import {
  MessageCircle, Sparkles, Wand2, Loader2, Play, Pause, RotateCw,
  History, AlertCircle, Palette, ImageIcon, Sun, User, Monitor,
  Cpu, RatioIcon as AspectRatio, Film, CuboidIcon as Cube,
  ArrowLeft, Clock, Search,
} from 'lucide-react'
import { Select, Slider, Switch, Popover } from 'antd'

// Map demo mode → real generation lane on this portfolio.
const ROUTE_MAP = {
  image:  '/image-enhancer',
  video:  '/ai-video',
  // We don't have a real 3D-avatar pipeline yet — point at the Cinema tab
  // inside AI Video as a stand-in. Swap this once an avatar lane lands.
  avatar: '/ai-video?tab=cinema',
}

const PLACEHOLDER_IMG = 'https://cdn.pixabay.com/photo/2023/08/03/09/57/ai-generated-8166705_1280.png'

const placeholderPrompts = {
  image:  'Professional portrait with blue background, studio lighting',
  video:  'Short video of a person walking in a park, cinematic lighting',
  avatar: '3D avatar of a young professional with glasses, detailed face',
}

const loadingTexts = {
  image:  ['Creating your masterpiece...', 'Finding the perfect colors...', 'Adding the final touches...'],
  video:  ['Generating video frames...', 'Applying motion effects...', 'Rendering your video...'],
  avatar: ['Building 3D mesh...', 'Applying textures...', 'Finalizing your avatar...'],
}

const aiModels = {
  image: [
    { value: 'stable-diffusion-xl', label: 'Stable Diffusion XL' },
    { value: 'midjourney-v5', label: 'Midjourney v5' },
    { value: 'dalle-3', label: 'DALL-E 3' },
    { value: 'imagen', label: 'Imagen' },
  ],
  video: [
    { value: 'gen-2', label: 'Gen-2' },
    { value: 'runway-gen-2', label: 'Runway Gen-2' },
    { value: 'pika-labs', label: 'Pika Labs' },
    { value: 'sora', label: 'Sora' },
  ],
  avatar: [
    { value: 'dreamshaper-3d', label: 'DreamShaper 3D' },
    { value: '3d-diffusion', label: '3D Diffusion' },
    { value: 'meshy', label: 'Meshy' },
    { value: 'luma', label: 'Luma AI' },
  ],
}

const resolutions = {
  image: [
    { value: '512x512', label: '512x512' },
    { value: '768x768', label: '768x768' },
    { value: '1024x1024', label: '1024x1024' },
    { value: '1536x1536', label: '1536x1536' },
  ],
  video: [
    { value: '512x512', label: '512x512' },
    { value: '768x768', label: '768x768' },
    { value: '1024x576', label: '1024x576 (16:9)' },
    { value: '1280x720', label: '1280x720 (HD)' },
  ],
  avatar: [
    { value: '512x512', label: '512x512' },
    { value: '768x768', label: '768x768' },
    { value: '1024x1024', label: '1024x1024' },
    { value: '2048x2048', label: '2048x2048' },
  ],
}

// Mode-specific suggestion list. Picked when the mode tab changes.
const suggestionsByMode = {
  image: [
    'Professional headshot with neutral background',
    'Artistic portrait with dramatic lighting',
    'Casual portrait in natural outdoor setting',
  ],
  video: [
    'Person walking in urban environment, cinematic lighting',
    'Close-up of face with changing expressions',
    'Rotating view of subject in studio setting',
  ],
  avatar: [
    'Realistic 3D avatar with professional attire',
    'Stylized cartoon character with expressive features',
    'Detailed 3D bust with photorealistic textures',
  ],
}

// Simple antd Select wrapper to match the "row" layout used throughout the
// settings panel. Dark surface, fixed 160px width, small footprint.
function RowSelect({ value, onChange, options }) {
  return (
    <Select
      size="small"
      value={value}
      onChange={onChange}
      options={options}
      style={{ width: 170 }}
      dropdownStyle={{ background: '#0b1220' }}
    />
  )
}

function AIMultiModalGenDemo() {
  const [mode, setMode] = useState('image')
  const [showForm, setShowForm] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [advancedMode, setAdvancedMode] = useState(false)
  const [promptSuggestions, setPromptSuggestions] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [currentTextIndex, setCurrentTextIndex] = useState(0)
  const [progress, setProgress] = useState(0)

  // Seed history with two presentational entries so the gallery isn't empty.
  const [generatedItems, setGeneratedItems] = useState([
    {
      id: '1',
      type: 'image',
      url: PLACEHOLDER_IMG,
      prompt: 'Portrait of a woman with orange background',
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
    },
    {
      id: '2',
      type: 'image',
      url: PLACEHOLDER_IMG,
      prompt: 'Professional headshot with blue background',
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
    },
  ])

  const [settings, setSettings] = useState({
    style: 'artistic',
    backgroundColor: 'studio',
    lighting: 'studio',
    pose: 'profile',
    aspectRatio: '4:5',
    aiModel: 'stable-diffusion-xl',
    resolution: '1024x1024',
    prompt: '',
    negativePrompt: 'blurry, low quality, distorted features',
    seed: 0,
    steps: 30,
  })

  useEffect(() => { setPromptSuggestions(suggestionsByMode[mode] || []) }, [mode])

  // Fake progress bar — kept purely cosmetic, only used if we ever flip back
  // to the simulated-wait flow. Currently `isLoading` is never set true.
  useEffect(() => {
    if (!isLoading) { setProgress(0); return }
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) { clearInterval(interval); return 100 }
        return prev + (mode === 'image' ? 1.5 : mode === 'video' ? 0.8 : 0.5)
      })
    }, 30)
    return () => clearInterval(interval)
  }, [isLoading, mode])

  useEffect(() => {
    if (!isLoading) return
    const interval = setInterval(() => {
      setCurrentTextIndex((p) => (p + 1) % loadingTexts[mode].length)
    }, 1500)
    return () => clearInterval(interval)
  }, [isLoading, mode])

  // DEMO ONLY — instead of simulating a wait + injecting a history item,
  // we route the user out to the real generation lane that already exists
  // in this portfolio. If a real multi-modal API ever lands, swap this for
  // the actual fetch.
  const routeToRealLane = (m) => {
    const path = ROUTE_MAP[m] || '/'
    window.open(path, '_blank', 'noopener,noreferrer')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    routeToRealLane(mode)
  }

  const handleBackToSettings = () => {
    setShowForm(true)
    setShowHistory(false)
    setError(null)
  }

  const handleModeChange = (newMode) => {
    setMode(newMode)
    setShowForm(true)
    setShowHistory(false)
    setError(null)
  }

  const handleViewHistory = () => {
    setShowForm(false)
    setShowHistory(true)
  }

  const handleSelectHistoryItem = (id) => {
    const item = generatedItems.find((it) => it.id === id)
    if (item) {
      setMode(item.type)
      setShowHistory(false)
      setShowForm(false)
    }
  }

  const applyPromptSuggestion = (suggestion) => {
    setSettings((s) => ({ ...s, prompt: suggestion }))
  }

  const togglePlay = () => setIsPlaying((p) => !p)
  const toggleRotate = () => setIsRotating((r) => !r)

  const formatDate = (date) => {
    const now = new Date()
    const diffMs = now.getTime() - new Date(date).getTime()
    const diffMins = Math.round(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return new Date(date).toLocaleDateString()
  }

  const filteredItems = generatedItems.filter((item) =>
    item.prompt.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // ── Header ────────────────────────────────────────────────────────────
  const renderHeader = () => (
    <div className="p-4 flex items-center justify-between border-b border-zinc-800">
      <div>
        <h3 className="text-sm font-medium text-zinc-100">AI Multi-Modal Generation</h3>
        <p className="text-xs text-zinc-400">Create stunning AI-generated content</p>
      </div>
      <button onClick={handleViewHistory}
        className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">
        <History className="w-4 h-4 text-zinc-400" />
      </button>
    </div>
  )

  // ── Tabs ──────────────────────────────────────────────────────────────
  // Inlined .map over a static list so we never define a component inside
  // the render body (that would re-mount each tab on every parent render —
  // same anti-pattern as Cinema.jsx's `Outer`).
  const TABS = [
    { value: 'image',  icon: <ImageIcon className="w-4 h-4" />, label: 'Image' },
    { value: 'video',  icon: <Film className="w-4 h-4" />,      label: 'Video' },
    { value: 'avatar', icon: <Cube className="w-4 h-4" />,      label: '3D Avatar' },
  ]
  const renderTabs = () => (
    <div className="w-full px-4">
      <div className="grid grid-cols-3 w-full p-1 rounded-lg bg-zinc-900/70 border border-zinc-800">
        {TABS.map(({ value, icon, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleModeChange(value)}
            className={`flex-1 inline-flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-colors ${
              mode === value
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}>
            {icon}<span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )

  // ── Error banner ──────────────────────────────────────────────────────
  const renderError = () =>
    error && (
      <div className="m-4 px-4 py-3 flex items-center gap-2 text-sm text-red-400 bg-red-900/10 rounded-xl">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <p>{error}</p>
      </div>
    )

  // ── Suggestions popover content ──────────────────────────────────────
  const suggestionsContent = (
    <div className="w-64 p-1">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 px-2 py-1">Suggestions</h4>
      <div className="space-y-1">
        {promptSuggestions.map((suggestion, index) => (
          <button key={index} type="button"
            onClick={() => applyPromptSuggestion(suggestion)}
            className="w-full text-left p-2 text-xs text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors">
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )

  // ── Form ──────────────────────────────────────────────────────────────
  const renderForm = () => (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 flex-1 p-4 justify-between">
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-400">Prompt</span>
            </div>
            <Popover content={suggestionsContent} trigger="click" placement="bottomRight"
              overlayInnerStyle={{ background: '#0b1220', border: '1px solid #27272a' }}>
              <button type="button"
                className="h-7 px-2 rounded-md hover:bg-zinc-800 transition-colors inline-flex items-center justify-center">
                <Wand2 className="w-3.5 h-3.5 text-zinc-400" />
              </button>
            </Popover>
          </div>
          <textarea
            value={settings.prompt}
            onChange={(e) => setSettings({ ...settings, prompt: e.target.value })}
            placeholder={placeholderPrompts[mode]}
            className="w-full min-h-[80px] bg-zinc-800/70 text-sm text-zinc-100 placeholder:text-zinc-500 rounded-xl p-3 border border-zinc-800 focus:outline-none focus:border-zinc-600 resize-y"
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch size="small" checked={advancedMode} onChange={setAdvancedMode} />
          <label className="text-xs text-zinc-400">Advanced Mode</label>
        </div>

        {advancedMode && (
          <div className="space-y-3 p-3 bg-zinc-800/30 rounded-xl border border-zinc-800/60">
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Negative Prompt</label>
              <textarea
                value={settings.negativePrompt}
                onChange={(e) => setSettings({ ...settings, negativePrompt: e.target.value })}
                placeholder="Elements to avoid in generation"
                className="w-full min-h-[60px] bg-zinc-900 text-xs text-zinc-100 placeholder:text-zinc-500 rounded-xl p-3 border border-zinc-800 focus:outline-none focus:border-zinc-600 resize-y"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400">Seed</label>
                <span className="text-xs text-zinc-300">{settings.seed || 0}</span>
              </div>
              <Slider min={0} max={1000000} step={1}
                value={settings.seed || 0}
                onChange={(v) => setSettings({ ...settings, seed: v })} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400">Steps</label>
                <span className="text-xs text-zinc-300">{settings.steps || 30}</span>
              </div>
              <Slider min={10} max={150} step={1}
                value={settings.steps || 30}
                onChange={(v) => setSettings({ ...settings, steps: v })} />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {renderSettings()}

        <button
          type="submit"
          className="w-full h-10 flex items-center justify-center gap-2 bg-gradient-to-r from-fuchsia-500 to-violet-500 hover:from-fuchsia-600 hover:to-violet-600 text-white text-sm font-medium rounded-xl transition-colors">
          <Sparkles className="w-4 h-4" />
          Generate {mode === 'image' ? 'Portrait' : mode === 'video' ? 'Video' : 'Avatar'}
        </button>
        <p className="text-[10px] text-zinc-500 text-center">
          Opens the real {mode === 'image' ? 'Image Studio' : mode === 'video' ? 'AI Video' : 'Cinema'} lane in a new tab.
        </p>
      </div>
    </form>
  )

  // ── Settings panel ────────────────────────────────────────────────────
  const styleOptions = [
    { value: 'professional', label: 'Professional' },
    { value: 'artistic',     label: 'Artistic' },
    { value: 'casual',       label: 'Casual' },
    { value: 'vintage',      label: 'Vintage' },
    ...(mode === 'avatar' ? [{ value: 'cartoon', label: 'Cartoon' }, { value: 'anime', label: 'Anime' }] : []),
    ...(mode === 'video'  ? [{ value: 'cinematic', label: 'Cinematic' }] : []),
  ]

  const bgOptions = [
    { value: 'studio',      label: 'Studio' },
    { value: 'gradient',    label: 'Gradient' },
    { value: 'solid',       label: 'Solid Color' },
    { value: 'transparent', label: 'Transparent' },
    ...(mode !== 'avatar' ? [{ value: 'outdoor', label: 'Outdoor' }, { value: 'office', label: 'Office' }] : []),
  ]

  const lightingOptions = [
    { value: 'soft',     label: 'Soft' },
    { value: 'dramatic', label: 'Dramatic' },
    { value: 'natural',  label: 'Natural' },
    { value: 'studio',   label: 'Studio' },
    ...(mode === 'video' ? [{ value: 'cinematic', label: 'Cinematic' }, { value: 'golden-hour', label: 'Golden Hour' }] : []),
  ]

  const aspectOptions = [
    { value: '1:1',  label: '1:1 Square' },
    { value: '4:5',  label: '4:5 Portrait' },
    { value: '3:4',  label: '3:4 Portrait' },
    { value: '16:9', label: '16:9 Landscape' },
    ...(mode === 'video' ? [{ value: '9:16', label: '9:16 Vertical' }] : []),
  ]

  const poseOptions = [
    { value: 'headshot',  label: 'Headshot' },
    { value: 'half-body', label: 'Half Body' },
    { value: 'full-body', label: 'Full Body' },
    { value: 'profile',   label: 'Profile' },
    ...(mode === 'avatar' ? [{ value: 'bust', label: 'Bust' }] : []),
  ]

  const renderSettings = () => (
    <div className="space-y-3 p-4 rounded-xl bg-zinc-800/40 border border-zinc-800/60">
      <SettingRow icon={<Cpu className="w-4 h-4 text-zinc-400" />} label="AI Model">
        <RowSelect value={settings.aiModel} onChange={(v) => setSettings({ ...settings, aiModel: v })} options={aiModels[mode]} />
      </SettingRow>
      <SettingRow icon={<Monitor className="w-4 h-4 text-zinc-400" />} label="Resolution">
        <RowSelect value={settings.resolution} onChange={(v) => setSettings({ ...settings, resolution: v })} options={resolutions[mode]} />
      </SettingRow>
      <SettingRow icon={<Palette className="w-4 h-4 text-zinc-400" />} label="Style">
        <RowSelect value={settings.style} onChange={(v) => setSettings({ ...settings, style: v })} options={styleOptions} />
      </SettingRow>
      <SettingRow icon={<ImageIcon className="w-4 h-4 text-zinc-400" />} label="Background">
        <RowSelect value={settings.backgroundColor} onChange={(v) => setSettings({ ...settings, backgroundColor: v })} options={bgOptions} />
      </SettingRow>
      <SettingRow icon={<Sun className="w-4 h-4 text-zinc-400" />} label="Lighting">
        <RowSelect value={settings.lighting} onChange={(v) => setSettings({ ...settings, lighting: v })} options={lightingOptions} />
      </SettingRow>
      <SettingRow icon={<AspectRatio className="w-4 h-4 text-zinc-400" />} label="Aspect Ratio">
        <RowSelect value={settings.aspectRatio} onChange={(v) => setSettings({ ...settings, aspectRatio: v })} options={aspectOptions} />
      </SettingRow>
      {mode !== 'video' && (
        <SettingRow icon={<User className="w-4 h-4 text-zinc-400" />} label="Pose">
          <RowSelect value={settings.pose} onChange={(v) => setSettings({ ...settings, pose: v })} options={poseOptions} />
        </SettingRow>
      )}
    </div>
  )

  // ── Preview (currently only reachable if showForm is flipped manually) ─
  const renderPreview = () => (
    <div className="p-4">
      <div className="rounded-xl mb-4 flex items-center justify-center">
        {isLoading ? (
          <div className="w-full max-w-md border-0 bg-transparent flex flex-col items-center gap-4 p-6">
            <div className="relative w-16 h-16">
              <Loader2 className="w-full h-full animate-spin text-fuchsia-500" />
            </div>
            <div className="space-y-1 text-center">
              <p className="text-sm font-medium text-zinc-300">{loadingTexts[mode][currentTextIndex]}</p>
              <p className="text-xs text-zinc-500">
                {mode === 'image' ? 'This usually takes 10-15 seconds'
                  : mode === 'video' ? 'This usually takes 20-30 seconds'
                  : 'This usually takes 30-45 seconds'}
              </p>
            </div>
            <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-fuchsia-500 to-violet-500 transition-all duration-300 ease-linear"
                style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 w-full">
            <div className="relative w-full rounded-xl overflow-hidden bg-zinc-800">
              <img
                src={generatedItems[0]?.url || PLACEHOLDER_IMG}
                alt={`AI generated ${mode}`}
                className={`rounded-xl object-cover w-full h-full ${isRotating ? 'animate-spin-slow' : ''}`}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
              {mode !== 'image' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <button onClick={togglePlay}
                    className="w-12 h-12 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-colors">
                    {isPlaying ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white ml-1" />}
                  </button>
                </div>
              )}
              {mode === 'avatar' && (
                <button onClick={toggleRotate}
                  className="absolute bottom-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-colors">
                  <RotateCw className="w-4 h-4 text-white" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!isLoading && (
        <div className="space-y-4">
          <div className="p-3 space-y-2 bg-zinc-800/40 rounded-xl border border-zinc-800/60">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Quality</span>
              <span className="text-zinc-100">{settings.resolution}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Model</span>
              <span className="text-zinc-100">{settings.aiModel}</span>
            </div>
            {mode === 'video' && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Duration</span>
                <span className="text-zinc-100">00:07</span>
              </div>
            )}
          </div>

          {renderGallery()}

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={handleBackToSettings}
              className="w-full h-9 flex items-center justify-center gap-2 border border-zinc-700 text-zinc-100 text-sm font-medium rounded-xl hover:bg-zinc-800 transition-colors">
              Back to Settings
            </button>
            <button type="button"
              onClick={() => routeToRealLane(mode)}
              className="w-full h-9 flex items-center justify-center gap-2 bg-white hover:bg-zinc-100 text-zinc-900 text-sm font-medium rounded-xl transition-colors">
              Open Real Lane
            </button>
          </div>
        </div>
      )}
    </div>
  )

  // ── Gallery (recent generations) ──────────────────────────────────────
  const renderGallery = () => {
    const items = generatedItems.slice(0, 3)
    if (items.length === 0) return null
    return (
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-zinc-400">Recent Generations</h4>
        <div className="grid grid-cols-4 gap-2">
          {items.map((item) => (
            <div key={item.id} className="relative group aspect-square rounded-lg overflow-hidden bg-zinc-800">
              <img src={item.url || PLACEHOLDER_IMG} alt={item.prompt}
                className="object-cover w-full h-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                <div className="flex items-center gap-1">
                  {item.type === 'image'  && <ImageIcon className="w-3 h-3 text-white" />}
                  {item.type === 'video'  && <Film className="w-3 h-3 text-white" />}
                  {item.type === 'avatar' && <Cube className="w-3 h-3 text-white" />}
                  <span className="text-[10px] text-white truncate">
                    {new Date(item.timestamp).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── History view ──────────────────────────────────────────────────────
  const renderHistory = () => (
    <div className="flex flex-col h-full p-4 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={handleBackToSettings}
          className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
        </button>
        <h3 className="text-sm font-medium text-zinc-100">Generation History</h3>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Search by prompt..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Clock className="w-8 h-8 text-zinc-500 mb-2" />
            <p className="text-sm text-zinc-400">No generations found</p>
            {searchQuery && <p className="text-xs text-zinc-500 mt-1">Try a different search term</p>}
          </div>
        ) : (
          filteredItems.map((item) => (
            <button type="button" key={item.id}
              onClick={() => handleSelectHistoryItem(item.id)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800 cursor-pointer transition-colors text-left">
              <div className="relative w-12 h-12 rounded-md overflow-hidden flex-shrink-0 bg-zinc-700">
                <img src={item.url || PLACEHOLDER_IMG} alt={item.prompt}
                  className="object-cover w-full h-full" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-100 truncate">{item.prompt}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[10px] text-zinc-500">{formatDate(item.timestamp)}</span>
                  <span className="text-[10px] text-zinc-600">·</span>
                  <span className="text-[10px] text-zinc-500 capitalize">{item.type}</span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="group relative overflow-hidden w-full max-w-3xl mx-auto bg-zinc-900/85 backdrop-blur border border-zinc-800 rounded-2xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.35)] min-h-[600px] flex flex-col justify-between gap-2">
      {renderHeader()}
      {renderTabs()}
      <div className="flex-1 overflow-hidden flex flex-col">
        {renderError()}
        {showHistory ? renderHistory() : showForm ? renderForm() : renderPreview()}
      </div>
    </div>
  )
}

// Small horizontal row used inside the settings panel — label on the left,
// arbitrary control (usually a RowSelect) on the right.
function SettingRow({ icon, label, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-zinc-400">{label}</span>
      </div>
      {children}
    </div>
  )
}

export default AIMultiModalGenDemo
