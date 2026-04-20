import { useState, useEffect } from 'react'
import { Tag, Empty, Modal, Descriptions, Button } from 'antd'
import { RocketOutlined } from '@ant-design/icons'
import { fetchLaunches } from '../../api/nasa'

const STATUS_COLORS = { 1: 'green', 2: 'orange', 3: 'blue', 4: 'red', 5: 'purple', 6: 'cyan' }

const SkeletonList = () => (
  <div className="space-y-3">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="animate-pulse flex rounded-xl border border-gray-800 overflow-hidden">
        <div className="bg-gray-800 w-28 sm:w-36 h-28 sm:h-36 shrink-0" />
        <div className="p-4 flex-1 space-y-2">
          <div className="bg-gray-800 h-4 w-3/4 rounded" />
          <div className="bg-gray-800 h-3 w-1/2 rounded" />
          <div className="flex gap-2"><div className="bg-gray-800 h-5 w-16 rounded" /><div className="bg-gray-800 h-5 w-24 rounded" /></div>
          <div className="bg-gray-800 h-2 w-1/3 rounded" />
        </div>
      </div>
    ))}
  </div>
)

const SpaceLaunches = () => {
  const [launches, setLaunches] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetchLaunches({ limit: 15 }).then(({ data }) => {
      if (data?.results) setLaunches(data.results)
      setLoading(false)
    })
  }, [])

  const formatDate = (d) => {
    if (!d) return '—'
    const date = new Date(d)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const getCountdown = (d) => {
    if (!d) return null
    const diff = new Date(d) - new Date()
    if (diff < 0) return null
    const days = Math.floor(diff / 86400000)
    const hours = Math.floor((diff % 86400000) / 3600000)
    if (days > 0) return `T-${days}d ${hours}h`
    const mins = Math.floor((diff % 3600000) / 60000)
    return `T-${hours}h ${mins}m`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <RocketOutlined className="text-cyan-400 text-xl" />
        <span className="text-gray-400 text-sm">{launches.length} upcoming launches</span>
      </div>

      {loading ? <SkeletonList /> : (
        launches.length === 0 ? <Empty description="No upcoming launches" /> : (
          <div className="space-y-3">
            {launches.map(l => {
              const countdown = getCountdown(l.net)
              const img = l.image?.image_url || l.image
              return (
                <div key={l.id} onClick={() => setSelected(l)}
                  className="cursor-pointer rounded-xl border border-gray-800 bg-gray-900 overflow-hidden hover:border-gray-600 transition-all flex group">
                  {typeof img === 'string' && img.startsWith('http') && (
                    <img src={img} alt="" className="w-28 sm:w-36 h-28 sm:h-36 object-cover shrink-0 group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                  )}
                  <div className="p-4 flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-white text-sm font-bold line-clamp-1">{l.name}</h3>
                      {countdown && (
                        <span className="shrink-0 px-2 py-0.5 bg-cyan-900/40 text-cyan-400 text-[10px] font-mono font-bold rounded">{countdown}</span>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs mb-2">{l.launch_service_provider?.name || '—'}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Tag color={STATUS_COLORS[l.status?.id] || 'default'} className="text-[10px] m-0">{l.status?.name || 'Unknown'}</Tag>
                      {l.pad?.location?.name && <Tag className="text-[10px] m-0">{l.pad.location.name}</Tag>}
                    </div>
                    <div className="text-gray-600 text-[10px] mt-2">{formatDate(l.net)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      <Modal open={!!selected} onCancel={() => setSelected(null)} footer={null} width={600} centered destroyOnClose>
        {selected && (
          <div>
            {typeof (selected.image?.image_url || selected.image) === 'string' && (
              <img src={selected.image?.image_url || selected.image} alt="" className="w-full h-48 object-cover rounded-lg mb-4" />
            )}
            <h2 className="text-xl font-bold mb-3">{selected.name}</h2>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Provider">{selected.launch_service_provider?.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Rocket">{selected.rocket?.configuration?.full_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Status">{selected.status?.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="NET">{formatDate(selected.net)}</Descriptions.Item>
              <Descriptions.Item label="Pad">{selected.pad?.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Location">{selected.pad?.location?.name || '—'}</Descriptions.Item>
              {selected.mission && <Descriptions.Item label="Mission">{selected.mission.name} — {selected.mission.type}</Descriptions.Item>}
            </Descriptions>
            {selected.mission?.description && (
              <p className="text-gray-400 text-sm mt-3 leading-relaxed">{selected.mission.description}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default SpaceLaunches
