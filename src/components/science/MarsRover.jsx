// MarsRover — the historical Mars Rover Photos API was retired by NASA in
// 2022. Rather than showing a broken feed, this module is now a friendly
// explainer + rover fact cards + a shortcut into the Media Library for
// anyone actually looking for Mars rover imagery.

import { Link } from 'react-router-dom'
import { ModuleHero, StatCard, SectionHeader } from './ModuleShell'

const ROVERS = [
  { name: 'Curiosity',     landed: 'Aug 6, 2012',  status: 'Active',   sol: '4200+', tone: 'orange',  note: 'Nuclear-powered · MSL mission · Gale Crater' },
  { name: 'Perseverance',  landed: 'Feb 18, 2021', status: 'Active',   sol: '1300+', tone: 'blue',    note: 'Mars 2020 · Jezero Crater · has a helicopter (Ingenuity)' },
  { name: 'Opportunity',   landed: 'Jan 25, 2004', status: 'Retired',  sol: '5,352', tone: 'emerald', note: 'MER-B · 15 years on Mars · killed by dust storm' },
  { name: 'Spirit',        landed: 'Jan 4, 2004',  status: 'Retired',  sol: '2,208', tone: 'violet',  note: 'MER-A · got stuck in soft soil, ran until 2010' },
]

const MarsRover = () => {
  return (
    <div className="space-y-6 sm:space-y-8">
      <ModuleHero
        eyebrow="Mars · API retired"
        title="Mars Rovers"
        subtitle="The public Mars Rover Photos API was archived by NASA in 2022. This shell keeps the module alive with rover mission facts and a shortcut to search Mars imagery through the still-live Media Library."
        accent="red"
        live={false}
      />

      {/* Notice card */}
      <div className="luxe-card p-5 sm:p-6 border-red-500/30">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/40 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-white font-bold text-base sm:text-lg mb-1">The rover photos feed is offline</p>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">
              NASA retired the community-run Mars Rover Photos API in 2022. The endpoint no longer returns data,
              but every image the rovers sent home is still catalogued in the Media Library — you just search
              for the mission or the rover's name.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/science/media"
                className="inline-flex items-center gap-2 luxe-press tap-44 px-4 py-2 rounded-full border border-red-500/50 bg-red-500/20 text-red-200 text-sm font-semibold hover:bg-red-500/30 transition-colors"
              >
                Search "Curiosity" in Media Library
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
              <Link
                to="/science"
                className="inline-flex items-center gap-2 luxe-press tap-44 px-4 py-2 rounded-full border border-gray-800 bg-gray-900/60 text-gray-300 text-sm font-semibold hover:border-gray-700 transition-colors"
              >
                Back to Cosmos
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Rover mission facts */}
      <div>
        <SectionHeader>Rover roster</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard tone="orange"  label="Active rovers"    value="2" ctx="Curiosity + Perseverance" live={false} />
          <StatCard tone="emerald" label="Retired rovers"   value="2" ctx="Opportunity + Spirit" live={false} />
          <StatCard tone="red"     label="First landing"    value="1997" ctx="Sojourner · Pathfinder" live={false} />
          <StatCard tone="violet"  label="Total sols"       value="12 k+" ctx="cumulative rover-days on Mars" live={false} />
        </div>
      </div>

      {/* Rover cards */}
      <div>
        <SectionHeader>Mission cards</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {ROVERS.map(r => {
            const isActive = r.status === 'Active'
            const barColor = r.tone === 'orange' ? 'bg-orange-500' : r.tone === 'blue' ? 'bg-blue-500' : r.tone === 'emerald' ? 'bg-emerald-500' : 'bg-violet-500'
            const glowColor = r.tone === 'orange' ? 'border-orange-500/40' : r.tone === 'blue' ? 'border-blue-500/40' : r.tone === 'emerald' ? 'border-emerald-500/30' : 'border-violet-500/30'
            return (
              <div key={r.name} className={`relative luxe-card p-4 sm:p-5 ${glowColor}`}>
                <div className={`absolute inset-x-0 top-0 h-0.5 ${barColor} opacity-70`} />
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h4 className="text-white font-bold text-base">{r.name}</h4>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                      : 'bg-gray-800 text-gray-500 border-gray-700'
                  }`}>
                    {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1 align-middle" />}
                    {r.status}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 space-y-1 mb-3">
                  <div className="flex items-center gap-2"><span className="text-gray-600 uppercase tracking-wider text-[9px]">Landed</span><span className="text-gray-300 font-mono">{r.landed}</span></div>
                  <div className="flex items-center gap-2"><span className="text-gray-600 uppercase tracking-wider text-[9px]">Sols</span><span className="text-gray-300 font-mono">{r.sol}</span></div>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">{r.note}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default MarsRover
