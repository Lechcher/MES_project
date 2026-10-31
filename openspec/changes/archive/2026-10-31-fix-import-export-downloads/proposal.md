# Proposal

## Why

Every print/export action and the task-import template download currently
fails in the browser with Next.js' "404 This page could not be found" page.
The generating mutations succeed and the artifact is written server-side, but
`ExportResult.url` is `/api/v1/exports/<id>` — the backend's route path — and
the frontend opens it same-origin (frontend origin), where no such route
exists. Reports are unusable end-to-end: generation works, delivery does not.

## What Changes

- Deliver export artifacts through an authenticated **same-origin** download
  path served by a Next.js proxy route (`/api/mes/exports/[id]`), mirroring the
  existing, working `/api/mes/files/*` attachment proxy.
- Change the backend `ExportResult.url` to the frontend-facing proxy path so
  the URL the browser opens always resolves (single contract; the backend's
  own `/api/v1/exports/:id` route stays as the upstream target).
- Keep the backend download route as-is (Bearer-authenticated); the proxy
  attaches the httpOnly session token exactly as the GraphQL and files
  proxies do. Direct backend-URL downloads remain unsupported by design.
- Cover with tests: the proxy route relays status/headers/body with the session
  token; an unauthenticated download is rejected; the contract URL matches the
  proxy path.

## Capabilities

### New Capabilities

None. This corrects delivery of an existing capability.

### Modified Capabilities

- `core/report-exports`: add a requirement that generated artifacts
  (exports, prints, and the import template) are downloadable by the
  authorized viewer through a working browser URL, authenticated via the same
  session as the generating operation.

## Impact

- `backend/src/graphql/shapes.ts` — `toExportResult` URL field.
- `frontend/src/app/api/mes/exports/[id]/route.ts` — new proxy route (new file).
- Tests: backend contract test for the URL, frontend route test for the proxy.
- No GraphQL schema change, no migration, no dependency change. The frontend's
  `useServerExport` / `ExportButton` and the import dialog open the URL as they
  already do — the fix is in what the URL points to.
