import { get, post, del, patch } from './request';
import { ENDPOINTS } from './endpoints';

export async function checkHealth() {
  try {
    const data = await get(ENDPOINTS.HEALTH, {}, { timeout: 3000 });
    return { online: data?.status || data?.data?.uptime > 0 };
  } catch {
    return { online: false };
  }
}

export async function sendChat(message, options = {}) {
  try {
    const data = await post(ENDPOINTS.CHAT, {
      message,
      history: options.history || [],
      model: options.model || 'llama3.2:1b',
      context: options.context || 'general',
    });
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function sendGroq(message, options = {}) {
  try {
    const data = await post(ENDPOINTS.GROQ, {
      message,
      history: options.history || [],
      model: options.model || 'llama-3.3-70b',
      system: options.system,
      maxTokens: options.maxTokens || 500,
      temperature: options.temperature || 0.7,
    });
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// BE routes this through Groq when Gemini is disabled (GEMINI_ENABLED=0 on BE).
export async function sendGemini(message, options = {}) {
  try {
    const data = await post(ENDPOINTS.GEMINI, {
      message,
      history: options.history || [],
      model: options.model || 'gemini-flash',
      system: options.system,
      maxTokens: options.maxTokens || 500,
      temperature: options.temperature || 0.7,
    });
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// Gemini image-out (vision-to-text) — no Groq equivalent. When BE has
// Gemini disabled this returns 503; callers should show "feature offline".
export async function geminiVision(image, prompt, options = {}) {
  try {
    const data = await post(ENDPOINTS.GEMINI_VISION, { image, prompt, model: options.model || 'gemini-flash' });
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function generateImage(prompt, options = {}) {
  try {
    const data = await post(
      ENDPOINTS.GENERATE_IMAGE,
      { prompt, model: options.model, provider: options.provider || 'cloudflare' },
      { timeout: 60000 }
    );
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function editImage(image, prompt, options = {}) {
  try {
    const data = await post(
      ENDPOINTS.IMAGE_EDIT,
      { image, prompt, strength: options.strength, steps: options.steps },
      { timeout: 60000 }
    );
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function generateVideo(prompt, options = {}) {
  try {
    const provider = options.provider || 'zsky';
    // ZSky is sync (~60-90s); worker is async (returns instantly).
    const timeout = provider === 'zsky' ? 5 * 60 * 1000 : 30000;
    const data = await post(
      ENDPOINTS.AI_VIDEO_GENERATE,
      {
        prompt,
        provider,
        model: options.model,
        duration: options.duration || 5,
        resolution: options.resolution || '720p',
        aspectRatio: options.aspectRatio || '9:16',
        steps: options.steps || 30,
        style: options.style || 'cinematic',
        audio: options.audio !== false,
        imageUrl: options.imageUrl || '',
        generateCaption: options.generateCaption !== false,
        mode: options.mode,
        withMusic: !!options.withMusic,
        musicPrompt: options.musicPrompt || '',
        // When the source image came from a Vault library item, the
        // generated video should also land in Vault — BE honours this
        // flag if a valid Vault token is on the request.
        vault: !!options.vault,
        // Opt-out for the BE's Telegram wake-up alert. Cinema's
        // multi-shot chain sets this so N shots don't trigger N
        // notifications when the worker happens to be offline.
        silentWake: !!options.silentWake,
      },
      { timeout }
    );
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// Reads a File (or Blob) into a base64 data URL the BE can pass to Cloudinary.
// Supports any image type the browser can read (JPG, PNG, WEBP, GIF, BMP, HEIC if browser supports).
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function uploadSourceImage(file) {
  try {
    const dataUrl = await fileToDataUrl(file);
    const data = await post(ENDPOINTS.AI_VIDEO_UPLOAD_IMAGE, { dataUrl }, { timeout: 60000 });
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// Unified jobs feed — queued + processing + completed + failed in one call.
// Powers the Jobs tab. Paginated, served straight from SQLite.
export async function listJobs({ status = 'all', page = 1, limit = 24 } = {}) {
  try {
    const data = await get(ENDPOINTS.AI_VIDEO_JOBS, { status, page, limit }, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// Image Enhancer — async. Submits the job; returns { imageId, status }.
// FE polls getImageStatus until status == 'completed' | 'failed'.
// Forwards the FULL body so workflow / model / steps / denoise / cfg /
// width / height all reach the BE (previous destructure dropped them).
export async function enhanceImage(payload = {}) {
  try {
    // Strip undefined keys so the BE doesn't get JSON nulls in fields it
    // would otherwise default. Keep falsy-but-meaningful values (0, '').
    const body = Object.fromEntries(
      Object.entries(payload).filter(([_, v]) => v !== undefined && v !== null)
    );
    // Sensible defaults if caller didn't provide them
    body.type   = body.type   || 'fast';
    body.engine = body.engine || 'cloud';
    const data = await post(ENDPOINTS.IMAGE_ENHANCE, body, { timeout: 60000 });
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function getImageStatus(imageId) {
  try {
    const data = await get(`${ENDPOINTS.IMAGE_ENHANCE_STATUS}/${imageId}`, {}, { timeout: 6000 });
    return { data: data?.data || null, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// Bulk operations on enhanced images. Action ∈ 'move-to-vault' | 'make-public' | 'delete'.
// move-to-vault / make-public require a valid Vault token (Authorization header).
export async function imageBulkAction(action, ids) {
  try {
    const data = await post(
      ENDPOINTS.IMAGE_ENHANCE_BULK,
      { action, ids },
      { timeout: 15000 }
    );
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// Same shape for AI videos. Spans inflight jobs + completed videos.
export async function videoBulkAction(action, ids) {
  try {
    const data = await post(
      ENDPOINTS.AI_VIDEO_BULK,
      { action, ids },
      { timeout: 15000 }
    );
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function deleteEnhancedImage(imageId) {
  try {
    const data = await del(`${ENDPOINTS.IMAGE_ENHANCE}/${imageId}`, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function listEnhancedImages({ status = 'completed', type, engine, visibility = 'public', page = 1, limit = 24 } = {}) {
  try {
    const q = { status, page, limit, visibility };
    if (type) q.type = type;
    if (engine) q.engine = engine;
    const data = await get(ENDPOINTS.IMAGE_ENHANCE_LIST, q, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function getJobStatus(jobId) {
  try {
    const data = await get(`${ENDPOINTS.AI_VIDEO_STATUS}/${jobId}`, {}, { timeout: 6000 });
    return { data: data?.data || null, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function deleteVideo(videoId) {
  try {
    const url = `${import.meta.env.VITE_BE_URL || 'http://localhost:4001'}/api/ai-video/${encodeURIComponent(videoId)}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
      let msg = `Delete failed: ${res.status}`;
      try { const b = await res.json(); if (b?.message) msg = b.message; } catch {}
      throw new Error(msg);
    }
    const data = await res.json();
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function getVideoProviders() {
  try {
    const data = await get(ENDPOINTS.AI_VIDEO_PROVIDERS, {}, { timeout: 6000 });
    return { data: data?.data || null, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function getTodayVideo() {
  try {
    const data = await get(ENDPOINTS.AI_VIDEO_TODAY, {}, { timeout: 6000 });
    return { data: data?.data || null, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function listVideos(opts = {}) {
  try {
    const params = {
      page: opts.page || 1,
      limit: opts.limit || 12,
    };
    if (opts.provider) params.provider = opts.provider;
    const data = await get(ENDPOINTS.AI_VIDEO_LIST, params, { timeout: 6000 });
    const payload = data?.data || {};
    return {
      data: {
        items: Array.isArray(payload.items) ? payload.items : [],
        total: payload.total || 0,
        page: payload.page || 1,
        limit: payload.limit || params.limit,
        pages: payload.pages || 1,
        hasMore: !!payload.hasMore,
      },
      error: null,
    };
  } catch (err) {
    return { data: { items: [], total: 0, page: 1, limit: 12, pages: 1, hasMore: false }, error: err.message };
  }
}

export async function textToSpeech(text, options = {}) {
  try {
    const data = await post(ENDPOINTS.TTS, { text, voice: options.voice, lang: options.lang }, { timeout: 30000 });
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function summarizeText(text, options = {}) {
  try {
    const data = await post(ENDPOINTS.SUMMARIZE, { text, model: options.model });
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// ─── Lip Sync ─────────────────────────────────────────────────
export async function submitLipsync(payload = {}) {
  try {
    const data = await post(ENDPOINTS.LIPSYNC, payload, { timeout: 60000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function getLipsyncStatus(jobId) {
  try {
    const data = await get(`${ENDPOINTS.LIPSYNC_STATUS}/${jobId}`, {}, { timeout: 6000 });
    return { data: data?.data || null, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function listLipsyncJobs({ status = 'completed', visibility = 'public', page = 1, limit = 24 } = {}) {
  try {
    const data = await get(ENDPOINTS.LIPSYNC_LIST, { status, visibility, page, limit }, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function deleteLipsync(jobId) {
  try {
    const data = await del(`${ENDPOINTS.LIPSYNC}/${jobId}`, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function lipsyncBulkAction(action, ids) {
  try {
    const data = await post(ENDPOINTS.LIPSYNC_BULK, { action, ids }, { timeout: 15000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// ─── Audio Studio ─────────────────────────────────────────────
export async function submitAudio(payload = {}) {
  try {
    const data = await post(ENDPOINTS.AUDIO, payload, { timeout: 60000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// Speech-to-Text — synchronous, returns transcript directly. Whisper via HF
// Inference. dataUrl: 'data:audio/...;base64,…', language: optional ISO-639-1.
export async function transcribeAudio({ dataUrl, language = '' } = {}) {
  try {
    const data = await post(ENDPOINTS.STT, { dataUrl, language }, { timeout: 120000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function getAudioStatus(jobId) {
  try {
    const data = await get(`${ENDPOINTS.AUDIO_STATUS}/${jobId}`, {}, { timeout: 6000 });
    return { data: data?.data || null, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function listAudioJobs({ status = 'completed', kind, visibility = 'public', page = 1, limit = 24 } = {}) {
  try {
    const q = { status, visibility, page, limit };
    if (kind) q.kind = kind;
    const data = await get(ENDPOINTS.AUDIO_LIST, q, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function deleteAudio(jobId) {
  try {
    const data = await del(`${ENDPOINTS.AUDIO}/${jobId}`, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function audioBulkAction(action, ids) {
  try {
    const data = await post(ENDPOINTS.AUDIO_BULK, { action, ids }, { timeout: 15000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// ─── Cinema ─────────────────────────────────────────────────
export async function submitCinema(payload = {}) {
  try {
    const data = await post(ENDPOINTS.CINEMA, payload, { timeout: 60000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function getCinemaStatus(projectId) {
  try {
    const data = await get(`${ENDPOINTS.CINEMA_STATUS}/${projectId}`, {}, { timeout: 6000 });
    return { data: data?.data || null, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function listCinemaProjects({ status = 'completed', visibility = 'public', page = 1, limit = 24 } = {}) {
  try {
    const data = await get(ENDPOINTS.CINEMA_LIST, { status, visibility, page, limit }, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function deleteCinema(projectId) {
  try {
    const data = await del(`${ENDPOINTS.CINEMA}/${projectId}`, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
// PATCH /api/cinema/:projectId — body accepts shotPrompts[] (editable
// after planning), shotJobIds[], status, outputUrl, errorMsg.
export async function patchCinemaProject(projectId, body) {
  try {
    const data = await patch(`${ENDPOINTS.CINEMA}/${projectId}`, body, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
// POST /api/cinema/:projectId/shots/:shotIndex/review
//   { currentPrompt?: string, engine?: 'groq' | 'gemini' }
// → { assessment, feedback, suggested, engine }
export async function reviewCinemaShot(projectId, shotIndex, body = {}) {
  try {
    const data = await post(`${ENDPOINTS.CINEMA}/${projectId}/shots/${shotIndex}/review`, body, { timeout: 20000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
// Cinema-specific disk usage. Returns { total: { count, bytes }, perRender: [...] }
// — perRender carries { renderId, projectId, combineId, fileSize, title, createdAt }
// so the FE library can highlight which rows contribute to the total.
export async function getCinemaDiskStats() {
  try {
    const data = await get(`${ENDPOINTS.CINEMA}/disk-stats`, {}, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
// Cinema renders — per-attempt resumable state. The FE orchestrator
// creates one of these, navigates to /cinema/render/:renderId, then
// PATCHes after each shot transition so the row stays in sync with
// where the client-side chain is. Refresh resumes from the DB state.
export async function createCinemaRender(projectId, body = {}) {
  try {
    // body: { provider?: 'optimized' | 'local' | 'zsky',
    //         optimizedMode?: 'preview' | 'balanced' | 'quality',
    //         beastModel?: 'wan-2.2'|'wan-2.1'|'wan-2.1-i2v'|'hunyuan'|'ltx-video'|'mochi'|'svd' }
    const data = await post(`${ENDPOINTS.CINEMA_RENDER_CREATE}/${projectId}/render`, body, { timeout: 10000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function getCinemaRender(renderId) {
  try {
    const data = await get(`${ENDPOINTS.CINEMA_RENDER}/${renderId}`, {}, { timeout: 6000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function patchCinemaRender(renderId, body) {
  try {
    const data = await patch(`${ENDPOINTS.CINEMA_RENDER}/${renderId}`, body, { timeout: 6000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function listCinemaRenders({ projectId, status, page = 1, pageSize = 24 } = {}) {
  try {
    const params = { page, pageSize };
    if (projectId) params.projectId = projectId;
    if (status && status !== 'all') params.status = status;
    const data = await get(ENDPOINTS.CINEMA_RENDERS, params, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function deleteCinemaRender(renderId) {
  try {
    const data = await del(`${ENDPOINTS.CINEMA_RENDER}/${renderId}`, { timeout: 6000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
// Cancel + purge an in-flight Cinema render. Marks the render row as
// cancelled, drops queued shot jobs from the inflight table, marks
// processing shots as cancelled (the GPU finishes the current one
// but the chain won't advance). Returns { renderId, cancelledShotJobs }.
export async function cancelCinemaRender(renderId) {
  try {
    const data = await post(
      `${ENDPOINTS.CINEMA_RENDER}/${renderId}/cancel`,
      {},
      { timeout: 10000 }
    );
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// Cinematic Continuity Director — rewrite a single shot's action as a
// safe continuation. Returns { saferAction, reason, riskBefore, riskAfter }.
export async function cinemaFixAction(projectId, shotIndex, body = {}) {
  try {
    const data = await post(
      `${ENDPOINTS.CINEMA_FIX_ACTION}/${projectId}/shots/${shotIndex}/fix-action`,
      body,
      { timeout: 20000 }
    );
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// Unified-by-render log stream. Returns every log line across every
// shot + the combine step in one ordered timeline, each annotated with
// jobId + lane + shotIndex (or -1 for combine).
export async function getCinemaRenderLogs(renderId, sinceTs = 0, limit = 500) {
  try {
    const data = await get(`${ENDPOINTS.CINEMA_RENDER}/${renderId}/logs`, { since: sinceTs, limit }, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function cinemaBulkAction(action, ids) {
  try {
    const data = await post(ENDPOINTS.CINEMA_BULK, { action, ids }, { timeout: 15000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// ─── 3D Mesh generation (Shap-E / Point-E on 5090) ────────────────
// Async queue. Submit returns { jobId, status, prompt, model }; FE polls
// getMeshStatus until status == 'completed' | 'failed'.
export async function submitMeshJob(payload = {}) {
  try {
    const data = await post(ENDPOINTS.MESH_GENERATE, payload, { timeout: 30000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function getMeshStatus(jobId) {
  try {
    const data = await get(`${ENDPOINTS.MESH_STATUS}/${jobId}`, {}, { timeout: 6000 });
    return { data: data?.data || null, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
// Paginated. Server clamps pageSize to [1, 1000]; default 24.
//   status   — 'all' | 'queued' | 'processing' | 'completed' | 'failed'
//   page     — 1-based
//   pageSize — rows per page
export async function listMeshJobs({ status = 'all', page = 1, pageSize = 24 } = {}) {
  try {
    const params = { page, pageSize };
    if (status && status !== 'all') params.status = status;
    const data = await get(ENDPOINTS.MESH_LIST, params, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function deleteMeshJob(jobId) {
  try {
    const data = await del(`${ENDPOINTS.MESH_GENERATE.replace('/generate', '')}/${jobId}`, { timeout: 6000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// ─── Deepfake lane (Vault-gated) ──────────────────────────────────
// All three endpoints require a valid Vault JWT in Authorization. request.js
// auto-attaches `sid-vault-token` if present; if missing/expired the BE
// returns 401 with code: 'VAULT_REQUIRED' which the FE listens for.
export async function submitDeepfakeJob(payload = {}) {
  try {
    const data = await post(ENDPOINTS.DEEPFAKE_GENERATE, payload, { timeout: 60000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message, status: err.status }; }
}
export async function getDeepfakeStatus(jobId) {
  try {
    const data = await get(`${ENDPOINTS.DEEPFAKE_STATUS}/${jobId}`, {}, { timeout: 6000 });
    return { data: data?.data || null, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function listDeepfakeJobs({ status, kind, limit = 24 } = {}) {
  try {
    const data = await get(ENDPOINTS.DEEPFAKE_LIST, { status, kind, limit }, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// ─── Runner game (hand-gesture endless runner) ────────────────────
export async function listGamePlayers({ limit = 200 } = {}) {
  try {
    const data = await get(ENDPOINTS.GAMES_PLAYERS, { limit }, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function createGamePlayer(name) {
  try {
    const data = await post(ENDPOINTS.GAMES_PLAYERS, { name }, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function submitGameScore({ playerName, score, distance, difficulty, revived = false } = {}) {
  try {
    const data = await post(ENDPOINTS.GAMES_SCORES,
      { playerName, score, distance, difficulty, revived },
      { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function getGameLeaderboard({ difficulty, limit = 50 } = {}) {
  try {
    const data = await get(ENDPOINTS.GAMES_SCORES, { difficulty, limit }, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// ─── Chess (Stockfish via BE) ─────────────────────────────────────
export async function chessBestMove({ fen, depth = 14, thinkMs = 800 } = {}) {
  try {
    const data = await post(ENDPOINTS.CHESS_BEST_MOVE, { fen, depth, thinkMs }, { timeout: 15000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function chessAnalyze({ fen, multiPv = 3, depth = 12, thinkMs = 800 } = {}) {
  try {
    const data = await post(ENDPOINTS.CHESS_ANALYZE, { fen, multiPv, depth, thinkMs }, { timeout: 15000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function chessPlay({ fen, elo = 1500, thinkMs = 400 } = {}) {
  try {
    const data = await post(ENDPOINTS.CHESS_PLAY, { fen, elo, thinkMs }, { timeout: 10000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function chessEngineStatus() {
  try {
    const data = await get(ENDPOINTS.CHESS_STATUS, {}, { timeout: 4000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
// ─── Saved games library ──
export async function chessSaveGame(payload) {
  try {
    const data = await post(ENDPOINTS.CHESS_GAMES, payload, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function chessListGames({ limit = 50, result } = {}) {
  try {
    const data = await get(ENDPOINTS.CHESS_GAMES, { limit, result }, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function chessLoadGame(id) {
  try {
    const data = await get(`${ENDPOINTS.CHESS_GAMES}/${id}`, {}, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function chessUpdateGame(id, body) {
  try {
    const data = await patch(`${ENDPOINTS.CHESS_GAMES}/${id}`, body, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function chessDeleteGame(id) {
  try {
    const data = await del(`${ENDPOINTS.CHESS_GAMES}/${id}`, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function chessBulkSaveGames(games, collection) { try { const data = await post(`${ENDPOINTS.CHESS_GAMES}/bulk`, { games, collection }, { timeout: 30000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function chessListCollections() { try { const data = await get(ENDPOINTS.CHESS_COLLECTIONS, {}, { timeout: 6000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }

// ─── Opening database (paginated, lazy detail) ─────────────────────
// List is cheap (eco + name + slug, ~50 per page). Detail returns full
// record including FEN — the FE then pipes that FEN to Lichess's free
// Opening Explorer for the "master games" panel.
export async function chessListOpenings({ page = 1, limit = 50, q = '' } = {}) {
  try {
    const data = await get(ENDPOINTS.CHESS_OPENINGS, { page, limit, q }, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function chessGetOpening(slug) {
  try {
    const data = await get(`${ENDPOINTS.CHESS_OPENINGS}/${encodeURIComponent(slug)}`, {}, { timeout: 6000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
// Live opening identifier — fires after each ply on /chess to update
// the collapsible opening heading above the move list. POST body keeps
// the SAN array off the URL (URLs cap around 2k chars; deep games would
// hit that). BE responds { eco, name, slug, matchedPly } or null-tuple
// when the move list has wandered out of book.
export async function chessIdentifyOpening(moves) {
  try {
    const data = await post(
      ENDPOINTS.CHESS_OPENINGS_IDENTIFY,
      { moves: Array.isArray(moves) ? moves : [] },
      { timeout: 5000 },
    );
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
// Variant engine — single endpoint for Chess960 / King of the Hill /
// Three-Check. BE flips Stockfish's UCI_Chess960 for 960; for KoTH and
// 3-Check the rules are FE-side (chess.js + a custom win check), so the
// BE just runs standard Stockfish on the FEN it's given.
//   payload: { variant: 'chess960'|'koth'|'threeCheck', fen, moveHistory?, options? }
//   options.elo (default 1500), options.thinkMs (default 500), options.depth
export async function chessVariantPlay(payload = {}) {
  try {
    const data = await post(ENDPOINTS.CHESS_VARIANT_PLAY, payload, { timeout: 12000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// Lichess Opening Explorer — CC-BY masters DB. Proxied via the BE so we
// (a) send a polite UA the upstream is happy to serve and (b) get 10-min
// in-memory caching by FEN. Browser-direct calls were 401'ing globally.
// `moves` = limit of top continuations to return.
// Returns { data, error, status } — status is bubbled so the UI can show
// a rate-limit hint specifically on 429.
export async function lichessMasters(fen, { moves = 5 } = {}) {
  try {
    const data = await get(ENDPOINTS.CHESS_OPENINGS_EXPLORER, { fen, moves }, { timeout: 12000 });
    return { data: data?.data || data, error: null, status: 200 };
  } catch (err) {
    return { data: null, error: err.message, status: err.status || 0 };
  }
}

// ─── Chess Puzzles (lichess-imported) ─────────────────────────────
// Per-user rating + difficulty-tuned random fetch + retry-with-penalty UX.
// Library is bulk-imported via `node scripts/import-lichess-puzzles.mjs` on
// the BE — no per-request hits to lichess.org from the browser.
export async function chessPuzzleListUsers() {
  try {
    const data = await get(ENDPOINTS.CHESS_PUZZLES_USERS, {}, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function chessPuzzleCreateUser(name) {
  try {
    const data = await post(ENDPOINTS.CHESS_PUZZLES_USERS, { name }, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message, status: err.status }; }
}
// Vault-gated on the BE. request.js's withVaultRetry pops the login modal
// automatically when no token is in localStorage, then retries the DELETE once.
export async function chessPuzzleDeleteUser(id) {
  try {
    const data = await del(`${ENDPOINTS.CHESS_PUZZLES_USERS}/${id}`, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message, status: err.status }; }
}
export async function chessPuzzleNext({ userId, difficulty }) {
  try {
    const data = await get(ENDPOINTS.CHESS_PUZZLES_NEXT, { userId, difficulty }, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message, status: err.status }; }
}
export async function chessPuzzleAttempt({ userId, puzzleId, success, attemptsUsed, viewedSolution, difficulty }) {
  try {
    const data = await post(
      ENDPOINTS.CHESS_PUZZLES_ATTEMPT,
      { userId, puzzleId, success, attemptsUsed, viewedSolution, difficulty },
      { timeout: 8000 },
    );
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function chessPuzzleStats(userId) {
  try {
    const data = await get(ENDPOINTS.CHESS_PUZZLES_STATS, { userId }, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function chessPuzzleGlobalStats() {
  try {
    const data = await get(ENDPOINTS.CHESS_PUZZLES_STATS_GLOBAL, {}, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// ─── Unified live-log tail (added 2026-05) ────────────────────────
// Cursor-based — pass the ts of the last log you've seen so the BE only
// returns new lines. Cheap enough to poll every 1.5s during a job without
// re-fetching the whole status row.
//
//   const { data } = await fetchJobLogs('image', imageId, lastTs)
//   data.logs       → [{ts, msg}, ...] in chronological order
//   data.nextSince  → ts to pass as `since` on the next poll
export async function fetchJobLogs(lane, jobId, sinceTs = 0, limit = 80) {
  try {
    const data = await get(
      `${ENDPOINTS.JOB_LOGS}/${lane}/${jobId}`,
      { since: sinceTs, limit },
      { timeout: 6000 }
    );
    return { data: data?.data || { logs: [], nextSince: sinceTs }, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// Prompt coach — Image Studio "💡 Help me write a prompt" modal. Sends the
// user's plain-English idea + the family of the selected checkpoint, gets
// back a model-tuned prompt (and a negative prompt where applicable).
export async function promptCoach({ idea, family, model } = {}) {
  try {
    const data = await post(
      ENDPOINTS.PROMPT_COACH,
      { idea, family: family || 'sdxl', model },
      { timeout: 30000 }
    );
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function sendAI(message, options = {}) {
  try {
    const messages = [{ role: 'user', content: message }];
    const data = await post(ENDPOINTS.AI, {
      messages: [...(options.history || []), ...messages],
      model: options.model || 'llama3.2:3b',
      system: options.system,
      maxTokens: options.maxTokens || 200,
      temperature: options.temperature || 0.7,
    });
    return { data: data?.data || data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// ─── AI Chat conversations (5090 / cloud) ─────────────────────────────
// Conversation-aware multi-turn chat. Each chat lives at /ai/<chatId>.

export async function listLocalModels() {
  try {
    const data = await get(ENDPOINTS.CHAT_LOCAL_MODELS, {}, { timeout: 6000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

export async function createConversation(payload = {}) {
  try {
    const data = await post(ENDPOINTS.CHAT_CONVERSATIONS, payload, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

export async function listConversations({ archived = 0, page = 1, limit = 50 } = {}) {
  try {
    const data = await get(ENDPOINTS.CHAT_CONVERSATIONS, { archived, page, limit }, { timeout: 6000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

export async function getConversation(chatId) {
  try {
    const data = await get(`${ENDPOINTS.CHAT_CONVERSATIONS}/${encodeURIComponent(chatId)}`, {}, { timeout: 6000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

export async function updateConversation(chatId, patchBody) {
  try {
    const data = await patch(`${ENDPOINTS.CHAT_CONVERSATIONS}/${encodeURIComponent(chatId)}`, patchBody, { timeout: 6000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

export async function deleteConversation(chatId) {
  try {
    const data = await del(`${ENDPOINTS.CHAT_CONVERSATIONS}/${encodeURIComponent(chatId)}`, { timeout: 6000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

export async function conversationsBulkAction(action, ids) {
  try {
    const data = await post(`${ENDPOINTS.CHAT_CONVERSATIONS}/bulk`, { action, ids }, { timeout: 10000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// POST a user message to a conversation. Returns { userMessage, jobId, status, model }.
export async function sendChatMessage(chatId, payload) {
  try {
    const data = await post(`${ENDPOINTS.CHAT_CONVERSATIONS}/${encodeURIComponent(chatId)}/messages`, payload, { timeout: 60000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// Poll a single chat-inference job (returns status + reply when done).
export async function getChatJobStatus(jobId) {
  try {
    const data = await get(`${ENDPOINTS.CHAT_STATUS}/${encodeURIComponent(jobId)}`, {}, { timeout: 6000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// Compress older messages in a chat into a single system summary so the
// model stays fast as the thread gets long.
//
// Two response shapes:
//   { mode: 'local',  jobId, model, kept, toCompact }
//     → FE should poll /chat/status/:jobId and then call
//       finalizeCompactApi(chatId, { jobId, keepLastN }).
//   { mode: 'cloud', compacted, kept, summaryMessage }
//     → Done synchronously (Groq fallback when no 5090 model is online).
export async function compactConversationApi(chatId, { keepLastN = 4, mode = 'auto' } = {}) {
  try {
    const data = await post(
      `${ENDPOINTS.CHAT_CONVERSATIONS}/${encodeURIComponent(chatId)}/compact`,
      { keepLastN, mode },
      { timeout: 60000 }
    );
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// Second half of the local compact flow. Called once the chat_job
// produced by compactConversationApi reaches status='completed'.
export async function finalizeCompactApi(chatId, { jobId, keepLastN = 4 } = {}) {
  try {
    const data = await post(
      `${ENDPOINTS.CHAT_CONVERSATIONS}/${encodeURIComponent(chatId)}/compact/finalize`,
      { jobId, keepLastN },
      { timeout: 15000 }
    );
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}

// ─── Live chess matches (online challenge mode) ───────────────────
export async function chessCreateMatch(body = {}) { try { const data = await post(ENDPOINTS.CHESS_MATCHES, body, { timeout: 8000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function chessJoinMatch(id, body = {}) { try { const data = await post(`${ENDPOINTS.CHESS_MATCHES}/${id}/join`, body, { timeout: 8000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function chessGetMatch(id, session) { try { const params = session ? { session } : {}; const data = await get(`${ENDPOINTS.CHESS_MATCHES}/${id}`, params, { timeout: 6000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function chessMatchMove(id, body) { try { const data = await post(`${ENDPOINTS.CHESS_MATCHES}/${id}/move`, body, { timeout: 6000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function chessResignMatch(id, body) { try { const data = await post(`${ENDPOINTS.CHESS_MATCHES}/${id}/resign`, body, { timeout: 6000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
// Takeback flow — requester → opponent approval. Unlimited per match.
// request body: { session, plyToRevertTo? }  (omit plyToRevertTo → revert one move)
// accept/decline body: { session }
export async function chessMatchTakebackRequest(id, body) { try { const data = await post(`${ENDPOINTS.CHESS_MATCHES}/${id}/takeback/request`, body, { timeout: 6000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function chessMatchTakebackAccept(id, body)  { try { const data = await post(`${ENDPOINTS.CHESS_MATCHES}/${id}/takeback/accept`,  body, { timeout: 6000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function chessMatchTakebackDecline(id, body) { try { const data = await post(`${ENDPOINTS.CHESS_MATCHES}/${id}/takeback/decline`, body, { timeout: 6000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function chessListLiveMatches() { try { const data = await get(`${ENDPOINTS.CHESS_MATCHES}/lobby/live`, {}, { timeout: 6000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }

// ─── YouTube downloader (yt-dlp wrapped on the BE) ─────────────────
// ─── Multi-video concatenation (ffmpeg-concat on the BE) ──────────
export async function combineCreate({ sources, title }) {
  try {
    const data = await post(ENDPOINTS.COMBINE, { sources, title }, { timeout: 10000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function combineStatus(id) {
  try {
    const data = await get(`${ENDPOINTS.COMBINE_STATUS}/${id}`, {}, { timeout: 6000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
// Paginated. Params:
//   visibility : 'public' | 'vault'   (vault requires auth)
//   status     : optional filter (queued | processing | completed | failed)
//   page       : 1-based
//   pageSize   : 1..1000 (server clamps); default 20
export async function combineList({ visibility = 'public', status, page = 1, pageSize = 20 } = {}) {
  try {
    const params = { visibility, page, pageSize };
    if (status) params.status = status;
    const data = await get(ENDPOINTS.COMBINE_LIST, params, { timeout: 10000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function combineDelete(id) {
  try {
    const data = await del(`${ENDPOINTS.COMBINE}/${id}`, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export function combineFileUrl(id) {
  const base = import.meta.env.VITE_BE_URL || '';
  return `${base}${ENDPOINTS.COMBINE_FILE}/${id}`;
}
// Upload a local mp4 to the BE so it can be used as a combine source.
// FormData-based multipart upload. Returns { uploadId, name, size, mimetype }.
export async function combineUpload(file, { onProgress } = {}) {
  try {
    const base = import.meta.env.VITE_BE_URL || '';
    const form = new FormData();
    form.append('file', file, file.name);
    // Plain fetch — `post()` is JSON-only; multipart needs raw FormData.
    // XHR rather than fetch so we can wire onProgress for the upload bar.
    const data = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}${ENDPOINTS.COMBINE_UPLOAD}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        try {
          const body = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) resolve(body?.data || body);
          else reject(new Error(body?.message || body?.error || `HTTP ${xhr.status}`));
        } catch (err) { reject(err); }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(form);
    });
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function ytdlCreate({ url, format, quality, worker = 'cobalt' }) {
  try {
    const data = await post(ENDPOINTS.YTDL, { url, format, quality, worker }, { timeout: 10000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function ytdlStatus(id) {
  try {
    const data = await get(`${ENDPOINTS.YTDL_STATUS}/${id}`, {}, { timeout: 6000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function ytdlList(limit = 30) {
  try {
    const data = await get(ENDPOINTS.YTDL_LIST, { limit }, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function ytdlDelete(id) {
  try {
    const data = await del(`${ENDPOINTS.YTDL}/${id}`, { timeout: 8000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
// Browser navigates here directly to trigger the download stream — the
// BE writes Content-Disposition: attachment so the file saves.
export function ytdlFileUrl(id) {
  const base = import.meta.env.VITE_BE_URL || '';
  return `${base}${ENDPOINTS.YTDL_FILE}/${id}`;
}

// ─── Vault-gated admin dashboard ──────────────────────────────────
// All five endpoints sit behind requireVault on the BE. The Authorization
// header is auto-attached by request.js when sid-vault-token is in
// localStorage. The /settings page polls server/db/queues/workers every 5s.
// Generous timeouts — Oracle ARM's RabbitMQ checkQueue + SQLite COUNT
// passes can take several seconds under load. With sub-second polling
// from /settings, an aggressive timeout fires before the BE responds and
// surfaces "signal timed out" in the UI.
export async function adminServerStats() { try { const data = await get(ENDPOINTS.ADMIN_SERVER_STATS, {}, { timeout: 10000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function adminDbStats() { try { const data = await get(ENDPOINTS.ADMIN_DB_STATS, {}, { timeout: 15000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function adminDiskStats() { try { const data = await get(ENDPOINTS.ADMIN_DISK_STATS, {}, { timeout: 20000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function adminMeshStats() { try { const data = await get(ENDPOINTS.ADMIN_MESH_STATS, {}, { timeout: 10000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
// Cloudinary management (§74) — Settings → Cloudinary tab.
export async function adminCloudinaryUsage() { try { const data = await get(ENDPOINTS.ADMIN_CLOUDINARY_USAGE, {}, { timeout: 10000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function adminCloudinaryResources({ type = 'video', prefix = 'ai-videos', max = 30, next } = {}) {
  try {
    const params = { type, prefix, max };
    if (next) params.next = next;
    const data = await get(ENDPOINTS.ADMIN_CLOUDINARY_RESOURCES, params, { timeout: 15000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function adminCloudinaryDelete({ publicIds, resourceType = 'video' }) {
  try {
    const data = await post(ENDPOINTS.ADMIN_CLOUDINARY_DELETE, { publicIds, resourceType }, { timeout: 20000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function adminQueueStats() { try { const data = await get(ENDPOINTS.ADMIN_QUEUES, {}, { timeout: 20000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function adminWorkers() { try { const data = await get(ENDPOINTS.ADMIN_WORKERS, {}, { timeout: 10000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function adminPurgeQueue(queue) { try { const data = await post(ENDPOINTS.ADMIN_PURGE_QUEUE, { queue }, { timeout: 15000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }
export async function adminActivity(days = 14) { try { const data = await get(ENDPOINTS.ADMIN_ACTIVITY, { days }, { timeout: 20000 }); return { data: data?.data || data, error: null } } catch (err) { return { data: null, error: err.message } } }

// ─── Database Explorer (Settings → Database) ────────────────────
// Schema introspection + paginated browse + read-only SQL + Groq Q&A.
// Every call is vault-gated; the request helper attaches the token from
// localStorage automatically. Timeouts are generous because Groq + a
// cold SQLite schema rebuild can together take 8-10s on first call.
export async function adminDbTables({ refresh = false } = {}) {
  try {
    const data = await get(ENDPOINTS.ADMIN_DB_TABLES, refresh ? { refresh: 1 } : {}, { timeout: 15000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
export async function adminDbTable(name, { limit = 50, offset = 0, orderBy, order = 'desc' } = {}) {
  try {
    const params = { limit, offset, order };
    if (orderBy) params.orderBy = orderBy;
    const data = await get(`${ENDPOINTS.ADMIN_DB_TABLE}/${encodeURIComponent(name)}`, params, { timeout: 20000 });
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
// Both /query and /ask intentionally avoid the wrapped `post()` helper:
// on a 400 (rejected SQL) we need the BE's `data` payload (generatedSql,
// reason) — the wrapped helper throws on non-2xx and discards `data`. We
// hit fetch directly here so the UI can show the rejected SQL inline.
const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001';
function _vaultHeaders() {
  try {
    const t = localStorage.getItem('sid-vault-token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}
async function _adminDbPost(endpoint, body, { timeout = 20000 } = {}) {
  try {
    const res = await fetch(`${BE_URL}${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ..._vaultHeaders() },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(timeout),
    });
    let payload = null;
    try { payload = await res.json(); } catch {}
    if (res.ok) return { data: payload?.data || payload, error: null };
    // Non-OK: surface message + the BE data block (generatedSql, etc).
    return {
      data:  payload?.data || null,
      error: payload?.message || `Request failed: ${res.status}`,
      status: res.status,
    };
  } catch (err) {
    return { data: null, error: err.message };
  }
}
export async function adminDbQuery(sql)        { return _adminDbPost(ENDPOINTS.ADMIN_DB_QUERY, { sql },      { timeout: 20000 }); }
export async function adminDbAsk(question, { table } = {}) { return _adminDbPost(ENDPOINTS.ADMIN_DB_ASK, { question, table }, { timeout: 45000 }); }
