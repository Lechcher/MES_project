# Tasks

## 1. Frontend proxy route (ships first)

- [x] 1.1 Create `frontend/src/app/api/mes/exports/[id]/route.ts` exporting `GET`, mirroring `frontend/src/app/api/mes/files/[...key]/route.ts`: read the session token from `MES_SESSION_COOKIE` via `cookies()`, fetch `${MES_API_URL}/api/v1/exports/<id>` with `Authorization: Bearer <token>`, and relay the upstream status, headers and body verbatim (including 401/404/410). On upstream unreachability return the same `UNAVAILABLE` 502 shape the files route uses.
- [x] 1.2 Test the route (colocate `route.test.ts`; follow `src/app/api/mes/events/copy-stream.test.ts` conventions, stubbing global `fetch` and `next/headers` cookies): relays status/headers/body when the backend answers; attaches the Bearer token from the session cookie; returns 502 with the `UNAVAILABLE` payload when the backend is unreachable; encoded id segment is forwarded unmodified.

## 2. Backend contract URL

- [x] 2.1 Change `toExportResult` in `backend/src/graphql/shapes.ts` so `url` is `/api/mes/exports/<id>` (the frontend proxy path). Add a comment naming the proxy route as the delivery path and why (browser cannot attach the Bearer header to the backend origin).
- [x] 2.2 Extend the backend contract test (`backend/src/graphql/schema.test.ts` or the existing `toExportResult` test location) to assert `url` equals `/api/mes/exports/<artifactId>` — and that the path differs from the backend's own `/api/v1/exports/<id>` route.

## 3. Verification

- [x] 3.1 Run `cd backend && bun test src/graphql` and `cd frontend && bun test src/app/api src/lib` — all green. (Full suites also green: backend 380/0, frontend 302/0; two existing assertions pinning the old `/api/v1/exports` URL were updated as part of the contract change.)
- [x] 3.2 Manual smoke (dev servers on :3000/:3001, seeded DB): trigger any export (e.g. Jobs → export tasks, Planning → attendance export, Performance → audit workbook), the KPI/leave PDF prints, and the Planning schedule import-template download; each opens a new tab that downloads the file with the correct name and bytes instead of the Next.js 404 page; opening the URL in a private/unauthenticated window is rejected.
- [x] 3.3 Confirm no other consumer of `ExportResult.url` breaks: grep the frontend for `/api/v1/exports` and `result.url` usages (import dialog, export action, any direct links) and confirm they all resolve through the proxy path.

## 4. Close out

- [x] 4.1 `openspec validate fix-import-export-downloads --strict` passes.
- [x] 4.2 Mark tasks complete, commit (Conventional Commits, `Co-authored-by: AI Agent <agent@local>` trailer, direct to `main`), and archive with `openspec archive fix-import-export-downloads`.
