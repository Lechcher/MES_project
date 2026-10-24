# Proposal

## Why

Every MES screen fetches its data once when it mounts, and nothing re-fetches
afterwards. When data changes on the backend — someone accepts a ticket, a leave
request is approved, or the audit log gains an entry — an open page keeps showing
the old data until the user reloads it by hand. Since Jobs, Planning, and
Performance are coordination tools where colleagues act on each other's tickets
and requests in the same working day, users routinely make decisions off stale
screens, and every "why don't I see it?" costs a manual refresh.

Next.js Partial Prerendering is already enabled in this project and answers a
different half of the problem: it makes the first paint instant and every
navigation/refresh fresh. But PPR cannot push changes into a page that is
already open — the missing piece is a live channel from the backend to the open
client, plus revalidation of the queries behind the visible views.

## What Changes

- Add an authenticated Server-Sent Events (SSE) endpoint on the backend that
  streams a change event whenever committed data changes, naming the affected
  domain area (tickets, leave, performance, users/settings, audit).
- Emit those events from the GraphQL mutation layer, so every successful
  mutation through the existing contract produces an event; no new write path.
- Add a same-origin frontend route handler that proxies the backend stream,
  attaching the session cookie exactly like the existing `/api/mes/graphql`
  proxy — the session token never reaches the browser.
- Add a shared live-data layer in the frontend that holds one SSE connection
  per tab and, on connect and on each event, invalidates/refetches the GraphQL
  queries behind the open module views — Jobs, Planning, Performance, Audit Log,
  and the Home Page Dashboard — so every screen's content updates in place with
  no manual reload.
- Keep PPR behavior intact: the static shell stays instant, updates land inside
  the dynamic content, and a manual refresh remains a valid fallback.

Explicitly out of scope: bidirectional communication over the channel (writes
stay on the existing GraphQL mutations), per-entity diff payloads (events say
*what changed*; the refetch fetches the current data), offline queue/replay, and
multi-instance fan-out for a scaled-out deployment (the service runs as a single
dev server today).

## Capabilities

### New Capabilities

- `frontend/realtime-updates`: How the frontend keeps open views in sync with
  the backend — the authenticated live change channel, its connect/reconnect
  lifecycle, and per-event invalidation/refetch that makes displayed data
  reflect committed backend changes without a manual reload. Owns the
  connection-status surface users see when the channel drops.

### Modified Capabilities

None. Existing module specs (`frontend/jobs`, `frontend/planning`,
`frontend/performance`, `frontend/settings`, `frontend/mock-data`) describe what
each screen shows, not how it stays fresh; their requirements are unchanged.
`frontend/app-shell` covers sign-in, navigation, layout, and headers — the
live-connection status this change introduces is new behavior owned by the new
capability, not a change to an app-shell requirement.

## Impact

- **Backend code**: new `backend/src/events/` module (in-process event bus and
  the SSE handler); `backend/src/index.ts` registers `GET /api/v1/events` with
  the same bearer-token check as `/api/v1/exports/:id`; the GraphQL resolvers
  under `backend/src/graphql/resolvers/` publish events after successful
  mutations; the versioned GraphQL contract in
  `API_CONTACT_SPECIFICATION.md` is untouched.
- **Frontend code**: new route handler `frontend/src/app/api/mes/events/route.ts`
  (mirrors the `/api/mes/graphql` proxy, streaming the upstream response); new
  live-data layer under `frontend/src/lib/mes/` (connection provider,
  event-to-query mapping, refetch triggers); the connection provider mounts in
  the authenticated app layout so every module view is covered; the
  connection-status indicator is rendered in the app shell.
- **Configuration**: the backend events endpoint is reached through the existing
  `MES_API_URL`; no new environment variables are expected, but any that appear
  are documented in `backend/.env.example`.
- **Dependencies**: none — SSE uses the standard `EventSource`/`ReadableStream`
  web APIs on both sides (per `AGENTS.md` constraints).
- **Tests**: backend unit tests for the event bus and SSE handler (auth
  rejection, event framing), plus an integration test proving a mutation
  produces an event; frontend tests for the subscription layer (reconnect backoff,
  event-to-query mapping, refetch invocation).
- **Docs**: `docs/DEVELOPMENT.md` gains a section on live mode (how to see it,
  how to tell when the channel is down); the frontend GraphQL client docs note
  that queries may be refetched on server events.
