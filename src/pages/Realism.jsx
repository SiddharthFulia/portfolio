// /realism — Sandbox / experimental page for Seedance-grade realism.
//
// The point of this page is to teach the user (and us) WHY most
// open-source AI video looks plastic and how to fix it:
//   1. Plain text-to-video gives generic "AI video".
//   2. Image-to-video with a cinematic-quality reference frame +
//      a richly enriched prompt routinely matches Seedance.
//
// Workflow this page enforces:
//   1. User types a basic idea ("a man walking on a wet street at night")
//   2. They pick lens / lighting / grain / tone / motion presets
//   3. We send the base prompt + presets to /api/realism/enrich-prompt
//      which uses Groq to layer in the full cinematic stack (specific
//      physical detail, not buzzwords).
//   4. User can upload a hero image to anchor the first frame (the
//      "image-to-video over text-to-video" secret).
//   5. They submit to the existing /api/ai-video/generate endpoint
//      with the enriched prompt + (optional) hero image URL. We do
//      not touch /api/ai-video logic — we just supply better inputs.
//   6. Result video plays inline + drops into the existing AI Video
//      library on /ai-video.
//
// Future passes can add:
//   - Server-side post-process polish (LUT + grain + chromatic
//     aberration + bloom + subtle motion blur)
//   - PuLID face-consistency upload
//   - RIFE frame interpolation
//   - Real-ESRGAN / SUPIR upscale

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { message } from "antd";
import {
  ExperimentOutlined,
  ThunderboltOutlined,
  CameraOutlined,
  BulbOutlined,
  HighlightOutlined,
  BgColorsOutlined,
  PlayCircleOutlined,
  CloudUploadOutlined,
  ReloadOutlined,
  AppstoreOutlined,
  RocketOutlined,
  CheckCircleFilled,
} from "@ant-design/icons";
import { useVault } from "../contexts/VaultContext";

const BE_URL = import.meta.env.VITE_BE_URL || "http://localhost:4001";

// Provider catalog — model keys match what local-gpu-worker/worker.py
// recognises (verified from MODEL_VRAM_GB + label table at L444+).
//
// We use provider 'local' (NOT 'optimized') because /api/ai-video
// /generate has a mode-based override that REPLACES the model field
// when provider==='optimized' (default 'balanced' → wan-2.2). 'local'
// lane passes opts.model straight through to the worker. So the
// user's pick of Hunyuan / Wan-I2V / LTX actually lands on the model
// they selected.
const MODELS = [
  { key: "wan-2.1-i2v", label: "Wan 2.1 I2V",   note: "14B · best motion fidelity",     duration: 5, provider: "local" },
  { key: "wan-2.2",     label: "Wan 2.2",       note: "5B · faster · text + image",     duration: 5, provider: "local" },
  { key: "hunyuan",     label: "Hunyuan",       note: "Tencent DiT · most cinematic",   duration: 5, provider: "local" },
  { key: "ltx-video",   label: "LTX I2V",       note: "2B distilled · fastest preview", duration: 5, provider: "local" },
];

function vaultHeaders() {
  try {
    const t = localStorage.getItem("sid-vault-token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

const fmtTime = (s) => {
  if (!Number.isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};

export default function Realism() {
  const navigate = useNavigate();
  const { isUnlocked } = useVault();

  const [presets, setPresets] = useState(null);
  const [base, setBase]       = useState("");
  const [lens, setLens]         = useState("35mm-anamorphic");
  const [lighting, setLighting] = useState("golden-hour");
  const [grain, setGrain]       = useState("kodak-vision3");
  const [tone, setTone]         = useState("warm-teal");
  const [motion, setMotion]     = useState("subtle");
  const [model, setModel]       = useState("wan-2.1-i2v");
  const [resolution, setResolution] = useState("720p");
  const [steps, setSteps]       = useState(14);
  const [enrichResult, setEnrichResult] = useState(null);
  const [enriching, setEnriching]       = useState(false);
  const [heroFile, setHeroFile]         = useState(null);
  const [heroPreview, setHeroPreview]   = useState("");
  const heroUrlRef = useRef(null);
  const fileInputRef = useRef(null);

  // Submission + polling state
  const [jobId, setJobId]       = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus]     = useState(null);   // {state, videoUrl, progressMessage}
  const [logs, setLogs]         = useState([]);
  const pollRef = useRef(null);

  // localStorage key for the realism job history. Reading job IDs
  // from here is what powers the Realism library page.
  const HISTORY_KEY = "sid-realism-jobs";
  const pushHistory = (entry) => {
    try {
      const prev = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      const next = [entry, ...prev.filter((p) => p.jobId !== entry.jobId)].slice(0, 100);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    fetch(`${BE_URL}/api/realism/presets`)
      .then((r) => r.json())
      .then((b) => setPresets(b?.data || null))
      .catch(() => {});

    // Resume in-flight job from the most recent history entry.
    // If the user refreshed while the worker was still rendering,
    // we re-attach the poll loop so they don't lose context.
    try {
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      const top = history[0];
      if (top?.jobId) {
        // Probe status once. If the row says completed/failed we just
        // hydrate the UI without polling. If still running, kick off
        // the poll loop fresh.
        fetch(`${BE_URL}/api/ai-video/status/${top.jobId}`, { headers: vaultHeaders() })
          .then((r) => r.json())
          .then((body) => {
            const row = body?.data || body;
            if (!row) return;
            setJobId(top.jobId);
            if (Array.isArray(row.logs)) setLogs(row.logs);
            if (row.status === "completed" && (row.videoUrl || row.video)) {
              setStatus({ state: "completed", videoUrl: row.videoUrl || row.video, progressMessage: "Done." });
            } else if (row.status === "failed") {
              setStatus({ state: "failed", progressMessage: row.error || "Worker reported failure" });
            } else {
              setStatus({ state: row.status || "processing", progressMessage: row.progressMessage || "Resumed — generating…" });
              beginPoll(top.jobId);
            }
          })
          .catch(() => {});
      }
    } catch {}

    return () => {
      if (heroUrlRef.current) URL.revokeObjectURL(heroUrlRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPickHero = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type?.startsWith("image/")) { message.error("Pick an image"); return; }
    if (heroUrlRef.current) URL.revokeObjectURL(heroUrlRef.current);
    const url = URL.createObjectURL(f);
    heroUrlRef.current = url;
    setHeroFile(f);
    setHeroPreview(url);
  };

  const onEnrich = async () => {
    if (!base.trim()) { message.warning("Type a base prompt first"); return; }
    setEnriching(true);
    try {
      const res = await fetch(`${BE_URL}/api/realism/enrich-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...vaultHeaders() },
        body: JSON.stringify({ base, lens, lighting, grain, tone, motion }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
      setEnrichResult(body?.data || body);
    } catch (err) {
      message.error(err.message || "Enrich failed");
    } finally {
      setEnriching(false);
    }
  };

  // Upload the hero image first (existing /api/ai-video/upload-image
  // returns a Cloudinary URL we can hand to /generate as imageUrl).
  const uploadHero = async () => {
    if (!heroFile) return "";
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onload  = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(heroFile);
    });
    const res = await fetch(`${BE_URL}/api/ai-video/upload-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...vaultHeaders() },
      // BE field name is `dataUrl`, not `image` — the handler validates
      // it starts with `data:image/` and forwards to Cloudinary.
      body: JSON.stringify({ dataUrl }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.message || "Hero upload failed");
    // postUploadSourceImage returns { url, publicId, bytes, width, height, format }
    // wrapped in the standard `{ status, data }` envelope.
    return body?.data?.url || body?.url || "";
  };

  // `useEnriched` controls which prompt actually ships when the user
  // hits Generate. Two explicit buttons drive it so they can A/B raw
  // vs enriched without losing the rewrite.
  const onSubmit = async (variant /* 'enriched' | 'raw' */) => {
    const finalPrompt = (variant === "raw")
      ? base.trim()
      : (enrichResult?.enriched?.trim() || base.trim());
    if (!finalPrompt) { message.warning("Type a prompt first"); return; }
    if (!isUnlocked && !heroFile) {
      // not a hard block — many AI Video generations are open lane
    }
    setSubmitting(true);
    setStatus({ state: "queued", progressMessage: "Preparing…" });
    try {
      let imageUrl = "";
      if (heroFile) {
        setStatus({ state: "uploading", progressMessage: "Uploading hero frame…" });
        imageUrl = await uploadHero();
      }
      const m = MODELS.find((x) => x.key === model) || MODELS[0];
      // Negative prompt only travels with the enriched variant — when
      // shipping raw we don't second-guess what the user wrote.
      const negativePrompt = (variant !== "raw" && enrichResult?.negative) ? enrichResult.negative : "";
      const body = {
        prompt:         finalPrompt,
        negativePrompt,
        provider:       m.provider,
        model:          m.key,
        duration:       m.duration,
        resolution:     resolution,
        aspectRatio:    "16:9",
        steps:          steps,
        imageUrl,
        generateCaption: false,
        silentWake:     true,
      };
      const res = await fetch(`${BE_URL}/api/ai-video/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...vaultHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      const newJobId = data?.data?.jobId || data?.data?.videoId;
      if (!newJobId) throw new Error("BE didn't return a jobId");
      setJobId(newJobId);
      setStatus({ state: "processing", progressMessage: "Worker accepted the job — generating…" });
      setLogs([]);
      pushHistory({
        jobId:       newJobId,
        title:       (base || enrichResult.enriched).slice(0, 80),
        model:       m.key,
        resolution,
        steps,
        createdAt:   new Date().toISOString(),
      });
      beginPoll(newJobId);
    } catch (err) {
      setStatus({ state: "failed", progressMessage: err.message });
      message.error(err.message || "Generate failed");
    } finally {
      setSubmitting(false);
    }
  };

  const beginPoll = (id) => {
    const started = Date.now();
    const HARD = 15 * 60 * 1000;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${BE_URL}/api/ai-video/status/${id}`, { headers: vaultHeaders() });
        const body = await res.json();
        const row = body?.data || body;
        // Surface live logs whenever the BE returns them. The
        // /api/ai-video/status/:id endpoint already includes the
        // shared job_logs tail.
        if (Array.isArray(row?.logs)) setLogs(row.logs);
        if (row?.status === "completed" && (row.videoUrl || row.video)) {
          clearInterval(pollRef.current); pollRef.current = null;
          const finalUrl = row.videoUrl || row.video;
          setStatus({ state: "completed", videoUrl: finalUrl, progressMessage: "Done. Saving to local library…" });
          // Mirror to BE local storage so the Realism library reads from
          // disk, not Cloudinary. Tag with vault if user is unlocked.
          const meta = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]").find((p) => p.jobId === id) || {};
          fetch(`${BE_URL}/api/realism/save-from-url`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...vaultHeaders() },
            body: JSON.stringify({
              url:        finalUrl,
              title:      meta.title || "Untitled realism render",
              model:      meta.model || "",
              resolution: meta.resolution || "",
              steps:      meta.steps || null,
              jobId:      id,
            }),
          }).then((r) => r.json()).then((body) => {
            if (body?.status) {
              setStatus({ state: "completed", videoUrl: finalUrl, progressMessage: "Saved to library." });
            }
          }).catch(() => {});
        } else if (row?.status === "failed") {
          clearInterval(pollRef.current); pollRef.current = null;
          setStatus({ state: "failed", progressMessage: row.error || "Worker reported failure" });
        } else if (Date.now() - started > HARD) {
          clearInterval(pollRef.current); pollRef.current = null;
          setStatus({ state: "failed", progressMessage: "Timed out (>15 min)" });
        } else {
          setStatus((prev) => ({
            ...(prev || {}),
            state: row?.status || "processing",
            progressMessage: row?.progressMessage || row?.message || prev?.progressMessage || "Generating…",
          }));
        }
      } catch (_) {}
    }, 3000);
  };

  const reset = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (heroUrlRef.current) URL.revokeObjectURL(heroUrlRef.current);
    heroUrlRef.current = null;
    setBase(""); setEnrichResult(null);
    setHeroFile(null); setHeroPreview("");
    setJobId(null); setStatus(null);
  };

  return (
    <div className="relative min-h-screen w-full bg-[var(--luxe-bg-base)] text-fg-primary pt-24 sm:pt-32 pb-16 px-4 sm:px-6 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] rounded-full bg-rose-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[40vw] h-[40vw] rounded-full bg-amber-500/8 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-rose-300/80">
                — Realism lab · sandbox
              </p>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-rose-500/10 ring-1 ring-rose-400/30 text-rose-200">
                <span className="w-1 h-1 rounded-full bg-rose-300 animate-pulse" />
                Experimental · doesn’t touch AI Video
              </span>
            </div>
            <h1 className="font-poppins font-black tracking-tight text-3xl sm:text-4xl md:text-5xl">
              Seedance-grade <span className="text-rose-500">realism</span>
            </h1>
            <p className="mt-2 text-sm text-gray-400 max-w-3xl">
              The reason Seedance looks insane isn’t the model — it’s the pipeline.
              This lab enforces it: a richly enriched cinematic prompt + an optional
              hero frame + image-to-video over text-to-video. Open-source video that
              actually looks shot, not generated.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/realism/library")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-semibold transition-colors"
            >
              <AppstoreOutlined /> Realism library
            </button>
            <button
              onClick={() => navigate("/ai-video")}
              title="Production AI Video library"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs transition-colors"
            >
              AI Video
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Left — prompt + enrich + result */}
          <div className="lg:col-span-3 space-y-5">
            {/* Base prompt */}
            <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center gap-2 mb-3">
                <ExperimentOutlined className="text-rose-300" />
                <p className="text-sm font-semibold text-white">Base prompt</p>
                <span className="ml-auto text-[11px] text-gray-500">Plain English. We layer the cinematic stack for you.</span>
              </div>
              <textarea
                rows={8}
                value={base}
                onChange={(e) => setBase(e.target.value.slice(0, 5000))}
                placeholder="A young woman pauses on a wet city street at night, neon signs reflecting off the puddles. She glances at her phone, then over her shoulder."
                className="w-full bg-white/[0.03] ring-1 ring-white/10 focus:ring-rose-400/40 outline-none rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 leading-relaxed resize-y min-h-[120px]"
              />
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  onClick={onEnrich}
                  disabled={enriching || !base.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold transition-colors"
                >
                  {enriching ? <ReloadOutlined spin /> : <ThunderboltOutlined />}
                  {enriching ? "Enriching…" : "Enrich for realism"}
                </button>
                <span className="text-[11px] text-gray-500">
                  Groq llama-3.3-70b · rewrite scales with input length
                </span>
                <span className={`ml-auto text-[10px] font-mono ${base.length >= 4800 ? 'text-amber-300' : 'text-gray-500'}`}>
                  {base.length.toLocaleString()} / 5,000 chars
                </span>
              </div>
            </div>

            {/* Enriched output */}
            {enrichResult && (
              <div className="rounded-2xl ring-1 ring-rose-400/30 bg-gradient-to-br from-rose-500/5 to-amber-500/5 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircleFilled className="text-rose-300" />
                  <p className="text-sm font-semibold text-white">Cinematic rewrite</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(enrichResult.enriched).then(() => message.success("Copied"))}
                    className="ml-auto text-[11px] text-gray-400 hover:text-white"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-[12px] text-gray-200 leading-relaxed whitespace-pre-wrap">
                  {enrichResult.enriched}
                </p>
                {enrichResult.negative && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-[10px] uppercase tracking-[0.22em] font-mono text-rose-300/80 mb-1">Negative</p>
                    <p className="text-[11px] text-gray-400">{enrichResult.negative}</p>
                  </div>
                )}
                {enrichResult.breakdown && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px]">
                    {Object.entries(enrichResult.breakdown).map(([k, v]) => (
                      <div key={k} className="rounded-lg px-2 py-1.5 ring-1 ring-white/10 bg-white/[0.02]">
                        <p className="font-mono uppercase tracking-[0.18em] text-gray-500">{k}</p>
                        <p className="text-gray-300 mt-0.5 truncate" title={v}>{v}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Result */}
            {status && (
              <div className="rounded-2xl ring-1 ring-white/10 bg-black overflow-hidden">
                {status.state === "completed" && status.videoUrl ? (
                  <video src={status.videoUrl} controls autoPlay loop className="w-full aspect-video bg-black" />
                ) : (
                  <div className="aspect-video bg-black grid place-items-center text-center px-4">
                    <div>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 ring-1 ring-rose-400/30 text-rose-200 text-[11px] mb-3 font-mono uppercase tracking-[0.2em]">
                        {status.state === "failed" ? "failed" : "processing"}
                      </div>
                      <p className="text-sm text-gray-200">{status.progressMessage}</p>
                      {status.state !== "failed" && jobId && (
                        <button
                          onClick={() => navigate(`/realism/job/${jobId}`)}
                          className="mt-2 text-[10px] text-rose-300 hover:text-rose-200 underline"
                        >
                          Open full job page ·   {jobId.slice(0, 12)}…
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Live log strip */}
            {jobId && logs.length > 0 && (
              <div className="rounded-2xl ring-1 ring-white/10 bg-black/40 backdrop-blur p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                  <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-gray-400">
                    Live · worker
                  </p>
                  {jobId && (
                    <button
                      onClick={() => navigate(`/realism/job/${jobId}`)}
                      className="ml-auto text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500 hover:text-gray-200"
                    >
                      open full →
                    </button>
                  )}
                </div>
                <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1 text-[11px] font-mono leading-snug">
                  {logs.slice(-14).map((line, i) => {
                    const msg = typeof line === "string" ? line : (line?.msg ?? line?.message ?? String(line));
                    const ts  = typeof line === "object" && line?.ts ? new Date(line.ts) : null;
                    const isErr = /error|failed|exception/i.test(msg);
                    return (
                      <div key={i} className={`flex gap-2 ${isErr ? "text-rose-300" : "text-gray-300"}`}>
                        {ts && (
                          <span className="text-gray-600 shrink-0">
                            {ts.toLocaleTimeString([], { hour12: false }).slice(3)}
                          </span>
                        )}
                        <span className="break-all">{msg}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right — controls */}
          <div className="lg:col-span-2 space-y-5">
            <PresetCard
              icon={<CameraOutlined />} title="Lens"
              entries={presets?.lens || []} value={lens} onPick={setLens}
            />
            <PresetCard
              icon={<BulbOutlined />} title="Lighting"
              entries={presets?.lighting || []} value={lighting} onPick={setLighting}
            />
            <PresetCard
              icon={<HighlightOutlined />} title="Grain"
              entries={presets?.grain || []} value={grain} onPick={setGrain}
            />
            <PresetCard
              icon={<BgColorsOutlined />} title="Color grade"
              entries={presets?.tone || []} value={tone} onPick={setTone}
            />
            <PresetCard
              icon={<PlayCircleOutlined />} title="Motion"
              entries={presets?.motion || []} value={motion} onPick={setMotion}
            />

            {/* Hero frame */}
            <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center gap-2 mb-3">
                <CloudUploadOutlined className="text-rose-300" />
                <p className="text-sm font-semibold text-white">Hero frame · I2V anchor</p>
                {heroFile && (
                  <button
                    onClick={() => { setHeroFile(null); setHeroPreview(""); if (heroUrlRef.current) URL.revokeObjectURL(heroUrlRef.current); heroUrlRef.current = null; }}
                    className="ml-auto text-[11px] text-gray-400 hover:text-white"
                  >Remove</button>
                )}
              </div>
              <p className="text-[11px] text-gray-500 mb-3">
                The biggest realism win. Start from a curated frame (Flux Dev,
                Photoshop, a real photo) — I2V then animates it instead of
                inventing every pixel from text.
              </p>
              {heroPreview ? (
                <img src={heroPreview} alt="Hero" className="w-full rounded-lg ring-1 ring-white/10" />
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-3 py-6 rounded-lg ring-1 ring-dashed ring-white/15 hover:ring-rose-400/40 text-[11px] text-gray-300 hover:text-white text-center"
                >
                  Drop a hero image · PNG / JPG
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickHero} />
            </div>

            {/* Model */}
            <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center gap-2 mb-3">
                <RocketOutlined className="text-rose-300" />
                <p className="text-sm font-semibold text-white">Animator</p>
              </div>
              <div className="space-y-1.5">
                {MODELS.map((m) => {
                  const active = model === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => setModel(m.key)}
                      className={`w-full text-left px-3 py-2 rounded-lg ring-1 transition-colors ${
                        active ? "ring-rose-400 bg-rose-500/15" : "ring-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                      }`}
                    >
                      <p className={`text-xs font-semibold ${active ? "text-rose-200" : "text-white"}`}>{m.label}</p>
                      <p className="text-[10px] text-gray-500">{m.note} · {fmtTime(m.duration)}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Resolution */}
            <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center gap-2 mb-3">
                <ExperimentOutlined className="text-rose-300" />
                <p className="text-sm font-semibold text-white">Resolution</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "480p",  label: "480p",  note: "Fast" },
                  { key: "720p",  label: "720p",  note: "Default" },
                  { key: "1080p", label: "1080p", note: "Heavy" },
                ].map((r) => {
                  const active = resolution === r.key;
                  return (
                    <button key={r.key} onClick={() => setResolution(r.key)}
                      className={`px-3 py-2 rounded-lg text-center transition-all ring-1 ${active ? "ring-rose-400 bg-rose-500/15" : "ring-white/10 bg-white/[0.02] hover:bg-white/[0.05]"}`}>
                      <p className={`text-xs font-mono ${active ? "text-rose-200" : "text-white"}`}>{r.label}</p>
                      <p className="text-[10px] text-gray-500">{r.note}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Iterations (steps) */}
            <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center gap-2 mb-2">
                <ThunderboltOutlined className="text-rose-300" />
                <p className="text-sm font-semibold text-white">Iterations</p>
                <span className="ml-auto text-[11px] text-gray-400 font-mono">{steps} steps</span>
              </div>
              <input
                type="range" min={4} max={60} step={1} value={steps}
                onChange={(e) => setSteps(parseInt(e.target.value, 10))}
                className="w-full accent-rose-500"
              />
              <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono mt-1">
                <span>4 · preview</span>
                <span>14 · default</span>
                <span>60 · max</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-2">
                More steps = more sampling passes = cleaner motion + detail, longer
                render time. {steps >= 30 ? "≈ slow (1-3 min)" : steps >= 18 ? "≈ medium" : "≈ fast"}.
              </p>
            </div>

            {/* Submit — two buttons when both raw + enriched are
                available so you can A/B them without losing the
                rewrite. Only one button (raw) when there's no
                enrichment yet. */}
            <div className="rounded-2xl ring-1 ring-rose-400/30 bg-gradient-to-br from-rose-500/10 to-amber-500/5 p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] font-mono text-rose-300 mb-2">Generate</p>
              <p className="text-xs text-gray-300 mb-4">
                Submits to the same /api/ai-video/generate worker the main AI Video
                page uses. {enrichResult?.enriched
                  ? "Try both — raw is faster to test, enriched usually looks more cinematic."
                  : "Ship your prompt as-is, or click Enrich first for the cinematic rewrite."}
              </p>

              {/* Enriched submit (only when enrichment exists) */}
              {enrichResult?.enriched && (
                <button
                  onClick={() => onSubmit("enriched")}
                  disabled={submitting || (status && status.state !== "failed" && status.state !== "completed")}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-sm transition-colors"
                >
                  {submitting ? <ReloadOutlined spin /> : <RocketOutlined />}
                  Generate · enriched rewrite
                </button>
              )}

              {/* Raw submit — always available when base is non-empty */}
              <button
                onClick={() => onSubmit("raw")}
                disabled={submitting || !base.trim() || (status && status.state !== "failed" && status.state !== "completed")}
                className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-colors disabled:bg-gray-700 disabled:text-gray-500
                  ${enrichResult?.enriched
                    ? "mt-2 border border-rose-400/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-100"
                    : "bg-rose-500 hover:bg-rose-400 text-white"
                  }`}
              >
                {submitting ? <ReloadOutlined spin /> : <RocketOutlined />}
                Generate · raw prompt
              </button>

              <button
                onClick={reset}
                className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/15 text-gray-300 hover:text-white hover:bg-white/[0.04] text-xs"
              >
                Start over
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PresetCard({ icon, title, entries, value, onPick }) {
  return (
    <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-rose-300">{icon}</span>
        <p className="text-xs font-semibold text-white">{title}</p>
      </div>
      <div className="space-y-1">
        {entries.length === 0 ? (
          <p className="text-[11px] text-gray-500">Loading…</p>
        ) : entries.map((e) => {
          const active = value === e.key;
          return (
            <button
              key={e.key}
              onClick={() => onPick(e.key)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md ring-1 transition-colors ${
                active ? "ring-rose-400 bg-rose-500/15" : "ring-transparent hover:bg-white/[0.04]"
              }`}
            >
              <p className={`text-[11px] font-mono ${active ? "text-rose-200" : "text-gray-300"}`}>{e.key}</p>
              <p className="text-[10px] text-gray-500 truncate">{e.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
