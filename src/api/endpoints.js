export const ENDPOINTS = {
  // Health
  HEALTH: '/api/health',
  STATS: '/api/stats',

  // AI
  CHAT: '/api/chat',
  AI: '/api/ai',
  GROQ: '/api/groq',
  GEMINI: '/api/gemini',
  GEMINI_VISION: '/api/gemini/vision',
  PROMPT_COACH: '/api/ai/prompt-coach',
  GENERATE_IMAGE: '/api/generate-image',
  IMAGE_EDIT: '/api/image-edit',
  TTS: '/api/tts',
  SUMMARIZE: '/api/summarize',

  // AI Video (queue-based)
  AI_VIDEO_GENERATE: '/api/ai-video/generate',
  AI_VIDEO_STATUS: '/api/ai-video/status',
  AI_VIDEO_TODAY: '/api/ai-video/today',
  AI_VIDEO_LIST: '/api/ai-video/list',
  AI_VIDEO_PROVIDERS: '/api/ai-video/providers',
  AI_VIDEO_UPLOAD_IMAGE: '/api/ai-video/upload-image',
  AI_VIDEO_JOBS:        '/api/ai-video/jobs',
  IMAGE_ENHANCE:        '/api/image-enhance',
  IMAGE_ENHANCE_STATUS: '/api/image-enhance/status',
  IMAGE_ENHANCE_LIST:   '/api/image-enhance/list',
  IMAGE_ENHANCE_BULK:   '/api/image-enhance/bulk',
  AI_VIDEO_BULK:        '/api/ai-video/bulk',
  // Studio lanes (Tier 3)
  LIPSYNC:              '/api/lipsync',
  LIPSYNC_STATUS:       '/api/lipsync/status',
  LIPSYNC_LIST:         '/api/lipsync/list',
  LIPSYNC_BULK:         '/api/lipsync/bulk',
  AUDIO:                '/api/audio',
  AUDIO_STATUS:         '/api/audio/status',
  AUDIO_LIST:           '/api/audio/list',
  AUDIO_BULK:           '/api/audio/bulk',
  STT:                  '/api/stt',                // Speech-to-Text (Whisper / HF)
  CHAT_CONVERSATIONS:   '/api/chat/conversations',
  CHAT_STATUS:          '/api/chat/status',        // /:jobId
  CHAT_LOCAL_MODELS:    '/api/chat/local-models',
  CINEMA:               '/api/cinema',
  CINEMA_STATUS:        '/api/cinema/status',
  CINEMA_LIST:          '/api/cinema/list',
  CINEMA_BULK:          '/api/cinema/bulk',
  // Per-render resumable state — POST /cinema/:projectId/render returns
  // a renderId; the FE then navigates to /cinema/render/:renderId
  CINEMA_RENDER_CREATE: '/api/cinema',          // POST <projectId>/render appended at call site
  CINEMA_RENDER:        '/api/cinema/render',   // /:renderId appended for GET / PATCH / DELETE
  CINEMA_RENDERS:       '/api/cinema/renders',  // paginated list
  // 3D Mesh generation (Shap-E / Point-E on 5090)
  MESH_GENERATE:        '/api/mesh/generate',
  MESH_STATUS:          '/api/mesh/status',   // /:jobId appended at call site
  MESH_LIST:            '/api/mesh/list',
  // Deepfake lane — Vault-gated (face-swap + voice-clone-of-anyone)
  DEEPFAKE_GENERATE:    '/api/deepfake/generate',
  DEEPFAKE_STATUS:      '/api/deepfake/status',
  DEEPFAKE_LIST:        '/api/deepfake/list',
  // Runner game — hand-gesture endless runner
  GAMES_PLAYERS:        '/api/games/players',
  GAMES_PLAYER:         '/api/games/players',   // /:idOrName appended at call site
  GAMES_SCORES:         '/api/games/scores',
  // Chess (Stockfish via BE)
  CHESS_BEST_MOVE:      '/api/chess/best-move',
  CHESS_ANALYZE:        '/api/chess/analyze',
  CHESS_PLAY:           '/api/chess/play',
  CHESS_STATUS:         '/api/chess/status',
  CHESS_GAMES:          '/api/chess/games',       // /:id appended at call site for one-game ops
  CHESS_COLLECTIONS:    '/api/chess/collections',
  CHESS_MATCHES:        '/api/chess/matches',     // /:id, /:id/join, /:id/move, /:id/resign appended at call site
  CHESS_OPENINGS:       '/api/chess/openings',    // /:slug appended at call site for detail
  CHESS_OPENINGS_EXPLORER: '/api/chess/openings/explorer', // BE proxy to lichess masters DB
  CHESS_OPENINGS_IDENTIFY: '/api/chess/openings/identify', // POST { moves: [SAN,...] } — live opening name detection
  CHESS_VARIANT_PLAY:   '/api/chess/variant/play',     // POST { variant, fen, moveHistory?, options? } — Stockfish move for a variant position
  // Multi-video concatenation (ffmpeg-concat lane)
  COMBINE:              '/api/combine',
  COMBINE_UPLOAD:       '/api/combine/upload',
  CINEMA_FIX_ACTION:    '/api/cinema',   // /:projectId/shots/:shotIndex/fix-action appended at call site
  COMBINE_STATUS:       '/api/combine/status',       // /:id appended at call site
  COMBINE_LIST:         '/api/combine/list',
  COMBINE_FILE:         '/api/combine/file',         // /:id appended at call site
  // YouTube downloader (yt-dlp wrapped on the BE)
  YTDL:                 '/api/yt-dl',
  YTDL_STATUS:          '/api/yt-dl/status',      // /:id appended at call site
  YTDL_LIST:            '/api/yt-dl/list',
  YTDL_FILE:            '/api/yt-dl/file',        // /:id appended at call site
  // Vault-gated admin dashboard
  ADMIN_CLOUDINARY_USAGE:     '/api/admin/cloudinary/usage',
  ADMIN_CLOUDINARY_RESOURCES: '/api/admin/cloudinary/resources',
  ADMIN_CLOUDINARY_DELETE:    '/api/admin/cloudinary/delete',
  ADMIN_SERVER_STATS:   '/api/admin/server-stats',
  ADMIN_DB_STATS:       '/api/admin/db-stats',
  ADMIN_DISK_STATS:     '/api/admin/disk-stats',
  ADMIN_MESH_STATS:     '/api/admin/mesh-stats',
  ADMIN_QUEUES:         '/api/admin/queues',
  ADMIN_WORKERS:        '/api/admin/workers',
  ADMIN_PURGE_QUEUE:    '/api/admin/queues/purge',
  ADMIN_ACTIVITY:       '/api/admin/activity',
  JOB_LOGS:             '/api/job-logs',   // /:lane/:jobId?since=<ms>&limit=80
  EXPORT:               '/api/export',     // POST { format, rows|content, title, filename }

  // Vision
  FACE_ANALYZE: '/api/face-analyze',
  DETECT_OBJECTS: '/api/detect-objects',
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
  GITHUB_USER:          '/api/proxy/github-user',
  GITHUB_REPOS:         '/api/proxy/github-repos',
  GITHUB_CONTRIBUTIONS: '/api/proxy/github-contributions',
};
