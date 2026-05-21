import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Select, Slider, message as antMessage } from 'antd'
import { VideoCameraOutlined, ThunderboltOutlined, ReloadOutlined, CopyOutlined, BulbOutlined, DeleteOutlined, SendOutlined } from '@ant-design/icons'
import { submitCinema, listCinemaProjects, cinemaBulkAction } from '../api/ai'
import PromptHelper from '../components/PromptHelper'
import StudioLibrary, { SelectCheckbox } from '../components/StudioLibrary'

// `embedded` mode (passed when Cinema lives inside the AI Video tabs):
//   - drops the outer page wrapper (no extra pt-20 / min-h-screen)
//   - skips the document.title bump so AIVideo's title stays in charge
//   - tightens the header since AIVideo already shows its own hero
export default function Cinema({ embedded = false }) {
  const navigate = useNavigate()
  const [masterPrompt, setMasterPrompt] = useState('')
  const [shotCount, setShotCount] = useState(4)
  const [durationPerShot, setDurationPerShot] = useState(5)
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [resolution, setResolution] = useState('720p')
  const [working, setWorking] = useState(false)
  const [project, setProject] = useState(null)
  const [error, setError] = useState(null)
  const [helperOpen, setHelperOpen] = useState(false)
  const [coachIdea, setCoachIdea] = useState('')
  const [coachResult, setCoachResult] = useState(null)
  const [coachError, setCoachError] = useState('')
  const [libraryRefresh, setLibraryRefresh] = useState(0)

  useEffect(() => {
    if (!embedded) document.title = 'Cinema · Sid'
  }, [embedded])

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
    setLibraryRefresh(k => k + 1)
    antMessage.success(`Planned ${data.shotCount} shots — review and render below.`)
  }

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); antMessage.success('Copied') } catch {}
  }

  // Hand a prompt off to /ai-video preselecting the 5090 Optimized lane in
  // Balanced mode (Wan 2.2 5B, 14 steps, ~60s). Background music is enabled
  // by default so the video lands ready-to-share. The destination page reads
  // these query args on mount, prefills the form, and scrubs them from the
  // URL so reloading doesn't re-apply.
  const sendToAIVideo = (text) => {
    if (!text || !text.trim()) return
    const qs = new URLSearchParams({
      prompt: text.trim(),
      provider: 'optimized',
      mode: 'balanced',
      music: '1',
    }).toString()
    navigate(`/ai-video?${qs}`)
  }

  // Page wrapper: standalone gets the full pt-20 + min-h-screen; embedded
  // (inside the AIVideo tabs) just renders the inner content so the host
  // tab pane controls layout.
  const Outer = embedded
    ? ({ children }) => <div>{children}</div>
    : ({ children }) => (
        <div className="min-h-screen bg-black text-gray-100 pt-20 pb-16 px-3 sm:px-6">
          {children}
        </div>
      )

  return (
    <Outer>
      <div className={embedded ? '' : 'max-w-5xl mx-auto'}>
        {!embedded && (
          <header className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <VideoCameraOutlined className="text-amber-400 text-xl" />
              <h1 className="text-2xl sm:text-4xl font-bold leading-tight pb-1 bg-gradient-to-r from-amber-300 via-rose-400 to-fuchsia-300 bg-clip-text text-transparent">
                Cinema
              </h1>
            </div>
            <p className="text-sm text-gray-400 max-w-2xl">
              Multi-shot orchestration. Type one master prompt → Groq breaks it
              into N shot prompts → render each via the AI Video lane → stitch.
              <span className="text-amber-300/80"> Beta — planning works; rendering is manual via /ai-video for now.</span>
            </p>
          </header>
        )}

        {/* Master prompt */}
        <section className="mb-6 space-y-4">
          <div>
            {/* flex-wrap so on narrow screens the action buttons drop to a
                new line below the label instead of overflowing. */}
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500">Master prompt</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button type="button" onClick={() => setHelperOpen(true)}
                  title="AI helper + sample stories"
                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-500/40 hover:border-amber-400 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition-colors whitespace-nowrap">
                  <BulbOutlined className="text-[10px]" /> Help me write
                </button>
                {masterPrompt.trim() && (
                  <button type="button" onClick={() => sendToAIVideo(masterPrompt)}
                    title="Skip planning — render this prompt directly in AI Video (5090 Optimized · Balanced · with music)"
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-cyan-500/40 hover:border-cyan-400 bg-gradient-to-r from-cyan-500/15 to-fuchsia-500/15 hover:from-cyan-500/25 hover:to-fuchsia-500/25 text-cyan-200 transition-colors whitespace-nowrap">
                    <SendOutlined className="text-[10px]" /> Render in AI Video
                  </button>
                )}
                {masterPrompt && (
                  <button type="button" onClick={() => setMasterPrompt('')}
                    className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
                    clear
                  </button>
                )}
              </div>
            </div>
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

        <PromptHelper
          open={helperOpen} onClose={() => setHelperOpen(false)}
          family="cinema" currentPrompt={masterPrompt}
          idea={coachIdea} setIdea={setCoachIdea}
          coachResult={coachResult} setCoachResult={setCoachResult}
          coachError={coachError} setCoachError={setCoachError}
          onApply={(text) => { setMasterPrompt(text); setHelperOpen(false) }}
          onAppend={(text) => setMasterPrompt(masterPrompt.trim() ? `${masterPrompt.trim()} ${text}` : text)}
        />

        {project && Array.isArray(project.shotPrompts) && project.shotPrompts.length > 0 && (
          <section className="rounded-2xl border border-amber-500/30 bg-gray-900/40 p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-amber-300">📜 {project.shotPrompts.length} planned shots</h3>
              <span className="text-[10px] font-mono text-gray-500">{project.projectId}</span>
            </div>
            <ol className="space-y-2">
              {project.shotPrompts.map((p, i) => (
                <li key={i} className="rounded-lg border border-gray-800 bg-black/40 p-3 hover:border-amber-500/40 transition-colors">
                  <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                    <span className="text-[10px] font-mono text-amber-400 font-bold">SHOT {i + 1}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => copy(p)}
                        className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">
                        <CopyOutlined /> Copy
                      </button>
                      <button onClick={() => sendToAIVideo(p)}
                        title="Paste into AI Video, 5090 Optimized · Balanced, with background music"
                        className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-gradient-to-r from-cyan-500/20 to-fuchsia-500/20 hover:from-cyan-500/30 hover:to-fuchsia-500/30 text-cyan-200 border border-cyan-500/40">
                        <SendOutlined /> Render
                      </button>
                    </div>
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

        <StudioLibrary
          refreshKey={libraryRefresh}
          title="Your Cinema projects"
          listFn={({ status, page, limit }) => listCinemaProjects({ status, page, limit })}
          bulkFn={cinemaBulkAction}
          getId={(it) => it.projectId}
          bulkAccent="amber"
          statuses={['completed', 'rendering', 'planning', 'failed', 'all']}
          renderCard={(it, { selectMode, checked, onToggleSelect, onDelete }) => (
            <CinemaCard key={it.projectId} item={it}
              selectMode={selectMode} checked={checked}
              onToggleSelect={onToggleSelect} onDelete={onDelete} />
          )}
        />
      </div>
    </Outer>
  )
}

function CinemaCard({ item, selectMode, checked, onToggleSelect, onDelete }) {
  const navigate = useNavigate()
  const handleClick = (e) => {
    if (selectMode) { e.preventDefault(); onToggleSelect?.(); return }
    // Anywhere else on the card → open the project detail page so the user
    // sees the master prompt + planned shots + render buttons in one shot.
    if (e.target.closest('button')) return
    navigate(`/cinema/${encodeURIComponent(item.projectId)}`)
  }
  return (
    <div onClick={handleClick}
      className={`group relative rounded-xl overflow-hidden border transition-all bg-gray-900/40 p-3 cursor-pointer ${
        checked
          ? 'border-amber-400 shadow-lg shadow-amber-500/30 ring-2 ring-amber-400/40'
          : 'border-gray-800 hover:border-amber-400/50'
      }`}>
      <div className="flex items-center gap-2 mb-2">
        <VideoCameraOutlined className="text-amber-400" />
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">
          {item.shotCount} shots · {item.aspectRatio}
        </span>
        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
          item.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300'
          : item.status === 'failed' ? 'bg-rose-500/20 text-rose-300'
          : 'bg-amber-500/20 text-amber-300'
        }`}>{item.status}</span>
      </div>
      <p className="text-[11px] text-gray-300 line-clamp-3 leading-snug">{item.masterPrompt}</p>
      {selectMode && <SelectCheckbox checked={checked} onToggle={onToggleSelect} />}
      {!selectMode && onDelete && (
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete() }}
          title="Delete"
          className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full bg-black/70 hover:bg-rose-600 text-gray-200 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
          <DeleteOutlined className="text-xs" />
        </button>
      )}
    </div>
  )
}
