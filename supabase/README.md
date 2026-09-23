# Database

Core tables: `documents` (pgvector, 3072-dim `gemini-embedding-001`), `chat_sessions`,
`usage_logs`, `bookmarks`, `message_feedback`, `user_niks`.

| Folder | Contents | Run it? |
| --- | --- | --- |
| `migrations/` | Dated schema changes — the source of truth | Yes, in filename order |
| `migrations/rollback/` | Reverts for specific migrations | Only to undo that migration |
| `sql/` | Older changes applied by hand before migrations existed | Already applied in production |
| `snapshots/` | Dump of production RPC functions | Only to restore missing functions |
| `tests/` | Read-only checks against the database | Yes, `SELECT` only |

## Setting up from scratch

1. `create extension if not exists vector;` and `pg_trgm`.
2. Run `migrations/*.sql` in filename order, then `sql/*.sql`.
3. Run `snapshots/functions_backup_prod.sql` for the search RPCs (`match_documents*`, `search_parts_*`).
4. Load `documents`; embeddings must be `gemini-embedding-001`, 3072 dims.

## Rules

- Every schema change is one new file in `migrations/`, named `YYYYMMDD_description.sql`,
  written to be safe to re-run (`if not exists`, `create or replace`).
- If the backend writes a new column, run the migration **before** deploying the backend:
  PostgREST rejects unknown columns.
