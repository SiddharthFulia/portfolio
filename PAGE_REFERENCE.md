# Page Reference

Quick map: every page → what it does → the BE endpoints it talks to.

## Settings (`/settings`) — Vault-gated

| Tab          | Purpose                                            | Endpoints |
|--------------|----------------------------------------------------|-----------|
| Overview     | Server / DB / queues / workers stats               | `GET /api/admin/server-stats` · `GET /api/admin/db-stats` · `GET /api/admin/queues` · `GET /api/admin/workers` · `POST /api/admin/queues/purge` |
| Storage      | Per-bucket disk usage + per-domain row counts      | `GET /api/admin/disk-stats` |
| Visualize    | Per-table activity timeseries + mesh-job breakdown | `GET /api/admin/activity` · `GET /api/admin/mesh-stats` |
| **Database** | Read-only SQLite browse + SQL + Groq Q&A           | `GET /api/admin/db/tables` · `GET /api/admin/db/tables/:name` · `POST /api/admin/db/query` · `POST /api/admin/db/ask` |
| Cloudinary   | Free-tier usage + asset list + bulk delete         | `GET /api/admin/cloudinary/usage` · `GET /api/admin/cloudinary/resources` · `POST /api/admin/cloudinary/delete` |

### Settings → Database (Database Explorer)

Component: `src/components/settings/DbExplorer.jsx`.

- **List tables** — `GET /api/admin/db/tables?refresh=1` returns `{ tables: [{ name, rowCount, columns: [{ name, type, notnull, pk }] }] }`.
- **Browse rows** — `GET /api/admin/db/tables/:name?limit=&offset=&orderBy=&order=` returns `{ name, total, rows, columns, limit, offset }`. `:name` is whitelisted against the live table list; `orderBy` is whitelisted against actual columns; `limit` is capped at 500.
- **Run SQL** — `POST /api/admin/db/query` with `{ sql }` returns `{ rows, columns, rowCount, durationMs, sql }`. The SQL passes through a regex deny-list + a `readonly: true` SQLite connection. Rejections come back as `400` with `{ message, data: { sql } }`.
- **Ask in English** — `POST /api/admin/db/ask` with `{ question }` returns `{ question, generatedSql, explanation, chart, rows, columns, rowCount, model, durationMs }`. Groq (`llama-3.3-70b-versatile`) sees the live schema + 3 sample rows per table, returns `{sql, explanation, chart}`, which is then run through the same safety wrapper. `chart` is either `null` or `{ type: 'bar'|'line'|'pie'|'area'|'scatter', xKey, yKeys: [], title }` and the FE renders it with Recharts (`ResultViewer` toggles `Chart | Table`); otherwise it falls back to the table view. If Groq's SQL is rejected, the response is `400` with `{ message, data: { generatedSql, reason, explanation, chart, model } }` so the UI can show what the model tried.

All four endpoints sit behind `requireVault` in `routes/admin/index.js`.

## Chess (`/chess`)

Single page, four URL-stateful tabs (`?tab=play|puzzles|online|saved`), ten board modes (`?variant=`), one shared `<ChessBoard>`.

| Tab        | Component                                | Key endpoints |
|------------|------------------------------------------|---------------|
| Play       | `pages/Chess.jsx`                        | `POST /api/chess/best-move` · `POST /api/chess/analyze` · `POST /api/chess/play` · local stockfish.js (no BE for 960 / KoTH / 3-Check moves) |
| Puzzles    | `components/chess/PuzzleTrainer.jsx`     | `GET /api/chess/puzzles/users` · `POST /api/chess/puzzles/users` · `DELETE /api/chess/puzzles/users/:id` (vault) · `GET /api/chess/puzzles/next` · `POST /api/chess/puzzles/attempt` · `GET /api/chess/puzzles/stats` · `GET /api/chess/puzzles/stats/global` |
| Online     | `pages/ChessLive.jsx` (under Online tab) | `POST /api/chess/matches` · `POST /:id/join` · `GET /:id` · `POST /:id/move` · `POST /:id/resign` · `POST /:id/takeback/{request,accept,decline}` · `GET /api/chess/matches/lobby/live` |
| Saved      | inline section in `Chess.jsx`            | `POST /api/chess/games` · `GET /api/chess/games` · `GET /api/chess/games/:id` · `PATCH /api/chess/games/:id` · `DELETE /api/chess/games/:id` (vault) · `POST /api/chess/games/bulk` · `GET /api/chess/collections` |

Below the board (Play tab only): live opening detection + Opening Explorer.

| Section            | Component                                 | Endpoints |
|--------------------|-------------------------------------------|-----------|
| Opening name chip  | inline `OpeningHeading` in `Chess.jsx`    | `POST /api/chess/openings/identify` (debounced 300ms per move) · `GET /api/chess/openings/:slug` (lazy on expand) |
| Opening Explorer   | `components/chess/OpeningExplorer.jsx`    | `GET /api/chess/openings` (paginated) · `GET /api/chess/openings/:slug` · `GET /api/chess/openings/explorer` (BE proxies to Lichess masters DB) |

### Modes (one chip row, one board)

| Mode         | Rules engine | Stockfish | Notes |
|--------------|-------------|-----------|-------|
| Standard     | chess.js    | yes       | Eval bar, opening detection |
| Chess960     | chessops    | yes (`UCI_Chess960=true`) | Back rank reshuffled each game |
| KoTH         | chessops    | yes       | King-to-center wins (FE-enforced) |
| Three-Check  | chessops    | yes       | 3 checks wins (FE-enforced) |
| Atomic       | chessops    | no        | Captures explode 3×3 |
| Antichess    | chessops    | no        | Captures mandatory |
| Horde        | chessops    | no        | Asymmetric pawn army |
| Crazyhouse   | chessops    | no        | Drop captured pieces |
| Racing Kings | chessops    | no        | Race kings to rank 8 |
| Offline 2P   | chess.js    | no        | Pass-and-play |

### Take back

Local roll-back button. Calls `.undo()` on the active rules engine — both `chess.js` and the chessops adapter (`src/lib/variantGame.js`) expose it. The chessops adapter implements it via a `posSnapshots` stack (clones position before each `.play()`). In engine-play mode, take back rolls TWO plies so the user lands on their own turn.

Separate from the multiplayer **takeback request** flow on the Online tab — that one needs opponent approval and lives in `chess_matches.takebackRequest` on the BE.
