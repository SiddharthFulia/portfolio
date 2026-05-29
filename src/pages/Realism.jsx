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

// Provider catalog — only the I2V-capable lanes show up here.
// 'optimized' is the FE label that resolves to the 5090 worker on
// the existing /api/ai-video/generate endpoint.
const MODELS = [
  { key: "wan-i2v",     label: "Wan 2.1 I2V",   note: "14B · best motion fidelity",     duration: 5, provider: "optimized" },
  { key: "hunyuan-i2v", label: "Hunyuan I2V",   note: "13B DiT · most cinematic",       duration: 5, provider: "optimized" },
  { key: "ltx-video",   label: "LTX I2V",       note: "2B distilled · fastest preview", duration: 5, provider: "optimized" },
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
  const [model, setModel]       = useState("wan-i2v");
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
  const pollRef = useRef(null);

  useEffect(() => {
    fetch(`${BE_URL}/api/realism/presets`)
      .then((r) => r.json())
      .then((b) => setPresets(b?.data || null))
      .catch(() => {});
    return () => {
      if (heroUrlRef.current) URL.revokeObjectURL(heroUrlRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
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
      body: JSON.stringify({ image: dataUrl }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.message || "Hero upload failed");
    return body?.data?.url || body?.url || "";
  };

  const onSubmit = async () => {
    if (!enrichResult?.enriched) { message.warning("Enrich the prompt first"); return; }
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
      const body = {
        prompt:         enrichResult.enriched,
        negativePrompt: enrichResult.negative || "",
        provider:       m.provider,
        model:          m.key,
        duration:       m.duration,
        resolution:     "720p",
        aspectRatio:    "16:9",
        steps:          14,
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
        if (row?.status === "completed" && (row.videoUrl || row.video)) {
          clearInterval(pollRef.current); pollRef.current = null;
          setStatus({ state: "completed", videoUrl: row.videoUrl || row.video, progressMessage: "Done." });
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
    }, 4000);
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
    <div className="relative min-h-screen w-full bg-[#05050a] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 sm:px-6 overflow-hidden">
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
          <button
            onClick={() => navigate("/ai-video")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-white text-sm font-semibold transition-colors"
          >
            <AppstoreOutlined /> AI Video library
          </button>
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
                rows={3}
                value={base}
                onChange={(e) => setBase(e.target.value.slice(0, 600))}
                placeholder="A young woman pauses on a wet city street at night, neon signs reflecting off the puddles. She glances at her phone, then over her shoulder."
                className="w-full bg-white/[0.03] ring-1 ring-white/10 focus:ring-rose-400/40 outline-none rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 leading-relaxed"
              />
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={onEnrich}
                  disabled={enriching || !base.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold transition-colors"
                >
                  {enriching ? <ReloadOutlined spin /> : <ThunderboltOutlined />}
                  {enriching ? "Enriching…" : "Enrich for realism"}
                </button>
                <span className="text-[11px] text-gray-500">
                  Groq llama-3.3-70b · 180-260 word cinematic rewrite
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
                      {status.state !== "failed" && (
                        <p className="text-[10px] text-gray-500 mt-1">Polling every 4s · jobId {jobId?.slice(0, 8)}…</p>
                      )}
                    </div>
                  </div>
                )}
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

            {/* Submit */}
            <div className="rounded-2xl ring-1 ring-rose-400/30 bg-gradient-to-br from-rose-500/10 to-amber-500/5 p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] font-mono text-rose-300 mb-2">Generate</p>
              <p className="text-xs text-gray-300 mb-4">
                Submits to the same /api/ai-video/generate worker the main AI Video
                page uses. The realism comes from the enriched prompt + optional hero
                frame, not from a different model.
              </p>
              <button
                onClick={onSubmit}
                disabled={submitting || !enrichResult?.enriched || (status && status.state !== "failed" && status.state !== "completed")}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-sm transition-colors"
              >
                {submitting ? <ReloadOutlined spin /> : <RocketOutlined />}
                {submitting ? "Submitting…" : "Generate realistic video"}
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
