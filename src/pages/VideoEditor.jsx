// /edit — Simple in-browser video editor.
//
// Inspired by /image-enhancer's pattern: drag-drop / file picker
// for the source video, native <video> preview, a few essential
// editing controls (trim in/out, aspect-ratio crop, optional
// music track), and a Save button that ships the source + the
// edit parameters to the BE. The BE runs ffmpeg server-side and
// drops the finished MP4 into the user's library.
//
// We tried embedding OpenReel as an iframe but the WebGPU/WebCodecs
// stack rendered a black screen for the user, so we replaced it
// with this much simpler flow that works everywhere.

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

export default function VideoEditor() {
  const navigate = useNavigate();
  const { isUnlocked } = useVault();

  const videoRef    = useRef(null);
  const objUrlRef   = useRef(null);
  const audioUrlRef = useRef(null);

  const [file, setFile]           = useState(null);
  const [previewUrl, setPreview]  = useState("");
  const [duration, setDuration]   = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd]     = useState(0);
  const [aspect, setAspect]       = useState("source");
  const [musicFile, setMusicFile] = useState(null);
  const [musicPreview, setMusicPreview] = useState("");
  const [musicVolume, setMusicVolume] = useState(0.7);
  const [title, setTitle]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [savedItem, setSavedItem] = useState(null);

  // Cleanup blob URLs on unmount
  useEffect(() => () => {
    if (objUrlRef.current)   URL.revokeObjectURL(objUrlRef.current);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  const onPickFile = (f) => {
    if (!f) return false;
    if (!f.type?.startsWith("video/")) {
      message.error("Please drop a video file");
      return false;
    }
    if (f.size > MAX_BYTES) {
      message.error(`File is over the 500 MB limit (${fmtBytes(f.size)})`);
      return false;
    }
    if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current);
    const url = URL.createObjectURL(f);
    objUrlRef.current = url;
    setFile(f);
    setPreview(url);
    setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 80));
    setTrimStart(0);
    setTrimEnd(0);
    setAspect("source");
    setSavedItem(null);
    return false; // prevent antd from auto-uploading
  };

  const onPickMusic = (f) => {
    if (!f) return false;
    if (!f.type?.startsWith("audio/")) {
      message.error("Please drop an audio file");
      return false;
    }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(f);
    audioUrlRef.current = url;
    setMusicFile(f);
    setMusicPreview(url);
    return false;
  };

  const reset = () => {
    if (objUrlRef.current)   URL.revokeObjectURL(objUrlRef.current);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    objUrlRef.current = null;
    audioUrlRef.current = null;
    setFile(null); setPreview(""); setMusicFile(null); setMusicPreview("");
    setTrimStart(0); setTrimEnd(0); setAspect("source"); setTitle("");
    setDuration(0); setSavedItem(null);
  };

  const onLoadedMeta = () => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration || 0;
    setDuration(d);
    setTrimEnd(d);
  };

  // When the user scrubs trim handles, seek the video preview to
  // the nearest handle so they see what they're cutting.
  const seekPreview = (t) => {
    const v = videoRef.current;
    if (v) try { v.currentTime = Math.max(0, Math.min(duration, t)); } catch {}
  };

  const trimDurationSec = useMemo(
    () => Math.max(0, (trimEnd || duration) - (trimStart || 0)),
    [trimStart, trimEnd, duration]
  );

  const onSave = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("video", file);
      if (musicFile) fd.append("music", musicFile);
      fd.append("title",       title || "Untitled edit");
      fd.append("aspectRatio", aspect);
      fd.append("trimStart",   String(trimStart || 0));
      fd.append("trimEnd",     String(trimEnd || duration));
      fd.append("musicVolume", String(musicVolume));
      fd.append("durationSec", String(trimDurationSec));

      const res = await fetch(`${BE_URL}/api/edit/process`, {
        method:  "POST",
        body:    fd,
        headers: { ...vaultHeaders() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || `Save failed: ${res.status}`);
      const item = body?.data || body;
      setSavedItem(item);
      message.success("Saved to your library");
    } catch (e) {
      message.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#05050a] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 sm:px-6 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] rounded-full bg-rose-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[40vw] h-[40vw] rounded-full bg-amber-500/8 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Heading */}
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-rose-300/80">
              — Video editor
            </p>
            <h1 className="mt-2 font-poppins font-black tracking-tight text-3xl sm:text-4xl md:text-5xl">
              Trim · crop · drop in music
            </h1>
            <p className="mt-2 text-sm text-gray-400 max-w-2xl">
              Drop a clip, pick a length, pick an aspect ratio, optionally add a soundtrack,
              hit save. The server handles the render and the finished MP4 lands in your library.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => navigate("/edit/advanced")}
              title="Full multi-track timeline editor"
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

        {!file ? (
          /* Step 1 — Upload */
          <Dragger
            accept="video/*"
            maxCount={1}
            beforeUpload={onPickFile}
            showUploadList={false}
            className="!bg-white/[0.02] !border-white/10 hover:!border-rose-400/40 rounded-3xl"
          >
            <p className="ant-upload-drag-icon !text-rose-300">
              <InboxOutlined style={{ fontSize: 56 }} />
            </p>
            <p className="ant-upload-text !text-white !text-lg !font-semibold">
              Drag a video here, or click to pick one
            </p>
            <p className="ant-upload-hint !text-gray-400 !text-xs mt-2">
              MP4 · MOV · WEBM · MKV  ·  max 500 MB per file
            </p>
          </Dragger>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Preview */}
            <div className="lg:col-span-3">
              <div className="rounded-2xl overflow-hidden ring-1 ring-white/10 bg-black aspect-video">
                <video
                  ref={videoRef}
                  src={previewUrl}
                  controls
                  playsInline
                  className="w-full h-full object-contain bg-black"
                  onLoadedMetadata={onLoadedMeta}
                />
              </div>

              {/* Trim controls */}
              <div className="mt-4 rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ScissorOutlined className="text-rose-300" />
                  <p className="text-sm font-semibold text-white">Trim</p>
                  <span className="ml-auto text-[11px] text-gray-400 font-mono">
                    {fmtTime(trimStart)} → {fmtTime(trimEnd || duration)} · keeps {fmtTime(trimDurationSec)}
                  </span>
                </div>

                <label className="block text-[10px] uppercase tracking-[0.18em] font-mono text-gray-500 mb-1">
                  Start · {fmtTime(trimStart)}
                </label>
                <input
                  type="range" min={0} max={Math.max(1, duration)} step={0.1}
                  value={trimStart}
                  onChange={(e) => {
                    const v = Math.min(parseFloat(e.target.value), (trimEnd || duration) - 0.1);
                    setTrimStart(v); seekPreview(v);
                  }}
                  className="w-full accent-rose-500"
                />

                <label className="block text-[10px] uppercase tracking-[0.18em] font-mono text-gray-500 mt-3 mb-1">
                  End · {fmtTime(trimEnd || duration)}
                </label>
                <input
                  type="range" min={0} max={Math.max(1, duration)} step={0.1}
                  value={trimEnd || duration}
                  onChange={(e) => {
                    const v = Math.max(parseFloat(e.target.value), trimStart + 0.1);
                    setTrimEnd(v); seekPreview(v);
                  }}
                  className="w-full accent-rose-500"
                />
              </div>

              {/* Music drop-in */}
              <div className="mt-4 rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <SoundOutlined className="text-rose-300" />
                  <p className="text-sm font-semibold text-white">Music · optional</p>
                  {musicFile && (
                    <button
                      onClick={() => { setMusicFile(null); setMusicPreview(""); if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }}
                      className="ml-auto text-[11px] text-gray-400 hover:text-white"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {!musicFile ? (
                  <Dragger
                    accept="audio/*"
                    maxCount={1}
                    beforeUpload={onPickMusic}
                    showUploadList={false}
                    className="!bg-white/[0.02] !border-white/10 hover:!border-rose-400/40 !rounded-xl"
                  >
                    <p className="ant-upload-drag-icon !text-rose-300">
                      <CloudUploadOutlined style={{ fontSize: 28 }} />
                    </p>
                    <p className="ant-upload-text !text-white !text-sm">
                      Drop a music track here
                    </p>
                    <p className="ant-upload-hint !text-gray-500 !text-[11px] mt-1">
                      MP3 · WAV · M4A · OGG  ·  optional
                    </p>
                  </Dragger>
                ) : (
                  <div>
                    <p className="text-xs text-gray-300 truncate" title={musicFile.name}>
                      {musicFile.name} · {fmtBytes(musicFile.size)}
                    </p>
                    <audio src={musicPreview} controls className="w-full mt-2" />
                    <label className="block text-[10px] uppercase tracking-[0.18em] font-mono text-gray-500 mt-3 mb-1">
                      Mix level · {Math.round(musicVolume * 100)}%
                    </label>
                    <input
                      type="range" min={0} max={1} step={0.05}
                      value={musicVolume}
                      onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                      className="w-full accent-rose-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right-side control stack */}
            <div className="lg:col-span-2 space-y-5">
              {/* Source */}
              <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
                <p className="text-[10px] uppercase tracking-[0.18em] font-mono text-gray-500 mb-2">
                  Source
                </p>
                <p className="text-sm font-semibold text-white truncate" title={file.name}>
                  {file.name}
                </p>
                <p className="text-[11px] text-gray-500">
                  {fmtBytes(file.size)} · {fmtTime(duration)} long
                </p>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title (saved in your library)"
                  className="mt-3 w-full bg-white/[0.03] ring-1 ring-white/10 focus:ring-rose-400/40 outline-none rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500"
                />
              </div>

              {/* Aspect ratio */}
              <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <PicCenterOutlined className="text-rose-300" />
                  <p className="text-sm font-semibold text-white">Aspect ratio</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {ASPECT_OPTIONS.map((a) => {
                    const active = aspect === a.key;
                    return (
                      <button
                        key={a.key}
                        onClick={() => setAspect(a.key)}
                        className={`px-3 py-2 rounded-lg text-left transition-all ring-1 ${
                          active
                            ? "ring-rose-400 bg-rose-500/15"
                            : "ring-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                        }`}
                      >
                        <p className={`text-xs font-mono ${active ? "text-rose-200" : "text-white"}`}>
                          {a.label}
                        </p>
                        <p className="text-[10px] text-gray-500">{a.note}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Save */}
              <div className="rounded-2xl ring-1 ring-rose-400/30 bg-gradient-to-br from-rose-500/10 to-amber-500/5 p-5">
                <p className="text-[10px] uppercase tracking-[0.18em] font-mono text-rose-300 mb-2">
                  Save
                </p>
                <p className="text-xs text-gray-300 mb-4">
                  Renders on the server with ffmpeg ({musicFile ? "video + music mix · " : ""}
                  {aspect !== "source" ? `${aspect} crop · ` : ""}
                  {trimDurationSec > 0 ? `${fmtTime(trimDurationSec)} clip` : "full length"}) and
                  drops the finished MP4 in your library.
                </p>
                <button
                  onClick={onSave}
                  disabled={saving || !file}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-sm transition-colors"
                >
                  {saving ? <ReloadOutlined spin /> : <SaveOutlined />}
                  {saving ? "Rendering…" : "Save to library"}
                </button>
                <button
                  onClick={reset}
                  className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/15 text-gray-300 hover:text-white hover:bg-white/[0.04] text-xs"
                >
                  Start over
                </button>
                {!isUnlocked && (
                  <p className="mt-3 text-[10px] text-amber-200/80 text-center">
                    Logged out — saves are public. Vault login for private saves.
                  </p>
                )}
              </div>

              {/* Saved confirmation */}
              {savedItem && (
                <div className="rounded-2xl ring-1 ring-emerald-400/40 bg-emerald-500/10 p-5 text-center">
                  <CheckCircleFilled className="text-emerald-300 text-2xl mb-2" />
                  <p className="text-sm text-white font-semibold">Saved to your library</p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {savedItem.title} · {fmtBytes(savedItem.bytes)}
                  </p>
                  <button
                    onClick={() => navigate("/edit/library")}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold"
                  >
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
