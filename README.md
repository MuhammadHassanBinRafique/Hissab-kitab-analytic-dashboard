# Hisab-Kitab Insights

A **read-only** dashboard for the Hisab-Kitab portal. Users sign in with their existing Hisab-Kitab
email and password and see only their own live data. Nothing in the portal is changed.

```
Browser (apps/web) ──► apps/api ──► Supabase Auth   (is this email/password right?)
                              └───► Postgres as analytics_ro (read-only, own rows only)
```

## Commands
| Command | What it does |
|---|---|
| `npm start` | Runs everything locally: API on :8787 and the web app on http://localhost:3000 |
| `npm run start:api` | Runs only the backend |
| `npm test` | Typecheck + API tests (real Postgres in memory) + web tests |

## Setup (once)
1. Supabase SQL editor: run `db/analytics_ro.sql`, then `ALTER ROLE analytics_ro PASSWORD '<long random password>';`
2. `npm install`
3. Create `apps/api/.env` from `apps/api/.env.example` and fill every line (explained in that file).
4. `npm start`, open http://localhost:3000, sign in with a real Hisab-Kitab account.

## Why it is safe
- The database enforces it: role `analytics_ro` can only `SELECT`, only from 7 tables, only the signed-in
  user's rows. Every request runs in a READ ONLY transaction. `users` (emails) is not readable.
- The user id comes only from the signed, httpOnly session cookie, never from the URL, body or headers.
- Passwords are checked by Supabase Auth and never stored. Sessions expire after 15 idle minutes (8 h max).
- Login is rate limited; POSTs from other websites are refused.

## Keeping in sync with the portal
`apps/api/test/fixtures/portal-schema.sql` is a copy of the portal's migrations and all SQL is tested against
it. When the portal's schema changes, refresh it (command in the file header) and run `npm test`.

## Structure
```
db/analytics_ro.sql        read-only role + row policies
packages/contracts/        shared types and validation
apps/api/src/core/         config, db, session, auth, middleware
apps/api/src/modules/      overview, transactions, accounts, savings, recurring, activity-log, auth
apps/web/src/              pages/, components/, services/api.js (the only file that calls the server)
```
Add a feature = a new folder in `apps/api/src/modules/` + one line in `apps/api/src/app.ts`.

## Production
Serve the built web app (`npm run build -w @insights/web`) and `/api` from the same host: cookies are
`SameSite=Strict`. Set `NODE_ENV=production` so cookies are `Secure`.
