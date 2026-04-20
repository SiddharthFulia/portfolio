import { get } from './request';
import { ENDPOINTS } from './endpoints';

// ── In-memory cache (10 min TTL, stale data kept for 429 fallback) ──
const _cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

function getCached(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return entry.data;
}

// Return stale cache even if expired (for 429 fallback)
function getStaleCached(key) {
  const entry = _cache.get(key);
  return entry ? entry.data : null;
}

// ── Rate limit cooldown ──
let _rateLimitUntil = 0;

export function getRateLimitWaitSec() {
  const remaining = _rateLimitUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export function isRateLimited() {
  return Date.now() < _rateLimitUntil;
}

function setCache(key, data) {
  _cache.set(key, { data, ts: Date.now() });
  if (_cache.size > 200) _cache.delete(_cache.keys().next().value);
}

/**
 * In-flight request deduplication — prevents duplicate API calls
 * when React strict mode double-renders or navigation triggers re-fetches.
 */
const _inflight = new Map();

/**
 * Cached GET wrapper with request deduplication.
 * Returns { data, error, fromCache }
 */
async function cachedGet(endpoint, params = {}, options = {}) {
  const cacheKey = endpoint + JSON.stringify(params);

  if (!options.skipCache) {
    const cached = getCached(cacheKey);
    if (cached) return { data: cached, error: null, fromCache: true };
  }

  // Deduplicate: if this exact request is already in flight, wait for it
  // (but not for skipCache requests — those are intentionally random/fresh)
  if (!options.skipCache && _inflight.has(cacheKey)) {
    return _inflight.get(cacheKey);
  }

  // If rate limited, return stale cache or wait message
  if (isRateLimited()) {
    const stale = getStaleCached(cacheKey);
    if (stale) return { data: stale, error: null, fromCache: true };
    const wait = getRateLimitWaitSec();
    return { data: null, error: `Rate limited — try again in ${wait}s` };
  }

  const promise = (async () => {
    try {
      const data = await get(endpoint, params, options);
      setCache(cacheKey, data);
      return { data, error: null };
    } catch (err) {
      if (err.name === 'AbortError') return { data: null, error: null };

      // On 429: set cooldown, try returning stale cached data
      if (err.status === 429 || err.message?.includes('429')) {
        _rateLimitUntil = Date.now() + 30_000; // 30s cooldown
        const stale = getStaleCached(cacheKey);
        if (stale) return { data: stale, error: null, fromCache: true };
      }

      return { data: null, error: err.message };
    } finally {
      _inflight.delete(cacheKey);
    }
  })();

  _inflight.set(cacheKey, promise);
  return promise;
}

// ── APOD ──
export function fetchAPOD(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.APOD, params, options);
}

// ── Asteroids (NeoWs) ──
export function fetchAsteroids(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.NEOWS, params, options);
}

// ── DONKI (Space Weather) ──
export function fetchFlares(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.DONKI_FLR, params, options);
}

export function fetchStorms(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.DONKI_GST, params, options);
}

export function fetchCMEs(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.DONKI_CME, params, options);
}

// ── EPIC ──
export function fetchEPIC(options = {}) {
  return cachedGet(ENDPOINTS.EPIC, {}, options);
}

export function fetchEPICByDate(date, options = {}) {
  return cachedGet(`${ENDPOINTS.EPIC_DATE}/${date}`, {}, options);
}

export function fetchEPICDates(options = {}) {
  return cachedGet(ENDPOINTS.EPIC_ALL, {}, options);
}

// ── Earth Events (EONET) ──
export function fetchEarthEvents(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.EONET, params, options);
}

// ── Media Search ──
export function fetchMediaSearch(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.IMAGES, params, { ...options, skipCache: true });
}

// ── Fireballs ──
export function fetchFireballs(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.FIREBALL, params, options);
}

// ── ISS Position (no cache) ──
export async function fetchISS(options = {}) {
  try {
    const data = await get(ENDPOINTS.ISS, {}, { timeout: 5000, ...options });
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// ── People in Space ──
export function fetchAstros(options = {}) {
  return cachedGet(ENDPOINTS.ASTROS, {}, options);
}

// ── Satellite TLE ──
export function fetchTLE(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.TLE, params, options);
}

// ── TechTransfer ──
export function fetchTechTransfer(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.TECHTRANSFER, params, options);
}

// ── Earth Imagery (returns image URL, not JSON) ──
export function getEarthImageryURL(params = {}) {
  const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001';
  const url = new URL(ENDPOINTS.EARTH_IMAGERY, BE_URL);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  return url.toString();
}

// ── Pokemon ──
export function fetchPokemonList(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.POKEMON_LIST, params, options);
}
export function fetchPokemonDetail(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.POKEMON_DETAIL, params, options);
}

// ── Artworks ──
export function fetchArtworks(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.ARTWORKS, params, options);
}

// ── Weather ──
export function fetchWeather(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.WEATHER, params, { ...options, skipCache: true });
}
export function fetchForecast(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.FORECAST, params, options);
}

// ── Sunrise/Sunset ──
export function fetchSunrise(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.SUNRISE, params, options);
}

// ── Rick and Morty ──
export function fetchRickMorty(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.RICKMORTY, params, options);
}
export function fetchRickMortyDetail(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.RICKMORTY_DETAIL, params, options);
}

// ── Dogs ──
export function fetchRandomDog(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.RANDOM_DOG, params, { ...options, skipCache: true });
}
export function fetchDogBreeds(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.DOG_BREEDS, params, options);
}
export function fetchDogBreed(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.DOG_BREED, params, { ...options, skipCache: true });
}

// ── Quotes ──
export function fetchQuotes(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.QUOTES, params, { ...options, skipCache: true });
}

// ── Countries ──
export function fetchCountries(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.COUNTRIES, params, options);
}
export function fetchCountry(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.COUNTRY, params, options);
}

// ── Memes ──
export function fetchMemes(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.MEMES, params, options);
}

// ── Launches ──
export function fetchLaunches(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.LAUNCHES, params, options);
}

// ── Foodish ──
export function fetchFoodish(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.FOODISH, params, { ...options, skipCache: true });
}

// ── Magic: The Gathering ──
export function fetchMTG(params = {}, options = {}) {
  return cachedGet(ENDPOINTS.MTG, params, options);
}

// ── Helpers ──
export function formatNumber(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-US');
}

export function formatDistance(km) {
  const n = parseFloat(km);
  if (isNaN(n)) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M km`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K km`;
  return `${n.toFixed(0)} km`;
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
