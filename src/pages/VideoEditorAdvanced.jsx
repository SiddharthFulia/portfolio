// /edit/advanced — Full multi-track timeline editor (OpenReel).
//
// The simple ffmpeg editor at /edit handles 90 % of common edits
// (trim + crop + music) and writes straight into the library. This
// advanced lane gives you the full CapCut-style timeline experience:
// multi-track video / audio / text, keyframes, color grading, chroma
// key, transitions, all WebCodecs / WebGPU client-side.
//
// Since OpenReel runs entirely in the browser it doesn't post back
// to our BE — when you click Export inside the editor the MP4
// downloads to your machine. The companion "Import from device"
// button on /edit/library then pushes that file up to your library
// so the two editors share a single saved-videos collection.
//
// Re-build OpenReel after upstream pulls:
//   cd E:/Github/openreel-video
//   pnpm install && pnpm build
//   rm -rf E:/Siddharth/portfolio/public/video-editor-advanced/*
//   cp -r apps/web/dist/* E:/Siddharth/portfolio/public/video-editor-advanced/

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FullscreenOutlined,
  FullscreenExitOutlined,
  AppstoreOutlined,
  CloudUploadOutlined,
  PlusCircleOutlined,
  ScissorOutlined,
  SoundOutlined,
  PicCenterOutlined,
  MobileOutlined,
  ExportOutlined,
  ImportOutlined,
} from "@ant-design/icons";

export default function VideoEditorAdvanced() {
  const navigate = useNavigate();
  const frameWrapRef = useRef(null);
  const [isFullscreen,   setIsFullscreen]   = useState(false);
  const [startHintOpen, setStartHintOpen]   = useState(true);

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
    } catch (_) {}
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
    <div className="relative min-h-screen w-full bg-[var(--luxe-bg-base)] text-fg-primary pt-20 sm:pt-24 pb-10 px-3 sm:px-5 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] rounded-full bg-rose-500/10 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-[1500px] mx-auto">
        {!isFullscreen && (
          <header className="mb-3 flex items-end justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-rose-300/80">
                  — Advanced editor
                </p>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-rose-500/10 ring-1 ring-rose-400/30 text-rose-200">
                  <span className="w-1 h-1 rounded-full bg-rose-300 animate-pulse" />
                  Multi-track · WebCodecs + WebGPU
                </span>
              </div>
              <h1 className="font-poppins font-black tracking-tight text-2xl sm:text-3xl md:text-4xl">
                Full timeline · keyframes · color · effects
              </h1>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => navigate("/edit")}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-white transition-colors"
              >
                ← Simple editor
              </button>
              <button
                onClick={() => navigate("/edit/library")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-semibold transition-all"
              >
                <AppstoreOutlined /> My Library
              </button>
            </div>
          </header>
        )}

        <div
          ref={frameWrapRef}
          className={`relative overflow-hidden ring-1 ring-white/10 bg-black ${
            isFullscreen ? "rounded-none w-screen h-screen" : "rounded-2xl"
          }`}
          style={isFullscreen ? undefined : { height: "calc(100vh - 170px)", minHeight: "560px" }}
        >
          <iframe
            src="/video-editor-advanced/index.html"
            title="OpenReel Editor"
            className="absolute inset-0 w-full h-full border-0"
            allow="clipboard-read; clipboard-write; web-share; camera; microphone; display-capture; encrypted-media"
          />

          {startHintOpen && (
            <>
              <div className="absolute top-16 left-3 z-10 max-w-[min(420px,calc(100%-40px))] pointer-events-none">
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
                        Click <strong className="text-rose-200">+ Import Media</strong> in the
                        Media panel on the left ↓ — or drag a file onto the editor.
                      </p>
                      <p className="text-[11px] text-gray-300 mt-1.5">
                        When you&apos;re done, click <strong>Export</strong> inside the editor.
                        The MP4 saves to your downloads, then open My Library and click{" "}
                        <strong>Import from device</strong> to add it to your collection.
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
              <div
                aria-hidden
                className="absolute left-4 top-44 z-10 text-rose-300 pointer-events-none"
                style={{ animation: "advHintArrow 1.4s ease-in-out infinite" }}
              >
                <svg width="36" height="42" viewBox="0 0 36 42" fill="none">
                  <path d="M18 4 L18 32 M6 22 L18 34 L30 22"
                    stroke="currentColor" strokeWidth="3.5"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <style>{`
                @keyframes advHintArrow {
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
              <ScissorOutlined className="text-rose-300" /> Multi-track timeline
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10">
              Cut · Split · Trim · Ripple-delete
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10">
              <PicCenterOutlined className="text-rose-300" /> Crop · Rotate · Scale · Keyframes
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10">
              Transitions · Color grading · Chroma key
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10">
              <SoundOutlined className="text-rose-300" /> Audio mixing · Fades · EQ
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10">
              Text overlays · Fonts · Effects
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10">
              <MobileOutlined className="text-rose-300" /> Mobile-ready
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/10">
              <ExportOutlined className="text-rose-300" /> Export → <ImportOutlined /> bring it back
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
