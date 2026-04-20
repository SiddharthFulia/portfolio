import { useState, useEffect } from 'react'
import { Input, Modal, Button } from 'antd'
import { SearchOutlined, DownloadOutlined } from '@ant-design/icons'
import { fetchMemes } from '../../api/nasa'

const SkeletonGrid = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
    {[...Array(12)].map((_, i) => (
      <div key={i} className="animate-pulse rounded-xl overflow-hidden border border-gray-800">
        <div className="bg-gray-800 aspect-square" />
        <div className="p-2 space-y-1"><div className="bg-gray-800 h-3 w-2/3 rounded" /><div className="bg-gray-800 h-2 w-1/3 rounded" /></div>
      </div>
    ))}
  </div>
)

const MemeGenerator = () => {
  const [memes, setMemes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetchMemes().then(({ data }) => {
      if (data?.data?.memes) setMemes(data.data.memes)
      setLoading(false)
    })
  }, [])

  const filtered = search
    ? memes.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    : memes

  const download = (url, name) => {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.download = `${name}.jpg`
    a.click()
  }

  return (
    <div className="space-y-6">
      <Input
        placeholder="Search meme templates..."
        prefix={<SearchOutlined className="text-gray-500" />}
        allowClear size="large"
        value={search} onChange={e => setSearch(e.target.value)}
      />

      <div className="text-xs text-gray-500">{filtered.length} templates</div>

      {loading ? <SkeletonGrid /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.slice(0, 40).map(m => (
            <div key={m.id} onClick={() => setSelected(m)}
              className="cursor-pointer rounded-xl overflow-hidden border border-gray-800 bg-gray-900 hover:border-gray-600 transition-all group hover:scale-[1.02]">
              <img src={m.url} alt={m.name} loading="lazy"
                className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300" />
              <div className="p-2">
                <p className="text-white text-[11px] font-semibold line-clamp-1">{m.name}</p>
                <p className="text-gray-600 text-[9px]">{m.box_count} text boxes</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!selected} onCancel={() => setSelected(null)} footer={null} width={500} centered destroyOnClose>
        {selected && (
          <div className="text-center">
            <img src={selected.url} alt={selected.name} className="max-w-full max-h-[60vh] object-contain mx-auto rounded-lg mb-4" />
            <h3 className="text-lg font-bold mb-2">{selected.name}</h3>
            <div className="flex justify-center gap-2 text-xs text-gray-500 mb-4">
              <span>{selected.width} x {selected.height}</span>
              <span>{selected.box_count} text boxes</span>
            </div>
            <Button type="primary" icon={<DownloadOutlined />} onClick={() => download(selected.url, selected.name)}>
              Download Template
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default MemeGenerator
