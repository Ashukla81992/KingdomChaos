# Deploying Kingdom Chaos (online rooms)

Online play uses **HTTP polling** (no Socket.IO). It runs on Vercel serverless with a Postgres database.

## 1. Neon Postgres

1. Create a free project at [neon.tech](https://neon.tech).
2. Copy the connection string into `DATABASE_URL`.
3. From the repo (Node 22):

```bash
source ~/.nvm/nvm.sh && nvm use 22
export DATABASE_URL='postgresql://…'
npm run db:migrate
```

Migrations live in `db/migrations/` and are applied idempotently via `kc_schema_migrations`.

Running the migration is optional: the server also runs the same idempotent schema (`src/server/schema.ts`) once per instance before its first query, so a fresh Neon database works on the first request. Keep `src/server/schema.ts` in sync when you add a migration.

## 2. Vercel environment

Set these on the Vercel project:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `SESSION_SECRET` | Signs the `kc_session` cookie |
| `CRON_SECRET` | Authorizes `/api/cron/cleanup` |
| `GOOGLE_CLIENT_ID` | Optional: turns on "Continue with Google" |
| `GOOGLE_CLIENT_SECRET` | Optional: the matching OAuth client secret |

### Google sign-in (optional)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), configure the OAuth consent screen (External, app name, support email), then create an **OAuth client ID** of type *Web application*.
2. Add the authorized redirect URI `https://YOUR_DOMAIN/api/auth/google/callback` (for example `https://kingdom-chaos.vercel.app/api/auth/google/callback`).
3. Put the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on Vercel and redeploy. The button appears only when both are set.

A Google user gets an account with a username taken from their first name (a number is added if it is taken). They cannot sign in with a password.

Redeploy after setting secrets.

## 3. Cleanup cron

`vercel.json` schedules **daily** `GET /api/cron/cleanup` (Hobby plan limit). Vercel sends `Authorization: Bearer $CRON_SECRET`.

Expired rooms are also:

- Deleted opportunistically on writes (throttled)
- Rejected with **410** on read when `expires_at` has passed

For more frequent cleanup on the free tier, point an external cron (e.g. [cron-job.org](https://cron-job.org)) at:

`GET https://YOUR_DOMAIN/api/cron/cleanup`  
Header: `Authorization: Bearer CRON_SECRET`

## 4. Expiry rules

- Lobby / in-progress: expire at `activity_at + 2 hours`. Only join, start, or an **accepted** action refresh activity. **GET polling does not extend expiry.**
- Finished or host-ended: read-only results until `ended_at + 24 hours`, then delete.
- Accounts are kept.

## 5. Local development

Without `DATABASE_URL`, the API uses an in-memory store (fine for one process).

```bash
npm run dev          # custom server.ts with /healthz (Playwright uses this)
# or
npx next dev
```

Production local:

```bash
npm run build && npm start
```

## 6. Verification

1. Register / sign in at `/online`.
2. Create a room, open the invite link `/room/CODE` in another browser (or private window), sign in as a second user, join, start.
3. Roll a die, reload, sign in again — the roll and turn are restored.
4. Host **End match** (confirm) → result reason `ended`, winners `[]`.
5. Call cleanup without a secret → 401; with `CRON_SECRET` → `{ ok: true, deleted }`.
