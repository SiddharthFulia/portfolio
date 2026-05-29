// /edit — OpenReel video editor embedded as a static iframe.
//
// Editing + preview + export ALL happen client-side via WebCodecs /
// WebGPU inside the OpenReel app. The portfolio BE only sees the
// final exported MP4 when the user clicks "Save to library" — which
// drops the file to /api/edit/upload and indexes it on disk. Source
// clips never leave the browser.
//
// To re-build OpenReel after upstream pulls:
//   cd E:/Github/openreel-video
//   pnpm install && pnpm build
//   rm -rf E:/Siddharth/portfolio/public/video-editor/*
//   cp -r apps/web/dist/* E:/Siddharth/portfolio/public/video-editor/

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FullscreenOutlined,
  FullscreenExitOutlined,
  AppstoreOutlined,
  ScissorOutlined,
  SoundOutlined,
  MobileOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import { useVault } from "../contexts/VaultContext";

export default function VideoEditor() {
  const navigate = useNavigate();
  const { isUnlocked } = useVault();
  const [isFullscreen, setIsFullscreen] = useState(false);

  // F11 / Ctrl+. fullscreen toggle — handy when the editor is
  // taking the whole viewport.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "F11" || ((e.ctrlKey || e.metaKey) && e.key === ".")) {
        e.preventDefault();
        setIsFullscreen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-[#05050a] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 sm:px-6 overflow-hidden">
      {/* Ambient backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] rounded-full bg-rose-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[40vw] h-[40vw] rounded-full bg-amber-500/8 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        {!isFullscreen && (
          <header className="mb-6 sm:mb-8">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-rose-300/80">
                — Video editor · powered by OpenReel
              </p>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-rose-500/10 ring-1 ring-rose-400/30 text-rose-200">
                <span className="w-1 h-1 rounded-full bg-rose-300 animate-pulse" />
                100% browser · WebCodecs + WebGPU
              </span>
            </div>
            <h1 className="font-poppins font-black tracking-tight text-4xl sm:text-5xl md:text-6xl">
              Edit any clip,{" "}
              <span className="text-rose-500">any aspect ratio</span>
            </h1>
            <p className="mt-4 max-w-2xl text-gray-300 text-sm sm:text-base leading-relaxed">
              Drop video, audio, images, or text into the editor below. Multi-track
              timeline · trim / split / ripple-delete · transitions · keyframes ·
              color grading · audio mixing · 16:9 / 9:16 / 1:1 / 4:5 reels · export
              directly to MP4 — all running in your browser via WebCodecs.
              Click <strong>Save to library</strong> in the export panel to upload
              the final MP4 to your collection at <code>/edit/library</code>.
            </p>
          </header>
        )}

        {/* Editor frame */}
        <div
          className={`relative overflow-hidden ring-1 ring-white/10 bg-black transition-all ${
            isFullscreen
              ? "fixed inset-0 z-50 rounded-none"
              : "rounded-3xl aspect-[16/10] sm:aspect-[16/9]"
          }`}
          style={isFullscreen ? {} : { minHeight: "clamp(420px, 75vh, 900px)" }}
        >
          <iframe
            src="/video-editor/index.html"
            title="OpenReel Video Editor"
            className="absolute inset-0 w-full h-full border-0"
            allow="clipboard-read; clipboard-write; web-share; camera; microphone; display-capture; encrypted-media"
          />

          <button
            onClick={() => setIsFullscreen((v) => !v)}
            title={isFullscreen ? "Exit fullscreen (F11)" : "Fullscreen (F11)"}
            className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                       backdrop-blur-md bg-black/50 hover:bg-black/70 ring-1 ring-white/15
                       text-gray-100 hover:text-white text-xs font-semibold"
          >
            {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            {isFullscreen ? "Exit" : "Fullscreen"}
          </button>
        </div>

        {!isFullscreen && (
          <>
            {/* Aspect-ratio quick reference */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              {[
                { label: "16:9 · YouTube",    box: "w-9 h-5" },
                { label: "9:16 · Reels/Shorts", box: "w-5 h-9" },
                { label: "1:1 · Instagram",   box: "w-6 h-6" },
                { label: "4:5 · Feed",        box: "w-5 h-6" },
              ].map((r) => (
                <div key={r.label} className="rounded-xl px-4 py-3 ring-1 ring-white/10 bg-white/[0.02] flex items-center gap-3">
                  <div className={`shrink-0 rounded ring-1 ring-rose-400/30 bg-rose-500/15 ${r.box}`} />
                  <span className="text-gray-300">{r.label}</span>
                </div>
              ))}
            </div>

            {/* Feature cards */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[12px]">
              <SpecCard icon={<ScissorOutlined />}  title="Multi-track timeline" body="Unlimited video / audio / image / text tracks · frame-accurate trim, split, ripple-delete" />
              <SpecCard icon={<SoundOutlined />}    title="Audio mixing"          body="Per-track volume, fade, EQ + music drop-in. Auto-ducking on voice tracks" />
              <SpecCard icon={<MobileOutlined />}   title="Mobile friendly"        body="Touch-aware timeline · the editor adapts to portrait on phones" />
              <SpecCard icon={<ExportOutlined />}   title="Save to library"        body="Click export → MP4 lands at /edit/library. Vault required to delete" />
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3 text-sm">
              <button
                onClick={() => navigate("/edit/library")}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-semibold transition-all"
              >
                <AppstoreOutlined /> My Library
              </button>
              {!isUnlocked && (
                <span className="text-[11px] text-amber-200/80">
                  Logged out — exports save publicly. Unlock vault for private saves.
                </span>
              )}
              <span className="ml-auto text-[11px] text-gray-500">
                OpenReel is MIT-licensed · self-hosted at <code>/video-editor/</code>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SpecCard({ icon, title, body }) {
  return (
    <div className="rounded-xl px-4 py-3 ring-1 ring-white/10 bg-white/[0.03]">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-rose-300">{icon}</span>
        <p className="text-sm font-semibold text-white">{title}</p>
      </div>
      <p className="text-[11px] text-gray-400 leading-relaxed">{body}</p>
    </div>
  );
}
