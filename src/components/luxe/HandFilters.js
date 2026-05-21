// Hand-tracking Filters catalog — 50 curated overlay effects.
//
// Each filter is a small canvas-2D paint routine that runs on top of the
// camera feed. The render fn signature is:
//   (ctx, tipX, tipY, W, H, t) => void
// where (tipX, tipY) is the index-finger tip in mirrored-frame pixel coords,
// (W, H) is the canvas size, and `t` is millis since page mount.
//
// Effects are intentionally cheap: gradients, composite ops, deterministic
// particle systems seeded from `t`. No per-pixel loops, no getImageData.

// ── shared helpers ─────────────────────────────────────────────────────
// Tiny pseudo-random — deterministic from index, used to keep particle
// positions stable across frames so they don't strobe.
const rand = (i, seed = 1) => {
  const x = Math.sin(i * 9301 + seed * 49297) * 233280
  return x - Math.floor(x)
}

// Draw a checkerboard / cross-hatch dither at a given step + tint.
const ditherFill = (ctx, W, H, step, dotSize, dim, dot) => {
  ctx.fillStyle = dim
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = dot
  for (let y = 0; y < H; y += step) {
    const off = ((y / step) | 0) % 2 === 0 ? 0 : step / 2
    for (let x = off; x < W; x += step) ctx.fillRect(x, y, dotSize, dotSize)
  }
}

// Scanline helper.
const scanlines = (ctx, W, H, gap, alpha, t) => {
  ctx.strokeStyle = `rgba(0,0,0,${alpha})`
  ctx.lineWidth = 1
  const offset = (t / 30) % gap
  for (let y = offset; y < H; y += gap) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }
}

// Radial darken with optional hole around (cx, cy).
const radialDim = (ctx, W, H, cx, cy, holeR, edgeAlpha = 0.85, color = '0,0,0') => {
  const grad = ctx.createRadialGradient(cx, cy, holeR, cx, cy, Math.max(W, H) * 0.7)
  grad.addColorStop(0, `rgba(${color},0)`)
  grad.addColorStop(0.18, `rgba(${color},0)`)
  grad.addColorStop(1, `rgba(${color},${edgeAlpha})`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)
}

// Simple particle field — deterministic positions; `mover` drifts them.
const particles = (ctx, W, H, t, count, draw) => {
  for (let i = 0; i < count; i++) {
    const seed = rand(i, 1)
    const sx = rand(i, 2) * W
    const sy = rand(i, 3) * H
    draw(ctx, i, seed, sx, sy, t, W, H)
  }
}

// ── FILTERS catalog (exactly 50) ───────────────────────────────────────
export const FILTERS = [
  // ═══ RETRO (8) ═══
  {
    id: 'scanlines', name: 'Scanlines', icon: '📺', family: 'retro',
    render: (ctx, _x, _y, W, H, t) => {
      scanlines(ctx, W, H, 4, 0.35, t)
      ctx.fillStyle = 'rgba(20, 30, 50, 0.08)'; ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'vhs-aberration', name: 'VHS Aberration', icon: '📼', family: 'retro',
    render: (ctx, _x, _y, W, H, t) => {
      ctx.fillStyle = 'rgba(255, 30, 120, 0.06)'; ctx.fillRect(0, 0, W, H)
      scanlines(ctx, W, H, 4, 0.3, t)
      ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#ef4444'
      ctx.fillText('● REC', 12, H - 14)
    },
  },
  {
    id: 'vhs-glitch-band', name: 'Glitch Band', icon: '🎞️', family: 'retro',
    render: (ctx, _x, _y, W, H, t) => {
      const bandY = (t / 4) % H
      ctx.fillStyle = 'rgba(0, 255, 255, 0.18)'; ctx.fillRect(0, bandY, W, 22)
      ctx.fillStyle = 'rgba(255, 0, 200, 0.12)'; ctx.fillRect(0, (bandY + 40) % H, W, 8)
      scanlines(ctx, W, H, 3, 0.25, t)
    },
  },
  {
    id: 'vintage-vignette', name: 'Vintage Vignette', icon: '🖼️', family: 'retro',
    render: (ctx, _x, _y, W, H) => {
      const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.65)
      grad.addColorStop(0, 'rgba(120, 80, 30, 0)')
      grad.addColorStop(1, 'rgba(40, 20, 0, 0.7)')
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = 'rgba(200, 140, 60, 0.07)'; ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'film-grain', name: 'Film Grain', icon: '🎬', family: 'retro',
    render: (ctx, _x, _y, W, H, t) => {
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, 0, W, H)
      particles(ctx, W, H, t, 220, (c, i, s, sx, sy) => {
        const x = (sx + rand(i, t / 80 | 0) * 9) % W
        const y = (sy + rand(i, (t / 80 | 0) + 7) * 9) % H
        c.fillStyle = s > 0.5 ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.18)'
        c.fillRect(x, y, 1.5, 1.5)
      })
    },
  },
  {
    id: 'sepia-wash', name: 'Sepia Wash', icon: '🟫', family: 'retro',
    render: (ctx, _x, _y, W, H) => {
      ctx.fillStyle = 'rgba(112, 66, 20, 0.28)'; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = 'rgba(255, 200, 130, 0.08)'; ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'retro-pink', name: 'Retro Pink', icon: '🌸', family: 'retro',
    render: (ctx, _x, _y, W, H) => {
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, 'rgba(255, 100, 180, 0.22)')
      grad.addColorStop(1, 'rgba(150, 80, 200, 0.22)')
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'super-8', name: 'Super 8', icon: '🎥', family: 'retro',
    render: (ctx, _x, _y, W, H, t) => {
      // sprocket bars + warm vignette
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, 18); ctx.fillRect(0, H - 18, W, 18)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      for (let x = (t / 8) % 30; x < W; x += 30) { ctx.fillRect(x, 5, 12, 8); ctx.fillRect(x, H - 13, 12, 8) }
      ctx.fillStyle = 'rgba(255, 180, 80, 0.12)'; ctx.fillRect(0, 0, W, H)
    },
  },

  // ═══ PIXEL (6) ═══
  {
    id: 'dither-dark', name: 'Dither Dark', icon: '⬛', family: 'pixel',
    render: (ctx, _x, _y, W, H) => ditherFill(ctx, W, H, 7, 2, 'rgba(0,0,0,0.32)', 'rgba(255,255,255,0.18)'),
  },
  {
    id: 'dither-light', name: 'Dither Light', icon: '⬜', family: 'pixel',
    render: (ctx, _x, _y, W, H) => ditherFill(ctx, W, H, 7, 2, 'rgba(255,255,255,0.18)', 'rgba(0,0,0,0.45)'),
  },
  {
    id: 'pixelate-small', name: 'Pixel Grid', icon: '🟪', family: 'pixel',
    render: (ctx, _x, _y, W, H) => {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1
      const step = 10
      for (let x = 0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
      for (let y = 0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
    },
  },
  {
    id: 'halftone-dots', name: 'Halftone', icon: '🔘', family: 'pixel',
    render: (ctx, _x, _y, W, H) => {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      const step = 12
      for (let y = 0; y < H; y += step) {
        const off = ((y / step) | 0) % 2 ? step / 2 : 0
        for (let x = off; x < W; x += step) {
          ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
        }
      }
    },
  },
  {
    id: 'ascii-shadows', name: 'ASCII Shadows', icon: '🔡', family: 'pixel',
    render: (ctx, _x, _y, W, H, t) => {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, W, H)
      ctx.font = '12px monospace'
      ctx.fillStyle = 'rgba(120, 255, 160, 0.55)'
      const chars = '01@#*+-. '
      const step = 12
      for (let y = step; y < H; y += step) {
        for (let x = 0; x < W; x += step) {
          const i = ((x + y + (t / 40 | 0)) * 7) | 0
          ctx.fillText(chars[i % chars.length], x, y)
        }
      }
    },
  },
  {
    id: 'mosaic-large', name: 'Mosaic', icon: '🧩', family: 'pixel',
    render: (ctx, _x, _y, W, H) => {
      const step = 28
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2
      for (let x = 0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
      for (let y = 0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(0, 0, W, H)
    },
  },

  // ═══ LIGHT (8) ═══
  {
    id: 'spotlight-tip', name: 'Spotlight Tip', icon: '🔦', family: 'light',
    render: (ctx, tipX, tipY, W, H) => {
      radialDim(ctx, W, H, tipX, tipY, 25, 0.85)
      ctx.beginPath(); ctx.arc(tipX, tipY, 26, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 240, 200, 0.95)'; ctx.lineWidth = 2; ctx.stroke()
    },
  },
  {
    id: 'spotlight-soft', name: 'Soft Light', icon: '💡', family: 'light',
    render: (ctx, tipX, tipY, W, H) => {
      const grad = ctx.createRadialGradient(tipX, tipY, 10, tipX, tipY, 220)
      grad.addColorStop(0, 'rgba(255, 240, 180, 0.4)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)
      radialDim(ctx, W, H, tipX, tipY, 60, 0.55)
    },
  },
  {
    id: 'vignette-violet', name: 'Violet Vignette', icon: '🟣', family: 'light',
    render: (ctx, _x, _y, W, H) => radialDim(ctx, W, H, W / 2, H / 2, Math.min(W, H) * 0.3, 0.8, '60,20,90'),
  },
  {
    id: 'peephole', name: 'Peephole', icon: '🕳️', family: 'light',
    render: (ctx, tipX, tipY, W, H) => {
      ctx.fillStyle = 'rgba(0,0,0,0.93)'
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath(); ctx.arc(tipX, tipY, 95, 0, Math.PI * 2); ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6
      ctx.beginPath(); ctx.arc(tipX, tipY, 95, 0, Math.PI * 2); ctx.stroke()
    },
  },
  {
    id: 'tunnel-vision', name: 'Tunnel Vision', icon: '🌀', family: 'light',
    render: (ctx, _x, _y, W, H) => {
      const cx = W / 2, cy = H / 2
      const grad = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.15, cx, cy, Math.max(W, H) * 0.6)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(0.45, 'rgba(0,0,0,0.4)')
      grad.addColorStop(1, 'rgba(0,0,0,0.98)')
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'fog-edges', name: 'Fog Edges', icon: '🌫️', family: 'light',
    render: (ctx, _x, _y, W, H) => {
      const top = ctx.createLinearGradient(0, 0, 0, H * 0.4)
      top.addColorStop(0, 'rgba(220,220,235,0.45)'); top.addColorStop(1, 'rgba(220,220,235,0)')
      ctx.fillStyle = top; ctx.fillRect(0, 0, W, H * 0.4)
      const bot = ctx.createLinearGradient(0, H * 0.6, 0, H)
      bot.addColorStop(0, 'rgba(220,220,235,0)'); bot.addColorStop(1, 'rgba(220,220,235,0.45)')
      ctx.fillStyle = bot; ctx.fillRect(0, H * 0.6, W, H * 0.4)
    },
  },
  {
    id: 'frosted-corners', name: 'Frosted Corners', icon: '❄️', family: 'light',
    render: (ctx, _x, _y, W, H) => {
      const corners = [[0, 0], [W, 0], [0, H], [W, H]]
      for (const [cx, cy] of corners) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.5)
        g.addColorStop(0, 'rgba(200, 230, 255, 0.45)')
        g.addColorStop(1, 'rgba(200, 230, 255, 0)')
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      }
    },
  },
  {
    id: 'dark-gradient', name: 'Dark Gradient', icon: '🌑', family: 'light',
    render: (ctx, _x, _y, W, H) => {
      const g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    },
  },

  // ═══ COLOR (8) ═══
  {
    id: 'grayscale-wash', name: 'Grayscale Wash', icon: '⚪', family: 'color',
    render: (ctx, _x, _y, W, H) => {
      ctx.fillStyle = 'rgba(128,128,128,0.35)'; ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'invert-overlay', name: 'Invert Tint', icon: '🔃', family: 'color',
    render: (ctx, _x, _y, W, H) => {
      ctx.globalCompositeOperation = 'difference'
      ctx.fillStyle = 'rgba(200,200,200,1)'; ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'source-over'
    },
  },
  {
    id: 'duotone-cyan-rose', name: 'Cyan/Rose', icon: '🩷', family: 'color',
    render: (ctx, _x, _y, W, H) => {
      const g = ctx.createLinearGradient(0, 0, W, H)
      g.addColorStop(0, 'rgba(0, 200, 220, 0.32)'); g.addColorStop(1, 'rgba(255, 80, 160, 0.32)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'duotone-amber-blue', name: 'Amber/Blue', icon: '🟡', family: 'color',
    render: (ctx, _x, _y, W, H) => {
      const g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, 'rgba(255, 180, 40, 0.3)'); g.addColorStop(1, 'rgba(40, 80, 200, 0.32)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'threshold-edges', name: 'Threshold', icon: '◼️', family: 'color',
    render: (ctx, _x, _y, W, H) => {
      ctx.globalCompositeOperation = 'overlay'
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'posterize-bands', name: 'Posterize', icon: '🎨', family: 'color',
    render: (ctx, _x, _y, W, H) => {
      const bands = ['#ff0080', '#ffea00', '#00ffaa', '#00d4ff', '#aa00ff']
      const bh = H / bands.length
      for (let i = 0; i < bands.length; i++) {
        ctx.fillStyle = bands[i] + '22'
        ctx.fillRect(0, i * bh, W, bh)
      }
    },
  },
  {
    id: 'neon-outline-light', name: 'Neon (soft)', icon: '💚', family: 'color',
    render: (ctx, _x, _y, W, H) => {
      ctx.strokeStyle = 'rgba(0, 255, 180, 0.45)'; ctx.lineWidth = 4
      ctx.strokeRect(8, 8, W - 16, H - 16)
      ctx.shadowColor = 'rgba(0,255,180,0.7)'; ctx.shadowBlur = 14
      ctx.strokeStyle = 'rgba(0, 255, 180, 0.2)'
      ctx.strokeRect(16, 16, W - 32, H - 32)
      ctx.shadowBlur = 0
    },
  },
  {
    id: 'neon-outline-bright', name: 'Neon (bright)', icon: '💖', family: 'color',
    render: (ctx, _x, _y, W, H, t) => {
      const hue = (t / 30) % 360
      ctx.shadowColor = `hsl(${hue},100%,60%)`; ctx.shadowBlur = 22
      ctx.strokeStyle = `hsla(${hue},100%,65%,0.85)`; ctx.lineWidth = 6
      ctx.strokeRect(10, 10, W - 20, H - 20)
      ctx.shadowBlur = 0
    },
  },

  // ═══ DISTORT (5) ═══
  {
    id: 'water-ripple', name: 'Water Ripple', icon: '💧', family: 'distort',
    render: (ctx, tipX, tipY, W, H, t) => {
      for (let i = 0; i < 4; i++) {
        const r = ((t / 6) + i * 70) % 320
        const a = Math.max(0, 1 - r / 320)
        ctx.beginPath(); ctx.arc(tipX, tipY, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(125, 211, 252, ${a * 0.7})`; ctx.lineWidth = 3; ctx.stroke()
      }
      ctx.fillStyle = 'rgba(56, 189, 248, 0.06)'; ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'wave-horizontal', name: 'H-Wave', icon: '〰️', family: 'distort',
    render: (ctx, _x, _y, W, H, t) => {
      ctx.strokeStyle = 'rgba(180, 220, 255, 0.55)'; ctx.lineWidth = 2
      for (let k = 0; k < 6; k++) {
        ctx.beginPath()
        const yBase = (H / 6) * k + (H / 12)
        for (let x = 0; x <= W; x += 8) {
          const y = yBase + Math.sin((x / 40) + t / 300 + k) * 8
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    },
  },
  {
    id: 'wave-vertical', name: 'V-Wave', icon: '🌊', family: 'distort',
    render: (ctx, _x, _y, W, H, t) => {
      ctx.strokeStyle = 'rgba(255, 180, 220, 0.55)'; ctx.lineWidth = 2
      for (let k = 0; k < 6; k++) {
        ctx.beginPath()
        const xBase = (W / 6) * k + (W / 12)
        for (let y = 0; y <= H; y += 8) {
          const x = xBase + Math.sin((y / 40) + t / 300 + k) * 8
          if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    },
  },
  {
    id: 'mirror-split', name: 'Mirror Split', icon: '🪞', family: 'distort',
    render: (ctx, _x, _y, W, H) => {
      // Suggests a mirror — bright vertical seam down the center.
      const g = ctx.createLinearGradient(W / 2 - 24, 0, W / 2 + 24, 0)
      g.addColorStop(0, 'rgba(255,255,255,0)')
      g.addColorStop(0.5, 'rgba(255,255,255,0.7)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g; ctx.fillRect(W / 2 - 24, 0, 48, H)
      ctx.fillStyle = 'rgba(180, 200, 255, 0.06)'; ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'lens-bulge', name: 'Lens Bulge', icon: '🔍', family: 'distort',
    render: (ctx, tipX, tipY, W, H) => {
      // Inner glow ring to *suggest* a fish-eye bulge under the tip.
      const grad = ctx.createRadialGradient(tipX, tipY, 30, tipX, tipY, 110)
      grad.addColorStop(0, 'rgba(255,255,255,0.0)')
      grad.addColorStop(0.85, 'rgba(255,255,255,0.45)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)
      ctx.beginPath(); ctx.arc(tipX, tipY, 110, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke()
    },
  },

  // ═══ OVERLAY (8) ═══
  {
    id: 'rain', name: 'Rain', icon: '🌧️', family: 'overlay',
    render: (ctx, _x, _y, W, H, t) => {
      ctx.strokeStyle = 'rgba(180, 220, 255, 0.55)'; ctx.lineWidth = 1.5
      particles(ctx, W, H, t, 80, (c, i, _s, sx) => {
        const x = sx
        const y = (rand(i, 5) * H + t * (0.4 + rand(i, 6) * 0.4)) % H
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2, y + 12); c.stroke()
      })
    },
  },
  {
    id: 'snow', name: 'Snow', icon: '❄️', family: 'overlay',
    render: (ctx, _x, _y, W, H, t) => {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      particles(ctx, W, H, t, 80, (c, i, _s, sx) => {
        const drift = Math.sin(t / 700 + i) * 18
        const x = (sx + drift + W) % W
        const y = (rand(i, 8) * H + t * (0.05 + rand(i, 9) * 0.08)) % H
        const r = 1 + rand(i, 10) * 2.2
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill()
      })
    },
  },
  {
    id: 'stars', name: 'Stars', icon: '⭐', family: 'overlay',
    render: (ctx, _x, _y, W, H, t) => {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H)
      particles(ctx, W, H, t, 80, (c, i, s, sx, sy) => {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t / 400 + i))
        c.fillStyle = `rgba(255,255,${200 + (s * 55) | 0},${tw})`
        const r = 0.6 + s * 1.6
        c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.fill()
      })
    },
  },
  {
    id: 'confetti', name: 'Confetti', icon: '🎉', family: 'overlay',
    render: (ctx, _x, _y, W, H, t) => {
      const cols = ['#ff5d8f', '#fde047', '#22d3ee', '#a78bfa', '#34d399']
      particles(ctx, W, H, t, 80, (c, i, _s, sx) => {
        const x = (sx + Math.sin(t / 400 + i) * 20 + W) % W
        const y = (rand(i, 11) * H + t * (0.15 + rand(i, 12) * 0.25)) % H
        c.fillStyle = cols[i % cols.length]
        c.save(); c.translate(x, y); c.rotate(t / 200 + i)
        c.fillRect(-3, -1.5, 6, 3); c.restore()
      })
    },
  },
  {
    id: 'hearts', name: 'Hearts', icon: '💗', family: 'overlay',
    render: (ctx, _x, _y, W, H, t) => {
      ctx.fillStyle = 'rgba(255, 90, 150, 0.85)'
      ctx.font = '20px serif'
      particles(ctx, W, H, t, 80, (c, i, _s, sx) => {
        const x = (sx + Math.sin(t / 500 + i) * 14 + W) % W
        const y = (H - ((rand(i, 13) * H + t * (0.08 + rand(i, 14) * 0.1)) % H))
        c.globalAlpha = 0.5 + rand(i, 15) * 0.5
        c.fillText('♥', x, y)
      })
      ctx.globalAlpha = 1
    },
  },
  {
    id: 'fireflies', name: 'Fireflies', icon: '🪲', family: 'overlay',
    render: (ctx, _x, _y, W, H, t) => {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H)
      particles(ctx, W, H, t, 80, (c, i, s, sx, sy) => {
        const x = sx + Math.sin(t / 600 + i) * 30
        const y = sy + Math.cos(t / 500 + i * 1.3) * 30
        const glow = 0.4 + 0.6 * Math.abs(Math.sin(t / 300 + i))
        c.shadowColor = 'rgba(255, 240, 120, 0.9)'; c.shadowBlur = 10
        c.fillStyle = `rgba(255, 250, 180, ${glow})`
        c.beginPath(); c.arc(x, y, 1.5 + s * 1.5, 0, Math.PI * 2); c.fill()
      })
      ctx.shadowBlur = 0
    },
  },
  {
    id: 'leaves', name: 'Leaves', icon: '🍂', family: 'overlay',
    render: (ctx, _x, _y, W, H, t) => {
      ctx.font = '18px serif'
      const cols = ['#d97706', '#b45309', '#92400e', '#65a30d']
      particles(ctx, W, H, t, 80, (c, i, _s, sx) => {
        const x = (sx + Math.sin(t / 350 + i) * 36 + W) % W
        const y = (rand(i, 16) * H + t * (0.06 + rand(i, 17) * 0.08)) % H
        c.fillStyle = cols[i % cols.length]
        c.save(); c.translate(x, y); c.rotate(Math.sin(t / 400 + i))
        c.fillText('❦', 0, 0); c.restore()
      })
    },
  },
  {
    id: 'bubbles', name: 'Bubbles', icon: '🫧', family: 'overlay',
    render: (ctx, _x, _y, W, H, t) => {
      particles(ctx, W, H, t, 80, (c, i, s, sx) => {
        const x = sx + Math.sin(t / 600 + i) * 12
        const y = (H - ((rand(i, 18) * H + t * (0.07 + rand(i, 19) * 0.09)) % H))
        const r = 4 + s * 12
        c.strokeStyle = 'rgba(200, 235, 255, 0.7)'; c.lineWidth = 1.5
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke()
        c.fillStyle = 'rgba(255,255,255,0.18)'
        c.beginPath(); c.arc(x - r / 3, y - r / 3, r / 4, 0, Math.PI * 2); c.fill()
      })
    },
  },

  // ═══ LIGHTING (4) ═══
  {
    id: 'bloom-warm', name: 'Warm Bloom', icon: '☀️', family: 'lighting',
    render: (ctx, _x, _y, W, H) => {
      const g = ctx.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, Math.max(W, H) * 0.55)
      g.addColorStop(0, 'rgba(255, 220, 140, 0.55)')
      g.addColorStop(1, 'rgba(255, 220, 140, 0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'bloom-cool', name: 'Cool Bloom', icon: '🌙', family: 'lighting',
    render: (ctx, _x, _y, W, H) => {
      const g = ctx.createRadialGradient(W * 0.3, H * 0.7, 0, W * 0.3, H * 0.7, Math.max(W, H) * 0.55)
      g.addColorStop(0, 'rgba(140, 200, 255, 0.5)')
      g.addColorStop(1, 'rgba(140, 200, 255, 0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'sun-rays', name: 'Sun Rays', icon: '🌞', family: 'lighting',
    render: (ctx, _x, _y, W, H, t) => {
      const cx = W * 0.5, cy = -40
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t / 4000)
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6)
        const g = ctx.createLinearGradient(0, 0, 0, H * 1.2)
        g.addColorStop(0, 'rgba(255, 240, 180, 0.35)')
        g.addColorStop(1, 'rgba(255, 240, 180, 0)')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.lineTo(0, H * 1.2); ctx.closePath(); ctx.fill()
      }
      ctx.restore(); ctx.globalCompositeOperation = 'source-over'
    },
  },
  {
    id: 'lens-flare', name: 'Lens Flare', icon: '🌟', family: 'lighting',
    render: (ctx, _x, _y, W, H, t) => {
      const fx = W * 0.75 + Math.sin(t / 1200) * 20
      const fy = H * 0.25
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 140)
      g.addColorStop(0, 'rgba(255,255,255,0.85)')
      g.addColorStop(0.4, 'rgba(255, 220, 160, 0.35)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      // smaller secondary orbs along the diagonal toward center
      for (let i = 1; i <= 4; i++) {
        const x = fx + (W / 2 - fx) * (i / 4)
        const y = fy + (H / 2 - fy) * (i / 4)
        const r = 18 + i * 5
        const g2 = ctx.createRadialGradient(x, y, 0, x, y, r)
        g2.addColorStop(0, `rgba(255, 200, 130, ${0.4 - i * 0.07})`)
        g2.addColorStop(1, 'rgba(255,200,130,0)')
        ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H)
      }
    },
  },

  // ═══ ABSTRACT (3) ═══
  {
    id: 'polka-dots', name: 'Polka Dots', icon: '🔴', family: 'abstract',
    render: (ctx, _x, _y, W, H, t) => {
      ctx.fillStyle = 'rgba(255, 80, 130, 0.55)'
      const step = 38
      for (let y = 0; y < H + step; y += step) {
        const off = ((y / step) | 0) % 2 ? step / 2 : 0
        const wobble = Math.sin(t / 600 + y / 30) * 4
        for (let x = -step; x < W + step; x += step) {
          ctx.beginPath(); ctx.arc(x + off + wobble, y, 7, 0, Math.PI * 2); ctx.fill()
        }
      }
    },
  },
  {
    id: 'line-rain', name: 'Line Rain', icon: '🌃', family: 'abstract',
    render: (ctx, _x, _y, W, H, t) => {
      ctx.strokeStyle = 'rgba(120, 255, 200, 0.45)'; ctx.lineWidth = 1
      for (let i = 0; i < 60; i++) {
        const x = (rand(i, 21) * W + Math.sin(t / 400 + i) * 10) % W
        const y0 = ((rand(i, 22) * H * 2 + t * (0.2 + rand(i, 23) * 0.4)) % (H + 80)) - 80
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + 24 + rand(i, 24) * 30); ctx.stroke()
      }
    },
  },
  {
    id: 'pulse-rings', name: 'Pulse Rings', icon: '🎯', family: 'abstract',
    render: (ctx, tipX, tipY, W, H, t) => {
      for (let i = 0; i < 3; i++) {
        const r = ((t / 8) + i * 100) % 300
        const a = Math.max(0, 1 - r / 300)
        ctx.beginPath(); ctx.arc(tipX, tipY, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(167, 139, 250, ${a * 0.85})`; ctx.lineWidth = 4 * a + 1; ctx.stroke()
      }
      ctx.fillStyle = 'rgba(167, 139, 250, 0.05)'; ctx.fillRect(0, 0, W, H)
    },
  },
]

// Gesture → default filter id mapping. Used when user hasn't manually
// picked a filter yet — keeps the original gesture-driven UX as the
// landing experience.
export const GESTURE_DEFAULTS = {
  fist:  'dither-dark',
  peace: 'vhs-aberration',
  point: 'spotlight-tip',
  open:  'water-ripple',
}

// Family display order for the chip picker.
export const FAMILY_ORDER = [
  'retro', 'pixel', 'light', 'color', 'distort', 'overlay', 'lighting', 'abstract',
]

export const FAMILY_LABELS = {
  retro:    'Retro',
  pixel:    'Pixel',
  light:    'Light',
  color:    'Color',
  distort:  'Distort',
  overlay:  'Overlay',
  lighting: 'Lighting',
  abstract: 'Abstract',
}
