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

  // NASA — third-party proxied endpoints
  FIREBALL: '/api/nasa/proxy/fireball',
  ISS: '/api/nasa/proxy/iss',
  ASTROS: '/api/nasa/proxy/astros',
  TLE: '/api/nasa/proxy/tle',
  EONET: '/api/nasa/proxy/eonet',
  IMAGES: '/api/nasa/proxy/images',
  TECHTRANSFER: '/api/nasa/proxy/techtransfer',
  POKEMON_LIST: '/api/nasa/proxy/pokemon',
  POKEMON_DETAIL: '/api/nasa/proxy/pokemon-detail',
  ARTWORKS: '/api/nasa/proxy/artworks',
  WEATHER: '/api/nasa/proxy/weather',
  FORECAST: '/api/nasa/proxy/forecast',
  SUNRISE: '/api/nasa/proxy/sunrise',
  RICKMORTY: '/api/nasa/proxy/rickmorty',
  RICKMORTY_DETAIL: '/api/nasa/proxy/rickmorty-detail',
  RANDOM_DOG: '/api/nasa/proxy/randomdog',
  DOG_BREEDS: '/api/nasa/proxy/dogbreeds',
  DOG_BREED: '/api/nasa/proxy/dogbreed',
  QUOTES: '/api/nasa/proxy/quotes',
  COUNTRIES: '/api/nasa/proxy/countries',
  COUNTRY: '/api/nasa/proxy/country',
  MEMES: '/api/nasa/proxy/memes',
  LAUNCHES: '/api/nasa/proxy/launches',
  FOODISH: '/api/nasa/proxy/foodish',
  MTG: '/api/nasa/proxy/mtg',
};
