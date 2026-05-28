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

// Sample scenes are served through the BE rather than fetched
// directly from Hugging Face — the HF repo returns 401 to anonymous
// browsers, so the BE proxies + caches them using HF_TOKEN. First
// click takes ~30s to download; subsequent clicks are instant from
// the on-disk cache.
const BE_URL = import.meta.env.VITE_BE_URL || "http://localhost:4001";
// Sample scenes are pre-staged on the BE disk under
// data/splat-cache/<slug>.ksplat — extracted from mkkellogg's
// official Gaussian-Splats-3D demo bundle. The .ksplat suffix is
// kept on the URL so the library's URL-based format autodetect
// picks the right parser (BE matches on slug, ignores the suffix).
const SAMPLE_SCENES = [
  {
    label: "Bonsai",
    url: `${BE_URL}/api/splat-sample/bonsai.ksplat`,
    note: "Mip-NeRF 360 · ~4 MB · fastest first-load",
  },
  {
    label: "Truck",
    url: `${BE_URL}/api/splat-sample/truck.ksplat`,
    note: "TanksAndTemples · ~28 MB",
  },
  {
    label: "Garden",
    url: `${BE_URL}/api/splat-sample/garden.ksplat`,
    note: "Mip-NeRF 360 benchmark scene · ~72 MB",
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
  const [splatScale, setSplatScale] = useState(1);   // 1× default; some files export with tiny splats
  const [yFlipped,  setYFlipped]    = useState(true); // INRIA cameraUp [0,-1,0]; flip for Y-up files
  const [logs, setLogs]             = useState([]);
  const logTime = () => new Date().toLocaleTimeString([], { hour12: false }).slice(3);
  const log     = (line) => {
    const stamped = `${logTime()}  ${line}`;
    console.log("[splat]", line);
    setLogs((prev) => [...prev.slice(-24), stamped]);
  };

  // Build the viewer on mount; tear it down on unmount.
  useEffect(() => {
    if (!mountRef.current) return undefined;

    // Camera setup is intentionally generic — after each scene loads
    // we call fitCameraToScene() which reads the actual bounding
    // box from the SplatMesh and re-positions the camera so the
    // scene is framed regardless of where the .ksplat author put it
    // in world space.
    const viewer = new GaussianSplats3D.Viewer({
      rootElement: mountRef.current,
      cameraUp: yFlipped ? [0, -1, 0] : [0, 1, 0],
      initialCameraPosition: [0, 0, 15],    // far enough that any common splat is visible
      initialCameraLookAt: [0, 0, 0],
      sphericalHarmonicsDegree: 0,
      sharedMemoryForWorkers: false,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yFlipped]);   // re-mount when Y-flip toggles (cameraUp is constructor-only)

  // Push the splatScale slider value into the live viewer/mesh.
  // The library exposes `splatScale` on the mesh; falling back to
  // `viewer.splatRenderMode` knobs if the API drifts. Wrapped in
  // try/catch because the value is read every frame so a bad write
  // would tank the render loop.
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    try {
      const mesh = v.getSplatMesh?.();
      if (mesh) {
        if (typeof mesh.splatScale !== "undefined") {
          mesh.splatScale = splatScale;
        } else if (typeof mesh.setSplatScale === "function") {
          mesh.setSplatScale(splatScale);
        }
      }
    } catch (e) {
      console.warn("[splat] splat-scale write failed:", e?.message);
    }
  }, [splatScale]);

  // Read the freshly-loaded SplatMesh's bounding box and reposition
  // the camera + orbit-controls target so the scene is centered in
  // the frame. Without this every scene needs hand-tuned camera
  // values (mkkellogg's demo has per-scene presets) because each
  // .ksplat lives in its own world-space coordinate system, and
  // scales vary wildly (bonsai's diag ~0.5, garden's ~5).
  //
  // CRITICAL — the splat loader streams splats progressively, so
  // mesh.computeBoundingBox() right after addSplatScene resolves
  // often returns a tiny / empty box. We poll every 120 ms for up
  // to 4 s waiting for the box to settle past 0.01 units before
  // applying the camera fit. If we never get a useful box we still
  // place the camera at a reasonable default + log so we can see
  // what happened.
  const doFit = (viewer, box) => {
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const radius = Math.hypot(size.x, size.y, size.z) / 2 || 0.5;
    const fovDeg = viewer.camera?.fov || 65;
    const fovRad = (fovDeg * Math.PI) / 180;
    // Distance to fit a sphere of radius R at FOV f is R / tan(f/2).
    // 2.4× padding gives breathing room + orbit space.
    const dist   = (radius / Math.tan(fovRad / 2)) * 2.4;
    viewer.camera.position.set(
      center.x,
      center.y + radius * 0.3,
      center.z + dist
    );
    viewer.camera.lookAt(center);
    if (viewer.controls?.target) {
      viewer.controls.target.copy(center);
      viewer.controls.update?.();
    }
    const fitMsg =
      `fit · center=(${center.x.toFixed(2)},${center.y.toFixed(2)},${center.z.toFixed(2)}) ` +
      `radius=${radius.toFixed(2)} dist=${dist.toFixed(2)} fov=${fovDeg}°`;
    console.log("[splat]", fitMsg);
    log(fitMsg);
  };

  const fitCameraToScene = async (viewer) => {
    const MAX_ATTEMPTS = 33;        // ~4 s @ 120 ms
    const MIN_SIZE     = 0.01;      // sub-cm boxes are still-loading
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const mesh = viewer.getSplatMesh?.();
        if (mesh) {
          if (mesh.computeBoundingBox) mesh.computeBoundingBox();
          const box = mesh.boundingBox;
          if (box && box.isBox3 && (!box.isEmpty || !box.isEmpty())) {
            const size = box.getSize(new THREE.Vector3());
            const big  = Math.max(size.x, size.y, size.z);
            if (big > MIN_SIZE) {
              doFit(viewer, box);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('[splat] fit attempt error:', err?.message);
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    // Bounds never settled — pull the camera way back so the scene
    // is at least visible somewhere in the canvas instead of stuck
    // inside the cloud.
    try {
      viewer.camera.position.set(0, 0, 8);
      viewer.camera.lookAt(new THREE.Vector3(0, 0, 0));
      viewer.controls?.target?.set(0, 0, 0);
      viewer.controls?.update?.();
    } catch (_) {}
    console.warn('[splat] bounds never settled — using safe default camera');
    log('bounds never settled · using (0,0,8) fallback — try Pull-back + crank scale');
  };

  const loadFromSource = async (src, displayName) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    setStatus({ phase: "loading", msg: `Decoding ${displayName}…` });
    log(`load · ${displayName}`);
    try {
      // If a previous scene is mounted, drop it first. The library
      // queues scenes by index so we tear them all down to keep memory
      // bounded — splats are 50-300 MB resident.
      while (viewer.getSceneCount() > 0) {
        await viewer.removeSplatScene(0);
      }
      // Format autodetect: blob: URLs (drag-drop uploads) don't carry
      // a file extension, so guessFormat(src) returns undefined. Fall
      // back to the displayName, which is set to file.name for picks
      // and to the URL's tail for pasted URLs — either gives us a
      // proper extension.
      const fmt = guessFormat(src) ?? guessFormat(displayName);
      if (fmt === undefined) {
        throw new Error(
          `Unknown splat format. Filename "${displayName}" needs ` +
          `to end in .ply, .splat, .ksplat, or .spz so the library ` +
          `knows which parser to use.`
        );
      }
      log(`format detected · ${["UNKNOWN","Ply","Splat","KSplat","Spz"][fmt] || fmt}`);
      log(`fetching scene…`);
      await viewer.addSplatScene(src, {
        format: fmt,
        showLoadingUI: false,
        splatAlphaRemovalThreshold: 5,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        onProgress: (pct, stage) => {
          if (pct == null) return;
          const p = Math.round(pct * 100);
          if (p % 10 === 0) log(`${stage || "progress"} ${p}%`);
        },
      });
      log(`scene loaded · framing camera…`);
      // Frame the actual content — the library's default camera is
      // generic and bonsai/garden/truck are all offset differently
      // in world space, so we re-target after every load.
      await fitCameraToScene(viewer);
      setSceneName(displayName);
      setStatus({ phase: "ready", msg: "Scene loaded · drag to look · scroll to dolly" });
    } catch (err) {
      console.error("[splat] load failed", err);
      log(`ERROR · ${err?.message || err}`);
      setStatus({
        phase: "error",
        msg: err?.message?.slice(0, 220) || "Failed to decode splat",
      });
    }
  };

  // When the user drops or picks a file, upload it to the BE first
  // so it has a real, stream-able URL with Range support — same
  // path as the sample chips. Two wins:
  //   1. Huge captures (200–600 MB) don't sit in browser memory
  //      forever as a blob.
  //   2. The library can progress-bar the decode via HTTP, instead
  //      of just exposing parse-time progress on a blob URL.
  // Falls back to a blob URL if the BE is unreachable so dev /
  // offline still works.
  const uploadAndLoad = async (file) => {
    if (!file) return;
    log(`picked file · ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`);
    setStatus({ phase: "loading", msg: "Uploading to server…" });
    try {
      const fd = new FormData();
      fd.append("splat", file, file.name);
      log("uploading to BE…");
      const res = await fetch(`${BE_URL}/api/splat-upload`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`BE returned ${res.status}`);
      const body = await res.json();
      const remoteUrl = body?.data?.url || body?.url;
      if (!remoteUrl) throw new Error("BE did not return a URL");
      const absolute = remoteUrl.startsWith("http") ? remoteUrl : `${BE_URL}${remoteUrl}`;
      log(`upload OK · ${absolute.split("/").pop()}`);
      // The BE filename ends with the original extension so the
      // library's URL-based format autodetect picks the right parser.
      await loadFromSource(absolute, file.name);
    } catch (err) {
      log(`BE upload failed (${err.message}) · falling back to local blob`);
      console.warn("[splat] BE upload failed, using blob fallback:", err);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      await loadFromSource(url, file.name);
    }
  };

  // Kept as the entry from the file input + drag-drop. Async errors
  // are caught inside uploadAndLoad so this is fire-and-forget.
  const onPickFile = (file) => { uploadAndLoad(file); };

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
    fitCameraToScene(v);
  };

  // Hard-reset to a far-back camera so a scene that's "stuck
  // off-screen" comes back into view. Independent of auto-fit so
  // even if the bounding box is empty the user has a way out.
  const pullBack = () => {
    const v = viewerRef.current;
    if (!v) return;
    try {
      v.camera.position.set(0, 0, 20);
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

          {/* Visibility rescue bar — bottom-right. When the auto-fit
              fails (rare splat formats, tiny clouds) the user has
              concrete knobs: scale splats up, flip Y, or pull the
              camera way back. Always visible once a scene's loaded. */}
          {status.phase === "ready" && (
            <div className="absolute bottom-3 right-3 z-10">
              <div className="rounded-xl px-3 py-2 backdrop-blur-md bg-black/40 ring-1 ring-white/10 flex items-center gap-2 text-[10px]">
                <span className="text-gray-400 font-mono uppercase tracking-[0.18em]">scale</span>
                <input
                  type="range"
                  min="0.5"
                  max="6"
                  step="0.25"
                  value={splatScale}
                  onChange={(e) => setSplatScale(parseFloat(e.target.value))}
                  className="w-24 accent-rose-500"
                />
                <span className="text-gray-300 font-mono w-8 text-right">{splatScale.toFixed(2)}×</span>
                <span className="w-px h-4 bg-white/15 mx-1" />
                <button
                  onClick={() => setYFlipped((v) => !v)}
                  title="Flip Y-axis (file format mismatch)"
                  className="px-2 py-1 rounded-md hover:bg-white/10 text-gray-300 hover:text-white font-mono"
                >
                  {yFlipped ? "Y▼" : "Y▲"}
                </button>
                <button
                  onClick={pullBack}
                  title="Pull camera way back"
                  className="px-2 py-1 rounded-md hover:bg-white/10 text-gray-300 hover:text-white font-mono"
                >
                  Pull back
                </button>
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

        {/* Live activity log — same shape as the Cinema/Room log
            strips. Fires for every pick, upload, format detect,
            decode-progress %, camera fit, and error. */}
        {logs.length > 0 && (
          <div className="mt-6 rounded-2xl ring-1 ring-white/10 bg-black/40 backdrop-blur p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-gray-400">
                Live · viewer log
              </p>
              <button
                onClick={() => setLogs([])}
                className="ml-auto text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500 hover:text-gray-200"
              >
                clear
              </button>
            </div>
            <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1 text-[11px] font-mono leading-snug">
              {logs.slice(-16).map((line, i) => (
                <div
                  key={i}
                  className={
                    line.includes("ERROR")
                      ? "text-rose-300"
                      : line.includes("upload") || line.includes("BE")
                        ? "text-amber-200"
                        : "text-gray-300"
                  }
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sample chips — only render when we have curated slugs.
            Otherwise drop a "where to get a test file" hint card. */}
        {SAMPLE_SCENES.length > 0 ? (
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
        ) : (
          <div className="mt-6 rounded-xl ring-1 ring-white/10 bg-white/[0.02] px-5 py-4 text-[12px] text-gray-400">
            <p className="text-[10px] font-mono uppercase tracking-[0.28em] text-gray-500 mb-2">
              Don&apos;t have a splat file?
            </p>
            <p>
              Grab one from{" "}
              <a
                href="https://projects.markkellogg.org/downloads/gaussian_splat_data.zip"
                target="_blank"
                rel="noreferrer"
                className="text-rose-300 hover:text-rose-200 underline"
              >
                mkkellogg&apos;s demo bundle
              </a>{" "}
              (zip of curated scenes), export a capture from{" "}
              <a href="https://lumalabs.ai" target="_blank" rel="noreferrer" className="text-rose-300 hover:text-rose-200 underline">Luma</a>
              {" "}or{" "}
              <a href="https://poly.cam" target="_blank" rel="noreferrer" className="text-rose-300 hover:text-rose-200 underline">Polycam</a>
              , or train your own with{" "}
              <a href="https://github.com/graphdeco-inria/gaussian-splatting" target="_blank" rel="noreferrer" className="text-rose-300 hover:text-rose-200 underline">INRIA&apos;s repo</a>
              {" "}— then drop the file into the viewer above.
            </p>
          </div>
        )}

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
