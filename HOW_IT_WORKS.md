# How the Portfolio Works

Lightweight reference for the moving parts inside the portfolio.

## Settings (`/settings`)

Vault-gated admin dashboard. Polls the BE every 2s by default. Tabs:

- **Overview** — server stats, DB rowcounts, RabbitMQ queues, worker heartbeats.
- **Storage** — disk usage by bucket (SQLite, ffmpeg outputs, YouTube downloads, mesh BLOBs).
- **Visualize** — per-table activity timeseries (last 7 / 14 / 30 days) + mesh-job breakdown.
- **Database** — Database Explorer + Groq Q&A (see below).
- **Cloudinary** — free-tier usage, asset browse, bulk delete.

### Database Explorer + Groq Q&A

The Database tab is a read-only window into `data/sid.db`. Three modes share one safety pipeline.

**What it does.**
- Lists every user table (skipping `sqlite_*` internals) with row count + column metadata.
- Browses any table paginated, with click-to-sort columns.
- Accepts free-form SELECT statements and runs them against a `readonly: true` SQLite connection.
- Accepts a plain-English question, hands it to Groq with the live schema, and runs the generated SELECT.

**The read-only guarantee.** Three layers, any one of which would catch a write:
1. **Regex deny-list** — rejects anything matching `\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|ATTACH|DETACH|PRAGMA|REINDEX|REPLACE|VACUUM)\b` before the SQL is parsed.
2. **No comments / no multi-statement** — `--`, `/* */`, and any extra `;` past the trailing one are rejected so a comment-smuggled `DROP` can't slip through.
3. **`readonly: true` SQLite handle** — even if both checks above were bypassed, the SQLite engine itself refuses to write. The handle is opened once with `new Database(path, { readonly: true })` and reused across all explorer endpoints.

`LIMIT 200` is appended if the user / model didn't include one. The result is then re-capped at 200 rows on the way out.

**How the Groq prompt is built.** A schema cache (refreshed every 30s) holds every table's name, columns + types, row count, and the top 3 sample rows. On `/ask`, the BE builds a system prompt that contains:

- The rules (only SELECT, no comments, no multi-statement, prefer LIMIT 200, use JSON helpers for JSON columns).
- The full schema dump, one line per table, with the sample rows JSON-stringified.
- An instruction to return `{"sql": "...", "explanation": "..."}` as raw JSON.

The model picked is `llama-3.3-70b-versatile` (Groq) at temperature 0.1, 4000 max tokens. The schema dump for the current sid.db is ~2-3k tokens; the full payload sits well under the model's 128k window.

**How rejections work.** Both `/api/admin/db/query` and `/api/admin/db/ask` return `400` with a JSON body containing `{ message, data: { generatedSql, reason } }` when the safety wrapper says no. The Database tab displays the rejection inline (red banner), shows the offending SQL, and offers a one-click "Edit in SQL tab" button so the user can refine the question or hand-edit the query. Nothing is ever executed past the safety wrapper.

**No audit trail.** Queries and questions are not stored anywhere. Only what's in the live tab survives a page refresh.

## Chess (`/chess`)

One page, four top-level tabs, ten board modes, one shared chessground render. Tabs are URL-stateful (`?tab=`); mode is URL-stateful (`?variant=`); both deep-link.

### Tabs

- **Play** — main board with the mode chip row + engine controls.
- **Puzzles** — Lichess-imported trainer (per-user rating, difficulty brackets, retry with penalty, post-puzzle analyse). Always standard chess; if you arrive here with `?variant=koth`, the page snaps mode back to standard so the board renders.
- **Online** — challenge lobby + live multiplayer with the takeback request flow.
- **Saved** — your library of finished games. Same auto-snap to standard.

### Modes

Ten modes share one `<ChessBoard>` (chessground under the hood):

| Mode | Rules engine | Stockfish? | Notes |
|---|---|---|---|
| Standard | `chess.js` | Yes (analyse + play) | Full PGN, opening detection, eval bar |
| Chess960 | `chessops` | Yes (`UCI_Chess960=true`) | X-FEN castling, back rank shuffled per game |
| King of the Hill | `chessops` | Yes (standard rules; KoTH win-condition enforced FE-side) | First king to d4/e4/d5/e5 wins |
| Three-Check | `chessops` | Yes (standard rules; check counter FE-side) | First to deliver 3 checks wins |
| Atomic | `chessops` | No — pass-and-play | Captures explode 3×3, blowing up own king disallowed |
| Antichess | `chessops` | No — pass-and-play | Captures mandatory; lose your pieces to win |
| Horde | `chessops` | No — pass-and-play | Black plays standard, white has 36 pawns |
| Crazyhouse | `chessops` | No — pass-and-play | Captured pieces become reserve, droppable |
| Racing Kings | `chessops` | No — pass-and-play | Race kings to rank 8, no checks allowed |
| Offline 2P | `chess.js` | No engine ever | Hot-seat, pass-and-play, exit-button PGN export |

### Why one board, two rules engines

`chess.js` v1 is rich but only knows standard rules + can't parse X-FEN castling. `chessops` (Lichess's own rules library) implements every variant including 960's atypical castling. Solution: a thin **adapter** at `src/lib/variantGame.js` wraps a chessops `Position` in the same surface `chess.js` exposes (`.turn()`, `.fen()`, `.move({from,to,promotion})`, `.moves({square})`, `.history()`, `.isGameOver()`, `.inCheck()`, `.undo()`). `<ChessBoard>` doesn't know which engine is behind the wrap — it just calls those methods.

### How Stockfish plays variants

Stockfish runs in the browser via `stockfish.js` (the WASM build, lite single-threaded — no COOP/COEP headers needed). One Web Worker, singleton, lazy-created on first call. The wrapper at `src/lib/stockfishLocal.js` exposes `getBestMove(fen, { depth, movetime, options })`.

- **Standard / Offline** — pass the FEN, Stockfish plays standard.
- **Chess960** — same call + `options.UCI_Chess960 = true`. Stockfish handles 960 castling natively.
- **KoTH / 3-Check** — call Stockfish with the position; it plays as if it were standard chess. The adapter enforces the variant's win condition AFTER the move lands — so if the engine moves a king to d4 in KoTH, our `isGameOver()` returns true and we declare it the winner.
- **Atomic / Antichess / Horde / Crazyhouse / Racing Kings** — engine disabled (`ENGINE_SUPPORTED_MODES` in `variantGame.js` is the gate). UI auto-flips to "Engine: variant unsupported" and the human-vs-human chip becomes the only option. Stockfish *would* play illegal moves (it doesn't know about atomic explosions or capture-mandatory rules), so we refuse to call it.

The eval bar is gated to standard only — Stockfish's score for "this is good in standard chess" doesn't mean anything in Atomic.

### Take back (formerly "Undo")

Standard `chess.js` had `.undo()` from day one; the chessops adapter wasn't capable until we added a snapshot stack. Every `.move(...)` on the adapter clones the position **before** play. Undo pops the latest clone, swaps it in as the active position, and pops the move from `historyUci`. Works for every variant, including 960. In engine-play mode the button rolls back **two** plies so you land back on your own turn instead of facing the engine again with the same board.

There's also a takeback **request** flow (separate from local take back) on the Online tab — used in multiplayer where one player can't unilaterally roll back. That's the BE-state takeback documented under "Online".
