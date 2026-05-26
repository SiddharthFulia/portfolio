import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Select, Modal, Alert } from 'antd'
import { notice } from '../lib/notice'
import { VideoCameraOutlined, ThunderboltOutlined, ReloadOutlined, BulbOutlined, DeleteOutlined, DownloadOutlined, LockOutlined, UnlockOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons'
import { submitCinema, listCinemaProjects, cinemaBulkAction, createCinemaRender, patchCinemaProject, reviewCinemaShot, getCinemaDiskStats, uploadSourceImage, enhanceImage, getImageStatus, promptCoach, cinemaFixAction } from '../api/ai'
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
export default function Cinema({ embedded = false, view = 'all', refreshKey = 0 }) {
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

  // Parent (AIVideo Tabs) bumps `refreshKey` on every tab change so the
  // newly-active tab reloads its lists. Without this, deleting in
  // Combine + switching to Cinema Library leaves stale counts +
  // disk-stats sitting on screen.
  useEffect(() => {
    if (refreshKey) setLibraryRefresh(k => k + 1)
  }, [refreshKey])

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
    notice.success(`Planned ${data.shotCount} shots — review and render below.`)
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
          <>
            <CinemaDiskStatsBanner refreshKey={libraryRefresh} />
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
          </>
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
// Mirrors the local-provider model list on AI Video Generate so the
// Cinema planner exposes the same Beast-lane models per shot. Order
// matches that page's antd <Select> dropdown.
const BEAST_MODELS = [
  { id: 'ltx-video',   label: 'LTX-Video 2B',     blurb: 'fast all-rounder · text + image' },
  { id: 'wan-2.1',     label: 'Wan 2.1 1.3B',     blurb: 'cinematic motion · T2V only' },
  { id: 'wan-2.1-i2v', label: 'Wan 2.1 I2V 14B',  blurb: 'top quality I2V · 14B model' },
  { id: 'hunyuan',     label: 'HunyuanVideo',     blurb: 'Tencent · highest fidelity' },
  { id: 'wan-2.2',     label: 'Wan 2.2 5B',       blurb: 'newest gen TI2V (default)' },
  { id: 'mochi',       label: 'Mochi 1',          blurb: 'Apache-2 · distinctive style' },
  { id: 'svd',         label: 'SVD-XT 1.1',       blurb: 'image-only · no prompt' },
]
const DEFAULT_BEAST_MODEL = 'wan-2.2'

function PlannedShotsPanel({ project, navigate }) {
  const [creating, setCreating] = useState(false)
  // Pickers — URL-mirrored so refresh keeps the same choice.
  const [renderProvider, setRenderProvider] = useQueryState('rProv', 'optimized', { allowed: ['optimized', 'local', 'zsky'] })
  const [renderMode, setRenderMode]         = useQueryState('rMode', 'balanced',  { allowed: ['preview', 'balanced', 'quality'] })
  const [beastModel, setBeastModel]         = useQueryState('rModel', DEFAULT_BEAST_MODEL, {
    allowed: BEAST_MODELS.map(m => m.id),
  })
  // 'mode' only meaningfully changes the chain output for the optimized
  // provider — the other two ignore it on the BE.
  const showModePicker  = renderProvider === 'optimized'
  // 5090 Beast picks ONE model for the whole render. Per-shot mixing
  // was removed because it broke continuity (different models =
  // different face/lighting/lens interpretations).
  const showBeastModelPicker = renderProvider === 'local'
  // Motion strength slider — only Wan / Hunyuan honour it. LTX ignores.
  const motionApplies = renderProvider === 'local'
    && ['wan-2.1', 'wan-2.1-i2v', 'wan-2.2', 'hunyuan'].includes(beastModel)

  // Per-shot music array — same as before. Default OFF everywhere.
  const shotCount = project.shotPrompts.length
  const [shotMusic, setShotMusic] = useState(() =>
    Array.from({ length: shotCount }, (_, i) => !!project.shotMusic?.[i])
  )

  // Continuity bible — JSON object pre-populated by Groq at project
  // creation. Locked-edit by default (click 🔓 to enable typing); the
  // lock is just a UX guard to avoid mid-render typos. Save debounce
  // is 600ms after the last keystroke per field.
  const [bible, setBible] = useState(() => project.continuityBible || {})
  const [bibleLocked, setBibleLocked] = useState(true)

  // Locked seed — single integer. The chain uses this to init noise on
  // every shot so the model rolls the same starting point each clip.
  // Defaults to whatever the BE stamped at creation (random 0..1e9).
  const [seed, setSeed] = useState(() => Number(project.lockedSeed ?? 0))
  const [seedLocked, setSeedLocked] = useState(true)

  // Motion strength — 0.1..1.0; defaults to 0.6 (Wan/Hunyuan can
  // identity-mutate above ~0.75).
  const [motion, setMotion] = useState(() => Number(project.motionStrength ?? 0.6))

  // Hero image URL — the master first-frame that anchors the whole
  // render. When set, the chain uses this as shot 1's source image
  // (I2V→I2V→… instead of T2V→I2V→…) so the chain doesn't drift on
  // its first generation.
  const [heroImageUrl, setHeroImageUrl] = useState(() => project.heroImageUrl || '')
  const [heroUploading, setHeroUploading] = useState(false)
  const heroFileInputRef = useRef(null)

  // ─── Cinematic Continuity Director (§69) ──────────────────────────
  // directorState = { physicalState, cameraState, emotionArc,
  //                   negativeContinuityRules }
  // Filled by Groq at project creation; user can edit any sub-field.
  // Three accompanying toggles control how aggressive the director is.
  const [directorState, setDirectorState] = useState(() => project.directorState || {})
  const [continuityMode, setContinuityMode] = useState(() =>
    project.continuityMode === undefined ? true : !!project.continuityMode
  )
  const [realismMode,    setRealismMode]    = useState(() =>
    project.realismMode    === undefined ? true : !!project.realismMode
  )
  const [overlapMode,    setOverlapMode]    = useState(() => !!project.overlapMode)
  const directorSaveTimer = useRef(null)
  const updateDirectorField = (group, key, value) => {
    const next = { ...directorState, [group]: { ...(directorState[group] || {}), [key]: value } }
    setDirectorState(next)
    if (directorSaveTimer.current) clearTimeout(directorSaveTimer.current)
    directorSaveTimer.current = setTimeout(() => patchProject({ directorState: next }), 600)
  }
  const updateNegativeRule = (i, value) => {
    const rules = Array.isArray(directorState.negativeContinuityRules) ? [...directorState.negativeContinuityRules] : []
    rules[i] = value
    const next = { ...directorState, negativeContinuityRules: rules.filter(s => typeof s === 'string') }
    setDirectorState(next)
    if (directorSaveTimer.current) clearTimeout(directorSaveTimer.current)
    directorSaveTimer.current = setTimeout(() => patchProject({ directorState: next }), 600)
  }
  const addNegativeRule = () => {
    const rules = Array.isArray(directorState.negativeContinuityRules) ? [...directorState.negativeContinuityRules] : []
    if (rules.length >= 16) return
    rules.push('')
    const next = { ...directorState, negativeContinuityRules: rules }
    setDirectorState(next)
    patchProject({ directorState: next })
  }
  const removeNegativeRule = (i) => {
    const rules = Array.isArray(directorState.negativeContinuityRules) ? [...directorState.negativeContinuityRules] : []
    rules.splice(i, 1)
    const next = { ...directorState, negativeContinuityRules: rules }
    setDirectorState(next)
    patchProject({ directorState: next })
  }

  const patchProject = async (patch) => {
    const { error: err } = await patchCinemaProject(project.projectId, patch)
    if (err) notice.error(`Save failed: ${err}`)
  }
  const setMusicAt = (idx, v) => {
    const next = [...shotMusic]; next[idx] = !!v; setShotMusic(next)
    patchProject({ shotMusic: next })
  }
  const bulkMusic = (v) => {
    const next = shotMusic.map(() => !!v); setShotMusic(next)
    patchProject({ shotMusic: next })
  }
  const anyMusicOn = shotMusic.some(Boolean)
  const allMusicOn = shotMusic.length > 0 && shotMusic.every(Boolean)

  // Debounced bible save — one timer for all 6 fields so a fast
  // tabbing edit only fires one PATCH.
  const bibleSaveTimer = useRef(null)
  const updateBibleField = (key, value) => {
    const next = { ...bible, [key]: value }
    setBible(next)
    if (bibleSaveTimer.current) clearTimeout(bibleSaveTimer.current)
    bibleSaveTimer.current = setTimeout(() => patchProject({ continuityBible: next }), 600)
  }

  // Seed save — only on blur or when toggling the lock off + back on.
  const commitSeed = () => {
    const n = parseInt(seed, 10)
    if (!Number.isFinite(n) || n < 0) { notice.error('Seed must be a positive integer'); return }
    patchProject({ lockedSeed: n })
  }
  const rerollSeed = () => {
    const n = Math.floor(Math.random() * 1_000_000_000)
    setSeed(n)
    patchProject({ lockedSeed: n })
  }
  const commitMotion = (v) => {
    setMotion(v)
    patchProject({ motionStrength: v })
  }

  // Hero image — upload via the existing /api/ai-video/upload-image
  // endpoint (returns a Cloudinary URL), then PATCH heroImageUrl onto
  // the project so a refresh restores it.
  const onPickHeroFile = async (file) => {
    if (!file) return
    if (!/^image\//i.test(file.type)) { notice.warning('Only image uploads'); return }
    setHeroUploading(true)
    const { data, error: err } = await uploadSourceImage(file)
    setHeroUploading(false)
    if (err) { notice.error(`Upload failed: ${err}`); return }
    const url = data?.url || data?.secure_url || ''
    if (!url) { notice.error('Upload returned no URL'); return }
    setHeroImageUrl(url)
    patchProject({ heroImageUrl: url })
    notice.success('Hero image set — will anchor shot 1')
  }
  const clearHero = () => {
    setHeroImageUrl('')
    patchProject({ heroImageUrl: '' })
  }

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
          beastModel: renderProvider === 'local' ? beastModel : undefined,
        })
        setCreating(false)
        if (error || !data?.renderId) {
          notice.error(error || 'Failed to create render — try again')
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
        {showBeastModelPicker && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-1.5">
              Model — applies to ALL shots
            </p>
            <Select
              value={beastModel}
              onChange={setBeastModel}
              style={{ width: '100%' }}
              options={BEAST_MODELS.map(m => ({
                value: m.id,
                label: (
                  <div>
                    <div className="font-semibold text-white text-xs">{m.label}</div>
                    <div className="text-[10px] text-gray-400">{m.blurb}</div>
                  </div>
                ),
              }))}
            />
            <p className="text-[10px] text-gray-500 font-mono mt-1.5">
              One model · one seed · one bible · across every shot. The key to continuity.
            </p>
          </div>
        )}
      </div>

      {/* ── Cinematic Continuity Director — three modes ─────────────
          §69. Three boolean toggles control how aggressive the
          director layer is. Default all ON for new projects; user
          can opt out at any time. */}
      <div className="luxe-card p-3 mb-4 flex flex-wrap items-center gap-3 border-amber-500/30">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80">
          — Director modes
        </p>
        {[
          { id: 'continuity', label: 'Continuity', tip: 'Prepend bible + physical + camera state to every shot, sanitize drift words, build a negative prompt',
            value: continuityMode, onChange: (v) => { setContinuityMode(v); patchProject({ continuityMode: v }) } },
          { id: 'realism',    label: 'Realism',    tip: 'Append a documentary-realism layer to each prompt (handheld sway, natural physics, no plastic AI texture)',
            value: realismMode, onChange: (v) => { setRealismMode(v); patchProject({ realismMode: v }) } },
          { id: 'overlap',    label: 'Overlap',    tip: 'Render slightly longer per shot + trim the wobbly edges (slower, more stable)',
            value: overlapMode, onChange: (v) => { setOverlapMode(v); patchProject({ overlapMode: v }) } },
        ].map(t => (
          <label key={t.id} title={t.tip}
            className="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={!!t.value}
              onChange={(e) => t.onChange(e.target.checked)} className="accent-amber-400" />
            <span className={`text-[11px] font-mono ${t.value ? 'text-emerald-300' : 'text-gray-500'}`}>
              {t.label}{t.value ? ' · ON' : ' · off'}
            </span>
          </label>
        ))}
      </div>

      {/* ── Director state — physicalState / cameraState / emotionArc /
          negativeContinuityRules. Filled by Groq at project creation;
          all fields editable, debounce-saved 600ms after the last
          keystroke. */}
      <div className="luxe-card p-4 mb-4 border-cyan-500/30 bg-cyan-500/[0.03]">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan-300/80">
              — Continuity director state
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Physical + camera state stays locked across every shot. Emotion arc shapes the narrative; negative rules forbid world resets.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* physicalState */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">Physical state</p>
            <div className="space-y-1.5">
              {[
                ['screenDirection', 'left_to_right'],
                ['subjectMotion',    'walking forward slowly'],
                ['windDirection',    'left_to_right'],
                ['snowDirection',    'left_to_right or not_applicable'],
                ['weatherIntensity', 'light | medium | heavy | none'],
                ['terrain',          'snow-covered rocky mountain pass'],
                ['timeOfDay',        'golden hour'],
              ].map(([k, ph]) => (
                <div key={k} className="grid grid-cols-[120px_1fr] gap-2 items-center">
                  <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">{k}</span>
                  <Input size="small" value={directorState.physicalState?.[k] || ''}
                    onChange={(e) => updateDirectorField('physicalState', k, e.target.value)}
                    placeholder={ph} className="!font-mono !text-[11px]" />
                </div>
              ))}
            </div>
          </div>

          {/* cameraState + emotionArc */}
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">Camera state</p>
              <div className="space-y-1.5">
                {[
                  ['lens',          '35mm anamorphic'],
                  ['height',        'wolf-eye level'],
                  ['movement',      'slow forward tracking'],
                  ['energy',        'calm tense documentary realism'],
                  ['stabilization', 'slightly handheld with subtle operator sway'],
                ].map(([k, ph]) => (
                  <div key={k} className="grid grid-cols-[120px_1fr] gap-2 items-center">
                    <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">{k}</span>
                    <Input size="small" value={directorState.cameraState?.[k] || ''}
                      onChange={(e) => updateDirectorField('cameraState', k, e.target.value)}
                      placeholder={ph} className="!font-mono !text-[11px]" />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">Emotion arc</p>
              <div className="space-y-1.5">
                {[
                  ['start',  'searching and alert'],
                  ['middle', 'leader senses something'],
                  ['end',    'reveal and recognition'],
                ].map(([k, ph]) => (
                  <div key={k} className="grid grid-cols-[120px_1fr] gap-2 items-center">
                    <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">{k}</span>
                    <Input size="small" value={directorState.emotionArc?.[k] || ''}
                      onChange={(e) => updateDirectorField('emotionArc', k, e.target.value)}
                      placeholder={ph} className="!font-mono !text-[11px]" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* negative continuity rules */}
        <div className="mt-3 pt-3 border-t border-cyan-500/20">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Negative continuity rules</p>
            <button type="button" onClick={addNegativeRule}
              className="text-[10px] font-semibold px-2 py-0.5 rounded border border-line hover:border-line-strong text-fg-muted">
              + Add rule
            </button>
          </div>
          <div className="space-y-1">
            {(directorState.negativeContinuityRules || []).map((rule, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input size="small" value={rule}
                  onChange={(e) => updateNegativeRule(i, e.target.value)}
                  placeholder="do not change the subject design"
                  className="!font-mono !text-[11px]" />
                <button type="button" onClick={() => removeNegativeRule(i)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-rose-500/40 text-rose-300 hover:bg-rose-500/10">
                  <DeleteOutlined />
                </button>
              </div>
            ))}
            {(directorState.negativeContinuityRules || []).length === 0 && (
              <p className="text-[10px] text-gray-500 italic">No rules yet — Groq usually adds 10 by default. Hit "+ Add rule" to start one manually.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Continuity bible ─────────────────────────────────────────
          Locked world facts prepended to every shot's prompt. Without
          this, each shot is its own world and the character mutates
          between clips. The chain glues these as "same X, same Y, …"
          to the front of every shot's action prompt at submit time. */}
      <div className="luxe-card p-4 mb-4 border-amber-500/30 bg-amber-500/[0.03]">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80">
              — Continuity bible
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Locked world facts. Prepended to every shot's prompt so the model rebuilds the same world each clip.
            </p>
          </div>
          <button type="button" onClick={() => setBibleLocked(l => !l)}
            className={`text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded border ${
              bibleLocked
                ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                : 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200'
            }`}>
            {bibleLocked ? <><LockOutlined /> Locked · click to edit</> : <><UnlockOutlined /> Editing · click to lock</>}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {['subject', 'wardrobe', 'environment', 'lighting', 'camera', 'palette'].map(key => (
            <div key={key}>
              <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500">{key}</label>
              <Input
                size="small"
                value={bible[key] || ''}
                onChange={(e) => updateBibleField(key, e.target.value)}
                disabled={bibleLocked}
                placeholder={
                  key === 'subject'     ? 'young woman astronaut, athletic, mid-twenties'
                  : key === 'wardrobe'   ? 'white damaged NASA suit, orange chest stripe, gold visor'
                  : key === 'environment'? 'wet black alien sand, cyan crystals, twin red suns'
                  : key === 'lighting'   ? 'warm twin-sunset rim right, cool cyan bounce left'
                  : key === 'camera'     ? 'anamorphic 50mm, soft halation, fine grain'
                  : 'obsidian, cyan, amber, ember red'
                }
                className="!font-mono !text-[12px]"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Seed + motion + hero image — three small but critical knobs ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {/* Seed */}
        <div className="luxe-card p-3 border-line">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">Locked seed</p>
            <button type="button" onClick={() => setSeedLocked(l => !l)}
              className={`text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${
                seedLocked
                  ? 'border-amber-400/40 text-amber-200'
                  : 'border-emerald-400/50 text-emerald-200'
              }`}>
              {seedLocked ? <LockOutlined /> : <UnlockOutlined />}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              size="small"
              value={seed}
              onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
              onBlur={commitSeed}
              disabled={seedLocked}
              className="!font-mono"
            />
            <button type="button" onClick={rerollSeed} disabled={seedLocked}
              title="Roll a new random seed"
              className="text-[10px] px-1.5 py-1 rounded border border-line hover:border-line-strong text-fg-muted disabled:opacity-40">
              ↻
            </button>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            Same seed = same noise init across every shot. Don't change mid-render.
          </p>
        </div>

        {/* Motion strength — only when model honours it */}
        <div className={`luxe-card p-3 border-line ${motionApplies ? '' : 'opacity-40 pointer-events-none'}`}>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400 mb-1.5">
            Motion strength <span className="text-amber-300">{motion.toFixed(2)}</span>
          </p>
          <Slider
            accent="amber"
            min={0.1}
            max={1.0}
            step={0.05}
            value={motion}
            onChange={(v) => setMotion(Number(v))}
            onChangeComplete={(v) => commitMotion(Number(v))}
          />
          <p className="text-[10px] text-gray-500 mt-1">
            Lower = subject identity stable. Higher = bigger motion, more mutation. {motionApplies ? '' : 'Pick a Wan/Hunyuan model first.'}
          </p>
        </div>

        {/* Hero image — anchor the look on shot 1. Split into its own
            component because the generator (model picker + prompt
            assist + polling loop) made the inline block unreadable. */}
        <HeroImagePanel
          heroImageUrl={heroImageUrl}
          setHeroImageUrl={(url) => { setHeroImageUrl(url); patchProject({ heroImageUrl: url }) }}
          heroUploading={heroUploading}
          onPickFile={onPickHeroFile}
          fileInputRef={heroFileInputRef}
          bible={bible}
          firstShotPrompt={project.shotPrompts?.[0] || ''}
          aspectRatio={project.aspectRatio || '16:9'}
          masterPrompt={project.masterPrompt || ''}
        />
      </div>

      {/* Bulk music controls (per-shot toggle stays in the card row). */}
      <div className="flex flex-wrap items-center gap-3 mb-3 pt-3 border-t border-line/40">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Music</span>
          <button type="button" onClick={() => bulkMusic(true)}
            className={`text-[11px] px-2 py-1 rounded border transition-colors ${
              allMusicOn
                ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
                : 'border-gray-800 text-gray-400 hover:border-gray-700'
            }`}>
            All on
          </button>
          <button type="button" onClick={() => bulkMusic(false)}
            className={`text-[11px] px-2 py-1 rounded border transition-colors ${
              !anyMusicOn
                ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                : 'border-gray-800 text-gray-400 hover:border-gray-700'
            }`}>
            All off
          </button>
          <span className="text-[10px] text-gray-500 font-mono">
            ({shotMusic.filter(Boolean).length}/{shotCount} on)
          </span>
        </div>
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
            musicOn={!!shotMusic[idx]}
            onToggleMusic={(v) => setMusicAt(idx, v)}
            // §69 continuity director context — used for risk
            // scoring + Fix-with-AI prompt.
            bible={bible}
            directorState={directorState}
            model={renderProvider === 'local' ? beastModel : 'wan-2.2'}
            motionStrength={motion}
            hasHeroImage={!!heroImageUrl}
            continuityMode={continuityMode}
            realismMode={realismMode}
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
function ShotPromptRow({
  projectId, shotIndex, durationPerShot, initialPrompt, allPrompts,
  // Per-shot music toggle — model is render-level now (single model for
  // the whole chain so continuity holds).
  musicOn = false, onToggleMusic,
  // §69 director context — used for local risk scoring + Fix-with-AI.
  bible = {}, directorState = {},
  model = 'wan-2.2', motionStrength = 0.5,
  hasHeroImage = false, continuityMode = true, realismMode = true,
}) {
  const [text, setText] = useState(initialPrompt)
  const [savedText, setSavedText] = useState(initialPrompt)
  const [saving, setSaving] = useState(false)
  // Review modal state — all local so opening shot 2's review doesn't
  // unmount shot 1's editor.
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  // engineId is a flat picker covering Groq + the three Gemini sizes AI
  // Chat exposes. We translate it to { engine, model } at submit time.
  const [reviewEngineId, setReviewEngineId] = useState('groq')
  const [reviewResult, setReviewResult] = useState(null)
  const ENGINE_OPTIONS = [
    { id: 'groq',              engine: 'groq',   model: 'llama-3.3-70b',   label: 'Groq · 70b (fast)' },
    { id: 'gemini-flash',      engine: 'gemini', model: 'gemini-flash',    label: 'Gemini 2.5 Flash' },
    { id: 'gemini-flash-lite', engine: 'gemini', model: 'gemini-flash-lite', label: 'Gemini Flash-Lite' },
    { id: 'gemini-pro',        engine: 'gemini', model: 'gemini-pro',      label: 'Gemini 2.5 Pro' },
  ]
  const selectedEngine = ENGINE_OPTIONS.find(o => o.id === reviewEngineId) || ENGINE_OPTIONS[0]

  // ─── Fix-with-AI modal state (separate from Review) ──────────────
  const [fixOpen, setFixOpen] = useState(false)
  const [fixLoading, setFixLoading] = useState(false)
  const [fixEngineId, setFixEngineId] = useState('groq')
  const [fixResult, setFixResult] = useState(null)

  // ─── Local continuity risk score (cheap, runs on every keystroke) ─
  // Mirrors the BE's calculateContinuityRisk so the user sees the
  // same number without a round-trip. Re-implemented inline because
  // we can't import a BE module from the FE.
  const riskScore = (() => {
    if (!continuityMode) return { score: 0, level: 'safe', warnings: [] }
    const a = (text || '').toLowerCase()
    let score = 0; const warnings = []
    const DRIFT = [
      'different location','new world','suddenly','transforms','changes into','different animal',
      'new character','teleport','surreal','dreamlike','fantasy transformation','whip pan','crash zoom',
      'rapid zoom','camera flies above','moonlight','new place','different scene',
    ]
    const driftHits = DRIFT.filter(d => a.includes(d))
    if (driftHits.length) { score += 25 + (driftHits.length - 1) * 5; warnings.push(`drift: ${driftHits.join(', ')}`) }
    const wc = a.trim().split(/\s+/).filter(Boolean).length
    if (wc / Math.max(1, durationPerShot) > 6) { score += 15; warnings.push(`action may be too complex for ${durationPerShot}s`) }
    if (model === 'ltx-video' || model === 'ltx-distilled') { score += 15; warnings.push('LTX weak for multi-shot continuity') }
    if (motionStrength > 0.65) { score += 20; warnings.push(`motionStrength ${motionStrength} is high`) }
    else if (motionStrength > 0.55) score += 8
    if (shotIndex === 0 && !hasHeroImage) { score += 12; warnings.push('no hero image — shot 1 will T2V') }
    const filled = ['subject','wardrobe','environment','lighting','camera','palette'].filter(k => bible[k]).length
    if (filled < 3) { score += 15; warnings.push(`bible only ${filled}/6 filled`) }
    score = Math.max(0, Math.min(100, Math.round(score)))
    return { score, level: score >= 45 ? 'risky' : score >= 20 ? 'medium' : 'safe', warnings }
  })()
  const riskTone = riskScore.level === 'risky' ? 'text-rose-300 bg-rose-500/10 border-rose-500/40'
                  : riskScore.level === 'medium' ? 'text-amber-300 bg-amber-500/10 border-amber-500/40'
                  : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/40'

  const FIX_ENGINE_OPTIONS = [
    { id: 'groq',              engine: 'groq',   model: 'llama-3.3-70b',     label: 'Groq · 70b' },
    { id: 'gemini-flash',      engine: 'gemini', model: 'gemini-flash',      label: 'Gemini Flash' },
    { id: 'gemini-flash-lite', engine: 'gemini', model: 'gemini-flash-lite', label: 'Flash-Lite' },
    { id: 'gemini-pro',        engine: 'gemini', model: 'gemini-pro',        label: 'Gemini Pro' },
  ]
  const selectedFixEngine = FIX_ENGINE_OPTIONS.find(o => o.id === fixEngineId) || FIX_ENGINE_OPTIONS[0]

  const runFixAction = async () => {
    setFixLoading(true); setFixResult(null)
    const { data, error: err } = await cinemaFixAction(projectId, shotIndex, {
      engine: selectedFixEngine.engine,
      model:  selectedFixEngine.model,
    })
    setFixLoading(false)
    if (err) { notice.error(`Fix failed: ${err}`); return }
    setFixResult(data)
  }
  const applyFix = async () => {
    if (!fixResult?.saferAction) return
    setText(fixResult.saferAction)
    const nextPrompts = [...allPrompts]; nextPrompts[shotIndex] = fixResult.saferAction
    const { error: err } = await patchCinemaProject(projectId, { shotPrompts: nextPrompts })
    if (err) { notice.error(`Apply failed: ${err}`); return }
    setSavedText(fixResult.saferAction)
    setFixOpen(false)
    notice.success('Continuity-safe rewrite applied.')
  }

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
      notice.error(`Save failed: ${err}`)
      return
    }
    setSavedText(text.trim())
  }

  const runReview = async () => {
    setReviewLoading(true)
    setReviewResult(null)
    const { data, error: err } = await reviewCinemaShot(projectId, shotIndex, {
      currentPrompt: text,
      engine: selectedEngine.engine,
      model:  selectedEngine.model,
    })
    setReviewLoading(false)
    if (err) {
      notice.error(`Review failed: ${err}`)
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
    if (err) { notice.error(`Apply failed: ${err}`); return }
    setSavedText(reviewResult.suggested)
    setReviewOpen(false)
    notice.success('Applied AI suggestion')
  }

  const assessmentTone =
    reviewResult?.assessment === 'too_detailed' ? 'text-rose-300'
    : reviewResult?.assessment === 'too_vague'   ? 'text-amber-300'
    : 'text-emerald-300'

  return (
    <li className="luxe-card p-3">
      <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
        <p className="text-[10px] font-mono text-amber-400 font-bold tabular-nums inline-flex items-center gap-2 flex-wrap">
          <span>SHOT {String(shotIndex + 1).padStart(2, '0')} <span className="text-gray-500 font-normal normal-case tracking-normal">· action only</span> <span className="text-gray-500">· {durationPerShot}s budget</span></span>
          {/* Continuity risk badge — live-updates as the user types */}
          {continuityMode && (
            <span title={riskScore.warnings.join('\n') || 'continuity looks safe'}
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${riskTone} inline-flex items-center gap-1`}>
              risk {riskScore.score} · {riskScore.level}
            </span>
          )}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {saving && <span className="text-[10px] font-mono text-gray-500">saving…</span>}
          <button type="button" onClick={() => { setFixOpen(true); setFixResult(null) }}
            disabled={!continuityMode}
            title={continuityMode ? 'Rewrite as a continuation-safe action' : 'Turn Continuity mode on to use Fix with AI'}
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border border-cyan-400/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40 inline-flex items-center gap-1.5">
            <ThunderboltOutlined /> Fix with AI
          </button>
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

      {/* Per-shot music toggle — model + seed + bible all live at the
          render level so continuity holds across the chain. */}
      <div className="mt-2 flex flex-wrap items-center gap-3 pt-2 border-t border-line/30">
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Music</span>
          <input
            type="checkbox"
            checked={!!musicOn}
            onChange={(e) => onToggleMusic?.(e.target.checked)}
            className="accent-amber-400"
          />
          <span className={`text-[10px] font-mono ${musicOn ? 'text-emerald-300' : 'text-gray-500'}`}>
            {musicOn ? 'ON · MusicGen' : 'off'}
          </span>
        </label>
      </div>

      <Modal
        title={`Review · Shot ${shotIndex + 1}`}
        open={reviewOpen}
        onCancel={() => setReviewOpen(false)}
        footer={null}
        centered
        width={620}
      >
        {/* Engine + model picker. Groq is the fast default; the three
            Gemini sizes mirror what AI Chat exposes so the user picks
            the same model they know from there. */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Engine</span>
          {ENGINE_OPTIONS.map(opt => (
            <button key={opt.id} type="button"
              onClick={() => setReviewEngineId(opt.id)}
              disabled={reviewLoading}
              className={`text-[11px] px-2 py-1 rounded border ${
                reviewEngineId === opt.id
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                  : 'border-gray-800 text-gray-400 hover:border-gray-700'
              }`}>
              {opt.label}
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

      {/* Fix-with-AI modal — rewrites the action as a continuation-safe
          version that respects bible + director state. Shows risk
          before vs after so the user sees the win. */}
      <Modal
        title={`Fix · Shot ${shotIndex + 1}`}
        open={fixOpen}
        onCancel={() => setFixOpen(false)}
        footer={null}
        centered
        width={640}
      >
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Engine</span>
          {FIX_ENGINE_OPTIONS.map(opt => (
            <button key={opt.id} type="button"
              onClick={() => setFixEngineId(opt.id)} disabled={fixLoading}
              className={`text-[11px] px-2 py-1 rounded border ${
                fixEngineId === opt.id
                  ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200'
                  : 'border-gray-800 text-gray-400 hover:border-gray-700'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">Current action</p>
            <div className="p-2.5 rounded-md border border-gray-800 bg-gray-900/40 text-[12px] font-mono leading-relaxed text-gray-200">
              {text || <span className="text-gray-500 italic">empty</span>}
            </div>
          </div>
          {!fixResult && (
            <Button variant="primary" loading={fixLoading} onClick={runFixAction}>
              {fixLoading ? 'Rewriting…' : 'Rewrite as continuation-safe'}
            </Button>
          )}
          {fixResult && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-rose-300/80 mb-1">Risk before</p>
                  <p className="text-lg font-bold text-rose-200 tabular-nums">
                    {fixResult.riskBefore?.score ?? '—'}
                    <span className="text-[10px] text-rose-300/70 ml-1">{fixResult.riskBefore?.level}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-300/80 mb-1">Risk after</p>
                  <p className="text-lg font-bold text-emerald-200 tabular-nums">
                    {fixResult.riskAfter?.score ?? '—'}
                    <span className="text-[10px] text-emerald-300/70 ml-1">{fixResult.riskAfter?.level}</span>
                  </p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">Why</p>
                <p className="text-[12px] text-gray-300 leading-relaxed">{fixResult.reason}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">Safer action</p>
                <div className="p-2.5 rounded-md border border-cyan-400/40 bg-cyan-500/8 text-[12px] font-mono leading-relaxed text-cyan-100">
                  {fixResult.saferAction}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={runFixAction} disabled={fixLoading}>Re-run</Button>
                <Button variant="primary" onClick={applyFix}>Apply</Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </li>
  )
}

// CinemaDiskStatsBanner — pulls /api/cinema/disk-stats and renders a
// thin header strip above the library showing how much disk Cinema is
// using IN TOTAL, separate from the rest of the BE's storage. Per the
// user's ask: "tell me total space used for cinema specifically so I
// know". Stat is computed from combined_videos.fileSize joined against
// cinema_renders.combineJobId, so it only counts Cinema-driven combines
// (ad-hoc Build-tab combines are excluded).
function CinemaDiskStatsBanner({ refreshKey }) {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    let cancelled = false
    getCinemaDiskStats().then(({ data }) => { if (!cancelled) setStats(data || null) })
    return () => { cancelled = true }
  }, [refreshKey])
  if (!stats) return null
  const total = stats.total || { count: 0, bytes: 0 }
  const fmt = (n) => {
    if (!n) return '0 MB'
    const mb = n / (1024 * 1024)
    return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(2)} GB`
  }
  return (
    <div className="luxe-card p-3 mb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80">— Cinema disk usage</p>
        <p className="text-sm text-white mt-1 tabular-nums">
          <span className="font-mono text-amber-200">{total.count.toLocaleString()}</span> rendered combine{total.count === 1 ? '' : 's'} ·{' '}
          <span className="font-mono text-amber-200">{fmt(total.bytes)}</span> on disk
        </p>
      </div>
      <p className="text-[10px] text-gray-500 font-mono max-w-md text-right">
        Counts Cinema-driven combines only (`combined_videos` rows joined against `cinema_renders.combineJobId`). Build-tab ad-hoc combines aren't included.
      </p>
    </div>
  )
}

// ── HeroImagePanel ────────────────────────────────────────────────
// The card that owns the master first-frame for a Cinema render.
// Three ways in:
//   1) Generate from text — picks Flux Schnell (default, ~8s) /
//      Flux Dev / SDXL JuggernautXL, polls until done, sets URL.
//   2) Upload from disk    — existing flow, kept.
//   3) Toggle off entirely — chain falls back to T2V on shot 1.
//
// Prompt assist: "Suggest with AI" feeds the continuity bible + first
// shot action into Groq's /api/ai/prompt-coach (flux or sdxl family
// based on the picked model) and pastes the polished result into the
// prompt textarea — user can still hand-edit before generating.
const HERO_T2I_MODELS = [
  { id: 'flux-schnell',  label: 'Flux Schnell',  blurb: '4-step distilled · ~8s · fastest',  family: 'flux', defaults: { steps: 4,  cfg: 1.0 } },
  { id: 'flux-dev-t2i',  label: 'Flux Dev',      blurb: 'Flux.1 [dev] · ~40s · top photoreal', family: 'flux', defaults: { steps: 28, cfg: 3.5 } },
  { id: 'sdxl-t2i',      label: 'SDXL (Juggernaut)', blurb: 'JuggernautXL v9 · ~30s · photo-real',  family: 'sdxl', defaults: { steps: 25, cfg: 5.0 } },
]

// Aspect → (width, height) for the T2I workflows. All Flux/SDXL
// workflows on the worker pad to square if width/height aren't sent,
// so explicit is better.
function _heroDims(aspect) {
  if (aspect === '9:16')  return { width: 768,  height: 1344 }
  if (aspect === '16:9')  return { width: 1344, height: 768  }
  if (aspect === '21:9')  return { width: 1536, height: 640  }
  return { width: 1024, height: 1024 }
}

function HeroImagePanel({
  heroImageUrl, setHeroImageUrl,
  heroUploading, onPickFile, fileInputRef,
  bible, firstShotPrompt, aspectRatio, masterPrompt,
}) {
  // useHero = true means the panel is enabled. When false, we hide
  // the generator/upload UI and (if URL was set) clear it. Pure-FE
  // boolean — when off the row's heroImageUrl is empty so the chain
  // T2Vs shot 1 naturally; no extra BE column needed.
  const [useHero, setUseHero] = useState(!!heroImageUrl || true)
  const [genOpen, setGenOpen] = useState(false)
  const [model, setModel] = useState('flux-schnell')
  const [prompt, setPrompt] = useState('')
  const [coaching, setCoaching] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  // Live worker-log tail while T2I is running. Cursor-based via
  // `since=<lastTs>` so each poll only pulls new lines.
  const [genLogs, setGenLogs] = useState([])
  const logsSinceRef = useRef(0)
  const pollAbortRef = useRef(false)

  const composeBaseIdea = () => {
    // Compose the "starter prompt" from the bible + first shot. The
    // user can edit before generating — this is just a sensible
    // pre-fill so they don't stare at an empty textarea.
    const bibleLine = ['subject', 'wardrobe', 'environment', 'lighting', 'camera', 'palette']
      .map(k => (bible?.[k] || '').trim()).filter(Boolean).join(', ')
    const shot = (firstShotPrompt || masterPrompt || '').trim()
    if (bibleLine && shot) return `${bibleLine}. ${shot}`
    return bibleLine || shot || ''
  }

  const openGenerator = () => {
    setPrompt(composeBaseIdea())
    setGenOpen(true)
  }

  // Polish the auto-composed prompt via Groq → /api/ai/prompt-coach.
  // The `family` param tunes the system prompt (flux vs sdxl).
  const suggestWithAI = async () => {
    const idea = (prompt.trim() || composeBaseIdea())
    if (!idea) { notice.warning('Type a starter idea first'); return }
    setCoaching(true)
    const family = HERO_T2I_MODELS.find(m => m.id === model)?.family || 'flux'
    const { data, error: err } = await promptCoach({ idea, family })
    setCoaching(false)
    if (err) { notice.error(`Suggest failed: ${err}`); return }
    const polished = (data?.prompt || data?.coached || data?.text || '').trim()
    if (polished) { setPrompt(polished); notice.success('Prompt polished — review and Generate.') }
  }

  // Fetch new log lines since the cursor. Plain fetch (no helper) keeps
  // this independent of the api/ai.js layer; the job-logs endpoint is
  // a thin read so a custom call here keeps the surface small.
  const fetchHeroLogs = async (imageId) => {
    try {
      const base = import.meta.env.VITE_BE_URL || ''
      const url = `${base}/api/job-logs/image/${imageId}?since=${logsSinceRef.current}&limit=80`
      const r = await fetch(url)
      const body = await r.json()
      const lines = body?.data?.logs || []
      if (lines.length) {
        setGenLogs(prev => [...prev, ...lines].slice(-200))
        logsSinceRef.current = lines[lines.length - 1].ts || logsSinceRef.current
      }
    } catch {}
  }

  const startGenerate = async () => {
    const p = prompt.trim()
    if (!p) { notice.warning('Add a prompt first'); return }
    setGenerating(true)
    setProgress(5)
    setGenLogs([])
    logsSinceRef.current = 0
    pollAbortRef.current = false
    const wf = HERO_T2I_MODELS.find(m => m.id === model) || HERO_T2I_MODELS[0]
    const dims = _heroDims(aspectRatio)
    const { data, error: err } = await enhanceImage({
      type: 't2i',
      engine: 'atelier',
      workflow: wf.id,
      prompt: p,
      steps: wf.defaults.steps,
      cfg: wf.defaults.cfg,
      width: dims.width,
      height: dims.height,
    })
    if (err || !data?.imageId) {
      setGenerating(false); setProgress(0)
      notice.error(err || 'Failed to start hero generation')
      return
    }
    const imageId = data.imageId
    // Poll status + logs every 2s. The image-enhance lane sets
    // outputUrl when the worker finishes; we promote that to
    // heroImageUrl. Worker writes log lines under lane='image' to
    // job_logs as it goes (queue → submit → sampler X/Y → upload).
    for (let i = 0; i < 240 && !pollAbortRef.current; i++) {  // 240 × 2s = 8min cap
      await new Promise(r => setTimeout(r, 2000))
      await fetchHeroLogs(imageId)
      const { data: row } = await getImageStatus(imageId)
      if (!row) continue
      setProgress(Math.min(95, 5 + (i * 90 / 60)))
      if (row.status === 'completed' && row.outputUrl) {
        // One last log fetch so the user sees the "✓ done" line
        // before the modal closes.
        await fetchHeroLogs(imageId)
        setHeroImageUrl(row.outputUrl)
        setProgress(100)
        setGenerating(false)
        setGenOpen(false)
        notice.success('Hero image ready — will anchor shot 1.')
        return
      }
      if (row.status === 'failed') {
        await fetchHeroLogs(imageId)
        notice.error(`Hero generation failed: ${row.error || 'unknown'}`)
        setGenerating(false); setProgress(0)
        return
      }
    }
    if (!pollAbortRef.current) {
      notice.error('Hero generation timed out')
      setGenerating(false); setProgress(0)
    }
  }
  const cancelGenerate = () => { pollAbortRef.current = true; setGenerating(false); setProgress(0) }

  const clearHero = () => setHeroImageUrl('')
  const toggleUseHero = (next) => {
    setUseHero(next)
    if (!next && heroImageUrl) clearHero()   // turning off clears the URL → chain T2Vs shot 1
  }

  return (
    <div className="luxe-card p-3 border-line">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">
          <PictureOutlined /> Hero image
        </p>
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={useHero}
            onChange={(e) => toggleUseHero(e.target.checked)}
            className="accent-amber-400"
          />
          <span className={`text-[10px] font-mono ${useHero ? 'text-emerald-300' : 'text-gray-500'}`}>
            {useHero ? 'ON' : 'off'}
          </span>
        </label>
      </div>

      {!useHero ? (
        <p className="text-[11px] text-gray-500">
          Hero disabled — shot 1 will text-to-video from the bible + first shot prompt. Other shots still chain from last-frame.
        </p>
      ) : heroImageUrl ? (
        <div className="space-y-1.5">
          <img src={heroImageUrl} alt="hero" className="w-full aspect-video object-cover rounded border border-line" />
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button" onClick={openGenerator}
              className="text-[10px] flex-1 px-2 py-1 rounded border border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20">
              ↻ Regenerate
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="text-[10px] flex-1 px-2 py-1 rounded border border-line hover:border-line-strong text-fg-muted">
              Replace
            </button>
            <button type="button" onClick={clearHero}
              className="text-[10px] px-2 py-1 rounded border border-rose-500/40 text-rose-300 hover:bg-rose-500/10">
              <DeleteOutlined />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <button type="button" onClick={openGenerator}
            className="w-full text-[11px] py-3 rounded border-2 border-dashed border-amber-400/40 hover:border-amber-400 hover:bg-amber-500/5 text-amber-200 inline-flex items-center justify-center gap-1.5">
            ✨ Generate hero image
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={heroUploading}
            className="w-full text-[11px] py-2 rounded border border-line hover:border-line-strong text-fg-muted inline-flex items-center justify-center gap-1.5">
            {heroUploading ? 'Uploading…' : <><UploadOutlined /> Or upload a frame</>}
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = '' }}
        className="hidden"
      />
      {useHero && (
        <p className="text-[10px] text-gray-500 mt-1">
          Becomes shot 1's source image. Anchors the look so the chain is I2V→I2V→… instead of T2V→I2V→…
        </p>
      )}

      {/* Generator modal — model picker + prompt textarea + AI assist */}
      <Modal
        title="Generate hero image"
        open={genOpen}
        onCancel={() => { if (!generating) setGenOpen(false) }}
        footer={null}
        centered
        width={620}
        maskClosable={!generating}
      >
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1.5">Model</p>
            <div className="grid grid-cols-1 gap-1.5">
              {HERO_T2I_MODELS.map(m => (
                <button key={m.id} type="button"
                  onClick={() => !generating && setModel(m.id)}
                  disabled={generating}
                  className={`text-left p-2 rounded-md border ${
                    model === m.id
                      ? 'border-amber-400/60 bg-amber-500/12 ring-1 ring-amber-400/40'
                      : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                  }`}>
                  <p className="text-xs font-semibold text-white">{m.label}</p>
                  <p className="text-[10px] text-gray-400">{m.blurb}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                Prompt — auto-filled from bible + first shot
              </p>
              <button type="button" onClick={suggestWithAI} disabled={generating || coaching}
                className="text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">
                <BulbOutlined /> {coaching ? 'Polishing…' : 'Suggest with AI'}
              </button>
            </div>
            <Input.TextArea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={generating}
              autoSize={{ minRows: 3, maxRows: 8 }}
              className="!font-mono !text-[12px]"
            />
          </div>

          {generating && (
            <div className="space-y-2">
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-amber-300">Generating · {Math.round(progress)}%</p>
                <div className="h-1.5 rounded bg-gray-800 overflow-hidden">
                  <div className="h-full bg-amber-400 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {/* Live worker log tail — same job_logs stream the AI
                  Video detail page reads, filtered to lane='image'.
                  Newest at the bottom; scrolls to show ~last 12 lines
                  worth of room without growing the modal too tall. */}
              <div className="rounded-md border border-gray-800 bg-black/40 p-2 max-h-48 overflow-y-auto">
                {genLogs.length === 0 ? (
                  <p className="text-[10px] font-mono text-gray-600 py-3 text-center">
                    Waiting for the worker to start the T2I pass…
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {genLogs.slice(-50).map((line, idx) => (
                      <li key={`${line.ts}-${idx}`}
                          className="text-[10px] font-mono leading-snug text-gray-300 break-all">
                        {line.msg || ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            {generating ? (
              <Button variant="secondary" onClick={cancelGenerate}>Cancel</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setGenOpen(false)}>Close</Button>
                <Button variant="primary" onClick={startGenerate}>Generate</Button>
              </>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

function CinemaCard({ item, selectMode, checked, onToggleSelect, onDelete }) {
  const navigate = useNavigate()
  const handleClick = (e) => {
    if (selectMode) { e.preventDefault(); onToggleSelect?.(); return }
    // Anywhere else on the card → open the project detail page so the user
    // sees the master prompt + planned shots + render buttons in one shot.
    if (e.target.closest('button') || e.target.closest('a')) return
    navigate(`/cinema/${encodeURIComponent(item.projectId)}`)
  }
  // Resolve the final mp4 download URL. `outputUrl` is patched onto the
  // cinema_projects row by the BE orchestrator on combine-success
  // (`/api/combine/file/<combineId>`). Prepend VITE_BE_URL so the FE
  // doesn't try to fetch from its own domain.
  const beBase = import.meta.env.VITE_BE_URL || ''
  const downloadHref = item.outputUrl
    ? (item.outputUrl.startsWith('http') ? item.outputUrl : `${beBase}${item.outputUrl}`)
    : null
  return (
    <div onClick={handleClick}
      className={`group relative rounded-lg overflow-hidden border transition-colors bg-gray-900/40 cursor-pointer ${
        checked
          ? 'border-amber-400 ring-2 ring-amber-400/40'
          : 'border-gray-800 hover:border-amber-400/50'
      }`}>
      {/* Video preview thumb (Cloudinary-style) — completed cinemas
          inline-stream the combined mp4 right in the card. Click to
          play; muted + preload="metadata" so the grid stays cheap on
          first paint. Falls back to a flat gradient for non-completed
          rows so the card height stays consistent across statuses. */}
      {item.status === 'completed' && downloadHref ? (
        <video
          src={downloadHref}
          className="w-full aspect-video object-cover bg-black"
          muted
          playsInline
          preload="metadata"
          controls
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="w-full aspect-video bg-gradient-to-br from-amber-500/8 to-fuchsia-500/8 flex items-center justify-center">
          <VideoCameraOutlined className="text-3xl text-amber-300/40" />
        </div>
      )}

      <div className="p-3">
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

        {/* Download chip — only on completed renders. Stop-prop so
            clicking it doesn't fire the card's navigate handler. */}
        {downloadHref && item.status === 'completed' && !selectMode && (
          <a href={downloadHref}
            onClick={(e) => e.stopPropagation()}
            className="mt-2 inline-flex items-center justify-center gap-1 w-full text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/22 transition-colors">
            <DownloadOutlined /> Download mp4
          </a>
        )}
      </div>

      {selectMode && <SelectCheckbox checked={checked} onToggle={onToggleSelect} />}
      {!selectMode && onDelete && (
        // Always visible (was hover-only). Touch users couldn't find it
        // before; the new contract is "delete is one tap away".
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete() }}
          title="Delete this Cinema project"
          aria-label="Delete this Cinema project"
          className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/30 hover:text-rose-100 transition-colors">
          <DeleteOutlined className="text-xs" />
        </button>
      )}
    </div>
  )
}
