import { useRef } from 'react'
import SolarSystem3D from '../components/lab/SolarSystem3D'
import GravitySimulator from '../components/lab/GravitySimulator'
import WarpSpeed from '../components/lab/WarpSpeed'
import ParticleCanvas from '../components/lab/ParticleCanvas'
import SortingVisualizer from '../components/lab/SortingVisualizer'
import PathfindingVisualizer from '../components/lab/PathfindingVisualizer'
import BSTVisualizer from '../components/lab/BSTVisualizer'
import GraphTraversal from '../components/lab/GraphTraversal'
import RedBlackTree from '../components/lab/RedBlackTree'
import HeapVisualizer from '../components/lab/HeapVisualizer'
import DPVisualizer from '../components/lab/DPVisualizer'
import TicTacToe from '../components/lab/TicTacToe'
import GameOfLife from '../components/lab/GameOfLife'
import FractalExplorer from '../components/lab/FractalExplorer'
import MatrixRain from '../components/lab/MatrixRain'
import SQLPlayground from '../components/lab/SQLPlayground'
import CodeRunner from '../components/lab/CodeRunner'

const SECTIONS = [
  { id: 'worlds',     label: '🪐 3D Worlds' },
  { id: 'algorithms', label: '⚡ Algorithms' },
  { id: 'ai',         label: '🤖 AI & Games' },
  { id: 'math',       label: '🎨 Mathematics' },
  { id: 'data',       label: '🗄 Data & SQL' },
  { id: 'code',       label: '💻 Code' },
]

const Tag = ({ children }) => (
  <span className='px-2 py-0.5 bg-gray-800 text-cyan-400 text-xs rounded font-mono'>{children}</span>
)

const Card = ({ title, tags = [], children }) => (
  <div className='bg-gray-900 rounded-2xl overflow-hidden border border-gray-800'>
    <div className='flex flex-wrap items-center gap-2 px-5 py-3 bg-gray-800/60 border-b border-gray-700/60'>
      <span className='text-white font-semibold text-sm'>{title}</span>
      <div className='flex gap-1.5 flex-wrap ml-1'>
        {tags.map(t => <Tag key={t}>{t}</Tag>)}
      </div>
    </div>
    <div className='p-4'>{children}</div>
  </div>
)

const SectionHeader = ({ id, icon, title, subtitle }) => (
  <div id={id} className='pt-20 pb-6'>
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

  const scrollTo = id => {
    refs[id].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className='min-h-screen bg-gray-950 text-white'>
      {/* ── Hero ── */}
      <div className='max-w-6xl mx-auto px-6 pt-32 pb-4'>
        <h1 className='font-poppins font-black text-5xl md:text-6xl bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent leading-tight'>
          Interactive Lab
        </h1>
        <p className='text-gray-400 mt-3 text-base max-w-xl'>
          17 live demos — 3D simulations, classic algorithms, AI game theory, fractal math, SQL queries & a JS playground. All running 100% in the browser.
        </p>

        {/* Stats row */}
        <div className='flex flex-wrap gap-6 mt-6'>
          {[['17', 'Interactive Demos'],['3', '3D Simulations'],['8', 'Algorithm Visualizers'],['2', 'Code Environments']].map(([n, l]) => (
            <div key={l}>
              <div className='text-2xl font-black text-cyan-400'>{n}</div>
              <div className='text-xs text-gray-500'>{l}</div>
            </div>
          ))}
        </div>

        {/* Section nav */}
        <div className='flex flex-wrap gap-2 mt-8'>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => scrollTo(s.id)}
              className='px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-full text-sm font-semibold transition-all'>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className='max-w-6xl mx-auto px-6 pb-24'>

        {/* ── 3D Worlds ── */}
        <div ref={refs.worlds}>
          <SectionHeader id='worlds' icon='🪐' title='3D Worlds'
            subtitle='Three.js & Canvas simulations — drag, interact, explore' />
          <div className='flex flex-col gap-6'>
            <Card title='Solar System' tags={['Three.js', '3D', 'Orbital Mechanics']}>
              <SolarSystem3D />
            </Card>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
              <Card title='Warp Drive' tags={['Canvas', 'Starfield', 'Blue-shift']}>
                <WarpSpeed />
              </Card>
              <Card title='Neural Particles' tags={['Canvas', 'Mouse Repulsion']}>
                <ParticleCanvas />
              </Card>
            </div>
          </div>
        </div>

        {/* ── Algorithms ── */}
        <div ref={refs.algorithms}>
          <SectionHeader id='algorithms' icon='⚡' title='Algorithms'
            subtitle='Watch algorithms execute step-by-step in real time' />
          <div className='flex flex-col gap-6'>
            <Card title='Sorting Algorithms' tags={['Bubble', 'Quick', 'Merge', 'O(n²) vs O(n log n)']}>
              <SortingVisualizer />
            </Card>
            <Card title='Pathfinding Visualizer' tags={['A*', 'BFS', 'DFS', 'Draw walls']}>
              <PathfindingVisualizer />
            </Card>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
              <Card title='Binary Search Tree' tags={['Insert', 'Search', 'Traversal', 'SVG']}>
                <BSTVisualizer />
              </Card>
              <Card title='Graph Traversal' tags={['BFS', 'DFS', 'Queue', 'Stack']}>
                <GraphTraversal />
              </Card>
            </div>
            <Card title='Red-Black Tree' tags={['Self-Balancing', 'Rotations', 'O(log n)']}>
              <RedBlackTree />
            </Card>
            <Card title='Heap & Priority Queue' tags={['Min Heap', 'Max Heap', 'Sift-up/down']}>
              <HeapVisualizer />
            </Card>
            <Card title='Dynamic Programming' tags={['Memoization', 'Tabulation', 'LCS', 'Knapsack']}>
              <DPVisualizer />
            </Card>
          </div>
        </div>

        {/* ── AI & Games ── */}
        <div ref={refs.ai}>
          <SectionHeader id='ai' icon='🤖' title='AI & Game Theory'
            subtitle='Minimax, alpha-beta pruning, and unbeatable game AI' />
          <Card title='Minimax Tic-Tac-Toe' tags={['Minimax', 'Alpha-Beta Pruning', 'Game Theory', 'Unbeatable AI']}>
            <TicTacToe />
          </Card>
        </div>

        {/* ── Mathematics ── */}
        <div ref={refs.math}>
          <SectionHeader id='math' icon='🎨' title='Mathematical Beauty'
            subtitle='Cellular automata, fractals, N-body physics, and emergent complexity' />
          <div className='flex flex-col gap-6'>
            <Card title="Conway's Game of Life" tags={['Cellular Automaton', 'Emergence', 'Canvas']}>
              <GameOfLife />
            </Card>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
              <Card title='Mandelbrot Fractal' tags={['Infinite Zoom', 'Complex Plane', 'Canvas']}>
                <FractalExplorer />
              </Card>
              <Card title='N-Body Gravity Simulator' tags={['F=Gm₁m₂/r²', 'Physics', 'Field Lines']}>
                <GravitySimulator />
              </Card>
            </div>
            <Card title='Matrix Rain' tags={['Katakana', 'Canvas', 'The Matrix']}>
              <MatrixRain />
            </Card>
          </div>
        </div>

        {/* ── Data & SQL ── */}
        <div ref={refs.data}>
          <SectionHeader id='data' icon='🗄' title='Data & Queries'
            subtitle='Run real SQL queries against an in-browser database — no server needed' />
          <Card title='SQL Playground' tags={['SELECT', 'JOIN', 'GROUP BY', 'In-browser Engine']}>
            <SQLPlayground />
          </Card>
        </div>

        {/* ── Code Playground ── */}
        <div ref={refs.code}>
          <SectionHeader id='code' icon='💻' title='Code Playground'
            subtitle='Write and run JavaScript directly in the browser with live output' />
          <Card title='JavaScript REPL' tags={['Run Code', 'console.log', 'Sandboxed', 'Examples']}>
            <CodeRunner />
          </Card>
        </div>

      </div>
    </div>
  )
}

export default Lab
