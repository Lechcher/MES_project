# Tasks

## 1. Reproduce and localize the failure

- [x] 1.1 With both dev servers running (`cd backend && bun run dev`, `cd frontend && bun run dev`), reproduce the reported error and time it: open a signed-in session, then `curl -N` the stream twice — once through the proxy (`http://localhost:3000/api/mes/events` with the session cookie) and once directly on the backend (`http://localhost:3001/api/v1/events` with a bearer token) — logging a timestamp per received frame with `--max-time 180`. Record each connection's lifetime, the interval between frames, which side closes first, and whether the frontend dev-server log prints `failed to pipe response` at the same moment. Verify: the captured timings and console lines are pasted into this task's completion note.

  **Findings:** reproduced repeatedly against the live dev servers. Every
  connection lived 50–88s and then closed cleanly (curl exit 0). Timings
  (`15:14:16 start → heartbeats :46, 02:15:16 → end 02:15:44`; foreground
  re-run identical) show the close lands just under the third heartbeat — the
  stream is never killed by the 30-minute cap. The frontend log prints
  `failed to pipe response` (cause `TypeError: terminated` →
  `UND_ERR_SOCKET: other side closed`) for each connection, before its
  completion line. Crucially the **direct-to-backend** stream died at the same
  second as the proxied one (backend process confirmed never restarted), so the
  closing party is the backend server, not Next or the browser. Isolated with a
  minimal Bun SSE server: Elysia's Bun adapter defaults `idleTimeout: 30`
  (`node_modules/elysia/dist/adapter/bun/index.js`), which closes a connection
  30s after the last write — the 30s heartbeat races it and loses. Control run
  with `idleTimeout: 0` survived the full 100s; `idleTimeout: 255` likewise.
  Next's `pipeToNodeResponse` then rethrows the non-abort-class socket death as
  the reported error, while the browser's EventSource reconnects silently —
  which is why live updates appeared to work.

## 2. Route: own the stream copy

- [x] 2.1 Extract the copy loop into a co-located module (e.g. `frontend/src/app/api/mes/events/copy-stream.ts`) exporting a function that takes the upstream `ReadableStream` and an `AbortSignal` and returns a `ReadableStream`: chunks are forwarded as they arrive, an upstream read error of any class ends the returned stream cleanly (no throw), and `cancel()` aborts the signal and cancels the upstream reader. Add `bun:test` unit tests with fake readables covering frames pass through, upstream rejection ends without throwing, and cancel tears the upstream down. Verify: `cd frontend && bun test src/app/api/mes/events` passes.
- [x] 2.2 Rewrite the route's success path in `frontend/src/app/api/mes/events/route.ts` to return the copy-stream's response (same `STREAM_HEADERS`), drive the outbound `fetch` with an internal `AbortController` wired to both `request.signal` and the stream's `cancel`, and keep the existing 401 relay and 502 establishment-failure answers byte-identical in behavior. Verify: `cd frontend && bunx tsc --noEmit` exits 0 and the copy-stream tests still pass.

## 3. Keep-alive interval

- [x] 3.1 From task 1.1's timings, decide the heartbeat: if any hop closes an idle connection faster than two heartbeats could arrive, lower `HEARTBEAT_INTERVAL_MS` in `backend/src/events/stream.ts` to fit the shortest observed window (leave it unchanged and record the evidence if none was observed); extend `backend/src/events/stream.test.ts` to assert heartbeat frames are comment lines that name no event. Verify: `cd backend && bun test src/events` passes and the decision is recorded in this task's completion note.

  **Decision:** no hop on the path closes an idle connection faster than two
  heartbeats once the server's own timeout is fixed, so `HEARTBEAT_INTERVAL_MS`
  stays at 30s. The only hop that ever closed early was the backend itself:
  Elysia's Bun-adapter default `idleTimeout: 30` equaled the heartbeat and lost
  the race (isolated runs: 30 → closed 30s after each heartbeat; 0 and 255 →
  stream alive past 100s). Rather than shrink every heartbeat, the server's
  idle timeout is raised to 255s (`SERVER_IDLE_TIMEOUT_SECONDS` in
  `backend/src/events/stream.ts`, wired into `app.listen` in
  `backend/src/index.ts`), giving an 8.5x margin. Test additions: heartbeat
  frames assert they name no `event:`, and an invariant test asserts
  `SERVER_IDLE_TIMEOUT_SECONDS * 1000 > HEARTBEAT_INTERVAL_MS * 2` so the two
  knobs cannot drift back together. `bun test src/events`: 14/14.

## 4. Integration verification

- [x] 4.1 Run the full verification set — `cd backend && bun test`, `cd frontend && bun test src/`, `cd frontend && bunx tsc --noEmit`, and `bunx biome check frontend backend` — and confirm every suite passes with no new warnings. Verify: command outputs show all suites green.
- [x] 4.2 Verify end-to-end against the dev servers: sign in, keep a module view open, and watch the frontend dev-server log through a deliberately long idle window (no mutations, past the previous ~60s failure point), a page navigation, and a browser tab close — confirming no `failed to pipe response` is printed — then trigger one mutation from a second signed-in session and confirm the open view still refreshes live. Verify: the captured console output shows a clean lifecycle and the live refresh is observed.

  **Results** (frontend dev server restarted with a capturable log for a clean
  post-fix window; backend running with the new idle timeout):
  - **Long idle window:** a stream through the proxy lived the full 150s
    test window — `connected` at t=0, heartbeats at 30/60/90/120s, clean end at
    the 150s limit. Before the fix every connection died at 50–88s.
  - **Live refresh:** `createUser` (0.12s) and `updateUser` mutations from a
    second session each delivered `event: change / data: {"area":"users"}` to
    the open stream within ~1s.
  - **Browser goes away:** curl killed 6s into a stream → request ended in
    5.9s, `0` occurrences of `failed to pipe response`.
  - **Upstream dies mid-stream:** backend restarted 5s into a stream → the
    stream ended in 5.0s, `0` occurrences of the error.
  - The freshly restarted frontend log shows **zero** `failed to pipe response`
  lines overall (the historical log recorded one per connection).
  - Probe users created by the verification were removed; the dev database is
  back to the five seeded accounts with no residual audit references.

## Workflow follow-up

- Review the completed change, then archive it via `/opsx-archive`.
- Commit the change on `main` per the repository's git guidelines (conventional commit message, AI trailer).
