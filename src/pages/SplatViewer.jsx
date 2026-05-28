// /splat — In-browser Gaussian splat viewer + editor.
//
// Backed by PlayCanvas SuperSplat (https://superspl.at/editor) —
// a production-grade splat editor self-hosted at /supersplat/.
// The embedded editor opens directly into a sample scene if the
// iframe URL carries a `?load=<url>&filename=<name>` query (which
// SuperSplat reads on boot — see src/main.ts loadList handling).
// We use that hook to wire our three pre-cached samples (bonsai /
// truck / garden) into one-click chips.
//
// To re-build SuperSplat after upstream pulls:
//   cd E:/Github/ai-video-ecosystem/supersplat
//   npm install && npm run build
//   cp -r dist/* E:/Siddharth/portfolio/public/supersplat/

import { useEffect, useRef, useState } from "react";
import {
  ExperimentOutlined,
  ThunderboltOutlined,
  DesktopOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from "@ant-design/icons";

const BE_URL = import.meta.env.VITE_BE_URL || "http://localhost:4001";

// Sample scenes pre-staged on the BE under data/splat-cache/.
// SuperSplat reads the absolute URL from its `load` query param
// and ingests it through its normal import pipeline (auto-detects
// the format from the filename extension).
const SAMPLES = [
  {
    slug: "bonsai",
    label: "Bonsai",
    note: "Mip-NeRF 360 · ~4 MB · fastest first-load",
  },
  {
    slug: "truck",
    label: "Truck",
    note: "TanksAndTemples · ~28 MB",
  },
  {
    slug: "garden",
    label: "Garden",
    note: "Mip-NeRF 360 benchmark scene · ~72 MB",
  },
];

const editorHref = (slug) => {
  if (!slug) return "/supersplat/index.html";
  const fileUrl = `${BE_URL}/api/splat-sample/${slug}.ksplat`;
  return `/supersplat/index.html?load=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(`${slug}.ksplat`)}`;
};

export default function SplatViewer() {
  const frameRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSlug,   setActiveSlug]   = useState(null);

  // Re-mount the iframe by bumping the key whenever a chip is
  // clicked. Mutating `src` mid-life on an iframe also works, but
  // re-keying gives us a clean SuperSplat boot every time, which
  // is what its loadList handler expects (it runs once at startup).
  const [frameKey, setFrameKey] = useState(0);

  const openSample = (slug) => {
    setActiveSlug(slug);
    setFrameKey((k) => k + 1);
  };

  // Ctrl/Cmd+F1 toggle for fullscreen — handy when the user wants
  // the editor without taking a mouse off the keyboard.
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
              — or click a sample below. Powered by{" "}
              <a
                href="https://superspl.at/editor"
                target="_blank"
                rel="noreferrer"
                className="text-rose-300 hover:text-rose-200 underline"
              >
                PlayCanvas SuperSplat
              </a>
              ; files decode 100% in your browser, nothing leaves the tab.
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
          style={isFullscreen ? {} : { minHeight: "clamp(420px, 72vh, 820px)" }}
        >
          <iframe
            ref={frameRef}
            key={frameKey}
            src={editorHref(activeSlug)}
            title="SuperSplat Editor"
            className="absolute inset-0 w-full h-full border-0"
            allow="clipboard-read; clipboard-write; web-share; xr-spatial-tracking"
          />

          {/* Fullscreen toggle — top-right glass pill */}
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
            {/* Sample chip row — clicking re-keys the iframe with a
                ?load= query so SuperSplat boots straight into the
                chosen scene. Active chip is highlighted. */}
            <div className="mt-6">
              <p className="text-[10px] font-mono uppercase tracking-[0.28em] text-gray-500 mb-3">
                Or open a sample directly in the editor
              </p>
              <div className="flex flex-wrap gap-2">
                {SAMPLES.map((s) => {
                  const active = activeSlug === s.slug;
                  return (
                    <button
                      key={s.slug}
                      onClick={() => openSample(s.slug)}
                      className={`group rounded-xl px-4 py-3 ring-1 text-left transition-all min-w-[200px] ${
                        active
                          ? "ring-rose-400/60 bg-rose-500/10"
                          : "ring-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:ring-rose-400/30"
                      }`}
                    >
                      <p
                        className={`text-sm font-semibold ${
                          active ? "text-rose-200" : "text-white group-hover:text-rose-200"
                        }`}
                      >
                        {s.label}
                        {active && (
                          <span className="ml-2 text-[10px] font-mono uppercase tracking-[0.2em] text-rose-300/80">
                            loaded
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{s.note}</p>
                    </button>
                  );
                })}
              </div>
            </div>

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
                body="Selection, transform, crop, palette, rotation align, export. Not just a viewer."
              />
              <SpecCard
                icon={<ExperimentOutlined />}
                title="Every common format"
                body="PLY · SPLAT · KSPLAT · SPZ · COMPRESSED PLY — auto-detected from the file."
              />
            </div>

            <p className="mt-8 text-[11px] text-gray-500">
              SuperSplat is MIT-licensed and self-hosted at{" "}
              <code className="text-gray-400">/supersplat/</code>.
            </p>
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
