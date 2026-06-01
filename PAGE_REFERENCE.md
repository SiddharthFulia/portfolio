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
- **Ask in English** — `POST /api/admin/db/ask` with `{ question }` returns `{ question, generatedSql, explanation, rows, columns, rowCount, model, durationMs }`. Groq (`llama-3.3-70b-versatile`) sees the live schema + 3 sample rows per table, returns `{sql, explanation}`, which is then run through the same safety wrapper. If Groq's SQL is rejected, the response is `400` with `{ message, data: { generatedSql, reason, explanation, model } }` so the UI can show what the model tried.

All four endpoints sit behind `requireVault` in `routes/admin/index.js`.
