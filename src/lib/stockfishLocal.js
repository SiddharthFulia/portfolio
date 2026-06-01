// stockfishLocal — pure client-side Stockfish wrapper.
//
// We bundle stockfish.js's lite single-threaded WASM build (≈7 MB) into
// /public/stockfish/, spawn it as a Web Worker, and expose a tiny Promise
// API. Everything runs in the browser — no fetch, no BE call, no CORS
// headers. Same-origin worker → no cross-origin worker complications.
//
// Why lite-single rather than the full 113 MB multi-threaded build:
//   • The multi-threaded engine needs Cross-Origin-Isolation headers
//     (COOP + COEP) on every response so SharedArrayBuffer is available.
//     We're hosted on Vercel with default headers — we'd have to add
//     vercel.json header rules AND it would break embeds. Not worth it.
//   • Lite single-threaded is still far stronger than any non-GM human,
//     loads in well under a second on a typical connection, and Just Works.
//
// UCI exchange model — Stockfish takes commands as strings via worker
// postMessage('uci'), and emits lines via worker.onmessage as plain
// strings. We listen for 'uci', 'readyok', 'bestmove …' to drive a
// per-call Promise. Calls are serialised; only one search runs at a time.

// Singleton — we boot a single worker for the page lifetime. Bestmove
// requests are queued so a second call while one is in flight doesn't
// confuse the engine (UCI is stateful: 'position ...' must precede 'go').
let _worker = null
let _ready = null            // Promise that resolves once 'uciok' + 'readyok' both seen.
let _busy = false            // True while a 'go' is in flight.
const _queue = []            // Array of () => void thunks waiting their turn.

function nextInQueue() {
  if (_busy) return
  const job = _queue.shift()
  if (job) job()
}

function bootWorker() {
  if (_worker) return _worker
  // Same-origin worker — file is in /public so it serves from the root.
  // We don't use { type: 'module' } because Stockfish.js is a classic
  // script that uses importScripts/global wasm loading, not ES modules.
  _worker = new Worker('/stockfish/stockfish.js')

  _ready = new Promise((resolve) => {
    let uciok = false
    let readyok = false
    const onBootMsg = (e) => {
      const line = typeof e.data === 'string' ? e.data : ''
      if (line === 'uciok') uciok = true
      if (line === 'readyok') readyok = true
      if (uciok && readyok) {
        _worker.removeEventListener('message', onBootMsg)
        resolve()
      }
    }
    _worker.addEventListener('message', onBootMsg)
    // Handshake — 'uci' triggers an 'id …' burst ending with 'uciok'.
    // 'isready' triggers 'readyok' once the engine is initialised.
    _worker.postMessage('uci')
    _worker.postMessage('isready')
  })

  return _worker
}

// Public API — returns a Promise<{ bestmove, ponder?, info? }> shaped
// like the BE chessVariantPlay response so VariantsHub stays close to
// its original shape.
//
//   fen     — full FEN string of the position to search.
//   depth   — optional integer search depth.
//   movetime — optional ms time budget. Default 1500.
//   options — UCI options to setoption before each search. Keys are
//             the UCI option names (e.g. 'UCI_Chess960', 'Skill Level').
//             Pass UCI_Chess960: true for Fischer-random.
export function getBestMove(fen, { depth, movetime = 1500, options = {} } = {}) {
  return new Promise((resolve, reject) => {
    if (!fen) { reject(new Error('fen is required')); return }
    const run = async () => {
      _busy = true
      try {
        const w = bootWorker()
        await _ready
        // Per-call setoption — these are sticky on the engine until
        // overridden, but we re-set every time so toggling between
        // 960 and standard mid-session works cleanly.
        for (const [k, v] of Object.entries(options)) {
          // UCI bool options take 'true' / 'false'; integers take their
          // value. Numbers and strings both stringify cleanly here.
          w.postMessage(`setoption name ${k} value ${v}`)
        }
        // Tell the engine the new position. ucinewgame clears its tables
        // so a fresh 960 starting position doesn't get evaluated relative
        // to a prior standard-game search.
        w.postMessage('ucinewgame')
        w.postMessage(`position fen ${fen}`)
        // Track latest info lines so callers can show score/depth telemetry.
        let lastInfo = null
        const onMsg = (e) => {
          const line = typeof e.data === 'string' ? e.data : ''
          if (line.startsWith('info ')) {
            // Pluck depth + score for telemetry. Cheap enough; we don't
            // pre-emptively reject malformed lines.
            const dMatch = line.match(/\bdepth (\d+)/)
            const cpMatch = line.match(/\bcp (-?\d+)/)
            const mateMatch = line.match(/\bmate (-?\d+)/)
            lastInfo = {
              depth: dMatch ? parseInt(dMatch[1], 10) : null,
              cp: cpMatch ? parseInt(cpMatch[1], 10) : null,
              mate: mateMatch ? parseInt(mateMatch[1], 10) : null,
            }
          } else if (line.startsWith('bestmove ')) {
            w.removeEventListener('message', onMsg)
            // 'bestmove <uci> ponder <uci>' — keep only the move; ponder is
            // optional and we don't currently use it.
            const parts = line.split(/\s+/)
            const bestmove = parts[1] && parts[1] !== '(none)' ? parts[1] : null
            _busy = false
            if (!bestmove) {
              reject(new Error('Engine returned no move (terminal position)'))
            } else {
              resolve({ bestmove, info: lastInfo })
            }
            nextInQueue()
          }
        }
        w.addEventListener('message', onMsg)
        // Go — prefer movetime so the UX is predictable. If a depth was
        // also passed, the engine respects whichever limit hits first.
        if (depth) {
          w.postMessage(`go depth ${depth} movetime ${movetime}`)
        } else {
          w.postMessage(`go movetime ${movetime}`)
        }
      } catch (err) {
        _busy = false
        reject(err)
        nextInQueue()
      }
    }
    if (_busy) _queue.push(run)
    else run()
  })
}

// Optional helper — bumps Stockfish's Skill Level (0..20) for an easier
// or stronger opponent. Stockfish's UCI_Elo is technically separate, but
// in the lite build the simpler Skill Level mapping works fine and is
// supported everywhere. Caller may pass numeric levels straight through.
export function skillLevelFromElo(elo) {
  if (!elo || elo < 800) return 3
  if (elo >= 2500) return 20
  // Map 800..2500 → 3..20 linearly. Rough but matches typical chess UIs.
  return Math.round(3 + ((elo - 800) / (2500 - 800)) * (20 - 3))
}
