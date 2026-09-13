// Client for the Deep Vision endpoint.
//
// POST /api/vision/deep-analyze  (multipart: `image` field)
// Returns a rich object with caption, tags, subjects, ocr, palette, faces,
// depth, and aesthetic hints. See VisionStudio for the exact shape it
// expects.
//
// We call `fetch` directly (not the shared request.js wrapper) because the
// upload is multipart FormData — the wrapper JSON-encodes bodies and would
// corrupt the request.
//
// Timeout: 60s. The BE typically responds in 3-8s; the ceiling covers cold
// model loads on the vision service.

const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001';

async function unwrap(res) {
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok || (body && body.status === false)) {
    const msg = body?.message || `Analysis failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = body?.data ?? null;
    throw err;
  }
  return body?.data ?? body;
}

/**
 * Run deep vision analysis on an image.
 *
 * Response envelope (unwrapped):
 *   {
 *     caption: string,
 *     tags: [{ label, score }],
 *     subjects: [{ label, score, box? }],
 *     ocr: { text, lines: [string], confidence? },
 *     palette: [{ hex, weight }],
 *     faces: { count, items: [{ age, gender, emotion, box? }] } | null,
 *     depth: { dataUrl } | null,
 *     aesthetic: { warmth, brightness, saturation } | null,
 *     warnings?: [string],
 *     elapsedMs?: number,
 *   }
 *
 * Throws with `err.status` set so callers can distinguish
 *   429 (rate limit) · 502 (upstream fail) · 503 (models warming up).
 */
export async function deepAnalyzeImage(file, { signal } = {}) {
  if (!file) throw new Error('Pick an image first');
  const fd = new FormData();
  fd.append('image', file);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('timeout'), 60_000);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', () => controller.abort(signal.reason));
  }

  try {
    const res = await fetch(`${BE_URL}/api/vision/deep-analyze`, {
      method: 'POST',
      body: fd,
      signal: controller.signal,
    });
    return await unwrap(res);
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Analysis timed out. Try a smaller image or try again.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract the subject silhouette from an image. Runs in parallel with the
 * deep-analyze pass — we use the returned mask to constrain QR modules to
 * the shape of the extracted subject (silhouette-mode rendering).
 *
 * Response envelope (unwrapped):
 *   {
 *     mask: { png_data_url, coverage, bbox, centroid },
 *     subject_thumbnail_url: string,   // data URL of subject on transparent bg
 *     backend: string,                 // e.g. 'opencv-otsu'
 *   }
 *
 * Throws with `err.status` set. Callers should treat failures as non-fatal —
 * the toggle simply stays disabled and the rest of the analysis continues.
 */
export async function extractSubject(file, { signal } = {}) {
  if (!file) throw new Error('Pick an image first');
  const fd = new FormData();
  fd.append('image', file);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('timeout'), 60_000);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', () => controller.abort(signal.reason));
  }

  try {
    const res = await fetch(`${BE_URL}/api/vision/extract-subject`, {
      method: 'POST',
      body: fd,
      signal: controller.signal,
    });
    return await unwrap(res);
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Subject extraction timed out.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}
