/* ── Science Hub – Shared Utilities ── */

export const NASA_API_KEY = import.meta.env.VITE_NASA_API_KEY || 'DEMO_KEY';

/* ── In-memory response cache (survives section close/reopen) ── */
const _cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached(url) {
  const entry = _cache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(url); return null; }
  return entry.data;
}

function setCache(url, data) {
  _cache.set(url, { data, ts: Date.now() });
}

/* ── Rate limit tracking (reads X-RateLimit-Remaining header) ── */
let _rateLimitHit = 0;
let _rateLimitRemaining = null;

export function isRateLimited() {
  if (!_rateLimitHit) return false;
  return Date.now() - _rateLimitHit < 10_000; // 10s cooldown — 1000/hr key recovers fast
}

export function getRateLimitWaitSec() {
  if (!_rateLimitHit) return 0;
  const remaining = 10_000 - (Date.now() - _rateLimitHit);
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export function getRateLimitRemaining() {
  return _rateLimitRemaining;
}

/**
 * Fetch with caching, rate-limit awareness, and abort support.
 */
export async function fetchNASA(url, { signal, skipCache = false } = {}) {
  if (!skipCache) {
    const cached = getCached(url);
    if (cached) return { data: cached, error: null, fromCache: true };
  }

  if (isRateLimited()) {
    const wait = getRateLimitWaitSec();
    return { data: null, error: `Rate limited — please wait ${wait}s before retrying.` };
  }

  try {
    const res = await fetch(url, { signal });

    // Track remaining requests from response headers
    const rlRemaining = res.headers.get('X-RateLimit-Remaining');
    if (rlRemaining !== null) _rateLimitRemaining = parseInt(rlRemaining, 10);

    if (!res.ok) {
      if (res.status === 429) {
        _rateLimitHit = Date.now();
        _rateLimitRemaining = 0;
        return { data: null, error: 'Rate limit reached — waiting 60s before allowing new requests.' };
      }
      throw new Error(`API Error ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    setCache(url, data);
    return { data, error: null };
  } catch (err) {
    if (err.name === 'AbortError') return { data: null, error: null };
    return { data: null, error: err.message };
  }
}

/** Build an API url with the key injected */
export function nasaUrl(path, params = {}) {
  const url = new URL(path);
  url.searchParams.set('api_key', NASA_API_KEY);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  return url.toString();
}

/** Format large numbers with commas */
export function formatNumber(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-US');
}

/** Format a distance in km to a readable string */
export function formatDistance(km) {
  const n = parseFloat(km);
  if (isNaN(n)) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M km`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K km`;
  return `${n.toFixed(0)} km`;
}

/** YYYY-MM-DD for today */
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** YYYY-MM-DD for N days ago */
export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Debounce hook helper */
export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Wrap a URL through a CORS proxy for APIs that block browser requests.
 * Used for: TechTransfer (redirect CORS), Fireball (no CORS), open-notify (HTTP).
 */
export function corsProxy(url) {
  return `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`;
}

/** Card classes (no backdrop-blur for performance) */
export const glassCard = 'bg-gray-900 border border-gray-700/50 rounded-2xl';
export const glassCardHover = 'hover:border-cyan-500/30 transition-colors duration-200';

/** Accent text classes */
export const glowText = 'text-cyan-400';

/** Loading skeleton */
export const skeletonPulse = 'animate-pulse bg-gray-800 rounded';

/**
 * Shared error display with auto-retry countdown.
 * Usage: <ErrorWithRetry error={error} onRetry={fetchData} />
 */
export { default as ErrorWithRetry } from './ErrorWithRetry';
