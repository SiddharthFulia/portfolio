// LocationViz — nominatim.
//
// Returns an array of { display_name, lat, lon, address: { country_code, city, road, … } }.
// We take the top hit and drop a pulse on the mini world map.

import { flagEmoji, HeroLine, KV, KVGrid, MiniWorldMap, CollapseRawJson } from './_shared.jsx'

export default function LocationViz({ data }) {
  const top = Array.isArray(data) ? data[0] : null
  if (!top) {
    return (
      <div>
        <div className='text-gray-500 text-xs'>No results — try a broader place name.</div>
        <CollapseRawJson data={data} />
      </div>
    )
  }
  const addr = top.address || {}
  const cc = (addr.country_code || '').toUpperCase()
  return (
    <div>
      <HeroLine
        eyebrow='Location'
        value={top.name || addr.city || addr.town || addr.village || top.display_name}
        sub={<span className='truncate inline-block max-w-full'>{cc && flagEmoji(cc)} {top.display_name}</span>}
      />
      <div className='flex flex-col md:flex-row gap-3'>
        <div className='flex-1'>
          <KVGrid>
            <KV label='Type'    value={top.type} />
            <KV label='Class'   value={top.class} />
            <KV label='Country' value={addr.country} />
            <KV label='Region'  value={addr.state || addr.region} />
            <KV label='Lat'     value={(+top.lat).toFixed(5)} mono />
            <KV label='Lng'     value={(+top.lon).toFixed(5)} mono />
          </KVGrid>
        </div>
        <div className='md:w-1/2 rounded-lg overflow-hidden border border-white/5'>
          <MiniWorldMap lat={+top.lat} lng={+top.lon} />
        </div>
      </div>
      <CollapseRawJson data={data} />
    </div>
  )
}
