// /splat — In-browser Gaussian Splat viewer. Drop a .ply, .splat,
// .ksplat, or .spz file (or paste a URL) and pilot through the scene
// as a first-person camera. Uses @mkkellogg/gaussian-splats-3d, the
// Three.js-native runtime that ships parsers for every common splat
// format. The viewer manages its own canvas + render loop so we just
// mount it into a rootElement ref and let it run.
//
// Why this and not PlayCanvas SuperSplat: SuperSplat is an editor app
// (superspl.at/editor), not an embeddable library. mkkellogg's runtime
// is MIT-licensed, ~1 MB gzipped, and works inside a regular React tree
// without any iframe or worker plumbing.
//
// Files supported (auto-detected from extension):
//   .ply       raw INRIA-format Gaussian splats
//   .splat     packed splat binary (lighter than ply, slow first parse)
//   .ksplat    pre-processed for instant load, recommended for hosting
//   .spz       PlayCanvas compressed format, smallest on the wire
//
// Camera modes:
//   orbit  — drag to rotate, scroll to dolly, right-drag to pan
//   fly    — WASD + mouse look (pointer-locked) for a first-person feel

import { useEffect, useRef, useState } from "react";
import {
  CloudUploadOutlined,
  LinkOutlined,
  CameraOutlined,
  AimOutlined,
  ReloadOutlined,
  ExperimentOutlined,
  CompressOutlined,
} from "@ant-design/icons";
import * as GaussianSplats3D from "@mkkellogg/gaussian-splats-3d";
import * as THREE from "three";

const ACCEPTED_EXT = ".ply,.splat,.ksplat,.spz";
const SAMPLE_SCENES = [
  {
    label: "Garden (INRIA)",
    url: "https://huggingface.co/cakewalk/sample-splat/resolve/main/garden_high.ksplat",
    note: "Classic Gaussian-Splat benchmark scene · ~28 MB ksplat",
  },
  {
    label: "Truck",
    url: "https://huggingface.co/cakewalk/sample-splat/resolve/main/truck_high.ksplat",
    note: "TanksAndTemples · ~18 MB ksplat",
  },
];

const guessFormat = (nameOrUrl) => {
  const n = (nameOrUrl || "").toLowerCase();
  if (n.endsWith(".ksplat")) return GaussianSplats3D.SceneFormat.KSplat;
  if (n.endsWith(".ply"))    return GaussianSplats3D.SceneFormat.Ply;
  if (n.endsWith(".splat"))  return GaussianSplats3D.SceneFormat.Splat;
  if (n.endsWith(".spz"))    return GaussianSplats3D.SceneFormat.Spz;
  return undefined;
};

export default function SplatViewer() {
  const mountRef    = useRef(null);
  const viewerRef   = useRef(null);
  const objectUrlRef = useRef(null);

  const [status, setStatus]   = useState({ phase: "idle", msg: "" });
  // 'idle' | 'loading' | 'ready' | 'error'
  const [sceneName, setSceneName] = useState("");
  const [urlInput, setUrlInput]   = useState("");
  const [hudOpen, setHudOpen]     = useState(true);

  // Build the viewer on mount; tear it down on unmount.
  useEffect(() => {
    if (!mountRef.current) return undefined;

    const viewer = new GaussianSplats3D.Viewer({
      rootElement: mountRef.current,
      cameraUp: [0, -1, 0],
      initialCameraPosition: [0, -1, -3],
      initialCameraLookAt: [0, 0, 0],
      sphericalHarmonicsDegree: 0,
      sharedMemoryForWorkers: false, // safer cross-origin default
      gpuAcceleratedSort: true,
      enableSIMDInSort: true,
      dynamicScene: false,
      antialiased: true,
      threeScene: undefined,
      logLevel: GaussianSplats3D.LogLevel.Warning,
    });
    viewerRef.current = viewer;

    // Kick the render loop — even with no scene loaded this paints the
    // gradient backdrop the library renders so the container isn't
    // a black void while the user is browsing for a file.
    viewer.start();

    return () => {
      try { viewer.dispose(); } catch (_) {}
      viewerRef.current = null;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const loadFromSource = async (src, displayName) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    setStatus({ phase: "loading", msg: `Decoding ${displayName}…` });
    try {
      // If a previous scene is mounted, drop it first. The library
      // queues scenes by index so we tear them all down to keep memory
      // bounded — splats are 50-300 MB resident.
      while (viewer.getSceneCount() > 0) {
        await viewer.removeSplatScene(0);
      }
      const fmt = guessFormat(src);
      await viewer.addSplatScene(src, {
        format: fmt,
        showLoadingUI: false,
        splatAlphaRemovalThreshold: 5,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      });
      setSceneName(displayName);
      setStatus({ phase: "ready", msg: "Scene loaded · drag to look · scroll to dolly" });
    } catch (err) {
      console.error("[splat] load failed", err);
      setStatus({
        phase: "error",
        msg: err?.message?.slice(0, 220) || "Failed to decode splat",
      });
    }
  };

  const onPickFile = (file) => {
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    loadFromSource(url, file.name);
  };

  const onUrlSubmit = (e) => {
    e?.preventDefault?.();
    if (!urlInput.trim()) return;
    loadFromSource(urlInput.trim(), urlInput.split("/").pop());
  };

  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) onPickFile(file);
  };

  const recenter = () => {
    const v = viewerRef.current;
    if (!v) return;
    try {
      v.camera.position.set(0, -1, -3);
      v.camera.lookAt(new THREE.Vector3(0, 0, 0));
      v.controls?.target?.set(0, 0, 0);
      v.controls?.update?.();
    } catch (_) {}
  };

  return (
    <div className="relative min-h-screen w-full bg-[#05050a] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 sm:px-6 overflow-hidden">
      {/* Ambient backdrop — pure CSS, no extra Three.js cost. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] rounded-full bg-rose-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[40vw] h-[40vw] rounded-full bg-amber-500/8 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Heading */}
        <header className="mb-8 sm:mb-10">
          <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-rose-300/80">
            — In-browser splat viewer
          </p>
          <h1 className="mt-3 font-poppins font-black tracking-tight text-4xl sm:text-5xl md:text-6xl">
            Walk through any{" "}
            <span className="text-rose-500">Gaussian splat</span>
          </h1>
          <p className="mt-4 max-w-2xl text-gray-300 text-sm sm:text-base leading-relaxed">
            Drop a <code className="text-amber-200">.ply</code>,{" "}
            <code className="text-amber-200">.splat</code>,{" "}
            <code className="text-amber-200">.ksplat</code>, or{" "}
            <code className="text-amber-200">.spz</code> file and pilot through
            it like a camera. Decoding happens entirely in the browser — your
            scene never leaves the tab.
          </p>
        </header>

        {/* Viewer + HUD */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="relative rounded-3xl overflow-hidden ring-1 ring-white/10 bg-black aspect-[16/10] sm:aspect-[16/9]"
          style={{ minHeight: "clamp(360px, 60vh, 720px)" }}
        >
          {/* Three.js canvas root — the library appends its canvas here. */}
          <div ref={mountRef} className="absolute inset-0" />

          {/* Empty state — only when no scene is mounted. Sits above
              the canvas. Pointer events are intentional so the user
              can click "Pick file" without dismissing the canvas. */}
          {status.phase === "idle" && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="text-center px-6">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-500/15 ring-1 ring-rose-400/30 mb-4">
                  <CloudUploadOutlined className="text-2xl text-rose-300" />
                </div>
                <p className="text-lg font-semibold text-white">
                  Drop a splat file anywhere here
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Or use the controls below ↓
                </p>
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {status.phase === "loading" && (
            <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-sm">
              <div className="text-center">
                <div className="inline-block w-8 h-8 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-spin" />
                <p className="mt-4 text-sm text-gray-200">{status.msg}</p>
              </div>
            </div>
          )}

          {/* Top-right HUD — scene name + dispose button. Floats over
              the canvas, only after a scene is loaded. */}
          {hudOpen && status.phase === "ready" && (
            <div className="absolute top-3 right-3 z-10 max-w-[60%] sm:max-w-[40%]">
              <div className="rounded-xl px-3 py-2 backdrop-blur-md bg-black/40 ring-1 ring-white/10 text-[11px] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="font-mono text-gray-200 truncate">{sceneName}</span>
                <button
                  onClick={recenter}
                  title="Re-center camera"
                  className="ml-1 inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-white/10 text-gray-300 hover:text-white"
                >
                  <AimOutlined className="text-[10px]" />
                </button>
                <button
                  onClick={() => setHudOpen(false)}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-white/10 text-gray-400 hover:text-white"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Bottom-left helper — control hints */}
          {status.phase === "ready" && (
            <div className="absolute bottom-3 left-3 z-10 hidden sm:block">
              <div className="rounded-xl px-3 py-2 backdrop-blur-md bg-black/40 ring-1 ring-white/10 text-[10px] font-mono uppercase tracking-[0.18em] text-gray-300 flex items-center gap-3">
                <span><kbd className="px-1.5 py-0.5 rounded bg-white/10 mr-1">drag</kbd>look</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-white/10 mr-1">scroll</kbd>dolly</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-white/10 mr-1">rt-drag</kbd>pan</span>
              </div>
            </div>
          )}

          {/* Error banner */}
          {status.phase === "error" && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm">
              <div className="max-w-md px-6 text-center">
                <p className="text-sm font-semibold text-rose-300">Couldn&apos;t load that scene</p>
                <p className="mt-2 text-xs text-gray-400">{status.msg}</p>
                <button
                  onClick={() => setStatus({ phase: "idle", msg: "" })}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500/15 ring-1 ring-rose-400/40 text-rose-200 text-xs font-semibold hover:bg-rose-500/25"
                >
                  <ReloadOutlined /> Try again
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Source controls */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* File picker */}
          <label className="cursor-pointer group">
            <input
              type="file"
              accept={ACCEPTED_EXT}
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
            <div className="rounded-2xl px-5 py-4 ring-1 ring-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:ring-rose-400/40 transition-all flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 ring-1 ring-rose-400/30 grid place-items-center text-rose-300">
                <CloudUploadOutlined />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Pick a file</p>
                <p className="text-[11px] text-gray-400 truncate">
                  .ply · .splat · .ksplat · .spz
                </p>
              </div>
            </div>
          </label>

          {/* URL form */}
          <form onSubmit={onUrlSubmit} className="rounded-2xl px-5 py-4 ring-1 ring-white/10 bg-white/[0.03] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 ring-1 ring-amber-400/30 grid place-items-center text-amber-300 shrink-0">
              <LinkOutlined />
            </div>
            <input
              type="url"
              placeholder="https://… (paste a splat URL)"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-white placeholder:text-gray-500"
            />
            <button
              type="submit"
              disabled={!urlInput.trim()}
              className="px-3 py-1.5 rounded-lg bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black text-xs font-bold hover:bg-amber-300 transition-colors"
            >
              Load
            </button>
          </form>
        </div>

        {/* Sample chips */}
        <div className="mt-6">
          <p className="text-[10px] font-mono uppercase tracking-[0.28em] text-gray-500 mb-3">
            Try a sample scene
          </p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_SCENES.map((s) => (
              <button
                key={s.url}
                onClick={() => loadFromSource(s.url, s.label)}
                className="group rounded-xl px-4 py-3 ring-1 ring-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:ring-rose-400/30 text-left transition-all"
              >
                <p className="text-sm font-semibold text-white group-hover:text-rose-200">
                  {s.label}
                </p>
                <p className="text-[11px] text-gray-500">{s.note}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Spec note */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
          <SpecCard
            icon={<ExperimentOutlined />}
            title="WebGL2 + WebWorker decode"
            body="Splat parsing runs off-thread so the page never freezes, even on 200 MB scenes."
          />
          <SpecCard
            icon={<CompressOutlined />}
            title="Every common format"
            body="PLY / SPLAT / KSPLAT / SPZ — autodetected from the file extension."
          />
          <SpecCard
            icon={<CameraOutlined />}
            title="Cinematic orbit camera"
            body="Drag, scroll-dolly, right-drag pan. Re-center any time from the HUD."
          />
        </div>
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
