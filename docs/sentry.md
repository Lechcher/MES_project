# Sentry Monitoring

Sentry provides error tracking and performance monitoring for the MES Prototype.
Both the frontend (Next.js) and backend (Bun/Elysia) send events to Sentry.

## Environments

Three environments are configured, each with its own Sentry project:

| Environment | `NODE_ENV` | Sampling Rate | Purpose |
|-------------|------------|---------------|---------|
| Development | `development` | 1.0 (100%) | Developer debugging, all events captured |
| Staging | `staging` | 0.10 (10%) | QA testing, reduced volume |
| Production | `production` | 0.01 (1%) | Production monitoring, errors at 100% |

The environment is determined by `NODE_ENV`, overridable via `SENTRY_ENVIRONMENT`.

## Sentry Projects

| Project | Environment | DSN Variable |
|---------|-------------|--------------|
| mes-prototype-frontend-dev | development | `NEXT_PUBLIC_SENTRY_DSN` |
| mes-prototype-frontend-prod | production | `NEXT_PUBLIC_SENTRY_DSN` |
| mes-prototype-backend-dev | development | `SENTRY_DSN` |
| mes-prototype-backend-prod | production | `SENTRY_DSN` |

Create each project in the Sentry UI and note the DSN. Add the DSNs to the
relevant `.env` files (never commit real DSNs to version control).

## Configuration

### Frontend

Environment variables (`frontend/.env`):

- `NEXT_PUBLIC_SENTRY_DSN` — Client SDK DSN (browser-safe)
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT` — Environment name
- `SENTRY_ORG` — Sentry organization slug (for source map upload)
- `SENTRY_PROJECT` — Sentry project slug (for source map upload)
- `SENTRY_AUTH_TOKEN` — Sentry auth token (for source map upload)

Files:
- `frontend/sentry.client.config.ts` — Browser SDK initialization
- `frontend/sentry.server.config.ts` — Server-side (SSR) SDK initialization
- `frontend/sentry.edge.config.ts` — Edge middleware SDK initialization
- `frontend/next.config.ts` — Wrapped with `withSentryConfig` for source maps

### Backend

Environment variables (`backend/.env`):

- `SENTRY_DSN` — Backend SDK DSN
- `SENTRY_ENVIRONMENT` — Environment name
- `SENTRY_TRACES_SAMPLE_RATE` — Performance sampling rate (0.0–1.0)

Files:
- `backend/src/lib/sentry.ts` — SDK initialization, Elysia hooks, span utility

## Sensitive Data Filtering

Both frontend and backend use a `beforeSend` hook that scrubs the following
before events are sent to Sentry:

- `Authorization` headers → `[Filtered]`
- `Cookie` headers → `[Filtered]`
- Any field containing `password`, `token`, `secret`, `key`, `credential`,
  `connection_string`, or `database_url` → `[Filtered]`

## Alert Rules

Configure these alerts in the Sentry UI:

| Alert | Condition | Notification |
|-------|-----------|--------------|
| Critical error rate | Error rate > 5% over 5 minutes | Email, Slack |
| Performance regression | p95 transaction duration +50% vs baseline | Email, Slack |
| New issue | First occurrence of a new error | Email |

## Source Map Upload (Frontend)

Production builds upload source maps automatically via the Sentry Webpack
plugin (`withSentryConfig` in `next.config.ts`). Required environment variables:

- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`

Create the auth token at https://sentry.io/settings/account/api/auth-tokens/
with `project:write` and `event:read` scopes.

## Troubleshooting

**Events not appearing in Sentry:**
1. Verify the DSN is set in the correct `.env` file
2. Verify `NODE_ENV` matches the expected environment
3. Check that `enabled: !!SENTRY_DSN` evaluates to `true` (DSN is non-empty)
4. Look at browser console / server logs for Sentry initialization errors

**Source maps not uploading:**
1. Verify `SENTRY_AUTH_TOKEN` has `project:write` scope
2. Verify `SENTRY_ORG` and `SENTRY_PROJECT` are correct
3. Check the build output for Sentry Webpack plugin logs