import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Select, Modal, Alert, message as antMessage } from 'antd'
import { VideoCameraOutlined, ThunderboltOutlined, ReloadOutlined, CopyOutlined, BulbOutlined, DeleteOutlined, SendOutlined } from '@ant-design/icons'
import { submitCinema, listCinemaProjects, cinemaBulkAction } from '../api/ai'
import PromptHelper from '../components/PromptHelper'
import StudioLibrary, { SelectCheckbox } from '../components/StudioLibrary'
import { Button, Slider } from '../components/ui'

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

  // Confirm before clearing a master prompt that has real content. Tiny
  // friction is worth it — losing 200 chars of careful prose to a stray
  // tap on a 12px chip is exactly the kind of micro-tragedy the new
  // design system is supposed to prevent.
  const requestClearPrompt = () => {
    const trimmed = masterPrompt.trim()
    if (!trimmed) { setMasterPrompt(''); return }
    if (trimmed.length < 40) { setMasterPrompt(''); return }
    Modal.confirm({
      title: 'Clear the master prompt?',
      content: 'You\'ll lose what you\'ve written. This can\'t be undone.',
      okText: 'Clear',
      okType: 'danger',
      okButtonProps: { danger: true },
      cancelText: 'Keep',
      autoFocusButton: 'cancel',
      centered: true,
      onOk: () => setMasterPrompt(''),
    })
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

  // Page wrapper: standalone gets the full cinematic backdrop with ambient
  // orbs + max-width cap so 1440p+ doesn't sprawl; embedded (inside the
  // AIVideo tabs) just renders the inner content so the host tab pane
  // controls layout.
  //
  // WARNING: Do NOT define `Outer` as a fresh component inside the render
  // body. React reads a new function reference on every render as "a
  // different component type at this position" and tears down + remounts
  // the entire subtree below — which, on this page, fires StudioLibrary's
  // mount effect (= a /api/cinema/list refetch) on every slider drag.
  // Inline the wrapper element instead of wrapping in a synthetic component.
  const content = (
    <div className={embedded ? '' : 'max-w-5xl mx-auto'}>
        {!embedded && (
          <header className="mb-8">
            <p className="eyebrow-mono">— AI Studio · Cinema</p>
            <div className="flex items-center gap-3 mt-2">
              <VideoCameraOutlined className="text-amber-400 text-2xl" />
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight gradient-text-amber">
                Cinema
              </h1>
            </div>
            <p className="mt-3 text-sm text-fg-secondary max-w-2xl leading-relaxed">
              Multi-shot orchestration. Type one master prompt → Groq breaks it
              into N shot prompts → render each via the AI Video lane → stitch.
              <span className="text-amber-300/80"> Beta — planning works; rendering is manual via /ai-video for now.</span>
            </p>
          </header>
        )}

        {/* Master prompt — wrapped in luxe-card so the form has surface
            chrome on the bare page; matches YoutubeDl + AI Video. */}
        <section className="mb-6">
          <div className="luxe-card p-5 sm:p-6 space-y-5">
            <div>
              {/* flex-wrap so on narrow screens the action buttons drop to a
                  new line below the label instead of overflowing. tap-44 on
                  the action chips so the hit area meets WCAG on phone. */}
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <label className="text-[11px] uppercase tracking-wider text-gray-400 font-mono">Master prompt</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button type="button" onClick={() => setHelperOpen(true)}
                    title="AI helper + sample stories"
                    className="tap-44 px-3 py-1.5 text-[11px] font-semibold rounded-full border border-amber-500/40 hover:border-amber-400 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition-colors whitespace-nowrap inline-flex items-center gap-1.5">
                    <BulbOutlined className="text-[11px]" /> Help me write
                  </button>
                  {masterPrompt.trim() && (
                    <button type="button" onClick={() => sendToAIVideo(masterPrompt)}
                      title="Skip planning — render this prompt directly in AI Video (5090 Optimized · Balanced · with music)"
                      className="tap-44 px-3 py-1.5 text-[11px] font-semibold rounded-full border border-cyan-500/40 hover:border-cyan-400 bg-gradient-to-r from-cyan-500/15 to-fuchsia-500/15 hover:from-cyan-500/25 hover:to-fuchsia-500/25 text-cyan-200 transition-colors whitespace-nowrap inline-flex items-center gap-1.5">
                      <SendOutlined className="text-[11px]" /> Render in AI Video
                    </button>
                  )}
                  {masterPrompt && (
                    <button type="button" onClick={requestClearPrompt}
                      className="tap-44 px-2 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
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

            {/* Settings — stacks on phone, 2-col on tablet, 4-col on desktop.
                Numeric values get tabular-nums so the slider readout doesn't
                jitter as the user drags. */}
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-black/30 border border-line"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400 font-mono mb-2 block">
                  Shot count · <span className="text-amber-300">{shotCount}</span>
                </label>
                <Slider accent="amber" min={2} max={12} value={shotCount} onChange={setShotCount} />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400 font-mono mb-2 block">
                  Sec per shot · <span className="text-amber-300">{durationPerShot}s</span>
                </label>
                <Slider accent="amber" min={3} max={10} value={durationPerShot} onChange={setDurationPerShot} />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400 font-mono mb-2 block">Aspect</label>
                <Select className="w-full" value={aspectRatio} onChange={setAspectRatio}
                  options={['16:9','9:16','1:1','21:9'].map(v => ({ value: v, label: v }))} />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400 font-mono mb-2 block">Resolution</label>
                <Select className="w-full" value={resolution} onChange={setResolution}
                  options={['480p','720p','1080p'].map(v => ({ value: v, label: v }))} />
              </div>
            </div>

            {/* Plan button — full-width on phone, right-aligned auto on
                tablet+. Min height 48 = comfortable thumb target. */}
            <div className="flex justify-end pt-1">
              <Button
                variant="primary"
                size="large"
                onClick={plan}
                disabled={working || !masterPrompt.trim()}
                loading={working}
                icon={!working && <ThunderboltOutlined />}
                className="w-full sm:w-auto !min-h-[48px] !rounded-full !font-bold"
              >
                {working ? 'Planning…' : `Plan ${shotCount} shots`}
              </Button>
            </div>
          </div>
        </section>

        {/* Output — antd Alert with retry instead of the hand-rolled rose
            card; reads as "real error" to assistive tech now. */}
        {error && (
          <div className="mb-6">
            <Alert
              type="error"
              showIcon
              message="Planning failed"
              description={error}
              action={
                <button onClick={plan}
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 inline-flex items-center gap-1">
                  <ReloadOutlined /> Retry
                </button>
              }
            />
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
          <section className="luxe-card p-5 sm:p-6 mb-6 border-amber-500/30">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80">— Planned</p>
                <h3 className="mt-1 text-lg font-bold text-fg-primary tabular-nums">
                  {project.shotPrompts.length} shots ready to render
                </h3>
              </div>
              <span className="text-[10px] font-mono text-gray-500 break-all">{project.projectId}</span>
            </div>
            <ol className="space-y-2">
              {project.shotPrompts.map((p, i) => (
                <li key={i} className="luxe-card luxe-card-hover p-3 hover:border-amber-500/40">
                  <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                    <span className="text-[10px] font-mono text-amber-400 font-bold tabular-nums">SHOT {String(i + 1).padStart(2, '0')}</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => copy(p)}
                        className="tap-44 px-2.5 py-1 text-[11px] inline-flex items-center gap-1 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300">
                        <CopyOutlined /> Copy
                      </button>
                      <button onClick={() => sendToAIVideo(p)}
                        title="Paste into AI Video, 5090 Optimized · Balanced, with background music"
                        className="tap-44 px-2.5 py-1 text-[11px] inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-cyan-500/20 to-fuchsia-500/20 hover:from-cyan-500/30 hover:to-fuchsia-500/30 text-cyan-200 border border-cyan-500/40">
                        <SendOutlined /> Render
                      </button>
                    </div>
                  </div>
                  <p className="text-[12px] text-gray-300 font-mono leading-relaxed">{p}</p>
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-gray-500 mt-4 leading-snug">
              <span className="text-amber-300/90">Beta:</span> render each shot manually in the <span className="text-cyan-300">AI Video</span> tab — copy each prompt, generate at <span className="font-mono tabular-nums">{durationPerShot}s · {aspectRatio} · {resolution}</span>, then stitch with ffmpeg. Automated render-+-stitch is queued for the next release.
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
  )

  if (embedded) return <div>{content}</div>
  return (
    <section className="relative min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16 px-4 sm:px-6 overflow-hidden">
      <div aria-hidden className="ambient-orb -top-32 left-1/2 -translate-x-1/2" />
      <div aria-hidden className="ambient-orb ambient-orb-cool -bottom-40 -right-32" />
      <div className="relative">{content}</div>
    </section>
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
