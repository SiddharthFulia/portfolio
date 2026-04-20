import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const MODULES = [
  { id: 'pokedex',   label: 'Pokedex',           color: 'from-red-500 to-orange-500',    desc: 'Browse 386 Pokemon with stats, types, abilities' },
  { id: 'rickmorty', label: 'Rick & Morty',       color: 'from-green-500 to-cyan-500',    desc: 'Character browser with search, filters, episodes' },
  { id: 'launches',  label: 'Space Launches',     color: 'from-blue-500 to-indigo-500',   desc: 'Upcoming rocket launches with live countdowns' },
  { id: 'mtg',       label: 'Magic Cards',        color: 'from-purple-500 to-indigo-500', desc: 'MTG card browser — search, random, card details' },
  { id: 'memes',     label: 'Meme Templates',     color: 'from-yellow-500 to-orange-500', desc: 'Browse & download popular meme templates' },
  { id: 'food',      label: 'Food Gallery',       color: 'from-orange-400 to-red-500',    desc: 'Random food photos by category — pizza, burger, dessert' },
  { id: 'dogs',      label: 'Dog Explorer',       color: 'from-amber-400 to-amber-600',   desc: 'Random dog photos — filter by 120+ breeds' },
  { id: 'countries', label: 'World Countries',    color: 'from-emerald-500 to-green-500', desc: '250 countries with flags, population, languages' },
  { id: 'quotes',    label: 'Quote Wall',         color: 'from-indigo-500 to-purple-500', desc: 'Inspiring quotes in a masonry layout' },
]

const ICONS = {
  pokedex: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /><path d="M2 12h7m6 0h7" /></svg>,
  rickmorty: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" /></svg>,
  launches: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>,
  mtg: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>,
  memes: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  food: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.38a48.474 48.474 0 00-6-.37c-2.032 0-4.034.126-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265z" /></svg>,
  dogs: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  countries: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>,
  quotes: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>,
}

function FadeIn({ children, delay = 0, className = '' }) {
  const [v, setV] = useState(false)
  useEffect(() => { const t = setTimeout(() => setV(true), delay * 1000); return () => clearTimeout(t) }, [delay])
  return <div className={className} style={{ opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(20px)', transition: 'opacity 0.5s ease, transform 0.5s ease' }}>{children}</div>
}

const Explore = () => (
  <div className="min-h-screen bg-gray-950 text-white">
    <div className="max-w-6xl mx-auto px-6 pt-32 pb-8">
      <FadeIn>
        <h1 className="font-poppins font-black text-5xl md:text-7xl leading-tight">
          <span className="bg-gradient-to-r from-red-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent">Explore</span>
        </h1>
      </FadeIn>
      <FadeIn delay={0.1}>
        <p className="text-gray-400 mt-3 text-base max-w-2xl">
          Interactive modules powered by public APIs — Pokemon, rockets, food, memes, card games, and more.
        </p>
      </FadeIn>
    </div>

    <div className="max-w-6xl mx-auto px-6 pb-24">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULES.map((m, i) => (
          <FadeIn key={m.id} delay={0.2 + i * 0.03}>
            <Link to={`/explore/${m.id}`}
              className="group relative block rounded-2xl border border-gray-800 bg-gray-900/80 overflow-hidden hover:border-gray-600 transition-colors">
              <div className={`h-1 bg-gradient-to-r ${m.color} opacity-40 group-hover:opacity-100 transition-opacity`} />
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <div className="text-gray-500 group-hover:text-gray-300 transition-colors mt-0.5">{ICONS[m.id]}</div>
                  <div className="flex-1">
                    <span className="text-white font-bold text-sm">{m.label}</span>
                    <p className="text-gray-500 text-xs leading-relaxed mt-1">{m.desc}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-700 group-hover:text-amber-400 transition-colors shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </div>
            </Link>
          </FadeIn>
        ))}
      </div>
    </div>
  </div>
)

export default Explore
