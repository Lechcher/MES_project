# Proposal

## Why

Every ticket attachment upload fails. The employee picks a file, presses
Upload, and the file row reports `<file> could not be stored. Try again.`

Reproduced against the running stack (dev frontend :3000 → backend :3001 →
Garage on :3900): the backend validates the file, calls the object store, and
the store rejects the write. The root cause is environmental — the configured
`S3_ACCESS_KEY_ID` is the key that owns RW on `ticket-jobs-attachment-files`,
but the configured `S3_SECRET_ACCESS_KEY` no longer matches it, so Garage
answers `403 Forbidden: Invalid signature`. The bucket has never held a single
object.

The failure is invisible by design twice over: the route's `catch {}` discards
the store's error (no log line, no Sentry record, no detail in the response),
and the UI's "Try again." is unactionable — a failed file cannot be re-queued,
so the only way to act on the instruction is to pick the file again. The
employee who needs to attach evidence to a completion request cannot do it, and
a ticket can be submitted with its attachments silently dropped.

## What Changes

- **Surface the real storage failure.** The upload route records the store's
  underlying error (name, message, status — never a credential) for the
  operation's owners and in the server log, and keeps reporting the stable
  per-file `STORE_FAILED` failure record the API contract already defines.
- **Make "Try again." actionable.** A file that failed to store can be
  re-queued and re-uploaded without picking it again; the failure message and
  code stay on the row until it is retried.
- **Never silently drop evidence.** Submitting a completion request is blocked
  while any picked file is still uploading or has failed, and the message names
  the unresolved file.
- **Bring the environment back to a known-good state and keep it there.** The
  stale `S3_SECRET_ACCESS_KEY` in `backend/.env` is re-copied from the Garage
  server (operator action, outside this repo), `S3_*` values are written into
  `.env.example` — which currently omits them, so a fresh setup has no storage
  at all and every upload answers 503 — and the Garage client guide's
  troubleshooting table gains the stale-secret signature case, which is the one
  failure mode its current rows do not diagnose.
- **Prove the path end to end.** After the credential is corrected, a real
  upload of a small video through the completion dialog is verified: stored,
  listed on the ticket, and streamed back for preview.
- **Reach the stored file at all.** Verification surfaced that every attachment
  download through the frontend 404'd: the download handler sat in a plain
  route segment that cannot match a storage key, and every storage key contains
  slashes. The handler moves to a catch-all route, so `attachment-preview.tsx`'s
  URLs actually resolve. (Pre-existing defect, added to this change by
  user decision when it was found.)

## Capabilities

### New Capabilities

- `backend/attachment-storage`: ticket attachment upload to object storage and
  streaming download — per-file validation, per-file outcome reporting,
  diagnosable store failures, and the storage-availability contract the routes
  enforce before a byte is written.

### Modified Capabilities

- `frontend/jobs`: the completion request's attachment field gains the
  in-place retry behavior and the rule that the request cannot be submitted
  while a picked file is unresolved. (Ticket detail already *shows* attachments;
  the dialog's upload and submit behavior is what changes.)

## Impact

- **Affected code**
  - `backend/src/files/attachments.ts` — record the store failure cause; keep
    the `STORE_FAILED` per-file outcome and the route/http surface unchanged.
  - `frontend/src/components/shared/attachment-field.tsx` — retry for a failed
    file, unresolved-file submit guard, and failure surfacing.
  - `frontend/src/app/api/mes/files/[...key]/route.ts` — new catch-all route
    carrying the existing proxied download `GET`. Found by this change's
    verification: every attachment download through the frontend 404'd, because
    the handler sat in a plain non-catch-all route that could never match a key
    of the form `tasks/<taskId>/<uuid>-<filename>` — every real attachment key.
    (`task`-prefixed keys are what `attachment-preview.tsx` builds.) Independent
    of the upload failure, and pre-existing at HEAD.
  - `frontend/messages/en.json`, `frontend/messages/vi.json` — retry label,
    unresolved-file submit message.
- **Configuration and docs**
  - `backend/.env` — corrected `S3_SECRET_ACCESS_KEY` (operator action; the
    file stays gitignored and is never read into a diff).
  - `.env.example` — add the four `S3_*` values with the local Garage defaults.
  - `docs/garage-s3-clients.md` — troubleshooting row for a stale/incorrect
    secret (`Forbidden: Invalid signature`) and the end-to-end verification
    commands already used here.
- **APIs**: none changed. `POST /api/v1/files` keeps its request, its response
  shape (`files` + `failures` per file), and its status codes; the frontend
  proxy is unchanged.
- **Dependencies**: none. `Bun.S3Client` is already the storage client.
- **Explicitly out of scope**: transcoding or format conversion, presigned
  browser-direct uploads, raising `MES_UPLOAD_MAX_FILE_BYTES`, and streaming
  client→storage without buffering the file in the backend.
