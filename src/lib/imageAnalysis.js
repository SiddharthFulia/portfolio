// imageAnalysis.js — thin helpers for the QR Vision + Tattoo studios.
//
// Deep vision (caption, tags, subjects, OCR, palette, faces, depth) is now
// handled by the BE. This module used to run the full client-side vision
// pipeline (k-means colour extraction, edge-based metadata, Tesseract.js OCR);
// those have been removed. What's left is a small collection of helpers the
// FE still needs on the preview / rendering path.

// Turn a File / Blob / data-URL / http-URL into an HTMLImageElement.
export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    if (source instanceof Blob) {
      img.src = URL.createObjectURL(source)
    } else if (typeof source === 'string') {
      img.src = source
    } else {
      reject(new Error('Unsupported image source'))
    }
  })
}

// Small helper: build a same-size canvas so callers can display an image
// they've already loaded without re-decoding. Used for the Vision Studio
// preview + PNG export path.
export function toDataUrl(img, maxSide = 1200, mime = 'image/jpeg', q = 0.92) {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, cw, ch)
  return canvas.toDataURL(mime, q)
}

// Hex helpers used by the QR editor state derivation below.
export function hexToRgb(hex) {
  const s = String(hex || '').replace('#', '')
  if (!s) return [0, 0, 0]
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// WCAG-style contrast pick — used to choose the QR foreground / background
// pair from the BE-returned palette. Always picks the two swatches with the
// largest luminance delta so the QR reads reliably at any zoom.
export function pickContrastPair(colors) {
  if (!colors || colors.length < 2) return null
  const lum = (hex) => {
    const [r, g, b] = hexToRgb(hex).map((v) => v / 255).map((v) =>
      v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
    )
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  let best = { a: colors[0], b: colors[1], ratio: 0 }
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const l1 = lum(colors[i].hex)
      const l2 = lum(colors[j].hex)
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      if (ratio > best.ratio) best = { a: colors[i], b: colors[j], ratio }
    }
  }
  return best
}

// Derive a full editor state (matching QRCompiler's setters) from a
// BE-returned palette + optional aesthetic hints. Reused by Vision Studio
// and the Tattoo Studio to preserve the "Use this style" affordance.
//
// palette: [{ hex, weight }]  — sorted by weight desc
// aesthetic: { busyness?, saturation?, brightness? } — optional; drives
//            the cell / eye shape choice (busy = square, calm = rounded).
export function paletteToEditorState(palette, aesthetic = {}) {
  if (!palette || palette.length === 0) return null
  const pair = pickContrastPair(palette) || {
    a: palette[0],
    b: palette[1] || palette[0],
  }
  const rgbOf = (c) => c.rgb || hexToRgb(c.hex)
  const lum = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
  const [fg, bg] = lum(rgbOf(pair.a)) <= lum(rgbOf(pair.b))
    ? [pair.a, pair.b]
    : [pair.b, pair.a]
  const accent = palette.find((c) => c.hex !== fg.hex && c.hex !== bg.hex) || pair.b

  const busy = Number(aesthetic?.busyness) || 0
  const cellShape = busy > 0.35 ? 'Square' : 'Rounded'
  const eyeShape  = busy > 0.35 ? 'Rounded' : 'Circle'

  return {
    cellShape,
    eyeShape,
    eyeInnerShape: eyeShape,
    fgColor: fg.hex,
    fgColor2: accent.hex,
    bgColor: '#ffffff',
    gradientOn: true,
    gradientType: 'linear',
    gradientAngle: 135,
    ecc: 'H',
  }
}
