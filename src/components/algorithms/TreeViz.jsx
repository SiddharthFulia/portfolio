// TreeViz — SVG binary/n-ary tree renderer.
//
// Feeds:
//   root  — recursive { id, label, state?, left?, right?, children?, meta? }
//   width/height — SVG canvas
//   nodeRadius   — circle radius (default 20)
//
// Renders a Reingold–Tilford-style tidy layout for binary trees, or a
// simple children-array layout when the tree is n-ary. Nodes animate
// between positions on structural changes via Framer Motion.
//
// Great for: BST · AVL · Red-Black · Splay · Heap · Segment · Fenwick ·
// Trie · Topological/DAG snapshots.

import { motion, useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'

export const TREE_NODE_COLORS = {
  idle:      { fill: '#111827', stroke: '#374151',       text: '#e5e7eb' },
  visiting:  { fill: '#78350f', stroke: '#f59e0b',       text: '#fde68a' },
  visited:   { fill: '#3b0764', stroke: '#a78bfa',       text: '#ede9fe' },
  inserted:  { fill: '#064e3b', stroke: '#34d399',       text: '#d1fae5' },
  deleted:   { fill: '#450a0a', stroke: '#f87171',       text: '#fecaca' },
  rotating:  { fill: '#831843', stroke: '#f472b6',       text: '#fce7f3' },
  target:    { fill: '#0e7490', stroke: '#22d3ee',       text: '#cffafe' },
  red:       { fill: '#7f1d1d', stroke: '#ef4444',       text: '#fee2e2' },
  black:     { fill: '#0b0b0f', stroke: '#e5e7eb',       text: '#f9fafb' },
  found:     { fill: '#065f46', stroke: '#22d3ee',       text: '#cffafe' },
}

// Reingold–Tilford tidy layout for a strictly binary tree.
// Returns a Map<nodeId, { x, y }>.
function tidyLayout(root, xUnit, yUnit) {
  const positions = new Map()
  if (!root) return positions
  // Compute per-node subtree extents.
  let nextX = 0
  function firstWalk(node, depth) {
    if (!node) return
    firstWalk(node.left, depth + 1)
    firstWalk(node.right, depth + 1)
    const leftX = node.left ? positions.get(node.left.id).x : null
    const rightX = node.right ? positions.get(node.right.id).x : null
    let x
    if (leftX != null && rightX != null) x = (leftX + rightX) / 2
    else if (leftX != null) x = leftX + xUnit
    else if (rightX != null) x = rightX - xUnit
    else { x = nextX; nextX += xUnit }
    positions.set(node.id, { x, y: depth * yUnit })
  }
  firstWalk(root, 0)
  return positions
}

// N-ary layout — width per subtree is proportional to its leaf count.
function naryLayout(root, xUnit, yUnit) {
  const positions = new Map()
  if (!root) return positions
  function leafCount(n) {
    if (!n) return 0
    if (!n.children || n.children.length === 0) return 1
    return n.children.reduce((a, c) => a + leafCount(c), 0)
  }
  function walk(n, depth, xStart) {
    if (!n) return
    const w = leafCount(n) * xUnit
    const cx = xStart + w / 2
    positions.set(n.id, { x: cx, y: depth * yUnit })
    if (!n.children || !n.children.length) return
    let cursor = xStart
    for (const c of n.children) {
      const cw = leafCount(c) * xUnit
      walk(c, depth + 1, cursor)
      cursor += cw
    }
  }
  walk(root, 0, 0)
  return positions
}

function flatten(root, positions, isBinary) {
  const nodes = []
  const edges = []
  function walk(n) {
    if (!n) return
    const p = positions.get(n.id)
    nodes.push({ ...n, x: p.x, y: p.y })
    if (isBinary) {
      if (n.left)  { edges.push({ from: n.id, to: n.left.id  }); walk(n.left)  }
      if (n.right) { edges.push({ from: n.id, to: n.right.id }); walk(n.right) }
    } else if (n.children) {
      for (const c of n.children) { edges.push({ from: n.id, to: c.id }); walk(c) }
    }
  }
  walk(root)
  return { nodes, edges }
}

export default function TreeViz({
  root,
  width = 640,
  height = 360,
  nodeRadius = 20,
  xUnit = 44,
  yUnit = 70,
  title,
  legend,
  emptyLabel = 'Tree is empty — insert a node.',
  className = '',
}) {
  const reduce = useReducedMotion()

  const isBinary = useMemo(() => {
    if (!root) return true
    function hasChildren(n) {
      if (!n) return false
      if (Array.isArray(n.children) && n.children.length) return true
      return hasChildren(n.left) || hasChildren(n.right)
    }
    function hasBinary(n) {
      if (!n) return false
      if (n.left != null || n.right != null) return true
      return hasBinary(n.left) || hasBinary(n.right) ||
             (n.children ? n.children.some(hasBinary) : false)
    }
    return hasBinary(root) || !hasChildren(root)
  }, [root])

  const { positions, geom } = useMemo(() => {
    if (!root) return { positions: new Map(), geom: null }
    const p = isBinary ? tidyLayout(root, xUnit, yUnit) : naryLayout(root, xUnit, yUnit)
    // Normalize: shift so min-x = padding, then scale to fit width.
    if (p.size === 0) return { positions: p, geom: null }
    const xs = [...p.values()].map(v => v.x)
    const ys = [...p.values()].map(v => v.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const contentW = Math.max(1, maxX - minX)
    const contentH = Math.max(1, maxY - minY)
    const pad = nodeRadius + 12
    const scaleX = (width - pad * 2) / contentW
    const scaleY = (height - pad * 2) / Math.max(contentH, 1)
    const scale = Math.min(scaleX, scaleY, 1)
    const off = { x: pad - minX * scale + (width - pad * 2 - contentW * scale) / 2, y: pad - minY * scale }
    const out = new Map()
    for (const [k, v] of p.entries()) {
      out.set(k, { x: v.x * scale + off.x, y: v.y * scale + off.y })
    }
    return { positions: out, geom: { scale, off } }
  }, [root, isBinary, xUnit, yUnit, width, height, nodeRadius])

  const { nodes, edges } = useMemo(() => {
    if (!root || positions.size === 0) return { nodes: [], edges: [] }
    return flatten(root, positions, isBinary)
  }, [root, positions, isBinary])

  return (
    <div className={`luxe-card rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 ${className}`}>
      {(title || legend) && (
        <div className="flex items-center justify-between mb-3">
          {title && <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-white">{title}</p>}
          {legend && <div className="text-[10px] font-mono text-gray-500">{legend}</div>}
        </div>
      )}
      {!root ? (
        <p className="text-sm text-gray-500 italic py-6 text-center">{emptyLabel}</p>
      ) : (
        <div
          className="rounded-lg overflow-hidden bg-[#0a0a0e]/60 border border-white/5"
          style={{ width: '100%', maxWidth: width, aspectRatio: `${width}/${height}` }}
        >
          <svg viewBox={`0 0 ${width} ${height}`} className="block w-full h-auto" role="img" aria-label="Tree visualisation">
            {edges.map((e, i) => {
              const a = nodes.find(n => n.id === e.from)
              const b = nodes.find(n => n.id === e.to)
              if (!a || !b) return null
              return (
                <motion.line
                  key={`e-${e.from}-${e.to}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="#374151" strokeWidth={1.6}
                  initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: reduce ? 0 : 0.4 }}
                />
              )
            })}
            {nodes.map((n) => {
              const s = TREE_NODE_COLORS[n.state] || TREE_NODE_COLORS.idle
              return (
                <motion.g
                  key={n.id}
                  initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1, x: n.x, y: n.y }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  style={{ x: n.x, y: n.y }}
                >
                  <circle r={nodeRadius} fill={s.fill} stroke={s.stroke} strokeWidth={2} />
                  <text
                    textAnchor="middle" dominantBaseline="central"
                    fill={s.text} fontFamily="ui-sans-serif, system-ui"
                    fontSize={12} fontWeight={700}
                  >
                    {n.label ?? n.id}
                  </text>
                  {n.meta != null && (
                    <text
                      y={nodeRadius + 12}
                      textAnchor="middle" fill="#94a3b8"
                      fontFamily="ui-monospace, SFMono-Regular, monospace" fontSize={10}
                    >
                      {String(n.meta)}
                    </text>
                  )}
                </motion.g>
              )
            })}
          </svg>
        </div>
      )}
    </div>
  )
}
