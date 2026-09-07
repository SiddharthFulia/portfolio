// AsnViz — bgpview (RIPEstat) + peeringdb.
//
// RIPEstat returns { data: { holder, resource, block: { desc, name } } };
// peeringdb returns { data: [{ name, aka, asn, info_type, policy_general, … }] }.
// We branch on the presence of `holder` vs an array with `asn` to figure out
// which one we've got.

import { HeroLine, KV, KVGrid, Chip, CollapseRawJson } from './_shared.jsx'

export default function AsnViz({ data }) {
  if (!data) return null

  // RIPEstat wraps its payload in { data: … } and the tool passes the whole
  // response straight through (no re-wrap on the BE side).
  const ripe = data?.data?.holder ? data.data : null
  const peer = Array.isArray(data?.data) && data.data[0]?.asn ? data.data[0] : null

  if (ripe) {
    return (
      <div>
        <HeroLine
          eyebrow='ASN'
          value={<span className='font-mono'>AS{ripe.resource}</span>}
          sub={ripe.holder}
          right={<Chip tone='amber'>{ripe.announced === 'true' || ripe.announced === true ? 'announced' : 'inactive'}</Chip>}
        />
        <KVGrid>
          <KV label='Block name' value={ripe.block?.name} />
          <KV label='Block desc' value={ripe.block?.desc} />
          <KV label='Type'       value={ripe.type} />
          <KV label='Query time' value={ripe.query_starttime} />
        </KVGrid>
        <CollapseRawJson data={data} />
      </div>
    )
  }

  if (peer) {
    return (
      <div>
        <HeroLine
          eyebrow='ASN'
          value={<span className='font-mono'>AS{peer.asn}</span>}
          sub={peer.name}
          right={peer.aka && <Chip tone='cyan'>aka {peer.aka}</Chip>}
        />
        <KVGrid>
          <KV label='Info type'   value={peer.info_type} />
          <KV label='Policy'      value={peer.policy_general} />
          <KV label='Route servers' value={peer.route_server ? String(peer.route_server) : null} />
          <KV label='Traffic'     value={peer.info_traffic} />
          <KV label='Website'     value={peer.website} />
          <KV label='IRR AS-set'  value={peer.irr_as_set} mono />
        </KVGrid>
        <CollapseRawJson data={data} />
      </div>
    )
  }

  // Unknown shape — show a friendly hint, keep raw JSON collapsible.
  return (
    <div>
      <div className='text-gray-500 text-xs'>No ASN records matched — check the number and try again.</div>
      <CollapseRawJson data={data} />
    </div>
  )
}
