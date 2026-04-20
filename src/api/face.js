import { post, get } from './request';
import { ENDPOINTS } from './endpoints';

export async function analyzeFace(imageData, options = {}) {
  try {
    const res = await post(ENDPOINTS.FACE_ANALYZE, { image: imageData }, { timeout: 15000, ...options });
    return { data: res.data || res, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function checkFaceHealth() {
  try {
    const res = await get(ENDPOINTS.FACE_HEALTH, {}, { timeout: 3000 });
    return res.data?.healthy ?? res.healthy ?? false;
  } catch {
    return false;
  }
}
