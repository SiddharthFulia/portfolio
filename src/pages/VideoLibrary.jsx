// /edit/library — Library of saved video-editor exports.
//
// - Anonymous: sees only public uploads (vault=0).
// - Vault-unlocked: sees public + private rows + can delete (single +
//   bulk).
// - Hover preview: each tile autoplays the MP4 muted on hover, falls
//   back to the lazy-extracted poster jpg in the resting state.
// - Bulk select via checkbox in tile corner → bottom action bar → POST
//   /api/edit/bulk-delete.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, message } from "antd";
import {
  AppstoreOutlined,
  CheckOutlined,
  DeleteOutlined,
  LockOutlined,
  ReloadOutlined,
  ScissorOutlined,
  PlayCircleOutlined,
  ImportOutlined,
  LoadingOutlined,
  DownloadOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { useVault } from "../contexts/VaultContext";

const BE_URL = import.meta.env.VITE_BE_URL || "http://localhost:4001";

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

function vaultHeaders() {
  try {
    const t = localStorage.getItem("sid-vault-token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

export default function VideoLibrary() {
  const navigate = useNavigate();
  const { isUnlocked, requireUnlock } = useVault();

  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef(null);
  const [viewing, setViewing] = useState(null);   // {url, title} | null

  const fetchList = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BE_URL}/api/edit/list`, { headers: vaultHeaders() });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
      const list = body?.data?.items || [];
      setItems(list);
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch whenever vault state changes — anonymous → unlocked
  // reveals private rows; unlocked → anonymous hides them.
  useEffect(() => { fetchList(); /* eslint-disable-next-line */ }, [isUnlocked]);

  // Manual import path — any MP4 sitting on the user's machine
  // (e.g. a download from /edit/advanced's Export, or anywhere
  // else) gets dropped into the same library used by /edit.
  const onImportFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 500 * 1024 * 1024) {
      message.error("File is over the 500 MB limit");
      return;
    }
    if (!f.type?.startsWith("video/")) {
      message.error("Pick a video file");
      return;
    }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("video", f);
      const baseName = f.name.replace(/\.[^.]+$/, "").slice(0, 80);
      fd.append("title", baseName || "Imported video");
      const res = await fetch(`${BE_URL}/api/edit/upload`, {
        method:  "POST",
        body:    fd,
        headers: { ...vaultHeaders() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || `Import failed: ${res.status}`);
      message.success(`Imported ${baseName}`);
      fetchList();
    } catch (err) {
      message.error(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const allSelected = useMemo(
    () => items.length > 0 && items.every((it) => selected.has(it.id)),
    [items, selected]
  );

  const toggleOne = (id) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((it) => it.id)));
  };

  // Silent vault gate — we do NOT prompt before the user has actually
  // tried to delete something. Once they confirm the delete dialog,
  // if their token is missing/expired we open the login modal, wait
  // for unlock, then run the request. If they cancel the login modal
  // the delete just doesn't happen — no toast, no banner, no nag.
  const deleteOne = (id, title) => {
    Modal.confirm({
      title: `Delete "${title}"?`,
      content: "Removes the MP4 + poster from the BE. This cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        const ok = await requireUnlock();
        if (!ok) return;
        try {
          const res = await fetch(`${BE_URL}/api/edit/${id}`, { method: "DELETE", headers: vaultHeaders() });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          message.success("Deleted");
          fetchList();
        } catch (e) {
          message.error(e.message || "Delete failed");
        }
      },
    });
  };

  const deleteBulk = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    Modal.confirm({
      title: `Delete ${ids.length} video${ids.length === 1 ? "" : "s"}?`,
      content: "Removes the MP4 + poster from the BE for every selected row. Cannot be undone.",
      okText: "Delete all",
      okButtonProps: { danger: true },
      onOk: async () => {
        const ok = await requireUnlock();
        if (!ok) return;
        try {
          const res = await fetch(`${BE_URL}/api/edit/bulk-delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...vaultHeaders() },
            body: JSON.stringify({ ids }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
          message.success(`Deleted ${body.data.ok} / ${body.data.total}`);
          setSelected(new Set());
          fetchList();
        } catch (e) {
          message.error(e.message || "Bulk delete failed");
        }
      },
    });
  };

  const total = items.length;
  const publicCount  = items.filter((i) => !i.vault).length;
  const vaultCount   = items.filter((i) => i.vault).length;

  return (
    <div className="relative min-h-screen w-full bg-[#05050a] text-gray-100 pt-24 sm:pt-32 pb-32 px-4 sm:px-6 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] rounded-full bg-rose-500/10 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-rose-300/80">
              — Edited videos
            </p>
            <h1 className="mt-2 font-poppins font-black tracking-tight text-3xl sm:text-4xl md:text-5xl">
              My library
            </h1>
            <p className="mt-3 text-sm text-gray-400 flex items-center gap-3 flex-wrap">
              <span>{total} total</span>
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
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={importInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={onImportFile}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              title="Import any MP4 from your device (e.g. an Export from the timeline editor)"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-400/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-100 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {importing ? <LoadingOutlined /> : <ImportOutlined />}
              {importing ? "Importing…" : "Import from device"}
            </button>
            <button
              onClick={() => navigate("/edit")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-semibold transition-colors"
            >
              <ScissorOutlined /> New edit
            </button>
            <button
              onClick={fetchList}
              title="Refresh"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-white text-sm transition-colors"
            >
              <ReloadOutlined />
            </button>
          </div>
        </header>

        {/* Multi-select control row */}
        {items.length > 0 && (
          <div className="mb-4 flex items-center gap-3 text-xs">
            <button
              onClick={toggleAll}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ring-1 ring-white/15 text-gray-300 hover:text-white hover:bg-white/[0.04]"
            >
              <span className={`w-3.5 h-3.5 rounded grid place-items-center ring-1 ${
                allSelected ? "bg-rose-500 ring-rose-400" : "ring-white/30"
              }`}>
                {allSelected && <CheckOutlined className="text-[8px] text-white" />}
              </span>
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            <span className="text-gray-500">
              {selected.size} of {items.length} selected
            </span>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl ring-1 ring-white/10 bg-white/[0.02] px-8 py-12 text-center">
            <AppstoreOutlined className="text-3xl text-rose-300/70 mb-3" />
            <p className="text-white font-semibold">No saved edits yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Click <strong>New edit</strong>, drop clips into OpenReel, export
              with <em>Save to library</em> and they&apos;ll appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((it) => (
              <Tile
                key={it.id}
                item={it}
                selected={selected.has(it.id)}
                onToggle={() => toggleOne(it.id)}
                onDelete={() => deleteOne(it.id, it.title)}
                onView={() => setViewing({ url: `${BE_URL}${it.url}`, title: it.title })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Full-screen play modal */}
      {viewing && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md grid place-items-center p-4"
          onClick={() => setViewing(null)}
        >
          <div
            className="relative w-full max-w-6xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -top-10 left-0 right-0 flex items-center justify-between text-sm">
              <span className="text-white font-semibold truncate pr-4">{viewing.title}</span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={viewing.url}
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs"
                >
                  <DownloadOutlined /> Download
                </a>
                <button
                  onClick={() => setViewing(null)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white text-lg"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>
            <video
              src={viewing.url}
              controls
              autoPlay
              playsInline
              className="w-full max-h-[80vh] rounded-2xl bg-black ring-1 ring-white/10"
            />
          </div>
        </div>
      )}

      {/* Floating bulk-action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 rounded-2xl px-4 py-3 backdrop-blur-xl bg-black/70 ring-1 ring-white/15 shadow-2xl flex items-center gap-4">
          <span className="text-sm text-white font-semibold">{selected.size} selected</span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-400 hover:text-white"
          >
            Clear
          </button>
          <span className="w-px h-5 bg-white/20" />
          <button
            onClick={deleteBulk}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold"
          >
            <DeleteOutlined /> Delete {selected.size}
            {!isUnlocked && <LockOutlined className="ml-1 opacity-80" />}
          </button>
        </div>
      )}
    </div>
  );
}

function Tile({ item, selected, onToggle, onDelete, onView }) {
  const videoRef = useRef(null);
  const fullUrl  = `${BE_URL}${item.url}`;
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
      className={`group relative rounded-2xl overflow-hidden ring-1 transition-all ${
        selected
          ? "ring-rose-400 shadow-[0_0_40px_-8px_rgba(244,63,94,0.5)]"
          : "ring-white/10 hover:ring-white/30"
      }`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {/* Video / poster */}
      <div className="aspect-video bg-black relative">
        <video
          ref={videoRef}
          src={fullUrl}
          poster={posterUrl}
          preload="metadata"
          muted
          loop
          playsInline
          className="w-full h-full object-cover"
        />
        {/* Play glyph in resting state */}
        <div className="absolute inset-0 grid place-items-center pointer-events-none opacity-100 group-hover:opacity-0 transition-opacity bg-gradient-to-t from-black/50 via-black/10 to-transparent">
          <PlayCircleOutlined className="text-4xl text-white/70" />
        </div>

        {/* Vault badge */}
        {item.vault ? (
          <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fuchsia-500/20 ring-1 ring-fuchsia-400/40 text-fuchsia-200 text-[10px] font-mono uppercase tracking-[0.18em]">
            <LockOutlined className="text-[9px]" /> vault
          </div>
        ) : null}

        {/* Size badge (top-right of the media area, per user ask) */}
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white text-[10px] font-mono">
          {fmtBytes(item.bytes)}
        </div>

        {/* Selection checkbox (bottom-left, doesn't overlap badges) */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`absolute bottom-2 left-2 w-7 h-7 rounded-md grid place-items-center transition-all ${
            selected
              ? "bg-rose-500 ring-2 ring-rose-300"
              : "bg-black/50 ring-1 ring-white/20 hover:ring-white/60 opacity-0 group-hover:opacity-100"
          }`}
          aria-label={selected ? "Deselect" : "Select"}
        >
          {selected && <CheckOutlined className="text-white text-[12px]" />}
        </button>
      </div>

      {/* Footer */}
      <div className="px-3 py-2.5 bg-black/40 backdrop-blur-sm">
        <p className="text-sm font-semibold text-white truncate">{item.title}</p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500 truncate flex-1 min-w-0">
            {[item.aspectRatio, item.durationSec ? `${Math.round(item.durationSec)}s` : null, fmtDate(item.createdAt)]
              .filter(Boolean).join(" · ")}
          </p>
          <div className="shrink-0 flex items-center gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onView?.(); }}
              title="View"
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-300 hover:text-white hover:bg-white/10"
            >
              <EyeOutlined className="text-[12px]" />
            </button>
            <a
              href={fullUrl}
              download={`${item.title || item.id}.mp4`}
              onClick={(e) => e.stopPropagation()}
              title="Download"
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-300 hover:text-white hover:bg-white/10"
            >
              <DownloadOutlined className="text-[12px]" />
            </a>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete"
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-rose-300 hover:text-white hover:bg-rose-500/20"
            >
              <DeleteOutlined className="text-[12px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
