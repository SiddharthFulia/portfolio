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
