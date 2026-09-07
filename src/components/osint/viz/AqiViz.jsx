// AqiViz — waqi.
//
// WAQI wraps everything in { status: 'ok', data: { aqi, city: { name }, iaqi: { pm25: {v}, … } } }.
// We render a gauge (0–500) with color zones + a pollutant breakdown grid.

import { HeroLine, Chip, CollapseRawJson } from './_shared.jsx'

function zone(aqi) {
  if (aqi <= 50)  return { label: 'Good',      tone: 'emerald', color: '#10b981' }
  if (aqi <= 100) return { label: 'Moderate',  tone: 'amber',   color: '#f59e0b' }
  if (aqi <= 150) return { label: 'Unhealthy for sensitive', tone: 'amber', color: '#fb923c' }
  if (aqi <= 200) return { label: 'Unhealthy', tone: 'rose',    color: '#ef4444' }
  if (aqi <= 300) return { label: 'Very unhealthy', tone: 'fuchsia', color: '#a855f7' }
  return              { label: 'Hazardous',   tone: 'rose',    color: '#7f1d1d' }
}

export default function AqiViz({ data }) {
  const d = data?.data
  if (!d) {
    return (
      <div>
        <div className='text-gray-500 text-xs'>City not found — try a different slug (e.g. "beijing", "delhi").</div>
        <CollapseRawJson data={data} />
      </div>
    )
  }
  const aqi = d.aqi ?? 0
  const z = zone(aqi)
  const pct = Math.min(100, Math.round((aqi / 300) * 100))
  const pollutants = [
    ['PM2.5', d.iaqi?.pm25?.v],
    ['PM10',  d.iaqi?.pm10?.v],
    ['O₃',    d.iaqi?.o3?.v],
    ['NO₂',   d.iaqi?.no2?.v],
    ['CO',    d.iaqi?.co?.v],
    ['SO₂',   d.iaqi?.so2?.v],
  ].filter(([, v]) => v != null)
  return (
    <div>
      <HeroLine
        eyebrow='Air quality index'
        value={<><span className='text-3xl' style={{ color: z.color }}>{aqi}</span> <span className='text-xs text-gray-400 font-normal'>AQI</span></>}
        sub={d.city?.name}
        right={<Chip tone={z.tone}>{z.label}</Chip>}
      />
      <div className='relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-600 mt-1'>
        <div className='absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-white shadow' style={{ left: `${pct}%` }} />
      </div>
      <div className='flex justify-between text-[9px] text-gray-500 mt-0.5'>
        <span>0</span><span>50</span><span>100</span><span>150</span><span>200</span><span>300+</span>
      </div>
      {pollutants.length > 0 && (
        <div className='grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-3'>
          {pollutants.map(([k, v]) => (
            <div key={k} className='bg-white/[0.03] rounded px-2 py-1'>
              <div className='text-[10px] uppercase tracking-widest text-gray-500'>{k}</div>
              <div className='text-white font-mono text-xs'>{v}</div>
            </div>
          ))}
        </div>
      )}
      <CollapseRawJson data={data} />
    </div>
  )
}
