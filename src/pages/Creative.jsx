import { useState, useRef, useEffect, lazy, Suspense } from 'react'

/* ── Lazy imports — nothing loads until selected ── */
const HolographicCard = lazy(() => import('../components/lab/HolographicCard'))
const AuroraEffect = lazy(() => import('../components/lab/AuroraEffect'))
const MorphingBlob = lazy(() => import('../components/lab/MorphingBlob'))
const Cube3D = lazy(() => import('../components/lab/Cube3D'))
const InfiniteMarquee = lazy(() => import('../components/lab/InfiniteMarquee'))
const NeonText = lazy(() => import('../components/lab/NeonText'))
const MagneticButton = lazy(() => import('../components/lab/MagneticButton'))
const GradientGenerator = lazy(() => import('../components/lab/GradientGenerator'))
const WaveGenerator = lazy(() => import('../components/lab/WaveGenerator'))
const GlitchText = lazy(() => import('../components/lab/GlitchText'))
const ParticlePlayground = lazy(() => import('../components/lab/ParticlePlayground'))
const TextAnimator = lazy(() => import('../components/lab/TextAnimator'))
const ShadowGenerator = lazy(() => import('../components/lab/ShadowGenerator'))

/* ── Demo definitions ── */
const DEMOS = [
  { id: 'holographic',  label: 'Holographic Card',     icon: '💳', tags: ['3D Tilt', 'Rainbow Overlay', 'Mouse Tracking'],         color: 'from-blue-500 to-cyan-400',     interactive: false },
  { id: 'aurora',       label: 'Aurora Borealis',       icon: '🌌', tags: ['CSS Animation', 'Starfield', 'Blend Modes', 'Pure CSS'], color: 'from-green-500 to-teal-400',    interactive: false },
  { id: 'morphing',     label: 'Morphing Blob',         icon: '🫧', tags: ['Border-Radius', 'Frosted Glass', 'Mouse Reactive'],     color: 'from-purple-500 to-pink-500',   interactive: false },
  { id: 'cube',         label: '3D Tech Cube',          icon: '🧊', tags: ['CSS 3D', 'Drag Rotate', 'preserve-3d', 'Touch'],        color: 'from-orange-500 to-red-500',    interactive: false },
  { id: 'marquee',      label: 'Infinite Marquee',      icon: '📜', tags: ['Glassmorphism', 'Shimmer Borders', 'Hover Pause'],      color: 'from-yellow-500 to-orange-400', interactive: false },
  { id: 'neon',         label: 'Neon Sign Text',        icon: '💡', tags: ['CSS Glow', 'Flicker', 'Letter Animation'],              color: 'from-pink-500 to-rose-500',     interactive: false },
  { id: 'magnetic',     label: 'Magnetic Button',       icon: '🧲', tags: ['Cursor Tracking', 'Ripple', 'Gradient Border'],         color: 'from-indigo-500 to-violet-500', interactive: false },
  { id: 'gradient',     label: 'Gradient Generator',    icon: '🎨', tags: ['Color Picker', 'Presets', 'Copy CSS', 'Custom Input'],  color: 'from-indigo-500 to-pink-500',   interactive: true },
  { id: 'wave',         label: 'Wave Visualizer',       icon: '🌊', tags: ['Canvas', 'Sine/Triangle/Square', 'Controls', 'Layers'], color: 'from-cyan-500 to-blue-500',     interactive: true },
  { id: 'glitch',       label: 'Glitch Text Effect',    icon: '📺', tags: ['Canvas', 'Custom Text', 'RGB Split', 'VHS Scanline'],   color: 'from-red-500 to-pink-500',      interactive: true },
  { id: 'particles',    label: 'Particle Playground',   icon: '✨', tags: ['Canvas', 'Attract/Repel', 'Gravity Wells', 'Palettes'], color: 'from-cyan-400 to-green-400',    interactive: true },
  { id: 'textanim',     label: 'Text Animator',         icon: '🔤', tags: ['8 Effects', 'Custom Text', 'Colors', 'Speed Control'],  color: 'from-purple-400 to-cyan-400',   interactive: true },
  { id: 'shadow',       label: 'Shadow Generator',      icon: '🖼', tags: ['Multi-Layer', 'Presets', 'Copy CSS', 'Neumorphism'],    color: 'from-gray-400 to-blue-500',     interactive: true },
]

const DEMO_COMPONENTS = {
  holographic: HolographicCard,
  aurora: AuroraEffect,
  morphing: MorphingBlob,
  cube: Cube3D,
  marquee: InfiniteMarquee,
  neon: NeonText,
  magnetic: MagneticButton,
  gradient: GradientGenerator,
  wave: WaveGenerator,
  glitch: GlitchText,
  particles: ParticlePlayground,
  textanim: TextAnimator,
  shadow: ShadowGenerator,
}

/* ── Fade-in animation ── */
function FadeIn({ children, delay = 0, className = '' }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay * 1000)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(30px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}
    >
      {children}
    </div>
  )
}

/* ── Loader ── */
const Loader = () => (
  <div className='flex items-center justify-center py-24'>
    <div className='flex flex-col items-center gap-3'>
      <div className='w-10 h-10 border-2 border-pink-500 border-t-transparent rounded-full animate-spin' />
      <span className='text-gray-500 text-sm'>Loading demo...</span>
    </div>
  </div>
)

const Tag = ({ children }) => (
  <span className='px-2 py-0.5 bg-gray-800 text-pink-400 text-xs rounded font-mono'>{children}</span>
)

const Card = ({ title, tags = [], children }) => (
  <div className='bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 hover:border-gray-700 transition-colors'>
    <div className='flex flex-wrap items-center gap-2 px-5 py-3 bg-gray-800/60 border-b border-gray-700/60'>
      <span className='text-white font-semibold text-sm'>{title}</span>
      <div className='flex gap-1.5 flex-wrap ml-1'>
        {tags.map(t => <Tag key={t}>{t}</Tag>)}
      </div>
    </div>
    <div className='p-4'>
      <Suspense fallback={<Loader />}>{children}</Suspense>
    </div>
  </div>
)

/* ── Main Creative page ── */
const Creative = () => {
  const [active, setActive] = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'interactive' | 'visual'
  const contentRef = useRef()

  const handleClick = (id) => {
    setActive(prev => prev === id ? null : id)
    setTimeout(() => {
      contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const filteredDemos = filter === 'all'
    ? DEMOS
    : filter === 'interactive'
      ? DEMOS.filter(d => d.interactive)
      : DEMOS.filter(d => !d.interactive)

  const activeDemo = DEMOS.find(d => d.id === active)
  const ActiveComponent = active ? DEMO_COMPONENTS[active] : null

  return (
    <div className='min-h-screen bg-gray-950 text-white'>
      {/* Subtle dot grid bg */}
      <div className='fixed inset-0 pointer-events-none opacity-[0.03]'
        style={{ backgroundImage: 'radial-gradient(circle, #ec4899 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      {/* ── Hero ── */}
      <div className='relative max-w-6xl mx-auto px-6 pt-32 pb-6'>
        <FadeIn>
          <h1 className='font-poppins font-black text-5xl md:text-6xl bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent leading-tight'>
            Creative UI Showcase
          </h1>
        </FadeIn>
        <FadeIn delay={0.1}>
          <p className='text-gray-400 mt-3 text-base max-w-2xl'>
            13 interactive experiments — holographic effects, particle physics, gradient builders, text animators, wave generators & more. All pure CSS & React, zero external libs.
          </p>
        </FadeIn>

        {/* Stats */}
        <FadeIn delay={0.2}>
          <div className='flex flex-wrap gap-8 mt-6'>
            {[
              ['13', 'Experiments', 'text-purple-400'],
              ['6', 'Interactive Tools', 'text-cyan-400'],
              ['7', 'Visual Effects', 'text-pink-400'],
              ['100%', 'Browser-Native', 'text-yellow-400'],
            ].map(([n, l, c]) => (
              <div key={l} className='text-center'>
                <div className={`text-3xl font-black ${c}`}>{n}</div>
                <div className='text-xs text-gray-500 mt-0.5'>{l}</div>
              </div>
            ))}
          </div>
        </FadeIn>

        {/* Filter tabs */}
        <FadeIn delay={0.25}>
          <div className='flex gap-2 mt-6'>
            {[
              { key: 'all', label: 'All (13)' },
              { key: 'interactive', label: 'Interactive Tools (6)' },
              { key: 'visual', label: 'Visual Effects (7)' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  filter === f.key
                    ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/20'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </FadeIn>
      </div>

      {/* ── Demo selector grid ── */}
      <div className='relative max-w-6xl mx-auto px-6 pb-6'>
        <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3'>
          {filteredDemos.map((d, i) => {
            const isActive = active === d.id
            return (
              <FadeIn key={d.id} delay={0.25 + i * 0.04}>
                <button
                  onClick={() => handleClick(d.id)}
                  className={`relative group text-left rounded-xl border p-4 transition-all duration-300 overflow-hidden w-full ${
                    isActive
                      ? 'border-pink-500/60 bg-gray-900 shadow-lg shadow-pink-900/20 scale-[1.02]'
                      : 'border-gray-800 bg-gray-900/60 hover:border-gray-700 hover:bg-gray-900 hover:scale-[1.01]'
                  }`}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${d.color}`} />
                  )}

                  <div className='flex items-center gap-2.5 mb-2'>
                    <span className='text-2xl'>{d.icon}</span>
                    <span className='text-white font-bold text-sm'>{d.label}</span>
                  </div>
                  <div className='flex flex-wrap gap-1 mb-3'>
                    {d.tags.slice(0, 2).map(t => (
                      <span key={t} className='text-[10px] text-gray-500 bg-gray-800/80 px-1.5 py-0.5 rounded'>{t}</span>
                    ))}
                    {d.interactive && (
                      <span className='text-[10px] text-cyan-400 bg-cyan-950/50 px-1.5 py-0.5 rounded border border-cyan-800/30'>Input</span>
                    )}
                  </div>
                  <div className='flex items-center justify-end'>
                    <span className={`text-xs font-semibold transition-colors ${
                      isActive ? 'text-pink-400' : 'text-gray-600 group-hover:text-gray-400'
                    }`}>
                      {isActive ? '▼ Close' : '→ Open'}
                    </span>
                  </div>
                </button>
              </FadeIn>
            )
          })}
        </div>
      </div>

      {/* ── Active demo content ── */}
      {active && ActiveComponent && (
        <div ref={contentRef} className='relative max-w-6xl mx-auto px-6 pb-24'>
          {/* Section header */}
          <div className='pt-8 pb-6'>
            <div className='flex items-center gap-3 mb-1'>
              <span className='text-3xl'>{activeDemo.icon}</span>
              <h2 className='font-poppins font-black text-3xl bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent'>
                {activeDemo.label}
              </h2>
              {activeDemo.interactive && (
                <span className='text-xs text-cyan-400 bg-cyan-950/50 px-2 py-1 rounded-lg border border-cyan-800/30 font-semibold'>
                  Interactive
                </span>
              )}
              <button
                onClick={() => setActive(null)}
                className='ml-auto px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg text-sm font-semibold transition-colors'
              >
                ✕ Close
              </button>
            </div>
            <div className='mt-4 h-px bg-gradient-to-r from-pink-900/60 to-transparent' />
          </div>

          {/* Render the active demo */}
          <FadeIn>
            <Card title={activeDemo.label} tags={activeDemo.tags}>
              <ActiveComponent />
            </Card>
          </FadeIn>
        </div>
      )}

      {/* Empty state */}
      {!active && (
        <div className='max-w-6xl mx-auto px-6 pb-24'>
          <div className='text-center py-20'>
            <p className='text-gray-600 text-lg'>Pick a component above to preview it</p>
            <p className='text-gray-700 text-sm mt-2'>Nothing is loaded until you click — zero wasted bandwidth</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Creative
