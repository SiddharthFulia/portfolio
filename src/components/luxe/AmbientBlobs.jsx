// Slow-drifting colored blobs that sit behind any section to give the
// "cinematic dark" backdrop. Three blobs by default — cyan, violet,
// amber — at low opacity, mix-blend-mode: screen so they bleed into
// each other without flattening the foreground.
//
// All animation runs on `transform` (composited, GPU). No JS per-frame.
// Respects prefers-reduced-motion via the .luxe-blob CSS rule.
//
// Drop inside any positioned parent:
//   <section className="luxe-stage relative">
//     <AmbientBlobs />
//     ... content ...
//   </section>

export default function AmbientBlobs({
  variant = 'default',  // 'default' | 'warm' | 'cool' | 'subtle'
  className = '',
}) {
  const palettes = {
    default: [
      { color: '#5e6ad2', top: '-12%', left: '-8%',  size: 520, delay: '0s'   },
      { color: '#22d3ee', top: '40%',  left: '70%',  size: 460, delay: '-8s'  },
      { color: '#ec4899', top: '75%',  left: '15%',  size: 380, delay: '-14s' },
    ],
    warm: [
      { color: '#f59e0b', top: '-10%', left: '60%',  size: 540, delay: '0s'  },
      { color: '#ec4899', top: '55%',  left: '-10%', size: 480, delay: '-9s' },
      { color: '#7c3aed', top: '70%',  left: '70%',  size: 360, delay: '-15s'},
    ],
    cool: [
      { color: '#22d3ee', top: '-8%',  left: '60%',  size: 540, delay: '0s'  },
      { color: '#3b82f6', top: '50%',  left: '-12%', size: 480, delay: '-9s' },
      { color: '#10b981', top: '78%',  left: '65%',  size: 340, delay: '-15s'},
    ],
    subtle: [
      { color: '#5e6ad2', top: '0%',   left: '0%',   size: 720, delay: '0s'  },
      { color: '#22d3ee', top: '60%',  left: '60%',  size: 600, delay: '-10s'},
    ],
  }
  const blobs = palettes[variant] || palettes.default
  return (
    <div aria-hidden="true"
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {blobs.map((b, i) => (
        <div key={i} className="luxe-blob"
          style={{
            width: b.size, height: b.size,
            top: b.top, left: b.left,
            background: b.color,
            animationDelay: b.delay,
          }} />
      ))}
    </div>
  )
}
