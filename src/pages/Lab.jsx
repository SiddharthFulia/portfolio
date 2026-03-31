import { useState, useRef, useEffect, lazy, Suspense } from 'react'

/* ── Lazy imports — nothing loads until the section is clicked ── */
const SolarSystem3D = lazy(() => import('../components/lab/SolarSystem3D'))
const GravitySimulator = lazy(() => import('../components/lab/GravitySimulator'))
const WarpSpeed = lazy(() => import('../components/lab/WarpSpeed'))
const ParticleCanvas = lazy(() => import('../components/lab/ParticleCanvas'))
const SortingVisualizer = lazy(() => import('../components/lab/SortingVisualizer'))
const PathfindingVisualizer = lazy(() => import('../components/lab/PathfindingVisualizer'))
const BSTVisualizer = lazy(() => import('../components/lab/BSTVisualizer'))
const GraphTraversal = lazy(() => import('../components/lab/GraphTraversal'))
const RedBlackTree = lazy(() => import('../components/lab/RedBlackTree'))
const HeapVisualizer = lazy(() => import('../components/lab/HeapVisualizer'))
const DPVisualizer = lazy(() => import('../components/lab/DPVisualizer'))
const TicTacToe = lazy(() => import('../components/lab/TicTacToe'))
const GameOfLife = lazy(() => import('../components/lab/GameOfLife'))
const FractalExplorer = lazy(() => import('../components/lab/FractalExplorer'))
const MatrixRain = lazy(() => import('../components/lab/MatrixRain'))
const SQLPlayground = lazy(() => import('../components/lab/SQLPlayground'))
const CodeRunner = lazy(() => import('../components/lab/CodeRunner'))
const NeonText = lazy(() => import('../components/lab/NeonText'))
const MagneticButton = lazy(() => import('../components/lab/MagneticButton'))
const HolographicCard = lazy(() => import('../components/lab/HolographicCard'))
const AuroraEffect = lazy(() => import('../components/lab/AuroraEffect'))
const MorphingBlob = lazy(() => import('../components/lab/MorphingBlob'))
const Cube3D = lazy(() => import('../components/lab/Cube3D'))
const InfiniteMarquee = lazy(() => import('../components/lab/InfiniteMarquee'))

/* ── Section definitions ── */
const SECTIONS = [
  { id: 'worlds',     label: '3D Worlds',      icon: '🪐', count: 3, color: 'from-blue-600 to-cyan-500',   desc: 'Three.js & Canvas simulations' },
  { id: 'algorithms', label: 'Algorithms',      icon: '⚡', count: 7, color: 'from-yellow-500 to-orange-500', desc: 'Step-by-step algorithm visualizers' },
  { id: 'ai',         label: 'AI & Games',      icon: '🤖', count: 1, color: 'from-green-500 to-emerald-500', desc: 'Minimax & game theory AI' },
  { id: 'math',       label: 'Mathematics',     icon: '🎨', count: 4, color: 'from-pink-500 to-rose-500',   desc: 'Fractals, automata & physics' },
  { id: 'data',       label: 'Data & SQL',      icon: '🗄',  count: 1, color: 'from-indigo-500 to-blue-500', desc: 'In-browser SQL playground' },
  { id: 'code',       label: 'Code',            icon: '💻', count: 1, color: 'from-gray-500 to-gray-600',   desc: 'JavaScript REPL' },
  { id: 'creative',   label: 'Creative UI',     icon: '✨', count: 7, color: 'from-purple-500 to-pink-500', desc: 'Stunning visual experiments' },
]

/* ── Fade-in animation ── */
function FadeIn({ children, delay = 0, className = '' }) {
  const ref = useRef()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay * 1000)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div
      ref={ref}
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
      <div className='w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin' />
      <span className='text-gray-500 text-sm'>Loading demo...</span>
    </div>
  </div>
)

const Tag = ({ children }) => (
  <span className='px-2 py-0.5 bg-gray-800 text-cyan-400 text-xs rounded font-mono'>{children}</span>
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

/* ── Section content renderers ── */
function WorldsSection() {
  return (
    <div className='flex flex-col gap-6'>
      <FadeIn>
        <Card title='Solar System' tags={['Three.js', '3D', 'Orbital Mechanics']}>
          <SolarSystem3D />
        </Card>
      </FadeIn>
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <FadeIn delay={0.1}>
          <Card title='Warp Drive' tags={['Canvas', 'Starfield', 'Blue-shift']}>
            <WarpSpeed />
          </Card>
        </FadeIn>
        <FadeIn delay={0.15}>
          <Card title='Neural Particles' tags={['Canvas', 'Mouse Repulsion']}>
            <ParticleCanvas />
          </Card>
        </FadeIn>
      </div>
    </div>
  )
}

function AlgorithmsSection() {
  return (
    <div className='flex flex-col gap-6'>
      <FadeIn>
        <Card title='Sorting Algorithms' tags={['Bubble', 'Quick', 'Merge', 'O(n²) vs O(n log n)']}>
          <SortingVisualizer />
        </Card>
      </FadeIn>
      <FadeIn delay={0.08}>
        <Card title='Pathfinding Visualizer' tags={['A*', 'BFS', 'DFS', 'Draw walls']}>
          <PathfindingVisualizer />
        </Card>
      </FadeIn>
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <FadeIn delay={0.12}>
          <Card title='Binary Search Tree' tags={['Insert', 'Search', 'Traversal', 'SVG']}>
            <BSTVisualizer />
          </Card>
        </FadeIn>
        <FadeIn delay={0.16}>
          <Card title='Graph Traversal' tags={['BFS', 'DFS', 'Queue', 'Stack']}>
            <GraphTraversal />
          </Card>
        </FadeIn>
      </div>
      <FadeIn delay={0.2}>
        <Card title='Red-Black Tree' tags={['Self-Balancing', 'Rotations', 'O(log n)']}>
          <RedBlackTree />
        </Card>
      </FadeIn>
      <FadeIn delay={0.24}>
        <Card title='Heap & Priority Queue' tags={['Min Heap', 'Max Heap', 'Sift-up/down']}>
          <HeapVisualizer />
        </Card>
      </FadeIn>
      <FadeIn delay={0.28}>
        <Card title='Dynamic Programming' tags={['Memoization', 'Tabulation', 'LCS', 'Knapsack']}>
          <DPVisualizer />
        </Card>
      </FadeIn>
    </div>
  )
}

function AISection() {
  return (
    <FadeIn>
      <Card title='Minimax Tic-Tac-Toe' tags={['Minimax', 'Alpha-Beta Pruning', 'Game Theory', 'Unbeatable AI']}>
        <TicTacToe />
      </Card>
    </FadeIn>
  )
}

function MathSection() {
  return (
    <div className='flex flex-col gap-6'>
      <FadeIn>
        <Card title="Conway's Game of Life" tags={['Cellular Automaton', 'Emergence', 'Canvas']}>
          <GameOfLife />
        </Card>
      </FadeIn>
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <FadeIn delay={0.08}>
          <Card title='Mandelbrot Fractal' tags={['Infinite Zoom', 'Complex Plane', 'Canvas']}>
            <FractalExplorer />
          </Card>
        </FadeIn>
        <FadeIn delay={0.12}>
          <Card title='N-Body Gravity Simulator' tags={['F=Gm₁m₂/r²', 'Physics', 'Field Lines']}>
            <GravitySimulator />
          </Card>
        </FadeIn>
      </div>
      <FadeIn delay={0.16}>
        <Card title='Matrix Rain' tags={['Katakana', 'Canvas', 'The Matrix']}>
          <MatrixRain />
        </Card>
      </FadeIn>
    </div>
  )
}

function DataSection() {
  return (
    <FadeIn>
      <Card title='SQL Playground' tags={['SELECT', 'JOIN', 'GROUP BY', 'In-browser Engine']}>
        <SQLPlayground />
      </Card>
    </FadeIn>
  )
}

function CodeSection() {
  return (
    <FadeIn>
      <Card title='JavaScript REPL' tags={['Run Code', 'console.log', 'Sandboxed', 'Examples']}>
        <CodeRunner />
      </Card>
    </FadeIn>
  )
}

function CreativeSection() {
  return (
    <div className='flex flex-col gap-6'>
      <FadeIn>
        <Card title='Holographic Developer Card' tags={['3D Tilt', 'Rainbow Overlay', 'Mouse Tracking']}>
          <HolographicCard />
        </Card>
      </FadeIn>
      <FadeIn delay={0.08}>
        <Card title='Aurora Borealis' tags={['CSS Animation', 'Starfield', 'Blend Modes', 'Pure CSS']}>
          <AuroraEffect />
        </Card>
      </FadeIn>
      <FadeIn delay={0.12}>
        <Card title='Infinite Tech Marquee' tags={['Glassmorphism', 'Shimmer Borders', 'Hover Pause']}>
          <InfiniteMarquee />
        </Card>
      </FadeIn>
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <FadeIn delay={0.16}>
          <Card title='Morphing Gradient Blob' tags={['Border-Radius', 'Frosted Glass', 'Mouse Reactive']}>
            <MorphingBlob />
          </Card>
        </FadeIn>
        <FadeIn delay={0.2}>
          <Card title='3D Tech Cube' tags={['CSS 3D', 'Drag Rotate', 'preserve-3d', 'Touch']}>
            <Cube3D />
          </Card>
        </FadeIn>
      </div>
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <FadeIn delay={0.24}>
          <Card title='Neon Sign Text' tags={['CSS Glow', 'Flicker', 'Letter Animation']}>
            <NeonText />
          </Card>
        </FadeIn>
        <FadeIn delay={0.28}>
          <Card title='Magnetic Button' tags={['Cursor Tracking', 'Ripple', 'Gradient Border']}>
            <MagneticButton />
          </Card>
        </FadeIn>
      </div>
    </div>
  )
}

const SECTION_CONTENT = {
  worlds: WorldsSection,
  algorithms: AlgorithmsSection,
  ai: AISection,
  math: MathSection,
  data: DataSection,
  code: CodeSection,
  creative: CreativeSection,
}

/* ── Main Lab page ── */
const Lab = () => {
  const [active, setActive] = useState(null)
  const contentRef = useRef()

  const handleClick = (id) => {
    setActive(prev => prev === id ? null : id)
    // scroll to content after a tiny delay for render
    setTimeout(() => {
      contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const activeSection = SECTIONS.find(s => s.id === active)
  const ActiveContent = active ? SECTION_CONTENT[active] : null

  return (
    <div className='min-h-screen bg-gray-950 text-white'>
      {/* Subtle dot grid bg */}
      <div className='fixed inset-0 pointer-events-none opacity-[0.03]'
        style={{ backgroundImage: 'radial-gradient(circle, #22d3ee 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      {/* ── Hero ── */}
      <div className='relative max-w-6xl mx-auto px-6 pt-32 pb-6'>
        <h1 className='font-poppins font-black text-5xl md:text-6xl bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent leading-tight'>
          Interactive Lab
        </h1>
        <p className='text-gray-400 mt-3 text-base max-w-xl'>
          24 live demos — pick a category below to load it. 3D worlds, algorithms, AI, fractals, SQL, and creative UI experiments. All 100% in the browser.
        </p>

        {/* Stats */}
        <div className='flex flex-wrap gap-8 mt-6'>
          {[['24', 'Demos', 'text-cyan-400'], ['7', 'Categories', 'text-blue-400'], ['7', 'Creative UI', 'text-purple-400'], ['3', '3D Worlds', 'text-pink-400']].map(([n, l, c]) => (
            <div key={l} className='text-center'>
              <div className={`text-3xl font-black ${c}`}>{n}</div>
              <div className='text-xs text-gray-500 mt-0.5'>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section selector grid ── */}
      <div className='relative max-w-6xl mx-auto px-6 pb-6'>
        <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3'>
          {SECTIONS.map((s, i) => {
            const isActive = active === s.id
            return (
              <button
                key={s.id}
                onClick={() => handleClick(s.id)}
                className={`relative group text-left rounded-xl border p-4 transition-all duration-300 overflow-hidden ${
                  isActive
                    ? 'border-cyan-500/60 bg-gray-900 shadow-lg shadow-cyan-900/20 scale-[1.02]'
                    : 'border-gray-800 bg-gray-900/60 hover:border-gray-700 hover:bg-gray-900 hover:scale-[1.01]'
                }`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${s.color}`} />
                )}

                <div className='flex items-center gap-2.5 mb-2'>
                  <span className='text-2xl'>{s.icon}</span>
                  <span className='text-white font-bold text-sm'>{s.label}</span>
                </div>
                <p className='text-gray-500 text-xs leading-relaxed'>{s.desc}</p>
                <div className='flex items-center justify-between mt-3'>
                  <span className='text-xs text-gray-600'>{s.count} demo{s.count > 1 ? 's' : ''}</span>
                  <span className={`text-xs font-semibold transition-colors ${
                    isActive ? 'text-cyan-400' : 'text-gray-600 group-hover:text-gray-400'
                  }`}>
                    {isActive ? '▼ Close' : '→ Open'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Active section content ── */}
      {active && ActiveContent && (
        <div ref={contentRef} className='relative max-w-6xl mx-auto px-6 pb-24'>
          {/* Section header */}
          <div className='pt-8 pb-6'>
            <div className='flex items-center gap-3 mb-1'>
              <span className='text-3xl'>{activeSection.icon}</span>
              <h2 className='font-poppins font-black text-3xl bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent'>
                {activeSection.label}
              </h2>
              <button
                onClick={() => setActive(null)}
                className='ml-auto px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg text-sm font-semibold transition-colors'
              >
                ✕ Close Section
              </button>
            </div>
            <p className='text-gray-500 text-sm ml-12'>{activeSection.desc}</p>
            <div className='mt-4 h-px bg-gradient-to-r from-cyan-900/60 to-transparent' />
          </div>

          {/* Render only the active section */}
          <ActiveContent />
        </div>
      )}

      {/* Empty state */}
      {!active && (
        <div className='max-w-6xl mx-auto px-6 pb-24'>
          <div className='text-center py-20'>
            <p className='text-gray-600 text-lg'>Pick a category above to load demos</p>
            <p className='text-gray-700 text-sm mt-2'>Nothing is loaded until you click — zero wasted bandwidth</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Lab
