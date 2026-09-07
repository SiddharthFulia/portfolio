// GraphViz — canvas-based coloured graph.
//
// One shared renderer for BFS / DFS / Dijkstra / Bellman / Floyd /
// MST / Topo / Convex Hull. Sibling agents drive it by passing:
//
//   nodes  — [{ id, x, y, label?, state?, meta? }]
//   edges  — [{ from, to, weight?, directed?, state? }]
//   width  — canvas logical width  (default 640)
//   height — canvas logical height (default 400)
//   layout — 'preset' | 'spring' — 'spring' runs a tiny force-directed
//            step for a few frames on mount to spread unpositioned nodes.
//
// State keys map through NODE_COLORS / EDGE_COLORS below. Everything
// else is layout + labels.
//
// The canvas is drawn at device pixel ratio so it stays sharp on hi-dpi
// laptops. Hit-testing on hover surfaces the node's meta as a floating
// tooltip. Respects `prefers-reduced-motion` — no shimmer, no hue-shift.

import { useEffect, useRef, useState } from 'react'

export const NODE_COLORS = {
  idle:      { fill: '#1f2937', stroke: '#374151',       text: '#e5e7eb' },
  frontier:  { fill: '#7c2d12', stroke: '#f59e0b',       text: '#fde68a' },
  visited:   { fill: '#4c1d95', stroke: '#a78bfa',       text: '#ede9fe' },
  current:   { fill: '#831843', stroke: '#f472b6',       text: '#fce7f3' },
  source:    { fill: '#065f46', stroke: '#34d399',       text: '#d1fae5' },
  target:    { fill: '#7f1d1d', stroke: '#f87171',       text: '#fee2e2' },
  found:     { fill: '#0e7490', stroke: '#22d3ee',       text: '#cffafe' },
  disabled:  { fill: '#0b0b0f', stroke: '#1f2937',       text: '#4b5563' },
}

export const EDGE_COLORS = {
  idle:      { stroke: '#374151', width: 1.5, alpha: 0.7 },
  candidate: { stroke: '#f59e0b', width: 2,   alpha: 0.9 },
  active:    { stroke: '#f472b6', width: 2.5, alpha: 1   },
  tree:      { stroke: '#34d399', width: 2.5, alpha: 1   },
  relaxed:   { stroke: '#22d3ee', width: 2.5, alpha: 1   },
  cut:       { stroke: '#7f1d1d', width: 1,   alpha: 0.35 },
}

function computeSpring(nodes, edges, width, height) {
  // Cheap Fruchterman-Reingold — 60 iterations. Deterministic seed so
  // the layout is stable across renders.
  const N = nodes.length
  if (!N) return nodes
  const area = width * height
  const k = Math.sqrt(area / Math.max(N, 1))
  const pos = nodes.map((n, i) => ({
    x: n.x != null ? n.x : width / 2 + Math.cos(i) * (30 + i * 3),
    y: n.y != null ? n.y : height / 2 + Math.sin(i) * (30 + i * 3),
  }))
  for (let it = 0; it < 60; it++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }))
    // Repulsion
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j) continue
        const dx = pos[i].x - pos[j].x
        const dy = pos[i].y - pos[j].y
        const dist = Math.hypot(dx, dy) || 0.01
        const f = (k * k) / dist
        disp[i].x += (dx / dist) * f
        disp[i].y += (dy / dist) * f
      }
    }
    // Attraction
    for (const e of edges) {
      const a = nodes.findIndex((n) => n.id === e.from)
      const b = nodes.findIndex((n) => n.id === e.to)
      if (a < 0 || b < 0) continue
      const dx = pos[a].x - pos[b].x
      const dy = pos[a].y - pos[b].y
      const dist = Math.hypot(dx, dy) || 0.01
      const f = (dist * dist) / k
      disp[a].x -= (dx / dist) * f
      disp[a].y -= (dy / dist) * f
      disp[b].x += (dx / dist) * f
      disp[b].y += (dy / dist) * f
    }
    const t = Math.max(1, 20 - it * 0.3)
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(disp[i].x, disp[i].y) || 0.01
      pos[i].x += (disp[i].x / d) * Math.min(d, t)
      pos[i].y += (disp[i].y / d) * Math.min(d, t)
      pos[i].x = Math.max(30, Math.min(width - 30, pos[i].x))
      pos[i].y = Math.max(30, Math.min(height - 30, pos[i].y))
    }
  }
  return nodes.map((n, i) => ({ ...n, x: pos[i].x, y: pos[i].y }))
}

export default function GraphViz({
  nodes = [],
  edges = [],
  width = 640,
  height = 400,
  layout = 'preset',
  radius = 18,
  title,
  legend,
  className = '',
  showWeights = true,
}) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const [placed, setPlaced] = useState(nodes)

  // Recompute spring layout only when we have to. If the caller supplies
  // coords on every node OR opts into 'preset', we skip the physics.
  useEffect(() => {
    const needsSpring = layout === 'spring' && nodes.some((n) => n.x == null || n.y == null)
    setPlaced(needsSpring ? computeSpring(nodes, edges, width, height) : nodes)
  }, [nodes, edges, width, height, layout])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    // Edges first so nodes sit above them
    for (const e of edges) {
      const a = placed.find((n) => n.id === e.from)
      const b = placed.find((n) => n.id === e.to)
      if (!a || !b) continue
      const s = EDGE_COLORS[e.state] || EDGE_COLORS.idle
      ctx.globalAlpha = s.alpha
      ctx.strokeStyle = s.stroke
      ctx.lineWidth = s.width
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      // Arrowhead for directed edges
      if (e.directed) {
        const ang = Math.atan2(b.y - a.y, b.x - a.x)
        const tipX = b.x - Math.cos(ang) * (radius + 2)
        const tipY = b.y - Math.sin(ang) * (radius + 2)
        const head = 8
        ctx.beginPath()
        ctx.moveTo(tipX, tipY)
        ctx.lineTo(tipX - Math.cos(ang - Math.PI / 7) * head, tipY - Math.sin(ang - Math.PI / 7) * head)
        ctx.lineTo(tipX - Math.cos(ang + Math.PI / 7) * head, tipY - Math.sin(ang + Math.PI / 7) * head)
        ctx.closePath()
        ctx.fillStyle = s.stroke
        ctx.fill()
      }
      // Weight label
      if (showWeights && e.weight != null) {
        ctx.globalAlpha = 1
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        ctx.font = '600 11px ui-monospace, SFMono-Regular, monospace'
        const text = String(e.weight)
        const w = ctx.measureText(text).width + 8
        ctx.fillStyle = 'rgba(10,10,14,0.9)'
        ctx.fillRect(mx - w / 2, my - 8, w, 16)
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'
        ctx.lineWidth = 1
        ctx.strokeRect(mx - w / 2, my - 8, w, 16)
        ctx.fillStyle = '#fde68a'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, mx, my)
      }
      ctx.globalAlpha = 1
    }

    // Nodes
    for (const n of placed) {
      const s = NODE_COLORS[n.state] || NODE_COLORS.idle
      ctx.beginPath()
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = s.fill
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = s.stroke
      ctx.stroke()
      ctx.fillStyle = s.text
      ctx.font = '700 12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(n.label ?? n.id), n.x, n.y)
    }
  }, [placed, edges, width, height, radius, showWeights])

  const onMove = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const hit = placed.find((n) => Math.hypot(n.x - px, n.y - py) < radius + 2)
    if (hit) setTooltip({ x: px, y: py, node: hit })
    else setTooltip(null)
  }

  return (
    <div className={`luxe-card rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 ${className}`}>
      {(title || legend) && (
        <div className="flex items-center justify-between mb-3">
          {title && <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-white">{title}</p>}
          {legend && <div className="text-[10px] font-mono text-gray-500">{legend}</div>}
        </div>
      )}
      <div
        ref={wrapRef}
        className="relative rounded-lg overflow-hidden bg-[#0a0a0e]/60 border border-white/5"
        style={{ width: '100%', maxWidth: width, aspectRatio: `${width}/${height}` }}
        onMouseMove={onMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <canvas ref={canvasRef} className="block max-w-full h-auto" />
        {tooltip && (
          <div
            className="absolute z-10 pointer-events-none px-2 py-1 rounded-md bg-black/90 border border-white/10 text-[11px] text-white font-mono whitespace-nowrap"
            style={{ left: Math.min(tooltip.x + 12, width - 100), top: Math.max(0, tooltip.y - 28) }}
          >
            {tooltip.node.label ?? tooltip.node.id}
            {tooltip.node.meta != null && (
              <span className="text-amber-300"> · {String(tooltip.node.meta)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
