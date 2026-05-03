import { get, post } from './request';
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
    const data = await post(
      ENDPOINTS.AI_VIDEO_GENERATE,
      {
        prompt,
        provider: options.provider || 'auto',
        model: options.model,
        duration: options.duration || 5,
        resolution: options.resolution || '1080p',
        aspectRatio: options.aspectRatio || '9:16',
        style: options.style || 'cinematic',
        audio: options.audio !== false,
        imageUrl: options.imageUrl || '',
        generateCaption: options.generateCaption !== false,
      },
      { timeout: 5 * 60 * 1000 }
    );
    return { data: data?.data || data, error: null };
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

export async function listVideos(limit = 12) {
  try {
    const data = await get(ENDPOINTS.AI_VIDEO_LIST, { limit }, { timeout: 6000 });
    return { data: data?.data || [], error: null };
  } catch (err) {
    return { data: [], error: err.message };
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
