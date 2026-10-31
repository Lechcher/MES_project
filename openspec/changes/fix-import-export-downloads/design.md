# Design

## Context

See proposal.md - Why. Delivery mechanics as they exist today:

- `ExportResult.url` (backend `toExportResult`) = `/api/v1/exports/<id>` — the
  backend's own Elysia route path.
- The frontend opens that URL with `window.open(url, "_blank")`
  (`components/shared/export-action.tsx`), which resolves against the
  **frontend** origin (Next.js, :3000). Next has no `/api/v1/*` route → its
  404 page. Even pointed at the backend directly, the backend route requires an
  `Authorization: Bearer` header, which a browser navigation cannot send — so
  the URL is unfixable from the backend origin alone.
- The working precedent is attachments: the backend returns a storage key, the
  frontend maps it to the same-origin proxy `/api/mes/files/<key>`
  (`components/shared/attachment-preview.tsx`), and
  `app/api/mes/files/[...key]/route.ts` relays to
  `<MES_API_URL>/api/v1/files/...` attaching the httpOnly session cookie.
- GraphQL and SSE already use the identical cookie-attaching proxy pattern
  (`app/api/mes/graphql/route.ts`, `app/api/mes/events/route.ts`).

Constraints: single contract surface (no schema change), no new dependency,
session auth must stay httpOnly-cookie based (never exposed to the browser), and
the backend's own route must keep working (it is the upstream and the CORS
entry point).

## Goals / Non-Goals

**Goals:**
- One download path that works for every generated artifact (exports, prints,
  import template) from an authenticated browser session.
- Reuse the established proxy pattern verbatim; no new auth machinery.
- Regression tests at both layers: contract URL shape + proxy relay behavior.

**Non-Goals:**
- No new export/import entity types (tasks/attendance/KPI coverage unchanged).
- No change to generation logic, scoping, formats, or artifact persistence.
- No streaming/range-request support, expiry/cleanup of artifacts, or
  signed-URL capabilities (out of scope for this fix).

## Decisions

**Decision: Same-origin proxy route for download, backend URL points at it.**
Frontend gains `app/api/mes/exports/[id]/route.ts` (dynamic segment, mirroring
the files catch-all proxy: read `MES_SESSION_COOKIE` → fetch
`${MES_API_URL}/api/v1/exports/<id>` with `Authorization: Bearer <token>` →
relay status/headers/body), and backend `toExportResult` changes `url` to
`/api/mes/exports/<id>`.
- Alternative A: backend returns an absolute URL and the frontend opens it
  directly. Rejected: the browser cannot attach the Bearer header, so the
  backend would have to accept cookie/token query params — a security
  regression — or the download would 401.
- Alternative B: frontend rewrites `/api/v1/exports/*` to the backend origin in
  `useServerExport`. Rejected: still cannot attach the Bearer header; also
  `MES_API_URL` is server-only (`process.env` in `lib/mes/server.ts`) and must
  not leak to the client bundle. The proxy keeps the token server-side, exactly
  like the GraphQL proxy does.
- Alternative C: Next `rewrites()` in `next.config.ts`. Rejected: rewrites run
  outside the request context where `cookies()` is available the same way the
  route handler uses it; the codebase already standardized on route handlers,
  and route handlers give explicit control over status/header relay.

**Decision: `[id]` dynamic segment (not catch-all).**
Export ids are UUIDs; a single segment matches the backend route exactly and
prevents path-shaped ids from reaching the proxy. Catch-all stays reserved for
attachment keys, which legitimately contain slashes.

**Decision: Relay verbatim, including status.**
The proxy returns the upstream status (401 unauthenticated, 404 unknown id, 410
deleted file) unchanged, matching the files proxy's `relay()` behavior, so
error semantics stay in one place (the backend).

## Risks / Trade-offs

- [Proxy becomes a required path; removing it re-breaks downloads] → covered by
  a route test asserting the relay contract, and by the contract test asserting
  the backend URL points at the proxy path. Both must change together.
- [URL shape is a behavior contract other clients may rely on] → the URL is
  consumed only by the frontend `useServerExport`/import dialog today; the
  contract test pins the new shape and the delta spec records the requirement.
- [Session cookie name/config drift between proxies] → the new route reuses
  `MES_SESSION_COOKIE`/`MES_API_URL` from `lib/mes/server.ts`, the same source
  the other three proxies import; no duplicated constants.
- [Large artifacts pass through the Next server] → unchanged from today's
  design intent; artifacts are report-sized (≤ a few MB), and the files proxy
  already relays bodies the same way.

## Migration Plan

Deploy: backend URL change and frontend proxy ship together (the frontend route
must exist before the backend emits the new path — frontend-first order in
tasks). No data migration; previously persisted `export_artifacts` rows are
unaffected (the URL is derived per response, not stored).
Rollback: revert both sides; the old URL simply 404s again as before.

## Open Questions

None.
