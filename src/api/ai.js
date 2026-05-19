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
export async function cinemaBulkAction(action, ids) {
  try {
    const data = await post(ENDPOINTS.CINEMA_BULK, { action, ids }, { timeout: 15000 });
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
// model stays fast as the thread gets long. Returns { compacted, kept,
// summaryMessage }.
export async function compactConversationApi(chatId, { keepLastN = 4 } = {}) {
  try {
    const data = await post(
      `${ENDPOINTS.CHAT_CONVERSATIONS}/${encodeURIComponent(chatId)}/compact`,
      { keepLastN },
      { timeout: 60000 }
    );
    return { data: data?.data || data, error: null };
  } catch (err) { return { data: null, error: err.message }; }
}
