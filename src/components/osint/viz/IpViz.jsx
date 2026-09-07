// IpViz — used by ipwho, ipapi-lite, ipify.
//
// The three upstreams have wildly different shapes so we normalise into a
// single { ip, country, countryCode, city, region, isp, org, asn, lat, lng }
// shape before rendering. That keeps the viz body clean and lets the raw JSON
// footer still expose the untouched payload for anyone who wants it.

import { flagEmoji, KV, KVGrid, HeroLine, Chip, MiniWorldMap, CollapseRawJson } from './_shared.jsx'

function normalise(d) {
  if (!d) return null
  // ipify → { ip }
  if (Object.keys(d).length === 1 && d.ip) return { ip: d.ip }
  // ipwho.is → success + { ip, country, country_code, city, region, connection: {…} }
  if ('country_code' in d || 'connection' in d) {
    return {
      ip: d.ip,
      country: d.country,
      countryCode: d.country_code,
      city: d.city,
      region: d.region,
      isp: d.connection?.isp,
      org: d.connection?.org,
      asn: d.connection?.asn ? `AS${d.connection.asn}` : null,
      lat: d.latitude,
      lng: d.longitude,
      tz: d.timezone?.id,
    }
  }
  // ipapi.co → { ip, country_name, country_code, city, region, org, asn }
  return {
    ip: d.ip,
    country: d.country_name,
    countryCode: d.country_code,
    city: d.city,
    region: d.region,
    isp: d.org,
    org: d.org,
    asn: d.asn,
    lat: d.latitude,
    lng: d.longitude,
    tz: d.timezone,
  }
}

export default function IpViz({ data }) {
  const n = normalise(data)
  if (!n) return null

  return (
    <div>
      <div className='flex flex-col md:flex-row gap-3'>
        <div className='flex-1 min-w-0'>
          <HeroLine
            eyebrow='IP address'
            value={<span className='font-mono'>{n.ip || '—'}</span>}
            sub={n.country ? `${flagEmoji(n.countryCode)} ${n.country}` : null}
            right={n.asn && <Chip tone='amber'>{n.asn}</Chip>}
          />
          <KVGrid>
            <KV label='City'     value={n.city} />
            <KV label='Region'   value={n.region} />
            <KV label='ISP'      value={n.isp} />
            <KV label='Org'      value={n.org} />
            <KV label='Coords'   value={n.lat != null ? `${(+n.lat).toFixed(3)}, ${(+n.lng).toFixed(3)}` : null} mono />
            <KV label='Timezone' value={n.tz} />
          </KVGrid>
        </div>
        {(n.lat != null || n.lng != null) && (
          <div className='md:w-1/2 rounded-lg overflow-hidden border border-white/5'>
            <MiniWorldMap lat={+n.lat} lng={+n.lng} />
          </div>
        )}
      </div>
      <CollapseRawJson data={data} />
    </div>
  )
}
