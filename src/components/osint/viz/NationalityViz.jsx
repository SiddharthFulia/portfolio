// NationalityViz — nationalize.
//
// Nationalize returns { name, count, country: [{ country_id, probability }] }.
// We show the top 3 with flag + code + probability bar.

import { flagEmoji, HeroLine, Bar, CollapseRawJson } from './_shared.jsx'

export default function NationalityViz({ data }) {
  if (!data) return null
  const countries = (data.country || []).slice(0, 3)
  const top = countries[0]
  return (
    <div>
      <HeroLine
        eyebrow={`Predicted for “${data.name || '—'}”`}
        value={top ? <>{flagEmoji(top.country_id)} <span className='font-mono'>{top.country_id}</span></> : 'unknown'}
        sub={data.count ? `based on ${data.count.toLocaleString()} samples` : null}
      />
      <div className='space-y-1.5 mt-2'>
        {countries.map((n) => {
          const pct = Math.round((n.probability || 0) * 100)
          return (
            <div key={n.country_id} className='flex items-center gap-2'>
              <span className='w-6 text-lg'>{flagEmoji(n.country_id)}</span>
              <span className='w-8 text-gray-300 text-[11px] font-mono'>{n.country_id}</span>
              <div className='flex-1'><Bar pct={pct} tone='amber' /></div>
              <span className='w-8 text-right text-gray-400 text-[10px] font-mono'>{pct}%</span>
            </div>
          )
        })}
      </div>
      <CollapseRawJson data={data} />
    </div>
  )
}
