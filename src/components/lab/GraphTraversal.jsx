import { useState, useRef, useCallback } from 'react'

const NODES = {
  A: { x: 350, y: 60 },
  B: { x: 180, y: 150 },
  C: { x: 520, y: 150 },
  D: { x: 80,  y: 270 },
  E: { x: 260, y: 290 },
  F: { x: 440, y: 290 },
  G: { x: 620, y: 270 },
  H: { x: 350, y: 390 },
}

const EDGES = [
  ['A', 'B'], ['A', 'C'],
  ['B', 'D'], ['B', 'E'],
  ['C', 'F'], ['C', 'G'],
  ['D', 'E'], ['E', 'H'],
  ['F', 'H'], ['F', 'G'],
  ['G', 'H'], ['A', 'F'],
]

const ADJ = {}
Object.keys(NODES).forEach(n => { ADJ[n] = [] })
EDGES.forEach(([a, b]) => { ADJ[a].push(b); ADJ[b].push(a) })
Object.keys(ADJ).forEach(k => ADJ[k].sort())

function bfsSteps(start) {
  const visited = new Set()
  const queue = [start]
  visited.add(start)
  const steps = []
  const order = []
  const queueStates = [[start]]

  while (queue.length > 0) {
    const node = queue.shift()
    order.push(node)
    steps.push({ current: node, visited: new Set(order), queue: [...queue], stack: null })
    for (const neighbor of ADJ[node]) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
    if (queue.length > 0 || steps.length < order.length) {
      steps[steps.length - 1].queue = [...queue]
    }
  }
  return { steps, order }
}

function dfsSteps(start) {
  const visited = new Set()
  const stack = [start]
  const steps = []
  const order = []

  while (stack.length > 0) {
    const node = stack.pop()
    if (visited.has(node)) continue
    visited.add(node)
    order.push(node)
    steps.push({ current: node, visited: new Set(order), stack: [...stack], queue: null })
    const neighbors = [...ADJ[node]].reverse()
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) stack.push(neighbor)
    }
    steps[steps.length - 1].stack = [...stack]
  }
  return { steps, order }
}

export default function GraphTraversal() {
  const [startNode, setStartNode] = useState('A')
  const [stepIndex, setStepIndex] = useState(-1)
  const [steps, setSteps] = useState([])
  const [order, setOrder] = useState([])
  const [mode, setMode] = useState(null)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(600)
  const timerRef = useRef(null)

  const runTraversal = useCallback((type) => {
    if (timerRef.current) clearInterval(timerRef.current)
    const result = type === 'bfs' ? bfsSteps(startNode) : dfsSteps(startNode)
    setSteps(result.steps)
    setOrder(result.order)
    setMode(type)
    setStepIndex(-1)
    setRunning(true)

    let i = 0
    timerRef.current = setInterval(() => {
      setStepIndex(i)
      i++
      if (i >= result.steps.length) {
        clearInterval(timerRef.current)
        setRunning(false)
      }
    }, speed)
  }, [startNode, speed])

  const reset = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setStepIndex(-1)
    setSteps([])
    setOrder([])
    setMode(null)
    setRunning(false)
  }

  const currentStep = stepIndex >= 0 && stepIndex < steps.length ? steps[stepIndex] : null

  const getNodeColor = (n) => {
    if (!currentStep) return '#1f2937'
    if (currentStep.current === n) return '#c2410c'
    if (currentStep.visited.has(n)) return '#1d4ed8'
    return '#1f2937'
  }
  const getNodeStroke = (n) => {
    if (n === startNode) return '#a78bfa'
    if (!currentStep) return '#4b5563'
    if (currentStep.current === n) return '#fb923c'
    if (currentStep.visited.has(n)) return '#60a5fa'
    return '#4b5563'
  }

  const svgW = 710
  const svgH = 460

  return (
    <div className="bg-gray-900 rounded-xl p-5 text-white select-none">
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">Start:</span>
          <div className="flex gap-1">
            {Object.keys(NODES).map(n => (
              <button key={n} onClick={() => { setStartNode(n); reset() }}
                className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${startNode === n ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => runTraversal('bfs')} disabled={running}
          className="px-4 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-sm rounded-lg font-semibold transition-colors">BFS</button>
        <button onClick={() => runTraversal('dfs')} disabled={running}
          className="px-4 py-1.5 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white text-sm rounded-lg font-semibold transition-colors">DFS</button>
        <button onClick={reset} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg font-semibold transition-colors">Reset</button>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-gray-400 text-xs">Speed:</span>
          <input type="range" min="100" max="1200" step="100" value={speed} onChange={e => setSpeed(Number(e.target.value))}
            className="w-24 accent-cyan-500" />
          <span className="text-cyan-400 text-xs font-mono">{speed}ms</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="bg-gray-950 rounded-xl overflow-x-auto flex-1">
          <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ minWidth: 'min(100%, 320px)' }}>
            <defs>
              <filter id="glow2">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {EDGES.map(([a, b]) => (
              <line key={`${a}-${b}`}
                x1={NODES[a].x} y1={NODES[a].y}
                x2={NODES[b].x} y2={NODES[b].y}
                stroke="#374151" strokeWidth="2" />
            ))}
            {Object.entries(NODES).map(([id, { x, y }]) => (
              <g key={id} style={{ cursor: 'pointer' }} onClick={() => { if (!running) { setStartNode(id); reset() } }}>
                <circle cx={x} cy={y} r={28} fill={getNodeColor(id)} stroke={getNodeStroke(id)} strokeWidth="2.5"
                  style={{ transition: 'fill 0.3s, stroke 0.3s', filter: currentStep?.current === id ? 'url(#glow2)' : 'none' }} />
                <text x={x} y={y + 6} textAnchor="middle" fill="#e2e8f0" fontSize="16" fontWeight="700" fontFamily="monospace">{id}</text>
              </g>
            ))}
          </svg>
        </div>

        <div className="lg:w-52 flex flex-col gap-3">
          <div className="bg-gray-950 rounded-xl p-3">
            <div className="text-xs text-gray-500 font-mono mb-2 uppercase tracking-wide">
              {mode === 'bfs' ? 'Queue' : mode === 'dfs' ? 'Stack' : 'Queue / Stack'}
            </div>
            <div className="flex flex-wrap gap-1 min-h-8">
              {mode && currentStep && (mode === 'bfs' ? currentStep.queue : currentStep.stack)?.map((n, i) => (
                <span key={i} className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm font-bold font-mono ${mode === 'bfs' ? 'bg-blue-900 text-blue-300' : 'bg-orange-900 text-orange-300'}`}>{n}</span>
              ))}
              {(!currentStep || !(mode === 'bfs' ? currentStep.queue : currentStep.stack)?.length) && (
                <span className="text-gray-700 text-xs">empty</span>
              )}
            </div>
          </div>

          <div className="bg-gray-950 rounded-xl p-3">
            <div className="text-xs text-gray-500 font-mono mb-2 uppercase tracking-wide">Visit Order</div>
            <div className="flex flex-wrap gap-1">
              {order.slice(0, stepIndex + 1).map((n, i) => (
                <span key={i} className="w-7 h-7 flex items-center justify-center rounded bg-blue-900/60 text-blue-300 text-sm font-bold font-mono">{n}</span>
              ))}
            </div>
          </div>

          <div className="bg-gray-950 rounded-xl p-3">
            <div className="text-xs text-gray-500 font-mono mb-2 uppercase tracking-wide">Adjacency List</div>
            {Object.entries(ADJ).map(([n, neighbors]) => (
              <div key={n} className="flex gap-1.5 text-xs font-mono mb-1 items-center">
                <span className="text-purple-400 w-4">{n}</span>
                <span className="text-gray-600">→</span>
                <span className="text-gray-400">{neighbors.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-600 inline-block"></span>Current</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-700 inline-block"></span>Visited</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-700 inline-block"></span>Unvisited</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-purple-500 inline-block"></span>Start</span>
      </div>
    </div>
  )
}
