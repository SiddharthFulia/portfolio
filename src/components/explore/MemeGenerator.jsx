// Meme Generator — pick a template, add top/bottom text, download PNG.
//
// Rendering is client-side via <canvas>: we paint the template image
// onto a <canvas>, stroke Impact-style text with a black outline for
// legibility, then export as a PNG data-URL. No server round-trip, so
// custom captions are private — nothing hits imgflip.
//
// The template list comes from api.imgflip.com/get_memes via the sid-be
// proxy; 100 stable slugs, sorted by popularity.

import { useState, useEffect, useRef, useCallback } from 'react'
import { Input, Modal, message } from 'antd'
import { SearchOutlined, DownloadOutlined, CopyOutlined, EditOutlined } from '@ant-design/icons'
import { Button } from '../ui'
import { LuxeLoader } from '../loaders'
import AnimatedCard from './AnimatedCard'
import { fetchMemes } from '../../api/nasa'

// Render a captioned meme onto a <canvas> at native resolution.
// - Impact-style font with strong black stroke → readable on any bg.
// - Auto-wrap: split words, greedily fill lines, cap at 4 lines.
// - Font size scales to canvas width so short templates read the same
//   as tall ones.
function drawMeme(canvas, img, top, bottom) {
  const ctx = canvas.getContext('2d')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  ctx.drawImage(img, 0, 0)

  const fontSize = Math.max(28, Math.round(canvas.width * 0.075))
  ctx.font = `900 ${fontSize}px Impact, "Anton", "Arial Black", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.16))
  ctx.lineJoin = 'round'

  const wrap = (text, maxWidth) => {
    if (!text) return []
    const words = text.split(/\s+/)
    const lines = []
    let cur = ''
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w
      if (ctx.measureText(test).width > maxWidth && cur) {
        lines.push(cur); cur = w
      } else {
        cur = test
      }
    }
    if (cur) lines.push(cur)
    return lines.slice(0, 4)
  }

  const maxWidth = canvas.width * 0.9
  const paint = (text, yStart) => {
    const lines = wrap((text || '').toUpperCase(), maxWidth)
    lines.forEach((line, i) => {
      const y = yStart + i * fontSize * 1.05
      ctx.strokeText(line, canvas.width / 2, y)
      ctx.fillText(line, canvas.width / 2, y)
    })
  }

  paint(top, canvas.height * 0.03)
  const bottomLines = wrap((bottom || '').toUpperCase(), maxWidth)
  const bottomY = canvas.height - bottomLines.length * fontSize * 1.05 - canvas.height * 0.03
  paint(bottom, bottomY)
}

const MemeGenerator = () => {
  const [memes, setMemes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [topText, setTopText] = useState('')
  const [bottomText, setBottomText] = useState('')
  const [visible, setVisible] = useState(24)

  const imgRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    fetchMemes().then(({ data, error }) => {
      if (data?.data?.memes) setMemes(data.data.memes)
      else if (error) setError(error)
      setLoading(false)
    })
  }, [])

  const filtered = search
    ? memes.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    : memes

  // Re-render the meme canvas whenever text or template changes.
  const render = useCallback(() => {
    if (!selected || !imgRef.current || !canvasRef.current) return
    if (!imgRef.current.complete) return
    drawMeme(canvasRef.current, imgRef.current, topText, bottomText)
  }, [selected, topText, bottomText])

  useEffect(() => { render() }, [render])

  const openEditor = (m) => {
    setSelected(m)
    setTopText('')
    setBottomText('')
  }

  const download = () => {
    if (!canvasRef.current) return
    canvasRef.current.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(selected?.name || 'meme').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(selected.url)
      message.success('Template URL copied')
    } catch {
      message.error('Could not copy')
    }
  }

  return (
    <div className="space-y-6">
      <Input
        placeholder="Search meme templates by name..."
        prefix={<SearchOutlined className="text-gray-500" />}
        allowClear size="large"
        value={search}
        onChange={e => { setSearch(e.target.value); setVisible(24) }}
      />
      <p className="text-xs text-gray-500 -mt-3">
        Pick any template, add top and bottom captions, then download the finished PNG.
      </p>

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{filtered.length} templates</span>
        {error && <span className="text-rose-400">{error}</span>}
      </div>

      {loading ? (
        <div className="flex justify-center py-14">
          <LuxeLoader variant="cosmos" size="lg" label="Loading templates…" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-10 text-center">
          <p className="text-gray-400 text-sm">No templates match that filter.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filtered.slice(0, visible).map(m => (
              <AnimatedCard key={m.id} tiltAmount={10} onClick={() => openEditor(m)}
                className="cursor-pointer rounded-xl overflow-hidden border border-white/5 bg-white/[0.02] hover:border-white/20 transition-colors">
                <div className="relative">
                  <img src={m.url} alt={m.name} loading="lazy"
                    className="w-full aspect-square object-cover" />
                  <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity bg-black/50 flex items-center justify-center">
                    <span className="text-white text-xs font-bold flex items-center gap-1">
                      <EditOutlined /> Caption it
                    </span>
                  </div>
                </div>
                <div className="p-2">
                  <p className="text-white text-[11px] font-semibold line-clamp-2 leading-tight">{m.name}</p>
                  <p className="text-gray-600 text-[9px]">{m.box_count} text box{m.box_count !== 1 ? 'es' : ''}</p>
                </div>
              </AnimatedCard>
            ))}
          </div>
          {visible < filtered.length && (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" onClick={() => setVisible(v => v + 24)}>
                Show more ({filtered.length - visible} remaining)
              </Button>
            </div>
          )}
        </>
      )}

      {/* Editor modal */}
      <Modal
        open={!!selected}
        onCancel={() => setSelected(null)}
        footer={null}
        width={640}
        centered
        destroyOnClose
      >
        {selected && (
          <div>
            <h3 className="text-lg font-bold text-white mb-1">{selected.name}</h3>
            <p className="text-gray-500 text-[11px] mb-4">
              {selected.width}×{selected.height} · {selected.box_count} text box{selected.box_count !== 1 ? 'es' : ''}
            </p>

            <div className="rounded-lg overflow-hidden bg-black/40 border border-white/10 mb-4">
              {/* Hidden source image (used by canvas draw); crossOrigin for
                  same-origin PNG export. */}
              <img
                ref={imgRef}
                src={selected.url}
                alt=""
                crossOrigin="anonymous"
                onLoad={render}
                className="hidden"
              />
              <canvas ref={canvasRef} className="w-full h-auto" />
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <Input
                  placeholder="TOP TEXT"
                  size="large"
                  value={topText}
                  onChange={e => setTopText(e.target.value)}
                  maxLength={120}
                />
                <p className="text-[10px] text-gray-600 mt-1">Impact-style outline, auto-wraps if too long.</p>
              </div>
              <div>
                <Input
                  placeholder="BOTTOM TEXT"
                  size="large"
                  value={bottomText}
                  onChange={e => setBottomText(e.target.value)}
                  maxLength={120}
                />
                <p className="text-[10px] text-gray-600 mt-1">Painted from the bottom-up so it always fits.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<DownloadOutlined />} onClick={download}>
                Download PNG
              </Button>
              <Button variant="secondary" icon={<CopyOutlined />} onClick={copyLink}>
                Copy template URL
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default MemeGenerator
