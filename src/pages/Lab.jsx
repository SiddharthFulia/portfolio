import { useState, useMemo, useRef, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import AnimatedCard from '../components/explore/AnimatedCard'
import ShaderAnimation from '../components/luxe/ShaderAnimation'

/* ─────────────────────────────────────────────────────────────────
 * Merged Lab page — was two pages (/lab + /creative). Now one home
 * for every browser-native demo across motion, effects, physics,
 * algorithms, games and data. 30 demos across 6 categories, all
 * lazy-loaded on click so the initial payload stays tiny.
 * ─────────────────────────────────────────────────────────────── */

/* ── Lazy imports — nothing loads until the demo is clicked ── */
// Former /lab (17)
const SolarSystem3D          = lazy(() => import('../components/lab/SolarSystem3D'))
const GravitySimulator       = lazy(() => import('../components/lab/GravitySimulator'))
const WarpSpeed              = lazy(() => import('../components/lab/WarpSpeed'))
const ParticleCanvas         = lazy(() => import('../components/lab/ParticleCanvas'))
const SortingVisualizer      = lazy(() => import('../components/lab/SortingVisualizer'))
const PathfindingVisualizer  = lazy(() => import('../components/lab/PathfindingVisualizer'))
const BSTVisualizer          = lazy(() => import('../components/lab/BSTVisualizer'))
const GraphTraversal         = lazy(() => import('../components/lab/GraphTraversal'))
const RedBlackTree           = lazy(() => import('../components/lab/RedBlackTree'))
const HeapVisualizer         = lazy(() => import('../components/lab/HeapVisualizer'))
const DPVisualizer           = lazy(() => import('../components/lab/DPVisualizer'))
const TicTacToe              = lazy(() => import('../components/lab/TicTacToe'))
const GameOfLife             = lazy(() => import('../components/lab/GameOfLife'))
const FractalExplorer        = lazy(() => import('../components/lab/FractalExplorer'))
const MatrixRain             = lazy(() => import('../components/lab/MatrixRain'))
const SQLPlayground          = lazy(() => import('../components/lab/SQLPlayground'))
const CodeRunner             = lazy(() => import('../components/lab/CodeRunner'))
// Former /creative (13)
const HolographicCard        = lazy(() => import('../components/lab/HolographicCard'))
const AuroraEffect           = lazy(() => import('../components/lab/AuroraEffect'))
const MorphingBlob           = lazy(() => import('../components/lab/MorphingBlob'))
const Cube3D                 = lazy(() => import('../components/lab/Cube3D'))
const InfiniteMarquee        = lazy(() => import('../components/lab/InfiniteMarquee'))
const NeonText               = lazy(() => import('../components/lab/NeonText'))
const MagneticButton         = lazy(() => import('../components/lab/MagneticButton'))
const GradientGenerator      = lazy(() => import('../components/lab/GradientGenerator'))
const WaveGenerator          = lazy(() => import('../components/lab/WaveGenerator'))
const GlitchText             = lazy(() => import('../components/lab/GlitchText'))
const ParticlePlayground     = lazy(() => import('../components/lab/ParticlePlayground'))
const TextAnimator           = lazy(() => import('../components/lab/TextAnimator'))
const ShadowGenerator        = lazy(() => import('../components/lab/ShadowGenerator'))

/* ── Category taxonomy (6) ── */
const CATEGORIES = [
  { id: 'motion',       label: 'Motion',       desc: 'Animations, marquees, morph & wave',   color: 'from-cyan-500 to-blue-500',     chip: 'text-cyan-300',    dot: 'bg-cyan-400',    effect: 'water'    },
  { id: 'effects',      label: 'Effects',      desc: 'Particles, shaders, glow, distortion', color: 'from-fuchsia-500 to-rose-500',  chip: 'text-fuchsia-300', dot: 'bg-fuchsia-400', effect: 'psychic'  },
  { id: 'interactions', label: 'Interactions', desc: 'Hover, drag, magnetic, generators',    color: 'from-amber-500 to-orange-500',  chip: 'text-amber-300',   dot: 'bg-amber-400',   effect: 'electric' },
  { id: 'simulations',  label: 'Simulations',  desc: 'Physics, gravity, cellular automata',  color: 'from-rose-500 to-pink-500',     chip: 'text-rose-300',    dot: 'bg-rose-400',    effect: 'fire'     },
  { id: 'algorithms',   label: 'Algorithms',   desc: 'Sorting, pathfinding, trees, graphs',  color: 'from-emerald-500 to-teal-500',  chip: 'text-emerald-300', dot: 'bg-emerald-400', effect: 'grass'    },
  { id: 'games-data',   label: 'Games & Data', desc: 'Games, SQL, code sandboxes',           color: 'from-violet-500 to-indigo-500', chip: 'text-violet-300',  dot: 'bg-violet-400',  effect: 'dragon'   },
]

/* ── Demo registry ──
 * `preview` is a CSS gradient string used as the card thumbnail —
 * cheap, always renders, and keeps the grid legible on mobile. */
const DEMOS = [
  // Motion (6)
  { id: 'aurora',      cat: 'motion',       title: 'Aurora Borealis',       desc: 'Pure CSS aurora + starfield · blend-modes · zero JS.',           tags: ['CSS', 'Starfield', 'Blend'],           preview: 'linear-gradient(135deg,#0f766e,#4c1d95,#1e293b)',            Comp: AuroraEffect       },
  { id: 'morphing',    cat: 'motion',       title: 'Morphing Blob',         desc: 'Border-radius blob morphs to the mouse · frosted glass.',        tags: ['Border-radius', 'Glass', 'Mouse'],     preview: 'radial-gradient(circle at 30% 30%,#22d3ee,#ec4899,#7c3aed)', Comp: MorphingBlob       },
  { id: 'marquee',     cat: 'motion',       title: 'Infinite Marquee',      desc: 'Glassmorphic shimmering marquee · hover to pause.',              tags: ['Glass', 'Shimmer', 'Loop'],            preview: 'linear-gradient(90deg,#f59e0b,#ec4899,#22d3ee)',             Comp: InfiniteMarquee    },
  { id: 'textanim',    cat: 'motion',       title: 'Text Animator',         desc: '8 effects · type your own text · color + speed controls.',      tags: ['8 effects', 'Custom text', 'Speed'],   preview: 'linear-gradient(135deg,#f472b6,#818cf8,#22d3ee)',            Comp: TextAnimator       },
  { id: 'neon',        cat: 'motion',       title: 'Neon Sign Text',        desc: 'CSS glow · flicker · letter-by-letter reveal.',                  tags: ['CSS Glow', 'Flicker'],                 preview: 'radial-gradient(circle at 50% 50%,#f472b6,#0a0a0e)',         Comp: NeonText           },
  { id: 'wave',        cat: 'motion',       title: 'Wave Visualizer',       desc: 'Sine · triangle · square · layered wave engine on canvas.',      tags: ['Canvas', 'Sine/Tri/Sq', 'Layers'],     preview: 'linear-gradient(180deg,#0ea5e9,#22d3ee,#0f172a)',            Comp: WaveGenerator      },

  // Effects (7)
  { id: 'warp',        cat: 'effects',      title: 'Warp Drive',            desc: 'Starfield warp · blue-shift trails · pure canvas.',              tags: ['Canvas', 'Starfield', 'Blue-shift'],   preview: 'radial-gradient(ellipse at center,#0ea5e9,#0a0a0e 70%)',     Comp: WarpSpeed          },
  { id: 'neural',      cat: 'effects',      title: 'Neural Particles',      desc: 'Particles that repel the cursor · connective lines.',            tags: ['Canvas', 'Mouse repel'],               preview: 'radial-gradient(circle at 40% 60%,#22d3ee,#0a0a0e 70%)',     Comp: ParticleCanvas     },
  { id: 'particles',   cat: 'effects',      title: 'Particle Playground',   desc: 'Attract / repel · gravity wells · pick a palette.',              tags: ['Canvas', 'Gravity wells', 'Palettes'], preview: 'linear-gradient(135deg,#f97316,#ec4899,#7c3aed)',            Comp: ParticlePlayground },
  { id: 'glitch',      cat: 'effects',      title: 'Glitch Text',           desc: 'Type text · RGB split · VHS scanline · canvas glitch.',          tags: ['Canvas', 'RGB Split', 'VHS'],          preview: 'linear-gradient(135deg,#ef4444,#22d3ee,#0a0a0e)',            Comp: GlitchText         },
  { id: 'matrix',      cat: 'effects',      title: 'Matrix Rain',           desc: 'Katakana rain · canvas · that Matrix feeling.',                  tags: ['Katakana', 'Canvas'],                  preview: 'linear-gradient(180deg,#052e16,#16a34a,#0a0a0e)',            Comp: MatrixRain         },
  { id: 'fractal',     cat: 'effects',      title: 'Mandelbrot Fractal',    desc: 'Infinite zoom · complex-plane fractal · pan + zoom.',            tags: ['Infinite zoom', 'Complex plane'],      preview: 'radial-gradient(circle at 50% 50%,#f59e0b,#7c3aed,#0a0a0e)', Comp: FractalExplorer    },
  { id: 'holographic', cat: 'effects',      title: 'Holographic Card',      desc: '3D tilt · rainbow foil overlay · mouse tracked.',                tags: ['3D Tilt', 'Rainbow', 'Mouse'],         preview: 'linear-gradient(135deg,#22d3ee,#f472b6,#f59e0b)',            Comp: HolographicCard    },

  // Interactions (4)
  { id: 'magnetic',    cat: 'interactions', title: 'Magnetic Button',       desc: 'Cursor pulls the button · ripple · gradient border.',            tags: ['Cursor', 'Ripple', 'Gradient'],        preview: 'linear-gradient(135deg,#f59e0b,#f472b6,#7c3aed)',            Comp: MagneticButton     },
  { id: 'cube',        cat: 'interactions', title: '3D Tech Cube',          desc: 'CSS 3D cube · drag to rotate · touch friendly.',                 tags: ['CSS 3D', 'Drag', 'Touch'],             preview: 'linear-gradient(135deg,#f472b6,#22d3ee,#0a0a0e)',            Comp: Cube3D             },
  { id: 'gradient',    cat: 'interactions', title: 'Gradient Generator',    desc: 'Color-picker · presets · copy CSS · pick your palette.',         tags: ['Color', 'Presets', 'Copy CSS'],        preview: 'linear-gradient(135deg,#22d3ee,#7c3aed,#f472b6)',            Comp: GradientGenerator  },
  { id: 'shadow',      cat: 'interactions', title: 'Shadow Generator',      desc: 'Multi-layer shadow builder · presets · copy CSS · neumorphism.', tags: ['Multi-layer', 'Presets'],              preview: 'linear-gradient(180deg,#94a3b8,#0a0a0e)',                    Comp: ShadowGenerator    },

  // Simulations (3)
  { id: 'solar',       cat: 'simulations',  title: 'Solar System',          desc: 'Three.js · 8 planets on orbital mechanics · zoom & pan.',        tags: ['Three.js', 'Orbits'],                  preview: 'radial-gradient(circle at 50% 50%,#fde68a,#7c3aed,#0a0a0e)', Comp: SolarSystem3D      },
  { id: 'gameoflife',  cat: 'simulations',  title: "Conway's Game of Life", desc: 'Cellular automaton · click cells · watch emergence.',            tags: ['Cellular', 'Emergence', 'Canvas'],     preview: 'linear-gradient(135deg,#22c55e,#0f172a)',                    Comp: GameOfLife         },
  { id: 'gravity',     cat: 'simulations',  title: 'N-Body Gravity',        desc: 'F=Gm₁m₂/r² · drop planets · watch field lines.',                 tags: ['Physics', 'Field lines'],              preview: 'radial-gradient(circle at 40% 60%,#f59e0b,#0f172a)',         Comp: GravitySimulator   },

  // Algorithms (7)
  { id: 'sorting',     cat: 'algorithms',   title: 'Sorting Algorithms',    desc: 'Bubble · Quick · Merge · O(n²) vs O(n log n) side-by-side.',     tags: ['Bubble', 'Quick', 'Merge'],            preview: 'linear-gradient(90deg,#22c55e,#facc15,#f97316)',             Comp: SortingVisualizer  },
  { id: 'pathfinding', cat: 'algorithms',   title: 'Pathfinding',           desc: 'A* · BFS · DFS · draw walls · watch the shortest path.',         tags: ['A*', 'BFS', 'DFS'],                    preview: 'linear-gradient(90deg,#22d3ee,#0ea5e9,#1e40af)',             Comp: PathfindingVisualizer },
  { id: 'bst',         cat: 'algorithms',   title: 'Binary Search Tree',    desc: 'Insert · search · in/pre/post-order · SVG rendering.',           tags: ['Insert', 'Search', 'SVG'],             preview: 'linear-gradient(135deg,#22c55e,#0f172a)',                    Comp: BSTVisualizer      },
  { id: 'graph',       cat: 'algorithms',   title: 'Graph Traversal',       desc: 'BFS · DFS · queue vs stack visualised in real time.',            tags: ['BFS', 'DFS', 'Queue'],                 preview: 'linear-gradient(135deg,#f472b6,#7c3aed,#0a0a0e)',            Comp: GraphTraversal     },
  { id: 'rbtree',      cat: 'algorithms',   title: 'Red-Black Tree',        desc: 'Self-balancing tree · rotations · O(log n) guaranteed.',         tags: ['Self-balancing', 'Rotations'],         preview: 'linear-gradient(135deg,#ef4444,#0f172a)',                    Comp: RedBlackTree       },
  { id: 'heap',        cat: 'algorithms',   title: 'Heap & PQ',             desc: 'Min / max heap · sift-up · sift-down · priority-queue.',         tags: ['Min heap', 'Max heap'],                preview: 'linear-gradient(135deg,#facc15,#f97316,#0f172a)',            Comp: HeapVisualizer     },
  { id: 'dp',          cat: 'algorithms',   title: 'Dynamic Programming',   desc: 'Memoisation · tabulation · LCS · Knapsack side-by-side.',        tags: ['Memoise', 'LCS', 'Knapsack'],          preview: 'linear-gradient(135deg,#22d3ee,#7c3aed,#0f172a)',            Comp: DPVisualizer       },

  // Games & Data (3)
  { id: 'tictactoe',   cat: 'games-data',   title: 'Minimax Tic-Tac-Toe',   desc: 'Minimax + alpha-beta pruning · unbeatable AI · try to draw.',    tags: ['Minimax', 'Alpha-Beta'],               preview: 'linear-gradient(135deg,#818cf8,#7c3aed,#0a0a0e)',            Comp: TicTacToe          },
  { id: 'sql',         cat: 'games-data',   title: 'SQL Playground',        desc: 'SELECT · JOIN · GROUP BY · in-browser SQL engine.',              tags: ['SELECT', 'JOIN', 'GROUP BY'],          preview: 'linear-gradient(135deg,#22d3ee,#0f172a)',                    Comp: SQLPlayground      },
  { id: 'code',        cat: 'games-data',   title: 'JavaScript REPL',       desc: 'Run JS · console.log · sandboxed · example snippets.',           tags: ['console.log', 'Sandbox'],              preview: 'linear-gradient(135deg,#94a3b8,#0f172a)',                    Comp: CodeRunner         },
]

/* ── Loader ── */
const Loader = () => (
  <div className='flex items-center justify-center py-24'>
    <div className='flex flex-col items-center gap-3'>
      <div className='w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin' />
      <span className='text-fg-muted text-sm'>Loading demo…</span>
    </div>
  </div>
)

const Tag = ({ children }) => (
  <span className='px-2 py-0.5 bg-white/[0.06] text-cyan-300 text-[10px] rounded font-mono border border-white/10'>
    {children}
  </span>
)

/* ── Full-view card (opens when a demo is clicked) ── */
const DemoFrame = ({ demo, onClose }) => {
  const Comp = demo.Comp
  const cat = CATEGORIES.find(c => c.id === demo.cat)
  return (
    <div className='luxe-glass rounded-2xl overflow-hidden border border-white/10'>
      <div className='flex flex-wrap items-center gap-2 px-5 py-3 bg-white/[0.03] border-b border-white/10'>
        <span className='text-fg-primary font-bold text-sm'>{demo.title}</span>
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${cat?.chip} bg-white/[0.04]`}>
          {cat?.label}
        </span>
        <div className='flex gap-1.5 flex-wrap ml-1'>
          {demo.tags.map(t => <Tag key={t}>{t}</Tag>)}
        </div>
        <button
          type='button'
          onClick={onClose}
          className='ml-auto px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.1] text-fg-secondary hover:text-fg-primary rounded-lg text-xs font-semibold transition-colors'
        >
          Close
        </button>
      </div>
      <div className='p-4'>
        <Suspense fallback={<Loader />}>
          <Comp />
        </Suspense>
      </div>
    </div>
  )
}

/* ── Preview tile (used as the card thumbnail) ── */
const PreviewTile = ({ demo }) => {
  const cat = CATEGORIES.find(c => c.id === demo.cat)
  return (
    <div className='relative w-full h-28 rounded-xl overflow-hidden border border-white/10'
         style={{ background: demo.preview }}>
      <div className='absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10 pointer-events-none' />
      <div className='absolute bottom-2 left-2 flex items-center gap-1.5'>
        <span className={`w-1.5 h-1.5 rounded-full ${cat?.dot} shadow`} />
        <span className='text-[10px] font-mono text-white/85 uppercase tracking-[0.18em] drop-shadow'>
          {cat?.label}
        </span>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
 * Main Lab page
 * ─────────────────────────────────────────────────────────────── */
const Lab = () => {
  const [activeCat, setActiveCat] = useState('all')
  const [query, setQuery]         = useState('')
  const [openId, setOpenId]       = useState(null)
  const contentRef = useRef(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return DEMOS.filter(d => {
      if (activeCat !== 'all' && d.cat !== activeCat) return false
      if (!q) return true
      return d.title.toLowerCase().includes(q) ||
             d.desc.toLowerCase().includes(q) ||
             d.tags.some(t => t.toLowerCase().includes(q))
    })
  }, [activeCat, query])

  const activeDemo = openId ? DEMOS.find(d => d.id === openId) : null

  const openDemo = (id) => {
    setOpenId(prev => prev === id ? null : id)
    setTimeout(() => {
      contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  // Count per category — used in the filter chips
  const catCounts = useMemo(() => {
    const map = { all: DEMOS.length }
    for (const c of CATEGORIES) map[c.id] = DEMOS.filter(d => d.cat === c.id).length
    return map
  }, [])

  return (
    <div className='min-h-screen bg-surface-base text-fg-primary'>
      {/* Subtle dot grid backdrop */}
      <div className='fixed inset-0 pointer-events-none opacity-[0.03]'
           style={{ backgroundImage: 'radial-gradient(circle, #22d3ee 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      {/* ── Hero ── */}
      <div className='relative max-w-6xl mx-auto px-6 pt-32 pb-6 overflow-hidden'>
        <div aria-hidden className='ambient-orb -top-32 -left-40 opacity-70' />
        <div aria-hidden className='ambient-orb ambient-orb-cool -top-20 right-0 opacity-60' />

        {/* Animated shader backdrop — tucked to the right on desktop */}
        <div className='pointer-events-none absolute right-4 top-24 hidden md:block w-72 h-64 rounded-2xl overflow-hidden opacity-40 mix-blend-screen border border-cyan-900/40'>
          <ShaderAnimation className='w-full h-full' />
        </div>

        <div className='eyebrow-mono mb-3'>
          // {DEMOS.length} interactive demos · pure browser · zero backend
        </div>
        <h1 className='font-poppins font-black text-5xl md:text-6xl gradient-text-amber leading-tight'>
          Interactive Lab
        </h1>
        <p className='text-fg-secondary mt-3 text-base max-w-2xl'>
          Every browser-native experiment on the site, one page. Motion, shaders, particles,
          physics, algorithms, games &amp; data — 30 hand-built demos, lazy-loaded on click,
          all rendered locally in your browser with zero server calls.
        </p>

        {/* Stats */}
        <div className='flex flex-wrap gap-3 mt-6'>
          {[
            [DEMOS.length,      'Demos',        'text-cyan-400'],
            [CATEGORIES.length, 'Categories',   'text-fuchsia-400'],
            ['0',               'Backend hits', 'text-emerald-400'],
            ['100%',            'Client-side',  'text-amber-400'],
          ].map(([n, l, c]) => (
            <div key={l} className='luxe-glass luxe-card-hover text-center px-5 py-3'>
              <div className={`text-3xl font-black tabular-nums ${c}`}>{n}</div>
              <div className='text-xs text-fg-muted mt-0.5'>{l}</div>
            </div>
          ))}
        </div>

        {/* Search + filters */}
        <div className='mt-8 space-y-4'>
          {/* Search bar */}
          <div>
            <label htmlFor='lab-search' className='block text-xs font-semibold text-fg-secondary mb-1.5'>
              Search demos
            </label>
            <input
              id='lab-search'
              type='search'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Try "particles", "matrix", "sort"…'
              className='w-full sm:w-96 px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-cyan-400/60 focus:bg-white/[0.06] transition-colors text-sm'
            />
            <p className='text-[11px] text-fg-muted mt-1'>
              Filter by title, tag or description — instant, no submit.
            </p>
          </div>

          {/* Filter chips */}
          <div>
            <div className='block text-xs font-semibold text-fg-secondary mb-1.5'>
              Category
            </div>
            <div className='flex flex-wrap gap-2'>
              {[{ id: 'all', label: 'All' }, ...CATEGORIES].map(c => {
                const isActive = activeCat === c.id
                return (
                  <button
                    key={c.id}
                    type='button'
                    onClick={() => setActiveCat(c.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all tap-44 ${
                      isActive
                        ? 'bg-gradient-to-r from-amber-400 to-rose-400 text-black border-transparent shadow-[0_4px_20px_-6px_rgba(245,158,11,0.6)]'
                        : 'bg-white/[0.04] text-fg-secondary border-white/10 hover:bg-white/[0.08] hover:text-fg-primary'
                    }`}
                  >
                    {c.label}
                    <span className={`ml-1.5 font-mono text-[10px] ${isActive ? 'text-black/70' : 'text-fg-muted'}`}>
                      {catCounts[c.id]}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className='text-[11px] text-fg-muted mt-1.5'>
              Chips filter the grid in place. Combine with search for tight matches.
            </p>
          </div>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className='relative max-w-6xl mx-auto px-6 pb-10'>
        {filtered.length === 0 ? (
          <div className='text-center py-16 luxe-glass rounded-2xl mt-6 p-8'>
            <p className='text-fg-primary font-bold mb-1'>Nothing matches those filters</p>
            <p className='text-fg-muted text-sm mb-4'>Try a different category, or clear the search.</p>
            <button
              type='button'
              onClick={() => { setActiveCat('all'); setQuery('') }}
              className='luxe-btn luxe-btn-secondary tap-44'
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
            {filtered.map((d) => {
              const cat = CATEGORIES.find(c => c.id === d.cat)
              const isOpen = openId === d.id
              return (
                <AnimatedCard
                  key={d.id}
                  effect={cat?.effect || 'default'}
                  onClick={() => openDemo(d.id)}
                  className='h-full w-full'
                >
                  <div className={`relative group text-left p-4 transition-all duration-300 h-full ${
                    isOpen ? 'ring-2 ring-amber-400/60' : ''
                  }`}>
                    <PreviewTile demo={d} />

                    <div className='mt-3 flex items-start justify-between gap-3'>
                      <h3 className='text-fg-primary font-bold text-sm leading-snug line-clamp-2'>
                        {d.title}
                      </h3>
                      <span className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border ${cat?.chip} bg-white/[0.04] border-white/10`}>
                        {cat?.label}
                      </span>
                    </div>

                    <p className='mt-1.5 text-fg-muted text-xs leading-relaxed line-clamp-2'>
                      {d.desc}
                    </p>

                    <div className='mt-3 flex items-center justify-between'>
                      <div className='flex gap-1 flex-wrap'>
                        {d.tags.slice(0, 2).map(t => (
                          <span key={t} className='text-[10px] text-fg-muted bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/10'>
                            {t}
                          </span>
                        ))}
                      </div>
                      <span className={`text-xs font-semibold transition-colors ${
                        isOpen ? 'text-amber-300' : 'text-fg-muted group-hover:text-fg-primary'
                      }`}>
                        {isOpen ? 'Close ←' : 'Open →'}
                      </span>
                    </div>
                  </div>
                </AnimatedCard>
              )
            })}
          </div>
        )}

        {/* Cross-link to DSA tutorials — used to live here as a category */}
        <div className='mt-8 luxe-glass rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 border border-white/10'>
          <div className='min-w-0 flex-1'>
            <p className='text-fg-primary font-bold text-sm'>Looking for DSA tutorials?</p>
            <p className='text-fg-muted text-xs mt-0.5'>
              30 scrubbable algorithm visualisers with KaTeX-typeset proofs and a real-world use case live on the Algorithms hub.
            </p>
          </div>
          <Link
            to='/algorithms'
            className='luxe-btn luxe-btn-secondary tap-44 whitespace-nowrap'
          >
            Open Algorithms
          </Link>
        </div>
      </div>

      {/* ── Active demo view ── */}
      {activeDemo && (
        <div ref={contentRef} className='relative max-w-6xl mx-auto px-6 pb-24'>
          <div className='pt-8 pb-6'>
            <div className='flex items-center gap-3 mb-1'>
              <h2 className='font-poppins font-black text-3xl gradient-text-amber'>
                {activeDemo.title}
              </h2>
              <button
                type='button'
                onClick={() => setOpenId(null)}
                className='ml-auto px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.1] text-fg-secondary hover:text-fg-primary rounded-lg text-sm font-semibold transition-colors'
              >
                Close section
              </button>
            </div>
            <p className='text-fg-muted text-sm'>{activeDemo.desc}</p>
            <div className='mt-4 h-px bg-gradient-to-r from-amber-500/40 via-rose-500/40 to-transparent' />
          </div>
          <DemoFrame demo={activeDemo} onClose={() => setOpenId(null)} />
        </div>
      )}

      {!activeDemo && <div className='pb-24' />}
    </div>
  )
}

export default Lab
