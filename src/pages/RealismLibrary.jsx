// /realism/library — Library of locally-stored realism renders.
//
// All saved videos live on the BE disk (data/realism-library/) — the
// FE just lists them via /api/realism/list. Vault-aware: anonymous
// users see only public renders, vault-unlocked users see both with
// a fuchsia badge on private rows. Hover-preview tiles, size badge,
// vault-gated delete.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, message } from "antd";
import {
  AppstoreOutlined,
  PlayCircleOutlined,
  DownloadOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  FileSearchOutlined,
  LockOutlined,
  CloudUploadOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import { useVault } from "../contexts/VaultContext";

const BE_URL = import.meta.env.VITE_BE_URL || "http://localhost:4001";
const HISTORY_KEY = "sid-realism-jobs";   // local in-flight tracker, same key /realism uses

function vaultHeaders() {
  try {
    const t = localStorage.getItem("sid-vault-token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}
function readHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}

const fmtBytes = (b) => {
  if (!b && b !== 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};
const fmtDate = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString([], {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
};

export default function RealismLibrary() {
  const navigate = useNavigate();
  const { isUnlocked, requireUnlock } = useVault();
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState(null);
  const [viewing, setViewing]   = useState(null);
  // Locally-tracked in-flight jobs that haven't shown up on the BE
  // library yet (still rendering on the worker).
  const [inFlight, setInFlight] = useState([]);

  const fetchList = async () => {
    setRefreshing(true); setError(null);
    try {
      const res = await fetch(`${BE_URL}/api/realism/list`, { headers: vaultHeaders() });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
      setItems(body?.data?.items || []);
      // Show in-flight history entries whose jobId isn't yet on the
      // BE list, so the user can see the live render in progress.
      const savedJobIds = new Set((body?.data?.items || []).map((i) => i.sourceJobId || i.id));
      const hist = readHistory();
      const pending = [];
      await Promise.all(hist.map(async (h) => {
        if (savedJobIds.has(h.jobId)) return;
        // Probe AI Video status — if completed/failed we skip, if
        // running we include it on the list as a placeholder.
        try {
          const r = await fetch(`${BE_URL}/api/ai-video/status/${h.jobId}`, { headers: vaultHeaders() });
          const j = await r.json();
          const row = j?.data || j;
          if (row?.status && row.status !== "completed" && row.status !== "failed") {
            pending.push({ ...h, status: row.status, progressMessage: row.progressMessage });
          }
        } catch {}
      }));
      setInFlight(pending);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchList(); /* eslint-disable-next-line */ }, [isUnlocked]);
  // Re-probe live items on a 12s tick.
  useEffect(() => {
    if (inFlight.length === 0) return undefined;
    const t = setInterval(fetchList, 12000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlight.length]);

  const onDelete = async (item) => {
    Modal.confirm({
      title: `Delete "${item.title}"?`,
      content: "Removes the MP4 from the BE. Cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        const ok = await requireUnlock();
        if (!ok) return;
        try {
          const res = await fetch(`${BE_URL}/api/realism/${item.id}`, { method: "DELETE", headers: vaultHeaders() });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          message.success("Deleted");
          fetchList();
        } catch (e) { message.error(e.message || "Delete failed"); }
      },
    });
  };

  const total       = items.length;
  const publicCount = items.filter((i) => !i.vault).length;
  const vaultCount  = items.filter((i) =>  i.vault).length;

  return (
    <div className="relative min-h-screen w-full bg-[#05050a] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 sm:px-6 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] rounded-full bg-rose-500/10 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-rose-300/80">
              — Realism library
            </p>
            <h1 className="mt-2 font-poppins font-black text-3xl sm:text-4xl md:text-5xl">
              My renders
            </h1>
            <p className="mt-2 text-sm text-gray-400 flex items-center gap-3 flex-wrap">
              <span>{total} on disk</span>
              <span>·</span>
              <span>{publicCount} public</span>
              {isUnlocked ? (
                <>
                  <span>·</span>
                  <span className="text-fuchsia-300">{vaultCount} private (vault)</span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 text-fuchsia-300/80">
                  <LockOutlined /> Private items hidden — unlock vault to see them
                </span>
              )}
              {inFlight.length > 0 && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <LoadingOutlined spin /> {inFlight.length} rendering
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/realism")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-semibold transition-colors"
            >
              <ThunderboltOutlined /> New render
            </button>
            <button
              onClick={fetchList}
              disabled={refreshing}
              title="Refresh"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-white text-sm"
            >
              <ReloadOutlined spin={refreshing} />
            </button>
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : (items.length === 0 && inFlight.length === 0) ? (
          <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.02] px-8 py-12 text-center">
            <CloudUploadOutlined className="text-3xl text-rose-300/70 mb-3" />
            <p className="text-white font-semibold">No renders yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Head to <strong>/realism</strong>, type a prompt, hit Generate — they&apos;ll land here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {inFlight.map((h) => (
              <PendingTile key={h.jobId} entry={h} onOpen={() => navigate(`/realism/job/${h.jobId}`)} />
            ))}
            {items.map((it) => (
              <Tile
                key={it.id}
                item={it}
                onView={() => setViewing({ url: `${BE_URL}${it.url}`, title: it.title })}
                onLogs={() => it.sourceJobId && navigate(`/realism/job/${it.sourceJobId}`)}
                onDelete={() => onDelete(it)}
              />
            ))}
          </div>
        )}
      </div>

      {viewing && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md grid place-items-center p-4" onClick={() => setViewing(null)}>
          <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <div className="absolute -top-10 left-0 right-0 flex items-center justify-between text-sm">
              <span className="text-white font-semibold truncate pr-4">{viewing.title}</span>
              <div className="flex items-center gap-2 shrink-0">
                <a href={viewing.url} download className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs">
                  <DownloadOutlined /> Download
                </a>
                <button onClick={() => setViewing(null)} className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white text-lg">×</button>
              </div>
            </div>
            <video src={viewing.url} controls autoPlay playsInline className="w-full max-h-[80vh] rounded-2xl bg-black ring-1 ring-white/10" />
          </div>
        </div>
      )}
    </div>
  );
}

function PendingTile({ entry, onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-2xl overflow-hidden ring-1 ring-amber-400/40 bg-amber-500/[0.04] hover:bg-amber-500/[0.07] transition-colors"
    >
      <div className="aspect-video bg-black grid place-items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 ring-1 ring-amber-400/40 text-amber-200 text-[11px] font-mono uppercase tracking-[0.18em]">
          <LoadingOutlined spin /> {entry.status || "rendering"}
        </div>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-semibold text-white truncate" title={entry.title}>{entry.title}</p>
        <p className="text-[11px] text-amber-200/80 truncate font-mono">{entry.progressMessage || "Worker is processing…"}</p>
      </div>
    </button>
  );
}

function Tile({ item, onView, onLogs, onDelete }) {
  const videoRef = useRef(null);
  const fullUrl   = `${BE_URL}${item.url}`;
  const posterUrl = `${BE_URL}${item.poster}`;

  const onEnter = () => {
    const v = videoRef.current;
    if (!v) return;
    try { v.currentTime = 0; v.play().catch(() => {}); } catch {}
  };
  const onLeave = () => {
    const v = videoRef.current;
    if (!v) return;
    try { v.pause(); v.currentTime = 0; } catch {}
  };

  return (
    <div
      className={`group relative rounded-2xl overflow-hidden ring-1 transition-all ring-white/10 hover:ring-white/30`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="aspect-video bg-black relative">
        <video ref={videoRef} src={fullUrl} poster={posterUrl} preload="metadata" muted loop playsInline className="w-full h-full object-cover" />
        <div className="absolute inset-0 grid place-items-center pointer-events-none opacity-100 group-hover:opacity-0 transition-opacity bg-gradient-to-t from-black/50 via-black/10 to-transparent">
          <PlayCircleOutlined className="text-4xl text-white/70" />
        </div>
        {item.vault ? (
          <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fuchsia-500/20 ring-1 ring-fuchsia-400/40 text-fuchsia-200 text-[10px] font-mono uppercase tracking-[0.18em]">
            <LockOutlined className="text-[9px]" /> vault
          </div>
        ) : null}
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white text-[10px] font-mono">
          {fmtBytes(item.bytes)}
        </div>
        {item.model && (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white text-[10px] font-mono">
            {item.model}
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 bg-black/40 backdrop-blur-sm">
        <p className="text-sm font-semibold text-white truncate" title={item.title}>{item.title}</p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500 truncate flex-1 min-w-0">
            {[item.resolution, item.steps ? `${item.steps} steps` : null, fmtDate(item.createdAt)].filter(Boolean).join(" · ")}
          </p>
          <div className="shrink-0 flex items-center gap-0.5">
            {item.sourceJobId && (
              <button onClick={(e) => { e.stopPropagation(); onLogs(); }} title="Job logs"
                className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-300 hover:text-white hover:bg-white/10">
                <FileSearchOutlined className="text-[12px]" />
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onView(); }} title="View"
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-300 hover:text-white hover:bg-white/10">
              <EyeOutlined className="text-[12px]" />
            </button>
            <a href={fullUrl} download={`${item.title || item.id}.mp4`} onClick={(e) => e.stopPropagation()} title="Download"
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-300 hover:text-white hover:bg-white/10">
              <DownloadOutlined className="text-[12px]" />
            </a>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete"
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-rose-300 hover:text-white hover:bg-rose-500/20">
              <DeleteOutlined className="text-[12px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
