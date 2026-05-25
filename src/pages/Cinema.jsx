import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Select, Modal, Alert, message as antMessage } from 'antd'
import { VideoCameraOutlined, ThunderboltOutlined, ReloadOutlined, BulbOutlined, DeleteOutlined } from '@ant-design/icons'
import { submitCinema, listCinemaProjects, cinemaBulkAction, createCinemaRender, patchCinemaProject, reviewCinemaShot } from '../api/ai'
import PromptHelper from '../components/PromptHelper'
import StudioLibrary, { SelectCheckbox } from '../components/StudioLibrary'
import { Button, Slider } from '../components/ui'
import useQueryState from '../hooks/useQueryState'

// `embedded` mode (passed when Cinema lives inside the AI Video tabs):
//   - drops the outer page wrapper (no extra pt-20 / min-h-screen)
//   - skips the document.title bump so AIVideo's title stays in charge
//   - tightens the header since AIVideo already shows its own hero
//
// `view` mode partitions what's rendered:
//   - 'all'     (default) — planner section + renderer + library, the
//                            standalone /cinema page experience
//   - 'planner' — header + planner section + inline renderer only
//   - 'library' — past projects only (StudioLibrary)
//
// This is what lets AIVideo expose two clean sibling tabs ("Cinema" and
// "Cinema Library") instead of embedding the whole standalone Cinema
// page as one nested-feeling tab.
export default function Cinema({ embedded = false, view = 'all' }) {
  const navigate = useNavigate()
  const [masterPrompt, setMasterPrompt] = useState('')
  // Card-style selectors mirrored to URL so refresh restores the user's
  // choice. Free-text masterPrompt stays plain useState — too long for
  // URL, and the textarea is fine to start blank after refresh.
  const [shotCount, setShotCount]             = useQueryState('shots',     4,      { parse: Number })
  const [durationPerShot, setDurationPerShot] = useQueryState('dur',       5,      { parse: Number })
  const [aspectRatio, setAspectRatio]         = useQueryState('aspect',    '16:9', { allowed: ['16:9', '9:16', '1:1', '21:9'] })
  const [resolution, setResolution]           = useQueryState('resolution','720p', { allowed: ['480p', '720p', '1080p'] })
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
  const showPlanner = view === 'all' || view === 'planner'
  const showLibrary = view === 'all' || view === 'library'

  const content = (
    <div className={embedded ? '' : 'max-w-5xl mx-auto'}>
        {!embedded && (
          <header className="mb-8">
            <p className="eyebrow-mono">— AI Studio · Cinema</p>
            <div className="flex items-center gap-3 mt-2">
              <VideoCameraOutlined className="text-amber-400 text-2xl" />
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight text-white">
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
        {showPlanner && (
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
                  options={['16:9','9:16','1:1','21:9'].map(v => ({ value: v, label: v }))}
                  style={{ width: '100%' }} />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400 font-mono mb-2 block">Resolution</label>
                <Select className="w-full" value={resolution} onChange={setResolution}
                  options={['480p','720p','1080p'].map(v => ({ value: v, label: v }))}
                  style={{ width: '100%' }} />
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
                className="w-full sm:w-auto !min-h-[48px] !rounded-lg !font-bold"
              >
                {working ? 'Planning…' : `Plan ${shotCount} shots`}
              </Button>
            </div>
          </div>
        </section>
        )}

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
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/12 text-amber-300 hover:bg-amber-500/20 inline-flex items-center gap-1">
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

        {/* Planned shots — preview + the Render all button that creates
            a cinema_renders row + navigates to /cinema/render/:renderId.
            The chain itself runs on that page (refresh-safe, live logs
            per shot, persistent state). Render button is the only thing
            that fires across pages — no inline chain anymore. */}
        {showPlanner && project && Array.isArray(project.shotPrompts) && project.shotPrompts.length > 0 && (
          <PlannedShotsPanel project={project} navigate={navigate} />
        )}

        {showLibrary && (
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
        )}
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

// PlannedShotsPanel — read-only preview of the Groq-split shot prompts
// + the "Render all shots" button. Clicking creates a cinema_renders
// row on the BE + navigates to /cinema/render/<renderId> where the
// chain actually runs (refresh-safe, live logs, persistent state).
// PROVIDER + MODE pickers for the Cinema chain. The render row stores
// whichever the user picked here; CinemaRenderer reads them when it
// fires generateVideo per shot. Default is 5090 Optimized · Balanced
// (Wan 2.2 5B, 14 steps, ~60-90s per shot — what the chain has always
// used). 'Preview' swaps to LTX-distilled for a fast scout (~15s),
// 'Quality' bumps Wan 2.2 to 30 steps for hero-grade output (~3-4m).
const CINEMA_PROVIDERS = [
  { id: 'optimized', label: '5090 Optimized', blurb: 'Wan 2.2 5B · image-to-video, fastest 5090 lane' },
  { id: 'local',     label: '5090 Beast',     blurb: 'Full Wan 2.2 14B + Hunyuan, max fidelity, longer' },
  { id: 'zsky',      label: 'ZSky Cloud',     blurb: 'Hosted GPU pool, no 5090 needed (paid lane)' },
]
const CINEMA_MODES = [
  { id: 'preview',  label: 'Preview',  blurb: 'LTX-distilled · ~15s per shot · scout quality' },
  { id: 'balanced', label: 'Balanced', blurb: 'Wan 2.2 5B · 14 steps · ~60-90s per shot' },
  { id: 'quality',  label: 'Quality',  blurb: 'Wan 2.2 5B · 30 steps · ~3-4m per shot · hero output' },
]

function PlannedShotsPanel({ project, navigate }) {
  const [creating, setCreating] = useState(false)
  // Pickers — URL-mirrored so refresh keeps the same choice.
  const [renderProvider, setRenderProvider] = useQueryState('rProv', 'optimized', { allowed: ['optimized', 'local', 'zsky'] })
  const [renderMode, setRenderMode]         = useQueryState('rMode', 'balanced',  { allowed: ['preview', 'balanced', 'quality'] })
  // 'mode' only meaningfully changes the chain output for the optimized
  // provider — the other two ignore it on the BE.
  const showModePicker = renderProvider === 'optimized'

  const onStart = () => {
    Modal.confirm({
      title: `Render ${project.shotPrompts.length} shots back-to-back?`,
      content: (
        <div className="text-sm space-y-2">
          <p>
            Generates shot 1 from text, then uses its last frame as the start of shot 2,
            and so on through shot {project.shotPrompts.length}. Final ffmpeg stitch
            into one mp4 at the end.
          </p>
          <p className="text-fg-muted text-xs">
            Provider: <span className="font-semibold text-amber-300">{CINEMA_PROVIDERS.find(p => p.id === renderProvider)?.label}</span>
            {showModePicker && <> · Mode: <span className="font-semibold text-amber-300">{CINEMA_MODES.find(m => m.id === renderMode)?.label}</span></>}
            <br />Opens on its own page with live per-shot logs — you can close the tab and
            come back to the same URL to keep watching.
          </p>
        </div>
      ),
      okText: 'Start render',
      cancelText: 'Back',
      autoFocusButton: 'ok',
      centered: true,
      onOk: async () => {
        setCreating(true)
        const { data, error } = await createCinemaRender(project.projectId, {
          provider: renderProvider,
          optimizedMode: renderMode,
        })
        setCreating(false)
        if (error || !data?.renderId) {
          antMessage.error(error || 'Failed to create render — try again')
          return
        }
        navigate(`/cinema/render/${data.renderId}`)
      },
    })
  }

  return (
    <section className="luxe-card p-5 sm:p-6 mb-6 border-amber-500/30">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80">— Planned shots</p>
          <h3 className="mt-1 text-lg font-bold text-fg-primary tabular-nums">
            {project.shotPrompts.length} shots · {project.durationPerShot || 5}s each · {project.aspectRatio || '16:9'} · {project.resolution || '720p'}
          </h3>
          <p className="mt-1 text-xs text-fg-muted">
            Sequential chain — last frame of each shot becomes the first frame of the next.
          </p>
        </div>
        <Button variant="primary" onClick={onStart} loading={creating}>
          Render all shots
        </Button>
      </div>

      {/* Provider + mode pickers — apply to every shot in the chain. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-1.5">Engine</p>
          <div className="grid grid-cols-1 gap-1.5">
            {CINEMA_PROVIDERS.map(p => (
              <button key={p.id} type="button" onClick={() => setRenderProvider(p.id)}
                className={`text-left p-2.5 rounded-md border transition-colors ${
                  renderProvider === p.id
                    ? 'border-amber-400/60 bg-amber-500/12 ring-1 ring-amber-400/40'
                    : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                }`}>
                <p className="text-xs font-semibold text-white">{p.label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{p.blurb}</p>
              </button>
            ))}
          </div>
        </div>
        {showModePicker && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-1.5">Mode</p>
            <div className="grid grid-cols-1 gap-1.5">
              {CINEMA_MODES.map(m => (
                <button key={m.id} type="button" onClick={() => setRenderMode(m.id)}
                  className={`text-left p-2.5 rounded-md border transition-colors ${
                    renderMode === m.id
                      ? 'border-amber-400/60 bg-amber-500/12 ring-1 ring-amber-400/40'
                      : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                  }`}>
                  <p className="text-xs font-semibold text-white">{m.label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{m.blurb}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Editable shot list — each row is its own component so its
          local edit + review state doesn't churn the whole panel. */}
      <ol className="space-y-2">
        {project.shotPrompts.map((prompt, idx) => (
          <ShotPromptRow
            key={idx}
            projectId={project.projectId}
            shotIndex={idx}
            durationPerShot={project.durationPerShot || 5}
            initialPrompt={prompt}
            allPrompts={project.shotPrompts}
          />
        ))}
      </ol>
    </section>
  )
}

// ── ShotPromptRow ────────────────────────────────────────────────
// One row in the planner's shot list. Editable textarea with a
// save-on-blur PATCH to /api/cinema/:projectId, plus a "Check with
// AI" button that asks Groq (default) or Gemini to assess the prompt
// against the shot's duration budget. The review opens in a modal
// with the original prompt vs. AI suggestion side-by-side + an Apply
// button that writes the suggestion back into the textarea + saves.
function ShotPromptRow({ projectId, shotIndex, durationPerShot, initialPrompt, allPrompts }) {
  const [text, setText] = useState(initialPrompt)
  const [savedText, setSavedText] = useState(initialPrompt)
  const [saving, setSaving] = useState(false)
  // Review modal state — all local so opening shot 2's review doesn't
  // unmount shot 1's editor.
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewEngine, setReviewEngine] = useState('groq')   // 'groq' | 'gemini'
  const [reviewResult, setReviewResult] = useState(null)

  // Push the edit when the textarea loses focus AND the value differs
  // from what's already on the server. Cuts down PATCH spam while the
  // user is still typing.
  const saveIfChanged = async () => {
    if (text.trim() === savedText.trim()) return
    setSaving(true)
    // Rebuild the full shotPrompts array so the BE can rewrite the
    // single column atomically. allPrompts is the live parent state.
    const nextPrompts = [...allPrompts]
    nextPrompts[shotIndex] = text.trim()
    const { error: err } = await patchCinemaProject(projectId, { shotPrompts: nextPrompts })
    setSaving(false)
    if (err) {
      antMessage.error(`Save failed: ${err}`)
      return
    }
    setSavedText(text.trim())
  }

  const runReview = async () => {
    setReviewLoading(true)
    setReviewResult(null)
    const { data, error: err } = await reviewCinemaShot(projectId, shotIndex, {
      currentPrompt: text,
      engine: reviewEngine,
    })
    setReviewLoading(false)
    if (err) {
      antMessage.error(`Review failed: ${err}`)
      return
    }
    setReviewResult(data)
  }

  const applySuggestion = async () => {
    if (!reviewResult?.suggested) return
    setText(reviewResult.suggested)
    // Save immediately so the planner's allPrompts is in sync next
    // time the user opens a review modal.
    const nextPrompts = [...allPrompts]
    nextPrompts[shotIndex] = reviewResult.suggested
    const { error: err } = await patchCinemaProject(projectId, { shotPrompts: nextPrompts })
    if (err) { antMessage.error(`Apply failed: ${err}`); return }
    setSavedText(reviewResult.suggested)
    setReviewOpen(false)
    antMessage.success('Applied AI suggestion')
  }

  const assessmentTone =
    reviewResult?.assessment === 'too_detailed' ? 'text-rose-300'
    : reviewResult?.assessment === 'too_vague'   ? 'text-amber-300'
    : 'text-emerald-300'

  return (
    <li className="luxe-card p-3">
      <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
        <p className="text-[10px] font-mono text-amber-400 font-bold tabular-nums">
          SHOT {String(shotIndex + 1).padStart(2, '0')}
          <span className="ml-2 text-gray-500">· {durationPerShot}s budget</span>
        </p>
        <div className="flex items-center gap-2">
          {saving && <span className="text-[10px] font-mono text-gray-500">saving…</span>}
          <button
            type="button"
            onClick={() => { setReviewOpen(true); setReviewResult(null) }}
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 inline-flex items-center gap-1.5">
            <BulbOutlined /> Check with AI
          </button>
        </div>
      </div>
      <Input.TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={saveIfChanged}
        autoSize={{ minRows: 2, maxRows: 6 }}
        className="!font-mono !text-[12px]"
      />

      <Modal
        title={`Review · Shot ${shotIndex + 1}`}
        open={reviewOpen}
        onCancel={() => setReviewOpen(false)}
        footer={null}
        centered
        width={620}
      >
        {/* Engine toggle — Groq default for speed, Gemini optional */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Engine</span>
          {['groq', 'gemini'].map(engineId => (
            <button key={engineId} type="button"
              onClick={() => setReviewEngine(engineId)}
              disabled={reviewLoading}
              className={`text-[11px] px-2 py-1 rounded border ${
                reviewEngine === engineId
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                  : 'border-gray-800 text-gray-400 hover:border-gray-700'
              }`}>
              {engineId === 'groq' ? 'Groq · 70b (fast)' : 'Gemini 2.5 Flash'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">Current prompt</p>
            <div className="p-2.5 rounded-md border border-gray-800 bg-gray-900/40 text-[12px] font-mono leading-relaxed text-gray-200">
              {text || <span className="text-gray-500 italic">empty</span>}
            </div>
          </div>

          {!reviewResult && (
            <Button variant="primary" loading={reviewLoading} onClick={runReview}>
              {reviewLoading ? 'Checking…' : `Check this prompt against ${durationPerShot}s budget`}
            </Button>
          )}

          {reviewResult && (
            <>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">
                  Assessment · <span className={assessmentTone}>{reviewResult.assessment.replace('_', ' ')}</span>
                  <span className="text-gray-600 ml-2">({reviewResult.engine})</span>
                </p>
                <p className="text-[12px] text-gray-300 leading-relaxed">{reviewResult.feedback}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">AI suggestion</p>
                <div className="p-2.5 rounded-md border border-amber-400/40 bg-amber-500/8 text-[12px] font-mono leading-relaxed text-amber-100">
                  {reviewResult.suggested}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={runReview} disabled={reviewLoading}>
                  Re-run
                </Button>
                <Button variant="primary" onClick={applySuggestion}>
                  Apply suggestion
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </li>
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
      className={`group relative rounded-lg overflow-hidden border transition-colors bg-gray-900/40 p-3 cursor-pointer ${
        checked
          ? 'border-amber-400 ring-2 ring-amber-400/40'
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
          className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-lg bg-black/70 hover:bg-rose-600 text-gray-200 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
          <DeleteOutlined className="text-xs" />
        </button>
      )}
    </div>
  )
}
