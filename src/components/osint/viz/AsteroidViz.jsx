// AsteroidViz — nasa-neo.
//
// NASA NEO feed returns { near_earth_objects: { 'YYYY-MM-DD': [{ … }] } }.
// We collect all objects for the queried date(s), sort by miss distance
// ascending, and render a grid of cards.

import { HeroLine, Chip, CollapseRawJson } from './_shared.jsx'

function pluckNeos(data) {
  const buckets = data?.near_earth_objects || {}
  const out = []
  for (const day of Object.keys(buckets)) {
    for (const a of buckets[day]) out.push({ ...a, _day: day })
  }
  return out.sort((a, b) => {
    const am = +(a.close_approach_data?.[0]?.miss_distance?.kilometers || Infinity)
    const bm = +(b.close_approach_data?.[0]?.miss_distance?.kilometers || Infinity)
    return am - bm
  })
}

function fmtKm(km) {
  const n = +km
  if (!Number.isFinite(n)) return '—'
  if (n > 1e6) return `${(n / 1e6).toFixed(2)}M km`
  if (n > 1e3) return `${(n / 1e3).toFixed(1)}k km`
  return `${n.toFixed(0)} km`
}

export default function AsteroidViz({ data }) {
  const neos = pluckNeos(data)
  return (
    <div>
      <HeroLine
        eyebrow='Near-Earth objects'
        value={`${neos.length} tracked`}
        sub={data?.element_count != null ? `${data.element_count} total across window` : null}
        right={<Chip tone='amber'>NASA JPL</Chip>}
      />
      {neos.length === 0 ? (
        <div className='text-gray-500 text-xs'>No asteroids logged for that date.</div>
      ) : (
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
          {neos.slice(0, 6).map((a) => {
            const dia = a.estimated_diameter?.meters
            const diaAvg = dia ? Math.round((dia.estimated_diameter_min + dia.estimated_diameter_max) / 2) : null
            const miss = a.close_approach_data?.[0]?.miss_distance?.kilometers
            const vel = a.close_approach_data?.[0]?.relative_velocity?.kilometers_per_hour
            return (
              <div key={a.id} className='bg-white/[0.03] rounded-lg p-2 border border-white/5'>
                <div className='flex items-start justify-between gap-1 mb-1'>
                  <span className='text-white text-xs font-bold truncate' title={a.name}>{a.name}</span>
                  {a.is_potentially_hazardous_asteroid && <Chip tone='rose'>hazard</Chip>}
                </div>
                <div className='grid grid-cols-3 gap-1 text-[10px]'>
                  <div><span className='text-gray-500'>size</span><br /><span className='text-white'>{diaAvg ? `${diaAvg}m` : '—'}</span></div>
                  <div><span className='text-gray-500'>miss</span><br /><span className='text-white'>{fmtKm(miss)}</span></div>
                  <div><span className='text-gray-500'>speed</span><br /><span className='text-white'>{vel ? `${Math.round(+vel).toLocaleString()} km/h` : '—'}</span></div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <CollapseRawJson data={data} />
    </div>
  )
}
