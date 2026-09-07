// FxViz — exchangerate.
//
// Frankfurter returns { amount, base, date, rates: { EUR: 0.92, … } }. If only
// one target was requested, we render a hero conversion line. Otherwise we
// show a compact table of the top 6 rates.

import { HeroLine, Chip, CollapseRawJson } from './_shared.jsx'

export default function FxViz({ data }) {
  if (!data?.rates) return null
  const rates = Object.entries(data.rates)
  const single = rates.length === 1
  const base = data.base || 'USD'
  return (
    <div>
      <HeroLine
        eyebrow='FX rate'
        value={single
          ? <span className='font-mono'>1 {base} = {rates[0][1].toFixed(4)} {rates[0][0]}</span>
          : <span>{base} → {rates.length} currencies</span>}
        sub={data.date ? `as of ${data.date}` : null}
        right={<Chip tone='amber'>ECB</Chip>}
      />
      {!single && (
        <div className='grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-2'>
          {rates.slice(0, 12).map(([code, val]) => (
            <div key={code} className='bg-white/[0.03] rounded px-2 py-1.5'>
              <div className='text-[10px] uppercase tracking-widest text-gray-500'>{code}</div>
              <div className='text-white font-mono text-sm'>{val.toFixed(4)}</div>
            </div>
          ))}
        </div>
      )}
      <div className='text-[10px] text-gray-500 mt-2'>Daily rates published by the European Central Bank.</div>
      <CollapseRawJson data={data} />
    </div>
  )
}
