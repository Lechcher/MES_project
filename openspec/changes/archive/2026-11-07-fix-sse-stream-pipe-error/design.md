# Design

## Context

Motivation and the error report are in `proposal.md`; the behavior contract is
the `frontend/realtime-updates` spec delta. Only the implementation state that
shapes the approach is repeated here.

**Current state, verified by reading the code and the vendored Next.js runtime:**

- The proxy route (`frontend/src/app/api/mes/events/route.ts`) returns
  `new Response(upstream.body, …)` — the raw undici body of its `fetch` to
  `GET <MES_API_URL>/api/v1/events` (fetched with `signal: request.signal`,
  `cache: "no-store"`).
- Next.js then pipes that stream to the Node `ServerResponse` itself:
  `pipeToNodeResponse` in `node_modules/next/dist/server/pipe-readable.js` (the
  same logic is vendored in `compiled/next-server/app-route.runtime.prod.js`)
  does `await readable.pipeTo(writer, { signal })` and, in its `catch`,
  swallows only errors whose `name` is `AbortError` or `ResponseAborted`.
  Everything else is rethrown as `Error("failed to pipe response", { cause })`
  and logged by the dev server as the reported `⨯ Error`.
- The reported cause chain — `TypeError: terminated` → `Error [SocketError]:
  other side closed` (`UND_ERR_SOCKET`) — is undici reporting that the *outbound*
  fetch's socket died while its body was being streamed. That error class is
  not an abort error, so Next logs it.
- In the reported log the `⨯ Error` line precedes the
  `GET /api/mes/events 200 in 60s` completion line: the stream lived ~60s
  before something ended it. Which side initiated the close (backend, hop,
  browser, or a `request.signal`/socket teardown race) is not yet pinned down —
  task 1 in `tasks.md` reproduces it with timings before any interval change.

**Backend state:** `backend/src/events/stream.ts` already sends comment-frame
heartbeats every 30s, caps streams at 30 minutes, and tears the subscription
down on abort or reader-cancel. The backend is Elysia on Bun (`app.listen`).
The frontend's `LiveController` (`frontend/src/lib/mes/live.tsx`) already
reconnects and refetches on reconnection.

**Constraints:** no new runtime dependencies; Biome formats/lints; `bun test`
in both packages; the frontend suite is pure-function only — there is no
route-handler test harness (no HTTP test setup, and `next/headers`' `cookies()`
needs a request scope), which is why the copy loop is extracted as a plain
stream-to-stream function (mirroring how `browserEventSource` is injected into
`LiveController` for testability).

## Goals / Non-Goals

**Goals:**

- A mid-stream upstream death ends the viewer's stream cleanly — the operator
  sees no `failed to pipe response` stack (spec: "Disconnects end the stream
  without reporting an error").
- The browser going away deterministically tears the upstream connection down
  within the same tick, no leaked upstream sockets (same spec).
- The stream survives change-free periods on every hop of the dev path, so the
  ~60s drop does not recur (spec: "Keep-alive frames hold the connection open
  through idle gaps").
- Establishment failures (401/502) keep their current error answers.

**Non-Goals:**

- Changing the transport, the GraphQL/auth contracts, event payloads, or the
  reconnect/catch-up contract (covered by existing requirements).
- Masking errors via `onRequestError`/Sentry configuration — the throw itself
  is removed.

## Decisions

### 1. The route owns the stream copy instead of handing Next the raw fetch body

The route builds its own `ReadableStream` (in a small extracted, testable
function) that reads chunks from `upstream.body` and forwards them. On an
upstream read error of any class, the copy loop closes its own stream cleanly;
on `cancel()` or `request.signal` abort it cancels the upstream reader and
aborts the internal fetch. Next then pipes *our* stream, which always ends
cleanly, so no non-abort error ever reaches `pipeToNodeResponse`.

*Alternatives considered:*
- **Catch it in the route handler** — impossible: the failure happens inside
  Next's pipe after the handler returned; the route never sees the rejection.
- **Swallow the read error with a pass-through `TransformStream`** — same
  mechanics, less explicit control over cancel/abort wiring; rejected for
  clarity.
- **Filter the error downstream (`onRequestError`/Sentry ignore rules)** —
  hides the symptom while the throw and the premature close remain; rejected.

### 2. Teardown is wired from both ends with one internal AbortController

An internal `AbortController` is created for the outbound `fetch`. Both
`request.signal`'s abort and the copy stream's `cancel` trigger it, and also
cancel the upstream body reader. This replaces passing `request.signal`
straight into `fetch` as the sole teardown path and removes the race where a
disconnect tears the fetch socket while Next's pipe is mid-`pipeTo`.

*Alternatives considered:* keeping `signal: request.signal` and only adding a
`cancel` handler — leaves the fetch-body-read error class racing Next's pipe,
which is the reported failure; rejected.

### 3. Close the idle gap from our side, not every hop's

The keep-alive interval is verified against the actual path during the
reproduction task. If any hop closes an idle connection faster than the
30s heartbeat, `HEARTBEAT_INTERVAL_MS` is lowered so at least two frames cross
every idle window. Comment frames are invisible to `EventSource` and to the
`LiveController`, so a shorter interval costs nothing observable.

*Alternatives considered:* raising every hop's idle timeout (not under our
control — browser, Next dev server, deployment proxies); extending `EventSource`
retry behavior (already correct). Rejected.

### 4. Tests where the repo already tests behavior

Extracted copy function gets `bun:test` unit tests with fake readables
(frames pass through; upstream rejection ends the stream without throwing;
cancel aborts upstream). Route-level verification stays end-to-end against the
dev servers, exactly as the repo already verifies HTTP routes. Heartbeat
behavior stays covered by `backend/src/events/stream.test.ts`.

## Risks / Trade-offs

- **A genuine mid-stream backend death now ends silently** → an operator could
  miss a broken channel. Mitigation: establishment failures still answer 401/502;
  persistent mid-stream death surfaces through the existing live-status UI
  ("offline", last-known data, manual refresh), and browsers reconnect so the
  channel self-heals.
- **One extra chunk-hop per frame** (our copy loop between undici and Next's
  pipe) → negligible CPU; chunks are forwarded as they arrive, no added
  buffering.
- **The ~60s close may have a cause outside this code** (a Next dev-server
  quirk) → task 1's reproduction pins it; if nothing on our side closes early,
  the interval stays and the finding is recorded rather than forcing a change.

## Migration Plan

No schema or API change. Deploy is the route + stream edits plus tests.
Rollback is reverting those files; nothing else moves.

## Open Questions

None that change the specs, approach, or task breakdown — the identity of the
closing side is an investigation step (task 1), not a deferrable unknown.
