# Design

## Context

Motivation and scope: see `proposal.md`. The requirements this implements: the
`backend/attachment-storage` delta (per-file outcomes, diagnosable store
failures, storage-availability contract) and the `frontend/jobs` delta (per-file
outcome rows, in-place retry, submit blocked while a picked file is unresolved).

Facts established while investigating (reproduced against the running stack):

- `uploadAttachments` (`backend/src/files/attachments.ts`) already reports a
  refused store write as a per-file `STORE_FAILED` failure; the write is wrapped
  in `catch {}`, so the store's error — the only evidence of *why* — is
  discarded. That is why the deployment says only "Try again."
- The route handler is wrapped in `sentrySpan("files.upload", …)` in
  `backend/src/index.ts`; because the loop swallows the error, the span sees a
  successful request and nothing reaches Sentry either.
- The frontend field (`frontend/src/components/shared/attachment-field.tsx`)
  queues only entries whose status is `pending`, so a `failed` entry can never
  be retried — the "Try again." instruction is a dead end.
- Files that fail are never added to `attachmentIds`, so a completion request
  can be submitted with its evidence silently missing.
- The environment root cause is credential drift: `S3_ACCESS_KEY_ID` is the key
  with RW on the bucket, but `S3_SECRET_ACCESS_KEY` no longer matches it
  (verified against `garage key info … --show-secret`), so Garage answers
  `403 Forbidden: Invalid signature`. Two independent clients (the app's
  `Bun.S3Client` wrapper and rclone, both with the same settings) fail
  identically, which rules out the client code.
- `.env.example` currently carries no `S3_*` entries, so a fresh deployment has
  `storage: null` and every upload answers 503 with the storage-missing message.
- The API surface is not changing: `POST /api/v1/files` keeps its request, its
  `files` + `failures` response shape, and its status codes.

### Frontend download routing (added during verification, user-approved)

A defect surfaced while verifying the download path: **every download through
the frontend returned Next's own 404.** The proxy's `GET` lived in
`frontend/src/app/api/mes/files/route.ts` — a plain, non-catch-all segment that
matches only `/api/mes/files` itself — while every real attachment key is
`tasks/<taskId>/<uuid>-<filename>`. `attachment-preview.tsx` builds exactly
those URLs, so attachments were never reachable from a browser. This is
independent of the upload failure and predates this change (HEAD commit
`1efd964`).

The handler's own logic was already correct — it encodes each path segment
individually, preserving the separators the backend route needs. Only the
routing was wrong. The fix moves `GET` into `files/[...key]/route.ts` (a
catch-all, `params` awaited per this Next.js version's convention) and leaves
`POST` where it is. No handler behavior changes.

## Goals / Non-Goals

**Goals**

- One failed upload leaves behind an operator-actionable record (log, and Sentry
  where configured) without changing the user-facing response contract.
- The failure the user sees is retryable in one click.
- A completion request cannot be submitted with silently missing evidence.
- The deployment is verifiable: after the credential is corrected, an upload
  round-trips through the real Garage bucket and streams back.

**Non-Goals**

- Changing the route's request/response contract or its status codes.
- Adding a browser→storage direct path, transcoding, or streaming the client's
  bytes to storage without buffering in the backend.
- Raising the per-file size ceiling or changing the validation rules.
- Rotation of the key (the access key is valid and holds RW; only the secret
  drift is corrected).
- Startup-time storage reachability probes — out of scope; the storage-missing
  503 already covers the unconfigured case.

## Decisions

### Record the store failure cause, scrubbed, through an injectable recorder

`uploadAttachments` keeps its swallow-and-report shape (a per-file failure is a
normal outcome, not an exception), but the catch now forwards a **scrubbed**
summary to a recorder: `{ taskId, key, fileName, errorName, message }` where
`message` is bounded to the first line of the store error's message. The
recorder is part of `FileRouteDependencies` as an optional
`logStoreFailure`, defaulting to a production implementation in
`backend/src/index.ts` that writes one `console.error` line and, when a Sentry
DSN is configured, captures a **synthetic** error built from the same scrubbed
fields — never the raw store error object, whose property graph may carry
request-scoped detail.

*Why not throw and let `sentryOnError` handle it:* the loop's other files must
still be stored; a per-file refusal is not a request failure.
*Why not `Sentry.captureException(storeError)` directly:* the store error object
may embed request details that never belong in an event payload.
*Alternatives considered:* swallowing with a bare counter (rejected — leaves the
deployment exactly as undiagnosable as today).

### Frontend: retry by re-queueing the same entry

`AttachmentField`'s entry statuses already model the lifecycle; a failed row
gains a retry affordance that sets the entry back to `pending` and clears its
stale failure. The existing upload routine needs no change — it already queues
`pending` entries. The reported failure stays visible on the row until the
retry actually starts.

*Why not a separate retry mutation:* the route is idempotent per key and a new
key is minted per attempt anyway; re-queueing keeps one code path.
*Alternatives considered:* auto-retry with backoff (rejected — a systemic
credential outage would spin; the user chose explicit retry).

### Frontend: the field reports unresolved files upward

New optional prop `onUnresolvedChange?: (fileName: string | null) => void` on
`AttachmentField`, invoked whenever the set of unresolved entries (pending,
uploading, or failed) changes, naming the first one. `task-completion-dialog.tsx`
uses it to disable the submit button and render an `InlineAlert` naming the
file. `task-completion-review.tsx` passes nothing and is unaffected.

*Why a callback rather than a lifted state:* the dialog already owns the submit
button; lifting the whole entry list into it would expose the picker's
internals. The other consumer proves the prop can be optional.

### Environment: correct the secret, and make the next drift impossible to miss

- `backend/.env`: operator re-copies `S3_SECRET_ACCESS_KEY` from
  `garage key info mes-system-s3-bucket --show-secret` (never into a doc, a
  diff, or a log).
- `.env.example`: the four `S3_*` keys with the local defaults from
  `docs/garage-s3-clients.md` and a pointer to the `garage key info` command.
- `docs/garage-s3-clients.md`: a troubleshooting row for
  `Forbidden: Invalid signature` / `AccessDenied` when the key id is valid —
  the secret has drifted — plus the one-command credential check. Its existing
  rows cover DNS-style, region, and grant failures, none of which diagnose a
  stale secret.

*Why not add a health probe:* the spec requires diagnosable *failures*, not a
preflight; the 503 storage-missing message already covers unconfigured storage.

## Risks / Trade-offs

- **A store error message could embed request-scoped detail** → the recorder
  takes only name + first line; a unit test asserts the recorded payload
  contains no credential material and a test with a throwing fake store proves
  the failure record still reaches the client.
- **Submit blocking can strand an employee during a storage outage** → the
  refusal names the file and the row can be retried in place; no partial
  evidence is silently dropped. Accepted per the submitted decision.
- **The verification tasks depend on an operator action** (the `.env` secret)
  → they are ordered after it and are only completable when a real file
  round-trips; the failing-before/passing-after evidence is recorded in the
  task notes.
- **A silent regression here is invisible without e2e** (the frontend has no DOM
  test infrastructure) → verification is an explicit scripted browser pass
  (upload, failure row, retry, submit guard, stream-back), not just unit tests.

## Migration Plan

1. Operator: replace `S3_SECRET_ACCESS_KEY` in `backend/.env` with the value
   from `garage key info mes-system-s3-bucket --show-secret`; restart the
   backend so the process reloads it.
2. Deploy frontend + backend together (the frontend change is inert against the
   old backend: the `STORE_FAILED` failure record already exists).
3. Verify with the change's end-to-end task (real upload → row stored →
   streamed back → failed-file guard shown by forcing a refusal).
4. Rollback: revert the two commits; the corrected `.env` is local-only and
   needs no rollback (the key itself is unchanged).

## Open Questions

None. The submit-blocking and in-place-retry decisions were settled with the
user when this change was proposed.
