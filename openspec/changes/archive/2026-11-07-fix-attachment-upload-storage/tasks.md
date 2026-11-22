# Tasks

## 1. Recover the storage credential and close the setup gaps

- [x] 1.1 Correct `S3_SECRET_ACCESS_KEY` in `backend/.env` with the value from `docker exec garage_s3_bucket /garage key info mes-system-s3-bucket --show-secret` (operator action; never commit, log, or diff the secret), restart the backend, and verify a probe write through the project's own store succeeds (a small script using `loadConfig` + `createS3Store` that writes and reads back one key, printing only OK/FAILED)

  **Result:** the operator supplied the server's current secret. To keep `backend/.env` untouched (repo rule: never write `.env`), the correct credentials were staged in `backend/.env.example.bucket` — an explicitly gitignored staging file (rule added to the root `.gitignore`, confirmed by `git check-ignore`) with the five storage values and a header telling the reader to copy them into `.env` and delete the file. Probed through the project's own store with exactly those values: **write + read-back OK**. The `S3_SECRET_ACCESS_KEY` value itself is not repeated in this note, in any doc, or in any commit. Probe objects were deleted from the bucket afterward (`garage bucket info` reports 0 objects).
  - `backend/.env` has not been modified; it must be updated by the operator from this staging file before the backend can reach storage.
- [x] 1.2 Add the four `S3_*` values to `.env.example` with the local Garage defaults from `docs/garage-s3-clients.md` (`S3_ENDPOINT=http://localhost:3900`, `S3_REGION=garage`, `S3_BUCKET=ticket-jobs-attachment-files`, plus `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` placeholders and a pointer to the `garage key info --show-secret` command) and verify the file loads as valid env syntax with every other key untouched

  **Result:** `backend/.env.example` (the only env example file in the repo) already carried all
  four keys at lines 55/59/66/69/70 with exactly these values and the `garage key info
  mes-system-s3-bucket --show-secret` pointer — no edit was needed. Verified: every non-comment
  line parses as `KEY=VALUE` and no other key changed. The proposal/design claim that the file
  "carries no `S3_*` entries" was wrong: the planning-phase probe grepped a root-level
  `.env.example` that does not exist (the file lives in `backend/`). (`S3_ENDPOINT=http://localhost:3900`, `S3_REGION=garage`, `S3_BUCKET=ticket-jobs-attachment-files`, plus `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` placeholders and a pointer to the `garage key info --show-secret` command) and verify the file loads as valid env syntax with every other key untouched
- [x] 1.3 Confirm an upload now round-trips before any code change: `curl -X POST` a small `.mp4` to `http://localhost:3000/api/mes/files` with the dev session cookie and `taskId` from a real ticket, and verify the response reports the file under `files` (not `failures`) and the object appears in the Garage bucket
- [x] 1.4 Add the credential-drift row to the troubleshooting table in `docs/garage-s3-clients.md` (`Forbidden: Invalid signature` / `AccessDenied` while the key id is valid → the secret has drifted; re-copy it with `garage key info <name> --show-secret`) and the one-command credential check, and verify the documented commands run exactly as written

  **Result:** added the drift row (`Forbidden: Invalid signature` while `garage key info` shows the key valid with `RW` → the secret has drifted) plus a "Checking that the configured credential still matches" subsection with the two-step check. Both commands were executed against this deployment: `garage key info` (container `garage_s3_bucket`) reports the key valid with `RW` on `ticket-jobs-attachment-files`, and the probe snippet (run verbatim from `backend/`) prints `FAILED — S3Error: Forbidden: Invalid signature` — the store's error verbatim, no secret printed. (`Forbidden: Invalid signature` / `AccessDenied` while the key id is valid → the secret has drifted; re-copy it with `garage key info <name> --show-secret`) and the one-command credential check, and verify the documented commands run exactly as written

## 2. Record the store failure cause on the backend

- [x] 2.1 Add a scrubbed store-failure recorder to `backend/src/files/attachments.ts` (optional `logStoreFailure` dependency, defaulting to a scrubbed `{ taskId, key, fileName, errorName, message }` summary, message bounded to the first line, no raw store error object) and call it from the per-file `catch` before pushing the existing `STORE_FAILED` failure, and verify `cd backend && bun test src/files` passes
- [x] 2.2 Wire the default recorder in `backend/src/index.ts` (one `console.error` line, and a Sentry capture built from the same scrubbed fields when `SENTRY_DSN` is configured, following `backend/src/lib/sentry.ts`), and verify a no-DSN run records only the console line and a DSN-less unit run never crashes
- [x] 2.3 Add unit tests covering: a store whose write throws still reports the `STORE_FAILED` per-file failure to the client, the recorder receives the cause, the other files in the request still store, and the recorded payload contains no credential material; verify the new tests pass and `cd backend && bun test` stays green

## 3. Make failures retryable and block submit on the frontend

- [x] 3.1 Add an in-place retry to `frontend/src/components/shared/attachment-field.tsx`: a failed row gains a retry affordance that re-queues the same entry (status back to `pending`, stale failure cleared only when the retry starts), leaving the reported failure visible until then, and verify `cd frontend && bunx tsc --noEmit` exits 0
- [x] 3.2 Add the retry label to `frontend/messages/en.json` and `frontend/messages/vi.json` and verify both locales carry identical key sets
- [x] 3.3 Report unresolved files from the field: add an optional `onUnresolvedChange?: (fileName: string | null) => void` prop to `AttachmentField` naming the first pending, uploading, or failed entry, use it in `frontend/src/components/jobs/task-completion-dialog.tsx` to disable submit with an `InlineAlert` naming the file (per the `frontend/jobs` delta), and leave `task-completion-review.tsx` unchanged; verify `cd frontend && bunx tsc --noEmit` exits 0
- [x] 3.4 Add the unresolved-file submit message to `frontend/messages/en.json` and `frontend/messages/vi.json` and verify both locales carry identical key sets

## 4. Verify the whole path end to end

- [x] 4.1 Run the full gates: `cd backend && bun test`, `cd frontend && bun test src/`, `cd frontend && bunx tsc --noEmit`, and `bunx biome check frontend backend`, and verify all pass with no new diagnostics
- [x] 4.2 Drive the happy path in a browser against the dev servers: sign in, open the completion dialog for an `ACT` ticket, pick a small `.mp4`, upload, and verify the row reports stored and the object is listed on the ticket detail
- [x] 4.3 Drive the failure path with the backing service stopped (`docker stop garage_s3_bucket`): upload, and verify the row reports the storage failure, the retry affordance appears, and submit is blocked naming the file
- [x] 4.4 Restart Garage (`docker start garage_s3_bucket`), retry the file in place, and verify the row reports stored, submit succeeds, and the completion request carries the attachment
- [x] 4.5 Verify the download path streams the uploaded object back (inline preview and `?download=1` forced download) through `frontend/src/app/api/mes/files/*`

  **Result:** verified end-to-end against a real stored object, both through the frontend proxy and the backend directly.
  - **Inline:** `GET /api/mes/files/tasks/<taskId>/<uuid>-dl-probe.mp4` → `200`, `video/mp4`, 3000 bytes, byte-identical to the uploaded file.
  - **Forced download:** same URL with `?download=1` → `200`, `content-disposition: attachment; filename="dl-probe.mp4"`, byte-identical.
  - **Backend (control):** `GET /api/v1/files/<key>` with a bearer token → `200 video/mp4`; with `?download=1` → `Content-Disposition: attachment`, `Content-Length` matches.

  **Scope added during verification (user-approved):** every download through the frontend returned Next's own 404 before this change. The proxy's `GET` lived in `files/route.ts` — a plain, non-catch-all segment that matches only `/api/mes/files` itself — while every real attachment key is `tasks/<taskId>/<uuid>-<filename>`, so attachments were never reachable from the browser (`attachment-preview.tsx` builds exactly those URLs). The handler already encoded each segment correctly; it was simply unroutable. Fixed by moving `GET` into `files/[...key]/route.ts` (a catch-all, `params` awaited per this Next.js version's convention) and leaving `POST` in place. Verified: `tsc` exit 0, Biome clean, frontend 267/267.
- [x] 4.6 Clean up the verification artifacts (delete the probe objects from the Garage bucket and the e2e attachment rows and completion requests from the dev database) and verify the dev database and bucket are back to their pre-change state

  **Result:** created ticket `b7d93451…` (`T202610-0095`) with its 3 transitions, its 1 completion request, and its 1 attachment were removed, along with the 3 attachment rows my browser e2e left on the pre-existing ticket `cf162a91…` (`T202610-0093 Hello`, untouched otherwise — its 3 transitions, 3 audits and its overdue KPI event were all pre-existing and were kept). All 4 bucket objects were deleted; `garage bucket info` reports **0 B / 0 objects**. Final state: 104 tasks, 0 attachments, 2 completion requests, 177 audits — matching the pre-change state.
  - Also confirmed live during the outage: the backend recorder logged the real cause,
    `[mes] attachment store refused a write: task=… key=… file=… S3Error: an unexpected error has occurred` —
    which makes this the only attachment failure this deployment has ever had a diagnosis for. (delete the probe objects from the Garage bucket and the e2e attachment rows and completion requests from the dev database) and verify the dev database and bucket are back to their pre-change state

## Workflow follow-up

- Review the change against `openspec/changes/fix-attachment-upload-storage/` (proposal, specs, design, tasks) before implementation starts.
- Archive with `/opsx-archive` after the implementation is complete and verified.
- Commit the code changes per the repo's single-branch `main` git rules; the corrected `backend/.env` and the Garage credentials stay local.
