// Room Designer V2 API client.
//   uploadAndAnalyze(file)            → { jobId, analysis, ... }
//   startRender(jobId, pickedItems)   → { jobId, status: 'rendering' }
//   getRoomStatus(jobId)              → { status, analysis, mp4Url, ... }
//
// The analyze call is synchronous on the BE (~10-15s), the render
// call returns immediately and is polled via getRoomStatus until
// status='completed' + mp4Url is set.

import { get } from './request';

const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001';

function vaultHeaders() {
  try {
    const t = localStorage.getItem('sid-vault-token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

// Generate a stable jobId on the client. The FE sends it with the
// upload so the BE writes it on the row immediately — that way the
// FE can persist the breadcrumb BEFORE the analyze response lands.
// If the tab closes mid-analyze, the BE still finishes (the request
// handler runs to completion regardless of who's listening), and a
// subsequent visit picks the same jobId up from URL / localStorage
// and re-fetches state via /status/:jobId.
export function newRoomJobId() {
  const rnd = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 12);
  return `room_${Date.now()}_${rnd}`;
}

// Multipart upload — fetch directly because the shared post() in
// request.js force-sets Content-Type: application/json.
export async function uploadAndAnalyze(file, { signal, jobId } = {}) {
  const fd = new FormData();
  fd.append('video', file);
  if (jobId) fd.append('jobId', jobId);
  const res = await fetch(`${BE_URL}/api/room/analyze`, {
    method: 'POST',
    body: fd,
    headers: { ...vaultHeaders() },
    signal,
  });
  if (!res.ok) {
    let msg = `Analyze failed: ${res.status}`;
    try { const j = await res.json(); if (j?.message) msg = j.message; } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  return body?.data || body;
}

export async function startRender(jobId, pickedItems) {
  const res = await fetch(`${BE_URL}/api/room/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...vaultHeaders() },
    body: JSON.stringify({ jobId, pickedItems }),
  });
  if (!res.ok) {
    let msg = `Render dispatch failed: ${res.status}`;
    try { const j = await res.json(); if (j?.message) msg = j.message; } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  return body?.data || body;
}

export async function getRoomStatus(jobId) {
  const body = await get(`/api/room/status/${jobId}`);
  return body?.data || body;
}
