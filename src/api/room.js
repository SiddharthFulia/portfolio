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

// Multipart upload — fetch directly because the shared post() in
// request.js force-sets Content-Type: application/json.
export async function uploadAndAnalyze(file, { signal } = {}) {
  const fd = new FormData();
  fd.append('video', file);
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
