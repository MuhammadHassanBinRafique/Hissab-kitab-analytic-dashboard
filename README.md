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

## Errors
Every error has the same shape: `{ "error": <safe message>, "code": <dedicated code>, "requestId": <id> }`, plus an
`X-Request-Id` header. The message never contains SQL, hostnames, stack traces or library names; the full detail is
written only to the server log, together with the same `requestId` (never the password or cookie).

| Code | Status | When |
|---|---|---|
| `INVALID_REQUEST` | 400 | bad or hostile input (also bad JSON) |
| `INVALID_CREDENTIALS` | 401 | wrong email or password (same message for both) |
| `SESSION_EXPIRED` | 401 | no, expired or forged session |
| `FORBIDDEN_ORIGIN` / `EMAIL_NOT_CONFIRMED` | 403 | request from another site / user never confirmed their email |
| `NOT_FOUND` / `METHOD_NOT_ALLOWED` | 404 / 405 | unknown API path / any write attempt |
| `PAYLOAD_TOO_LARGE` / `TOO_MANY_ATTEMPTS` | 413 / 429 | body over 2 KB / too many sign-ins (`Retry-After` is sent) |
| `AUTH_SERVICE_UNAVAILABLE` / `DATABASE_UNAVAILABLE` | 503 | Supabase Auth or the database cannot answer right now |
| `INTERNAL_ERROR` | 500 | anything unexpected |

Redirects: an unknown browser page goes to the dashboard's front door (302); plain http goes to https (308) in production.

## Security checks (run by `npm test`, `apps/api/test/security.test.ts`)
Endpoint inventory (a new unreviewed route fails the test), every protected route is 401 without a session, every write method
is refused, SQL-injection and junk values in every query parameter, forged tokens (alg none, wrong secret, missing claims),
brute force with a rotating `X-Forwarded-For`, no CORS, hardening headers, production cookie flags (`__Host-`, Secure,
HttpOnly, SameSite=Strict), mandatory Origin and http-to-https in production, and that no error response leaks internals.

## Deploy on Vercel
One Vercel project serves both the web app and the API (same site, so the SameSite=Strict cookie works).
1. Push the repo to GitHub (private).
2. Vercel: Add New Project, import the repo. Framework: **Other**, Root Directory: the repo root. `vercel.json` already sets the install and build commands.
3. Environment Variables (Production):

| Name | Value |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | same as your local `apps/api/.env` |
| `ANALYTICS_DATABASE_URL` | same as local (the `analytics_ro` pooler URL) |
| `SESSION_SECRET` | a NEW random value for production |
| `ALLOWED_ORIGIN` | the site URL, e.g. `https://your-project.vercel.app` (no trailing slash) |
| `API_REGION` | the Vercel region closest to your Supabase region, e.g. `bom1` (Mumbai), `sin1` (Singapore), `fra1`, `iad1` |

4. Deploy, then open `https://your-project.vercel.app/api/health` (should show `{"ok":true}`) and then the site itself.
5. `Content-Security-Policy-Report-Only` is sent for the web app. If the browser console shows no violations on the live site,
   rename that header to `Content-Security-Policy` in `scripts/build-vercel.mjs` to enforce it.

`npm run build:vercel` builds the same output locally (`.vercel/output`). Known limits: the sign-in rate limiter is per server
instance (Supabase Auth also rate limits); use a shared store such as Redis if you scale out.
