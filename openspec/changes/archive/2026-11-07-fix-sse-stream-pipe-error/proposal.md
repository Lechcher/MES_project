# Proposal

## Why

Running `bun run dev` in `frontend/` prints a red `⨯ Error: failed to pipe
response` (cause chain: `TypeError: terminated` → `Error [SocketError]: other
side closed`, code `UND_ERR_SOCKET`) against `GET /api/mes/events`, the live
change channel's same-origin proxy. Live updates still recover — the browser's
`EventSource` reconnects and the `LiveController` refetches — but the app shell
spams the console with a stack that looks fatal, and the stream is dropping
(observed after ~60s) when it should stay open indefinitely behind heartbeats.
An SSE disconnect is a normal lifecycle event, so neither the noise nor the
premature close is acceptable.

## What Changes

- Make the events proxy own its stream copy: instead of handing the raw
  upstream `fetch` body to Next's response pipe, read the upstream body in a
  guarded loop and translate a mid-stream upstream death into a clean
  end-of-stream — no unhandled "failed to pipe response" error surfaces.
- Tear the upstream connection down promptly when the browser disconnects
  (request abort → cancel the upstream fetch), so no dead upstream connections
  accumulate server-side.
- Find and fix the premature close itself: determine which side terminates the
  stream (~60s in the observed log) and make the keep-alive frames frequent
  enough that no hop on the path (Bun backend, dev server, browser) closes the
  connection for idleness before one arrives. Recovery semantics (reconnect +
  catch-up refetch) are unchanged.
- Add tests for the copy-loop behavior (frames pass through, upstream death
  ends cleanly, cancel/abort tears the upstream down) and verify against the
  running dev servers that a full connect → idle → reconnect cycle logs no
  error.

Out of scope: switching the transport (WebSocket/polling), changing the
GraphQL or auth contracts, the unrelated Sentry/Turbopack dev warning, and the
pre-existing `/settings` instant-navigation dev diagnostic.

## Capabilities

### New Capabilities

None. This fixes existing behavior of the live channel.

### Modified Capabilities

- `frontend/realtime-updates`: add requirements for clean disconnect handling
  (both directions end the stream without reporting an error, and the browser
  going away releases the upstream) and for keep-alive frames that keep the
  connection open across idle gaps longer than any hop's idle timeout. The
  existing reconnect/catch-up, authentication, and area-event requirements are
  unchanged.

## Impact

- `frontend/src/app/api/mes/events/route.ts` — guarded stream copy, abort
  teardown, no dependency changes.
- `backend/src/events/stream.ts` — heartbeat interval (and its constant,
  `HEARTBEAT_INTERVAL_MS`) if the investigation shows it is too slow for a hop
  on the path.
- Tests: new backend/frontend unit tests around the stream copy and heartbeat;
  manual dev-server verification of a quiet console during connect → idle →
  reconnect.
- No API contract change: the endpoint stays same-origin, bearer-authenticated
  behind the session cookie, area-level events only.
