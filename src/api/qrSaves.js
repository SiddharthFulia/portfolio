// Client for the QR Compiler save/share endpoints. Wraps the shared
// fetch/request layer with the extra X-QR-Owner header the BE uses to
// identify the caller (browser fingerprint hash — see lib/qrOwnerKey.js).
//
// Endpoint constants deliberately live inside this module rather than
// endpoints.js because they are namespaced to one feature and the
// caller (QRCompiler + QRShare) never touches raw endpoint strings.

import { qrOwnerHeader } from '../lib/qrOwnerKey';

const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001';

async function unwrap(res) {
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok || (body && body.status === false)) {
    const msg = body?.message || `Request failed: ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body?.data ?? body;
}

// POST — create a new save.
export async function createQrSave(payload) {
  const headers = { 'Content-Type': 'application/json', ...(await qrOwnerHeader()) };
  const res = await fetch(`${BE_URL}/api/qr-saves`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return unwrap(res);
}

// GET — list caller's saves.
export async function listQrSaves({ limit = 30, offset = 0 } = {}) {
  const headers = { ...(await qrOwnerHeader()) };
  const url = new URL('/api/qr-saves', BE_URL);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  const res = await fetch(url.toString(), { method: 'GET', headers });
  return unwrap(res);
}

// GET — one save. Sends the header so private rows the caller owns
// resolve; harmless on public rows.
export async function getQrSave(id) {
  const headers = { ...(await qrOwnerHeader()) };
  const res = await fetch(`${BE_URL}/api/qr-saves/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers,
  });
  return unwrap(res);
}

// PATCH — toggle public, edit title.
export async function patchQrSave(id, patch) {
  const headers = { 'Content-Type': 'application/json', ...(await qrOwnerHeader()) };
  const res = await fetch(`${BE_URL}/api/qr-saves/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patch),
  });
  return unwrap(res);
}

// DELETE — owner only.
export async function deleteQrSave(id) {
  const headers = { ...(await qrOwnerHeader()) };
  const res = await fetch(`${BE_URL}/api/qr-saves/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  });
  return unwrap(res);
}
