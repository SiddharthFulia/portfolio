// /realism/job/:jobId — Detail page for a single realism render.
// Polls /api/ai-video/status/:id every 3 s, shows the full live log
// stream + the finished video. Refresh-safe via the same localStorage
// history table the main /realism page uses.

import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AppstoreOutlined,
  DownloadOutlined,
  ReloadOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  CopyOutlined,
} from "@ant-design/icons";
import { message } from "antd";

const BE_URL = import.meta.env.VITE_BE_URL || "http://localhost:4001";
const HISTORY_KEY = "sid-realism-jobs";

function vaultHeaders() {
  try {
    const t = localStorage.getItem("sid-vault-token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

function readEntry(jobId) {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return list.find((p) => p.jobId === jobId) || null;
  } catch { return null; }
}

export default function RealismJob() {
  const { jobId } = useParams();
  const navigate  = useNavigate();
  const [row, setRow]   = useState(null);
  const [logs, setLogs] = useState([]);
  const [err, setErr]   = useState(null);
  const entry           = readEntry(jobId);
  const pollRef         = useRef(null);

  const fetchOnce = async () => {
    try {
      const res = await fetch(`${BE_URL}/api/ai-video/status/${jobId}`, { headers: vaultHeaders() });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
      const r = body?.data || body;
      setRow(r);
      if (Array.isArray(r?.logs)) setLogs(r.logs);
      setErr(null);
      return r;
    } catch (e) { setErr(e.message); return null; }
  };

  useEffect(() => {
    if (!jobId) return undefined;
    fetchOnce();
    pollRef.current = setInterval(async () => {
      const r = await fetchOnce();
      if (r && (r.status === "completed" || r.status === "failed")) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const videoUrl = row?.videoUrl || row?.video || null;
  const status   = row?.status   || "queued";
  const isDone   = status === "completed" && !!videoUrl;
  const isFailed = status === "failed";

  return (
    <div className="relative min-h-screen w-full bg-[#05050a] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 sm:px-6 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] rounded-full bg-rose-500/10 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-rose-300/80">
              — Realism job
            </p>
            <h1 className="mt-2 font-poppins font-black text-2xl sm:text-3xl truncate max-w-2xl" title={entry?.title || jobId}>
              {entry?.title || "Untitled render"}
            </h1>
            <p className="mt-1 text-[11px] text-gray-500 font-mono break-all">
              {jobId}
              <button
                onClick={() => { navigator.clipboard.writeText(jobId).then(() => message.success("Copied")); }}
                className="ml-2 text-gray-400 hover:text-white"
              >
                <CopyOutlined />
              </button>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => navigate("/realism/library")}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs font-semibold"
            >
              <AppstoreOutlined /> Library
            </button>
            <button
              onClick={() => navigate("/realism")}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold"
            >
              New render
            </button>
          </div>
        </header>

        {/* Status banner */}
        <div className={`mb-5 rounded-2xl px-5 py-4 ring-1 ${
          isDone   ? "ring-emerald-400/40 bg-emerald-500/10" :
          isFailed ? "ring-rose-400/40    bg-rose-500/10"    :
                     "ring-amber-400/40   bg-amber-500/10"
        }`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-2xl">
              {isDone ? <CheckCircleFilled className="text-emerald-300" /> :
               isFailed ? <CloseCircleFilled className="text-rose-300" /> :
               <LoadingOutlined spin className="text-amber-300" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">
                {isDone ? "Render complete" : isFailed ? "Render failed" : `Worker · ${status}`}
              </p>
              <p className="text-[11px] text-gray-300 truncate">
                {row?.progressMessage || row?.message || (isDone ? "Video ready below." : "Polling every 3s…")}
              </p>
            </div>
            {entry && (
              <div className="text-[10px] text-gray-400 font-mono shrink-0 text-right">
                {entry.model && <p>model · {entry.model}</p>}
                {entry.resolution && <p>{entry.resolution} · {entry.steps} steps</p>}
                {entry.createdAt && <p>{new Date(entry.createdAt).toLocaleString()}</p>}
              </div>
            )}
          </div>
          {err && <p className="mt-2 text-[11px] text-rose-300">{err}</p>}
        </div>

        {/* Video result */}
        {isDone && videoUrl && (
          <div className="mb-5 rounded-2xl overflow-hidden ring-1 ring-white/10 bg-black">
            <video src={videoUrl} controls autoPlay loop className="w-full aspect-video bg-black" />
            <div className="px-4 py-3 flex items-center gap-3 text-xs">
              <a
                href={videoUrl}
                download
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-semibold"
              >
                <DownloadOutlined /> Download MP4
              </a>
              <a
                href={videoUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/[0.06] text-white"
              >
                Open original
              </a>
            </div>
          </div>
        )}

        {/* Live logs */}
        <div className="rounded-2xl ring-1 ring-white/10 bg-black/40 backdrop-blur p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-1.5 h-1.5 rounded-full ${isDone ? "bg-emerald-400" : isFailed ? "bg-rose-400" : "bg-rose-400 animate-pulse"}`} />
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-gray-400">Live · worker · {logs.length} lines</p>
            <button
              onClick={fetchOnce}
              className="ml-auto text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500 hover:text-gray-200"
            >
              <ReloadOutlined /> refresh
            </button>
          </div>
          {logs.length === 0 ? (
            <p className="text-[11px] text-gray-500 font-mono">waiting for first log line…</p>
          ) : (
            <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1 text-[11px] font-mono leading-snug">
              {logs.map((line, i) => {
                const msg = typeof line === "string" ? line : (line?.msg ?? line?.message ?? String(line));
                const ts  = typeof line === "object" && line?.ts ? new Date(line.ts) : null;
                const isErr = /error|failed|exception/i.test(msg);
                return (
                  <div key={i} className={`flex gap-2 ${isErr ? "text-rose-300" : "text-gray-300"}`}>
                    {ts && (
                      <span className="text-gray-600 shrink-0">
                        {ts.toLocaleTimeString([], { hour12: false }).slice(3)}
                      </span>
                    )}
                    <span className="break-all">{msg}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
