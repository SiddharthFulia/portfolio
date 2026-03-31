import { useRef, useState, useEffect, lazy, Suspense } from 'react'

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

const SECTIONS = [
  { id: 'worlds',     label: '3D Worlds',      icon: '🪐' },
  { id: 'algorithms', label: 'Algorithms',      icon: '⚡' },
  { id: 'ai',         label: 'AI & Games',      icon: '🤖' },
  { id: 'math',       label: 'Mathematics',     icon: '🎨' },
  { id: 'data',       label: 'Data & SQL',      icon: '🗄' },
  { id: 'code',       label: 'Code',            icon: '💻' },
]

/* ── Scroll-triggered fade-in ── */
function FadeIn({ children, delay = 0, className = '' }) {
  const ref = useRef()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.05 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(40px)',
        transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  )
}

/* ── Lazy loader fallback ── */
const Loader = () => (
  <div className='flex items-center justify-center py-20'>
    <div className='w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin' />
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

const SectionHeader = ({ icon, title, subtitle }) => (
  <div className='pt-20 pb-6'>
    <div className='flex items-center gap-3 mb-1'>
      <span className='text-3xl'>{icon}</span>
      <h2 className='font-poppins font-black text-3xl bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent'>
        {title}
      </h2>
    </div>
    <p className='text-gray-500 text-sm ml-12'>{subtitle}</p>
    <div className='mt-4 h-px bg-gradient-to-r from-cyan-900/60 to-transparent' />
  </div>
)

const Lab = () => {
  const refs = Object.fromEntries(SECTIONS.map(s => [s.id, useRef()]))
  const [activeNav, setActiveNav] = useState(null)

  /* Track which section is in view for nav highlight */
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) setActiveNav(e.target.dataset.section)
        })
      },
      { threshold: 0.15 }
    )
    Object.entries(refs).forEach(([id, ref]) => {
      if (ref.current) {
        ref.current.dataset.section = id
        obs.observe(ref.current)
      }
    })
    return () => obs.disconnect()
  }, [])

  const scrollTo = id => {
    refs[id].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className='min-h-screen bg-gray-950 text-white'>
      {/* Subtle dot grid bg */}
      <div className='fixed inset-0 pointer-events-none opacity-[0.03]'
        style={{ backgroundImage: 'radial-gradient(circle, #22d3ee 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      {/* ── Hero ── */}
      <div className='relative max-w-6xl mx-auto px-6 pt-32 pb-4'>
        <FadeIn>
          <h1 className='font-poppins font-black text-5xl md:text-6xl bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent leading-tight'>
            Interactive Lab
          </h1>
          <p className='text-gray-400 mt-3 text-base max-w-xl'>
            17 live demos — 3D simulations, classic algorithms, AI game theory, fractal math, SQL queries & a JS playground. All running 100% in the browser.
          </p>
        </FadeIn>

        {/* Stats row */}
        <FadeIn delay={0.1}>
          <div className='flex flex-wrap gap-8 mt-6'>
            {[['17', 'Interactive Demos', 'text-cyan-400'],['3', '3D Simulations', 'text-blue-400'],['8', 'Algorithm Visualizers', 'text-purple-400'],['2', 'Code Environments', 'text-pink-400']].map(([n, l, c]) => (
              <div key={l} className='text-center'>
                <div className={`text-3xl font-black ${c}`}>{n}</div>
                <div className='text-xs text-gray-500 mt-0.5'>{l}</div>
              </div>
            ))}
          </div>
        </FadeIn>

        {/* Section nav — sticky */}
        <FadeIn delay={0.2}>
          <div className='flex flex-wrap gap-2 mt-8'>
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => scrollTo(s.id)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  activeNav === s.id
                    ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/30'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white'
                }`}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </FadeIn>
      </div>

      <div className='relative max-w-6xl mx-auto px-6 pb-24'>

        {/* ── 3D Worlds ── */}
        <div ref={refs.worlds}>
          <FadeIn>
            <SectionHeader icon='🪐' title='3D Worlds'
              subtitle='Three.js & Canvas simulations — drag, interact, explore' />
          </FadeIn>
          <div className='flex flex-col gap-6'>
            <FadeIn>
              <Card title='Solar System' tags={['Three.js', '3D', 'Orbital Mechanics']}>
                <SolarSystem3D />
              </Card>
            </FadeIn>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
              <FadeIn delay={0.05}>
                <Card title='Warp Drive' tags={['Canvas', 'Starfield', 'Blue-shift']}>
                  <WarpSpeed />
                </Card>
              </FadeIn>
              <FadeIn delay={0.1}>
                <Card title='Neural Particles' tags={['Canvas', 'Mouse Repulsion']}>
                  <ParticleCanvas />
                </Card>
              </FadeIn>
            </div>
          </div>
        </div>

        {/* ── Algorithms ── */}
        <div ref={refs.algorithms}>
          <FadeIn>
            <SectionHeader icon='⚡' title='Algorithms'
              subtitle='Watch algorithms execute step-by-step in real time' />
          </FadeIn>
          <div className='flex flex-col gap-6'>
            <FadeIn>
              <Card title='Sorting Algorithms' tags={['Bubble', 'Quick', 'Merge', 'O(n²) vs O(n log n)']}>
                <SortingVisualizer />
              </Card>
            </FadeIn>
            <FadeIn>
              <Card title='Pathfinding Visualizer' tags={['A*', 'BFS', 'DFS', 'Draw walls']}>
                <PathfindingVisualizer />
              </Card>
            </FadeIn>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
              <FadeIn delay={0.05}>
                <Card title='Binary Search Tree' tags={['Insert', 'Search', 'Traversal', 'SVG']}>
                  <BSTVisualizer />
                </Card>
              </FadeIn>
              <FadeIn delay={0.1}>
                <Card title='Graph Traversal' tags={['BFS', 'DFS', 'Queue', 'Stack']}>
                  <GraphTraversal />
                </Card>
              </FadeIn>
            </div>
            <FadeIn>
              <Card title='Red-Black Tree' tags={['Self-Balancing', 'Rotations', 'O(log n)']}>
                <RedBlackTree />
              </Card>
            </FadeIn>
            <FadeIn>
              <Card title='Heap & Priority Queue' tags={['Min Heap', 'Max Heap', 'Sift-up/down']}>
                <HeapVisualizer />
              </Card>
            </FadeIn>
            <FadeIn>
              <Card title='Dynamic Programming' tags={['Memoization', 'Tabulation', 'LCS', 'Knapsack']}>
                <DPVisualizer />
              </Card>
            </FadeIn>
          </div>
        </div>

        {/* ── AI & Games ── */}
        <div ref={refs.ai}>
          <FadeIn>
            <SectionHeader icon='🤖' title='AI & Game Theory'
              subtitle='Minimax, alpha-beta pruning, and unbeatable game AI' />
          </FadeIn>
          <FadeIn>
            <Card title='Minimax Tic-Tac-Toe' tags={['Minimax', 'Alpha-Beta Pruning', 'Game Theory', 'Unbeatable AI']}>
              <TicTacToe />
            </Card>
          </FadeIn>
        </div>

        {/* ── Mathematics ── */}
        <div ref={refs.math}>
          <FadeIn>
            <SectionHeader icon='🎨' title='Mathematical Beauty'
              subtitle='Cellular automata, fractals, N-body physics, and emergent complexity' />
          </FadeIn>
          <div className='flex flex-col gap-6'>
            <FadeIn>
              <Card title="Conway's Game of Life" tags={['Cellular Automaton', 'Emergence', 'Canvas']}>
                <GameOfLife />
              </Card>
            </FadeIn>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
              <FadeIn delay={0.05}>
                <Card title='Mandelbrot Fractal' tags={['Infinite Zoom', 'Complex Plane', 'Canvas']}>
                  <FractalExplorer />
                </Card>
              </FadeIn>
              <FadeIn delay={0.1}>
                <Card title='N-Body Gravity Simulator' tags={['F=Gm₁m₂/r²', 'Physics', 'Field Lines']}>
                  <GravitySimulator />
                </Card>
              </FadeIn>
            </div>
            <FadeIn>
              <Card title='Matrix Rain' tags={['Katakana', 'Canvas', 'The Matrix']}>
                <MatrixRain />
              </Card>
            </FadeIn>
          </div>
        </div>

        {/* ── Data & SQL ── */}
        <div ref={refs.data}>
          <FadeIn>
            <SectionHeader icon='🗄' title='Data & Queries'
              subtitle='Run real SQL queries against an in-browser database — no server needed' />
          </FadeIn>
          <FadeIn>
            <Card title='SQL Playground' tags={['SELECT', 'JOIN', 'GROUP BY', 'In-browser Engine']}>
              <SQLPlayground />
            </Card>
          </FadeIn>
        </div>

        {/* ── Code Playground ── */}
        <div ref={refs.code}>
          <FadeIn>
            <SectionHeader icon='💻' title='Code Playground'
              subtitle='Write and run JavaScript directly in the browser with live output' />
          </FadeIn>
          <FadeIn>
            <Card title='JavaScript REPL' tags={['Run Code', 'console.log', 'Sandboxed', 'Examples']}>
              <CodeRunner />
            </Card>
          </FadeIn>
        </div>

      </div>
    </div>
  )
}

export default Lab
