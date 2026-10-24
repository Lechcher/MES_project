# Design

## Context

Motivation and scope are in `proposal.md`; the behavior contract is the
`frontend/realtime-updates` spec delta. This document records only the technical
choices that shape implementation.

Current state, as found in the code:

- **Frontend data access is client-side.** Every module view is a client
  component; data flows through `graphqlRequest` (`frontend/src/lib/mes/client.ts`)
  to the same-origin `POST /api/mes/graphql` route handler, which attaches the
  `Authorization: Bearer <token>` from the httpOnly `mes_session`
  (`frontend/src/lib/mes/server.ts`). Views read through `useQuery(query,
  variables)` — a nonce-driven effect around `graphqlRequest` exposing
  `{ data, loading, error, refetch }` — and write through `useMutation`
  (`frontend/src/lib/mes/session.tsx`). `MesSessionProvider` supplies the viewer.
- **PPR is already on.** `next.config.ts` sets `cacheComponents: true` with
  `partialPrefetching: true`, so the static shell + streamed dynamic content
  model is the default App Router behavior. Pages carry `export const instant =
  false` because their content is client-resolved.
- **Backend is a single Elysia service** (`backend/src/index.ts`): `GET /health`,
  `POST /api/v1/graphql`, `GET /api/v1/exports/:id` (bearer-token check via
  `resolveSession`), `ALL /api/auth/*`. The GraphQL layer (`backend/src/graphql/`)
  parses the operation, resolves the viewer, and delegates to thin resolvers
  over domain services under `backend/src/domain/`.

Constraints: no new runtime dependencies (`AGENTS.md`); Biome for
format/lint; `bun test` in both packages; the session token must never reach the
browser.

## Goals / Non-Goals

**Goals:**

- One streaming transport (SSE) from the backend to open tabs, authenticated
  through the existing session model, with automatic reconnect and catch-up.
- Every successful shared-data mutation publishes exactly one area-named event,
  emitted from one central hook rather than sprinkled through ~30 resolvers.
- Every module view opts into live refresh with a one-line change to its existing
  `useQuery` call — no new data-fetching library, no rewrite of views.
- PPR behavior unchanged: shell stays instant, updates land in dynamic content.

**Non-Goals:**

- Bidirectional writes over the stream (mutations stay on GraphQL).
- Record-level payloads in events; offline replay; multi-instance fan-out.
- Server-component data fetching or cache-tag revalidation paths (all views are
  client-fetched today; changing that is a separate concern).

## Decisions

### 1. SSE over WebSocket / polling

**SSE** (`EventSource` in the browser, a `ReadableStream` response on the
backend). It is one-way server→client, which is exactly this feature's shape;
it rides plain HTTP with automatic reconnect and last-event-id semantics built
in; and it needs no new dependency on either side.
*Alternatives considered:* WebSocket — full duplex we don't need, plus a
dependency and more protocol surface; plain polling — constant request load for
near-real-time, and it can't distinguish "no change" from "server down" cheaply.
Polling is retained only as the human's manual refresh (already built into each
view's `refetch`).

### 2. Backend: a central `executeGraphQL` hook, not per-resolver publish calls

A mutation publishes its event from one place: after GraphQL execution in
`backend/src/graphql/index.ts`, when the parsed operation is a `mutation` and the
result carries no errors, collect the root fields actually selected, map each
through one declarative field→area table (`createTask` → `tickets`,
`approveLeaveRequest` → `leave`, …), and publish the unique set to the event bus.
*Why:* the resolvers are deliberately thin and the real work happens in
`backend/src/domain/*`; editing ~30 functions (resolvers *and* domain services)
is a wide, drift-prone diff. One hook plus one table keeps the mapping auditable
in a single file.
*Alternative considered:* publish inside each mutating domain service — precise
but touches every service and every future mutation must remember the call.
*Drift guard:* a unit test asserts **every mutation root field in
`backend/src/graphql/schema.ts` has an entry in the mapping table** (auth-only
mutations like `login`/`logout`/`changePassword` map to no area and are listed as
explicitly inert, so new fields can't quietly slip through).

### 3. Backend: `backend/src/events/` — in-process bus + streaming handler

- `event-bus.ts`: a tiny typed pub/sub (`publish(area)`, `subscribe(listener)`),
  owned by the service instance created in `createService`, and passed to
  `executeGraphQL` through the same dependency object that already carries `db`,
  `config`, `request`, `auth` — so the GraphQL layer and the stream handler share
  one bus.
- `stream.ts`: `GET /api/v1/events` handler on the Elysia app, registered next to
  `/api/v1/exports/:id` and reusing its bearer-token check (`bearerTokenFrom` +
  `resolveSession`, 401 on failure). It returns a `Response` wrapping a
  `ReadableStream` that writes SSE frames: `event: connected` once on open,
  `event: change` + `data: {"area":"<area>"}` per published event, and
  `: heartbeat` comment lines to keep idle connections and intermediaries alive.
  On client abort it unsubscribes and closes the stream. A server-side maximum
  stream duration bounds a stuck connection; the client treats any close as a
  reconnect-with-catch-up (see decision 5), so the cap costs nothing.
- Frame format is deliberately boring (`text/event-stream`,
  `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`,
  `Connection: keep-alive`).

### 4. Frontend: same-origin streaming proxy at `/api/mes/events`

`GET frontend/src/app/api/mes/events/route.ts` mirrors the GraphQL proxy: read
the `mes_session` cookie, attach the bearer token, `fetch` the backend stream,
and return `new Response(upstream.body, …)` with the SSE headers above.
*Why:* `EventSource` cannot set request headers, so bearer auth through the
browser is impossible without this hop — the same reason `/api/mes/graphql`
exists. The token stays server-side; the browser only ever talks same-origin.
The handler streams `upstream.body` verbatim (never buffers into a string) and
relays a 401 when the token is invalid.

### 5. Frontend: `useQuery` gains a `liveArea` option; provider owns one
   connection per tab

- `frontend/src/lib/mes/live.tsx`: `MesLiveProvider` — mounted inside the
  authenticated app layout next to `MesSessionProvider`. When a viewer exists it
  opens **one** `EventSource("/api/mes/events")`; on sign-out or unmount it
  closes it. It exposes status (`live | connecting | offline`) plus a
  subscription API (`subscribeArea(area, onEvent)`, `onConnected(cb)`).
- `useQuery(query, variables, { liveArea })`: when `liveArea` is set, the hook
  subscribes on mount, unsubscribes on cleanup, and on a matching event — or on
  any (re)connect — bumps its existing nonce, i.e. calls the `refetch` path it
  already has. Nothing else about loading/error/abort semantics changes.
- *Why this shape:* it is a per-view opt-in of one option, reuses the existing
  effect and abort machinery, needs no library, and covers Jobs, Planning,
  Performance, Audit Log, Settings, and any future view uniformly.
- *Alternatives considered:* `router.refresh()` on events — rejected, because
  every view is a client component fetching client-side data; the RSC payload
  `router.refresh()` invalidates is not what these views render. A data-fetching
  library (e.g. TanStack Query) — rejected: new dependency and a rewrite of
  every view's data access.
- **Catch-up:** frames missed while the socket is down cannot be replayed, so
  every subscribed query refetches once on each successful (re)connect. This is
  what makes reconnect safe, and it is a spec requirement.
- **Status surface:** the provider's status renders as a small indicator in the
  app shell (lucide icon + label, IBM Carbon styling per `DESIGN.md`), showing
  live/connecting/offline. Manual refresh in each view remains the fallback and
  is explicitly part of the spec.

### 6. Area mapping shared by both sides

Areas are the spec's vocabulary — `tickets`, `leave`, `performance`, `users`,
`audit` — so the backend field→area table and the frontend `liveArea` values are
the same five strings. The dashboard currently renders no backend-queried data
(only session-derived cards), so it subscribes to nothing today and opts in per
query automatically if it gains data.

## Risks / Trade-offs

- **Streaming through a Next.js route handler gets buffered** (a dev server or
  intermediary could hold frames) → Mitigation: stream `upstream.body`
  verbatim with `no-transform`/`no-cache`/`X-Accel-Buffering: no` headers, and
  an end-to-end test that consumes frames from `/api/mes/events` while a mutation
  runs, so buffering fails the suite rather than the user.
- **Expired session turns into a reconnect loop** (`EventSource` can't read the
  401 status and retries on its own) → Mitigation: the provider stops opening
  when `viewer` is `null`; repeated immediate failures stop the auto-retry, show
  the offline indicator, and resume on the next viewer change or window focus.
  The existing per-view 401 handling still routes the user to sign-in.
  Accepted trade-off: while a stream is 401ing, the user may see offline status
  for a few seconds before being signed out — manual refresh still works.
- **Missed events while disconnected** → catch-up refetch on reconnect
  (decision 5); frames are invalidation signals, so "refetch everything visible"
  is always correct.
- **Refetch stampede** (every open view refetches on each event) → accepted at
  prototype scale: human-paced mutations, each view refetches only on its own
  area, and the connection is idle between events.
- **Backend restart or laptop sleep drops all streams** → automatic reconnect +
  catch-up; no data loss beyond normal request-time staleness.
- **Single backend instance assumed** → events cross one process boundary only;
  scaled-out fan-out is a declared non-goal.
- **PPR regression** (new dynamic bits leaking into the shell) → the live layer
  is entirely client-side and inside dynamic content; `next build` guards the
  shell, and the tasks include a build + smoke check on the pages touched.

## Migration Plan

Additive and revertible: new backend routes/module, new frontend route +
provider, opt-in per view. No database or schema changes, no GraphQL contract
changes (`API_CONTACT_SPECIFICATION.md` is untouched), no new environment
variables. Rollout: ship backend + frontend together (a frontend against a
backend without `/api/v1/events` simply shows offline status and keeps manual
refresh). Rollback: revert the change; views fall back to manual refresh.

## Open Questions

- Exact heartbeat interval and maximum stream duration (candidates: ~30s and
  ~30min) — tuning knobs that don't change the design or the task breakdown.
