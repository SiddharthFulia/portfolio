import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import AnimatedCard from '../components/explore/AnimatedCard'
import ShaderLines from '../components/luxe/ShaderLines'

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
  { id: 'holographic',  label: 'Holographic Card',     tags: ['3D Tilt', 'Rainbow Overlay', 'Mouse Tracking'],         color: 'bg-cyan-500',  interactive: false },
  { id: 'aurora',       label: 'Aurora Borealis',       tags: ['CSS Animation', 'Starfield', 'Blend Modes', 'Pure CSS'], color: 'bg-emerald-500', interactive: false },
  { id: 'morphing',     label: 'Morphing Blob',         tags: ['Border-Radius', 'Frosted Glass', 'Mouse Reactive'],     color: 'bg-amber-500', interactive: false },
  { id: 'cube',         label: '3D Tech Cube',          tags: ['CSS 3D', 'Drag Rotate', 'preserve-3d', 'Touch'],        color: 'bg-rose-500',  interactive: false },
  { id: 'marquee',      label: 'Infinite Marquee',      tags: ['Glassmorphism', 'Shimmer Borders', 'Hover Pause'],      color: 'bg-amber-500', interactive: false },
  { id: 'neon',         label: 'Neon Sign Text',        tags: ['CSS Glow', 'Flicker', 'Letter Animation'],              color: 'bg-rose-500',  interactive: false },
  { id: 'magnetic',     label: 'Magnetic Button',       tags: ['Cursor Tracking', 'Ripple', 'Gradient Border'],         color: 'bg-amber-500', interactive: false },
  { id: 'gradient',     label: 'Gradient Generator',    tags: ['Color Picker', 'Presets', 'Copy CSS', 'Custom Input'],  color: 'bg-cyan-500',  interactive: true },
  { id: 'wave',         label: 'Wave Visualizer',       tags: ['Canvas', 'Sine/Triangle/Square', 'Controls', 'Layers'], color: 'bg-cyan-500',  interactive: true },
  { id: 'glitch',       label: 'Glitch Text Effect',    tags: ['Canvas', 'Custom Text', 'RGB Split', 'VHS Scanline'],   color: 'bg-rose-500',  interactive: true },
  { id: 'particles',    label: 'Particle Playground',   tags: ['Canvas', 'Attract/Repel', 'Gravity Wells', 'Palettes'], color: 'bg-cyan-500',  interactive: true },
  { id: 'textanim',     label: 'Text Animator',         tags: ['8 Effects', 'Custom Text', 'Colors', 'Speed Control'],  color: 'bg-cyan-500',  interactive: true },
  { id: 'shadow',       label: 'Shadow Generator',      tags: ['Multi-Layer', 'Presets', 'Copy CSS', 'Neumorphism'],    color: 'bg-cyan-500',  interactive: true },
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
      <div className='relative max-w-6xl mx-auto px-6 pt-32 pb-6 overflow-hidden'>
        {/* Ambient orbs behind hero */}
        <div aria-hidden className='ambient-orb -top-40 -left-32 opacity-70' />
        <div aria-hidden className='ambient-orb ambient-orb-cool -top-24 right-0 opacity-50' />

        <FadeIn>
          <div className='eyebrow-mono mb-3'>// 13 browser-native experiments</div>
          <h1 className='font-poppins font-black text-5xl md:text-6xl gradient-text-amber leading-tight'>
            Creative UI Showcase
          </h1>
        </FadeIn>
        <FadeIn delay={0.1}>
          <p className='text-gray-400 mt-3 text-base max-w-2xl'>
            13 interactive experiments — holographic effects, particle physics, gradient builders, text animators, wave generators &amp; more. All pure CSS &amp; React, zero external libs.
          </p>
        </FadeIn>

        {/* Stats */}
        <FadeIn delay={0.2}>
          <div className='flex flex-wrap gap-3 mt-6'>
            {[
              ['13', 'Experiments', 'text-purple-400'],
              ['6', 'Interactive Tools', 'text-cyan-400'],
              ['7', 'Visual Effects', 'text-pink-400'],
              ['100%', 'Browser-Native', 'text-yellow-400'],
            ].map(([n, l, c]) => (
              <div key={l} className='luxe-glass luxe-card-hover text-center px-5 py-3'>
                <div className={`text-3xl font-black tabular-nums ${c}`}>{n}</div>
                <div className='text-xs text-gray-500 mt-0.5'>{l}</div>
              </div>
            ))}
          </div>
        </FadeIn>

        {/* Animated shader divider */}
        <FadeIn delay={0.22}>
          <div className='relative mt-8 h-24 w-full rounded-xl overflow-hidden border border-pink-900/40 opacity-80'>
            <ShaderLines className='absolute inset-0 w-full h-full' />
            <div className='absolute inset-0 bg-gradient-to-r from-gray-950 via-transparent to-gray-950 pointer-events-none' />
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
                className={`luxe-btn ${
                  filter === f.key
                    ? 'luxe-btn-secondary'
                    : 'luxe-btn-ghost'
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
        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3'>
          {filteredDemos.map((d, i) => {
            const isActive = active === d.id
            const effectMap = { holographic:'ice', aurora:'grass', morphing:'psychic', cube:'fire', marquee:'electric', neon:'fire', magnetic:'dragon', gradient:'psychic', wave:'water', glitch:'dark', particles:'electric', textanim:'psychic', shadow:'ghost' }
            return (
              <FadeIn key={d.id} delay={0.25 + i * 0.04}>
                <AnimatedCard effect={effectMap[d.id] || 'default'} onClick={() => handleClick(d.id)} className="h-full w-full">
                  <div className="luxe-card-hover relative group text-left p-4 transition-all duration-300 w-full">
                  {/* Active indicator bar */}
                  {isActive && (
                    <div className={`absolute inset-x-0 top-0 h-1 ${d.color}`} />
                  )}

                  <div className='flex items-center gap-2.5 mb-2'>
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
                      isActive ? 'text-amber-400' : 'text-gray-600 group-hover:text-gray-400'
                    }`}>
                      {isActive ? 'Close' : 'Open'}
                    </span>
                  </div>
                  </div>
                </AnimatedCard>
              </FadeIn>
            )
          })}
        </div>

        {filteredDemos.length === 0 && (
          <div className="text-center py-16 luxe-glass mt-6 p-8">
            <p className="text-gray-300 font-semibold mb-1">Nothing matches that filter yet</p>
            <p className="text-gray-500 text-sm mb-4">Try a different category.</p>
            <button
              onClick={() => setFilter('all')}
              className="luxe-btn luxe-btn-secondary tap-44"
            >
              Show all 13
            </button>
          </div>
        )}
      </div>

      {/* ── Active demo content ── */}
      {active && ActiveComponent && (
        <div ref={contentRef} className='relative max-w-6xl mx-auto px-6 pb-24'>
          {/* Section header */}
          <div className='pt-8 pb-6'>
            <div className='flex items-center gap-3 mb-1'>
              <h2 className='font-poppins font-black text-3xl text-amber-300'>
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
                Close
              </button>
            </div>
            <div className='mt-4 h-px bg-amber-900/40' />
          </div>

          {/* Render the active demo */}
          <FadeIn>
            <Card title={activeDemo.label} tags={activeDemo.tags}>
              <ActiveComponent />
            </Card>
          </FadeIn>
        </div>
      )}

      {!active && <div className="pb-24" />}
    </div>
  )
}

export default Creative
