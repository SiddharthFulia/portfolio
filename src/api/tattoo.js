// Client for the Tattoo Studio endpoints.
//
// We use `fetch` directly instead of the shared request.js wrapper because
// the upload is a large multipart body — the shared wrapper JSON-encodes
// bodies, which would corrupt the FormData. Same shape as api/qrSaves.js.
//
// Timeout: 60s. Gemini Vision usually replies in 3-10s; 60s covers the
// worst case (retry pass on a slow model + network hop).

const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001';

async function unwrap(res) {
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok || (body && body.status === false)) {
    const msg = body?.message || `Analysis failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body?.data ?? body;
}

/**
 * Analyse a tattoo photo. `file` is a File / Blob (from `<Upload>`).
 *
 * Returns:
 *   {
 *     analysis: { subject, style, motifs, dominant_colors, line_weight,
 *                 complexity, energy, suggested_qr_payload,
 *                 suggested_qr_style, confidence },
 *     cached:  boolean,
 *     imageHash: string,
 *     modelId?: string,
 *     elapsedMs?: number,
 *   }
 *
 * Throws with `err.status` set to the BE status code so the caller can
 * distinguish 503 (Gemini not configured on this BE) from 502 (Gemini ran
 * but couldn't produce JSON) from 400 (bad upload).
 */
export async function analyzeTattoo(file, { signal } = {}) {
  if (!file) throw new Error('Pick an image first');
  const fd = new FormData();
  fd.append('image', file);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('timeout'), 60_000);
  // Chain the user's abort signal if they passed one.
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', () => controller.abort(signal.reason));
  }

  try {
    const res = await fetch(`${BE_URL}/api/tattoo/analyze`, {
      method: 'POST',
      body: fd,
      signal: controller.signal,
    });
    return await unwrap(res);
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Analysis timed out. Try a smaller image or check the BE.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Ping the BE to see if Gemini is configured / enabled. The Tattoo Studio
// tab uses this to show a "Gemini not configured" banner instead of only
// discovering the problem after the user waits through an upload.
export async function checkTattooHealth() {
  try {
    const res = await fetch(`${BE_URL}/api/tattoo/health`);
    if (!res.ok) return { ok: false, enabled: false, configured: false };
    const body = await res.json();
    return body?.data || { ok: false };
  } catch {
    return { ok: false, enabled: false, configured: false, unreachable: true };
  }
}
