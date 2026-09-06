// Browser fingerprint hash used as the "owner key" for QR saves. No
// accounts — the BE just treats the same fingerprint as the same owner.
//
// Inputs, all stable within one browser install:
//   • canvas fingerprint (draws a signature string + emoji, reads pixels)
//   • navigator.language
//   • Intl.DateTimeFormat().resolvedOptions().timeZone
//
// Cached in localStorage so we don't recompute it on every request. If
// the user clears storage we regenerate — same fingerprint bits, so the
// hash lands on the same value and they still "own" their old QRs.

const STORAGE_KEY = 'sid-qr-owner-key';

// Draw a fixed canvas + read pixels back. The exact rasterisation varies
// slightly across browser + GPU + OS combinations, giving us a signal
// that's stable within one browser install but different across devices.
function canvasFingerprint() {
  try {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 60;
    const ctx = c.getContext('2d');
    if (!ctx) return 'no-canvas';
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(120, 12, 100, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('sid-qr-fingerprint-4Q7f#', 2, 2);
    ctx.fillStyle = 'rgba(102,204,0,0.75)';
    ctx.fillText('sid-qr-fingerprint-4Q7f#', 4, 4);
    // Sample a small region — the full data URL is huge and unnecessary.
    return c.toDataURL().slice(-256);
  } catch { return 'fp-fail'; }
}

// SHA-256 via SubtleCrypto → hex. Falls back to a tiny FNV-1a mix if
// SubtleCrypto is unavailable (some older mobile browsers on http://).
async function sha256Hex(str) {
  try {
    if (globalThis.crypto?.subtle) {
      const buf = new TextEncoder().encode(str);
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const bytes = new Uint8Array(digest);
      let hex = '';
      for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
      return hex;
    }
  } catch {}
  // Deterministic fallback — 64-char pseudo-hex derived from FNV-1a.
  // Not cryptographic, but the BE only cares that it's stable.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 16; i++) {
    h = Math.imul(h ^ i, 2246822519) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
}

let _cached = null;
let _inflight = null;

// Compute (or return the cached) owner key. Sync-first cheap path when
// localStorage already has it; otherwise fingerprint + hash + persist.
export function getOwnerKey() {
  if (_cached) return Promise.resolve(_cached);
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && /^[a-f0-9]{16,128}$/i.test(stored)) {
        _cached = stored;
        return stored;
      }
    } catch {}

    const parts = [
      canvasFingerprint(),
      navigator.language || '',
      navigator.languages ? navigator.languages.join(',') : '',
      (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })(),
      // Screen bucket — round so a resize doesn't fork the identity.
      `${Math.floor((window.screen?.width || 0) / 10) * 10}x${Math.floor((window.screen?.height || 0) / 10) * 10}`,
      String(navigator.hardwareConcurrency || 0),
    ].join('|');

    const hex = await sha256Hex(parts);
    _cached = hex;
    try { localStorage.setItem(STORAGE_KEY, hex); } catch {}
    return hex;
  })();

  return _inflight;
}

// Fetch header object convenient for `fetch(..., { headers: await qrOwnerHeader() })`.
export async function qrOwnerHeader() {
  const key = await getOwnerKey();
  return { 'X-QR-Owner': key };
}
