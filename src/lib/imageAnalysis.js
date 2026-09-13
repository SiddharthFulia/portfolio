// imageAnalysis.js — fully client-side vision utilities used by the QR
// Vision Studio and the Tattoo Studio's offline fallback path. Nothing here
// touches the network. Tesseract.js is lazy-loaded so the ~600 KB gzipped
// worker + language pack never lands in the main bundle.
//
// Public surface:
//   extractDominantColors(imageData, k=6)  → [{ hex, weight, rgb }]
//   imageMetadata(imageData)               → { width, height, aspect,
//                                              brightness, contrast, saturation,
//                                              orientation, textureBusy }
//   runOcr(source, onProgress?)            → { text, lines[], confidence, wordCount }
//   loadImage(fileOrUrl)                   → HTMLImageElement (offscreen)
//   toImageData(img, maxSide=1024)         → ImageData at ≤ maxSide on each edge
//
// The idea: hand the caller ImageData once, run all analyses off the same
// downsampled buffer. Colour extraction runs on a 64×64 view (fast), OCR on
// the full-res canvas (Tesseract handles its own downsample).

// ─── k-means for dominant colour extraction ───────────────────────────────
// We downsample to 64×64 (≈ 4096 pixels), then run Lloyd's algorithm in
// RGB space with k centroids. On modern hardware this runs in ~5-15ms.
// Weights are the fraction of pixels each cluster claims; we sort by weight
// desc so the palette reads "primary → accent". Centroid init uses
// k-means++ so we don't get two clusters colliding on the same colour.
export function extractDominantColors(imageData, k = 6) {
  if (!imageData || !imageData.data) return []
  const { data, width, height } = imageData

  // Sample pixels — cap at 4096 for stability.
  const targetSamples = 4096
  const total = width * height
  const step = Math.max(1, Math.floor(total / targetSamples))
  const points = []
  for (let i = 0; i < total; i += step) {
    const p = i * 4
    const a = data[p + 3]
    if (a < 8) continue                  // skip transparent pixels
    points.push([data[p], data[p + 1], data[p + 2]])
  }
  if (!points.length) return []

  const n = points.length
  const K = Math.max(1, Math.min(k, n))

  // k-means++ seeding
  const centroids = []
  centroids.push(points[Math.floor(Math.random() * n)].slice())
  const d2 = new Float64Array(n)
  for (let c = 1; c < K; c++) {
    let sum = 0
    for (let i = 0; i < n; i++) {
      let best = Infinity
      for (const cx of centroids) {
        const dr = points[i][0] - cx[0]
        const dg = points[i][1] - cx[1]
        const db = points[i][2] - cx[2]
        const dist = dr * dr + dg * dg + db * db
        if (dist < best) best = dist
      }
      d2[i] = best
      sum += best
    }
    // Weighted pick proportional to D²
    let r = Math.random() * sum
    let idx = 0
    for (; idx < n; idx++) {
      r -= d2[idx]
      if (r <= 0) break
    }
    centroids.push(points[Math.min(idx, n - 1)].slice())
  }

  // Lloyd iterations. 10 is enough for RGB k-means to stabilise on 4k pts.
  const assign = new Int32Array(n)
  const MAX_ITER = 10
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < K; c++) {
        const dr = points[i][0] - centroids[c][0]
        const dg = points[i][1] - centroids[c][1]
        const db = points[i][2] - centroids[c][2]
        const dist = dr * dr + dg * dg + db * db
        if (dist < bestDist) { bestDist = dist; best = c }
      }
      if (assign[i] !== best) { assign[i] = best; moved = true }
    }
    // Recompute centroids
    const sums = Array.from({ length: K }, () => [0, 0, 0, 0])
    for (let i = 0; i < n; i++) {
      const c = assign[i]
      sums[c][0] += points[i][0]
      sums[c][1] += points[i][1]
      sums[c][2] += points[i][2]
      sums[c][3]++
    }
    for (let c = 0; c < K; c++) {
      if (sums[c][3] > 0) {
        centroids[c][0] = sums[c][0] / sums[c][3]
        centroids[c][1] = sums[c][1] / sums[c][3]
        centroids[c][2] = sums[c][2] / sums[c][3]
      }
    }
    if (!moved) break
  }

  // Count weights, drop empty clusters, sort by weight desc.
  const counts = new Array(K).fill(0)
  for (let i = 0; i < n; i++) counts[assign[i]]++
  const clusters = centroids
    .map((c, i) => ({
      hex: rgbToHex(c[0], c[1], c[2]),
      rgb: [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])],
      weight: counts[i] / n,
    }))
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.weight - a.weight)

  return clusters
}

// ─── Metadata ─────────────────────────────────────────────────────────────
// Compact stats the QR compiler can use to nudge style defaults:
//   • brightness → picks light/dark background
//   • contrast   → decides if we bake the image or leave it out
//   • saturation → biases the gradient toggle
//   • textureBusy→ if HI, prefer square cells (text-heavy scans clean); if
//                  LO, rounded cells look organic on illustrative images.
export function imageMetadata(imageData) {
  if (!imageData || !imageData.data) return null
  const { data, width, height } = imageData
  const total = width * height
  const step = Math.max(1, Math.floor(total / 4096))

  let rSum = 0, gSum = 0, bSum = 0
  let brightSum = 0, brightSq = 0
  let satSum = 0
  let edgeSum = 0
  let count = 0
  for (let y = 0; y < height; y += Math.max(1, Math.floor(Math.sqrt(step)))) {
    for (let x = 0; x < width; x += Math.max(1, Math.floor(Math.sqrt(step)))) {
      const p = (y * width + x) * 4
      const r = data[p], g = data[p + 1], b = data[p + 2]
      const y0 = 0.299 * r + 0.587 * g + 0.114 * b
      brightSum += y0
      brightSq += y0 * y0
      rSum += r; gSum += g; bSum += b
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const sat = mx === 0 ? 0 : (mx - mn) / mx
      satSum += sat

      // Cheap edge magnitude: horizontal + vertical neighbour deltas.
      if (x < width - 2 && y < height - 2) {
        const q = (y * width + (x + 1)) * 4
        const r2 = (y + 1) * width * 4 + x * 4
        const dxL = Math.abs(y0 - (0.299 * data[q] + 0.587 * data[q + 1] + 0.114 * data[q + 2]))
        const dyL = Math.abs(y0 - (0.299 * data[r2] + 0.587 * data[r2 + 1] + 0.114 * data[r2 + 2]))
        edgeSum += dxL + dyL
      }
      count++
    }
  }
  if (!count) return null

  const brightness = brightSum / count / 255
  const variance = brightSq / count - (brightSum / count) ** 2
  const contrast = Math.min(1, Math.sqrt(Math.max(0, variance)) / 128)
  const saturation = satSum / count
  const textureBusy = Math.min(1, edgeSum / count / 128)

  return {
    width,
    height,
    aspect: width / height,
    orientation: width > height ? 'landscape' : width < height ? 'portrait' : 'square',
    brightness: +brightness.toFixed(3),
    contrast: +contrast.toFixed(3),
    saturation: +saturation.toFixed(3),
    textureBusy: +textureBusy.toFixed(3),
    meanR: Math.round(rSum / count),
    meanG: Math.round(gSum / count),
    meanB: Math.round(bSum / count),
  }
}

// ─── OCR (lazy-loaded Tesseract.js) ───────────────────────────────────────
// Tesseract.js ships ~600KB gzipped + fetches a ~3MB WASM worker + a
// per-language pack (~1-4MB) at runtime. We keep the import lazy so pages
// that don't need OCR don't pay for it.
let _tesseractPromise = null
async function loadTesseract() {
  if (!_tesseractPromise) {
    _tesseractPromise = import('tesseract.js').then((m) => m.default || m)
  }
  return _tesseractPromise
}

let _worker = null
export async function runOcr(source, onProgress) {
  const mod = await loadTesseract()
  const create = mod.createWorker || mod.default?.createWorker
  if (!create) throw new Error('Tesseract API not found')
  if (!_worker) {
    _worker = await create('eng', 1, {
      logger: (m) => {
        if (onProgress) onProgress(m)
      },
    })
  }
  const { data } = await _worker.recognize(source)
  const text = (data.text || '').trim()
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  return {
    text,
    lines,
    confidence: data.confidence != null ? data.confidence / 100 : null,
    wordCount: text ? text.split(/\s+/).length : 0,
  }
}

export async function terminateOcr() {
  if (_worker) {
    try { await _worker.terminate() } catch {}
    _worker = null
  }
}

// ─── Image helpers ───────────────────────────────────────────────────────
// Turn a File / Blob / data-URL / http-URL into an HTMLImageElement.
export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(new Error('Could not load image'))
    if (source instanceof Blob) {
      img.src = URL.createObjectURL(source)
    } else if (typeof source === 'string') {
      img.src = source
    } else {
      reject(new Error('Unsupported image source'))
    }
  })
}

// Render an HTMLImageElement onto an offscreen canvas at capped resolution
// and return its ImageData. maxSide caps the longest edge — 1024 for full
// analysis / OCR, 64 for the k-means colour pass.
export function toImageData(img, maxSide = 1024) {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, cw, ch)
  return ctx.getImageData(0, 0, cw, ch)
}

// Small helper: build a same-size canvas so callers can display the image
// they've already loaded without re-decoding (used in the Vision Studio
// preview + PNG export).
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

// ─── Small maths bits ────────────────────────────────────────────────────
function rgbToHex(r, g, b) {
  const to = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// Contrast ratio (WCAG) between two hex colours. Used to pick the QR
// foreground / background pair from the extracted palette — we always
// grab the two swatches with the largest luminance delta.
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

export function hexToRgb(hex) {
  const s = hex.replace('#', '')
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Derive a full editor state (matching QRCompiler's setters) from a
// palette + metadata pair. Reused by both Vision Studio and the Tattoo
// Studio offline fallback.
export function paletteToEditorState(palette, meta) {
  if (!palette || palette.length === 0) return null
  const pair = pickContrastPair(palette) || { a: palette[0], b: palette[1] || palette[0] }
  // Choose dark → light or light → dark for FG so the QR always reads.
  // We pick whichever colour is darker as the foreground (dark modules).
  const lum = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
  const [fg, bg] = lum(pair.a.rgb) <= lum(pair.b.rgb)
    ? [pair.a, pair.b]
    : [pair.b, pair.a]
  const accent = palette.find((c) => c.hex !== fg.hex && c.hex !== bg.hex) || pair.b

  // Cell shape choice: busy = square (crisper), calm = rounded (organic).
  const busy = meta?.textureBusy || 0
  const cellShape = busy > 0.35 ? 'Square' : 'Rounded'
  const eyeShape = busy > 0.35 ? 'Rounded' : 'Circle'

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
