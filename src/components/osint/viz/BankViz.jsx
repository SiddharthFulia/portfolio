// BankViz — fdic.
//
// FDIC BankFind returns { data: [{ data: { NAME, CERT, ADDRESS, CITY, STALP,
// ZIP, ACTIVE } }] }. Yes — data.data is nested. We flatten once and render
// a compact table of matching institutions.

import { HeroLine, Chip, CollapseRawJson } from './_shared.jsx'

export default function BankViz({ data }) {
  const rows = (data?.data || []).map((r) => r.data || r).filter(Boolean)
  return (
    <div>
      <HeroLine
        eyebrow='FDIC BankFind'
        value={`${rows.length} match${rows.length === 1 ? '' : 'es'}`}
        sub='US-insured institutions'
      />
      {rows.length === 0 ? (
        <div className='text-gray-500 text-xs'>No results — try a shorter name fragment or a specific state.</div>
      ) : (
        <div className='overflow-x-auto -mx-2'>
          <table className='w-full min-w-[400px] text-xs'>
            <thead>
              <tr className='text-left text-gray-500 border-b border-white/5'>
                <th className='px-2 py-1.5 font-medium'>Name</th>
                <th className='px-2 py-1.5 font-medium w-16'>Cert</th>
                <th className='px-2 py-1.5 font-medium'>Location</th>
                <th className='px-2 py-1.5 font-medium w-14 text-right'>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((r, i) => (
                <tr key={`${r.CERT || i}`} className='border-b border-white/[0.03]'>
                  <td className='px-2 py-1.5 text-white truncate max-w-[10rem]' title={r.NAME}>{r.NAME}</td>
                  <td className='px-2 py-1.5 font-mono text-gray-400'>{r.CERT}</td>
                  <td className='px-2 py-1.5 text-gray-300'>{r.CITY}, {r.STALP}</td>
                  <td className='px-2 py-1.5 text-right'>
                    {r.ACTIVE ? <Chip tone='emerald'>active</Chip> : <Chip tone='rose'>closed</Chip>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CollapseRawJson data={data} />
    </div>
  )
}
