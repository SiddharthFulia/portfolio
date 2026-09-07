// CryptoViz — coingecko.
//
// The full /coins/:id payload is huge. We surface the essentials: name, symbol,
// current USD price, 24h change, market cap, volume, rank + a sparkline if
// `market_data.sparkline_7d.price` is present (only when `sparkline=true` was
// requested — most calls won't include it, so we gracefully skip).

import { HeroLine, KV, KVGrid, Chip, CollapseRawJson } from './_shared.jsx'

function fmt(n, opts = {}) {
  if (n == null || Number.isNaN(+n)) return null
  return (+n).toLocaleString(undefined, { maximumFractionDigits: opts.digits ?? 2 })
}

function Spark({ points }) {
  if (!points || points.length < 2) return null
  const w = 160, h = 40
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const step = w / (points.length - 1)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - ((p - min) / range) * h}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className='w-full h-10' preserveAspectRatio='none'>
      <path d={d} stroke='#fbbf24' strokeWidth='1.5' fill='none' vectorEffect='non-scaling-stroke' />
    </svg>
  )
}

export default function CryptoViz({ data }) {
  if (!data) return null
  const md = data.market_data || {}
  const price = md.current_price?.usd
  const change24 = md.price_change_percentage_24h
  const positive = (change24 ?? 0) >= 0
  const spark = md.sparkline_7d?.price
  return (
    <div>
      <HeroLine
        eyebrow={data.symbol ? data.symbol.toUpperCase() : 'Coin'}
        value={<span className='truncate'>{data.name || '—'}</span>}
        sub={data.market_cap_rank != null ? `Rank #${data.market_cap_rank}` : null}
        right={<Chip tone={positive ? 'emerald' : 'rose'}>{change24 != null ? `${positive ? '+' : ''}${change24.toFixed(2)}%` : '—'}</Chip>}
      />
      <div className='flex items-baseline gap-2 mb-2'>
        <span className='text-3xl font-bold text-white'>${fmt(price, { digits: price > 1 ? 2 : 6 })}</span>
        <span className='text-[10px] uppercase tracking-widest text-gray-500'>USD</span>
      </div>
      {spark && <Spark points={spark} />}
      <KVGrid>
        <KV label='Market cap' value={md.market_cap?.usd != null ? `$${fmt(md.market_cap.usd)}` : null} />
        <KV label='Volume 24h' value={md.total_volume?.usd != null ? `$${fmt(md.total_volume.usd)}` : null} />
        <KV label='All-time high' value={md.ath?.usd != null ? `$${fmt(md.ath.usd, { digits: 2 })}` : null} />
        <KV label='Circulating'  value={md.circulating_supply != null ? fmt(md.circulating_supply, { digits: 0 }) : null} />
      </KVGrid>
      <CollapseRawJson data={data} />
    </div>
  )
}
