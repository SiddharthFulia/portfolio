// /splat — In-browser Gaussian splat viewer + editor.
//
// Now backed by PlayCanvas SuperSplat (https://superspl.at/editor)
// instead of a custom Three.js viewer. The previous mkkellogg-based
// path had unreliable bounding-box + camera-fit math for many scenes;
// SuperSplat is the production-grade editor with proper camera
// handling, multi-format support, and editing tools built in.
//
// Architecture:
//   - SuperSplat is built once from
//     E:/Github/ai-video-ecosystem/supersplat and its dist/ output
//     is dropped at portfolio/public/supersplat/ (24 MB static assets).
//   - This route is a thin wrapper that mounts it in an <iframe>
//     under our portfolio chrome (navbar, page padding, etc.).
//   - The iframe pointer + scroll events are sandboxed inside SuperSplat
//     so the user's mouse/wheel never leaks out of the viewer.
//
// To re-build SuperSplat after upstream pulls:
//   cd E:/Github/ai-video-ecosystem/supersplat && npm install && npm run build
//   cp -r dist/* E:/Siddharth/portfolio/public/supersplat/

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ExperimentOutlined,
  ThunderboltOutlined,
  DesktopOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  RocketOutlined,
} from "@ant-design/icons";

export default function SplatViewer() {
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <div className="relative min-h-screen w-full bg-[#05050a] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 sm:px-6 overflow-hidden">
      {/* Ambient backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] rounded-full bg-rose-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[40vw] h-[40vw] rounded-full bg-amber-500/8 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Heading — hidden in fullscreen so the editor gets the whole viewport */}
        {!isFullscreen && (
          <header className="mb-8 sm:mb-10">
            <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-rose-300/80">
              — In-browser splat editor · powered by SuperSplat
            </p>
            <h1 className="mt-3 font-poppins font-black tracking-tight text-4xl sm:text-5xl md:text-6xl">
              Walk through any{" "}
              <span className="text-rose-500">Gaussian splat</span>
            </h1>
            <p className="mt-4 max-w-2xl text-gray-300 text-sm sm:text-base leading-relaxed">
              Drop a <code className="text-amber-200">.ply</code>,{" "}
              <code className="text-amber-200">.splat</code>,{" "}
              <code className="text-amber-200">.ksplat</code>, or{" "}
              <code className="text-amber-200">.spz</code> file into the editor
              below and orbit, fly, edit, or export. Powered by{" "}
              <a
                href="https://superspl.at/editor"
                target="_blank"
                rel="noreferrer"
                className="text-rose-300 hover:text-rose-200 underline"
              >
                PlayCanvas SuperSplat
              </a>
              {" "}— files are decoded entirely in your browser, the editor never
              uploads your scene anywhere.
            </p>
          </header>
        )}

        {/* Editor frame */}
        <div
          className={`relative rounded-3xl overflow-hidden ring-1 ring-white/10 bg-black transition-all ${
            isFullscreen
              ? "fixed inset-2 sm:inset-4 z-50 rounded-2xl"
              : "aspect-[16/10] sm:aspect-[16/9]"
          }`}
          style={isFullscreen ? {} : { minHeight: "clamp(420px, 70vh, 820px)" }}
        >
          <iframe
            src="/supersplat/index.html"
            title="SuperSplat Editor"
            className="absolute inset-0 w-full h-full border-0"
            allow="clipboard-read; clipboard-write; web-share; xr-spatial-tracking"
          />

          {/* Fullscreen toggle — top-right glass pill */}
          <button
            onClick={() => setIsFullscreen((v) => !v)}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                       backdrop-blur-md bg-black/40 ring-1 ring-white/15 text-gray-200 hover:text-white text-xs"
          >
            {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            {isFullscreen ? "Exit" : "Fullscreen"}
          </button>
        </div>

        {!isFullscreen && (
          <>
            {/* Spec cards */}
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
              <SpecCard
                icon={<ThunderboltOutlined />}
                title="PlayCanvas engine"
                body="Production-grade WebGL2 + WebGPU splat renderer, used in real-world capture pipelines."
              />
              <SpecCard
                icon={<DesktopOutlined />}
                title="Full editor toolset"
                body="Selection, transform, crop, rotation align, palette, export. Not just a viewer."
              />
              <SpecCard
                icon={<ExperimentOutlined />}
                title="Every common format"
                body="PLY · SPLAT · KSPLAT · SPZ · COMPRESSED PLY — auto-detected from the file."
              />
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-3 text-sm">
              <button
                onClick={() => navigate("/showreel")}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.06] text-white transition-all"
              >
                ← Showreel
              </button>
              <button
                onClick={() => navigate("/ai-video")}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-semibold transition-all"
              >
                <RocketOutlined /> AI Studio
              </button>
              <span className="ml-auto text-[11px] text-gray-500">
                SuperSplat is MIT-licensed · self-hosted at <code>/supersplat/</code>
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
