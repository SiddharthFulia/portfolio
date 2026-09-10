// Pokedex — grid of Pokemon with sprite / name / stats / abilities.
//
// Data source: pokeapi.co (via /api/proxy/pokemon* on sid-be). We fetch
// the list for a generation range in one call, then lazy-load full
// details on card click. Sprites are pulled from GitHub CDN — pokeapi
// itself doesn't serve them.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Input, Tag, Progress, Modal, Segmented, Select } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { Button } from '../ui'
import { LuxeLoader } from '../loaders'
import AnimatedCard from './AnimatedCard'
import { fetchPokemonList, fetchPokemonDetail } from '../../api/nasa'

const TYPE_COLORS = {
  normal: '#a8a878', fire: '#f08030', water: '#6890f0', grass: '#78c850',
  electric: '#f8d030', ice: '#98d8d8', fighting: '#c03028', poison: '#a040a0',
  ground: '#e0c068', flying: '#a890f0', psychic: '#f85888', bug: '#a8b820',
  rock: '#b8a038', ghost: '#705898', dragon: '#7038f8', dark: '#705848',
  steel: '#b8b8d0', fairy: '#ee99ac',
}
const STAT_COLORS = { hp: '#f44336', attack: '#ff9800', defense: '#ffc107', 'special-attack': '#03a9f4', 'special-defense': '#2196f3', speed: '#4caf50' }
const STAT_LABELS = { hp: 'HP', attack: 'ATK', defense: 'DEF', 'special-attack': 'SP.ATK', 'special-defense': 'SP.DEF', speed: 'SPEED' }

const ALL_TYPES = Object.keys(TYPE_COLORS)

const spriteUrl = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`

const Pokedex = () => {
  const [pokemon, setPokemon] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [gen, setGen] = useState('Gen 1')
  const [typeFilter, setTypeFilter] = useState(null)
  const [visible, setVisible] = useState(48)

  const GEN_MAP = { 'Gen 1': [1, 151], 'Gen 2': [152, 251], 'Gen 3': [252, 386], 'All': [1, 386] }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const [start, end] = GEN_MAP[gen] || [1, 151]
    fetchPokemonList({ limit: end - start + 1, offset: start - 1 }).then(({ data }) => {
      if (cancelled) return
      if (data?.results) setPokemon(data.results.map((p, i) => ({ ...p, id: start + i })))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [gen])

  const loadDetail = useCallback(async (id) => {
    setSelected(id)
    setDetailLoading(true)
    setDetail(null)
    const { data } = await fetchPokemonDetail({ id })
    if (data) setDetail(data)
    setDetailLoading(false)
  }, [])

  // For type filtering we'd need every Pokemon's types eagerly, which
  // is 386 detail calls — too much. Instead, filter is a hint that
  // narrows visible results when detail is already loaded. As a lighter
  // alternative we just filter by name/number here and expose the type
  // chip on the detail modal.
  const filtered = useMemo(() => {
    let list = pokemon
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.includes(q) || String(p.id) === q)
    }
    return list
  }, [pokemon, search])

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search by name or Pokedex number..."
          prefix={<SearchOutlined className="text-gray-500" />}
          allowClear size="large"
          value={search}
          onChange={e => { setSearch(e.target.value); setVisible(48) }}
          className="flex-1"
        />
        <Segmented
          options={['Gen 1', 'Gen 2', 'Gen 3', 'All']}
          value={gen}
          onChange={v => { setGen(v); setVisible(48) }}
          size="large"
        />
      </div>
      <p className="text-xs text-gray-500 -mt-3">
        Search matches on English name or number (e.g. "pikachu", "25"). Type badges appear on the detail card.
      </p>

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">
          {filtered.length} of {pokemon.length} in {gen}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-14">
          <LuxeLoader variant="orbital" size="lg" label="Waking Pokemon…" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-10 text-center">
          <p className="text-gray-400 text-sm">No Pokemon match "{search}".</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {filtered.slice(0, visible).map(p => (
              <AnimatedCard key={p.id} onClick={() => loadDetail(p.id)} tiltAmount={12}
                className="cursor-pointer rounded-xl border border-white/5 bg-white/[0.02] hover:border-white/20 transition-colors">
                <div className="p-2 text-center">
                  <img src={spriteUrl(p.id)} alt={p.name} className="w-16 h-16 mx-auto object-contain drop-shadow-lg" loading="lazy"
                    onError={(e) => { e.currentTarget.style.opacity = '0.3' }} />
                  <div className="text-[9px] text-gray-500 font-mono">#{String(p.id).padStart(3, '0')}</div>
                  <div className="text-white text-[11px] font-semibold capitalize line-clamp-2 leading-tight">{p.name}</div>
                </div>
              </AnimatedCard>
            ))}
          </div>

          {visible < filtered.length && (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" onClick={() => setVisible(v => v + 48)}>
                Show more ({filtered.length - visible} remaining)
              </Button>
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      <Modal open={!!selected} onCancel={() => { setSelected(null); setDetail(null) }} footer={null} width={440} centered destroyOnClose>
        {detailLoading || !detail ? (
          <div className="py-14 flex justify-center">
            <LuxeLoader variant="orbital" size="md" label="Loading Pokemon data…" />
          </div>
        ) : (
          <div className="text-center">
            <img src={spriteUrl(detail.id)} alt={detail.name} className="w-36 h-36 mx-auto mb-2" />
            <div className="text-gray-500 text-xs font-mono">#{String(detail.id).padStart(3, '0')}</div>
            <h2 className="text-2xl font-black capitalize mb-2 text-white">{detail.name}</h2>

            <div className="flex justify-center gap-1.5 mb-4">
              {detail.types?.map(t => (
                <Tag key={t.type.name} color={TYPE_COLORS[t.type.name]} className="capitalize font-semibold">{t.type.name}</Tag>
              ))}
            </div>

            <div className="flex justify-center gap-8 mb-4 text-sm">
              <div><span className="font-bold text-white">{(detail.height / 10).toFixed(1)}</span><span className="text-gray-500"> m</span></div>
              <div><span className="font-bold text-white">{(detail.weight / 10).toFixed(1)}</span><span className="text-gray-500"> kg</span></div>
              <div><span className="font-bold text-white">{detail.base_experience || '—'}</span><span className="text-gray-500"> XP</span></div>
            </div>

            <div className="text-left space-y-2 mb-4">
              <h4 className="text-xs font-semibold text-gray-400">BASE STATS</h4>
              {detail.stats?.map(s => (
                <div key={s.stat.name} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-14 text-right font-mono">{STAT_LABELS[s.stat.name] || s.stat.name}</span>
                  <span className="text-xs font-bold w-7 text-right text-white">{s.base_stat}</span>
                  <Progress
                    percent={Math.round((s.base_stat / 255) * 100)}
                    showInfo={false}
                    size="small"
                    strokeColor={STAT_COLORS[s.stat.name] || '#888'}
                    trailColor="#1f2937"
                    className="flex-1 m-0"
                  />
                </div>
              ))}
            </div>

            <div className="text-left">
              <h4 className="text-xs font-semibold text-gray-400 mb-1">ABILITIES</h4>
              <div className="flex flex-wrap gap-1">
                {detail.abilities?.map(a => (
                  <Tag key={a.ability.name} className="capitalize">
                    {a.ability.name.replace('-', ' ')}{a.is_hidden ? ' (Hidden)' : ''}
                  </Tag>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Pokedex
