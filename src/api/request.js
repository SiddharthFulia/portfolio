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

export async function get(endpoint, params = {}, options = {}) {
  const url = new URL(endpoint, BE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...vaultHeaders(), ...options.headers },
    signal: options.signal || (options.timeout ? AbortSignal.timeout(options.timeout) : undefined),
  });

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
  const res = await fetch(`${BE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...vaultHeaders(), ...options.headers },
    body: JSON.stringify(body),
    signal: options.signal || (options.timeout ? AbortSignal.timeout(options.timeout) : undefined),
  });

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
  const res = await fetch(`${BE_URL}${endpoint}`, {
    method: 'DELETE',
    headers: { ...vaultHeaders(), ...options.headers },
    signal: options.signal || (options.timeout ? AbortSignal.timeout(options.timeout) : undefined),
  });
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
  const res = await fetch(`${BE_URL}${endpoint}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...vaultHeaders(), ...options.headers },
    body: JSON.stringify(body),
    signal: options.signal || (options.timeout ? AbortSignal.timeout(options.timeout) : undefined),
  });
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try { const b = await res.json(); if (b?.message) msg = b.message; } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
