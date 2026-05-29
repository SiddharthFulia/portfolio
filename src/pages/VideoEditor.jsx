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
  CloudUploadOutlined,
  PlusCircleOutlined,
} from "@ant-design/icons";
import { useVault } from "../contexts/VaultContext";

export default function VideoEditor() {
  const navigate = useNavigate();
  const { isUnlocked } = useVault();
  const [isFullscreen, setIsFullscreen]   = useState(false);
  const [startHintOpen, setStartHintOpen] = useState(true);

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
    <div className="relative min-h-screen w-full bg-[#05050a] text-gray-100 pt-20 sm:pt-24 pb-10 px-3 sm:px-5 overflow-hidden">
      {/* Ambient backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] rounded-full bg-rose-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[40vw] h-[40vw] rounded-full bg-amber-500/8 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-[1500px] mx-auto">
        {!isFullscreen && (
          <header className="mb-3 sm:mb-4 flex items-end justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-rose-300/80">
                  — Video editor
                </p>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-rose-500/10 ring-1 ring-rose-400/30 text-rose-200">
                  <span className="w-1 h-1 rounded-full bg-rose-300 animate-pulse" />
                  Browser · WebCodecs + WebGPU
                </span>
              </div>
              <h1 className="font-poppins font-black tracking-tight text-2xl sm:text-3xl md:text-4xl">
                Edit any clip · any aspect ratio
              </h1>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => navigate("/edit/library")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-semibold transition-all"
              >
                <AppstoreOutlined /> My Library
              </button>
            </div>
          </header>
        )}

        {/* Editor frame — fills the viewport less the compact header.
            Editor needs maximum vertical space for the timeline + tools
            so we use h-[calc(100vh - chrome)] instead of aspect-ratio. */}
        <div
          className={`relative overflow-hidden ring-1 ring-white/10 bg-black transition-all ${
            isFullscreen
              ? "fixed inset-0 z-50 rounded-none"
              : "rounded-2xl"
          }`}
          style={isFullscreen ? {} : { height: "calc(100vh - 170px)", minHeight: "560px" }}
        >
          <iframe
            src="/video-editor/index.html"
            title="OpenReel Video Editor"
            className="absolute inset-0 w-full h-full border-0"
            allow="clipboard-read; clipboard-write; web-share; camera; microphone; display-capture; encrypted-media"
          />

          {/* Start hint — pointer-events-none so files dropped on the
              editor pass straight through to OpenReel's drop handler.
              Dismissable so it doesn't stay in the way after the user
              has loaded their first clip. */}
          {startHintOpen && (
            <div className="absolute top-3 left-3 z-10 max-w-[min(420px,calc(100%-100px))] pointer-events-none">
              <div className="rounded-2xl px-4 py-3 backdrop-blur-xl bg-black/70 ring-1 ring-rose-400/40 shadow-2xl pointer-events-auto">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-9 h-9 rounded-xl bg-rose-500/20 ring-1 ring-rose-400/40 grid place-items-center text-rose-200">
                    <CloudUploadOutlined />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                      Start here
                      <PlusCircleOutlined className="text-rose-300 text-[12px]" />
                    </p>
                    <p className="text-[11px] text-gray-300 leading-relaxed mt-0.5">
                      <strong>Drop a video file</strong> anywhere on the editor below, or use{" "}
                      <strong>+ Import</strong> inside OpenReel's media panel (top-left). Add
                      audio, images, or text the same way.
                    </p>
                  </div>
                  <button
                    onClick={() => setStartHintOpen(false)}
                    className="shrink-0 -mt-1 -mr-1 w-6 h-6 rounded-md text-gray-400 hover:text-white hover:bg-white/10 grid place-items-center"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          )}

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
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10">
              <ScissorOutlined className="text-rose-300" /> Cut · Split · Trim · Ripple-delete
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10">
              Crop · Rotate · Scale · Keyframes
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10">
              16:9 · 9:16 · 1:1 · 4:5 · custom
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10">
              <SoundOutlined className="text-rose-300" /> Music · Fades · EQ
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10">
              Transitions · Color · Chroma key
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10">
              <MobileOutlined className="text-rose-300" /> Mobile-ready
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10">
              <ExportOutlined className="text-rose-300" /> Save → /edit/library
            </span>
            {!isUnlocked && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-amber-200/80">
                Logged out — saves are public
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

