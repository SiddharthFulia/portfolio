import { useState, useEffect, useCallback } from 'react'
import { Input, Tag, Progress, Modal, Segmented, Empty } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
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

const spriteUrl = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`

const SkeletonGrid = () => (
  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
    {[...Array(18)].map((_, i) => <div key={i} className="animate-pulse bg-gray-800 rounded-xl h-28" />)}
  </div>
)

const Pokedex = () => {
  const [pokemon, setPokemon] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [gen, setGen] = useState('Gen 1')

  const GEN_MAP = { 'Gen 1': [1, 151], 'Gen 2': [152, 251], 'Gen 3': [252, 386], 'All': [1, 386] }

  useEffect(() => {
    setLoading(true)
    const [start, end] = GEN_MAP[gen] || [1, 151]
    fetchPokemonList({ limit: end - start + 1, offset: start - 1 }).then(({ data }) => {
      if (data?.results) setPokemon(data.results.map((p, i) => ({ ...p, id: start + i })))
      setLoading(false)
    })
  }, [gen])

  const loadDetail = useCallback(async (id) => {
    setSelected(id)
    setDetailLoading(true)
    setDetail(null)
    const { data } = await fetchPokemonDetail({ id })
    if (data) setDetail(data)
    setDetailLoading(false)
  }, [])

  const filtered = search ? pokemon.filter(p => p.name.includes(search.toLowerCase()) || String(p.id) === search) : pokemon

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search by name or number..."
          prefix={<SearchOutlined className="text-gray-500" />}
          allowClear
          size="large"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1"
        />
        <Segmented
          options={['Gen 1', 'Gen 2', 'Gen 3', 'All']}
          value={gen}
          onChange={setGen}
          size="large"
        />
      </div>

      {loading ? <SkeletonGrid /> : (
        filtered.length === 0 ? (
          <Empty description="No Pokemon found" />
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {filtered.map(p => (
              <div key={p.id} onClick={() => loadDetail(p.id)}
                className={`cursor-pointer rounded-xl border p-2 text-center transition-all hover:scale-105 ${
                  selected === p.id ? 'border-red-500 bg-gray-800' : 'border-gray-800 bg-gray-900 hover:border-gray-600'
                }`}>
                <img src={spriteUrl(p.id)} alt={p.name} className="w-16 h-16 mx-auto object-contain" loading="lazy" />
                <div className="text-[9px] text-gray-600 font-mono">#{String(p.id).padStart(3, '0')}</div>
                <div className="text-white text-[11px] font-semibold capitalize truncate">{p.name}</div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Detail modal */}
      <Modal open={!!selected} onCancel={() => { setSelected(null); setDetail(null) }} footer={null} width={420} centered destroyOnClose>
        {detailLoading || !detail ? (
          <div className="py-12 space-y-4">
            <div className="animate-pulse bg-gray-800 rounded-xl w-36 h-36 mx-auto" />
            <div className="animate-pulse bg-gray-800 rounded h-4 w-1/3 mx-auto" />
            <div className="animate-pulse bg-gray-800 rounded h-3 w-1/4 mx-auto" />
            <div className="flex justify-center gap-2"><div className="animate-pulse bg-gray-800 rounded h-5 w-16" /><div className="animate-pulse bg-gray-800 rounded h-5 w-16" /></div>
          </div>
        ) : (
          <div className="text-center">
            <img src={spriteUrl(detail.id)} alt={detail.name} className="w-36 h-36 mx-auto mb-2" />
            <div className="text-gray-500 text-xs font-mono">#{String(detail.id).padStart(3, '0')}</div>
            <h2 className="text-2xl font-black capitalize mb-2">{detail.name}</h2>

            <div className="flex justify-center gap-1.5 mb-4">
              {detail.types?.map(t => (
                <Tag key={t.type.name} color={TYPE_COLORS[t.type.name]} className="capitalize font-semibold">{t.type.name}</Tag>
              ))}
            </div>

            <div className="flex justify-center gap-8 mb-4 text-sm">
              <div><span className="font-bold">{(detail.height / 10).toFixed(1)}</span><span className="text-gray-500"> m</span></div>
              <div><span className="font-bold">{(detail.weight / 10).toFixed(1)}</span><span className="text-gray-500"> kg</span></div>
              <div><span className="font-bold">{detail.base_experience}</span><span className="text-gray-500"> XP</span></div>
            </div>

            <div className="text-left space-y-2 mb-4">
              <h4 className="text-xs font-semibold text-gray-500">BASE STATS</h4>
              {detail.stats?.map(s => (
                <div key={s.stat.name} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-12 text-right font-mono">{STAT_LABELS[s.stat.name]}</span>
                  <span className="text-xs font-bold w-7 text-right">{s.base_stat}</span>
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
              <h4 className="text-xs font-semibold text-gray-500 mb-1">ABILITIES</h4>
              <div className="flex flex-wrap gap-1">
                {detail.abilities?.map(a => (
                  <Tag key={a.ability.name} className="capitalize">{a.ability.name.replace('-', ' ')}{a.is_hidden ? ' (H)' : ''}</Tag>
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
