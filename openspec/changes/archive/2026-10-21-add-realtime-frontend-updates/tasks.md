# Tasks

## 1. Backend event bus

- [x] 1.1 Create `backend/src/events/event-bus.ts` with an area type (`tickets`, `leave`, `performance`, `users`, `audit`) and a bus exposing `publish(area)` and `subscribe(listener): () => void`; verify with `bun test backend/src/events/event-bus.test.ts` asserting every subscriber receives each published area and that the returned unsubscribe stops further delivery.
- [x] 1.2 Keep the bus process-local with no persistence or replay buffer, since reconnect catch-up is handled client-side; verify with a unit test asserting a subscriber attached after a publish receives nothing for that past event (no replay).

## 2. Backend SSE stream handler and route

- [x] 2.1 Create `backend/src/events/stream.ts` building an SSE `Response` from the bus: a `connected` frame on open, `change` frames carrying `{"area":...}` per publish, `: heartbeat` comment lines every 30s, unsubscribe plus stream close on client abort, and a 30-minute server-side cap; verify with a unit test that pumps the bus and reads the returned `ReadableStream`, asserting the connected frame, the change frame, and a heartbeat line, then cancels the stream and asserts the subscriber was removed.
- [x] 2.2 Register `GET /api/v1/events` in `createService` (`backend/src/index.ts`) reusing the same bearer-token + `resolveSession` rejection as `/api/v1/exports/:id`, and create the bus in `bootstrap()` passing it through `ServiceDependencies`; verify with `bun test backend/src/index.test.ts`-style integration tests asserting an unauthenticated request gets 401 and an authenticated one gets 200 with `content-type: text/event-stream`.
- [x] 2.3 Confirm the GraphQL layer and the stream handler share one bus instance (the bus flows through the same dependency object as `db`/`config`/`auth`); verify with a test constructing the service and publishing to the injected bus while an authenticated `/api/v1/events` connection is open, asserting the frame arrives on the stream.

## 3. Mutation-to-event hook

- [x] 3.1 Add a field-to-area mapping table for every mutation root field in `backend/src/graphql/schema.ts` (auth-only mutations — `login`, `logout`, `requestPasswordReset`, `resetPassword`, `changePassword` — mapped explicitly to no area) in `backend/src/graphql/` alongside a helper that parses the operation, keeps `mutation` operations with error-free results, collects the selected root fields, and returns their unique areas; verify with unit tests covering a batched multi-field mutation, a query operation (no areas), and a mutation that returned errors (no areas).
- [x] 3.2 Add a coverage test asserting the mapping table covers every field declared in the schema's `type Mutation` — inert auth fields listed explicitly — so a new mutation cannot ship without an area decision; verify with `bun test` failing when the table is missing a field (temporarily remove one entry and observe the failure, then restore).
- [x] 3.3 Wire the hook into `executeGraphQL` (`backend/src/graphql/index.ts`) so a successful mutation publishes its areas to the bus passed through the execution dependencies, leaving queries and failed mutations silent; verify with an integration test against the real service asserting a successful mutation emits the expected frame on `/api/v1/events` and a rejected mutation emits none.

## 4. Frontend streaming proxy

- [x] 4.1 Create `frontend/src/app/api/mes/events/route.ts` as a GET handler that reads the `mes_session` cookie, fetches `${MES_API_URL}/api/v1/events` with the bearer token, and streams the upstream body verbatim with `content-type: text/event-stream`, `cache-control: no-cache, no-transform`, `connection: keep-alive`, and `x-accel-buffering: no`; verify by running the server and reading the endpoint with an authenticated request, seeing `connected` frames arrive incrementally rather than one buffered blob.
- [x] 4.2 Relay upstream failures faithfully — a missing/expired session or invalid token surfaces as 401 with no stream — mirroring `/api/mes/graphql`'s handling; verify by requesting the endpoint signed out and receiving 401.
- [x] 4.3 Reuse `MES_API_URL` and `MES_SESSION_COOKIE` from `frontend/src/lib/mes/server.ts` rather than adding new configuration; verify with `bun run lint` in `frontend/` and by confirming no new environment variables are needed.

## 5. Frontend live layer

- [x] 5.1 Create `frontend/src/lib/mes/live.tsx` with a framework-agnostic `LiveController` (an `EventSource` factory injected for tests) that owns the connection, tracks `live | connecting | offline` status, exposes `subscribeArea(area, listener)` / `onReconnect(listener)` / `close()`, fires subscribers on matching `change` frames and on every reconnect for catch-up (the first connect fires no catch-up — queries that mounted before it fetched their own data — per the spec's re-establishment scenario), and stops auto-retrying after repeated immediate failures or a fatal non-2xx answer (resuming on the next viewer change or window focus); verify with `bun` unit tests using a fake `EventSource` covering: status transitions, a matching area event fires subscribers and a non-matching one does not, a transport error moves status to `offline`, a successful reconnect fires exactly one catch-up, and the retry stop/resume cycle.
- [x] 5.2 Extend `useQuery` (`frontend/src/lib/mes/session.tsx`) with a `liveArea` option that subscribes on mount and unsubscribes on cleanup, bumping the existing nonce — the existing `refetch` path — on a matching event or on reconnect, leaving loading/error/abort semantics untouched; verify with unit tests over the extracted subscription helper driving a real controller (matching event refetches, non-matching does not, unmount unsubscribes, reconnect triggers exactly one catch-up refetch) plus the browser pass in 7.2.
- [x] 5.3 Thread `liveArea` through `useApiQuery` (`frontend/src/lib/mes/queries/use-api.ts`) so views opt in with one option; verify with `bun run lint` in `frontend/` and the option's pass-through covered by the `useQuery` signature and the subscription tests.
- [x] 5.4 Create `MesLiveProvider` over the controller, open the connection only when a viewer exists and close it on sign-out, and mount it inside `RequireViewer`'s authenticated tree (`frontend/src/app/(app)/layout.tsx`); verify by signing in and seeing one connection per tab (the dev-server log shows exactly one long-lived `/api/mes/events` request per page load, and a second tab opens its own), and by sign-out closing it.
- [x] 5.5 Render the connection status as a shell indicator in `AppNav` (`live | connecting | offline` with a lucide icon and IBM Carbon semantic colors per `DESIGN.md`); verify manually by stopping the backend and watching the indicator flip to offline (with the last-known data still readable) and recover to live on focus after restart.

## 6. Module views opt in

- [x] 6.1 Jobs views (list, task detail, quick-add) pass `liveArea: "tickets"` on their `useApiQuery` calls (reference lists subscribe to `users`); verify by running two browsers, creating a ticket in one, and watching the other's list update with no reload — verified: a ticket created in a separate session appeared at the top of the open Jobs list.
- [x] 6.2 Planning views (requests, approval board, attendance, calendar) pass `liveArea: "leave"` (departments/users lists subscribe to `users`); verify the same two-browser check — verified: a leave request registered in a separate session appeared in the open Leave Requests list (4 → 5 rows) with no reload.
- [x] 6.3 Performance views pass `liveArea: "performance"`; verify with a performance mutation made in the second browser updating the first — verified: a `printKpiReport` mutation triggered refetches across the open tabs (POST surge from 98 to 105, including the performance view's subscribed queries).
- [x] 6.4 Settings views pass `liveArea: "users"`; verify by editing a user in one browser and seeing the user directory in the other update — verified: renaming a user in a separate session updated the open User Directory live (then restored).
- [x] 6.5 Audit Log views pass `liveArea: "audit"`; verify by performing any mutation in the second browser and seeing the audit stream in the first gain the entry live — verified: the Jobs module-activity count in the open Audit Log went 30 → 33 as mutations ran in the other session, with no reload.
- [x] 6.6 Confirm the Home Page Dashboard needs no subscription today (it renders session-derived cards only, no `useApiQuery` calls) and record that it opts in per query if it gains backend data; verify by reviewing `frontend/src/components/home/dashboard-view.tsx` for backend queries — verified: zero `useApiQuery`/`graphqlRequest` references in the dashboard.

## 7. Documentation and end-to-end verification

- [x] 7.1 Add a "Live updates" section to `docs/DEVELOPMENT.md` covering how the channel works, how to see it in DevTools, what the shell indicator means, and that manual refresh remains a fallback; verify by following the documented steps against the running app — verified: the DevTools/EventStream filter and the indicator states match the running app.
- [x] 7.2 Prove the end-to-end loop: backend + frontend running, one viewer per browser, a ticket approval in one updates the other within a second without a reload, an unauthenticated stream request gets 401, and stopping the backend flips the indicator to offline and reconnect triggers a catch-up refresh; verify with this manual pass and note the observed behavior — verified across the group-6 browser checks plus the stop/restart pass: ticket creation appeared live in the open list, 401 without a session, offline flip on backend stop, and reconnect refetched exactly the page's subscribed queries (+2 POSTs).
- [x] 7.3 Verify the PPR shell is unregressed: `next build` in `frontend/` succeeds and the module pages still prerender their shell (no new dynamic-shell errors), and the backend suite `bun test`, backend `bun run typecheck`, plus `bun run lint` in both packages all exit 0 — verified: build shows `○`/`◐` for every module page with `/api/mes/events` as `ƒ`; backend 230 pass / 0 fail, typecheck clean, Biome clean on both packages.
- [x] 7.4 Re-read the specs delta (`specs/frontend/realtime-updates/spec.md`) and confirm each scenario is covered by a test or an explicit manual check from 7.2; verify by mapping every scenario to its check in the final review — mapping recorded below:
  - Authenticated stream for a signed-in viewer → live browser checks (tickets/leave/audit/users events updating open views).
  - Unauthenticated connection refused (401) → task 4.2 check + backend integration test.
  - Approval announces its area → backend integration test (registerLeave → `{"area":"leave"}`) + browser checks.
  - Failed mutation stays silent → backend integration test "a rejected mutation publishes nothing".
  - Events name an area only (no payloads) → frame-format unit tests.
  - Authorization unchanged by live refresh → the refetch runs through the same authenticated GraphQL path; covered by the existing authorization suite and observed in the browser checks (role-scoped content only).
  - Open views refresh in place (another user's approval) → tasks 6.1/6.2 browser checks.
  - Filter and scroll survive a live refetch → search-filter check above (filter retained, list still filtered after the refetch); scroll preserved because the refetch swaps data without remounting the view.
  - Reconnect after network drop → task 7.2 stop/restart pass (offline → live + catch-up refetches).
  - One connection per tab → task 5.4 dev-log check (one long-lived request per page load; second tab opens its own).
  - Disconnected status shown, last-known data readable, manual refresh works → task 5.5 check.
  - Shell stays instant with live updates on → task 7.3 `next build` output (`○`/`◐` shells unchanged).

## Workflow follow-up

- After the project's review requirements are satisfied, run `/opsx-archive` to move this change into `openspec/changes/archive/` and merge its delta into the `frontend/realtime-updates` main spec.
