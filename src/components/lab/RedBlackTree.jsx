import { useState, useRef, useCallback } from 'react'

const RED = 'RED'
const BLACK = 'BLACK'

class RBNode {
  constructor(val) {
    this.val = val
    this.color = RED
    this.left = null
    this.right = null
    this.parent = null
  }
}

class RedBlackTreeDS {
  constructor() {
    this.NIL = new RBNode(null)
    this.NIL.color = BLACK
    this.root = this.NIL
  }

  _rotateLeft(x) {
    const y = x.right
    x.right = y.left
    if (y.left !== this.NIL) y.left.parent = x
    y.parent = x.parent
    if (x.parent === null) this.root = y
    else if (x === x.parent.left) x.parent.left = y
    else x.parent.right = y
    y.left = x
    x.parent = y
    return y
  }

  _rotateRight(x) {
    const y = x.left
    x.left = y.right
    if (y.right !== this.NIL) y.right.parent = x
    y.parent = x.parent
    if (x.parent === null) this.root = y
    else if (x === x.parent.right) x.parent.right = y
    else x.parent.left = y
    y.right = x
    x.parent = y
    return y
  }

  insert(val) {
    const steps = []
    const node = new RBNode(val)
    node.left = this.NIL
    node.right = this.NIL

    let parent = null
    let current = this.root

    while (current !== this.NIL) {
      parent = current
      if (val === current.val) return steps
      if (val < current.val) current = current.left
      else current = current.right
    }

    node.parent = parent
    if (parent === null) this.root = node
    else if (val < parent.val) parent.left = node
    else parent.right = node

    steps.push({ type: 'insert', val, snapshot: this._snapshot() })

    if (node.parent === null) {
      node.color = BLACK
      steps.push({ type: 'recolor', val, from: RED, to: BLACK, reason: `Root must be Black`, snapshot: this._snapshot() })
      return steps
    }

    if (node.parent.parent === null) return steps

    this._fixInsert(node, steps)
    return steps
  }

  _fixInsert(z, steps) {
    while (z.parent && z.parent.color === RED) {
      const parent = z.parent
      const grandparent = parent.parent
      if (!grandparent) break

      if (parent === grandparent.left) {
        const uncle = grandparent.right
        if (uncle && uncle.color === RED) {
          // Case 1: Uncle is red — recolor
          parent.color = BLACK
          uncle.color = BLACK
          grandparent.color = RED
          steps.push({
            type: 'recolor',
            nodes: [parent.val, uncle.val, grandparent.val],
            reason: `Uncle is Red → recolor parent & uncle Black, grandparent Red`,
            snapshot: this._snapshot(),
            highlight: [z.val, parent.val, uncle.val, grandparent.val],
          })
          z = grandparent
        } else {
          if (z === parent.right) {
            // Case 2: Uncle is black, z is right child — left rotation on parent
            z = parent
            steps.push({
              type: 'rotation',
              direction: 'left',
              pivot: z.val,
              reason: `Left rotation at ${z.val}`,
              snapshot: null,
              highlight: [z.val],
            })
            this._rotateLeft(z)
            steps[steps.length - 1].snapshot = this._snapshot()
          }
          // Case 3: Uncle is black, z is left child — right rotation on grandparent
          z.parent.color = BLACK
          grandparent.color = RED
          steps.push({
            type: 'recolor',
            nodes: [z.parent.val, grandparent.val],
            reason: `Right rotation at ${grandparent.val}: parent → Black, grandparent → Red`,
            snapshot: null,
            highlight: [z.val, z.parent ? z.parent.val : null, grandparent.val],
          })
          this._rotateRight(grandparent)
          steps[steps.length - 1].snapshot = this._snapshot()
        }
      } else {
        const uncle = grandparent.left
        if (uncle && uncle.color === RED) {
          parent.color = BLACK
          uncle.color = BLACK
          grandparent.color = RED
          steps.push({
            type: 'recolor',
            nodes: [parent.val, uncle.val, grandparent.val],
            reason: `Uncle is Red → recolor parent & uncle Black, grandparent Red`,
            snapshot: this._snapshot(),
            highlight: [z.val, parent.val, uncle.val, grandparent.val],
          })
          z = grandparent
        } else {
          if (z === parent.left) {
            z = parent
            steps.push({
              type: 'rotation',
              direction: 'right',
              pivot: z.val,
              reason: `Right rotation at ${z.val}`,
              snapshot: null,
              highlight: [z.val],
            })
            this._rotateRight(z)
            steps[steps.length - 1].snapshot = this._snapshot()
          }
          z.parent.color = BLACK
          grandparent.color = RED
          steps.push({
            type: 'recolor',
            nodes: [z.parent.val, grandparent.val],
            reason: `Left rotation at ${grandparent.val}: parent → Black, grandparent → Red`,
            snapshot: null,
            highlight: [z.val, z.parent ? z.parent.val : null, grandparent.val],
          })
          this._rotateLeft(grandparent)
          steps[steps.length - 1].snapshot = this._snapshot()
        }
      }

      if (z === this.root) break
    }
    this.root.color = BLACK
  }

  _snapshot() {
    const nodes = []
    const traverse = (node, depth) => {
      if (!node || node === this.NIL || node.val === null) return
      nodes.push({ val: node.val, color: node.color, depth })
      traverse(node.left, depth + 1)
      traverse(node.right, depth + 1)
    }
    traverse(this.root, 0)
    return { root: this._cloneTree(this.root), nodes }
  }

  _cloneTree(node) {
    if (!node || node === this.NIL || node.val === null) return null
    return {
      val: node.val,
      color: node.color,
      left: this._cloneTree(node.left),
      right: this._cloneTree(node.right),
    }
  }

  getTree() {
    return this._cloneTree(this.root)
  }

  height() {
    const h = (n) => {
      if (!n || n === this.NIL || n.val === null) return 0
      return 1 + Math.max(h(n.left), h(n.right))
    }
    return h(this.root)
  }

  blackHeight() {
    const bh = (n) => {
      if (!n || n === this.NIL || n.val === null) return 1
      const left = bh(n.left)
      return left + (n.color === BLACK ? 1 : 0)
    }
    return bh(this.root) - 1
  }

  count() {
    const c = (n) => {
      if (!n || n === this.NIL || n.val === null) return 0
      return 1 + c(n.left) + c(n.right)
    }
    return c(this.root)
  }

  clear() {
    this.NIL = new RBNode(null)
    this.NIL.color = BLACK
    this.root = this.NIL
  }
}

function computeLayout(root) {
  const positions = {}
  let idx = 0
  const inOrder = (node, depth) => {
    if (!node) return
    inOrder(node.left, depth + 1)
    positions[node.val] = { x: idx, y: depth }
    idx++
    inOrder(node.right, depth + 1)
  }
  inOrder(root, 0)
  return positions
}

function renderRBTree(root, positions, highlight, svgW, svgH) {
  if (!root) return { nodes: [], edges: [] }
  const nodeR = 22
  const count = Object.keys(positions).length
  const xScale = svgW / (count + 1)
  const yScale = 70
  const yOff = 40

  const getPos = (val) => ({
    cx: (positions[val].x + 1) * xScale,
    cy: positions[val].y * yScale + yOff,
  })

  const edges = []
  const nodes = []

  const traverse = (node) => {
    if (!node) return
    const { cx, cy } = getPos(node.val)
    if (node.left) {
      const { cx: lx, cy: ly } = getPos(node.left.val)
      edges.push({ x1: cx, y1: cy, x2: lx, y2: ly, key: `${node.val}-${node.left.val}` })
    }
    if (node.right) {
      const { cx: rx, cy: ry } = getPos(node.right.val)
      edges.push({ x1: cx, y1: cy, x2: rx, y2: ry, key: `${node.val}-${node.right.val}` })
    }

    const isHighlighted = highlight.includes(node.val)
    const fill = node.color === RED ? '#ef4444' : '#1f2937'
    const strokeColor = isHighlighted ? '#fbbf24' : node.color === RED ? '#fca5a5' : '#6b7280'
    const strokeW = isHighlighted ? 3 : 2

    nodes.push({ val: node.val, cx, cy, fill, strokeColor, strokeW, color: node.color, r: nodeR, isHighlighted })
    traverse(node.left)
    traverse(node.right)
  }
  traverse(root)
  return { nodes, edges }
}

export default function RedBlackTree() {
  const [tree] = useState(() => new RedBlackTreeDS())
  const [treeRoot, setTreeRoot] = useState(null)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('Insert a value to begin')
  const [highlight, setHighlight] = useState([])
  const [animating, setAnimating] = useState(false)
  const [stats, setStats] = useState({ height: 0, blackHeight: 0, count: 0 })
  const timersRef = useRef([])

  const svgW = 720
  const svgH = 380

  const refreshStats = useCallback(() => {
    setStats({ height: tree.height(), blackHeight: tree.blackHeight(), count: tree.count() })
    setTreeRoot(tree.getTree())
  }, [tree])

  const clearTimers = () => {
    timersRef.current.forEach(t => clearTimeout(t))
    timersRef.current = []
  }

  const runInsert = useCallback((val) => {
    if (animating) return
    clearTimers()
    const steps = tree.insert(val)
    if (!steps.length) return

    setAnimating(true)
    let delay = 0

    steps.forEach((step, i) => {
      const t = setTimeout(() => {
        if (step.snapshot) {
          setTreeRoot(step.snapshot.root)
        }
        setHighlight(step.highlight || (step.val != null ? [step.val] : []))
        if (step.type === 'insert') setStatus(`Inserted ${step.val} as Red node`)
        else if (step.type === 'recolor') setStatus(step.reason)
        else if (step.type === 'rotation') setStatus(step.reason)

        if (i === steps.length - 1) {
          const final = setTimeout(() => {
            setHighlight([])
            setAnimating(false)
            setStatus(`Done inserting ${val}`)
            setTreeRoot(tree.getTree())
            setStats({ height: tree.height(), blackHeight: tree.blackHeight(), count: tree.count() })
          }, 400)
          timersRef.current.push(final)
        }
      }, delay)
      timersRef.current.push(t)
      delay += 500
    })
  }, [animating, tree])

  const handleInsert = () => {
    const v = parseInt(input)
    if (isNaN(v) || v < 1 || v > 999) return
    setInput('')
    runInsert(v)
  }

  const handleRandom = () => {
    const v = Math.floor(Math.random() * 99) + 1
    runInsert(v)
  }

  const handleClear = () => {
    clearTimers()
    setAnimating(false)
    tree.clear()
    setTreeRoot(null)
    setHighlight([])
    setStatus('Tree cleared. Insert values to begin.')
    setStats({ height: 0, blackHeight: 0, count: 0 })
  }

  const positions = treeRoot ? computeLayout(treeRoot) : {}
  const { nodes, edges } = treeRoot ? renderRBTree(treeRoot, positions, highlight, svgW, svgH) : { nodes: [], edges: [] }

  return (
    <div className="bg-gray-900 rounded-xl p-5 text-white select-none">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleInsert()}
          placeholder="Value (1–999)"
          disabled={animating}
          className="bg-gray-800 border border-gray-700 text-red-300 placeholder-gray-600 px-3 py-1.5 rounded-lg font-mono text-sm w-32 focus:outline-none focus:border-red-500 disabled:opacity-50"
        />
        <button onClick={handleInsert} disabled={animating}
          className="px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm rounded-lg font-semibold transition-colors">
          Insert
        </button>
        <button onClick={handleRandom} disabled={animating}
          className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm rounded-lg font-semibold transition-colors">
          Insert Random
        </button>
        <button onClick={handleClear}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg font-semibold transition-colors">
          Clear
        </button>
        <div className="ml-auto flex gap-4 text-xs text-gray-400">
          <span>Height: <span className="text-red-400 font-bold">{stats.height}</span></span>
          <span>Black-H: <span className="text-gray-300 font-bold">{stats.blackHeight}</span></span>
          <span>Nodes: <span className="text-red-400 font-bold">{stats.count}</span></span>
        </div>
      </div>

      {/* Status */}
      <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-mono border transition-all ${
        animating ? 'bg-yellow-900/30 border-yellow-600/50 text-yellow-300' : 'bg-gray-800 border-gray-700 text-gray-300'
      }`}>
        {animating && <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full mr-2 animate-pulse" />}
        {status}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-3 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-red-500" />
          <span className="text-gray-400">Red Node</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-gray-800 border border-gray-600" />
          <span className="text-gray-400">Black Node</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full border-2 border-yellow-400" />
          <span className="text-gray-400">Highlighted</span>
        </div>
      </div>

      {/* SVG Tree */}
      <div className="bg-gray-950 rounded-xl overflow-x-auto mb-4">
        <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ minWidth: 400 }}>
          <defs>
            <filter id="rb-glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {edges.map(e => (
            <line key={e.key} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#374151" strokeWidth="2" />
          ))}
          {nodes.map(n => (
            <g key={n.val}>
              <circle
                cx={n.cx} cy={n.cy} r={n.r}
                fill={n.fill}
                stroke={n.strokeColor}
                strokeWidth={n.strokeW}
                style={{
                  filter: n.isHighlighted ? 'url(#rb-glow)' : 'none',
                  transition: 'fill 0.3s, stroke 0.3s',
                }}
              />
              <text x={n.cx} y={n.cy + 5} textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="monospace">
                {n.val}
              </text>
            </g>
          ))}
          {nodes.length === 0 && (
            <text x={svgW / 2} y={svgH / 2} textAnchor="middle" fill="#4b5563" fontSize="16">
              Tree is empty — insert values above
            </text>
          )}
        </svg>
      </div>

      {/* RB Properties reminder */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
        {[
          '1. Every node is Red or Black',
          '2. Root is always Black',
          '3. NIL leaves are Black',
          '4. Red node → both children are Black',
          '5. All paths to NIL have equal Black-height',
        ].map(rule => (
          <div key={rule} className="bg-gray-800/60 rounded px-2.5 py-1.5 text-gray-400 font-mono">{rule}</div>
        ))}
      </div>
    </div>
  )
}
