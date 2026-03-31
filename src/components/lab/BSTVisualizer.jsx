import { useState, useRef, useCallback } from 'react'

class BSTNode {
  constructor(val) {
    this.val = val
    this.left = null
    this.right = null
  }
}

class BST {
  constructor() {
    this.root = null
  }

  insert(val) {
    const node = new BSTNode(val)
    if (!this.root) { this.root = node; return }
    let cur = this.root
    while (true) {
      if (val === cur.val) return
      if (val < cur.val) {
        if (!cur.left) { cur.left = node; return }
        cur = cur.left
      } else {
        if (!cur.right) { cur.right = node; return }
        cur = cur.right
      }
    }
  }

  search(val) {
    const path = []
    let cur = this.root
    while (cur) {
      path.push(cur.val)
      if (val === cur.val) return { found: true, path }
      cur = val < cur.val ? cur.left : cur.right
    }
    return { found: false, path }
  }

  delete(val) {
    this.root = this._deleteNode(this.root, val)
  }

  _deleteNode(node, val) {
    if (!node) return null
    if (val < node.val) { node.left = this._deleteNode(node.left, val); return node }
    if (val > node.val) { node.right = this._deleteNode(node.right, val); return node }
    if (!node.left) return node.right
    if (!node.right) return node.left
    let minNode = node.right
    while (minNode.left) minNode = minNode.left
    node.val = minNode.val
    node.right = this._deleteNode(node.right, minNode.val)
    return node
  }

  inOrder() {
    const res = []
    const traverse = (n) => { if (!n) return; traverse(n.left); res.push(n.val); traverse(n.right) }
    traverse(this.root)
    return res
  }

  preOrder() {
    const res = []
    const traverse = (n) => { if (!n) return; res.push(n.val); traverse(n.left); traverse(n.right) }
    traverse(this.root)
    return res
  }

  postOrder() {
    const res = []
    const traverse = (n) => { if (!n) return; traverse(n.left); traverse(n.right); res.push(n.val) }
    traverse(this.root)
    return res
  }

  height() {
    const h = (n) => { if (!n) return 0; return 1 + Math.max(h(n.left), h(n.right)) }
    return h(this.root)
  }

  count() {
    const c = (n) => { if (!n) return 0; return 1 + c(n.left) + c(n.right) }
    return c(this.root)
  }

  clone() {
    const cloneNode = (n) => {
      if (!n) return null
      const node = new BSTNode(n.val)
      node.left = cloneNode(n.left)
      node.right = cloneNode(n.right)
      return node
    }
    const t = new BST()
    t.root = cloneNode(this.root)
    return t
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

function renderTree(root, positions, highlighted, searchPath, found, svgW, svgH) {
  if (!root) return { nodes: [], edges: [] }
  const nodeR = 22
  const xScale = svgW / (Object.keys(positions).length + 1)
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
    let fill = '#1e3a4a'
    let stroke = '#22d3ee'
    let textColor = '#e2e8f0'
    if (searchPath.includes(node.val)) {
      fill = '#713f12'
      stroke = '#facc15'
      textColor = '#fef08a'
    }
    if (highlighted === node.val) {
      fill = found ? '#14532d' : '#7f1d1d'
      stroke = found ? '#4ade80' : '#f87171'
      textColor = found ? '#bbf7d0' : '#fecaca'
    }
    nodes.push({ val: node.val, cx, cy, fill, stroke, textColor, r: nodeR })
    traverse(node.left)
    traverse(node.right)
  }
  traverse(root)
  return { nodes, edges }
}

export default function BSTVisualizer() {
  const [bst, setBst] = useState(() => {
    const t = new BST()
    ;[50, 30, 70, 20, 40, 60, 80, 10, 25].forEach(v => t.insert(v))
    return t
  })
  const [input, setInput] = useState('')
  const [searchPath, setSearchPath] = useState([])
  const [highlighted, setHighlighted] = useState(null)
  const [foundStatus, setFoundStatus] = useState(null)
  const [animating, setAnimating] = useState(false)
  const [traversalMode, setTraversalMode] = useState('inorder')
  const animRef = useRef(null)

  const svgW = 700
  const svgH = 380

  const positions = bst.root ? computeLayout(bst.root) : {}
  const { nodes, edges } = renderTree(bst.root, positions, highlighted, searchPath, foundStatus === true, svgW, svgH)

  const handleInsert = () => {
    const v = parseInt(input)
    if (isNaN(v)) return
    const t = bst.clone()
    t.insert(v)
    setBst(t)
    setInput('')
    setSearchPath([])
    setHighlighted(null)
    setFoundStatus(null)
  }

  const handleDelete = () => {
    const v = parseInt(input)
    if (isNaN(v)) return
    const t = bst.clone()
    t.delete(v)
    setBst(t)
    setInput('')
    setSearchPath([])
    setHighlighted(null)
    setFoundStatus(null)
  }

  const handleSearch = useCallback(() => {
    const v = parseInt(input)
    if (isNaN(v) || animating) return
    const { found, path } = bst.search(v)
    setSearchPath([])
    setHighlighted(null)
    setFoundStatus(null)
    setAnimating(true)
    path.forEach((nodeVal, i) => {
      const t1 = setTimeout(() => {
        setSearchPath(path.slice(0, i + 1))
      }, i * 350)
      animRef.current = t1
    })
    const tFinal = setTimeout(() => {
      setHighlighted(found ? v : path[path.length - 1])
      setFoundStatus(found)
      setAnimating(false)
    }, path.length * 350 + 100)
    animRef.current = tFinal
  }, [bst, input, animating])

  const handleRandom = () => {
    const v = Math.floor(Math.random() * 99) + 1
    const t = bst.clone()
    t.insert(v)
    setBst(t)
    setSearchPath([])
    setHighlighted(null)
    setFoundStatus(null)
  }

  const handleClear = () => {
    setBst(new BST())
    setSearchPath([])
    setHighlighted(null)
    setFoundStatus(null)
    setInput('')
  }

  const traversalOutput = () => {
    if (!bst.root) return []
    if (traversalMode === 'inorder') return bst.inOrder()
    if (traversalMode === 'preorder') return bst.preOrder()
    return bst.postOrder()
  }

  const onKey = (e) => { if (e.key === 'Enter') handleInsert() }

  return (
    <div className="bg-gray-900 rounded-xl p-5 text-white select-none">
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Value (1–99)"
          className="bg-gray-800 border border-gray-700 text-cyan-300 placeholder-gray-600 px-3 py-1.5 rounded-lg font-mono text-sm w-32 focus:outline-none focus:border-cyan-500"
        />
        <button onClick={handleInsert} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg font-semibold transition-colors">Insert</button>
        <button onClick={handleSearch} className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white text-sm rounded-lg font-semibold transition-colors">Search</button>
        <button onClick={handleDelete} className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg font-semibold transition-colors">Delete</button>
        <button onClick={handleRandom} className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-sm rounded-lg font-semibold transition-colors">Random</button>
        <button onClick={handleClear} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg font-semibold transition-colors">Clear</button>
        <div className="ml-auto flex gap-3 text-xs text-gray-400">
          <span>Height: <span className="text-cyan-400 font-bold">{bst.height()}</span></span>
          <span>Nodes: <span className="text-cyan-400 font-bold">{bst.count()}</span></span>
        </div>
      </div>

      {foundStatus !== null && (
        <div className={`mb-3 px-3 py-1.5 rounded-lg text-sm font-semibold ${foundStatus ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
          {foundStatus ? `Found ${input} in the tree` : `${input} not found in tree`}
        </div>
      )}

      <div className="bg-gray-950 rounded-xl overflow-x-auto mb-4">
        <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ minWidth: 400 }}>
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {edges.map(e => (
            <line key={e.key} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#374151" strokeWidth="2" />
          ))}
          {nodes.map(n => (
            <g key={n.val}>
              <circle cx={n.cx} cy={n.cy} r={n.r} fill={n.fill} stroke={n.stroke} strokeWidth="2"
                style={{ filter: (searchPath.includes(n.val) || highlighted === n.val) ? 'url(#glow)' : 'none', transition: 'fill 0.3s, stroke 0.3s' }} />
              <text x={n.cx} y={n.cy + 5} textAnchor="middle" fill={n.textColor} fontSize="13" fontWeight="700" fontFamily="monospace">{n.val}</text>
            </g>
          ))}
          {nodes.length === 0 && (
            <text x={svgW / 2} y={svgH / 2} textAnchor="middle" fill="#4b5563" fontSize="16">Tree is empty — insert values above</text>
          )}
        </svg>
      </div>

      <div className="flex flex-wrap gap-3 items-start">
        <div className="flex gap-1.5">
          {['inorder', 'preorder', 'postorder'].map(m => (
            <button key={m} onClick={() => setTraversalMode(m)}
              className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-colors ${traversalMode === m ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {m}
            </button>
          ))}
        </div>
        <div className="bg-gray-800 rounded-lg px-3 py-2 flex-1 min-w-0">
          <span className="text-gray-500 text-xs font-mono mr-2">{traversalMode}:</span>
          <span className="text-cyan-300 font-mono text-xs break-all">{traversalOutput().join(' → ')}</span>
        </div>
      </div>
    </div>
  )
}
