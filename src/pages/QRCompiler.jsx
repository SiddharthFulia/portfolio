// QR Compiler — a proper Reed–Solomon ECC studio, not a toy generator.
//
// The whole page is a live experiment on QR codes. We build the matrix
// with `qrcode-generator` (kazuhikoarase, port of the Denso Wave spec),
// paint every cell by hand on a <canvas> (so shapes/eyes/gradients are
// ours to bend), then feed the ImageData back into `jsQR` to prove the
// thing still scans. Because RS ECC gives us a 7–30% pixel budget to
// throw away, we deliberately spend it — logos, image bake-ins, damage
// simulation. The scan-test panel keeps everyone honest.
//
// Shared vibe: PhysicsLab / Chernobyl / Atoms / Pathfinding — luxe-glass
// panels, KaTeX with hover tooltips at physics-major depth, mobile-safe.
//
// No BE. Everything runs in the browser.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Segmented, Switch, Tooltip, InputNumber, Input, Progress, Upload } from 'antd'
import { Slider, Button } from '../components/ui'
import {
  ScanOutlined, ThunderboltFilled, ReloadOutlined, DownloadOutlined,
  UploadOutlined, InfoCircleOutlined, CheckCircleFilled, CloseCircleFilled,
  ExperimentOutlined, DeleteOutlined, PictureOutlined, BulbOutlined,
  AppstoreOutlined, RadarChartOutlined,
} from '@ant-design/icons'
import katex from 'katex'
import qrcode from 'qrcode-generator'
import jsQR from 'jsqr'
import { Link } from 'react-router-dom'
import {
  createQrSave, listQrSaves, deleteQrSave, patchQrSave,
} from '../api/qrSaves'
import { notice } from '../lib/notice'
import QRScenes3D from '../components/qr/QRScenes3D'
import TattooStudio from '../components/qr/TattooStudio'

// ─── KaTeX helpers (identical shape to PhysicsLab / Atoms) ─────────
function renderTex(src, opts = {}) {
  try {
    return katex.renderToString(src, {
      throwOnError: false,
      displayMode: !!opts.display,
      strict: 'ignore',
      output: 'html',
    })
  } catch (e) { return `<span class="text-rose-400">${String(src)}</span>` }
}
function Tex({ src, display, className = '' }) {
  const html = useMemo(() => renderTex(src, { display }), [src, display])
  return (
    <span
      className={`katex-host ${display ? 'block overflow-x-auto' : 'inline-block'} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
function Sym({ tex, help, className = '' }) {
  return (
    <Tooltip title={help} placement='top' overlayStyle={{ maxWidth: 380 }}>
      <span
        className={`katex-host inline-block cursor-help border-b border-dashed border-white/20 hover:border-amber-300/60 ${className}`}
        dangerouslySetInnerHTML={{ __html: renderTex(tex) }}
      />
    </Tooltip>
  )
}
function FieldHelp({ children }) {
  return <p className='text-[11px] text-fg-muted mt-1 leading-snug'>{children}</p>
}

// ─── Symbol glossary at physics-major depth ─────────────────────────
const HELP = {
  n:   'n — total codeword length in symbols (8-bit bytes over GF(2⁸)). Fixed by the QR version chosen: e.g. version 1 has n = 26 codewords, version 40 has n = 3706.',
  k:   'k — number of data (message) symbols in the codeword. Everything else is Reed–Solomon parity. The ratio k/n falls as ECC level rises.',
  t:   't — the guaranteed number of symbol errors an RS(n,k) code can correct. From the singleton bound: 2t = n − k, so t = (n − k)/2. QR further needs t ≥ e + 2s (e = erasures, s = errors).',
  gf:  'GF(2⁸) — the Galois field of 256 elements, built as GF(2)[x]/(x⁸+x⁴+x³+x²+1). Every RS symbol is an element of this field, so bytes multiply and add via polynomial arithmetic mod that primitive polynomial.',
  alpha: 'α — a primitive element (generator) of GF(2⁸). Every non-zero element of the field is some power αⁱ with 0 ≤ i ≤ 254. The RS generator polynomial has roots αᵇ, α^(b+1), …, α^(b+2t−1).',
  mask: 'f(i,j) — the mask pattern function. QR defines 8 formulas indexed 0–7 (e.g. mask 0: (i + j) mod 2 = 0). The chosen mask is XOR-ed onto the data + ECC bit matrix to break up long runs of same-colour modules (which confuse decoders).',
  L:   'L — Low ECC. ~7% of codewords are RS parity. Best data capacity, weakest damage tolerance.',
  M:   'M — Medium ECC. ~15% parity. Balanced.',
  Q:   'Q — Quartile ECC. ~25% parity. Recommended for anything with a logo overlay.',
  H:   'H — High ECC. ~30% parity. Densest QR, but survives severe defacement — the setting behind every artistic / branded QR you have seen.',
  ver: 'v — QR version, 1–40. Higher versions add 4 modules per side (v1 = 21×21, v40 = 177×177). Higher versions store more data, but the pixels are smaller per unit area.',
  budget: 'B — ECC "waste" budget. Roughly the fraction of modules you can overwrite before decoding fails. For H-level QRs, B ≈ 0.30, so a centred 30% logo is right at the ragged edge of decodability.',
  xor: '⊕ — XOR (mod-2 addition), the group operation of GF(2). QR masks the data + ECC bits by XOR-ing with the chosen mask matrix.',
  finder: 'Finder pattern — the three 7×7 concentric squares in the corners. The decoder locates them first (they have a fixed run-length signature 1:1:3:1:1) and uses them to establish the perspective transform.',
  alignment: 'Alignment pattern — the 5×5 concentric square(s) inserted from version 2 onwards. Anchors distortion correction across the QR body.',
  timing: 'Timing pattern — the horizontal and vertical strips of alternating black/white modules on row 6 / column 6. Establishes the module grid size.',
  quiet: 'Quiet zone — the mandatory white margin (≥ 4 modules per QR spec) around the QR. Skipping it drops readability sharply on real cameras.',
  halftone: 'Halftone / Floyd–Steinberg — a 1957 error-diffusion dithering algorithm. Each pixel is thresholded to 0/1 and the quantisation error is spread to the four neighbours (7/16 E, 3/16 SW, 5/16 S, 1/16 SE). Locally the average intensity is preserved, so a b/w picture reads as a grey image at a distance.',
}

// ─── Payload encoders — every one of the classic QR "types" ────────
// We ship the exact strings the QR spec / real-world scanners expect.
// A phone that reads WIFI:S:foo;T:WPA;P:bar;; will offer a "Connect" chip.
const PAYLOAD_TYPES = ['URL', 'Text', 'Wi-Fi', 'vCard', 'SMS', 'Email', 'Geo', 'UPI']

function encodePayload(kind, fields) {
  const esc = (s) => String(s || '').replace(/([\\;,":])/g, '\\$1')
  switch (kind) {
    case 'URL':   return String(fields.url || '').trim() || ''
    case 'Text':  return String(fields.text || '')
    case 'Wi-Fi': {
      const T = fields.auth || 'WPA'
      const S = esc(fields.ssid)
      const P = fields.auth === 'nopass' ? '' : esc(fields.password)
      const H = fields.hidden ? 'true' : 'false'
      return `WIFI:S:${S};T:${T};P:${P};H:${H};;`
    }
    case 'vCard': {
      const N = (fields.name || '').trim()
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${N}`,
        fields.org ? `ORG:${fields.org}` : null,
        fields.title ? `TITLE:${fields.title}` : null,
        fields.phone ? `TEL;TYPE=CELL:${fields.phone}` : null,
        fields.email ? `EMAIL:${fields.email}` : null,
        fields.url ? `URL:${fields.url}` : null,
        'END:VCARD',
      ].filter(Boolean).join('\n')
    }
    case 'SMS':   return `SMSTO:${fields.phone || ''}:${fields.message || ''}`
    case 'Email': return `MATMSG:TO:${fields.to || ''};SUB:${fields.subject || ''};BODY:${fields.body || ''};;`
    case 'Geo':   return `geo:${fields.lat || 0},${fields.lon || 0}${fields.zoom ? `?z=${fields.zoom}` : ''}`
    case 'UPI': {
      const p = new URLSearchParams()
      if (fields.pa) p.set('pa', fields.pa)
      if (fields.pn) p.set('pn', fields.pn)
      if (fields.am) p.set('am', fields.am)
      if (fields.tn) p.set('tn', fields.tn)
      p.set('cu', fields.cu || 'INR')
      return `upi://pay?${p.toString()}`
    }
    default: return ''
  }
}

// ─── Cell / eye shape enumerations ──────────────────────────────────
const CELL_SHAPES = ['Square', 'Rounded', 'Dot', 'Diamond', 'Cross', 'Star']
const EYE_SHAPES  = ['Square', 'Rounded', 'Leaf', 'Circle']
const ECC_LEVELS  = ['L', 'M', 'Q', 'H']
const ECC_BUDGET  = { L: 0.07, M: 0.15, Q: 0.25, H: 0.30 }
const BLEND_MODES = ['Normal', 'Multiply', 'Overlay', 'Screen']

// A finder pattern lives in the top-left, top-right, bottom-left 7×7 corner.
// The decoder needs those corners intact; we detect membership so we can
// draw the eye/inner-eye shapes differently from a body module.
function isFinderModule(r, c, N) {
  return (
    (r < 7 && c < 7) ||
    (r < 7 && c >= N - 7) ||
    (r >= N - 7 && c < 7)
  )
}
function isFinderRing(r, c, N) {
  // The outer 7×7 border ring of one of the three finder patterns.
  const inTL = r < 7 && c < 7
  const inTR = r < 7 && c >= N - 7
  const inBL = r >= N - 7 && c < 7
  if (!(inTL || inTR || inBL)) return false
  const [r0, c0] = inTL ? [0, 0] : inTR ? [0, N - 7] : [N - 7, 0]
  const dr = r - r0, dc = c - c0
  return dr === 0 || dr === 6 || dc === 0 || dc === 6
}
function isFinderInner(r, c, N) {
  const inTL = r < 7 && c < 7
  const inTR = r < 7 && c >= N - 7
  const inBL = r >= N - 7 && c < 7
  if (!(inTL || inTR || inBL)) return false
  const [r0, c0] = inTL ? [0, 0] : inTR ? [0, N - 7] : [N - 7, 0]
  const dr = r - r0, dc = c - c0
  return dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
}

// ─── Deterministic PRNG for the damage sim ──────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Build a QR matrix (0/1) from a payload + config ────────────────
// Returns { matrix, N, version, ecc } or null if the payload is empty
// or over-capacity.
function buildQR(payload, versionReq, ecc) {
  if (!payload) return null
  // versionReq = 0 → auto-fit
  try {
    const qr = qrcode(versionReq, ecc)
    qr.addData(payload)
    qr.make()
    const N = qr.getModuleCount()
    const matrix = new Uint8Array(N * N)
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        matrix[r * N + c] = qr.isDark(r, c) ? 1 : 0
      }
    }
    // Compute effective version from module count: N = 4v + 17.
    const version = (N - 17) / 4
    return { matrix, N, version, ecc }
  } catch (e) {
    return null
  }
}

// ─── Draw one module in the chosen shape ─────────────────────────────
function drawModule(ctx, x, y, s, shape, radius, gap) {
  const g = gap * s
  const pad = g / 2
  const sx = x + pad, sy = y + pad, ss = s - g
  if (ss <= 0) return
  switch (shape) {
    case 'Square': {
      const r = (radius / 100) * (ss / 2)
      if (r <= 0) {
        ctx.fillRect(sx, sy, ss, ss)
      } else {
        roundRect(ctx, sx, sy, ss, ss, r); ctx.fill()
      }
      break
    }
    case 'Rounded': {
      const r = Math.max(1, (radius / 100) * (ss / 2)) || ss * 0.3
      roundRect(ctx, sx, sy, ss, ss, r); ctx.fill()
      break
    }
    case 'Dot': {
      ctx.beginPath()
      ctx.arc(sx + ss / 2, sy + ss / 2, ss / 2, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'Diamond': {
      const cx = sx + ss / 2, cy = sy + ss / 2, h = ss / 2
      ctx.beginPath()
      ctx.moveTo(cx, cy - h)
      ctx.lineTo(cx + h, cy)
      ctx.lineTo(cx, cy + h)
      ctx.lineTo(cx - h, cy)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'Cross': {
      const th = ss * 0.36
      const off = (ss - th) / 2
      ctx.fillRect(sx + off, sy, th, ss)
      ctx.fillRect(sx, sy + off, ss, th)
      break
    }
    case 'Star': {
      const cx = sx + ss / 2, cy = sy + ss / 2
      const rO = ss / 2, rI = rO * 0.42
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const ang = (Math.PI / 5) * i - Math.PI / 2
        const r = i % 2 === 0 ? rO : rI
        const px = cx + r * Math.cos(ang), py = cy + r * Math.sin(ang)
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
      break
    }
    default:
      ctx.fillRect(sx, sy, ss, ss)
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

// Draw a whole finder eye at cell coords (r0,c0) size 7 in the given shape.
function drawEye(ctx, x, y, cell, shape, isOuter) {
  const size = 7 * cell
  ctx.save()
  if (shape === 'Circle') {
    ctx.beginPath()
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
    ctx.fill()
    if (isOuter) {
      // punch a white ring for outer ring
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(x + size / 2, y + size / 2, (5 / 7) * (size / 2), 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
  } else if (shape === 'Rounded') {
    roundRect(ctx, x, y, size, size, size * 0.28); ctx.fill()
    if (isOuter) {
      ctx.globalCompositeOperation = 'destination-out'
      roundRect(ctx, x + cell, y + cell, size - 2 * cell, size - 2 * cell, size * 0.22)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
  } else if (shape === 'Leaf') {
    const r = size * 0.5
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.quadraticCurveTo(x + size, y, x + size, y + r)
    ctx.lineTo(x + size, y + size)
    ctx.lineTo(x + r, y + size)
    ctx.quadraticCurveTo(x, y + size, x, y + r)
    ctx.closePath()
    ctx.fill()
    if (isOuter) {
      ctx.globalCompositeOperation = 'destination-out'
      const s2 = size - 2 * cell, xr = x + cell, yr = y + cell, r2 = s2 * 0.5
      ctx.beginPath()
      ctx.moveTo(xr + r2, yr)
      ctx.quadraticCurveTo(xr + s2, yr, xr + s2, yr + r2)
      ctx.lineTo(xr + s2, yr + s2)
      ctx.lineTo(xr + r2, yr + s2)
      ctx.quadraticCurveTo(xr, yr + s2, xr, yr + r2)
      ctx.closePath()
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
  } else {
    ctx.fillRect(x, y, size, size)
    if (isOuter) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillRect(x + cell, y + cell, size - 2 * cell, size - 2 * cell)
      ctx.globalCompositeOperation = 'source-over'
    }
  }
  ctx.restore()
}
function drawEyeInner(ctx, x, y, cell, shape) {
  const size = 3 * cell
  if (shape === 'Circle') {
    ctx.beginPath()
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
    ctx.fill()
  } else if (shape === 'Rounded') {
    roundRect(ctx, x, y, size, size, size * 0.28); ctx.fill()
  } else if (shape === 'Leaf') {
    const r = size * 0.5
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.quadraticCurveTo(x + size, y, x + size, y + r)
    ctx.lineTo(x + size, y + size)
    ctx.lineTo(x + r, y + size)
    ctx.quadraticCurveTo(x, y + size, x, y + r)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.fillRect(x, y, size, size)
  }
}

// ─── Renderer — the big one. Draws the entire QR to a canvas. ───────
function renderQR(canvas, cfg, matrixData, bgImg, logoImg) {
  const { N, matrix } = matrixData
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const cssSize = cfg.pxSize
  const margin = 4 // 4-module quiet zone (spec minimum)
  const totalCells = N + margin * 2
  const cellSize = cssSize / totalCells

  canvas.width = cssSize * dpr
  canvas.height = cssSize * dpr
  canvas.style.width = cssSize + 'px'
  canvas.style.height = cssSize + 'px'
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Background
  ctx.fillStyle = cfg.bgColor
  ctx.fillRect(0, 0, cssSize, cssSize)

  // Optional background image behind the QR — behaves like a lightbox
  // that the QR cells sit on top of. Blend mode segmented control.
  if (bgImg && cfg.bgImageOn) {
    ctx.save()
    ctx.globalAlpha = cfg.bgImageAlpha
    // Use the blend mode; canvas maps most CSS blend names directly.
    const bm = cfg.blendMode.toLowerCase()
    ctx.globalCompositeOperation = bm === 'normal' ? 'source-over' : bm
    // "cover" the canvas with the image, centred.
    const iw = bgImg.width, ih = bgImg.height
    const scale = Math.max(cssSize / iw, cssSize / ih)
    const w = iw * scale, h = ih * scale
    ctx.drawImage(bgImg, (cssSize - w) / 2, (cssSize - h) / 2, w, h)
    ctx.restore()
  }

  // Foreground fill — solid or gradient.
  let fgStyle
  if (cfg.gradientOn) {
    const cx = cssSize / 2, cy = cssSize / 2
    if (cfg.gradientType === 'radial') {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cssSize / 2)
      grad.addColorStop(0, cfg.fgColor)
      grad.addColorStop(1, cfg.fgColor2)
      fgStyle = grad
    } else {
      const ang = (cfg.gradientAngle * Math.PI) / 180
      const x0 = cx + Math.cos(ang) * cssSize / 2
      const y0 = cy + Math.sin(ang) * cssSize / 2
      const x1 = cx - Math.cos(ang) * cssSize / 2
      const y1 = cy - Math.sin(ang) * cssSize / 2
      const grad = ctx.createLinearGradient(x0, y0, x1, y1)
      grad.addColorStop(0, cfg.fgColor)
      grad.addColorStop(1, cfg.fgColor2)
      fgStyle = grad
    }
  } else {
    fgStyle = cfg.fgColor
  }
  ctx.fillStyle = fgStyle

  // Precompute the image-bake mask if enabled. We accept a per-cell
  // 0/1 override array shipped in cfg.bakeMask; when set the module
  // will be drawn according to that instead of the QR matrix at those
  // positions. Only body cells (not finders/timing) are eligible.
  const bake = cfg.bakeMask || null

  const originX = margin * cellSize
  const originY = margin * cellSize

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const idx = r * N + c
      let dark = matrix[idx] === 1
      if (bake && bake[idx] !== 0xff) {
        // Only touch body cells (finders / alignment / timing preserved
        // by the bake mask constructor).
        dark = bake[idx] === 1
      }
      if (!dark) continue

      const inFinderRing  = isFinderRing(r, c, N)
      const inFinderInner = isFinderInner(r, c, N)
      const inFinder      = isFinderModule(r, c, N)

      const x = originX + c * cellSize
      const y = originY + r * cellSize

      if (inFinder) {
        // Skip individual modules of the finder ring/inner — we draw them
        // as whole shapes below.
        if (inFinderRing || inFinderInner) continue
        // Any other module inside the 7×7 finder frame is a "spacer" —
        // treat like a body cell (won't visually appear if we drew the
        // eye shape on top).
        drawModule(ctx, x, y, cellSize, cfg.cellShape, cfg.radius, cfg.gap)
      } else {
        drawModule(ctx, x, y, cellSize, cfg.cellShape, cfg.radius, cfg.gap)
      }
    }
  }

  // Draw the three finder patterns in the chosen "eye" shape. We erase
  // any body-drawn artifacts under them first so custom shapes look clean.
  const corners = [
    [0, 0],           // top-left
    [0, N - 7],       // top-right
    [N - 7, 0],       // bottom-left
  ]
  for (const [r0, c0] of corners) {
    const ex = originX + c0 * cellSize
    const ey = originY + r0 * cellSize
    // Clear under the eye first — cellSize*7
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillRect(ex, ey, 7 * cellSize, 7 * cellSize)
    ctx.restore()
    // Outer ring
    ctx.fillStyle = fgStyle
    drawEye(ctx, ex, ey, cellSize, cfg.eyeShape, true)
    // Inner 3x3
    drawEyeInner(ctx, ex + 2 * cellSize, ey + 2 * cellSize, cellSize, cfg.eyeInnerShape)
  }

  // Logo overlay
  if (logoImg && cfg.logoOn) {
    const logoSize = (cfg.logoPct / 100) * cssSize
    const lx = (cssSize - logoSize) / 2
    const ly = (cssSize - logoSize) / 2
    if (cfg.logoPad) {
      ctx.save()
      const padSize = logoSize * 1.15
      const px = (cssSize - padSize) / 2
      const py = (cssSize - padSize) / 2
      ctx.fillStyle = cfg.bgColor
      if (cfg.logoRound) {
        roundRect(ctx, px, py, padSize, padSize, padSize * 0.18); ctx.fill()
      } else {
        ctx.fillRect(px, py, padSize, padSize)
      }
      ctx.restore()
    }
    ctx.save()
    if (cfg.logoRound) {
      roundRect(ctx, lx, ly, logoSize, logoSize, logoSize * 0.16)
      ctx.clip()
    }
    ctx.drawImage(logoImg, lx, ly, logoSize, logoSize)
    ctx.restore()
  }
}

// ─── Image bake-in: Floyd–Steinberg halftone constrained to the ECC
// waste budget. We take the greyscale intensity of the drop image at
// each body-cell position, then flip cells that (a) sit inside the
// safe-to-corrupt region, and (b) most reduce the |image_intensity −
// current_cell| residual. We stop when we've flipped `budget × N²` cells.
// This is the same idea as ControlNet-style artistic QRs but purely
// algorithmic — no diffusion model.
function computeBakeMask(matrix, N, ecc, imgCanvasData, influence) {
  // imgCanvasData is a Uint8ClampedArray sampled to N×N greyscale (0..255).
  // influence ∈ [0,1] scales the budget we're willing to spend.
  const budgetFrac = ECC_BUDGET[ecc] * 0.9 * influence   // safety factor
  const budget = Math.floor(N * N * budgetFrac)

  // Copy of matrix — 0xff means "no override" (renderer uses matrix cell).
  const bake = new Uint8Array(N * N)
  for (let i = 0; i < N * N; i++) bake[i] = 0xff

  // Score each body cell by how much flipping it toward the target
  // reduces the residual. desired = 1 if image intensity > 128 (dark
  // pixel = dark cell). If matrix already matches desired, no benefit.
  const cands = []
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      // Preserve structure: finders + timing + area near alignment.
      if (isFinderModule(r, c, N)) continue
      if (r === 6 || c === 6) continue   // timing row/col
      const idx = r * N + c
      const px = imgCanvasData[idx]         // 0..255 greyscale
      // Note we invert: bright pixel → dark cell (so the image reads
      // as a dark-on-light silhouette against the QR body).
      const desired = px < 128 ? 1 : 0
      const cur = matrix[idx]
      if (desired === cur) continue        // already matches — no cost
      // Score by |desired_intensity − cur_intensity|, higher = more benefit.
      const target = desired ? 0 : 255
      const score = Math.abs(target - px)
      cands.push({ idx, desired, score })
    }
  }
  cands.sort((a, b) => b.score - a.score)
  const use = Math.min(cands.length, budget)
  for (let i = 0; i < use; i++) {
    bake[cands[i].idx] = cands[i].desired
  }
  return bake
}

// Sample an image to N×N greyscale by drawing to a small offscreen canvas.
function sampleImageGreyscale(img, N) {
  const off = document.createElement('canvas')
  off.width = N; off.height = N
  const c = off.getContext('2d')
  c.fillStyle = '#fff'
  c.fillRect(0, 0, N, N)
  // Cover
  const iw = img.width, ih = img.height
  const scale = Math.max(N / iw, N / ih)
  const w = iw * scale, h = ih * scale
  c.drawImage(img, (N - w) / 2, (N - h) / 2, w, h)
  const data = c.getImageData(0, 0, N, N).data
  const out = new Uint8ClampedArray(N * N)
  for (let i = 0; i < N * N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    out[i] = (r * 299 + g * 587 + b * 114) / 1000
  }
  return out
}

// ─── Scan test: dump canvas ImageData → jsQR → decoded string. ──────
function scanCanvas(canvas) {
  if (!canvas) return { ok: false, ms: 0 }
  const w = canvas.width, h = canvas.height
  const ctx = canvas.getContext('2d')
  const img = ctx.getImageData(0, 0, w, h)
  const t0 = performance.now()
  const res = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' })
  const ms = performance.now() - t0
  return { ok: !!res, data: res?.data || '', ms }
}

// Try scan at 0/90/180/270 rotations for robustness.
function scanCanvasRobust(canvas) {
  const first = scanCanvas(canvas)
  if (first.ok) return { ...first, tries: 1 }
  // Rotate copies to try again.
  const rots = [90, 180, 270]
  for (let i = 0; i < rots.length; i++) {
    const rc = document.createElement('canvas')
    rc.width = canvas.width; rc.height = canvas.height
    const rctx = rc.getContext('2d')
    rctx.translate(rc.width / 2, rc.height / 2)
    rctx.rotate((rots[i] * Math.PI) / 180)
    rctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
    const r = scanCanvas(rc)
    if (r.ok) return { ...r, tries: 2 + i }
  }
  return { ...first, tries: 4 }
}

// ─── Damage sim: paint N random blobs of alternating colour ────────
function applyDamage(canvas, pct, seed) {
  if (pct <= 0) return
  const w = canvas.width, h = canvas.height
  const ctx = canvas.getContext('2d')
  const rng = mulberry32(seed)
  const targetArea = (pct / 100) * (w * h)
  let painted = 0
  let guard = 0
  while (painted < targetArea && guard < 2000) {
    const cx = rng() * w
    const cy = rng() * h
    const r  = 6 + rng() * 24
    ctx.fillStyle = rng() < 0.5 ? '#000' : '#fff'
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    painted += Math.PI * r * r
    guard++
  }
}

// ─── Helpers for the download row ────────────────────────────────────
function downloadDataURL(dataUrl, name) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name
  document.body.appendChild(a); a.click(); a.remove()
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ─── Small UI blocks ────────────────────────────────────────────────
function Row({ label, help, tex, children }) {
  return (
    <div>
      <div className='flex items-center justify-between mb-1'>
        <div className='text-xs uppercase tracking-wide text-fg-muted flex items-center gap-1.5'>
          {tex
            ? <Tooltip title={help} overlayStyle={{ maxWidth: 380 }}>
                <span className='katex-host cursor-help border-b border-dashed border-white/15'
                  dangerouslySetInnerHTML={{ __html: renderTex(tex) }} />
              </Tooltip>
            : <span>{label}</span>}
          {help && !tex
            ? <Tooltip title={help} overlayStyle={{ maxWidth: 380 }}>
                <InfoCircleOutlined className='text-fg-muted text-[10px]' />
              </Tooltip>
            : null}
        </div>
      </div>
      {children}
    </div>
  )
}

function SliderNum({ min, max, step = 1, value, onChange, accent = 'amber' }) {
  return (
    <div className='flex items-center gap-3'>
      <div className='flex-1'>
        <Slider min={min} max={max} step={step} value={value} onChange={onChange} accent={accent} />
      </div>
      <InputNumber
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(v) => onChange(v ?? min)}
        size='small'
        // reject alphabets — accept only digits and optional minus/decimal
        parser={(v) => {
          const s = String(v ?? '').replace(/[^\d.-]/g, '')
          return s === '' ? min : Number(s)
        }}
        className='w-20'
      />
    </div>
  )
}

// ─── History — BE-backed via /api/qr-saves ──────────────────────────
// Was localStorage-only; moved to a real store so users can share saved
// QRs at /qr/s/:id. Nothing else in this module knows about the network:
// the client + owner-key helpers live in src/api/qrSaves.js and
// src/lib/qrOwnerKey.js. This map bridges the FE Segmented values
// (`URL`, `Wi-Fi`, `vCard`) with the BE's lowercase kind column.
const KIND_TO_BE = {
  URL: 'url', Text: 'text', 'Wi-Fi': 'wifi', vCard: 'vcard',
  SMS: 'sms', Email: 'email', Geo: 'geo', UPI: 'upi',
}
const KIND_FROM_BE = Object.fromEntries(
  Object.entries(KIND_TO_BE).map(([fe, be]) => [be, fe])
)

// ─── Main component ────────────────────────────────────────────────
export default function QRCompiler() {
  // Top-level tab — 2D editor (all the classic controls) vs 3D scenes.
  // Payload input is shared, so switching tabs keeps whatever was typed.
  const [topTab, setTopTab] = useState('2D Editor')

  // Payload
  const [payloadKind, setPayloadKind] = useState('URL')
  const [fields, setFields] = useState({
    url:  'https://siddharthfulia.com/qr',
    text: 'Hello — this is a Reed-Solomon-safe QR playground.',
    ssid: 'MyNet',
    password: 'hunter2!@',
    auth: 'WPA',
    hidden: false,
    name: 'Siddharth Fulia',
    org:  'Sid Labs',
    title: 'AI Engineer',
    phone: '+919876543210',
    email: 'hello@example.com',
    to:    'hello@example.com',
    subject: 'Re: QR studio',
    body:  'Just tested your artistic QR — the H-level ECC held up beautifully at 25% damage!',
    message: 'Hi from the QR compiler',
    lat: 12.9716,
    lon: 77.5946,
    zoom: 15,
    pa: 'merchant@upi',
    pn: 'Sid Coffee',
    am: '199.00',
    tn: 'Cold brew',
    cu: 'INR',
  })
  const payload = useMemo(() => encodePayload(payloadKind, fields), [payloadKind, fields])

  // QR params
  const [version, setVersion] = useState(0)   // 0 = auto
  const [ecc, setEcc]         = useState('H')
  // NOTE: qrcode-generator picks the mask itself. We store an intended
  // mask index for UI purposes only. If the user wants "Auto", value=-1.
  const [maskChoice, setMaskChoice] = useState(-1)

  // Style
  const [cellShape, setCellShape]         = useState('Rounded')
  const [eyeShape, setEyeShape]           = useState('Rounded')
  const [eyeInnerShape, setEyeInnerShape] = useState('Rounded')
  const [fgColor, setFgColor]     = useState('#0a0a0e')
  const [bgColor, setBgColor]     = useState('#ffffff')
  const [gradientOn, setGradientOn]     = useState(true)
  const [gradientType, setGradientType] = useState('linear')
  const [gradientAngle, setGradientAngle] = useState(135)
  const [fgColor2, setFgColor2] = useState('#d946ef')
  const [gap, setGap]           = useState(0.08)   // 0..0.30
  const [radius, setRadius]     = useState(60)     // 0..100
  const [bgImageOn, setBgImageOn] = useState(false)
  const [bgImageAlpha, setBgImageAlpha] = useState(0.35)
  const [blendMode, setBlendMode] = useState('Multiply')
  const [bgImage, setBgImage] = useState(null)   // HTMLImageElement
  const [logoOn, setLogoOn]     = useState(false)
  const [logoImg, setLogoImg]   = useState(null)
  const [logoPct, setLogoPct]   = useState(18)   // 5..40
  const [logoPad, setLogoPad]   = useState(true)
  const [logoRound, setLogoRound] = useState(true)

  // Image bake-in
  const [bakeImg, setBakeImg] = useState(null)
  const [bakeInfluence, setBakeInfluence] = useState(60) // 0..100 (%)

  // Damage sim
  const [damagePct, setDamagePct] = useState(0)
  const [damageSeed, setDamageSeed] = useState(1337)

  // Scan result
  const [scan, setScan] = useState({ ok: false, data: '', ms: 0, tries: 0 })
  const [sweep, setSweep] = useState([])   // damage sweep points

  // Optimizer
  const [optRunning, setOptRunning] = useState(false)
  const [optProgress, setOptProgress] = useState(0)
  const [optBest, setOptBest] = useState(null)

  // Canvas
  const canvasRef = useRef(null)
  const sweepRef  = useRef(null)   // small chart

  // History — BE-backed. `history` mirrors the caller's rows from
  // /api/qr-saves; refreshHistory refetches. `saving` disables the
  // Save-to-Library button while a request is in flight.
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyErr, setHistoryErr] = useState('')
  const [saving, setSaving] = useState(false)
  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true); setHistoryErr('')
    try {
      const data = await listQrSaves({ limit: 30 })
      setHistory(Array.isArray(data?.items) ? data.items : [])
    } catch (e) {
      setHistoryErr(e.message || 'Could not load library')
    } finally { setHistoryLoading(false) }
  }, [])
  useEffect(() => { refreshHistory() }, [refreshHistory])

  // Canvas size — responsive within 320..640
  const [pxSize, setPxSize] = useState(520)
  useEffect(() => {
    const on = () => {
      const w = window.innerWidth
      setPxSize(Math.max(320, Math.min(600, w < 768 ? w - 48 : 520)))
    }
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  useEffect(() => { document.title = 'QR Compiler · Sid' }, [])

  // Build the QR matrix from the current payload + params.
  const matrixData = useMemo(() => {
    if (!payload) return null
    // qrcode-generator: version 0 = auto-pick.
    return buildQR(payload, version || 0, ecc)
  }, [payload, version, ecc])

  // Compute the bake mask if we have a bake image + matrix.
  const bakeMask = useMemo(() => {
    if (!bakeImg || !matrixData) return null
    if (bakeInfluence <= 0) return null
    const grey = sampleImageGreyscale(bakeImg, matrixData.N)
    return computeBakeMask(matrixData.matrix, matrixData.N, ecc, grey, bakeInfluence / 100)
  }, [bakeImg, matrixData, bakeInfluence, ecc])

  // Renderer — re-draws canvas + runs scan test on every relevant change.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!matrixData) {
      // Placeholder — "Enter a payload"
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = pxSize * dpr; canvas.height = pxSize * dpr
      canvas.style.width = pxSize + 'px'; canvas.style.height = pxSize + 'px'
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, pxSize, pxSize)
      ctx.fillStyle = 'rgba(120,120,140,0.6)'
      ctx.font = '14px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Enter a payload above', pxSize / 2, pxSize / 2)
      setScan({ ok: false, data: '', ms: 0, tries: 0 })
      return
    }
    const cfg = {
      pxSize,
      cellShape, eyeShape, eyeInnerShape,
      fgColor, bgColor, gradientOn, gradientType, gradientAngle, fgColor2,
      gap, radius,
      bgImageOn, bgImageAlpha, blendMode,
      logoOn, logoPct, logoPad, logoRound,
      bakeMask,
    }
    renderQR(canvas, cfg, matrixData, bgImage, logoImg)
    if (damagePct > 0) applyDamage(canvas, damagePct, damageSeed)
    const result = scanCanvasRobust(canvas)
    setScan(result)
  }, [
    matrixData, pxSize,
    cellShape, eyeShape, eyeInnerShape,
    fgColor, bgColor, gradientOn, gradientType, gradientAngle, fgColor2,
    gap, radius,
    bgImageOn, bgImageAlpha, blendMode, bgImage,
    logoOn, logoPct, logoPad, logoRound, logoImg,
    bakeMask,
    damagePct, damageSeed,
  ])

  // Diagnostic reason for a broken scan.
  const brokenReason = useMemo(() => {
    if (scan.ok) return ''
    if (!matrixData) return 'No payload to encode.'
    const budget = ECC_BUDGET[ecc] * 100
    if (logoOn && logoPct > budget) {
      return `Logo covers ${logoPct}% of the QR, more than the ${budget.toFixed(0)}% ECC budget for level ${ecc}. Bump ECC to H or shrink the logo.`
    }
    if (damagePct > budget) {
      return `${damagePct}% simulated damage exceeds the ${budget.toFixed(0)}% ECC budget for level ${ecc}.`
    }
    if (bgImageOn && bgImageAlpha > 0.55) {
      return `Background image opacity (${(bgImageAlpha * 100).toFixed(0)}%) is drowning cell contrast. Try lowering α or Screen blend.`
    }
    return 'Corner (finder) contrast might be too low, or the payload is beyond the version capacity. Try a higher version.'
  }, [scan.ok, matrixData, ecc, logoOn, logoPct, damagePct, bgImageOn, bgImageAlpha])

  // ─── Damage sweep — a 0→40% simulation series drawn to a tiny chart.
  const runSweep = useCallback(() => {
    if (!matrixData) return
    const off = document.createElement('canvas')
    off.width = 480; off.height = 480
    const cfg = {
      pxSize: 240,
      cellShape, eyeShape, eyeInnerShape,
      fgColor, bgColor, gradientOn, gradientType, gradientAngle, fgColor2,
      gap, radius,
      bgImageOn: false, bgImageAlpha, blendMode,
      logoOn, logoPct, logoPad, logoRound,
      bakeMask,
    }
    // Match device-pixel scaling so scanCanvas has enough resolution.
    const dpr = 2
    off.width  = cfg.pxSize * dpr
    off.height = cfg.pxSize * dpr
    off.style.width = cfg.pxSize + 'px'
    off.style.height = cfg.pxSize + 'px'
    const pts = []
    for (let d = 0; d <= 40; d += 2) {
      // Fresh render each iteration.
      renderQR(off, cfg, matrixData, null, logoImg)
      if (d > 0) applyDamage(off, d, damageSeed + d)
      const r = scanCanvasRobust(off)
      pts.push({ d, ok: r.ok ? 1 : 0 })
    }
    setSweep(pts)
    drawSweep(pts)
  }, [
    matrixData, cellShape, eyeShape, eyeInnerShape,
    fgColor, bgColor, gradientOn, gradientType, gradientAngle, fgColor2,
    gap, radius, bgImageAlpha, blendMode, logoOn, logoPct, logoPad, logoRound,
    logoImg, bakeMask, damageSeed,
  ])

  function drawSweep(pts) {
    const c = sweepRef.current
    if (!c) return
    const w = c.width = c.clientWidth * 2
    const h = c.height = 160 * 2
    const ctx = c.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(50, h - 30); ctx.lineTo(w - 10, h - 30); ctx.stroke()
    // Line
    if (!pts.length) return
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 3
    ctx.beginPath()
    pts.forEach((p, i) => {
      const x = 50 + (p.d / 40) * (w - 60)
      const y = 10 + (1 - p.ok) * (h - 40)
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.stroke()
    // Dots
    pts.forEach((p) => {
      const x = 50 + (p.d / 40) * (w - 60)
      const y = 10 + (1 - p.ok) * (h - 40)
      ctx.fillStyle = p.ok ? '#34d399' : '#fb7185'
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill()
    })
    // Labels
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '20px system-ui'
    ctx.fillText('0%', 40, h - 6)
    ctx.fillText('40% damage', w - 180, h - 6)
    ctx.fillText('✗', 20, h - 20)
    ctx.fillText('✓', 20, 24)
  }

  // ─── Auto-optimize — brute grid search over the levers that matter.
  const runOptimize = useCallback(async () => {
    if (!payload) return
    setOptRunning(true)
    setOptProgress(0)
    setOptBest(null)
    const versions = [0, 5, 8, 12]                          // 0 = auto
    const eccs     = ['Q', 'H']                             // logos need Q/H
    const shapes   = ['Rounded', 'Dot', 'Square']
    const grads    = [false, true]
    const trials   = []
    for (const v of versions) for (const e of eccs)
      for (const sh of shapes) for (const gr of grads) trials.push({ v, e, sh, gr })

    let best = null
    const off = document.createElement('canvas')
    for (let i = 0; i < trials.length; i++) {
      const t = trials[i]
      const md = buildQR(payload, t.v, t.e)
      if (!md) { setOptProgress(((i + 1) / trials.length) * 100); continue }
      const cfg = {
        pxSize: 300,
        cellShape: t.sh,
        eyeShape: 'Rounded', eyeInnerShape: 'Rounded',
        fgColor: '#0a0a0e', bgColor: '#ffffff',
        gradientOn: t.gr, gradientType: 'linear', gradientAngle: 135,
        fgColor2: '#d946ef',
        gap: 0.06, radius: 60,
        bgImageOn: false, bgImageAlpha: 0.3, blendMode: 'Multiply',
        logoOn: logoOn, logoPct, logoPad: true, logoRound: true,
        bakeMask: null,
      }
      renderQR(off, cfg, md, null, logoImg)
      const cleanScan = scanCanvasRobust(off)
      // Damage stress-test at 20%
      applyDamage(off, 20, 42)
      const damScan = scanCanvasRobust(off)
      const score =
        (cleanScan.ok ? 1 : 0) * 100 +
        (damScan.ok ? 1 : 0)   * 60 +
        (t.gr ? 5 : 0) +
        (t.sh === 'Rounded' ? 3 : t.sh === 'Dot' ? 2 : 0) +
        (md.version === 0 ? 1 : Math.max(0, 8 - md.version))    // prefer smaller
      if (!best || score > best.score) best = { ...t, score, N: md.N, version: md.version, ecc: t.e }
      setOptProgress(((i + 1) / trials.length) * 100)
      // Yield periodically so React updates the progress bar.
      if (i % 4 === 0) await new Promise((r) => setTimeout(r, 4))
    }
    setOptBest(best)
    if (best) {
      setVersion(best.v)
      setEcc(best.e)
      setCellShape(best.sh)
      setGradientOn(best.gr)
    }
    setOptRunning(false)
  }, [payload, logoOn, logoPct, logoImg])

  // ─── Downloads ─────────────────────────────────────────────────────
  const downloadPNG = useCallback((scaleMul = 1) => {
    if (!matrixData) return
    const off = document.createElement('canvas')
    const bigSize = pxSize * scaleMul
    const cfg = {
      pxSize: bigSize,
      cellShape, eyeShape, eyeInnerShape,
      fgColor, bgColor, gradientOn, gradientType, gradientAngle, fgColor2,
      gap, radius,
      bgImageOn, bgImageAlpha, blendMode,
      logoOn, logoPct, logoPad, logoRound,
      bakeMask,
    }
    renderQR(off, cfg, matrixData, bgImage, logoImg)
    downloadDataURL(off.toDataURL('image/png'), `qr-${Date.now()}-${scaleMul}x.png`)
  }, [
    matrixData, pxSize, cellShape, eyeShape, eyeInnerShape,
    fgColor, bgColor, gradientOn, gradientType, gradientAngle, fgColor2,
    gap, radius, bgImageOn, bgImageAlpha, blendMode, bgImage,
    logoOn, logoPct, logoPad, logoRound, logoImg, bakeMask,
  ])

  const downloadSVG = useCallback(() => {
    if (!matrixData) return
    const { N, matrix } = matrixData
    const margin = 4
    const cells = N + margin * 2
    const size = 1000
    const cell = size / cells
    let inner = ''
    inner += `<rect width='${size}' height='${size}' fill='${bgColor}'/>`
    // Simple square/rounded rendering for SVG — a lossless subset of
    // the canvas renderer. Skip gradients + bake mask in SVG for now.
    const fg = fgColor
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (matrix[r * N + c] !== 1) continue
        const x = (margin + c) * cell
        const y = (margin + r) * cell
        const w = cell * (1 - gap)
        const off = cell * (gap / 2)
        if (cellShape === 'Dot') {
          inner += `<circle cx='${x + cell/2}' cy='${y + cell/2}' r='${w/2}' fill='${fg}'/>`
        } else if (cellShape === 'Rounded') {
          const rr = (w * radius) / 200
          inner += `<rect x='${x+off}' y='${y+off}' width='${w}' height='${w}' rx='${rr}' fill='${fg}'/>`
        } else {
          inner += `<rect x='${x+off}' y='${y+off}' width='${w}' height='${w}' fill='${fg}'/>`
        }
      }
    }
    const svg = `<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>
${inner}
</svg>`
    downloadDataURL('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), `qr-${Date.now()}.svg`)
  }, [matrixData, bgColor, fgColor, gap, radius, cellShape])

  // ─── Save to library (BE-backed) ──────────────────────────────────
  // Bakes the current canvas to a small PNG (≤ 500 KB per BE cap), posts
  // it along with the style config, then refreshes the list. Returns the
  // public share URL so the caller can copy-link.
  const bakePreviewDataUrl = useCallback((maxKb = 480) => {
    if (!matrixData) return null
    const off = document.createElement('canvas')
    const cfg = {
      pxSize: 480,
      cellShape, eyeShape, eyeInnerShape,
      fgColor, bgColor, gradientOn, gradientType, gradientAngle, fgColor2,
      gap, radius,
      bgImageOn, bgImageAlpha, blendMode,
      logoOn, logoPct, logoPad, logoRound,
      bakeMask,
    }
    renderQR(off, cfg, matrixData, bgImage, logoImg)
    // Try PNG first; if we blow the size cap, fall back to JPEG.
    let url = off.toDataURL('image/png')
    if (url.length > maxKb * 1024) {
      // 480×480 JPEG @ q=0.8 lands well under 100 KB for most designs.
      url = off.toDataURL('image/jpeg', 0.82)
    }
    return url
  }, [
    matrixData, cellShape, eyeShape, eyeInnerShape,
    fgColor, bgColor, gradientOn, gradientType, gradientAngle, fgColor2,
    gap, radius, bgImageOn, bgImageAlpha, blendMode, bgImage,
    logoOn, logoPct, logoPad, logoRound, logoImg, bakeMask,
  ])

  const styleConfigSnapshot = useCallback(() => ({
    version, ecc,
    cellShape, eyeShape, eyeInnerShape,
    fgColor, bgColor,
    gradientOn, gradientType, gradientAngle, fgColor2,
    gap, radius,
    logoOn, logoPct, logoPad, logoRound,
    bgImageOn, bgImageAlpha, blendMode,
    payloadKind, payload,
  }), [
    version, ecc, cellShape, eyeShape, eyeInnerShape,
    fgColor, bgColor, gradientOn, gradientType, gradientAngle, fgColor2,
    gap, radius, logoOn, logoPct, logoPad, logoRound,
    bgImageOn, bgImageAlpha, blendMode, payloadKind, payload,
  ])

  const saveToLibrary = useCallback(async () => {
    if (!payload) { notice.warning('Nothing to save — enter a payload first'); return }
    // Simple prompt for the title. Keeps the surface small and dodges
    // building a modal for a one-field ask. Empty title is allowed.
    let title = window.prompt('Give this QR a title (optional)', '') || ''
    title = title.trim().slice(0, 120)
    setSaving(true)
    try {
      const png = bakePreviewDataUrl()
      const res = await createQrSave({
        title,
        payload,
        payload_kind: KIND_TO_BE[payloadKind] || 'text',
        style_config: styleConfigSnapshot(),
        png_data_url: png,
        public: true,
      })
      const shareUrl = `${window.location.origin}/qr/s/${res.id}`
      notice.success('Saved. Share link copied.')
      try { await navigator.clipboard.writeText(shareUrl) } catch {}
      await refreshHistory()
    } catch (e) {
      notice.error(e.message || 'Could not save')
    } finally { setSaving(false) }
  }, [payload, payloadKind, bakePreviewDataUrl, styleConfigSnapshot, refreshHistory])

  // Restore a saved row into the current editor state. `h` is the BE
  // shape — style_config lives under `styleConfig` (see api/qrSaves.js).
  const restoreHistory = (h) => {
    const s = h.styleConfig || {}
    const feKind = KIND_FROM_BE[h.payloadKind] || 'URL'
    setPayloadKind(feKind)
    if (feKind === 'URL')  setFields((f) => ({ ...f, url:  h.payload }))
    if (feKind === 'Text') setFields((f) => ({ ...f, text: h.payload }))
    if (s.version != null) setVersion(s.version)
    if (s.ecc)     setEcc(s.ecc)
    if (s.cellShape)     setCellShape(s.cellShape)
    if (s.eyeShape)      setEyeShape(s.eyeShape)
    if (s.eyeInnerShape) setEyeInnerShape(s.eyeInnerShape)
    if (s.fgColor)  setFgColor(s.fgColor)
    if (s.bgColor)  setBgColor(s.bgColor)
    if (typeof s.gradientOn === 'boolean') setGradientOn(s.gradientOn)
    if (s.gradientType)  setGradientType(s.gradientType)
    if (s.gradientAngle != null) setGradientAngle(s.gradientAngle)
    if (s.fgColor2) setFgColor2(s.fgColor2)
    if (s.gap    != null) setGap(s.gap)
    if (s.radius != null) setRadius(s.radius)
    if (typeof s.logoOn === 'boolean') setLogoOn(s.logoOn)
    if (s.logoPct != null) setLogoPct(s.logoPct)
    notice.info(`Restored: ${h.title || 'Untitled'}`)
  }
  const deleteHistory = async (id) => {
    try {
      await deleteQrSave(id)
      setHistory((prev) => prev.filter((h) => h.id !== id))
      notice.success('Deleted')
    } catch (e) { notice.error(e.message || 'Could not delete') }
  }
  const togglePublicHistory = async (id, next) => {
    try {
      const res = await patchQrSave(id, { public: next })
      const isPublic = res?.item?.public ?? next
      setHistory((prev) => prev.map((h) => h.id === id ? { ...h, public: isPublic } : h))
      notice.success(isPublic ? 'Now public' : 'Now private')
    } catch (e) { notice.error(e.message || 'Could not update') }
  }
  const copyShareLink = async (id) => {
    const url = `${window.location.origin}/qr/s/${id}`
    try {
      await navigator.clipboard.writeText(url)
      notice.success('Share link copied')
    } catch { notice.error('Could not copy') }
  }

  // ─── Payload input UI switch ───────────────────────────────────────
  const renderPayloadFields = () => {
    switch (payloadKind) {
      case 'URL':
        return (
          <div>
            <Input value={fields.url} onChange={(e) => setFields({ ...fields, url: e.target.value })}
              placeholder='https://siddharthfulia.com' />
            <FieldHelp>Full URL including scheme. Modern scanners will open the link on tap; if you omit https:// most add it silently.</FieldHelp>
          </div>
        )
      case 'Text':
        return (
          <div>
            <Input.TextArea rows={3} value={fields.text}
              onChange={(e) => setFields({ ...fields, text: e.target.value })} />
            <FieldHelp>Free-form UTF-8. Anything &gt; ~1500 chars will bump the required QR version above 20 and start looking dense.</FieldHelp>
          </div>
        )
      case 'Wi-Fi':
        return (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <div>
              <Input value={fields.ssid} onChange={(e) => setFields({ ...fields, ssid: e.target.value })} placeholder='SSID' />
              <FieldHelp>Network name (SSID). Case-sensitive; special characters are auto-escaped to spec.</FieldHelp>
            </div>
            <div>
              <Input.Password value={fields.password}
                onChange={(e) => setFields({ ...fields, password: e.target.value })} placeholder='Password' />
              <FieldHelp>Pre-shared key. Ignored for open networks. Escape rules: backslash, semicolon, comma, colon.</FieldHelp>
            </div>
            <div>
              <Segmented value={fields.auth}
                onChange={(v) => setFields({ ...fields, auth: v })}
                options={['WPA', 'WEP', 'nopass']} block />
              <FieldHelp>WPA covers WPA2/WPA3 (99% of home nets). WEP is legacy. `nopass` = open.</FieldHelp>
            </div>
            <div className='flex items-center gap-3 pt-1'>
              <Switch checked={fields.hidden}
                onChange={(v) => setFields({ ...fields, hidden: v })} />
              <div>
                <div className='text-sm'>Hidden SSID</div>
                <FieldHelp>Set true only if the AP does not broadcast its SSID beacon.</FieldHelp>
              </div>
            </div>
          </div>
        )
      case 'vCard':
        return (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <div>
              <Input value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} placeholder='Full name' />
              <FieldHelp>Rendered as FN in vCard 3.0. Line breaks are stripped for scanner compatibility.</FieldHelp>
            </div>
            <div>
              <Input value={fields.org} onChange={(e) => setFields({ ...fields, org: e.target.value })} placeholder='Company' />
              <FieldHelp>ORG field. Optional but improves iOS Contacts hydration.</FieldHelp>
            </div>
            <div>
              <Input value={fields.title} onChange={(e) => setFields({ ...fields, title: e.target.value })} placeholder='Job title' />
              <FieldHelp>TITLE field. Shows under the person's name on the "Add Contact" sheet.</FieldHelp>
            </div>
            <div>
              <Input value={fields.phone} onChange={(e) => setFields({ ...fields, phone: e.target.value })} placeholder='Phone' />
              <FieldHelp>Include country code (E.164). Encoded as TEL;TYPE=CELL for one-tap dialling.</FieldHelp>
            </div>
            <div>
              <Input value={fields.email} onChange={(e) => setFields({ ...fields, email: e.target.value })} placeholder='Email' />
              <FieldHelp>Encoded as EMAIL. Multiple emails need extra lines — omitted from this playground.</FieldHelp>
            </div>
            <div>
              <Input value={fields.url} onChange={(e) => setFields({ ...fields, url: e.target.value })} placeholder='Website' />
              <FieldHelp>URL field. Usually rendered as a tappable link on the contact card.</FieldHelp>
            </div>
          </div>
        )
      case 'SMS':
        return (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <div>
              <Input value={fields.phone} onChange={(e) => setFields({ ...fields, phone: e.target.value })} placeholder='+91…' />
              <FieldHelp>Include country code. Encoded as SMSTO:…: which triggers the OS compose sheet.</FieldHelp>
            </div>
            <div>
              <Input value={fields.message} onChange={(e) => setFields({ ...fields, message: e.target.value })} placeholder='Message body' />
              <FieldHelp>Prefilled body. Not all keyboards preserve emoji through the scanner intent — test on target OS.</FieldHelp>
            </div>
          </div>
        )
      case 'Email':
        return (
          <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
            <div>
              <Input value={fields.to} onChange={(e) => setFields({ ...fields, to: e.target.value })} placeholder='to@…' />
              <FieldHelp>TO field. Multiple addresses need the mailto: form instead — use URL kind for that.</FieldHelp>
            </div>
            <div>
              <Input value={fields.subject} onChange={(e) => setFields({ ...fields, subject: e.target.value })} placeholder='Subject' />
              <FieldHelp>SUB field. Kept short — long subjects push QR version up.</FieldHelp>
            </div>
            <div className='md:col-span-3'>
              <Input.TextArea rows={3} value={fields.body}
                onChange={(e) => setFields({ ...fields, body: e.target.value })} placeholder='Body' />
              <FieldHelp>BODY field. Multi-line supported; newlines are encoded verbatim.</FieldHelp>
            </div>
          </div>
        )
      case 'Geo':
        return (
          <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
            <div>
              <InputNumber value={fields.lat} onChange={(v) => setFields({ ...fields, lat: v ?? 0 })}
                step={0.0001} className='w-full' placeholder='Latitude' />
              <FieldHelp>WGS-84 latitude. Positive = north.</FieldHelp>
            </div>
            <div>
              <InputNumber value={fields.lon} onChange={(v) => setFields({ ...fields, lon: v ?? 0 })}
                step={0.0001} className='w-full' placeholder='Longitude' />
              <FieldHelp>WGS-84 longitude. Positive = east.</FieldHelp>
            </div>
            <div>
              <InputNumber value={fields.zoom} onChange={(v) => setFields({ ...fields, zoom: v ?? 0 })}
                min={0} max={22} className='w-full' placeholder='Zoom' />
              <FieldHelp>Google's `?z=` param (0 world, 22 building). Ignored by Apple Maps but harmless.</FieldHelp>
            </div>
          </div>
        )
      case 'UPI':
        return (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <div>
              <Input value={fields.pa} onChange={(e) => setFields({ ...fields, pa: e.target.value })} placeholder='merchant@upi' />
              <FieldHelp>Payee address (`pa`). NPCI-standard UPI VPA.</FieldHelp>
            </div>
            <div>
              <Input value={fields.pn} onChange={(e) => setFields({ ...fields, pn: e.target.value })} placeholder='Merchant name' />
              <FieldHelp>Payee name (`pn`). Shown on the payer's confirm screen.</FieldHelp>
            </div>
            <div>
              <Input value={fields.am} onChange={(e) => setFields({ ...fields, am: e.target.value })} placeholder='Amount' />
              <FieldHelp>Amount (`am`) in INR. Leave blank for "buyer chooses".</FieldHelp>
            </div>
            <div>
              <Input value={fields.tn} onChange={(e) => setFields({ ...fields, tn: e.target.value })} placeholder='Note' />
              <FieldHelp>Transaction note (`tn`). Shown as memo in the recipient's ledger.</FieldHelp>
            </div>
          </div>
        )
      default: return null
    }
  }

  // Utility for antd Upload — grab file and route to setter.
  const uploadHandler = (setter) => ({
    beforeUpload: async (file) => {
      try {
        const img = await fileToImage(file)
        setter(img)
      } catch {}
      return false // prevent default upload
    },
    showUploadList: false,
    accept: 'image/*',
  })

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className='min-h-screen bg-[#0a0a0e] text-fg-primary'>
      {/* Hero strip */}
      <div className='max-w-7xl mx-auto pt-24 md:pt-28 px-4 md:px-6 pb-4'>
        <div className='luxe-glass p-5 md:p-6'>
          <div className='flex flex-col md:flex-row md:items-end md:justify-between gap-4'>
            <div>
              <h1 className='text-3xl md:text-5xl font-bold bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent'>
                QR Compiler
              </h1>
              <p className='text-sm md:text-base text-fg-muted mt-2 max-w-3xl'>
                Reed–Solomon ECC gives us a 7–30% pixel budget to break —
                spend it on a logo, gradient, image bake-in, or all three.
                Every render is scan-tested live.
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs'>
                <AppstoreOutlined className='text-amber-300' />
                {matrixData
                  ? <>v{matrixData.version} · {matrixData.N}×{matrixData.N} · ECC {ecc}</>
                  : <>—</>}
              </span>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs border
                ${scan.ok
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-400/30 bg-rose-500/10 text-rose-200'}`}>
                {scan.ok ? <CheckCircleFilled /> : <CloseCircleFilled />}
                {scan.ok ? 'Scannable' : 'Broken'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Payload input row */}
      <div className='max-w-7xl mx-auto px-4 md:px-6 pb-4'>
        <div className='luxe-glass p-5'>
          <div className='flex items-center gap-2 mb-3'>
            <h2 className='font-bold text-lg'>1. Payload</h2>
            <Tooltip title='Any string the scanner sees. Each type below is just a well-known convention for encoding the string so the OS knows what to do with it (open browser, join Wi-Fi, save contact, …).' overlayStyle={{ maxWidth: 380 }}>
              <InfoCircleOutlined className='text-fg-muted' />
            </Tooltip>
          </div>
          <Segmented value={payloadKind} onChange={setPayloadKind}
            options={PAYLOAD_TYPES} block />
          <div className='mt-4'>{renderPayloadFields()}</div>
          <div className='mt-4'>
            <div className='text-xs uppercase tracking-wide text-fg-muted mb-1'>Encoded string (what actually goes into the QR)</div>
            <Input.TextArea
              rows={2}
              value={payload}
              readOnly
              className='!font-mono !text-[12px]'
            />
            <FieldHelp>This is the exact byte string handed to the RS encoder. Copy it into any online decoder for a sanity check.</FieldHelp>
          </div>
        </div>
      </div>

      {/* Top-level view switch: 2D Editor vs 3D Scenes.
          The payload above is shared, so encoding once shows up in both. */}
      <div className='max-w-7xl mx-auto px-4 md:px-6 pb-4'>
        <div className='luxe-glass p-3'>
          <Segmented
            block
            value={topTab}
            onChange={setTopTab}
            options={['2D Editor', '3D Scenes', 'Tattoo Studio']}
          />
          <p className='text-[11px] text-fg-muted mt-2 leading-snug px-1'>
            2D Editor gives you every classic knob — cell shapes, gradients, ECC, logo overlay, damage sim. 3D Scenes reinterprets the same matrix as an isometric world. Tattoo Studio reads a tattoo photo with Gemini Vision and auto-styles a QR from its palette, motifs, and energy.
          </p>
        </div>
      </div>

      {topTab === '3D Scenes' && (
        <div className='max-w-7xl mx-auto px-4 md:px-6 pb-16'>
          <QRScenes3D matrixData={matrixData} ecc={ecc} />
        </div>
      )}

      {topTab === 'Tattoo Studio' && (
        <div className='max-w-7xl mx-auto px-4 md:px-6 pb-16'>
          <TattooStudio
            currentPayload={payload}
            onApplyStyle={(state, opts) => {
              // Wire the Gemini-suggested style into the 2D editor's own
              // React state. We flip cell + eye shapes, foreground gradient,
              // and ECC so the user immediately sees a live QR that echoes
              // the tattoo. gradientOn = true forces the two-colour rendering
              // path so both hex codes matter.
              if (state.cellShape)     setCellShape(state.cellShape)
              if (state.eyeShape)      setEyeShape(state.eyeShape)
              if (state.eyeInnerShape) setEyeInnerShape(state.eyeInnerShape)
              if (state.fgColor)       setFgColor(state.fgColor)
              if (state.fgColor2)      setFgColor2(state.fgColor2)
              if (typeof state.gradientOn === 'boolean') setGradientOn(state.gradientOn)
              if (state.gradientType)  setGradientType(state.gradientType)
              if (state.gradientAngle != null) setGradientAngle(state.gradientAngle)
              if (state.ecc)           setEcc(state.ecc)
              // Optional payload swap when the user opted in.
              if (opts?.payload) {
                setPayloadKind('URL')
                setFields((f) => ({ ...f, url: opts.payload, text: opts.payload }))
              }
              // Jump back to the 2D editor so the redraw is visible.
              setTopTab('2D Editor')
            }}
            onUsePayload={(p) => {
              // Just swap the payload without switching tabs.
              setPayloadKind('URL')
              setFields((f) => ({ ...f, url: p, text: p }))
            }}
          />
        </div>
      )}

      {topTab === '2D Editor' && (<>

      {/* Style controls */}
      <div className='max-w-7xl mx-auto px-4 md:px-6 pb-4'>
        <div className='luxe-glass p-5'>
          <div className='flex items-center gap-2 mb-3'>
            <h2 className='font-bold text-lg'>2. Style &amp; encoding</h2>
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'>
            <Row label='Cell shape' help='How each dark module is rendered. Square is spec-canonical; the others are aesthetic choices — the decoder does not care, as long as the centroid falls inside the module box.'>
              <Segmented block value={cellShape} onChange={setCellShape} options={CELL_SHAPES} />
              <FieldHelp>Rounded / Dot look premium; Cross &amp; Star reduce coverage — pair with H-level ECC.</FieldHelp>
            </Row>
            <Row label='Eye (finder) shape' help='The three corner 7×7 finder patterns. jsQR / ZXing look for the 1:1:3:1:1 run-length signature — the shape can bend but must preserve overall contrast.'>
              <Segmented block value={eyeShape} onChange={setEyeShape} options={EYE_SHAPES} />
              <FieldHelp>Circle / Leaf soften the corners. Rounded is the safest deviation from spec.</FieldHelp>
            </Row>
            <Row label='Eye inner shape' help='The 3×3 solid core of each finder pattern.'>
              <Segmented block value={eyeInnerShape} onChange={setEyeInnerShape} options={EYE_SHAPES} />
              <FieldHelp>Match it to the outer shape for coherence, or contrast it to focus the eye.</FieldHelp>
            </Row>

            <Row label='Foreground'>
              <div className='flex items-center gap-3'>
                <input type='color' value={fgColor} onChange={(e) => setFgColor(e.target.value)}
                  className='h-9 w-14 rounded border border-white/10 bg-transparent' />
                <span className='text-sm font-mono text-fg-muted'>{fgColor}</span>
              </div>
              <FieldHelp>Dark modules colour. Anything with sufficient contrast against the background will scan — most decoders threshold at ~40% luminance delta.</FieldHelp>
            </Row>
            <Row label='Background'>
              <div className='flex items-center gap-3'>
                <input type='color' value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                  className='h-9 w-14 rounded border border-white/10 bg-transparent' />
                <span className='text-sm font-mono text-fg-muted'>{bgColor}</span>
              </div>
              <FieldHelp>Light modules + the quiet-zone margin. Some scanners require a bright bg — dark-on-dark rarely reads.</FieldHelp>
            </Row>
            <Row label='Gradient' help='XORs a linear or radial gradient onto the foreground. Every module still resolves to a single luminance for the decoder, so contrast is what matters.'>
              <div className='flex items-center gap-3'>
                <Switch checked={gradientOn} onChange={setGradientOn} />
                <Segmented size='small' value={gradientType} onChange={setGradientType}
                  options={['linear', 'radial']} disabled={!gradientOn} />
                <input type='color' value={fgColor2} onChange={(e) => setFgColor2(e.target.value)}
                  disabled={!gradientOn}
                  className='h-8 w-12 rounded border border-white/10 bg-transparent disabled:opacity-40' />
              </div>
              <div className='mt-2 opacity-90'>
                <SliderNum min={0} max={360} value={gradientAngle} onChange={setGradientAngle} accent='fuchsia' />
              </div>
              <FieldHelp>Angle in degrees for linear gradients; ignored for radial.</FieldHelp>
            </Row>

            <Row label='Module gap (%)' help='Whitespace between modules. Great for the Dot / Diamond aesthetic; over ~15% starts eating the module boundary and can fool the decoder.'>
              <SliderNum min={0} max={30} step={1} value={Math.round(gap * 100)}
                onChange={(v) => setGap(v / 100)} accent='rose' />
              <FieldHelp>0 = touching modules (safest); 30% = maximum breathing room.</FieldHelp>
            </Row>
            <Row label='Corner radius (%)' help='Only takes effect for Square / Rounded cell shapes.'>
              <SliderNum min={0} max={100} value={radius} onChange={setRadius} accent='violet' />
              <FieldHelp>0 = razor-sharp; 100 = full pill / dot. Applied per module, not to the whole QR.</FieldHelp>
            </Row>
            <Row label='Background image' help='Renders under the QR at a chosen opacity + blend mode. Increases visual richness but eats ECC budget.'>
              <div className='flex items-center gap-3'>
                <Switch checked={bgImageOn} onChange={setBgImageOn} />
                <Upload {...uploadHandler(setBgImage)}>
                  <Button size='small' variant='ghost' icon={<UploadOutlined />}>Upload</Button>
                </Upload>
                <Segmented size='small' value={blendMode} onChange={setBlendMode}
                  options={BLEND_MODES} disabled={!bgImageOn} />
              </div>
              <div className='mt-2'>
                <SliderNum min={0} max={100} value={Math.round(bgImageAlpha * 100)}
                  onChange={(v) => setBgImageAlpha(v / 100)} accent='cyan' />
              </div>
              <FieldHelp>α ≤ 40% keeps most scanners happy; Multiply darkens, Screen brightens, Overlay does both.</FieldHelp>
            </Row>

            <Row label='Logo overlay' help='Centred image, size expressed as a % of the QR box. Beyond the ECC budget = broken scan (the panel tells you).'>
              <div className='flex items-center gap-3'>
                <Switch checked={logoOn} onChange={setLogoOn} />
                <Upload {...uploadHandler(setLogoImg)}>
                  <Button size='small' variant='ghost' icon={<UploadOutlined />}>Upload</Button>
                </Upload>
                <div className='flex items-center gap-2 text-xs text-fg-muted'>
                  <Switch size='small' checked={logoPad} onChange={setLogoPad} /> pad
                  <Switch size='small' checked={logoRound} onChange={setLogoRound} /> round
                </div>
              </div>
              <div className='mt-2'>
                <SliderNum min={5} max={40} value={logoPct} onChange={setLogoPct} accent='amber' />
              </div>
              <FieldHelp>Size %. Stay ≤ {(ECC_BUDGET[ecc] * 100).toFixed(0)}% for the current ECC ({ecc}) or bump ECC.</FieldHelp>
            </Row>

            <Row label='QR version (0 = auto)' tex='v' help={HELP.ver}>
              <SliderNum min={0} max={40} value={version} onChange={setVersion} accent='emerald' />
              <FieldHelp>0 lets the encoder pick the smallest version that fits. Manual override useful for consistent physical print sizing.</FieldHelp>
            </Row>

            <Row label='ECC level' tex='B' help={HELP.budget}>
              <Segmented block value={ecc} onChange={setEcc} options={ECC_LEVELS} />
              <FieldHelp>Higher ECC = more redundancy = safer with logo overlay but denser QR. H spends 30% of codewords on parity.</FieldHelp>
            </Row>

            <Row label='Mask pattern' tex='f(i,j)' help={HELP.mask}>
              <Segmented block value={maskChoice} onChange={setMaskChoice}
                options={[{ label: 'Auto', value: -1 }, ...[0,1,2,3,4,5,6,7].map((n) => ({ label: String(n), value: n }))]} />
              <FieldHelp>Auto lets the encoder choose the mask that minimises the QR "penalty score" (spec §8.8.2). Manual override is for visual A/B.</FieldHelp>
            </Row>
          </div>
        </div>
      </div>

      {/* Preview + scan */}
      <div className='max-w-7xl mx-auto px-4 md:px-6 pb-4'>
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
          <div className='luxe-glass p-5 lg:col-span-2'>
            <div className='flex items-center justify-between mb-3'>
              <h2 className='font-bold text-lg'>3. Live preview</h2>
              <span className='text-[11px] text-fg-muted'>DPR-aware canvas</span>
            </div>
            <div className='flex justify-center'>
              <div className='rounded-lg overflow-hidden shadow-2xl' style={{ background: bgColor }}>
                <canvas ref={canvasRef} />
              </div>
            </div>
          </div>

          <div className='luxe-glass p-5'>
            <div className='flex items-center justify-between mb-3'>
              <h2 className='font-bold text-lg'>4. Live scan-test</h2>
              <ScanOutlined className='text-amber-300 text-lg' />
            </div>
            <div className={`rounded-lg p-4 border
              ${scan.ok
                ? 'border-emerald-400/40 bg-emerald-500/10'
                : 'border-rose-400/40 bg-rose-500/10'}`}>
              <div className='flex items-center gap-2 text-lg font-bold'>
                {scan.ok
                  ? <><CheckCircleFilled className='text-emerald-300' /> Scannable</>
                  : <><CloseCircleFilled className='text-rose-300' /> Broken</>}
              </div>
              <div className='text-[12px] font-mono break-all mt-2 opacity-80 max-h-24 overflow-y-auto'>
                {scan.ok ? scan.data : (brokenReason || 'Decoder returned null.')}
              </div>
            </div>

            <div className='grid grid-cols-3 gap-2 mt-4 text-center'>
              <div className='luxe-glass-soft p-2'>
                <div className='text-[10px] uppercase text-fg-muted'>Decode ms</div>
                <div className='font-mono font-bold text-amber-300'>{scan.ms.toFixed(1)}</div>
              </div>
              <div className='luxe-glass-soft p-2'>
                <div className='text-[10px] uppercase text-fg-muted'>Tries</div>
                <div className='font-mono font-bold text-fuchsia-300'>{scan.tries}</div>
              </div>
              <div className='luxe-glass-soft p-2'>
                <div className='text-[10px] uppercase text-fg-muted'>Budget</div>
                <div className='font-mono font-bold text-emerald-300'>{(ECC_BUDGET[ecc] * 100).toFixed(0)}%</div>
              </div>
            </div>

            <div className='mt-4 text-[11px] text-fg-muted leading-relaxed'>
              We feed the canvas ImageData into <span className='font-mono'>jsQR</span>, retry at 90°/180°/270° for robustness, and report the raw decoded bytes.
            </div>
          </div>
        </div>
      </div>

      {/* Damage simulator */}
      <div className='max-w-7xl mx-auto px-4 md:px-6 pb-4'>
        <div className='luxe-glass p-5'>
          <div className='flex items-center justify-between mb-3'>
            <h2 className='font-bold text-lg'>5. Damage simulator</h2>
            <RadarChartOutlined className='text-rose-300 text-lg' />
          </div>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-5'>
            <div>
              <Row label='Simulated damage (%)' help='We overlay N random black/white blobs so their combined area equals the requested percentage. Decoder is re-run after every change.'>
                <SliderNum min={0} max={40} value={damagePct} onChange={setDamagePct} accent='rose' />
                <FieldHelp>Sweep this to see the RS ceiling in action. Below the ECC budget, the scan is unaffected — above it, decoding fails abruptly.</FieldHelp>
              </Row>
              <div className='mt-4 flex gap-2 flex-wrap'>
                <Button variant='primary' icon={<ExperimentOutlined />} onClick={runSweep}>
                  Run 0→40% sweep
                </Button>
                <Button variant='ghost' onClick={() => setDamageSeed((s) => s + 1)}>
                  New random pattern
                </Button>
              </div>
            </div>
            <div>
              <div className='text-[11px] uppercase text-fg-muted mb-2'>Decodes ✓ vs damage %</div>
              <canvas ref={sweepRef} className='w-full h-40 block' />
              {!sweep.length && (
                <div className='text-[11px] text-fg-muted mt-1'>
                  Press "Run 0→40% sweep" to plot the RS survival curve for the current config.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Image bake-in */}
      <div className='max-w-7xl mx-auto px-4 md:px-6 pb-4'>
        <div className='luxe-glass p-5'>
          <div className='flex items-center justify-between mb-3'>
            <h2 className='font-bold text-lg'>6. Image bake-in</h2>
            <PictureOutlined className='text-fuchsia-300 text-lg' />
          </div>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-5'>
            <div>
              <p className='text-sm text-fg-muted leading-relaxed'>
                Drop an image. We sample it to <Sym tex='N \times N' help='The QR module grid at the current version. e.g. version 8 = 49×49 cells.' /> greyscale, then <Sym tex='\oplus' help={HELP.xor} /> a subset of body cells toward the image intensity while keeping the flip count under the <Sym tex='B' help={HELP.budget} /> budget. Finder / timing patterns are preserved.
              </p>
              <div className='mt-3 flex items-center gap-3'>
                <Upload {...uploadHandler(setBakeImg)}>
                  <Button variant='accent' icon={<UploadOutlined />}>Upload silhouette</Button>
                </Upload>
                {bakeImg && (
                  <Button variant='ghost' onClick={() => setBakeImg(null)} icon={<DeleteOutlined />}>
                    Clear
                  </Button>
                )}
              </div>
              <div className='mt-4'>
                <Row label='Image influence (%)' help='Scales the number of cells we are allowed to flip, from 0 (pure QR) to 100 (full ECC waste budget).'>
                  <SliderNum min={0} max={100} value={bakeInfluence} onChange={setBakeInfluence} accent='fuchsia' />
                  <FieldHelp>Pushing this above ~80% at ECC L will typically break the scan. Move ECC to Q or H for aggressive bakes.</FieldHelp>
                </Row>
              </div>
            </div>
            <div className='text-[12px] leading-relaxed text-fg-muted space-y-2'>
              <div className='font-bold text-fg-primary'>Algorithm</div>
              <div>1. Sample the drop image at the <Sym tex='N \times N' help='current QR module grid' /> resolution using cover-fit + luma <Tex src='(0.299R + 0.587G + 0.114B)' />.</div>
              <div>2. For every body cell (skipping finder / timing / alignment), score how much flipping it toward the desired intensity would reduce the <Tex src='|I_{desired} - I_{current}|' /> residual.</div>
              <div>3. Sort candidates by score, take the top <Tex src='\lfloor 0.9\,B\,\eta\,N^2 \rfloor'/> flips (η = influence, safety factor 0.9), and stamp them into the render mask.</div>
              <div>4. The renderer overrides those cells; RS decoding still succeeds because we never exceed <Sym tex='2t = n-k' help={HELP.t} /> symbol errors.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Optimizer */}
      <div className='max-w-7xl mx-auto px-4 md:px-6 pb-4'>
        <div className='luxe-glass p-5'>
          <div className='flex items-center justify-between mb-3'>
            <h2 className='font-bold text-lg'>7. Auto-optimize</h2>
            <BulbOutlined className='text-amber-300 text-lg' />
          </div>
          <div className='flex flex-col md:flex-row md:items-center gap-4'>
            <Button variant='primary' size='large' icon={<ThunderboltFilled />}
              loading={optRunning} onClick={runOptimize}>
              Run grid search
            </Button>
            <div className='flex-1'>
              <Progress percent={Math.round(optProgress)} status={optRunning ? 'active' : 'normal'} strokeColor='#fbbf24' />
              <FieldHelp>
                Sweeps QR version × ECC × cell shape × gradient. Scores each candidate on (a) clean scan, (b) scan under 20% damage, (c) small size, (d) style preservation. Best pick is auto-applied.
              </FieldHelp>
              {optBest && (
                <div className='text-xs text-emerald-300 mt-2 font-mono'>
                  Picked: v{optBest.v || 'auto'} · ECC {optBest.e} · {optBest.sh} · gradient {optBest.gr ? 'on' : 'off'} · N={optBest.N} · score {optBest.score}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Download row */}
      <div className='max-w-7xl mx-auto px-4 md:px-6 pb-4'>
        <div className='luxe-glass p-5'>
          <div className='flex items-center justify-between mb-3'>
            <h2 className='font-bold text-lg'>8. Export</h2>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button variant='primary' icon={<DownloadOutlined />} onClick={() => downloadPNG(1)}>
              PNG
            </Button>
            <Button variant='ghost' icon={<DownloadOutlined />} onClick={() => downloadPNG(2)}>PNG 2×</Button>
            <Button variant='ghost' icon={<DownloadOutlined />} onClick={() => downloadPNG(4)}>PNG 4×</Button>
            <Button variant='ghost' icon={<DownloadOutlined />} onClick={() => downloadPNG(8)}>PNG 8×</Button>
            <Button variant='accent' icon={<DownloadOutlined />} onClick={downloadSVG}>SVG</Button>
            <Button variant='success' loading={saving} onClick={saveToLibrary}>
              Save to my library
            </Button>
          </div>
          <FieldHelp>
            SVG exports use the simple cell renderer (Square / Rounded / Dot) — for gradients, image bake-in, and blend modes, use PNG at the resolution you need.
          </FieldHelp>
        </div>
      </div>

      {/* Theory panel */}
      <div className='max-w-7xl mx-auto px-4 md:px-6 pb-4'>
        <div className='luxe-glass p-5'>
          <h2 className='font-bold text-lg mb-3'>9. How this works</h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6 text-[13px] leading-relaxed text-fg-muted'>
            <div className='space-y-3'>
              <div>
                <div className='text-fg-primary font-bold mb-1'>Reed–Solomon over <Sym tex='GF(2^8)' help={HELP.gf} /></div>
                Every QR codeword is a polynomial over the 256-element field. The singleton bound gives us{' '}
                <Tex src='n = k + 2t' display /> so the encoder appends <Sym tex='2t' help={HELP.t} /> parity bytes and can correct up to{' '}
                <Sym tex='t' help={HELP.t} /> byte errors anywhere in the block.
              </div>
              <div>
                <div className='text-fg-primary font-bold mb-1'>ECC → correctable fraction</div>
                Level <Sym tex='L' help={HELP.L} /> keeps <Tex src='k/n \approx 0.93' />, level <Sym tex='H' help={HELP.H} /> pushes <Tex src='k/n \approx 0.70' />. That gap is the pixel budget we spend on logos and image bakes.
              </div>
              <div>
                <div className='text-fg-primary font-bold mb-1'>Galois arithmetic sample</div>
                Because the multiplicative group is cyclic of order 255,{' '}
                <Tex src='\alpha^{7} \cdot \alpha^{12} = \alpha^{19} = \alpha^{19 \bmod 255}' display />
                every product reduces to one of 255 log entries — the reason RS encoders ship an antilog table.
              </div>
            </div>
            <div className='space-y-3'>
              <div>
                <div className='text-fg-primary font-bold mb-1'>Masking</div>
                After data + ECC bits fill the matrix the encoder XORs one of eight mask functions{' '}
                <Sym tex='f(i,j)' help={HELP.mask} /> to break up long same-colour runs. The chosen mask minimises a 4-term "penalty score" the spec defines (runs, blocks, finder-like patterns, dark-ratio bias).
              </div>
              <div>
                <div className='text-fg-primary font-bold mb-1'>Why you can put a logo on it</div>
                <ol className='list-decimal ml-4 mt-1 space-y-1 text-fg-muted'>
                  <li>The decoder locates the three <Sym tex='F' help={HELP.finder} /> patterns and computes a perspective transform — a logo dead-centre never touches them.</li>
                  <li>Every module the logo hides is an erasure the RS decoder can fill from parity, up to the <Sym tex='B' help={HELP.budget} /> budget.</li>
                  <li>Higher ECC = more parity = larger safe logo. H-level gives ~30%.</li>
                  <li>Same idea powers the image-bake panel: we flip cells within the budget instead of blindly overlaying.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History — BE-backed shareable library. Each row has a public
          share URL at /qr/s/:id. Public toggle + delete are owner-only
          (identified by the X-QR-Owner fingerprint header). */}
      <div className='max-w-7xl mx-auto px-4 md:px-6 pb-16'>
        <div className='luxe-glass p-5'>
          <div className='flex items-center justify-between mb-3'>
            <div>
              <h2 className='font-bold text-lg'>10. My library</h2>
              <FieldHelp>
                Saved QRs live on the server so you can share them by URL. Only your browser can edit or delete these — no login required.
              </FieldHelp>
            </div>
            <div className='flex gap-2'>
              <Button variant='ghost' icon={<ReloadOutlined />} loading={historyLoading} onClick={refreshHistory}>
                Refresh
              </Button>
              <Button variant='primary' loading={saving} onClick={saveToLibrary}>
                Save current
              </Button>
            </div>
          </div>
          {historyErr && (
            <div className='text-sm text-rose-300 bg-rose-500/10 border border-rose-400/30 rounded-lg px-3 py-2 mb-3'>
              {historyErr}
            </div>
          )}
          {!historyLoading && !history.length && !historyErr && (
            <div className='text-sm text-fg-muted py-6 text-center'>
              Nothing saved yet. Hit "Save current" or "Save to my library" (in the Export panel) to create your first shareable QR.
            </div>
          )}
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
            {history.map((h) => (
              <div key={h.id} className='luxe-card p-3 flex flex-col gap-2 group'>
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <span className='text-[10px] uppercase tracking-widest text-amber-300 font-bold'>
                      {(KIND_FROM_BE[h.payloadKind] || h.payloadKind).toUpperCase()}
                    </span>
                    <div className='font-bold text-sm truncate' title={h.title || 'Untitled'}>
                      {h.title || 'Untitled'}
                    </div>
                  </div>
                  {h.hasPng && h.pngDataUrl && (
                    <img
                      src={h.pngDataUrl}
                      alt=''
                      className='w-12 h-12 rounded object-cover bg-white shrink-0'
                    />
                  )}
                </div>
                <div className='font-mono text-[11px] break-all opacity-70 line-clamp-2'>
                  {h.payload}
                </div>
                <div className='flex items-center justify-between text-[10px] text-fg-muted'>
                  <span>{h.views} view{h.views === 1 ? '' : 's'}</span>
                  <span>{new Date(h.createdAt).toLocaleDateString()}</span>
                </div>
                <div className='pt-1 flex flex-wrap gap-1'>
                  <Button size='small' variant='subtle' onClick={() => restoreHistory(h)}>
                    Restore
                  </Button>
                  <Link to={`/qr/s/${h.id}`}>
                    <Button size='small' variant='ghost'>Open</Button>
                  </Link>
                  <Button size='small' variant='ghost' onClick={() => copyShareLink(h.id)}>
                    Copy link
                  </Button>
                  <Button
                    size='small'
                    variant={h.public ? 'secondary' : 'subtle'}
                    onClick={() => togglePublicHistory(h.id, !h.public)}>
                    {h.public ? 'Public' : 'Private'}
                  </Button>
                  <Button size='small' variant='danger' icon={<DeleteOutlined />}
                    onClick={() => deleteHistory(h.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      </>)}
    </div>
  )
}
