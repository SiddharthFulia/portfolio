import { useState, useEffect } from 'react'
import { Input, Select, Slider, message as antMessage } from 'antd'
import { VideoCameraOutlined, ThunderboltOutlined, ReloadOutlined, CopyOutlined } from '@ant-design/icons'
import { submitCinema } from '../api/ai'

export default function Cinema() {
  const [masterPrompt, setMasterPrompt] = useState('')
  const [shotCount, setShotCount] = useState(4)
  const [durationPerShot, setDurationPerShot] = useState(5)
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [resolution, setResolution] = useState('720p')
  const [working, setWorking] = useState(false)
  const [project, setProject] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { document.title = 'Cinema · Sid' }, [])

  const plan = async () => {
    if (!masterPrompt.trim() || masterPrompt.trim().length < 5) {
      setError('Master prompt must be at least 5 characters'); return
    }
    setError(null); setProject(null); setWorking(true)
    const { data, error: err } = await submitCinema({
      masterPrompt: masterPrompt.trim(), shotCount, durationPerShot, aspectRatio, resolution,
    })
    setWorking(false)
    if (err) { setError(err); return }
    setProject(data)
    antMessage.success(`Planned ${data.shotCount} shots — review and render below.`)
  }

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); antMessage.success('Copied') } catch {}
  }

  return (
    <div className="min-h-screen bg-black text-gray-100 pt-20 pb-16 px-3 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <VideoCameraOutlined className="text-amber-400 text-xl" />
            <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-amber-300 via-rose-400 to-fuchsia-300 bg-clip-text text-transparent">
              Cinema
            </h1>
          </div>
          <p className="text-sm text-gray-400 max-w-2xl">
            Multi-shot orchestration. Type one master prompt → Groq breaks it
            into N shot prompts → render each via the AI Video lane → stitch.
            <span className="text-amber-300/80"> Beta — planning works; rendering is manual via /ai-video for now.</span>
          </p>
        </header>

        {/* Master prompt */}
        <section className="mb-6 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Master prompt</label>
            <Input.TextArea value={masterPrompt} onChange={e => setMasterPrompt(e.target.value)}
              autoSize={{ minRows: 3, maxRows: 8 }}
              placeholder='e.g. "A samurai walking through a misty bamboo forest at dawn, finding an abandoned shrine"'
              maxLength={500} showCount />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-gray-900/40 border border-gray-800">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">
                Shot count · <span className="text-amber-300 font-mono">{shotCount}</span>
              </label>
              <Slider min={2} max={12} value={shotCount} onChange={setShotCount} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">
                Sec per shot · <span className="text-amber-300 font-mono">{durationPerShot}s</span>
              </label>
              <Slider min={3} max={10} value={durationPerShot} onChange={setDurationPerShot} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Aspect</label>
              <Select className="w-full" value={aspectRatio} onChange={setAspectRatio}
                options={['16:9','9:16','1:1','21:9'].map(v => ({ value: v, label: v }))} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Resolution</label>
              <Select className="w-full" value={resolution} onChange={setResolution}
                options={['480p','720p','1080p'].map(v => ({ value: v, label: v }))} />
            </div>
          </div>
        </section>

        {/* Plan button */}
        <div className="flex justify-end mb-6">
          <button onClick={plan} disabled={working || !masterPrompt.trim()}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              working || !masterPrompt.trim()
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-400 to-rose-400 text-black hover:scale-[1.02]'
            }`}>
            {working ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                Planning…
              </>
            ) : (
              <>
                <ThunderboltOutlined />
                Plan {shotCount} shots
              </>
            )}
          </button>
        </div>

        {/* Output */}
        {error && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 mb-6">
            <p className="text-rose-300 text-sm font-mono">✗ {error}</p>
            <button onClick={plan} className="mt-2 text-xs px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">
              <ReloadOutlined /> Retry
            </button>
          </div>
        )}

        {project && Array.isArray(project.shotPrompts) && project.shotPrompts.length > 0 && (
          <section className="rounded-2xl border border-amber-500/30 bg-gray-900/40 p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-amber-300">📜 {project.shotPrompts.length} planned shots</h3>
              <span className="text-[10px] font-mono text-gray-500">{project.projectId}</span>
            </div>
            <ol className="space-y-2">
              {project.shotPrompts.map((p, i) => (
                <li key={i} className="rounded-lg border border-gray-800 bg-black/40 p-3 hover:border-amber-500/40 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-amber-400 font-bold">SHOT {i + 1}</span>
                    <button onClick={() => copy(p)}
                      className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">
                      <CopyOutlined /> Copy
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-300 font-mono leading-relaxed">{p}</p>
                </li>
              ))}
            </ol>
            <p className="text-[10px] text-gray-600 mt-4 leading-snug">
              ⚠ Beta: render each shot manually in the <span className="text-cyan-300">AI Video</span> tab — copy each prompt, generate at <span className="font-mono">{durationPerShot}s · {aspectRatio} · {resolution}</span>, then stitch with ffmpeg. Automated render-+-stitch is queued for the next release.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
