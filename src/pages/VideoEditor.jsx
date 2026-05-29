// /edit — Simple multi-clip in-browser editor.
//
// Drop one or more clips, trim each, choose join order, pick an
// aspect / custom crop, set quality + FPS, drop in music, hit Save.
// The BE concatenates → crops → encodes → writes to the library.
//
// All editing decisions are tiny JSON (start/end/order/crop/aspect/
// quality/fps/musicVolume) sent alongside the source files in one
// multipart POST. ffmpeg does all the heavy work server-side.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, message } from "antd";
import {
  InboxOutlined,
  ScissorOutlined,
  PlayCircleOutlined,
  AppstoreOutlined,
  ReloadOutlined,
  CloudUploadOutlined,
  SaveOutlined,
  SoundOutlined,
  PicCenterOutlined,
  CheckCircleFilled,
  PlusOutlined,
  MenuOutlined,
  CloseOutlined,
  ThunderboltOutlined,
  HourglassOutlined,
} from "@ant-design/icons";
import { useVault } from "../contexts/VaultContext";

const { Dragger } = Upload;

const BE_URL = import.meta.env.VITE_BE_URL || "http://localhost:4001";
const MAX_BYTES = 500 * 1024 * 1024;

const ASPECT_OPTIONS = [
  { key: "source", label: "Source", note: "Keep original" },
  { key: "16:9",   label: "16:9",   note: "YouTube" },
  { key: "9:16",   label: "9:16",   note: "Reels / Shorts" },
  { key: "1:1",    label: "1:1",    note: "Instagram" },
  { key: "4:5",    label: "4:5",    note: "Feed post" },
  { key: "custom", label: "Custom", note: "Draw a box" },
];

const QUALITY_OPTIONS = [
  { key: "fast",     label: "Fast",     crf: 26, preset: "veryfast", note: "Smaller file" },
  { key: "balanced", label: "Balanced", crf: 22, preset: "medium",   note: "Default" },
  { key: "high",     label: "High",     crf: 18, preset: "slow",     note: "Sharper" },
  { key: "max",      label: "Max",      crf: 14, preset: "slow",     note: "Heaviest" },
];

const FPS_OPTIONS = [
  { key: "source", label: "Source", note: "Don’t touch" },
  { key: "24",     label: "24",     note: "Cinematic" },
  { key: "30",     label: "30",     note: "Standard" },
  { key: "60",     label: "60",     note: "Smooth"  },
  { key: "120",    label: "120",    note: "Slow-mo source" },
];

function vaultHeaders() {
  try {
    const t = localStorage.getItem("sid-vault-token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

const fmtTime = (sec) => {
  if (!Number.isFinite(sec)) return "—:—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const fmtBytes = (b) => {
  if (!b && b !== 0) return "—";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// Each clip: { id, file, url, duration, trimStart, trimEnd,
//              trimMode: 'keep'|'remove' }
//   'keep'   — output = [trimStart, trimEnd] (default)
//   'remove' — output = [0, trimStart] + [trimEnd, duration]
function newClipFromFile(file) {
  const url = URL.createObjectURL(file);
  return {
    id: crypto.randomUUID(),
    file,
    url,
    name:      file.name,
    bytes:     file.size,
    duration:  0,
    trimStart: 0,
    trimEnd:   0,
    trimMode:  "keep",
  };
}

export default function VideoEditor() {
  const navigate = useNavigate();
  const { isUnlocked } = useVault();

  const videoRef    = useRef(null);
  const audioUrlRef = useRef(null);

  const [clips, setClips]         = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [aspect, setAspect]       = useState("source");
  const [customCrop, setCustomCrop] = useState(null);
  const [drawing, setDrawing]     = useState(false);
  const drawStartRef = useRef(null);
  const cropLayerRef = useRef(null);
  const [musicFile, setMusicFile] = useState(null);
  const [musicPreview, setMusicPreview] = useState("");
  const [musicVolume, setMusicVolume]   = useState(0.7);
  const [quality, setQuality]   = useState("balanced");
  const [fps, setFps]           = useState("source");
  const [title, setTitle]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [savedItem, setSavedItem] = useState(null);

  const activeClip = clips[activeIdx] || null;

  useEffect(() => () => {
    clips.forEach((c) => { if (c.url) URL.revokeObjectURL(c.url); });
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptClip = (f) => {
    if (!f) return false;
    if (!f.type?.startsWith("video/")) { message.error("Pick a video file"); return false; }
    if (f.size > MAX_BYTES) { message.error(`File over 500 MB (${fmtBytes(f.size)})`); return false; }
    const clip = newClipFromFile(f);
    setClips((prev) => [...prev, clip]);
    setActiveIdx(clips.length);
    if (clips.length === 0) setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 80));
    setSavedItem(null);
    return false;
  };

  const acceptMusic = (f) => {
    if (!f) return false;
    if (!f.type?.startsWith("audio/")) { message.error("Pick an audio file"); return false; }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(f);
    audioUrlRef.current = url;
    setMusicFile(f);
    setMusicPreview(url);
    return false;
  };

  const reset = () => {
    clips.forEach((c) => { if (c.url) URL.revokeObjectURL(c.url); });
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setClips([]); setActiveIdx(0);
    setAspect("source"); setCustomCrop(null);
    setMusicFile(null); setMusicPreview("");
    setQuality("balanced"); setFps("source");
    setTitle(""); setSavedItem(null);
  };

  const removeClip = (id) => {
    setClips((prev) => {
      const ix = prev.findIndex((c) => c.id === id);
      if (ix === -1) return prev;
      if (prev[ix].url) URL.revokeObjectURL(prev[ix].url);
      const next = prev.filter((c) => c.id !== id);
      return next;
    });
    if (activeIdx >= clips.length - 1) setActiveIdx(Math.max(0, clips.length - 2));
  };

  const moveClip = (idx, dir) => {
    setClips((prev) => {
      const next = [...prev];
      const ni = idx + dir;
      if (ni < 0 || ni >= next.length) return prev;
      [next[idx], next[ni]] = [next[ni], next[idx]];
      return next;
    });
    setActiveIdx((cur) => (cur === idx ? idx + dir : cur === idx + dir ? idx : cur));
  };

  const updateClip = (id, patch) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const onLoadedMeta = () => {
    const v = videoRef.current;
    if (!v || !activeClip) return;
    const d = v.duration || 0;
    if (activeClip.duration === 0) {
      updateClip(activeClip.id, { duration: d, trimEnd: d });
    }
  };

  const seekPreview = (t) => {
    const v = videoRef.current;
    if (v) try { v.currentTime = Math.max(0, Math.min(activeClip?.duration || 0, t)); } catch {}
  };

  // Custom crop drawing
  const eventPct = (e) => {
    const layer = cropLayerRef.current;
    if (!layer) return { x: 0, y: 0 };
    const r = layer.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(1, (cx - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (cy - r.top)  / r.height)),
    };
  };
  const onCropDown = (e) => {
    if (aspect !== "custom") return;
    e.preventDefault();
    const p = eventPct(e); drawStartRef.current = p;
    setCustomCrop({ x: p.x, y: p.y, w: 0, h: 0 }); setDrawing(true);
  };
  const onCropMove = (e) => {
    if (!drawing || !drawStartRef.current) return;
    e.preventDefault();
    const p = eventPct(e), s = drawStartRef.current;
    setCustomCrop({
      x: Math.min(s.x, p.x), y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y),
    });
  };
  const onCropUp = () => {
    if (!drawing) return;
    setDrawing(false);
    setCustomCrop((c) => (!c || c.w < 0.02 || c.h < 0.02) ? null : c);
  };

  const onSave = async () => {
    if (clips.length === 0) return;
    setSaving(true);
    try {
      const fd = new FormData();
      clips.forEach((c) => fd.append("clips", c.file, c.name));
      if (musicFile) fd.append("music", musicFile);
      fd.append("title",       title || "Untitled edit");
      fd.append("aspectRatio", aspect);
      fd.append("quality",     quality);
      fd.append("fps",         fps);
      fd.append("musicVolume", String(musicVolume));
      const segments = clips.map((c) => ({
        trimStart: c.trimStart || 0,
        trimEnd:   c.trimEnd   || c.duration || 0,
        duration:  c.duration  || 0,
        trimMode:  c.trimMode  || "keep",
      }));
      fd.append("segments", JSON.stringify(segments));
      if (aspect === "custom" && customCrop) {
        fd.append("cropX", String(customCrop.x));
        fd.append("cropY", String(customCrop.y));
        fd.append("cropW", String(customCrop.w));
        fd.append("cropH", String(customCrop.h));
      }

      const res = await fetch(`${BE_URL}/api/edit/process`, {
        method: "POST", body: fd, headers: { ...vaultHeaders() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || `Save failed: ${res.status}`);
      const item = body?.data || body;
      setSavedItem(item);
      message.success("Saved to your library");
    } catch (e) {
      message.error(e.message || "Save failed");
    } finally { setSaving(false); }
  };

  const totalKeptSec = useMemo(() => {
    return clips.reduce((acc, c) => {
      const d = c.duration || 0;
      const s = c.trimStart || 0;
      const e = c.trimEnd   || d;
      if (c.trimMode === "remove") return acc + s + (d - e);
      return acc + Math.max(0, e - s);
    }, 0);
  }, [clips]);

  return (
    <div className="relative min-h-screen w-full bg-[#05050a] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 sm:px-6 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] rounded-full bg-rose-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[40vw] h-[40vw] rounded-full bg-amber-500/8 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-rose-300/80">— Video editor</p>
            <h1 className="mt-2 font-poppins font-black tracking-tight text-3xl sm:text-4xl md:text-5xl">
              Trim · join · crop · render
            </h1>
            <p className="mt-2 text-sm text-gray-400 max-w-2xl">
              Drop one or many clips, trim each one (keep a section, or cut a section
              out), reorder, set the output aspect or draw a custom crop, choose quality
              + fps, drop in music, save. The server runs ffmpeg and the finished MP4 lands
              in your library.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => navigate("/edit/advanced")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-400/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-100 font-semibold transition-colors"
            >
              Timeline editor →
            </button>
            <button
              onClick={() => navigate("/edit/library")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-white font-semibold transition-colors"
            >
              <AppstoreOutlined /> My Library
            </button>
          </div>
        </header>

        {clips.length === 0 ? (
          <Dragger
            accept="video/*"
            multiple
            maxCount={20}
            beforeUpload={acceptClip}
            showUploadList={false}
            className="!bg-white/[0.02] !border-white/10 hover:!border-rose-400/40 rounded-3xl"
          >
            <p className="ant-upload-drag-icon !text-rose-300">
              <InboxOutlined style={{ fontSize: 56 }} />
            </p>
            <p className="ant-upload-text !text-white !text-lg !font-semibold">
              Drag one or many videos, or click to pick
            </p>
            <p className="ant-upload-hint !text-gray-400 !text-xs mt-2">
              MP4 · MOV · WEBM · MKV  ·  max 500 MB per file
            </p>
          </Dragger>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Preview + per-clip trim */}
            <div className="lg:col-span-3 space-y-4">
              <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 bg-black aspect-video">
                {activeClip ? (
                  <video
                    ref={videoRef}
                    key={activeClip.id}
                    src={activeClip.url}
                    controls={aspect !== "custom"}
                    playsInline
                    className="w-full h-full object-contain bg-black"
                    onLoadedMetadata={onLoadedMeta}
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-gray-500 text-sm">
                    Pick a clip to preview
                  </div>
                )}
                {aspect === "custom" && activeClip && (
                  <div
                    ref={cropLayerRef}
                    className="absolute inset-0 cursor-crosshair touch-none"
                    onMouseDown={onCropDown} onMouseMove={onCropMove}
                    onMouseUp={onCropUp} onMouseLeave={onCropUp}
                    onTouchStart={onCropDown} onTouchMove={onCropMove} onTouchEnd={onCropUp}
                  >
                    {customCrop && (
                      <>
                        <div className="absolute inset-0 pointer-events-none" style={{
                          background: `linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55))`,
                          clipPath:   `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${customCrop.y*100}%, ${customCrop.x*100}% ${customCrop.y*100}%, ${customCrop.x*100}% ${(customCrop.y+customCrop.h)*100}%, ${(customCrop.x+customCrop.w)*100}% ${(customCrop.y+customCrop.h)*100}%, ${(customCrop.x+customCrop.w)*100}% ${customCrop.y*100}%, 0 ${customCrop.y*100}%)`,
                        }} />
                        <div className="absolute ring-2 ring-rose-400 pointer-events-none" style={{
                          left: `${customCrop.x*100}%`, top: `${customCrop.y*100}%`,
                          width: `${customCrop.w*100}%`, height: `${customCrop.h*100}%`,
                          boxShadow: "0 0 0 1px rgba(0,0,0,0.6) inset",
                        }}>
                          {[{t:0,l:0},{t:0,r:0},{b:0,l:0},{b:0,r:0}].map((c, i) => (
                            <span key={i} className="absolute w-2.5 h-2.5 bg-rose-400 rounded-sm" style={{
                              top: c.t!=null?'-5px':undefined, bottom: c.b!=null?'-5px':undefined,
                              left: c.l!=null?'-5px':undefined, right: c.r!=null?'-5px':undefined,
                            }} />
                          ))}
                        </div>
                      </>
                    )}
                    {!customCrop && (
                      <div className="absolute inset-0 grid place-items-center pointer-events-none">
                        <div className="rounded-xl px-3 py-1.5 bg-black/60 backdrop-blur-md ring-1 ring-rose-400/40 text-rose-100 text-[11px] font-mono uppercase tracking-[0.2em]">
                          Click + drag to crop
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Trim panel for the active clip */}
              {activeClip && (
                <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <ScissorOutlined className="text-rose-300" />
                    <p className="text-sm font-semibold text-white">
                      Clip {activeIdx + 1} · {activeClip.name.length > 28 ? activeClip.name.slice(0, 26) + "…" : activeClip.name}
                    </p>
                    <div className="ml-auto inline-flex items-center gap-1 text-[11px]">
                      <button
                        onClick={() => updateClip(activeClip.id, { trimMode: "keep" })}
                        className={`px-2 py-1 rounded-md ${activeClip.trimMode === "keep" ? "bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/40" : "text-gray-400 hover:text-white"}`}
                      >
                        Keep
                      </button>
                      <button
                        onClick={() => updateClip(activeClip.id, { trimMode: "remove" })}
                        className={`px-2 py-1 rounded-md ${activeClip.trimMode === "remove" ? "bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/40" : "text-gray-400 hover:text-white"}`}
                        title="Cut the section out, save the rest"
                      >
                        Cut out
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 mb-2">
                    {activeClip.trimMode === "remove"
                      ? "We cut THIS range out and stitch the rest together."
                      : "We keep THIS range and drop the rest."}
                    {" "}Range: {fmtTime(activeClip.trimStart)} → {fmtTime(activeClip.trimEnd || activeClip.duration)}
                  </p>
                  <label className="block text-[10px] uppercase tracking-[0.18em] font-mono text-gray-500 mb-1">
                    Start · {fmtTime(activeClip.trimStart)}
                  </label>
                  <input
                    type="range" min={0} max={Math.max(1, activeClip.duration)} step={0.1}
                    value={activeClip.trimStart}
                    onChange={(e) => {
                      const v = Math.min(parseFloat(e.target.value), (activeClip.trimEnd || activeClip.duration) - 0.1);
                      updateClip(activeClip.id, { trimStart: v }); seekPreview(v);
                    }}
                    className="w-full accent-rose-500"
                  />
                  <label className="block text-[10px] uppercase tracking-[0.18em] font-mono text-gray-500 mt-3 mb-1">
                    End · {fmtTime(activeClip.trimEnd || activeClip.duration)}
                  </label>
                  <input
                    type="range" min={0} max={Math.max(1, activeClip.duration)} step={0.1}
                    value={activeClip.trimEnd || activeClip.duration}
                    onChange={(e) => {
                      const v = Math.max(parseFloat(e.target.value), activeClip.trimStart + 0.1);
                      updateClip(activeClip.id, { trimEnd: v }); seekPreview(v);
                    }}
                    className="w-full accent-rose-500"
                  />
                </div>
              )}

              {/* Music */}
              <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <SoundOutlined className="text-rose-300" />
                  <p className="text-sm font-semibold text-white">Music · optional</p>
                  {musicFile && (
                    <button
                      onClick={() => { setMusicFile(null); setMusicPreview(""); if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }}
                      className="ml-auto text-[11px] text-gray-400 hover:text-white"
                    >Remove</button>
                  )}
                </div>
                {!musicFile ? (
                  <Dragger
                    accept="audio/*" maxCount={1} beforeUpload={acceptMusic} showUploadList={false}
                    className="!bg-white/[0.02] !border-white/10 hover:!border-rose-400/40 !rounded-xl"
                  >
                    <p className="ant-upload-drag-icon !text-rose-300"><CloudUploadOutlined style={{ fontSize: 28 }} /></p>
                    <p className="ant-upload-text !text-white !text-sm">Drop a music track here</p>
                    <p className="ant-upload-hint !text-gray-500 !text-[11px] mt-1">MP3 · WAV · M4A · OGG</p>
                  </Dragger>
                ) : (
                  <div>
                    <p className="text-xs text-gray-300 truncate" title={musicFile.name}>{musicFile.name} · {fmtBytes(musicFile.size)}</p>
                    <audio src={musicPreview} controls className="w-full mt-2" />
                    <label className="block text-[10px] uppercase tracking-[0.18em] font-mono text-gray-500 mt-3 mb-1">
                      Mix level · {Math.round(musicVolume * 100)}%
                    </label>
                    <input type="range" min={0} max={1} step={0.05} value={musicVolume}
                      onChange={(e) => setMusicVolume(parseFloat(e.target.value))} className="w-full accent-rose-500" />
                  </div>
                )}
              </div>
            </div>

            {/* Right stack */}
            <div className="lg:col-span-2 space-y-5">
              {/* Clip list */}
              <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <MenuOutlined className="text-rose-300" />
                  <p className="text-sm font-semibold text-white">Clips · {clips.length}</p>
                  <span className="ml-auto text-[11px] text-gray-500">
                    output ≈ {fmtTime(totalKeptSec)}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {clips.map((c, i) => (
                    <li
                      key={c.id}
                      onClick={() => setActiveIdx(i)}
                      className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                        activeIdx === i ? "bg-rose-500/10 ring-1 ring-rose-400/40" : "hover:bg-white/[0.04] ring-1 ring-transparent"
                      }`}
                    >
                      <span className="w-6 text-center text-[11px] font-mono text-gray-400">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white truncate" title={c.name}>{c.name}</p>
                        <p className="text-[10px] text-gray-500 font-mono">
                          {fmtTime((c.duration || 0))} · {c.trimMode === "remove" ? "cut" : "keep"} {fmtTime(c.trimStart)}–{fmtTime(c.trimEnd || c.duration)}
                        </p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); moveClip(i, -1); }}
                        className="opacity-0 group-hover:opacity-100 text-[11px] px-1.5 py-0.5 rounded text-gray-300 hover:text-white hover:bg-white/10" title="Move up">↑</button>
                      <button onClick={(e) => { e.stopPropagation(); moveClip(i, +1); }}
                        className="opacity-0 group-hover:opacity-100 text-[11px] px-1.5 py-0.5 rounded text-gray-300 hover:text-white hover:bg-white/10" title="Move down">↓</button>
                      <button onClick={(e) => { e.stopPropagation(); removeClip(c.id); }}
                        className="opacity-0 group-hover:opacity-100 text-[11px] w-6 h-6 rounded-md text-rose-300 hover:text-white hover:bg-rose-500/20" title="Remove">
                        <CloseOutlined />
                      </button>
                    </li>
                  ))}
                </ul>
                <label className="mt-3 block cursor-pointer">
                  <input type="file" accept="video/*" multiple className="hidden"
                    onChange={(e) => { Array.from(e.target.files || []).forEach(acceptClip); e.target.value = ""; }} />
                  <span className="block text-center px-3 py-2 rounded-lg border border-dashed border-white/20 text-[11px] text-gray-300 hover:text-white hover:bg-white/[0.04]">
                    <PlusOutlined /> Add another clip
                  </span>
                </label>
              </div>

              {/* Title */}
              <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
                <p className="text-[10px] uppercase tracking-[0.18em] font-mono text-gray-500 mb-2">Title</p>
                <input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title (saved in your library)"
                  className="w-full bg-white/[0.03] ring-1 ring-white/10 focus:ring-rose-400/40 outline-none rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500" />
              </div>

              {/* Aspect ratio */}
              <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-2 mb-3"><PicCenterOutlined className="text-rose-300" /><p className="text-sm font-semibold text-white">Aspect ratio</p></div>
                <div className="grid grid-cols-3 gap-2">
                  {ASPECT_OPTIONS.map((a) => {
                    const active = aspect === a.key;
                    return (
                      <button key={a.key} onClick={() => setAspect(a.key)}
                        className={`px-3 py-2 rounded-lg text-left transition-all ring-1 ${active ? "ring-rose-400 bg-rose-500/15" : "ring-white/10 bg-white/[0.02] hover:bg-white/[0.05]"}`}>
                        <p className={`text-xs font-mono ${active ? "text-rose-200" : "text-white"}`}>{a.label}</p>
                        <p className="text-[10px] text-gray-500">{a.note}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quality */}
              <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-2 mb-3"><ThunderboltOutlined className="text-rose-300" /><p className="text-sm font-semibold text-white">Quality</p></div>
                <div className="grid grid-cols-4 gap-2">
                  {QUALITY_OPTIONS.map((q) => {
                    const active = quality === q.key;
                    return (
                      <button key={q.key} onClick={() => setQuality(q.key)}
                        className={`px-2 py-2 rounded-lg text-center transition-all ring-1 ${active ? "ring-rose-400 bg-rose-500/15" : "ring-white/10 bg-white/[0.02] hover:bg-white/[0.05]"}`}>
                        <p className={`text-[11px] font-mono ${active ? "text-rose-200" : "text-white"}`}>{q.label}</p>
                        <p className="text-[9px] text-gray-500 truncate">{q.note}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* FPS */}
              <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-2 mb-3"><HourglassOutlined className="text-rose-300" /><p className="text-sm font-semibold text-white">Frame rate</p></div>
                <div className="grid grid-cols-5 gap-2">
                  {FPS_OPTIONS.map((f) => {
                    const active = fps === f.key;
                    return (
                      <button key={f.key} onClick={() => setFps(f.key)}
                        className={`px-1 py-2 rounded-lg text-center transition-all ring-1 ${active ? "ring-rose-400 bg-rose-500/15" : "ring-white/10 bg-white/[0.02] hover:bg-white/[0.05]"}`}>
                        <p className={`text-[11px] font-mono ${active ? "text-rose-200" : "text-white"}`}>{f.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Save */}
              <div className="rounded-2xl ring-1 ring-rose-400/30 bg-gradient-to-br from-rose-500/10 to-amber-500/5 p-5">
                <p className="text-[10px] uppercase tracking-[0.18em] font-mono text-rose-300 mb-2">Save</p>
                <p className="text-xs text-gray-300 mb-4">
                  {clips.length === 1
                    ? `Renders 1 clip (${fmtTime(totalKeptSec)})`
                    : `Joins ${clips.length} clips (${fmtTime(totalKeptSec)} total)`}
                  {aspect !== "source" ? `, ${aspect === "custom" ? "custom crop" : aspect}` : ""}
                  {fps !== "source" ? `, ${fps} fps` : ""}
                  {`, ${quality} quality`}
                  {musicFile ? ", + music" : ""}.
                </p>
                <button
                  onClick={onSave}
                  disabled={saving || clips.length === 0}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-sm transition-colors"
                >
                  {saving ? <ReloadOutlined spin /> : <SaveOutlined />}
                  {saving ? "Rendering…" : "Save to library"}
                </button>
                <button onClick={reset} className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/15 text-gray-300 hover:text-white hover:bg-white/[0.04] text-xs">
                  Start over
                </button>
                {!isUnlocked && (
                  <p className="mt-3 text-[10px] text-amber-200/80 text-center">
                    Logged out — saves are public. Vault login for private saves.
                  </p>
                )}
              </div>

              {savedItem && (
                <div className="rounded-2xl ring-1 ring-emerald-400/40 bg-emerald-500/10 p-5 text-center">
                  <CheckCircleFilled className="text-emerald-300 text-2xl mb-2" />
                  <p className="text-sm text-white font-semibold">Saved to your library</p>
                  <p className="text-[11px] text-gray-400 mt-1">{savedItem.title} · {fmtBytes(savedItem.bytes)}</p>
                  <button onClick={() => navigate("/edit/library")} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold">
                    <PlayCircleOutlined /> Open library
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
