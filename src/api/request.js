import { requireVaultUnlock } from '../contexts/VaultContext';

const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001';

// Pull the vault JWT from localStorage on every request. Cheap (no parse),
// always returns the latest value (no stale state if user logged in/out
// mid-session). BE only enforces it on protected routes — sending it on
// open routes is harmless.
function vaultHeaders() {
  try {
    const t = localStorage.getItem('sid-vault-token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

// Detect "the BE said no, you need vault auth" — either a 401 status
// or the explicit code we use in some controllers. We treat both the
// same: silently pop the vault modal, await login, retry the request
// once. If the user cancels we bubble the original 401 to the caller.
function isVaultMissing(res, body) {
  if (res.status === 401) return true;
  if (body?.code === 'VAULT_REQUIRED') return true;
  return false;
}

// Run a fetch, and if it comes back asking for vault, pause until the
// user unlocks then retry exactly once. `runRequest` is a thunk that
// makes the fetch call fresh each time so the Authorization header is
// re-read after login. Anything other than a vault-miss bubbles up.
async function withVaultRetry(runRequest) {
  const res = await runRequest();
  if (res.ok) return res;

  // Only peek at the body if it might be a vault gate — we don't want
  // to consume the body on every successful request.
  let body = null;
  if (res.status === 401 || res.status === 403) {
    try { body = await res.clone().json(); } catch {}
  }
  if (!isVaultMissing(res, body)) return res;

  const unlocked = await requireVaultUnlock();
  if (!unlocked) return res;       // user cancelled — return original 401
  return runRequest();              // retry with the freshly-stored token
}

export async function get(endpoint, params = {}, options = {}) {
  const url = new URL(endpoint, BE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const runRequest = () => fetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...vaultHeaders(), ...options.headers },
    signal: options.signal || (options.timeout ? AbortSignal.timeout(options.timeout) : undefined),
  });

  const res = await withVaultRetry(runRequest);

  if (!res.ok) {
    // Try to read the error message from JSON body
    let msg = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
    } catch {}

    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error('Service returned HTML instead of data — may be temporarily down.');
  }

  return res.json();
}

export async function post(endpoint, body = {}, options = {}) {
  const runRequest = () => fetch(`${BE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...vaultHeaders(), ...options.headers },
    body: JSON.stringify(body),
    signal: options.signal || (options.timeout ? AbortSignal.timeout(options.timeout) : undefined),
  });

  const res = await withVaultRetry(runRequest);

  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const b = await res.json();
      if (b?.message) msg = b.message;
    } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function del(endpoint, options = {}) {
  const runRequest = () => fetch(`${BE_URL}${endpoint}`, {
    method: 'DELETE',
    headers: { ...vaultHeaders(), ...options.headers },
    signal: options.signal || (options.timeout ? AbortSignal.timeout(options.timeout) : undefined),
  });

  const res = await withVaultRetry(runRequest);
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try { const b = await res.json(); if (b?.message) msg = b.message; } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function patch(endpoint, body = {}, options = {}) {
  const runRequest = () => fetch(`${BE_URL}${endpoint}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...vaultHeaders(), ...options.headers },
    body: JSON.stringify(body),
    signal: options.signal || (options.timeout ? AbortSignal.timeout(options.timeout) : undefined),
  });

  const res = await withVaultRetry(runRequest);
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try { const b = await res.json(); if (b?.message) msg = b.message; } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
