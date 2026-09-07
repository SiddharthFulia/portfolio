// RealWorldCard — where the algorithm shows up in production.
//
// Two shapes accepted:
//
//   1. Freeform JSX (the common case):
//      <RealWorldCard>
//        <p>Every language's dynamic array — Python's <code>list</code>…</p>
//      </RealWorldCard>
//
//   2. Structured `items` prop for a small grid of cards:
//      <RealWorldCard items={[{ title, org, blurb, tag, href }]} />

const ACCENT_MAP = {
  amber:   { chip: 'bg-amber-500/15 text-amber-300 border-amber-400/30',   ring: 'hover:border-amber-400/40' },
  cyan:    { chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30',      ring: 'hover:border-cyan-400/40' },
  rose:    { chip: 'bg-rose-500/15 text-rose-300 border-rose-400/30',      ring: 'hover:border-rose-400/40' },
  fuchsia: { chip: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/30', ring: 'hover:border-fuchsia-400/40' },
  emerald: { chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30', ring: 'hover:border-emerald-400/40' },
  violet:  { chip: 'bg-violet-500/15 text-violet-300 border-violet-400/30', ring: 'hover:border-violet-400/40' },
}

export default function RealWorldCard({
  items,
  children,
  title = 'Where you see it',
  accent = 'amber',
  className = '',
}) {
  const a = ACCENT_MAP[accent] || ACCENT_MAP.amber
  const hasItems = Array.isArray(items) && items.length > 0
  if (!hasItems && !children) return null

  return (
    <section
      className={`luxe-card rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 ${className}`}
      aria-label={title}
    >
      <div className="flex items-baseline justify-between mb-4 pb-2 border-b border-white/[0.06]">
        <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-amber-300/90">Real world</p>
        <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500">{title}</span>
      </div>

      {children && (
        <div className="algorithms-prose text-gray-300 leading-relaxed space-y-3">
          {children}
        </div>
      )}

      {hasItems && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${children ? 'mt-5' : ''}`}>
          {items.map((it, i) => {
            const Wrapper = it.href ? 'a' : 'div'
            const linkProps = it.href ? { href: it.href, target: '_blank', rel: 'noreferrer noopener' } : {}
            return (
              <Wrapper
                key={i}
                {...linkProps}
                className={`group block rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors ${a.ring} ${it.href ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-[13px] font-bold text-white leading-tight">{it.title}</p>
                  {it.tag && (
                    <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${a.chip}`}>
                      {it.tag}
                    </span>
                  )}
                </div>
                {it.org && (
                  <p className="text-[11px] font-mono text-gray-500 mb-1.5">{it.org}</p>
                )}
                <p className="text-[12.5px] text-gray-400 leading-snug">{it.blurb}</p>
                {it.href && (
                  <p className="mt-2 text-[10px] font-mono text-gray-600 group-hover:text-gray-300 transition-colors">
                    open reference →
                  </p>
                )}
              </Wrapper>
            )
          })}
        </div>
      )}
    </section>
  )
}
