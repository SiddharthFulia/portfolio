import { useState, useEffect, useRef } from 'react'
import { Modal, Upload, Tabs, Input, Select, Switch, message as antMessage } from 'antd'
import {
  UploadOutlined, ExpandAltOutlined, DownloadOutlined,
  CheckOutlined, ReloadOutlined, ThunderboltOutlined,
  AppstoreOutlined, CloudOutlined, DesktopOutlined, DeleteOutlined,
  LockOutlined,
} from '@ant-design/icons'
import {
  enhanceImage, getImageStatus, listEnhancedImages, deleteEnhancedImage, fileToDataUrl,
} from '../api/ai'
import VaultGate, { getVaultToken } from '../components/VaultGate'

// localStorage key — persists the in-flight enhancement across refreshes
const INFLIGHT_KEY = 'sid-imgenh-inflight'

// Color a log line by its leading glyph — same scheme as the video-lane feed
const logTone = (text) => {
  if (!text) return 'text-gray-400'
  if (text.startsWith('✗')) return 'text-rose-400'
  if (text.startsWith('🖼')) return 'text-emerald-300'
  if (text.startsWith('✓')) return 'text-emerald-400/80'
  if (text.startsWith('⚡')) return 'text-amber-300'
  if (text.startsWith('→') || text.startsWith('↑')) return 'text-fuchsia-300'
  return 'text-gray-400'
}

const fmtLogTs = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

// Detects when Gemini refused for content/identity reasons. The BE error
// string includes the finishReason or blockReason from the API response
// (added in our diagnostic-error patch). When this matches, we show a
// friendlier UI with a "Try on Local 5090" button instead of a raw error.
const CLOUD_REFUSAL_RE = /IMAGE_OTHER|IMAGE_SAFETY|^SAFETY$|=SAFETY|RECITATION|blockReason|PROHIBITED|finishReason=SAFETY/i
const isCloudRefusal = (msg) => !!msg && CLOUD_REFUSAL_RE.test(msg)

// Map a preset to a workflow `type` for the BE. Cloud engine uses prompts
// directly; type is informational on cloud but maps to a workflow on Atelier.
const PRESET_TYPE = {
  'sharpen-deblur':        'fast',
  'cinematic-upscale':     'quality',
  'sony-a1-portrait':      'quality',
  '4k-detail-recovery':    'quality',
  'studio-cinematic-light': 'cinematic',
  'hong-kong-night':       'cinematic',
}

// Pre-made prompt templates — grouped by use-case. Each one drops into the
// Atelier prompt textarea on selection; the user can still freely edit.
// Add as many as you want — the dropdown auto-renders all of them.
const PROMPT_TEMPLATES = [
  { group: 'Polish & Restore', id: 'sharpen-face',     label: '🪞 Sharpen face',       text: 'sharpen the face, recover skin texture, defined eyes and lashes, natural pores, photorealistic detail. preserve identity.' },
  { group: 'Polish & Restore', id: 'remove-blur',      label: '⚡ Remove blur',         text: 'remove motion blur and softness, restore sharp edges, recover fine detail, keep colors and composition unchanged.' },
  { group: 'Polish & Restore', id: 'denoise-clean',    label: '✨ Denoise / clean',     text: 'remove noise, jpeg artifacts, and grain. clean up the image without losing detail. natural skin tone, no plastic look.' },
  { group: 'Polish & Restore', id: 'detail-recovery',  label: '🔍 4K detail recovery',  text: 'recover micro-detail at 4K resolution, sharp eyes, individually defined hair strands, fabric weave, natural skin pores. zero stylization.' },

  { group: 'Look & Lighting',  id: 'cinematic',        label: '🎬 Cinematic',           text: 'cinematic lighting, balanced studio quality, expanded dynamic range, soft directional light, warm highlights, cool shadows, film-grade color.' },
  { group: 'Look & Lighting',  id: 'sony-a1',          label: '📷 Sony A1 portrait',    text: 'shot on Sony A1, 85mm f/1.4 lens, ISO 100, cinematic shallow depth of field, perfect facial focus, editorial color profile.' },
  { group: 'Look & Lighting',  id: 'magazine-cover',   label: '📰 Magazine cover',      text: 'magazine editorial portrait, premium clarity, soft beauty light, glossy finish, fashion magazine grade, cover-ready.' },
  { group: 'Look & Lighting',  id: 'hong-kong-night',  label: '🌙 Hong Kong night',     text: 'wong kar-wai 1990s hong kong cinema, deep emerald and crimson tones, neon reflections, soft bloom, film grain, moody atmosphere.' },
  { group: 'Look & Lighting',  id: 'bw-film',          label: '🖤 B&W film',            text: 'black and white classic film, deep blacks, creamy mid-tones, film grain, ilford hp5 look, timeless portrait.' },

  { group: 'Text → Image',     id: 't2i-portrait',     label: '👤 Portrait (t2i)',      text: 'cinematic photo-realistic portrait of a person, soft window light, shallow depth of field, 85mm lens, neutral background, editorial style.' },
  { group: 'Text → Image',     id: 't2i-landscape',    label: '🏞️ Landscape (t2i)',     text: 'wide cinematic landscape, golden hour, dramatic clouds, ultra-detailed terrain, photo-realistic, 35mm anamorphic.' },
  { group: 'Text → Image',     id: 't2i-product',      label: '📦 Product shot (t2i)',  text: 'studio product photograph on white seamless background, three-point softbox lighting, ultra-sharp detail, commercial advertisement quality.' },

  { group: 'Edit (Flux Kontext)', id: 'edit-color',     label: '🎨 Recolor element',    text: 'change the [object] to [color]. keep everything else exactly the same — pose, identity, background, lighting unchanged.' },
  { group: 'Edit (Flux Kontext)', id: 'edit-bg-remove', label: '✂️ Remove background',  text: 'replace the background with a clean neutral grey studio backdrop. keep the subject identical — same pose, same lighting on subject.' },
  { group: 'Edit (Flux Kontext)', id: 'edit-attire',    label: '👔 Change outfit',      text: 'change the outfit to a [describe]. preserve face, pose, body shape, and background. only change the clothing.' },
]

// Group templates by their `group` field for the Antd Select grouped dropdown
function groupedTemplates() {
  const groups = {}
  for (const t of PROMPT_TEMPLATES) {
    if (!groups[t.group]) groups[t.group] = []
    groups[t.group].push(t)
  }
  return Object.entries(groups).map(([label, options]) => ({
    label,
    options: options.map(t => ({ value: t.id, label: t.label, _text: t.text })),
  }))
}

// Atelier workflow catalog. Each entry knows what inputs it needs (image /
// prompt / fine-tunes), what model file ComfyUI will load, and reasonable
// defaults. The FE shows/hides the right input fields based on `family`.
const ATELIER_WORKFLOWS = [
  // ─── Upscalers — pure GAN, no diffusion. Fast, no prompt, no safety filter.
  {
    id: 'realesrgan-x4', family: 'upscale', label: 'Real-ESRGAN x4',
    blurb: 'General 4× upscale. Default for anything.',
    model: 'RealESRGAN_x4.pth', needsImage: true, needsPrompt: false,
    eta: '~10s', icon: '⚡',
  },
  {
    id: 'ultrasharp-x4', family: 'upscale', label: '4x-UltraSharp',
    blurb: 'Sharper edges. Best for portraits + product shots.',
    model: '4x-UltraSharp.pth', needsImage: true, needsPrompt: false,
    eta: '~12s', icon: '🔪',
  },
  {
    id: 'nmkd-siax', family: 'upscale', label: 'NMKD-Siax',
    blurb: 'Tuned for face/skin texture recovery.',
    model: '4x_NMKD-Siax_200k.pth', needsImage: true, needsPrompt: false,
    eta: '~12s', icon: '👤',
  },
  // ─── Img2img polish — diffusion with low denoise, identity-preserving
  {
    id: 'sdxl-polish', family: 'img2img', label: 'SDXL Polish',
    blurb: 'Photo-real polish with prompt steering. Low denoise keeps identity.',
    checkpoint: 'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors',
    needsImage: true, needsPrompt: true,
    defaults: { steps: 20, denoise: 0.20, cfg: 5.0 },
    eta: '~30s', icon: '🎨',
  },
  // ─── Text to image — no source needed
  {
    id: 'sdxl-t2i', family: 't2i', label: 'Text → Image (SDXL)',
    blurb: 'Generate from prompt only. JuggernautXL photo-realistic.',
    checkpoint: 'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors',
    needsImage: false, needsPrompt: true,
    defaults: { steps: 25, cfg: 5.0, width: 1024, height: 1024 },
    eta: '~30s', icon: '✨',
  },
  // ─── Flux Kontext — prompt edit
  {
    id: 'flux-kontext-edit', family: 'edit', label: 'Flux Kontext (edit)',
    blurb: 'Edit image with text instruction. Identity preserved natively.',
    checkpoint: 'flux1-dev-kontext_fp8_scaled.safetensors',
    needsImage: true, needsPrompt: true,
    defaults: { steps: 20, cfg: 2.5 },
    eta: '~45s', icon: '🪄',
  },
  // ─── Custom — bring your own checkpoint, full control on every knob
  {
    id: 'custom-sdxl', family: 'img2img', label: 'Custom (img2img)',
    blurb: 'Bring any SDXL checkpoint. Full freedom on prompt, denoise, CFG, steps.',
    checkpoint: 'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors',
    needsImage: true, needsPrompt: true,
    defaults: { steps: 22, denoise: 0.40, cfg: 6.0 },
    eta: '~30s', icon: '🛠️',
  },
  {
    id: 'custom-t2i', family: 't2i', label: 'Custom (text→image)',
    blurb: 'Bring any SDXL checkpoint. Pure prompt-driven generation.',
    checkpoint: 'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors',
    needsImage: false, needsPrompt: true,
    defaults: { steps: 28, cfg: 6.0, width: 1024, height: 1024 },
    eta: '~30s', icon: '🛠️',
  },
]

// ─── Preset prompts ─────────────────────────────────────────────
// Each card on the page is one of these. The full text (the actual prompt
// sent to Gemini) shows up in the Modal when the user clicks Expand.
// Tone/accent drives the gradient colour on the card and modal header.
const PRESETS = [
  {
    id: 'sharpen-deblur',
    name: 'Sharpen & Deblur',
    short: 'Removes motion blur and softness. Best for blurry faces and details.',
    accent: 'from-emerald-400 to-cyan-500',
    border: 'border-emerald-400/40',
    glow: 'shadow-emerald-400/20',
    icon: '⚡',
    // Worded as a generic "fix blur" task — avoids identity-preservation
    // trigger words that make Gemini refuse with IMAGE_OTHER.
    prompt: `Sharpen and deblur this photo. Remove motion blur, focus blur, and softness. Improve clarity, edges, and fine details. Keep the same colors, composition, and scene. Do not stylize or change the look — just make it sharper and clearer.`,
  },
  {
    id: 'cinematic-upscale',
    name: 'Cinematic Upscale',
    short: 'Pristine ultra-HD cinematic version. Identity, pose, environment unchanged.',
    accent: 'from-cyan-400 via-sky-400 to-blue-500',
    border: 'border-cyan-400/40',
    glow: 'shadow-cyan-400/20',
    icon: '🎬',
    prompt: `Upgrade the uploaded image into a pristine, ultra-high-definition cinematic version while preserving the subject with absolute fidelity. The person's identity, facial anatomy, expression, body posture, clothing, accessories, environment, framing, and overall composition must remain completely unchanged. Do not modify, reinterpret, replace, or introduce any new visual elements. Reconstruct and refine micro-level details including precise facial contours, authentic skin texture with naturally visible pores, individually defined hair strands, sharp and lifelike eyes, and clean, well-resolved edges throughout the image. Enhance dynamic range, contrast, and dimensional depth using balanced, studio-quality cinematic lighting.`,
  },
  {
    id: 'sony-a1-portrait',
    name: 'Sony A1 Editorial',
    short: 'Re-renders as if shot on a Sony A1 + 85mm f/1.4. Background untouched.',
    accent: 'from-amber-400 via-rose-400 to-fuchsia-500',
    border: 'border-amber-400/40',
    glow: 'shadow-amber-400/20',
    icon: '📷',
    prompt: `Enhance the portrait while strictly preserving the subject's identity with accurate facial geometry. Do not change their expression or face shape. Only allow subtle feature cleanup without altering who they are. Keep the exact same background from the reference image. No replacements, no changes, no new objects, no layout shifts. The environment must look identical. The image must be recreated as if it was shot on a Sony A1, using an 85mm f1.4 lens, at f1.6, ISO 100, 1/200 shutter speed, cinematic shallow depth of field, perfect facial focus, and an editorial-neutral color profile. This Sony A1 + 85mm f1.4 setup is mandatory. The final image must clearly look like premium full-frame Sony A1 quality.
Lighting must match the exact direction, angle, and mood of the reference photo. Upgrade the lighting into a cinematic, subject-focused style: soft directional light, warm highlights, cool shadows, deeper contrast, expanded dynamic range, micro-contrast boost, smooth gradations, and zero harsh shadows.
Maintain neutral premium color tone, cinematic contrast curve, natural saturation, real skin texture (not plastic), and subtle film grain. No fake glow, no runway lighting, no over smoothing. Render in 4K resolution, 10-bit color, cinematic editorial style, premium clarity, portrait crop, and keep the original environmental vibe untouched.
Re-render the subject with improved realism, depth, texture, and lighting while keeping identity and background fully preserved.
NEGATIVE INSTRUCTIONS:
No new background.
No background change.
No overly dramatic lighting.
No face morphing.
No fake glow.
No flat lighting.
No over-smooth skin.`,
  },
  {
    id: '4k-detail-recovery',
    name: '4K Detail Recovery',
    short: 'Recovers pores, hair, fabric weave at true-to-life realism. Zero stylization.',
    accent: 'from-emerald-400 via-teal-400 to-cyan-500',
    border: 'border-emerald-400/40',
    glow: 'shadow-emerald-400/20',
    icon: '🔍',
    prompt: `Ultra-high-resolution 4K enhancement based strictly on the provided reference image. Absolute fidelity to original facial anatomy, proportions, and identity. Preserve expression, gaze, pose, camera angle, framing, and perspective with zero deviation. Clothing, hair, skin, and background elements must remain unchanged in structure, placement, and design.
Recover fine-grain detail with natural realism. Enhance pores, fine lines, hair strands, eyelashes, fabric weave, seams, and material edges without introducing stylization. Maintain original color science, white balance, and tonal relationships exactly as captured. Lighting direction, intensity, contrast, and shadow behavior must match the source image precisely, with only improved clarity and expanded dynamic range. No relighting, no reshaping. Remove any grain. Apply controlled sharpening and high-frequency detail reconstruction. Remove compression artifacts and noise while retaining authentic texture. No smoothing, no plastic skin, no artificial gloss. Facial features must remain consistent across the entire image with coherent anatomy and clean, stable edges.
Negative constraints: no warping, no facial drift, no added or missing anatomy, no altered hands, no distortions, no perspective shift, no text or graphics, no hallucinated detail, no stylized rendering. Output must read as a true-to-life, photorealistic upscale that matches the reference exactly, only clearer, sharper, and higher resolution.`,
  },
  {
    id: 'studio-cinematic-light',
    name: 'Studio Cinematic Light',
    short: 'Same composition. Adds balanced studio-quality cinematic lighting.',
    accent: 'from-purple-400 via-pink-400 to-rose-500',
    border: 'border-purple-400/40',
    glow: 'shadow-purple-400/20',
    icon: '💡',
    prompt: `Upgrade the uploaded image into a pristine, ultra-high-definition cinematic version while preserving the subject with absolute fidelity. The person's identity, facial anatomy, expression, body posture, clothing, accessories, environment, framing, and overall composition must remain completely unchanged. Do not modify, reinterpret, replace, or introduce any new visual elements. Reconstruct and refine micro-level details including precise facial contours, authentic skin texture with naturally visible pores, individually defined hair strands, sharp and lifelike eyes, and clean, well-resolved edges throughout the image. Enhance dynamic range, contrast, and dimensional depth using balanced, studio-quality cinematic lighting.`,
  },
  {
    id: 'hong-kong-night',
    name: 'Hong Kong Night Cinema',
    short: 'Wong Kar-wai 1990s neon film aesthetic. Subject + composition unchanged.',
    accent: 'from-rose-500 via-fuchsia-500 to-indigo-500',
    border: 'border-rose-400/40',
    glow: 'shadow-rose-400/20',
    icon: '🌙',
    prompt: `Apply a Hong Kong movie aesthetic to the user uploaded image. Keep the subject exactly the same, unchanged identity, pose, proportions, and outfit. Add a cinematic Hong Kong film look inspired by 1990s Wong Kar-wai and modern HK street cinema: deep emerald and crimson color tones, strong neon reflections, lights, high contrast shadows, soft bloom around lights, slight motion blur on background edges, rich film grain, and subtle chromatic aberration. Lighting becomes moody and atmospheric with cool teal ambient mixed with warm-yellow practical lights. Keep composition and background structure the same but stylize it with the HK-film palette and texture. Add gentle haze, vignette, and a nostalgic melancholy mood. Ultra high resolution, cinematic, realistic.`,
  },
]

// ─── Page ───────────────────────────────────────────────────────
export default function ImageEnhancer() {
  const [sourceFile, setSourceFile] = useState(null)
  const [sourceDataUrl, setSourceDataUrl] = useState('')
  const [selectedPreset, setSelectedPreset] = useState(PRESETS[0].id)
  const [expandedPreset, setExpandedPreset] = useState(null)
  const [engine, setEngine] = useState('cloud')          // cloud (Gemini) | atelier (5090)
  // Atelier-only state: which workflow + fine-tune knobs
  const [atelierWorkflow, setAtelierWorkflow] = useState(ATELIER_WORKFLOWS[0].id)
  const [tunings, setTunings] = useState({ steps: 20, denoise: 0.2, cfg: 5.0, width: 1024, height: 1024 })
  const [atelierPrompt, setAtelierPrompt] = useState('')
  const [customModel, setCustomModel] = useState('')   // optional checkpoint override
  // Vault login state: small lock button in the header opens an Antd modal
  // with a password field. Once logged in, all outputs auto-route to the
  // private Vault library AND the NSFW filter is bypassed server-side.
  const [vaultLoginOpen, setVaultLoginOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(!!getVaultToken())
  // NSFW rejection — BE returns 401 NSFW_BLOCKED; FE pops a friendly toast
  // and opens the login modal so user can unlock + retry.
  const [nsfwBlocked, setNsfwBlocked] = useState(null)
  const [logsModalOpen, setLogsModalOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [job, setJob] = useState(null)                    // active or last-finished SQLite row
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const pollTimer = useRef(null)

  useEffect(() => { document.title = 'Image Studio · Sid' }, [])

  // When the user picks a different Atelier workflow, hydrate its defaults
  // into the tuning sliders. They can still tweak afterwards.
  useEffect(() => {
    const wf = ATELIER_WORKFLOWS.find(w => w.id === atelierWorkflow)
    if (wf?.defaults) setTunings(t => ({ ...t, ...wf.defaults }))
  }, [atelierWorkflow])

  // Resume an in-flight job after a page refresh
  useEffect(() => {
    let inflight
    try { inflight = localStorage.getItem(INFLIGHT_KEY) } catch {}
    if (!inflight) return
    getImageStatus(inflight).then(({ data }) => {
      if (!data) { try { localStorage.removeItem(INFLIGHT_KEY) } catch {}; return }
      if (['completed', 'failed'].includes(data.status)) {
        try { localStorage.removeItem(INFLIGHT_KEY) } catch {}
        setJob(data)
        if (data.status === 'failed') setError(data.error || 'Enhancement failed')
      } else {
        setJob(data); setWorking(true); startPolling(inflight)
      }
    })
    return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
  }, [])

  const startPolling = (imageId) => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    let attempts = 0
    pollTimer.current = setInterval(async () => {
      attempts += 1
      const { data, error: err } = await getImageStatus(imageId)
      if (err) {
        if (attempts > 5) { clearInterval(pollTimer.current); pollTimer.current = null; setWorking(false); setError(err) }
        return
      }
      if (!data) return
      setJob(data)
      if (data.status === 'completed') {
        clearInterval(pollTimer.current); pollTimer.current = null
        try { localStorage.removeItem(INFLIGHT_KEY) } catch {}
        setWorking(false)
        setRefreshKey(k => k + 1)   // reload Library tab
      } else if (data.status === 'failed') {
        clearInterval(pollTimer.current); pollTimer.current = null
        try { localStorage.removeItem(INFLIGHT_KEY) } catch {}
        setWorking(false); setError(data.error || 'Enhancement failed')
      }
      if (attempts > 200) {
        clearInterval(pollTimer.current); pollTimer.current = null
        setWorking(false); setError('Timed out waiting for enhancement')
      }
    }, 1500)
  }

  const handleFile = async (file) => {
    setError(null); setJob(null)
    if (!file?.type?.startsWith('image/')) { antMessage.error('Pick an image file'); return false }
    if (file.size > 8 * 1024 * 1024)        { antMessage.error('Image too large (max 8 MB)'); return false }
    setSourceFile(file)
    try {
      const dataUrl = await fileToDataUrl(file)
      setSourceDataUrl(dataUrl)
    } catch {
      antMessage.error('Could not read the image')
    }
    return false
  }

  const enhance = async (engineOverride) => {
    const useEngine = engineOverride || engine
    const isAtelier = useEngine === 'atelier' || useEngine === 'local'
    if (engineOverride && engineOverride !== engine) setEngine(engineOverride)

    // Build the request body based on engine + workflow
    let body
    if (isAtelier) {
      const wf = ATELIER_WORKFLOWS.find(w => w.id === atelierWorkflow) || ATELIER_WORKFLOWS[0]
      if (wf.needsImage && !sourceDataUrl) { setError('Upload an image first.'); return }
      if (wf.needsPrompt && !atelierPrompt.trim()) { setError('Add a prompt for this workflow.'); return }
      body = {
        engine: 'atelier',
        workflow: wf.id,
        type: wf.family,
        prompt: atelierPrompt.trim() || wf.label,
        ...(sourceDataUrl ? { dataUrl: sourceDataUrl } : {}),
        ...(customModel.trim() ? { model: customModel.trim() } : {}),
        // Fine-tunes — BE only persists the relevant ones for the workflow's family
        steps: tunings.steps, denoise: tunings.denoise, cfg: tunings.cfg,
        width: tunings.width, height: tunings.height,
      }
    } else {
      const preset = PRESETS.find(p => p.id === selectedPreset)
      if (!preset) return
      if (!sourceDataUrl) { setError('Upload an image first.'); return }
      body = {
        engine: 'cloud',
        dataUrl: sourceDataUrl,
        prompt: preset.prompt,
        presetId: preset.id,
        type: PRESET_TYPE[preset.id] || 'fast',
      }
    }

    setError(null); setJob(null); setNsfwBlocked(null); setWorking(true)
    const { data, error: err } = await enhanceImage(body)
    if (err) {
      setWorking(false)
      // BE returns a `Looks NSFW —` message when the filter caught it.
      if (/NSFW|Looks NSFW/i.test(err)) {
        setNsfwBlocked(err)
        setVaultLoginOpen(true)
      } else {
        setError(err)
      }
      return
    }
    setJob(data)
    try { localStorage.setItem(INFLIGHT_KEY, data.imageId) } catch {}
    startPolling(data.imageId)
  }

  const reset = () => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = null
    try { localStorage.removeItem(INFLIGHT_KEY) } catch {}
    setSourceFile(null); setSourceDataUrl('')
    setJob(null); setError(null); setWorking(false)
  }

  const downloadResult = () => {
    if (!job?.outputUrl) return
    const a = document.createElement('a')
    a.href = job.outputUrl
    a.download = `enhanced-${job.presetId || job.imageId}-${Date.now()}.png`
    a.target = '_blank'; a.rel = 'noopener'
    a.click()
  }

  const expanded = expandedPreset ? PRESETS.find(p => p.id === expandedPreset) : null
  const activePreset = PRESETS.find(p => p.id === selectedPreset)
  const resultUrl = job?.outputUrl
  const status = job?.status

  return (
    <div className="min-h-screen bg-black text-gray-100 pt-20 pb-16 px-3 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-center gap-2">
              <ThunderboltOutlined className="text-amber-400 text-xl" />
              <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
                Image Studio
              </h1>
              {/* Tiny vault lock — toggles login state. Logged-in users
                  bypass the NSFW filter and their outputs land in Vault. */}
              <button onClick={() => setVaultLoginOpen(true)} type="button"
                title={isLoggedIn ? 'Vault unlocked — outputs go to Vault library' : 'Lock — click to unlock vault'}
                className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all ${
                  isLoggedIn
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/30'
                    : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:border-cyan-400/50 hover:text-cyan-300'
                }`}>
                <LockOutlined className="text-sm" />
              </button>
            </div>
            {/* Engine toggle — Cloud (Gemini, fast) vs Local (5090, free) */}
            <div className="flex items-center gap-1 p-1 rounded-full bg-gray-900/60 border border-gray-800">
              {[
                { id: 'cloud',   label: 'Cloud',   icon: <CloudOutlined />,   sub: 'Gemini · 10-15s' },
                { id: 'atelier', label: 'Atelier', icon: <DesktopOutlined />, sub: '5090 · free · 6 workflows' },
              ].map(opt => (
                <button key={opt.id} onClick={() => setEngine(opt.id)}
                  disabled={working}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs transition-all ${
                    engine === opt.id
                      ? 'bg-gradient-to-r from-cyan-500/30 to-fuchsia-500/30 text-white border border-cyan-400/40'
                      : 'text-gray-400 hover:text-gray-200'
                  } ${working ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {opt.icon}
                  <span className="font-semibold">{opt.label}</span>
                  <span className="hidden sm:inline text-[9px] opacity-60">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-gray-400 max-w-2xl">
            Polish photos with cinematic prompts. Pick a preset below, click{' '}
            <span className="text-cyan-300">Expand</span> to read the full prompt,
            upload an image, and hit <span className="text-amber-300">Enhance</span>.
            Cloud uses Gemini 2.5 Flash Image. Local uses the 5090 + ComfyUI.
          </p>
        </header>

        <Tabs
          defaultActiveKey="generate"
          size="large"
          items={[
            {
              key: 'generate',
              label: <span><ThunderboltOutlined /> Generate</span>,
              children: (
                <GenerateSection
                  sourceDataUrl={sourceDataUrl} reset={reset} handleFile={handleFile}
                  resultUrl={resultUrl} status={status} working={working} engine={engine}
                  job={job} activePreset={activePreset} downloadResult={downloadResult}
                  error={error}
                  selectedPreset={selectedPreset} setSelectedPreset={setSelectedPreset}
                  setExpandedPreset={setExpandedPreset} enhance={enhance}
                  atelierWorkflow={atelierWorkflow} setAtelierWorkflow={setAtelierWorkflow}
                  tunings={tunings} setTunings={setTunings}
                  atelierPrompt={atelierPrompt} setAtelierPrompt={setAtelierPrompt}
                  customModel={customModel} setCustomModel={setCustomModel}
                />
              ),
            },
            {
              key: 'library',
              label: <span><AppstoreOutlined /> Library</span>,
              children: <ImageLibrary refreshKey={refreshKey} />,
            },
          ]}
        />

        {/* Modal stays at root so it overlays both tabs */}
        <ImageEnhancerModal expanded={expanded}
          setExpandedPreset={setExpandedPreset} setSelectedPreset={setSelectedPreset} />

        {/* Full live-log viewer for the current job */}
        <ImageLogModal open={logsModalOpen} onClose={() => setLogsModalOpen(false)} job={job} />

        {/* Vault unlock modal — small password entry. Either opened by the
            lock button in the header or auto-triggered when the BE returns
            401 NSFW_BLOCKED on a prompt. */}
        <Modal open={vaultLoginOpen}
          onCancel={() => { setVaultLoginOpen(false); setNsfwBlocked(null); setIsLoggedIn(!!getVaultToken()) }}
          footer={null} closeIcon={null} centered width={460}
          styles={{
            content: { background: 'transparent', padding: 0, boxShadow: 'none' },
            body: { padding: 0 },
            mask: { backdropFilter: 'blur(6px)' },
          }}>
          {nsfwBlocked && (
            <div className="mb-3 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-center">
              <p className="text-amber-300 text-xs font-semibold">🛡️ Prompt looks NSFW</p>
              <p className="text-gray-300 text-[11px] mt-0.5">
                Public users can't generate this. Unlock with the password to bypass.
              </p>
            </div>
          )}
          <VaultGate label="Unlock vault">
            <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-gray-900/90 to-gray-950/80 p-6 text-center">
              <p className="text-emerald-300 text-sm font-semibold">✓ Vault unlocked</p>
              <p className="text-gray-400 text-xs mt-1">
                Outputs now go to the 🔒 Vault library, NSFW filter bypassed.
              </p>
              <button onClick={() => { setVaultLoginOpen(false); setNsfwBlocked(null); setIsLoggedIn(true) }}
                className="mt-3 px-4 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold">
                OK
              </button>
            </div>
          </VaultGate>
        </Modal>
      </div>
    </div>
  )
}

// ─── Generator section (extracted so the Tabs structure stays clean) ──
// Compact slider+number input — used for steps / denoise / cfg / w / h
function Tuner({ label, value, min, max, step, onChange, fmt }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
        <span className="text-xs font-mono text-cyan-300">{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-cyan-400" />
    </label>
  )
}

function GenerateSection({
  sourceDataUrl, reset, handleFile, resultUrl, status, working, engine, job,
  activePreset, downloadResult, error, selectedPreset, setSelectedPreset,
  setExpandedPreset, enhance,
  atelierWorkflow, setAtelierWorkflow, tunings, setTunings,
  atelierPrompt, setAtelierPrompt, customModel, setCustomModel,
}) {
  const isAtelier = engine === 'atelier' || engine === 'local'
  const wf = ATELIER_WORKFLOWS.find(w => w.id === atelierWorkflow) || ATELIER_WORKFLOWS[0]
  const showSteps = wf.defaults?.steps != null
  const showDenoise = wf.defaults?.denoise != null
  const showCfg = wf.defaults?.cfg != null
  const showWH = wf.family === 't2i'
  // Show custom-model input for workflows that load a checkpoint (sdxl + flux).
  // Pure upscalers use a fixed .pth and don't accept overrides.
  const showCustomModel = ['img2img', 't2i', 'edit'].includes(wf.family)
  const defaultModel = wf.checkpoint || 'workflow default'
  return (
    <>
      <section className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="rounded-2xl border-2 border-dashed border-gray-800 hover:border-cyan-500/40 transition-colors p-4 bg-gray-900/40">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Source image</p>
            {sourceDataUrl ? (
              <div className="relative">
                <img src={sourceDataUrl} alt="source" className="w-full max-h-72 object-contain rounded-lg" />
                <button onClick={reset}
                  className="absolute top-2 right-2 px-2 py-1 text-[10px] rounded-full bg-black/70 hover:bg-rose-600 text-white border border-white/10">
                  ✕ Replace
                </button>
              </div>
            ) : (
              <Upload.Dragger
                multiple={false}
                showUploadList={false}
                accept="image/*"
                beforeUpload={handleFile}
                style={{ background: 'transparent', borderColor: 'transparent', padding: '20px 0' }}>
                <UploadOutlined className="text-3xl text-cyan-400 mb-2" />
                <p className="text-sm text-gray-300">Drop image or click to upload</p>
                <p className="text-[10px] text-gray-500 mt-1">JPG / PNG / WEBP · max 8 MB</p>
              </Upload.Dragger>
            )}
          </div>

          <div className="rounded-2xl border border-gray-800 p-4 bg-gray-900/40 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Enhanced output</p>
              {status && status !== 'completed' && (
                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  status === 'queued'     ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : status === 'processing' ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                }`}>{status}</span>
              )}
            </div>
            {resultUrl ? (
              <>
                <img src={resultUrl} alt="enhanced" className="w-full max-h-72 object-contain rounded-lg" />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-gray-500">
                    {activePreset?.name} · {job?.engine === 'cloud' ? 'Gemini' : '5090 local'}
                  </span>
                  <button onClick={downloadResult}
                    className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-colors">
                    <DownloadOutlined /> Download
                  </button>
                </div>
              </>
            ) : working ? (
              <div className="flex-1 flex flex-col gap-2 py-4">
                <div className="flex items-center gap-3 px-2">
                  <div className="w-8 h-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-200 font-semibold">
                      {status === 'queued' ? 'Queued — waiting for worker'
                        : status === 'processing' ? 'Enhancing…'
                        : 'Enhancing…'}
                    </p>
                    {job?.imageId && <p className="text-[9px] text-gray-700 font-mono break-all">{job.imageId}</p>}
                  </div>
                </div>
                {/* Live log feed — Atelier path streams entries via /image-progress.
                    Click the panel or the Expand button to open the full-history modal. */}
                {Array.isArray(job?.logs) && job.logs.length > 0 && (
                  <div className="mt-1">
                    <div className="flex items-center justify-between mb-1 px-1">
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        live · {job.logs.length} {job.logs.length === 1 ? 'event' : 'events'}
                      </span>
                      <button type="button" onClick={() => setLogsModalOpen(true)}
                        className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-cyan-500/40 hover:border-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 transition-colors">
                        <ExpandAltOutlined className="text-[9px]" /> Expand
                      </button>
                    </div>
                    <button type="button" onClick={() => setLogsModalOpen(true)}
                      className="block w-full text-left rounded-lg bg-black/40 border border-gray-800/60 hover:border-cyan-500/40 transition-colors overflow-hidden">
                      <div className="max-h-40 sm:max-h-48 overflow-y-auto p-2">
                        <ul className="space-y-0.5">
                          {job.logs.slice(-12).map((entry, i) => (
                            <li key={`${entry?.ts || i}-${i}`}
                                className={`text-[10px] sm:text-[11px] font-mono leading-snug break-all ${logTone(entry?.msg || '')}`}>
                              {entry?.msg || ''}
                            </li>
                          ))}
                        </ul>
                        {job.logs.length > 12 && (
                          <p className="text-[9px] text-gray-500 mt-1 text-center">
                            + {job.logs.length - 12} earlier — click to see all
                          </p>
                        )}
                      </div>
                    </button>
                  </div>
                )}
              </div>
            ) : error ? (
              isCloudRefusal(error) ? (
                // Friendly refusal UI — Gemini blocks identity-sensitive content.
                // The local 5090 engine has no safety filter and handles these fine.
                <div className="flex-1 flex flex-col items-center justify-center gap-3 py-6 px-3 text-center">
                  <div className="text-3xl">🛡️</div>
                  <div>
                    <p className="text-amber-300 text-sm font-semibold mb-1">
                      Gemini declined this one
                    </p>
                    <p className="text-gray-400 text-xs leading-relaxed max-w-[28ch] mx-auto">
                      Cloud has safety filters around faces and identity-sensitive
                      content. Switch to <span className="text-cyan-300 font-semibold">Local 5090</span> —
                      no filters, runs free on the GPU, ~30 sec.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => enhance('local')}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-amber-400 text-black font-semibold hover:scale-[1.03] transition-transform">
                      <DesktopOutlined /> Try on 5090
                    </button>
                    <button onClick={() => enhance()}
                      title="Retry on Cloud"
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700">
                      <ReloadOutlined />
                    </button>
                  </div>
                  <p className="text-[9px] text-gray-600 font-mono pt-1 break-all">{error}</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <p className="text-rose-400 text-sm font-mono">✗ {error}</p>
                  <button onClick={() => enhance()}
                    className="text-xs px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">
                    <ReloadOutlined /> Retry
                  </button>
                </div>
              )
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-gray-600">
                Result will appear here
              </div>
            )}
          </div>
        </section>

        {/* ─── Workflow / Preset selector ─── */}
        {isAtelier ? (
          // Atelier mode: workflow dropdown + prompt + fine-tunes
          <section className="mb-6 space-y-4">
            <div>
              <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Workflow</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {ATELIER_WORKFLOWS.map(w => {
                  const active = atelierWorkflow === w.id
                  return (
                    <button key={w.id} type="button" onClick={() => setAtelierWorkflow(w.id)}
                      className={`p-3 rounded-xl text-left border-2 transition-all ${
                        active
                          ? 'border-cyan-400/70 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                          : 'border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:bg-gray-900'
                      }`}>
                      <div className="flex items-baseline justify-between mb-0.5">
                        <span className={`text-xs font-bold ${active ? 'text-white' : 'text-gray-200'}`}>
                          {w.icon} {w.label}
                        </span>
                        <span className="text-[9px] font-mono text-gray-500">{w.eta}</span>
                      </div>
                      <p className={`text-[10px] leading-snug ${active ? 'text-gray-300' : 'text-gray-500'}`}>{w.blurb}</p>
                      <div className="flex gap-1 mt-1.5 text-[9px] flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded uppercase font-mono ${
                          w.family === 'upscale' ? 'bg-emerald-500/15 text-emerald-300'
                          : w.family === 'img2img' ? 'bg-fuchsia-500/15 text-fuchsia-300'
                          : w.family === 't2i'    ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-cyan-500/15 text-cyan-300'
                        }`}>{w.family}</span>
                        {w.needsImage && <span className="px-1.5 py-0.5 rounded uppercase font-mono bg-gray-800 text-gray-400">img</span>}
                        {w.needsPrompt && <span className="px-1.5 py-0.5 rounded uppercase font-mono bg-gray-800 text-gray-400">prompt</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Prompt — required by some workflows. Pick from a template (drops
                into the textarea) or write your own freely. */}
            {wf.needsPrompt && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">Prompt</label>
                  <button type="button" onClick={() => setAtelierPrompt('')}
                    className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
                    clear
                  </button>
                </div>
                <Select
                  className="w-full mb-2"
                  size="middle"
                  placeholder="📋 Pick a template…  (or just type below)"
                  options={groupedTemplates()}
                  value={undefined}
                  popupMatchSelectWidth={false}
                  onChange={(_value, option) => {
                    // Append a comma+space if the textarea already has content,
                    // so users can stack templates. Otherwise replace.
                    const next = atelierPrompt.trim()
                      ? `${atelierPrompt.trim()}, ${option._text}`
                      : option._text
                    setAtelierPrompt(next)
                  }}
                />
                <Input.TextArea
                  value={atelierPrompt} onChange={e => setAtelierPrompt(e.target.value)}
                  autoSize={{ minRows: 3, maxRows: 8 }}
                  placeholder={wf.family === 't2i'
                    ? 'e.g. "a cinematic portrait of a wolf in misty forest, golden hour, 35mm film"'
                    : wf.family === 'edit'
                      ? 'e.g. "change the shirt to red, keep everything else the same"'
                      : 'e.g. "sharpen face, recover skin texture, natural lighting"'}
                  maxLength={2000}
                  showCount
                />
                <p className="text-[10px] text-gray-600 mt-1">
                  Pick a template to autofill — or stack multiple. You can edit freely afterwards.
                </p>
              </div>
            )}

            {/* Custom model override — for advanced users who want to swap in a
                LoRA or alternate SDXL/Flux checkpoint they've dropped into the
                5090's ComfyUI/models/checkpoints/ folder. */}
            {showCustomModel && (
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
                  Model (advanced — override default checkpoint)
                </label>
                <Input
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                  placeholder={defaultModel}
                  allowClear
                />
                <p className="text-[10px] text-gray-600 mt-1">
                  Type a `.safetensors` filename from <span className="font-mono text-gray-400">ComfyUI/models/checkpoints/</span> — leave blank to use {wf.label}'s default.
                </p>
              </div>
            )}

            {/* Fine-tunes — show only the ones relevant to this workflow */}
            {(showSteps || showDenoise || showCfg || showWH) && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-gray-900/40 border border-gray-800">
                {showSteps && (
                  <Tuner label="Steps" value={tunings.steps} min={1} max={50} step={1}
                    onChange={v => setTunings(t => ({ ...t, steps: v }))} />
                )}
                {showDenoise && (
                  <Tuner label="Denoise" value={tunings.denoise} min={0} max={1} step={0.05}
                    onChange={v => setTunings(t => ({ ...t, denoise: v }))} fmt={v => v.toFixed(2)} />
                )}
                {showCfg && (
                  <Tuner label="CFG" value={tunings.cfg} min={1} max={15} step={0.5}
                    onChange={v => setTunings(t => ({ ...t, cfg: v }))} fmt={v => v.toFixed(1)} />
                )}
                {showWH && (
                  <>
                    <Tuner label="Width" value={tunings.width} min={512} max={1536} step={64}
                      onChange={v => setTunings(t => ({ ...t, width: v }))} />
                    <Tuner label="Height" value={tunings.height} min={512} max={1536} step={64}
                      onChange={v => setTunings(t => ({ ...t, height: v }))} />
                  </>
                )}
              </div>
            )}
          </section>
        ) : (
          // Cloud mode: existing preset cards
          <section className="mb-6">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Choose a polish</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PRESETS.map(p => {
                const active = selectedPreset === p.id
                return (
                  <button key={p.id} type="button" onClick={() => setSelectedPreset(p.id)}
                    className={`relative p-4 rounded-2xl text-left border-2 transition-all overflow-hidden ${
                      active
                        ? `${p.border.replace('/40', '')} bg-gray-900 shadow-xl ${p.glow} scale-[1.01]`
                        : 'border-gray-800 bg-gray-900/40 hover:bg-gray-900 hover:border-gray-700'
                    }`}>
                    {active && (
                      <div aria-hidden className={`absolute inset-0 pointer-events-none opacity-20 bg-gradient-to-br ${p.accent}`} />
                    )}
                    {active && (
                      <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-br ${p.accent} flex items-center justify-center text-black shadow-md z-10`}>
                        <CheckOutlined className="text-[10px] font-bold" />
                      </div>
                    )}
                    <div className="relative">
                      <div className="flex items-start justify-between mb-1.5">
                        <span className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-200'}`}>
                          <span className="mr-1.5">{p.icon}</span>{p.name}
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); setExpandedPreset(p.id) }}
                          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-700 hover:border-cyan-400 text-gray-400 hover:text-cyan-300 transition-colors">
                          <ExpandAltOutlined /> Expand
                        </button>
                      </div>
                      <p className={`text-[11px] leading-snug ${active ? 'text-gray-300' : 'text-gray-500'}`}>
                        {p.short}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* ─── Action ─── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-500">
            {isAtelier
              ? <>Active: <span className="text-cyan-300 font-semibold">{wf.label}</span></>
              : <>Active preset: <span className="text-cyan-300 font-semibold">{activePreset?.name}</span></>}
          </p>
          <button onClick={() => enhance()} disabled={(wf.needsImage && !sourceDataUrl && isAtelier) || (!isAtelier && !sourceDataUrl) || working}
            className={`flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              ((wf.needsImage && !sourceDataUrl && isAtelier) || (!isAtelier && !sourceDataUrl) || working)
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-amber-400 text-black hover:shadow-xl hover:shadow-fuchsia-500/30 hover:scale-[1.02]'
            }`}>
            <ThunderboltOutlined />
            {working ? 'Working…' : isAtelier ? `Run ${wf.label}` : 'Enhance image'}
          </button>
        </div>
    </>
  )
}

// ─── Library tab ─────────────────────────────────────────────────
function ImageLibrary({ refreshKey }) {
  const [filter, setFilter] = useState('completed')
  const [visibility, setVisibility] = useState('public')   // public | vault
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0, pages: 1, counts: {} })
  const [loading, setLoading] = useState(true)
  const [internalReload, setInternalReload] = useState(0)

  useEffect(() => { setPage(1) }, [filter, visibility, refreshKey])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listEnhancedImages({ status: filter, visibility, page, limit: 24 }).then(({ data: result }) => {
      if (cancelled) return
      if (result) setData(result)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [filter, visibility, page, refreshKey, internalReload])

  const askDelete = (img) => {
    Modal.confirm({
      title: 'Delete this image?',
      content: (
        <div className="text-sm text-gray-300">
          <p className="mb-2 italic line-clamp-2">"{img.prompt?.slice(0, 200)}"</p>
          <p className="text-xs text-gray-500">
            Removes the row + Cloudinary asset. Can't be undone.
          </p>
        </div>
      ),
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Keep',
      centered: true,
      onOk: async () => {
        const { error: err } = await deleteEnhancedImage(img.imageId)
        if (err) {
          antMessage.error(`Delete failed: ${err}`)
          return
        }
        antMessage.success('Deleted')
        setInternalReload(n => n + 1)
      },
    })
  }

  const filters = [
    { v: 'completed',  label: 'Completed',  n: data.counts?.completed },
    { v: 'processing', label: 'Processing', n: data.counts?.processing },
    { v: 'queued',     label: 'Queued',     n: data.counts?.queued },
    { v: 'failed',     label: 'Failed',     n: data.counts?.failed },
    { v: 'all',        label: 'All',        n: null },
  ]

  const loggedIn = !!getVaultToken()
  return (
    <div className="space-y-4">
      {/* Visibility toggle — Public showcase / Vault (private, requires login).
          Vault chip is hidden entirely when not logged in. */}
      <div className="flex items-center gap-1 p-1 rounded-full bg-gray-900/60 border border-gray-800 w-fit">
        <button onClick={() => setVisibility('public')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all ${
            visibility === 'public'
              ? 'bg-gradient-to-r from-cyan-500/30 to-fuchsia-500/30 text-white border border-cyan-400/40'
              : 'text-gray-400 hover:text-gray-200'
          }`}>
          <span className="font-semibold">🌐 Public</span>
          <span className="hidden sm:inline text-[9px] opacity-60">showcase</span>
        </button>
        {loggedIn && (
          <button onClick={() => setVisibility('vault')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all ${
              visibility === 'vault'
                ? 'bg-gradient-to-r from-cyan-500/30 to-fuchsia-500/30 text-white border border-cyan-400/40'
                : 'text-gray-400 hover:text-gray-200'
            }`}>
            <span className="font-semibold">🔒 Vault</span>
            <span className="hidden sm:inline text-[9px] opacity-60">private</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {filters.map(f => {
          const active = filter === f.v
          return (
            <button key={f.v} onClick={() => setFilter(f.v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                active
                  ? 'bg-cyan-600/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-gray-800/60 hover:bg-gray-800 text-gray-400 border-transparent hover:border-gray-700'
              }`}>
              <span>{f.label}</span>
              {f.n != null && <span className="text-[10px] opacity-70 font-mono">({f.n})</span>}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1,2,3,4,5,6,7,8].map(i => (
            <div key={i} className="aspect-square rounded-xl bg-gray-900/40 animate-pulse" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="py-16 text-center text-gray-500 text-sm">
          No {filter === 'all' ? '' : filter} enhancements yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.items.map(it => <LibraryCard key={it.imageId} image={it} onDelete={askDelete} />)}
        </div>
      )}
    </div>
  )
}

function LibraryCard({ image, onDelete }) {
  const url = image.outputUrl || image.sourceUrl
  return (
    <div className="group relative aspect-square rounded-xl overflow-hidden border border-gray-800 hover:border-cyan-400/50 transition-all bg-gray-900/40">
      <a href={url || '#'} target="_blank" rel="noopener" className="block w-full h-full">
        {url ? (
          <img src={url} alt={image.prompt}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-950">
            <span className="text-3xl opacity-50">
              {image.status === 'failed' ? '✗' : image.status === 'processing' ? '⚡' : '⏳'}
            </span>
          </div>
        )}
      </a>
      <div className="pointer-events-none absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-black/60 text-white border border-white/10">
        {image.engine === 'cloud' ? '☁ Gemini' : '🖥 5090'}
      </div>
      {image.status !== 'completed' && (
        <div className={`pointer-events-none absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
          image.status === 'failed' ? 'bg-rose-500/80 text-white'
          : image.status === 'processing' ? 'bg-cyan-500/80 text-white'
          : 'bg-amber-500/80 text-black'
        }`}>{image.status}</div>
      )}
      {/* Delete button — appears on hover top-right when status === completed */}
      {onDelete && (
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(image) }}
          title="Delete"
          className="absolute bottom-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full bg-black/70 hover:bg-rose-600 text-gray-200 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
          <DeleteOutlined className="text-xs" />
        </button>
      )}
    </div>
  )
}

// ─── Full live-log viewer for an Atelier image job ──
function ImageLogModal({ open, onClose, job }) {
  const scrollRef = useRef(null)
  // Auto-scroll to newest line as logs stream in while the modal is open
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [open, job?.logs?.length])
  const logs = Array.isArray(job?.logs) ? job.logs : []
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      centered
      closeIcon={null}
      styles={{
        content: { background: '#0b0f17', padding: 0, borderRadius: 16, border: '1px solid rgba(34,211,238,0.25)', maxWidth: '95vw' },
        body: { padding: 0 },
        header: { display: 'none' },
        mask: { backdropFilter: 'blur(6px)' },
      }}>
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-800/80 bg-gradient-to-r from-cyan-500/10 via-fuchsia-500/5 to-transparent">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            job?.status === 'completed' ? 'bg-emerald-400'
            : job?.status === 'failed' ? 'bg-rose-400'
            : 'bg-emerald-400 animate-pulse'
          }`} />
          <h3 className="text-xs sm:text-sm font-semibold text-white tracking-wide truncate">
            <span className="text-gray-400">Atelier ·</span>{' '}
            <span className="font-mono text-cyan-300 text-[10px] sm:text-xs">{job?.imageId}</span>
          </h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-gray-500">
            {logs.length} {logs.length === 1 ? 'event' : 'events'}
          </span>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded">
            ✕
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="max-h-[65vh] overflow-y-auto p-4 sm:p-5 bg-[#06080d]">
        {logs.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-12">Waiting for the worker to emit its first event…</p>
        ) : (
          <ul className="space-y-1.5">
            {logs.map((entry, i) => (
              <li key={`${entry?.ts || i}-${i}`} className="flex gap-2 sm:gap-3 items-start">
                <span className="text-[9px] sm:text-[10px] font-mono text-gray-600 shrink-0 pt-0.5 select-none">
                  {fmtLogTs(entry?.ts)}
                </span>
                <span className={`text-[11px] sm:text-[12px] font-mono leading-relaxed break-all ${logTone(entry?.msg || '')}`}>
                  {entry?.msg || ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

// ─── Full-prompt modal (extracted so it can sit above the Tabs) ──
function ImageEnhancerModal({ expanded, setExpandedPreset, setSelectedPreset }) {
  return (
    <Modal
      open={!!expanded}
      onCancel={() => setExpandedPreset(null)}
      footer={null}
      width={720}
      centered
      closeIcon={null}
      styles={{
        content: { background: '#0b0f17', padding: 0, borderRadius: 16, border: '1px solid rgba(34,211,238,0.25)' },
        body: { padding: 0 },
        header: { display: 'none' },
        mask: { backdropFilter: 'blur(6px)' },
      }}>
      {expanded && (
        <>
          <div className={`flex items-center justify-between px-5 py-3 border-b border-gray-800/80 bg-gradient-to-r ${expanded.accent.replace('via-', 'to-').split(' ')[0]} bg-opacity-10`}>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{expanded.icon}</span>
              <h3 className="text-sm font-semibold text-white tracking-wide">{expanded.name}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setSelectedPreset(expanded.id); setExpandedPreset(null) }}
                className="text-[10px] font-semibold px-2 py-1 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-colors">
                Use this prompt
              </button>
              <button onClick={() => setExpandedPreset(null)}
                className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded">
                ✕
              </button>
            </div>
          </div>
          <div className="max-h-[65vh] overflow-y-auto p-5 bg-[#06080d]">
            <p className="text-xs text-gray-400 mb-3">{expanded.short}</p>
            <pre className="text-[12px] font-mono text-gray-200 leading-relaxed whitespace-pre-wrap break-words bg-black/40 border border-gray-800 rounded-lg p-4">
{expanded.prompt}
            </pre>
          </div>
        </>
      )}
    </Modal>
  )
}
