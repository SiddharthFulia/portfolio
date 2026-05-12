import { get, post, del } from './request';
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
