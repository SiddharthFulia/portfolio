export const ENDPOINTS = {
  // Health
  HEALTH: '/api/health',
  STATS: '/api/stats',

  // AI (Ollama)
  CHAT: '/api/chat',
  AI: '/api/ai',

  // Face Detection
  FACE_ANALYZE: '/api/face-analyze',
  FACE_HEALTH: '/api/face-health',

  // NASA — direct proxied endpoints (api.nasa.gov/*)
  APOD: '/api/nasa/planetary/apod',
  NEOWS: '/api/nasa/neo/rest/v1/feed',
  DONKI_FLR: '/api/nasa/DONKI/FLR',
  DONKI_GST: '/api/nasa/DONKI/GST',
  DONKI_CME: '/api/nasa/DONKI/CME',
  EPIC: '/api/nasa/EPIC/api/natural',
  EPIC_ALL: '/api/nasa/EPIC/api/natural/all',
  EPIC_DATE: '/api/nasa/EPIC/api/natural/date', // append /{date}
  EARTH_IMAGERY: '/api/nasa/planetary/earth/imagery',

  // Third-party proxied endpoints
  FIREBALL: '/api/proxy/fireball',
  ISS: '/api/proxy/iss',
  ASTROS: '/api/proxy/astros',
  TLE: '/api/proxy/tle',
  EONET: '/api/proxy/eonet',
  IMAGES: '/api/proxy/images',
  TECHTRANSFER: '/api/proxy/techtransfer',
  POKEMON_LIST: '/api/proxy/pokemon',
  POKEMON_DETAIL: '/api/proxy/pokemon-detail',
  ARTWORKS: '/api/proxy/artworks',
  WEATHER: '/api/proxy/weather',
  FORECAST: '/api/proxy/forecast',
  SUNRISE: '/api/proxy/sunrise',
  RICKMORTY: '/api/proxy/rickmorty',
  RICKMORTY_DETAIL: '/api/proxy/rickmorty-detail',
  RANDOM_DOG: '/api/proxy/randomdog',
  DOG_BREEDS: '/api/proxy/dogbreeds',
  DOG_BREED: '/api/proxy/dogbreed',
  QUOTES: '/api/proxy/quotes',
  COUNTRIES: '/api/proxy/countries',
  COUNTRY: '/api/proxy/country',
  MEMES: '/api/proxy/memes',
  LAUNCHES: '/api/proxy/launches',
  FOODISH: '/api/proxy/foodish',
  MTG: '/api/proxy/mtg',
};
