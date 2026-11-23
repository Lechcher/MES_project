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
| mes-prototype-frontend-staging | staging | `NEXT_PUBLIC_SENTRY_DSN` |
| mes-prototype-frontend-prod | production | `NEXT_PUBLIC_SENTRY_DSN` |
| mes-prototype-backend-dev | development | `SENTRY_DSN` |
| mes-prototype-backend-staging | staging | `SENTRY_DSN` |
| mes-prototype-backend-prod | production | `SENTRY_DSN` |

Naming convention: `mes-prototype-<frontend|backend>-<env>`. One project per
runtime per environment, so a staging defect never floods the production
project's issue stream.

Create each project in the Sentry UI and note the DSN. Add the DSNs to the
relevant `.env` files (never commit real DSNs to version control).

### Environment mapping

`NODE_ENV` selects the environment, and `SENTRY_ENVIRONMENT` overrides it:

| `NODE_ENV` | `SENTRY_ENVIRONMENT` | Project suffix | Traces sampled |
|------------|----------------------|----------------|----------------|
| `development` (or unset) | `development` | `-dev` | 1.0 |
| `production` with `SENTRY_ENVIRONMENT=staging` | `staging` | `-staging` | 0.10 |
| `production` | `production` | `-prod` | 0.01 |

The frontend reads `NEXT_PUBLIC_SENTRY_ENVIRONMENT` in the browser and
`SENTRY_ENVIRONMENT` on the server/edge runtimes; the backend reads
`SENTRY_ENVIRONMENT`. Staging deploys set `NODE_ENV=production` and
`SENTRY_ENVIRONMENT=staging`.

## Configuration

### Frontend

Environment variables (`frontend/.env`):

- `NEXT_PUBLIC_SENTRY_DSN` — Client SDK DSN (browser-safe)
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT` — Environment name
- `SENTRY_DSN` — Server/edge runtime DSN (server-only, defaults to the client
  DSN's project when set to the same value)
- `SENTRY_ENVIRONMENT` — Server/edge environment name (same values as
  `NEXT_PUBLIC_SENTRY_ENVIRONMENT`)
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
- Any field (in `extra`, in the request body, or in event contexts) containing
  `password`, `token`, `secret`, `key`, `credential`, `jwt`, `authorization`,
  `bearer`, `connection_string`, or `database_url` → `[Filtered]`

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