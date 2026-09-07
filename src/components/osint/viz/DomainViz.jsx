// DomainViz — rdap + dnslytics.
//
// RDAP payloads are notoriously chunky (RFC 9083). We pull just the fields
// people actually stare at: registrar, dates, DNSSEC, nameservers. dnslytics
// is dramatically simpler — an IP→ASN block, so we branch off `asn`.

import { HeroLine, KV, KVGrid, Chip, CollapseRawJson } from './_shared.jsx'

function extractRdap(d) {
  if (!d || !d.ldhName) return null
  const events = d.events || []
  const findEvent = (kind) => events.find((e) => e.eventAction === kind)?.eventDate
  const registrar = (d.entities || [])
    .find((e) => (e.roles || []).includes('registrar'))
    ?.vcardArray?.[1]?.find?.((v) => v[0] === 'fn')?.[3]
  const ns = (d.nameservers || []).map((n) => n.ldhName).filter(Boolean)
  const dnssec = d.secureDNS?.delegationSigned ?? null
  return {
    name: d.ldhName,
    registrar,
    created: findEvent('registration'),
    expires: findEvent('expiration'),
    updated: findEvent('last changed'),
    dnssec,
    ns,
    status: (d.status || []).slice(0, 3).join(' · '),
  }
}

export default function DomainViz({ data }) {
  if (!data) return null

  // dnslytics free tier returns { data: { asn, ip, network, country, isp } }.
  if (data?.data?.asn && !data?.ldhName) {
    const d = data.data
    return (
      <div>
        <HeroLine
          eyebrow='IP → ASN'
          value={<span className='font-mono'>{d.ip}</span>}
          sub={d.isp}
          right={<Chip tone='amber'>AS{d.asn}</Chip>}
        />
        <KVGrid>
          <KV label='Country' value={d.country} />
          <KV label='Network' value={d.network} mono />
          <KV label='Reverse' value={d.reverse} mono />
          <KV label='Type'    value={d.type} />
        </KVGrid>
        <CollapseRawJson data={data} />
      </div>
    )
  }

  const r = extractRdap(data)
  if (!r) {
    return (
      <div>
        <div className='text-gray-500 text-xs'>Unrecognised RDAP shape — check the domain.</div>
        <CollapseRawJson data={data} />
      </div>
    )
  }

  const fmtDate = (s) => s ? new Date(s).toLocaleDateString() : null

  return (
    <div>
      <HeroLine
        eyebrow='Domain'
        value={<span className='font-mono'>{r.name}</span>}
        sub={r.registrar || r.status}
        right={r.dnssec ? <Chip tone='emerald'>DNSSEC on</Chip> : <Chip tone='gray'>no DNSSEC</Chip>}
      />
      <KVGrid>
        <KV label='Registered' value={fmtDate(r.created)} />
        <KV label='Expires'    value={fmtDate(r.expires)} />
        <KV label='Updated'    value={fmtDate(r.updated)} />
        <KV label='Status'     value={r.status} />
      </KVGrid>
      {r.ns.length > 0 && (
        <div className='mt-2'>
          <div className='text-gray-500 text-[10px] uppercase tracking-widest font-bold mb-1'>Nameservers</div>
          <div className='flex flex-wrap gap-1'>
            {r.ns.slice(0, 6).map((n) => (
              <span key={n} className='text-[10px] font-mono text-cyan-200 bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 rounded'>
                {n.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      )}
      <CollapseRawJson data={data} />
    </div>
  )
}
