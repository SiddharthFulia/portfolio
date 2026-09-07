// ExplanationBlock — long-form writeup, KaTeX-friendly.
//
// Two shapes accepted:
//
//   1. Freeform JSX (the common case):
//      <ExplanationBlock>
//        <p>An <b>array</b> is …</p>
//        <p>Trade-off: <TeX tex="O(n)" /> insert …</p>
//      </ExplanationBlock>
//
//   2. Structured sections:
//      <ExplanationBlock sections={[
//        { title: 'Intuition', body: '…' },
//        { title: 'Steps',     body: ['first', 'second'] },
//      ]} />
//
// Kids-based mode gets an antd `.prose` treatment so <p>, <ul>, <b>,
// <code> all render tastefully without the caller having to style
// every element themselves. Sections mode gets bold section headers
// with the amber underline used throughout the shell.

import { useMemo } from 'react'
import katex from 'katex'

// Render an inline string containing $inline$ / $$block$$ math and
// **bold** / `code` / plain text into JSX. Used only by structured
// `sections` mode; children-JSX mode ships text as-is.
function renderInline(text, keyPrefix = 'x') {
  if (text == null) return null
  const s = String(text)
  const nodes = []
  const blockParts = s.split(/(\$\$[^$]+\$\$)/g)
  blockParts.forEach((bp, i) => {
    if (bp.startsWith('$$') && bp.endsWith('$$')) {
      const tex = bp.slice(2, -2)
      let html = ''
      try { html = katex.renderToString(tex, { displayMode: true, throwOnError: false, output: 'html' }) }
      catch { html = `<code>${tex}</code>` }
      nodes.push(
        <div key={`${keyPrefix}-b${i}`} className="my-3 text-amber-100 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
      )
      return
    }
    const parts = bp.split(/(\$[^$\n]+\$|\*\*[^*]+\*\*|`[^`]+`)/g)
    parts.forEach((p, j) => {
      if (!p) return
      const k = `${keyPrefix}-${i}-${j}`
      if (p.startsWith('$') && p.endsWith('$') && p.length >= 2) {
        const tex = p.slice(1, -1)
        let html = ''
        try { html = katex.renderToString(tex, { throwOnError: false, output: 'html' }) } catch { html = tex }
        nodes.push(<span key={k} className="text-amber-200" dangerouslySetInnerHTML={{ __html: html }} />)
      } else if (p.startsWith('**') && p.endsWith('**')) {
        nodes.push(<strong key={k} className="text-white font-bold">{p.slice(2, -2)}</strong>)
      } else if (p.startsWith('`') && p.endsWith('`')) {
        nodes.push(
          <code key={k} className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-cyan-200 text-[0.92em] font-mono">
            {p.slice(1, -1)}
          </code>
        )
      } else {
        nodes.push(<span key={k}>{p}</span>)
      }
    })
  })
  return nodes
}

function SectionBody({ body }) {
  if (Array.isArray(body)) {
    return (
      <ol className="list-decimal ml-5 space-y-1.5 text-gray-300 marker:text-amber-400 marker:font-bold">
        {body.map((item, i) => (
          <li key={i} className="leading-relaxed">{renderInline(item, `li${i}`)}</li>
        ))}
      </ol>
    )
  }
  const paras = String(body ?? '').split(/\n{2,}/)
  return (
    <div className="space-y-2.5 text-gray-300 leading-relaxed">
      {paras.map((p, i) => (
        <p key={i}>{renderInline(p, `p${i}`)}</p>
      ))}
    </div>
  )
}

export default function ExplanationBlock({ sections, children, title = 'How it works', className = '' }) {
  const list = useMemo(() => sections || [], [sections])

  return (
    <section
      className={`luxe-card rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6 ${className}`}
      aria-label={title}
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-white">{title}</h2>
        <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Explainer</span>
      </div>

      {children && (
        <div className="algorithms-prose text-gray-300 leading-relaxed space-y-3">
          {children}
        </div>
      )}

      {list.length > 0 && (
        <div className={`space-y-5 ${children ? 'mt-5' : ''}`}>
          {list.map((s, i) => (
            <div key={i}>
              <h3 className="text-[12px] uppercase tracking-[0.18em] font-bold text-amber-300 mb-1.5">
                {s.title}
              </h3>
              <SectionBody body={s.body} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// <TeX tex="\sqrt{N}" />  or  <TeX>\sqrt{N}</TeX>  · both work.
// `block={true}` renders in displayMode.
export function TeX({ tex, children, block = false, className = '' }) {
  const src = tex ?? (typeof children === 'string' ? children : '')
  const html = useMemo(() => {
    try {
      return katex.renderToString(String(src ?? ''), { displayMode: block, throwOnError: false, output: 'html' })
    } catch {
      return String(src ?? '')
    }
  }, [src, block])
  const Tag = block ? 'div' : 'span'
  return (
    <Tag
      className={`${block ? 'my-2 overflow-x-auto text-amber-100' : 'text-amber-200 mx-0.5'} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
