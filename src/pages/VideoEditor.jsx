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

import { useEffect, useRef, useState } from "react";
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
  const frameWrapRef = useRef(null);
  const [isFullscreen, setIsFullscreen]   = useState(false);
  const [startHintOpen, setStartHintOpen] = useState(true);

  // Native Fullscreen API on the iframe wrapper. Way more reliable
  // than CSS-only fullscreen because OpenReel sees exactly ONE
  // resize event instead of getting yanked between layouts. We sync
  // local state on the native `fullscreenchange` event so pressing
  // Esc to exit fullscreen also flips our UI back.
  const toggleFullscreen = async () => {
    const wrap = frameWrapRef.current;
    if (!wrap) return;
    try {
      if (!document.fullscreenElement) {
        if (wrap.requestFullscreen) await wrap.requestFullscreen();
        else if (wrap.webkitRequestFullscreen) wrap.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    } catch (_) { /* user cancelled or unsupported */ }
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  // F11 / Ctrl+. fullscreen toggle — handy when the editor is
  // taking the whole viewport.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "F11" || ((e.ctrlKey || e.metaKey) && e.key === ".")) {
        e.preventDefault();
        toggleFullscreen();
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
            Native Fullscreen API makes the wrapper its own fullscreen
            element so the iframe doesn't get re-laid-out during the
            transition (which used to leave OpenReel showing nothing). */}
        <div
          ref={frameWrapRef}
          className={`relative overflow-hidden ring-1 ring-white/10 bg-black ${
            isFullscreen ? "rounded-none w-screen h-screen" : "rounded-2xl"
          }`}
          style={isFullscreen ? undefined : { height: "calc(100vh - 170px)", minHeight: "560px" }}
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
            <>
              {/* Hint card — sits over the left panel area where the
                  + Import button lives, so the user's eye is led
                  straight to the actual control. */}
              <div className="absolute top-16 left-3 z-10 max-w-[min(380px,calc(100%-40px))] pointer-events-none">
                <div className="rounded-2xl px-4 py-3 backdrop-blur-xl bg-black/80 ring-1 ring-rose-400/50 shadow-2xl pointer-events-auto">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-9 h-9 rounded-xl bg-rose-500/20 ring-1 ring-rose-400/40 grid place-items-center text-rose-200">
                      <CloudUploadOutlined />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                        Start here
                        <PlusCircleOutlined className="text-rose-300 text-[12px]" />
                      </p>
                      <p className="text-[12px] text-gray-200 leading-relaxed mt-0.5">
                        Look for the <strong className="text-rose-200">+ Import Media</strong>
                        {" "}button in the <strong>Media panel on the left</strong> ↓ — or just
                        drag a file anywhere onto the editor.
                      </p>
                      <p className="text-[10px] text-rose-200/90 mt-1.5 flex items-center gap-2 font-mono uppercase tracking-[0.15em]">
                        MP4 · MOV · WEBM · MKV
                        <span className="text-gray-500">·</span>
                        <span>max 500 MB</span>
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
              {/* Arrow nudge — animated chevron pointing down-left at
                  the editor's media panel from just above where the
                  Import button typically lives. */}
              <div
                aria-hidden
                className="absolute left-4 top-44 z-10 text-rose-300 pointer-events-none"
                style={{ animation: "videoHintArrow 1.4s ease-in-out infinite" }}
              >
                <svg width="36" height="42" viewBox="0 0 36 42" fill="none">
                  <path d="M18 4 L18 32 M6 22 L18 34 L30 22"
                    stroke="currentColor" strokeWidth="3.5"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <style>{`
                @keyframes videoHintArrow {
                  0%, 100% { transform: translateY(0); opacity: 1; }
                  50%      { transform: translateY(8px); opacity: 0.65; }
                }
              `}</style>
            </>
          )}

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen (F11)"}
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
              <ExportOutlined className="text-rose-300" /> Save to your library
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

