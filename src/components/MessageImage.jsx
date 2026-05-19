import { useState } from 'react'
import { Tooltip } from 'antd'
import {
  DownloadOutlined, ExpandAltOutlined, LinkOutlined, CheckOutlined,
} from '@ant-design/icons'
import notify from '../utils/notify'

// Renders an image (typically from Cloudinary) with a hover-revealed
// action bar: Download · Open full size · Copy URL. Tap the image
// itself to open the lightbox-style overlay on phone.
//
// Why this instead of a plain <img>: chat-generated images deserve
// first-class save / share affordances. Without them users either
// right-click (no good on phone) or screenshot (lossy).

// Append Cloudinary `fl_attachment` so the browser saves the file
// instead of trying to display it inline. Works for any Cloudinary URL
// (matches the `/image/upload/` or `/video/upload/` segment). For
// non-Cloudinary URLs we fall back to a fetch+blob download which
// requires the host to send CORS headers (most do).
function toDownloadUrl(url, filename) {
  try {
    if (!url) return url
    if (url.includes('res.cloudinary.com')) {
      // Insert fl_attachment right after /upload/ — the safest place.
      // Optionally pin the saved filename to something readable.
      const flag = filename
        ? `fl_attachment:${encodeURIComponent(filename.replace(/\.[^/.]+$/, ''))}`
        : 'fl_attachment'
      return url.replace(/\/upload\//, `/upload/${flag}/`)
    }
    return url
  } catch { return url }
}

async function blobDownload(url, filename) {
  // Used when toDownloadUrl can't rewrite a Cloudinary URL (e.g. an
  // external host). Browsers respect the download attribute only on
  // same-origin URLs, so we have to fetch + blob to force a save.
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const obj = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = obj; a.download = filename || 'image.png'
  document.body.appendChild(a); a.click()
  setTimeout(() => { URL.revokeObjectURL(obj); a.remove() }, 200)
}

export default function MessageImage({ src, messageId, alt = '', prompt }) {
  const [copied, setCopied] = useState(false)
  const filename = `chat-image-${(messageId || Date.now()).toString().slice(-8)}.png`

  const handleDownload = async () => {
    try {
      const dl = toDownloadUrl(src, filename)
      if (dl !== src) {
        // Cloudinary path — let the browser stream the file directly.
        // download attribute on cross-origin URLs is ignored by some
        // browsers, but fl_attachment sets Content-Disposition so the
        // save still happens.
        const a = document.createElement('a')
        a.href = dl; a.download = filename
        a.rel = 'noopener noreferrer'
        document.body.appendChild(a); a.click(); a.remove()
      } else {
        await blobDownload(src, filename)
      }
      notify.success(`${filename} saved`, { title: 'Image downloaded' })
    } catch (e) {
      notify.error(e.message || 'Could not download — try Open then save')
    }
  }

  const handleOpen = () => {
    // Strip any inline transformations so the user sees the original.
    // Cloudinary keeps the raw file at the same URL minus the chain.
    window.open(src, '_blank', 'noopener,noreferrer')
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(src)
      setCopied(true); setTimeout(() => setCopied(false), 1500)
      notify.success('Image URL ready to paste anywhere', { title: 'URL copied' })
    } catch { notify.error('Clipboard unavailable in this browser') }
  }

  return (
    <div className="relative group inline-block max-w-full mb-2">
      <img
        src={src}
        alt={alt || prompt || ''}
        title={prompt || alt || ''}
        loading="lazy"
        onClick={handleOpen}
        className="max-h-72 max-w-full rounded-xl border border-gray-700 object-contain cursor-zoom-in transition-transform group-hover:scale-[1.01]"
      />

      {/* Floating action bar — always visible on touch devices for
          discoverability, fades in on hover for desktop. */}
      <div className="absolute top-2 right-2 flex items-center gap-1
                      opacity-100 sm:opacity-0 sm:group-hover:opacity-100
                      transition-opacity">
        <Tooltip title="Download image">
          <button onClick={(e) => { e.stopPropagation(); handleDownload() }}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg
                       bg-gray-950/85 hover:bg-cyan-500/30 border border-gray-700
                       hover:border-cyan-400 text-gray-200 hover:text-white
                       backdrop-blur-sm shadow-lg shadow-black/40 transition-colors">
            <DownloadOutlined />
          </button>
        </Tooltip>
        <Tooltip title="Open full size in a new tab">
          <button onClick={(e) => { e.stopPropagation(); handleOpen() }}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg
                       bg-gray-950/85 hover:bg-violet-500/30 border border-gray-700
                       hover:border-violet-400 text-gray-200 hover:text-white
                       backdrop-blur-sm shadow-lg shadow-black/40 transition-colors">
            <ExpandAltOutlined />
          </button>
        </Tooltip>
        <Tooltip title={copied ? 'Copied!' : 'Copy image URL'}>
          <button onClick={(e) => { e.stopPropagation(); handleCopy() }}
            className={`w-8 h-8 inline-flex items-center justify-center rounded-lg border backdrop-blur-sm shadow-lg shadow-black/40 transition-colors ${
              copied
                ? 'bg-emerald-500/30 border-emerald-400 text-white'
                : 'bg-gray-950/85 hover:bg-amber-500/30 border-gray-700 hover:border-amber-400 text-gray-200 hover:text-white'
            }`}>
            {copied ? <CheckOutlined /> : <LinkOutlined />}
          </button>
        </Tooltip>
      </div>

      {/* Optional small caption ribbon for the prompt that produced it.
          Keeps context visible on long chats. */}
      {prompt && (
        <div className="absolute bottom-2 left-2 right-2 px-2 py-1 rounded-md
                        bg-gray-950/80 backdrop-blur-sm border border-gray-800
                        text-[10px] text-gray-300 line-clamp-1 italic
                        opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          🎨 {prompt}
        </div>
      )}
    </div>
  )
}
