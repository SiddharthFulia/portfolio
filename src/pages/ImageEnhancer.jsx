import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Modal, Upload, Tabs, Input, Select, Switch, Tooltip, message as antMessage } from 'antd'
import CameraCapture, { transformImage } from '../components/CameraCapture'
import {
  UploadOutlined, ExpandAltOutlined, DownloadOutlined,
  CheckOutlined, ReloadOutlined, ThunderboltOutlined,
  AppstoreOutlined, CloudOutlined, DesktopOutlined, DeleteOutlined,
  LockOutlined, BulbOutlined, CopyOutlined, SyncOutlined,
} from '@ant-design/icons'
import {
  enhanceImage, getImageStatus, listEnhancedImages, deleteEnhancedImage, fileToDataUrl,
  promptCoach, imageBulkAction,
} from '../api/ai'
import { FastImageGen, VisionAI } from '../components/aitools'
import { VaultLoginPanel, getVaultToken, setVaultToken } from '../components/VaultGate'
import JobLogsAgentPlan from '../components/JobLogsAgentPlan'

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

// Curated checkpoint catalog. This is the SOLE source of truth the Atelier
// dropdown shows — no free typing. Each entry knows:
//   • the on-disk filename (what the worker tells ComfyUI to load)
//   • short human label + descriptive blurb shown as helper text
//   • family ('sdxl' | 'sdxl-hyper' | 'pony' | 'flux') — drives prompt hints
//   • defaults block (steps/cfg/denoise) — applied when user picks it
//   • a `note` shown under the dropdown so the user knows why each model
//     needs different tuning. Hyper/Lightning need CFG 1.5; Pony needs CFG 6-7
//     and the score_9 prefix; SDXL photo-real lives around CFG 5.
const CHECKPOINTS = [
  {
    value: 'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors',
    label: '🏆 JuggernautXL v9 — Photo-Real',
    blurb: 'Default. Best all-rounder. Crisp portraits, products, scenes.',
    family: 'sdxl',
    defaults: { steps: 25, cfg: 5.0, denoise: 0.25 },
    note: '',
  },
  {
    value: 'cyberrealisticXL_v100.safetensors',
    label: '📷 CyberRealistic XL v1',
    blurb: 'Photo-realistic SDXL. Add negative "cartoon, painting, anime".',
    family: 'sdxl',
    defaults: { steps: 30, cfg: 5.5, denoise: 0.30 },
    note: 'Photo-real SDXL — works great with negative "cartoon, painting, anime".',
  },
  {
    value: 'realisticVisionV60B1_v51HyperVAE.safetensors',
    label: '⚡ Realistic Vision v6 (Hyper)',
    blurb: 'Distilled fast variant. 8 steps & CFG 1.5 — much faster.',
    family: 'sdxl-hyper',
    defaults: { steps: 8, cfg: 1.5, denoise: 0.30 },
    note: 'Hyper variant — runs at 8 steps & CFG 1.5. Don\'t change.',
  },
  {
    value: 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors',
    label: '🐴 Pony Diffusion v6 XL',
    blurb: 'Stylized. Needs "score_9, score_8_up, score_7_up, …" prefix.',
    family: 'pony',
    defaults: { steps: 28, cfg: 7.0, denoise: 0.35 },
    note: 'Pony — start prompts with "score_9, score_8_up, score_7_up, …" for best quality.',
  },
  {
    value: 'autismmixSDXL_autismmixPony.safetensors',
    label: '🎨 AutismMix Pony (SDXL)',
    blurb: 'Pony fork. Same "score_9, score_8_up, …" prompt convention.',
    family: 'pony',
    defaults: { steps: 28, cfg: 6.0, denoise: 0.35 },
    note: 'Pony fork — same "score_9…" prompt convention.',
  },
  {
    value: 'flux1-dev-kontext_fp8_scaled.safetensors',
    label: '🪄 Flux Kontext (dev fp8)',
    blurb: 'For Flux Kontext edits. Identity-preserving prompt-edit only.',
    family: 'flux',
    defaults: { steps: 20, cfg: 2.5 },
    note: 'Flux Kontext — use natural-language edit instructions ("change shirt to red, keep face").',
  },
]

// Lookup the catalog row for a checkpoint value (with or without extension).
function checkpointMeta(value) {
  if (!value) return null
  const base = value.replace(/\.safetensors$|\.ckpt$/i, '')
  return CHECKPOINTS.find(c =>
    c.value === value || c.value.replace(/\.safetensors$|\.ckpt$/i, '') === base
  ) || null
}

// Back-compat: GenerateSection still reads `defaults` per filename.
function checkpointDefaults(filename) {
  const m = checkpointMeta(filename)
  return m ? { ...m.defaults, note: m.note } : null
}

// Sample prompts for the "💡 Help me write a prompt" modal. Keyed by the
// resolved family (matches CHECKPOINTS.family + 'flux' for Flux Kontext).
// Each sample is one click → copies to clipboard or replaces the textarea.
// Pony samples include their required `neg` because that's part of why Pony
// trips up first-time users — without the score_4/score_3 negative the
// outputs look noisy.
const PROMPT_SAMPLES = {
  sdxl: [
    {
      title: '🪞 Cinematic portrait',
      tags: ['portrait', 'golden hour'],
      text: 'cinematic photo of a person near a tall window at golden hour, soft directional light, shallow depth of field on the eyes, 85mm portrait lens, neutral cream wall background, editorial color grade, natural skin texture',
    },
    {
      title: '📦 Product shot — studio',
      tags: ['product', 'studio'],
      text: 'studio product photograph on a seamless white background, three-point softbox lighting, ultra-sharp macro detail, commercial advertisement quality, 50mm lens, crisp shadow falloff',
    },
    {
      title: '🏞️ Wide landscape — golden hour',
      tags: ['landscape'],
      text: 'wide cinematic landscape, golden hour, dramatic clouds, ultra-detailed terrain, photo-realistic, 35mm anamorphic, deep emerald and amber color grade, atmospheric haze',
    },
    {
      title: '🖤 Black & white film portrait',
      tags: ['B&W'],
      text: 'black and white classic film portrait, deep blacks, creamy mid-tones, film grain, ilford hp5 look, timeless 85mm shot, soft window light, neutral background',
    },
    {
      title: '🌙 Hong Kong night cinema',
      tags: ['cinematic'],
      text: 'wong kar-wai 1990s hong kong cinema, deep emerald and crimson tones, neon reflections on wet street, soft bloom, 35mm film grain, moody atmosphere, melancholy mood',
    },
  ],
  pony: [
    {
      title: '👤 Realistic portrait',
      tags: ['score_9', 'source_realistic'],
      neg: 'score_4, score_3, score_2, score_1, worst quality, low quality, blurry, deformed, bad anatomy, watermark, text',
      text: 'score_9, score_8_up, score_7_up, score_6_up, source_realistic, photorealistic portrait of a person, soft window light, shallow depth of field, 85mm lens, natural skin texture, neutral background, sharp eyes',
    },
    {
      title: '🎨 Anime character',
      tags: ['source_anime'],
      neg: 'score_4, score_3, score_2, score_1, worst quality, low quality, blurry, deformed, bad anatomy, watermark, text',
      text: 'score_9, score_8_up, score_7_up, score_6_up, source_anime, 1girl, solo, long flowing hair, looking at viewer, detailed background, soft lighting, vibrant colors, sharp lineart, expressive eyes',
    },
    {
      title: '🌃 Cinematic scene',
      tags: ['cinematic'],
      neg: 'score_4, score_3, score_2, score_1, worst quality, low quality, blurry, deformed, watermark, text',
      text: 'score_9, score_8_up, score_7_up, source_realistic, cinematic wide shot, neon-lit rainy city street, hong kong cinema, deep emerald and crimson tones, soft bloom, film grain, atmospheric haze',
    },
    {
      title: '🏰 Fantasy illustration',
      tags: ['source_anime'],
      neg: 'score_4, score_3, score_2, score_1, worst quality, low quality, blurry, deformed, watermark, text',
      text: 'score_9, score_8_up, score_7_up, source_anime, fantasy castle on a cliff at sunset, dramatic clouds, glowing windows, detailed stonework, painterly style, rich color palette, atmospheric depth',
    },
  ],
  'sdxl-hyper': [
    {
      title: '⚡ Fast portrait',
      tags: ['8 steps', 'CFG 1.5'],
      text: 'photoreal portrait, soft window light, 85mm lens, shallow depth of field, natural skin, neutral background',
    },
    {
      title: '⚡ Quick landscape',
      tags: ['8 steps'],
      text: 'wide landscape, golden hour, dramatic clouds, 35mm film, cinematic color',
    },
    {
      title: '⚡ Product on white',
      tags: ['8 steps'],
      text: 'product photo on white background, three-point lighting, sharp detail, commercial quality',
    },
    {
      title: '⚡ Street scene',
      tags: ['8 steps'],
      text: 'rainy neon street at night, cinematic, 35mm, soft bloom, atmospheric',
    },
  ],
  flux: [
    {
      title: '🎨 Recolor element',
      tags: ['recolor'],
      text: 'change the shirt to red, keep the face, pose, lighting, and background exactly the same',
    },
    {
      title: '✂️ Remove background',
      tags: ['background'],
      text: 'replace the background with a clean neutral grey studio backdrop, keep the subject identical — same pose, same lighting on subject',
    },
    {
      title: '👔 Change outfit',
      tags: ['outfit'],
      text: 'change the outfit to a black tailored suit, preserve face, pose, body shape, and background, only change the clothing',
    },
    {
      title: '➕ Add element',
      tags: ['add'],
      text: 'add a vase of white flowers on the table next to the subject, keep lighting and composition unchanged',
    },
    {
      title: '🌅 Change lighting',
      tags: ['lighting'],
      text: 'change the lighting to warm golden hour from camera-left, keep subject identity, pose, and background composition exactly the same',
    },
  ],
}

// Family-specific tips shown at the top of the helper modal. Same knowledge as
// the BE coach system prompts — surfaced to the user so they understand why
// the output looks the way it does.
const FAMILY_TIPS = {
  sdxl: {
    label: 'SDXL Photo-Real',
    blurb: 'Describe like a photo brief: subject, lens, lighting, color grade. Avoid stylization words ("anime", "painting").',
    cfg: 'Sweet spot: CFG 5–6 · 25–30 steps',
  },
  pony: {
    label: 'Pony Diffusion',
    blurb: 'MUST start with score tags. Add source_realistic OR source_anime. Booru tags (1girl, solo) work too.',
    cfg: 'Sweet spot: CFG 6–7 · 28 steps',
  },
  'sdxl-hyper': {
    label: 'SDXL Hyper (distilled)',
    blurb: 'Keep prompts SHORT — long prompts dilute the signal at low CFG. 15–30 words max.',
    cfg: 'Sweet spot: CFG 1.5 · 8 steps',
  },
  flux: {
    label: 'Flux Kontext (edit)',
    blurb: 'Phrase as an EDIT instruction starting with a verb (change/replace/remove). Specify what to preserve. No negative prompt — Flux Kontext doesn\'t use one.',
    cfg: 'Sweet spot: CFG 2.5 · 20 steps',
  },
}

// Resolve which "family" the prompt coach should target. Honors the user's
// checkpoint override first (so picking Pony in the dropdown switches the
// coach to Pony tags even on a generic sdxl-* workflow); falls back to the
// workflow's own family otherwise.
function resolvePromptFamily(workflow, customModelValue) {
  const meta = checkpointMeta(customModelValue)
  if (meta?.family) return meta.family
  if (workflow?.family === 'edit') return 'flux'
  return 'sdxl'
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
  // ─── Tier 1: quality upscale + relight (models on disk)
  {
    id: 'supir-upscale', family: 'upscale', label: 'SUPIR · Quality Upscale',
    blurb: 'Semantic-aware restoration. Best for compressed JPEGs, blurry photos, old scans.',
    checkpoint: 'SUPIR-v0F.ckpt (+ JuggernautXL base)',
    needsImage: true, needsPrompt: false,  // prompt optional but improves results
    defaults: { steps: 25, cfg: 5.0 },
    eta: '~60s', icon: '✨',
  },
  {
    id: 'iclight-relight', family: 'edit', label: 'IC-Light · Relight',
    blurb: 'Re-light a portrait. Describe the lighting ("golden hour from left, soft rim"), keep the subject.',
    checkpoint: 'iclight_sd15_fc + RealisticVision Hyper',
    needsImage: true, needsPrompt: true,
    defaults: { steps: 25, cfg: 2.0 },
    eta: '~25s', icon: '💡',
  },
  // ─── Tier 2: Flux family (require download — see HOW_IT_WORKS.md flux2 set)
  {
    id: 'flux-dev-t2i', family: 't2i', label: 'Flux Dev · Text → Image',
    blurb: 'Black Forest Labs Flux.1 [dev]. State-of-the-art photoreal. ⚠ Needs flux1-dev.safetensors (~24 GB).',
    checkpoint: 'flux1-dev.safetensors',
    needsImage: false, needsPrompt: true,
    defaults: { steps: 28, cfg: 3.5, width: 1024, height: 1024 },
    eta: '~40s', icon: '⚫',
  },
  {
    id: 'flux-schnell', family: 't2i', label: 'Flux Schnell · Fast T2I',
    blurb: '4-step distilled Flux. Fastest non-SDXL T2I. ⚠ Needs flux1-schnell.safetensors (~12 GB).',
    checkpoint: 'flux1-schnell.safetensors',
    needsImage: false, needsPrompt: true,
    defaults: { steps: 4, cfg: 1.0, width: 1024, height: 1024 },
    eta: '~8s', icon: '⚡',
  },
  {
    id: 'flux-fill', family: 'edit', label: 'Flux Fill · Inpaint/Outpaint',
    blurb: 'Flux-based inpaint. Paint a mask on the image (alpha channel) + prompt. ⚠ Needs flux1-fill-dev.safetensors.',
    checkpoint: 'flux1-fill-dev.safetensors',
    needsImage: true, needsPrompt: true,
    defaults: { steps: 25, cfg: 30.0 },
    eta: '~45s', icon: '🩹',
  },
  // ─── Custom — bring your own checkpoint, full control on every knob
  {
    id: 'custom-sdxl', family: 'img2img', label: 'Custom (img2img)',
    blurb: 'Any SDXL/Pony checkpoint. Wide denoise range (0.1–1.0) for subtle polish or full reinterpretation.',
    checkpoint: 'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors',
    needsImage: true, needsPrompt: true,
    // Denoise 0.55 by default — visible variation on first run instead of
    // "looks identical, did anything happen?". Slide left for polish, right for transform.
    defaults: { steps: 30, denoise: 0.55, cfg: 6.0 },
    eta: '~30s', icon: '🛠️',
  },
  {
    id: 'custom-t2i', family: 't2i', label: 'Custom (text→image)',
    blurb: 'Any SDXL/Pony checkpoint. Pure prompt-driven. Auto-tunes sampler for Pony models.',
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
  // Optional negative prompt. Sent to BE as `negativePrompt` and forwarded to
  // ComfyUI's negative CLIPTextEncode in sdxl-polish / sdxl-t2i / custom-*.
  // Pony users normally paste their score_4..score_1 baseline here.
  const [negativePrompt, setNegativePrompt] = useState('')
  const [customModel, setCustomModel] = useState('')   // optional checkpoint override
  // Family filter for the Atelier workflow grid — quick way to narrow
  // the list to Image→Image / Text→Image / Both / Upscale. Persists
  // across re-renders. Default 'all' shows everything.
  const [familyFilter, setFamilyFilter] = useState('all')
  // Vault login state: small lock button in the header opens an Antd modal
  // with a password field. Once logged in, all outputs auto-route to the
  // private Vault library AND the NSFW filter is bypassed server-side.
  const [vaultLoginOpen, setVaultLoginOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(!!getVaultToken())
  // NSFW rejection — BE returns 401 NSFW_BLOCKED; FE pops a friendly toast
  // and opens the login modal so user can unlock + retry.
  const [nsfwBlocked, setNsfwBlocked] = useState(null)
  const [logsModalOpen, setLogsModalOpen] = useState(false)
  // Toggle between the flat in-page log tail and the AgentPlan tree view.
  const [logsView, setLogsView] = useState('flat')
  // Prompt helper modal — opens from the 💡 button next to the prompt textarea.
  // Surfaces sample prompts tuned to the selected checkpoint family + offers
  // an "ask AI" mode that calls /api/ai/prompt-coach to rewrite plain English
  // into a model-tuned prompt.
  //
  // Coach state lives HERE (in the page) instead of inside the modal so the
  // last idea + generated prompt survive close/reopen cycles. Reset is opt-in
  // (via the "↻ Reset" button inside the modal); switching pages tears the
  // component down which clears it anyway.
  const [promptHelperOpen, setPromptHelperOpen] = useState(false)
  const [coachIdea, setCoachIdea] = useState('')
  const [coachResult, setCoachResult] = useState(null)
  const [coachError, setCoachError] = useState('')
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

  // When the user types a known checkpoint into the custom Model field,
  // hydrate that checkpoint's sweet-spot tunings (e.g. Hyper variants need
  // 8 steps + CFG 1.5).
  useEffect(() => {
    const defs = checkpointDefaults(customModel)
    if (defs) setTunings(t => ({ ...t, ...defs }))
  }, [customModel])

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
        ...(negativePrompt.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
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
      <div>
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <div className="flex items-start sm:items-center justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <ThunderboltOutlined className="text-amber-400 text-xl shrink-0" />
              {/* `leading-tight pb-1` — gradient text via bg-clip-text mask
                  clips letter descenders/ascenders when line-height is too
                  tight. pb-1 reserves a sliver so the gradient isn't visually
                  chopped on phone or zoomed-out laptop screens.
                  `text-xl sm:text-3xl lg:text-4xl` — three-step scale so the
                  title doesn't crowd the Vault pill + Engine toggle on the
                  same row at narrow viewports. */}
              <h1 className="text-xl sm:text-3xl lg:text-4xl font-bold leading-tight pb-1 bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent truncate">
                Image Studio
              </h1>
              {/* Vault pill — full label + status dot. Clear professional
                  affordance for the auth state. Logged-in users bypass the
                  NSFW filter and their outputs land in the Vault library. */}
              <button onClick={() => setVaultLoginOpen(true)} type="button"
                title={isLoggedIn ? 'Vault unlocked · click to lock or sign out' : 'Sign in to unlock the private Vault'}
                className={`group relative inline-flex items-center gap-1.5 sm:gap-2 pl-2 pr-2.5 sm:pl-2.5 sm:pr-3 py-1 rounded-full border text-[11px] font-semibold tracking-wide transition-all overflow-hidden ${
                  isLoggedIn
                    ? 'bg-emerald-500/12 border-emerald-400/50 text-emerald-200 shadow-[0_0_18px_-6px_rgba(16,185,129,0.55)] hover:bg-emerald-500/20'
                    : 'bg-gray-900/70 border-gray-700/80 text-gray-300 hover:border-cyan-400/50 hover:text-cyan-200 hover:bg-gray-900'
                }`}>
                <span aria-hidden
                  className={`w-1.5 h-1.5 rounded-full ${isLoggedIn ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
                <LockOutlined className="text-[12px]" />
                <span className="hidden sm:inline">
                  {isLoggedIn ? 'Vault · Unlocked' : 'Vault · Locked'}
                </span>
                <span className="sm:hidden">{isLoggedIn ? 'Vault' : 'Lock'}</span>
              </button>
            </div>
            {/* Engine toggle — Cloud (Gemini) vs Local Atelier (5090) */}
            <div className="flex items-center gap-1 p-1 rounded-full bg-gray-900/60 border border-gray-800">
              {[
                { id: 'cloud',   label: 'Cloud',   icon: <CloudOutlined />,   sub: 'Gemini · 10-15s' },
                { id: 'atelier', label: 'Atelier', icon: <DesktopOutlined />, sub: '5090 local · 8 workflows' },
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
          // When user switches to T2I tab, force engine→atelier and pre-select
          // a t2i workflow so the form is immediately usable.
          onChange={(key) => {
            if (key === 't2i') {
              if (engine !== 'atelier') setEngine('atelier')
              const cur = ATELIER_WORKFLOWS.find(w => w.id === atelierWorkflow)
              if (!cur || cur.family !== 't2i') {
                setAtelierWorkflow(ATELIER_WORKFLOWS.find(w => w.family === 't2i').id)
              }
            }
          }}
          items={[
            {
              key: 'generate',
              label: <span><ThunderboltOutlined /> Enhance</span>,
              children: (
                <GenerateSection
                  sourceDataUrl={sourceDataUrl} reset={reset} handleFile={handleFile}
                  setSourceDataUrl={setSourceDataUrl}
                  resultUrl={resultUrl} status={status} working={working} engine={engine}
                  job={job} activePreset={activePreset} downloadResult={downloadResult}
                  error={error}
                  selectedPreset={selectedPreset} setSelectedPreset={setSelectedPreset}
                  setExpandedPreset={setExpandedPreset} enhance={enhance}
                  atelierWorkflow={atelierWorkflow} setAtelierWorkflow={setAtelierWorkflow}
                  tunings={tunings} setTunings={setTunings}
                  atelierPrompt={atelierPrompt} setAtelierPrompt={setAtelierPrompt}
                  negativePrompt={negativePrompt} setNegativePrompt={setNegativePrompt}
                  customModel={customModel} setCustomModel={setCustomModel}
                  setLogsModalOpen={setLogsModalOpen}
                  setPromptHelperOpen={setPromptHelperOpen}
                  familyFilter={familyFilter} setFamilyFilter={setFamilyFilter}
                />
              ),
            },
            {
              key: 't2i',
              label: <span>✨ Text → Image</span>,
              children: (
                <GenerateSection
                  sourceDataUrl={sourceDataUrl} reset={reset} handleFile={handleFile}
                  setSourceDataUrl={setSourceDataUrl}
                  resultUrl={resultUrl} status={status} working={working}
                  engine="atelier"   // Force Atelier — Cloud T2I isn't wired into this lane
                  job={job} activePreset={activePreset} downloadResult={downloadResult}
                  error={error}
                  selectedPreset={selectedPreset} setSelectedPreset={setSelectedPreset}
                  setExpandedPreset={setExpandedPreset} enhance={enhance}
                  atelierWorkflow={atelierWorkflow} setAtelierWorkflow={setAtelierWorkflow}
                  tunings={tunings} setTunings={setTunings}
                  atelierPrompt={atelierPrompt} setAtelierPrompt={setAtelierPrompt}
                  negativePrompt={negativePrompt} setNegativePrompt={setNegativePrompt}
                  customModel={customModel} setCustomModel={setCustomModel}
                  setLogsModalOpen={setLogsModalOpen}
                  setPromptHelperOpen={setPromptHelperOpen}
                  t2iMode
                />
              ),
            },
            {
              key: 'library',
              label: <span><AppstoreOutlined /> Library</span>,
              children: <ImageLibrary refreshKey={refreshKey} />,
            },
            {
              // Fast image gen — Cloudflare FLUX-Schnell + HuggingFace
              // fallback. Sub-second response vs the 5090 ComfyUI queue.
              // Was previously a tab inside /ai-studio (now sunset).
              key: 'fastgen',
              label: <span>⚡ Fast Gen</span>,
              children: <FastImageGen />,
            },
            {
              // Gemini Vision image analysis. Was the /vision standalone
              // page; consolidated here so the Image Studio is the
              // one-stop image lane.
              key: 'vision',
              label: <span>👁 Vision AI</span>,
              children: <VisionAI />,
            },
          ]}
        />

        {/* Modal stays at root so it overlays both tabs */}
        <ImageEnhancerModal expanded={expanded}
          setExpandedPreset={setExpandedPreset} setSelectedPreset={setSelectedPreset} />

        {/* Full live-log viewer for the current job */}
        <ImageLogModal open={logsModalOpen} onClose={() => setLogsModalOpen(false)} job={job} />

        {/* Prompt helper — samples + AI coach. Reads the current workflow +
            checkpoint to scope its suggestions to the right family. */}
        <PromptHelperModal
          open={promptHelperOpen}
          onClose={() => setPromptHelperOpen(false)}
          workflow={ATELIER_WORKFLOWS.find(w => w.id === atelierWorkflow)}
          customModel={customModel}
          currentPrompt={atelierPrompt}
          // Persistent coach state — survives close/reopen
          idea={coachIdea} setIdea={setCoachIdea}
          coachResult={coachResult} setCoachResult={setCoachResult}
          coachError={coachError} setCoachError={setCoachError}
          onApply={(text, neg) => {
            setAtelierPrompt(text)
            if (neg) setNegativePrompt(neg)   // coach gave us a negative too — autofill it
            setPromptHelperOpen(false)
          }}
          onAppend={(text) => {
            const next = atelierPrompt.trim()
              ? `${atelierPrompt.trim()}, ${text}`
              : text
            setAtelierPrompt(next)
          }}
          onApplyNegative={(neg) => setNegativePrompt(neg)}
        />

        {/* Vault unlock modal — centered compact card. Opened by the header
            lock OR auto-triggered when BE returns 401 NSFW_BLOCKED. */}
        <Modal open={vaultLoginOpen}
          onCancel={() => { setVaultLoginOpen(false); setNsfwBlocked(null); setIsLoggedIn(!!getVaultToken()) }}
          footer={null} closeIcon={null} centered width={420}
          maskClosable
          styles={{
            content: { background: 'transparent', padding: 0, boxShadow: 'none' },
            body: { padding: 0 },
            mask: { backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,0.7)' },
          }}>
          {isLoggedIn ? (
            <div className="relative rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-gray-900/95 to-gray-950/95 p-6 text-center shadow-[0_30px_70px_-20px_rgba(16,185,129,0.35)] overflow-hidden">
              {/* Subtle ambient orb behind the title */}
              <div aria-hidden className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="inline-flex w-14 h-14 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 mb-3 text-3xl shadow-inner">
                  ✓
                </div>
                <p className="text-emerald-200 text-lg font-bold tracking-tight">Vault unlocked</p>
                <p className="text-gray-400 text-xs mt-1 mb-5 max-w-[34ch] mx-auto leading-relaxed">
                  Outputs route to <span className="text-emerald-300 font-semibold">🔒 Vault</span> ·
                  NSFW filter bypassed · Vault items are hidden from public viewers
                </p>
                <div className="space-y-2">
                  <button onClick={() => { setVaultLoginOpen(false); setNsfwBlocked(null) }}
                    className="w-full px-5 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/50 text-xs font-semibold transition-all">
                    Stay unlocked
                  </button>
                  <button onClick={() => {
                      setVaultToken(null)
                      setIsLoggedIn(false)
                      setNsfwBlocked(null)
                      setVaultLoginOpen(false)
                      setRefreshKey(k => k + 1)
                      antMessage.success('Vault locked — public view restored')
                    }}
                    className="w-full px-5 py-2.5 rounded-xl bg-gray-900/70 hover:bg-rose-500/15 text-gray-400 hover:text-rose-300 border border-gray-700/80 hover:border-rose-500/40 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all">
                    <LockOutlined /> Lock vault & sign out
                  </button>
                </div>
                <p className="text-[10px] text-gray-600 mt-4 leading-snug">
                  Tokens persist 90 days. Locking removes the token from this browser only.
                </p>
              </div>
            </div>
          ) : (
            <>
              {nsfwBlocked && (
                <div className="mb-3 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-center">
                  <p className="text-amber-300 text-xs font-semibold">🛡️ Prompt looks NSFW</p>
                  <p className="text-gray-300 text-[11px] mt-0.5">
                    Unlock with the password to bypass and save to Vault.
                  </p>
                </div>
              )}
              <VaultLoginPanel label="Unlock vault"
                onUnlocked={() => setIsLoggedIn(true)} />
            </>
          )}
        </Modal>
      </div>
      </div>
    </div>
  )
}

// ─── Generator section (extracted so the Tabs structure stays clean) ──
// Compact slider+number input — used for steps / denoise / cfg / w / h
// Negative prompt — collapsed by default with a one-click family baseline
// shortcut. When `supported` is false (Flux Kontext), the field is rendered
// in a disabled greyed-out state with an explanatory note instead of being
// hidden — keeps the layout stable and teaches the user that this model
// doesn't accept negatives.
function NegativePromptField({ value, onChange, family, supported = true }) {
  const [open, setOpen] = useState(!!value)
  useEffect(() => { if (value) setOpen(true) }, [value])
  // Auto-collapse and clear if the workflow stops supporting negatives mid-flight
  useEffect(() => {
    if (!supported && value) onChange('')
  }, [supported])   // eslint-disable-line react-hooks/exhaustive-deps

  const ponyBaseline = 'score_4, score_3, score_2, score_1, worst quality, low quality, blurry, deformed, bad anatomy, watermark, text'
  const sdxlBaseline = 'low quality, blurry, distorted, plastic skin, oversmoothed, watermark, text, deformed hands'
  const hyperBaseline = 'blurry, deformed, watermark'
  const baseline =
    family === 'pony'        ? ponyBaseline
    : family === 'sdxl-hyper' ? hyperBaseline
    : sdxlBaseline

  // ── Greyed-out unsupported state ───────────────────────────────
  if (!supported) {
    return (
      <Tooltip title="Flux Kontext is a guidance-based edit model — it doesn't use a separate negative prompt. Use clear instructions in the main prompt instead (e.g. 'keep the face, pose, background')." placement="topLeft">
        <div className="rounded-xl border border-dashed border-gray-800 bg-gray-900/30 p-3 opacity-60 cursor-not-allowed select-none">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-wider text-gray-600 flex items-center gap-1">
              <span className="text-gray-700">🚫</span>
              Negative prompt
              <span className="text-gray-700 normal-case font-normal">· not supported by this model</span>
            </span>
            <span className="text-[9px] font-mono text-gray-700">{(FAMILY_TIPS[family] || {}).label || family}</span>
          </div>
          <p className="text-[10px] text-gray-700 leading-snug">
            Flux Kontext steers edits via the positive prompt only. Express what to <em>keep</em> ("preserve the face, pose, background") instead of a separate negative list.
          </p>
        </div>
      </Tooltip>
    )
  }

  // ── Supported state ───────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="text-[10px] uppercase tracking-wider text-rose-300/80 hover:text-rose-300 flex items-center gap-1">
          <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
          Negative prompt {value ? <span className="text-gray-600 normal-case font-normal">· in use</span> : <span className="text-gray-700 normal-case font-normal">· optional</span>}
        </button>
        {open && (
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => onChange(baseline)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Use {family === 'pony' ? 'Pony' : family === 'sdxl-hyper' ? 'Hyper' : 'SDXL'} baseline
            </button>
            {value && (
              <button type="button" onClick={() => onChange('')}
                className="text-[10px] text-gray-500 hover:text-gray-300">
                clear
              </button>
            )}
          </div>
        )}
      </div>
      {open && (
        <>
          <Input.TextArea
            value={value} onChange={e => onChange(e.target.value)}
            className="luxe-textarea"
            autoSize={{ minRows: 2, maxRows: 5 }}
            placeholder={family === 'pony'
              ? `Recommended: ${ponyBaseline.slice(0, 80)}…`
              : 'e.g. "blurry, watermark, deformed hands"'}
            maxLength={1000}
            showCount
          />
          <p className="text-[10px] text-gray-600 mt-1 leading-snug">
            Forwarded to ComfyUI's negative CLIPTextEncode. Leave blank to use the workflow's built-in default.
            {family === 'pony' && ' Pony NEEDS this — outputs look noisy without score_4..score_1.'}
          </p>
        </>
      )}
    </div>
  )
}

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

// Shared 3D-tilt handlers. Returns props you can spread on any card-like
// element. The CSS vars (--tx, --ty, --glx, --gly) drive perspective tilt
// and a cursor-following glow. Stays inert on touch (no mousemove events).
function useTilt(maxTiltDeg = 8) {
  const ref = useRef(null)
  const onMouseMove = (e) => {
    const el = ref.current; if (!el) return
    const rect = el.getBoundingClientRect()
    const dx = (e.clientX - rect.left) / rect.width - 0.5
    const dy = (e.clientY - rect.top) / rect.height - 0.5
    el.style.setProperty('--tx', `${(-dy * maxTiltDeg).toFixed(2)}deg`)
    el.style.setProperty('--ty', `${( dx * (maxTiltDeg + 2)).toFixed(2)}deg`)
    el.style.setProperty('--glx', `${((e.clientX - rect.left) / rect.width * 100).toFixed(1)}%`)
    el.style.setProperty('--gly', `${((e.clientY - rect.top) / rect.height * 100).toFixed(1)}%`)
  }
  const onMouseLeave = () => {
    const el = ref.current; if (!el) return
    el.style.setProperty('--tx', '0deg')
    el.style.setProperty('--ty', '0deg')
  }
  return { ref, onMouseMove, onMouseLeave }
}

// 3D-tilt workflow card. Hover the card to get a perspective-warp + neon
// glow follow-the-cursor effect. Falls back to flat on touch / reduced-motion.
function WorkflowCard({ workflow: w, active, onSelect }) {
  const tilt = useTilt(8)
  // Family → fully-spelled Tailwind classes (JIT can't see interpolated strings)
  const familyChip = w.family === 'upscale' ? 'bg-emerald-500/15 text-emerald-300'
    : w.family === 'img2img' ? 'bg-fuchsia-500/15 text-fuchsia-300'
    : w.family === 't2i'     ? 'bg-amber-500/15 text-amber-300'
    : 'bg-cyan-500/15 text-cyan-300'
  return (
    <button {...tilt} type="button" onClick={onSelect}
      style={{
        transform: 'perspective(800px) rotateX(var(--tx, 0deg)) rotateY(var(--ty, 0deg))',
        transition: 'transform 120ms ease-out, border-color 200ms, box-shadow 200ms',
      }}
      className={`luxe-card luxe-card-hover relative p-3 text-left overflow-hidden group will-change-transform ${
        active
          ? 'ring-2 ring-cyan-400/70 shadow-lg shadow-cyan-500/20'
          : ''
      }`}>
      {/* Cursor-following glow — purely cosmetic, pointer-events-none */}
      <span aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background: `radial-gradient(220px at var(--glx, 50%) var(--gly, 50%), rgba(56,189,248,0.18), transparent 65%)`,
        }} />
      {active && (
        <span aria-hidden className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500 flex items-center justify-center text-black shadow-md z-10">
          <CheckOutlined className="text-[10px] font-bold" />
        </span>
      )}
      <div className="relative">
        <div className="flex items-baseline justify-between mb-0.5">
          <span className={`text-xs font-bold ${active ? 'text-white' : 'text-gray-200'}`}>
            {w.icon} {w.label}
          </span>
          <span className="text-[9px] font-mono text-gray-500">{w.eta}</span>
        </div>
        <p className={`text-[10px] leading-snug ${active ? 'text-gray-300' : 'text-gray-500'}`}>{w.blurb}</p>
        <div className="flex gap-1 mt-1.5 text-[9px] flex-wrap">
          <span className={`px-1.5 py-0.5 rounded uppercase font-mono ${familyChip}`}>{w.family}</span>
          {w.needsImage && <span className="px-1.5 py-0.5 rounded uppercase font-mono bg-gray-800 text-gray-400">img</span>}
          {w.needsPrompt && <span className="px-1.5 py-0.5 rounded uppercase font-mono bg-gray-800 text-gray-400">prompt</span>}
        </div>
      </div>
    </button>
  )
}

// 3D-tilt Cloud preset card. Same physics as WorkflowCard but laid out with
// the gradient accent the cloud presets already use.
function PresetCard({ preset: p, active, onSelect, onExpand }) {
  const tilt = useTilt(7)
  return (
    <button {...tilt} type="button" onClick={onSelect}
      style={{
        transform: 'perspective(800px) rotateX(var(--tx, 0deg)) rotateY(var(--ty, 0deg))',
        transition: 'transform 120ms ease-out, border-color 200ms, box-shadow 200ms',
      }}
      className={`luxe-card luxe-card-hover relative p-4 text-left overflow-hidden group will-change-transform ${
        active
          ? `ring-2 ${p.border.replace('border-', 'ring-').replace('/40', '/70')} shadow-xl ${p.glow}`
          : ''
      }`}>
      {/* Cursor-following glow */}
      <span aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background: `radial-gradient(260px at var(--glx, 50%) var(--gly, 50%), rgba(255,255,255,0.10), transparent 65%)`,
        }} />
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
          <span onClick={(e) => { e.stopPropagation(); onExpand() }} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onExpand() } }}
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-700 hover:border-cyan-400 text-gray-400 hover:text-cyan-300 transition-colors cursor-pointer">
            <ExpandAltOutlined /> Expand
          </span>
        </div>
        <p className={`text-[11px] leading-snug ${active ? 'text-gray-300' : 'text-gray-500'}`}>
          {p.short}
        </p>
      </div>
    </button>
  )
}

function GenerateSection({
  sourceDataUrl, reset, handleFile, setSourceDataUrl, resultUrl, status, working, engine, job,
  activePreset, downloadResult, error, selectedPreset, setSelectedPreset,
  setExpandedPreset, enhance,
  atelierWorkflow, setAtelierWorkflow, tunings, setTunings,
  atelierPrompt, setAtelierPrompt,
  negativePrompt, setNegativePrompt,
  customModel, setCustomModel,
  setLogsModalOpen, setPromptHelperOpen,
  // t2iMode forces an Atelier text→image flow: hides the upload card,
  // filters the workflow grid to only T2I, and skips the Cloud presets.
  t2iMode = false,
  // familyFilter scopes the workflow grid to a category — passed down
  // from the parent so the chip + grid stay in sync. Optional; null /
  // 'all' shows everything. Values: 'img2img' | 't2i' | 'both' | 'upscale'.
  familyFilter: familyFilterProp = 'all',
  setFamilyFilter,
}) {
  // Canvas transforms applied to the current sourceDataUrl in-place. Used
  // by the rotate L/R + mirror buttons that appear when a source image is
  // loaded. Wraps transformImage() (canvas-based, see CameraCapture.jsx).
  const applyTransform = async (op) => {
    if (!sourceDataUrl || !setSourceDataUrl) return
    try {
      const next = await transformImage(sourceDataUrl, op)
      setSourceDataUrl(next)
    } catch (e) {
      antMessage.error(`Transform failed: ${e.message}`)
    }
  }
  // Camera snap → drop straight into the same sourceDataUrl slot as upload.
  // We also clear `sourceFile` (parent state) via reset+set so the BE side
  // sees a fresh image with no stale filename. Caveat: setSourceDataUrl
  // alone doesn't clear sourceFile, but it's only used for display in the
  // current code paths so this is fine.
  const handleCamera = (dataUrl) => {
    if (!setSourceDataUrl) return
    setSourceDataUrl(dataUrl)
  }
  const isAtelier = t2iMode || engine === 'atelier' || engine === 'local'
  // Family filter chip — sits above the workflow grid. 'all' shows
  // everything; the explicit values narrow to a single family. Hidden
  // when the page is already locked to t2iMode (the filter would be
  // redundant there). Lives on the parent so it survives re-renders.
  const familyFilter = familyFilterProp ?? 'all'
  // In T2I mode, only show t2i workflows. Otherwise apply the family
  // filter — 'all' means no filtering.
  const visibleWorkflows = t2iMode
    ? ATELIER_WORKFLOWS.filter(w => w.family === 't2i')
    : (familyFilter === 'all'
        ? ATELIER_WORKFLOWS
        : ATELIER_WORKFLOWS.filter(w => {
            if (familyFilter === 'img2img') return w.family === 'img2img' || w.family === 'edit'
            if (familyFilter === 't2i')     return w.family === 't2i'
            if (familyFilter === 'both')    return w.family === 'img2img' || w.family === 't2i'
            if (familyFilter === 'upscale') return w.family === 'upscale'
            return true
          }))
  const wf = ATELIER_WORKFLOWS.find(w => w.id === atelierWorkflow) || visibleWorkflows[0] || ATELIER_WORKFLOWS[0]
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
      <section className={`grid gap-4 mb-6 ${t2iMode ? 'sm:grid-cols-1' : 'sm:grid-cols-2'}`}>
          {!t2iMode && (
          <div className="rounded-2xl border-2 border-dashed border-gray-800 hover:border-cyan-500/40 transition-colors p-4 bg-gray-900/40">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Source image</p>
            {sourceDataUrl ? (
              <div className="space-y-2">
                <div className="relative">
                  <img src={sourceDataUrl} alt="source" className="w-full max-h-72 object-contain rounded-lg" />
                  <button onClick={reset}
                    className="luxe-btn luxe-btn-secondary absolute top-2 right-2 text-[10px]"
                    style={{ padding: '4px 10px' }}>
                    <SyncOutlined className="text-[9px]" /> Replace
                  </button>
                </div>
                {/* Quick canvas transforms: rotate −90° / +90° and horizontal
                    flip. Each runs on the data URL via transformImage() and
                    swaps it back into state so the BE receives the rotated
                    bytes. Visible only when an image is loaded. */}
                {setSourceDataUrl && (
                  <div className="flex items-center justify-center gap-1.5 flex-wrap pt-1">
                    <button onClick={() => applyTransform('rotate-left')}
                      title="Rotate 90° counter-clockwise"
                      className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-gray-700 hover:border-cyan-500 bg-gray-900/60 hover:bg-cyan-500/10 text-gray-300 hover:text-cyan-200 transition-colors">
                      ↺ Rotate L
                    </button>
                    <button onClick={() => applyTransform('rotate-right')}
                      title="Rotate 90° clockwise"
                      className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-gray-700 hover:border-cyan-500 bg-gray-900/60 hover:bg-cyan-500/10 text-gray-300 hover:text-cyan-200 transition-colors">
                      ↻ Rotate R
                    </button>
                    <button onClick={() => applyTransform('mirror')}
                      title="Flip horizontally"
                      className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-gray-700 hover:border-cyan-500 bg-gray-900/60 hover:bg-cyan-500/10 text-gray-300 hover:text-cyan-200 transition-colors">
                      ⇄ Mirror
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
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
                {/* Camera capture as an alternative to upload — handy on
                    phones / laptops where the user wants to shoot a quick
                    pic instead of digging through files. */}
                {setSourceDataUrl && (
                  <>
                    <div className="flex items-center gap-2 my-1">
                      <div className="flex-1 h-px bg-gray-800" />
                      <span className="text-[10px] uppercase tracking-wider text-gray-600">or</span>
                      <div className="flex-1 h-px bg-gray-800" />
                    </div>
                    <CameraCapture accentColor="#22d3ee" onSnap={handleCamera} />
                  </>
                )}
              </div>
            )}
          </div>
          )}

          <div className="luxe-card p-4 flex flex-col">
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
                  <div className={`w-8 h-8 rounded-full border-2 shrink-0 animate-spin ${
                    status === 'processing'
                      ? 'border-cyan-500/30 border-t-cyan-400'
                      : 'border-amber-500/30 border-t-amber-400'
                  }`} />
                  <div className="flex-1">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      {status === 'queued' ? (
                        <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /><span className="text-amber-300">Queued</span><span className="text-gray-500 font-normal">— waiting for worker</span></>
                      ) : status === 'processing' ? (
                        <><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /><span className="text-cyan-300">Processing</span><span className="text-gray-500 font-normal">— on the 5090</span></>
                      ) : (
                        <span className="text-gray-200">Enhancing…</span>
                      )}
                    </p>
                    {job?.imageId && <p className="text-[9px] text-gray-700 font-mono break-all">{job.imageId}</p>}
                  </div>
                  {/* View toggle — flat tail ↔ AgentPlan tree. */}
                  <button
                    type="button"
                    onClick={() => setLogsView(v => v === 'flat' ? 'plan' : 'flat')}
                    className="luxe-btn luxe-btn-secondary shrink-0 text-[10px]"
                    style={{ padding: '4px 10px' }}
                    title={logsView === 'flat' ? 'Switch to Plan view' : 'Switch to Logs view'}
                  >
                    {logsView === 'flat' ? 'Plan' : 'Logs'}
                  </button>
                  {/* Prominent View Logs button — always visible during processing */}
                  <button type="button" onClick={() => setLogsModalOpen(true)}
                    className="luxe-btn luxe-btn-secondary shrink-0 text-[10px]"
                    style={{ padding: '4px 10px' }}>
                    <ExpandAltOutlined className="text-[10px]" />
                    Live logs
                  </button>
                </div>
                {/* AgentPlan tree — polls /api/job-logs/image/:imageId itself. */}
                {logsView === 'plan' && job?.imageId && (
                  <div className="mt-1">
                    <JobLogsAgentPlan
                      lane="image"
                      jobId={job.imageId}
                      status={status}
                      progressMessage={job?.progressMessage}
                      error={job?.error}
                    />
                  </div>
                )}
                {/* Live log feed — Atelier path streams entries via /image-progress.
                    Click the panel or the Expand button to open the full-history modal. */}
                {logsView === 'flat' && Array.isArray(job?.logs) && job.logs.length > 0 && (
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
                      no filters, runs on your own GPU, ~30 sec.
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
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <h2 className="text-xs uppercase tracking-wider text-gray-500">
                  {t2iMode ? 'Text → Image workflow' : 'Workflow'}
                </h2>
                {/* Family filter chips — quick categorisation of the
                    workflow list. Hidden in t2iMode (already filtered). */}
                {!t2iMode && setFamilyFilter && (
                  <div className="inline-flex items-center gap-1 p-0.5 rounded-full bg-gray-900/60 border border-gray-800">
                    {[
                      { id: 'all',     label: 'All' },
                      { id: 'img2img', label: '🖼 Image → Image' },
                      { id: 't2i',     label: '✍ Text → Image' },
                      { id: 'both',    label: '↔ Both' },
                      { id: 'upscale', label: '⤴ Upscale' },
                    ].map(c => {
                      const active = familyFilterProp === c.id
                      return (
                        <button key={c.id} onClick={() => setFamilyFilter(c.id)}
                          className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white shadow-sm'
                              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                          }`}>
                          {c.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 [perspective:1200px]">
                {visibleWorkflows.length === 0 ? (
                  <div className="col-span-full text-center text-xs text-gray-500 py-6 border border-dashed border-gray-800 rounded-xl">
                    No workflows in this category — pick another filter above.
                  </div>
                ) : visibleWorkflows.map(w => {
                  const active = atelierWorkflow === w.id
                  return (
                    <WorkflowCard key={w.id} workflow={w} active={active}
                      onSelect={() => setAtelierWorkflow(w.id)} />
                  )
                })}
              </div>
            </div>

            {/* Prompt — required by some workflows. Pick from a template (drops
                into the textarea) or write your own freely. */}
            {wf.needsPrompt && (() => {
              const promptFamily = resolvePromptFamily(wf, customModel)
              const tip = FAMILY_TIPS[promptFamily]
              return (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] uppercase tracking-wider text-gray-500">Prompt</label>
                    <Tooltip title={`Tuned for ${tip?.label || 'SDXL'} — ${tip?.cfg || ''}`}>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-400 border border-gray-700/50">
                        {tip?.label || promptFamily}
                      </span>
                    </Tooltip>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setPromptHelperOpen?.(true)}
                      title="Help me write a prompt for this model"
                      className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-500/40 hover:border-amber-400 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition-colors">
                      <BulbOutlined className="text-[10px]" /> Help me write
                    </button>
                    <button type="button" onClick={() => setAtelierPrompt('')}
                      className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
                      clear
                    </button>
                  </div>
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
                  className="luxe-textarea"
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
                  {tip?.blurb || 'Pick a template to autofill — or stack multiple. You can edit freely afterwards.'}
                </p>
              </div>
              )
            })()}

            {/* Negative prompt — always shown when a prompt workflow is active,
                but greyed-out + explanatory tooltip when the model doesn't
                accept negatives (Flux Kontext). Same UX for the upscalers
                which don't use prompts at all — those hide it entirely. */}
            {wf.needsPrompt && (
              <NegativePromptField
                value={negativePrompt}
                onChange={setNegativePrompt}
                family={resolvePromptFamily(wf, customModel)}
                supported={wf.family !== 'edit'}
              />
            )}

            {/* Checkpoint picker — no free typing. The catalog above is the
                canonical list of models installed on the 5090. Picking one
                hydrates its sweet-spot tunings (steps / cfg / denoise) and
                shows a contextual note (Pony score-tags, Hyper-CFG, etc.). */}
            {showCustomModel && (() => {
              const meta = checkpointMeta(customModel)
              // Compatible checkpoints for this workflow's family — Flux
              // Kontext only accepts flux1, the SDXL/Pony pool fits everything
              // else. Pre-filter so users can't pick wrong → BE 400.
              const compat = CHECKPOINTS.filter(c =>
                wf.family === 'edit' ? c.family === 'flux' : c.family !== 'flux'
              )
              return (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
                    Checkpoint <span className="text-gray-700 normal-case font-normal">— installed on the 5090</span>
                  </label>
                  <Select
                    className="luxe-input w-full"
                    size="middle"
                    placeholder={`Default: ${defaultModel}`}
                    value={customModel || undefined}
                    allowClear
                    onChange={(v) => setCustomModel(v || '')}
                    optionLabelProp="label"
                    options={compat.map(c => ({
                      value: c.value,
                      label: c.label,
                      _blurb: c.blurb,
                    }))}
                    optionRender={(opt) => (
                      <div className="py-0.5">
                        <div className="text-[12px] font-semibold text-gray-100 leading-tight">
                          {opt.data.label}
                        </div>
                        <div className="text-[10px] text-gray-500 leading-snug mt-0.5">
                          {opt.data._blurb}
                        </div>
                      </div>
                    )}
                  />
                  {meta ? (
                    <p className="text-[10px] text-cyan-300 mt-1 leading-snug">
                      💡 Auto-tuned: steps={meta.defaults.steps}, CFG={meta.defaults.cfg}
                      {meta.defaults.denoise != null && `, denoise=${meta.defaults.denoise}`}
                      . {meta.note || 'Standard SDXL tunings.'}
                    </p>
                  ) : (
                    <p className="text-[10px] text-gray-600 mt-1">
                      Leave blank to use {wf.label}'s default checkpoint.
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Variation strength quick-presets — only for img2img custom.
                Maps to denoise: Subtle 0.25 / Balanced 0.50 / Heavy 0.75 / Wild 1.00.
                Demystifies what the denoise slider actually does. */}
            {showDenoise && wf.id === 'custom-sdxl' && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider text-gray-500">Variation</span>
                {[
                  { label: 'Subtle',   v: 0.25, hint: 'small polish, identity preserved' },
                  { label: 'Balanced', v: 0.50, hint: 'noticeable rework, recognizable' },
                  { label: 'Heavy',    v: 0.75, hint: 'major redraw, loose reference' },
                  { label: 'Wild',     v: 1.00, hint: 'fully reimagined, image as noise seed' },
                ].map(p => {
                  const active = Math.abs((tunings.denoise || 0) - p.v) < 0.02
                  return (
                    <Tooltip key={p.label} title={p.hint}>
                      <button type="button"
                        onClick={() => setTunings(t => ({ ...t, denoise: p.v }))}
                        className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                          active
                            ? 'bg-fuchsia-500/30 text-fuchsia-100 border-fuchsia-400/60 shadow-md shadow-fuchsia-500/20'
                            : 'bg-gray-900/60 text-gray-400 border-gray-800 hover:border-gray-700 hover:text-gray-200'
                        }`}>
                        {p.label} <span className="font-mono opacity-60">{p.v.toFixed(2)}</span>
                      </button>
                    </Tooltip>
                  )
                })}
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
          // Cloud mode: existing preset cards (now with 3D tilt + glow)
          <section className="mb-6">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Choose a polish</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 [perspective:1200px]">
              {PRESETS.map(p => (
                <PresetCard key={p.id} preset={p}
                  active={selectedPreset === p.id}
                  onSelect={() => setSelectedPreset(p.id)}
                  onExpand={() => setExpandedPreset(p.id)} />
              ))}
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
            className={`luxe-btn luxe-btn-primary w-full sm:w-auto ${
              ((wf.needsImage && !sourceDataUrl && isAtelier) || (!isAtelier && !sourceDataUrl) || working)
                ? 'opacity-50 cursor-not-allowed'
                : ''
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
  // Bulk selection state. selectMode toggles the checkbox overlay on each
  // card; selected is a Set of imageIds. Cleared on tab/filter switch.
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => { setPage(1); setSelected(new Set()) }, [filter, visibility, refreshKey])
  useEffect(() => { if (!selectMode) setSelected(new Set()) }, [selectMode])

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

  const toggleSelect = (imageId) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(imageId)) next.delete(imageId)
      else next.add(imageId)
      return next
    })
  }
  const selectAllOnPage = () => {
    setSelected(new Set(data.items.map(it => it.imageId)))
  }
  const clearSelection = () => setSelected(new Set())

  const askDelete = (img) => {
    Modal.confirm({
      title: 'Delete this image?',
      content: (
        <div className="text-sm text-gray-100">
          <p className="mb-2 italic line-clamp-2 text-gray-200">"{img.prompt?.slice(0, 200)}"</p>
          <p className="text-xs text-rose-300 font-medium">
            ⚠ Removes the row + Cloudinary asset. Can't be undone.
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

  // Single-row vault toggle — wired to the per-card "🔒" / "🌐" button.
  const setSingleVault = async (img, moveToVault) => {
    const { error: err } = await imageBulkAction(
      moveToVault ? 'move-to-vault' : 'make-public',
      [img.imageId]
    )
    if (err) {
      antMessage.error(err.includes('login') ? 'Unlock the vault first' : `Failed: ${err}`)
      return
    }
    antMessage.success(moveToVault ? 'Moved to Vault' : 'Made public')
    setInternalReload(n => n + 1)
  }

  // Bulk action wrapper. Action is one of 'move-to-vault' | 'make-public' | 'delete'.
  const doBulk = async (action) => {
    const ids = Array.from(selected)
    if (!ids.length) { antMessage.warning('Select at least one image'); return }
    const verb = action === 'delete' ? 'Delete' : action === 'move-to-vault' ? 'Move to Vault' : 'Make public'
    Modal.confirm({
      title: `${verb} ${ids.length} image${ids.length === 1 ? '' : 's'}?`,
      content: action === 'delete' ? (
        <p className="text-sm text-rose-300 font-medium">⚠ Removes rows + Cloudinary assets. Can't be undone.</p>
      ) : action === 'move-to-vault' ? (
        <p className="text-sm text-gray-100">Selected items vanish from the public showcase. Only visible in 🔒 Vault tab.</p>
      ) : (
        <p className="text-sm text-gray-100">Selected items become visible to anyone in the 🌐 Public tab.</p>
      ),
      okText: verb,
      okButtonProps: action === 'delete' ? { danger: true } : {},
      cancelText: 'Cancel',
      centered: true,
      onOk: async () => {
        setBulkBusy(true)
        const { data: result, error: err } = await imageBulkAction(action, ids)
        setBulkBusy(false)
        if (err) {
          antMessage.error(err.includes('login') ? 'Unlock the vault first' : `Failed: ${err}`)
          return
        }
        antMessage.success(`${verb}: ${result?.affected ?? ids.length} done`)
        setSelected(new Set())
        setSelectMode(false)
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
  const selCount = selected.size
  return (
    <div className="space-y-4">
      {/* Visibility toggle — Public showcase / Vault (private, requires login).
          Vault chip is hidden entirely when not logged in. */}
      <div className="flex items-center gap-2 flex-wrap">
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

        {/* Select-mode toggle — flip on, then check whichever cards you want
            and a sticky toolbar pops up at the bottom of the grid. */}
        <button onClick={() => setSelectMode(s => !s)}
          className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
            selectMode
              ? 'bg-amber-500/20 text-amber-200 border-amber-400/50'
              : 'bg-gray-900/60 text-gray-400 border-gray-800 hover:border-gray-700 hover:text-gray-200'
          }`}>
          {selectMode ? `Selecting (${selCount})` : '☑ Select'}
        </button>
        {selectMode && (
          <>
            <button onClick={selectAllOnPage}
              className="px-2 py-1.5 text-[10px] rounded-full bg-gray-900/60 text-gray-400 border border-gray-800 hover:text-gray-200">
              All on page
            </button>
            <button onClick={clearSelection}
              className="px-2 py-1.5 text-[10px] rounded-full bg-gray-900/60 text-gray-400 border border-gray-800 hover:text-gray-200">
              Clear
            </button>
          </>
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
          {data.items.map(it => (
            <LibraryCard key={it.imageId} image={it} onDelete={askDelete}
              selectMode={selectMode}
              checked={selected.has(it.imageId)}
              onToggleSelect={() => toggleSelect(it.imageId)}
              loggedIn={loggedIn}
              onMoveToVault={() => setSingleVault(it, true)}
              onMakePublic={() => setSingleVault(it, false)}
            />
          ))}
        </div>
      )}

      {/* Sticky bulk toolbar — appears when select-mode is on and at least
          one card is selected. Move/Public actions require vault auth; the
          BE rejects with 401 if missing. */}
      {selectMode && selCount > 0 && (
        <div className="sticky bottom-3 z-30 mx-auto max-w-xl">
          <div className="rounded-2xl border border-cyan-500/40 bg-gradient-to-r from-gray-900/95 via-gray-950/95 to-gray-900/95 backdrop-blur p-3 shadow-2xl shadow-cyan-500/10 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-gray-300">
              <span className="font-mono text-cyan-300">{selCount}</span> selected
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {loggedIn && visibility === 'public' && (
                <button onClick={() => doBulk('move-to-vault')} disabled={bulkBusy}
                  className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 font-semibold disabled:opacity-50">
                  <LockOutlined /> Move to Vault
                </button>
              )}
              {loggedIn && visibility === 'vault' && (
                <button onClick={() => doBulk('make-public')} disabled={bulkBusy}
                  className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 font-semibold disabled:opacity-50">
                  🌐 Make public
                </button>
              )}
              <button onClick={() => doBulk('delete')} disabled={bulkBusy}
                className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 font-semibold disabled:opacity-50">
                <DeleteOutlined /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LibraryCard({ image, onDelete, selectMode = false, checked = false, onToggleSelect, loggedIn = false, onMoveToVault, onMakePublic }) {
  const url = image.outputUrl || image.sourceUrl
  const handleClick = (e) => {
    if (selectMode) { e.preventDefault(); onToggleSelect?.() }
  }
  // In-flight / failed images go to the standalone detail page (live logs +
  // shareable URL + survives refresh). Completed images open the full-size
  // version in a new tab as before.
  const isActive = image.status && image.status !== 'completed'
  const Linker = isActive ? Link : 'a'
  const linkerProps = isActive
    ? { to: `/image-enhancer/${encodeURIComponent(image.imageId)}` }
    : { href: url || '#', target: '_blank', rel: 'noopener' }
  return (
    <div className={`group relative aspect-square rounded-xl overflow-hidden border transition-all bg-gray-900/40 ${
      checked
        ? 'border-cyan-400 shadow-lg shadow-cyan-500/30 ring-2 ring-cyan-400/40'
        : 'border-gray-800 hover:border-cyan-400/50'
    }`}>
      <Linker {...linkerProps} onClick={handleClick}
        className={`block w-full h-full ${selectMode ? 'cursor-pointer' : ''}`}>
        {url ? (
          <img src={url} alt={image.prompt}
            className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${
              selectMode && !checked ? 'opacity-60' : ''
            }`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-950">
            <span className="text-3xl opacity-50">
              {image.status === 'failed' ? '✗' : image.status === 'processing' ? '⚡' : '⏳'}
            </span>
          </div>
        )}
      </Linker>

      {/* Selection checkbox — overlay when select-mode is on */}
      {selectMode && (
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect?.() }}
          className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold transition-all z-20 ${
            checked
              ? 'bg-cyan-400 text-black shadow-md'
              : 'bg-black/70 text-gray-400 border border-white/20 hover:bg-black/90 hover:text-white'
          }`}>
          {checked ? <CheckOutlined className="text-[11px]" /> : ''}
        </button>
      )}

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
      {/* Action buttons — appear on hover (or always on touch). Vault toggle
          only shows when logged in; the right button matches the current
          visibility (vault tab → "Make public", public tab → "Move to Vault"). */}
      {!selectMode && (
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {loggedIn && image.vault === 0 && onMoveToVault && (
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMoveToVault() }}
              title="Move to Vault (private)"
              className="w-7 h-7 flex items-center justify-center rounded-full bg-black/70 hover:bg-emerald-600 text-gray-200 hover:text-white">
              <LockOutlined className="text-xs" />
            </button>
          )}
          {loggedIn && image.vault === 1 && onMakePublic && (
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMakePublic() }}
              title="Make public"
              className="w-7 h-7 flex items-center justify-center rounded-full bg-black/70 hover:bg-cyan-600 text-gray-200 hover:text-white text-xs">
              🌐
            </button>
          )}
          {onDelete && (
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(image) }}
              title="Delete"
              className="w-7 h-7 flex items-center justify-center rounded-full bg-black/70 hover:bg-rose-600 text-gray-200 hover:text-white">
              <DeleteOutlined className="text-xs" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Full live-log viewer for an Atelier image job ──
// ─── Prompt helper modal ───────────────────────────────────────────
// Opens from the 💡 button next to the prompt textarea. Two sections:
//   1. Sample prompts — family-filtered, click "Use" to replace or "+" to append
//   2. ✨ Ask AI — type your idea in plain English, Groq (via /api/ai/prompt-coach)
//      rewrites it with the right syntax for the selected model family
function PromptHelperModal({
  open, onClose, workflow, customModel, currentPrompt, onApply, onAppend, onApplyNegative,
  // Coach state passed from the parent page so it survives close/reopen.
  // Falls back to local state when used outside the page (e.g. unit tests).
  idea: parentIdea, setIdea: setParentIdea,
  coachResult: parentResult, setCoachResult: setParentResult,
  coachError: parentError, setCoachError: setParentError,
}) {
  const family = resolvePromptFamily(workflow, customModel)
  const tip = FAMILY_TIPS[family] || FAMILY_TIPS.sdxl
  const samples = PROMPT_SAMPLES[family] || PROMPT_SAMPLES.sdxl

  // Use parent-provided setters if available, otherwise fall back to local.
  const [localIdea, setLocalIdea] = useState('')
  const [localResult, setLocalResult] = useState(null)
  const [localError, setLocalError] = useState('')
  const idea = setParentIdea ? parentIdea : localIdea
  const setIdea = setParentIdea || setLocalIdea
  const coachResult = setParentResult ? parentResult : localResult
  const setCoachResult = setParentResult || setLocalResult
  const coachError = setParentError ? parentError : localError
  const setCoachError = setParentError || setLocalError

  const [coachLoading, setCoachLoading] = useState(false)

  const copy = async (text, label = 'Prompt') => {
    try {
      await navigator.clipboard.writeText(text)
      antMessage.success(`${label} copied`)
    } catch {
      antMessage.error('Could not copy — your browser blocked clipboard access')
    }
  }

  const askCoach = async () => {
    if (!idea.trim() || idea.trim().length < 3) {
      setCoachError('Tell the coach what you want (at least 3 chars)')
      return
    }
    setCoachLoading(true); setCoachError(''); setCoachResult(null)
    const { data, error: err } = await promptCoach({
      idea: idea.trim(),
      family,
      model: customModel || workflow?.checkpoint,
    })
    setCoachLoading(false)
    if (err) { setCoachError(err); return }
    setCoachResult(data)
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      centered
      closeIcon={null}
      styles={{
        content: { background: '#0b0f17', padding: 0, borderRadius: 16, border: '1px solid rgba(251,191,36,0.25)', maxWidth: '95vw' },
        body: { padding: 0 },
        mask: { backdropFilter: 'blur(6px)' },
      }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-800/80 bg-gradient-to-r from-amber-500/10 via-fuchsia-500/5 to-transparent">
        <div className="flex items-center gap-2 min-w-0">
          <BulbOutlined className="text-amber-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-white tracking-wide">
              Prompt helper
              <span className="ml-2 text-[10px] font-mono text-amber-300/80">{tip.label}</span>
            </h3>
            <p className="text-[10px] text-gray-500 leading-snug mt-0.5">{tip.blurb}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(idea || coachResult) && (
            <button
              onClick={() => { setIdea(''); setCoachResult(null); setCoachError('') }}
              title="Clear the idea + last result"
              className="text-[10px] uppercase tracking-wider text-gray-500 hover:text-amber-300 px-2 py-1 rounded border border-gray-800 hover:border-amber-500/50">
              ↻ Reset
            </button>
          )}
          <button onClick={onClose}
            className="text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-300 px-2 py-1 rounded border border-gray-800 hover:border-gray-700">
            esc
          </button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-5 space-y-5">
        {/* ── Section: AI coach ────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-fuchsia-300 font-semibold">
              ✨ Describe what you want
            </span>
            <span className="text-[9px] font-mono text-gray-600">powered by Groq · llama-3.3-70b</span>
          </div>
          <Input.TextArea
            value={idea}
            onChange={(e) => { setIdea(e.target.value); if (coachError) setCoachError('') }}
            autoSize={{ minRows: 2, maxRows: 5 }}
            placeholder={
              family === 'flux'
                ? 'e.g. "swap the shirt to a navy blazer, keep everything else the same"'
                : family === 'pony'
                  ? 'e.g. "anime girl with long silver hair, looking at viewer, soft sunset"'
                  : 'e.g. "moody portrait of a chef in a smoky kitchen at golden hour"'
            }
            disabled={coachLoading}
            maxLength={500}
            showCount
            onPressEnter={(e) => {
              if (!e.shiftKey) { e.preventDefault(); askCoach() }
            }}
          />
          {coachError && (
            <p className="text-rose-400 text-xs mt-2">✗ {coachError}</p>
          )}
          <div className="flex items-center justify-between gap-2 mt-2">
            <p className="text-[10px] text-gray-600">
              Press <span className="font-mono text-gray-400">Enter</span> to ask · Shift+Enter for newline
            </p>
            <button onClick={askCoach} disabled={coachLoading || !idea.trim()}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                coachLoading || !idea.trim()
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-fuchsia-500 to-amber-500 text-black hover:scale-[1.02]'
              }`}>
              {coachLoading ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                  Thinking…
                </>
              ) : (
                <>✨ Generate prompt</>
              )}
            </button>
          </div>

          {coachResult && (
            <div className="mt-3 rounded-xl border border-fuchsia-500/40 bg-gradient-to-b from-fuchsia-500/10 to-transparent p-3 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-fuchsia-300 font-semibold">
                    Tuned prompt
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => copy(coachResult.prompt)}
                      className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700">
                      <CopyOutlined /> Copy
                    </button>
                    <button onClick={() => onApply(coachResult.prompt, coachResult.negative)}
                      title={coachResult.negative ? 'Apply prompt + negative' : 'Apply prompt'}
                      className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-500/30 hover:bg-fuchsia-500/40 text-fuchsia-200 border border-fuchsia-500/50 font-semibold">
                      <CheckOutlined /> Use {coachResult.negative ? 'both' : 'this'}
                    </button>
                  </div>
                </div>
                <p className="text-[12px] text-gray-200 font-mono leading-relaxed whitespace-pre-wrap break-words">
                  {coachResult.prompt}
                </p>
              </div>
              {family === 'flux' && !coachResult.negative && (
                <div className="pt-2 border-t border-fuchsia-500/20">
                  <p className="text-[10px] text-gray-500 italic">
                    🚫 Flux Kontext doesn't use negative prompts. Steer edits via the positive prompt only.
                  </p>
                </div>
              )}
              {coachResult.negative && (
                <div className="pt-2 border-t border-fuchsia-500/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wider text-rose-300 font-semibold">
                      Negative prompt (suggested)
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => copy(coachResult.negative, 'Negative')}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700">
                        <CopyOutlined /> Copy
                      </button>
                      {onApplyNegative && (
                        <button onClick={() => { onApplyNegative(coachResult.negative); antMessage.success('Negative prompt applied') }}
                          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 font-semibold">
                          <CheckOutlined /> Apply
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 font-mono leading-relaxed whitespace-pre-wrap break-words">
                    {coachResult.negative}
                  </p>
                  <p className="text-[9px] text-gray-600 mt-1.5">
                    Click <span className="text-rose-300 font-semibold">Apply</span> to drop it into the Negative prompt field below the main prompt.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Divider ───────────────────────────────────────── */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <div className="w-full border-t border-gray-800" />
          </div>
          <div className="relative flex justify-center">
            <span className="px-2 bg-[#0b0f17] text-[9px] uppercase tracking-widest text-gray-600">
              or pick a starter
            </span>
          </div>
        </div>

        {/* ── Section: Samples ─────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-cyan-300 font-semibold">
              📋 Sample prompts for {tip.label}
            </span>
            <span className="text-[9px] font-mono text-gray-600">{samples.length} starter{samples.length === 1 ? '' : 's'}</span>
          </div>
          <ul className="space-y-2">
            {samples.map((s, i) => (
              <li key={i} className="rounded-xl border border-gray-800 bg-gray-900/40 hover:border-cyan-500/40 transition-colors p-3 group">
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[12px] font-semibold text-gray-100 truncate">{s.title}</span>
                    <div className="flex gap-1 shrink-0">
                      {(s.tags || []).map(t => (
                        <span key={t} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Tooltip title="Copy to clipboard">
                      <button onClick={() => copy(s.text)}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-gray-800/70 hover:bg-gray-700 text-gray-400 hover:text-gray-200 border border-gray-700/60">
                        <CopyOutlined />
                      </button>
                    </Tooltip>
                    {currentPrompt?.trim() && (
                      <Tooltip title="Append to current prompt (comma-separated)">
                        <button onClick={() => onAppend(s.text)}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-gray-800/70 hover:bg-gray-700 text-gray-400 hover:text-gray-200 border border-gray-700/60">
                          + add
                        </button>
                      </Tooltip>
                    )}
                    <button onClick={() => onApply(s.text)}
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 font-semibold">
                      <CheckOutlined /> Use
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 font-mono leading-relaxed break-words">
                  {s.text}
                </p>
                {s.neg && (
                  <details className="mt-2">
                    <summary className="text-[10px] text-rose-300/80 cursor-pointer hover:text-rose-300">
                      Negative prompt (recommended for {tip.label})
                    </summary>
                    <div className="mt-1 flex items-start gap-2">
                      <p className="text-[10px] text-gray-500 font-mono leading-relaxed flex-1 break-words">{s.neg}</p>
                      <button onClick={() => copy(s.neg, 'Negative')}
                        className="shrink-0 flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400">
                        <CopyOutlined />
                      </button>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  )
}

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
