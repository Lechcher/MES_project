# Design

## Context

See `proposal.md` — Why for motivation. Current state that shapes the approach:

- `submitTaskReport` (`backend/src/domain/tasks.ts:981`) moves `ACT → PEN` (or
  `OVERDUE → PEN` behind an approved `LATE_EXPLANATION`) and links attachments to
  the ticket. `approveTask` / `returnTask` act on the ticket row only: no
  per-attempt record, no required reason field on rejection, no per-attempt
  files. Both stay in the contract.
- `task_requests` is the existing request table, but it is a calendar/deadline
  channel: `request_type` is check-constrained to `EXTENSION` /
  `LATE_EXPLANATION`, `reason` is `NOT NULL`, `status` uses the
  `PENDING/APPROVED/REJECTED` vocabulary, and it carries no scope, no title, no
  declared progress and no stage plan. It also drives `taskBadges`.
- The write pipeline is fixed and every mutation follows it: validate → write
  row(s) → `writeTransition` (actor-attributed) → `recordAuditEvent` → KPI via
  `awardKpi` → `notify`. `linkAttachments(ctx, ids, ownerId, ownerType)`
  re-parents uploaded attachment rows to a new owner.
- `attachments.owner_id` is `NOT NULL` today; the only owners in use are `TASK`
  and `TASK_REQUEST` (hardcoded strings, not a registry).
- `MULTI_DAY_MILESTONES` lives in `backend/src/db/enums.ts` and
  `frontend/src/lib/mes/queries/registries.ts`, and `task-detail-view.tsx:151`
  derives the progress card's label from `multiDayMilestone()`.
- `config.ts` is the single `process.env` reader and fails fast at startup;
  `GET /api/v1/exports/:id` (`index.ts:105`) is the existing bearer-gated
  streaming route and is the pattern the file routes follow.
- `docs/garage-s3-clients.md` documents path-style `Bun.S3Client`
  (`virtualHostedStyle: false`) against bucket `ticket-jobs-attachment-files`,
  and warns that a presigned URL is only openable by the host it was signed for.
- The frontend never holds credentials: `src/lib/mes/server.ts` reads the httpOnly
  `mes_session` cookie and `app/api/mes/graphql/route.ts` relays to the backend.

## Goals / Non-Goals

**Goals:**

- One structured, reviewable record per completion attempt — evidence, decision,
  reason, and files — with the ticket state derived from the request's scope.
- Progress that reflects the stages that were actually approved, is never
  allowed to decrease, and stops depending on a fixed ladder.
- Attachments that survive the round trip: bulk upload in mixed formats, inline
  preview, and no browser-side access to storage credentials.
- Domain rules that stay in `domain/tasks.ts` in the existing style, so the
  transaction, audit, KPI and notification behavior is uniform with the rest of
  the module.

**Non-Goals:**

- Changing KPI rule values or adding KPI rule codes (existing rules are reused).
- A deletion endpoint for attachments, retention/GC for abandoned uploads, or
  storage quota management.
- Server-side Office→PDF conversion; office formats are download-only.
- Browser-direct or presigned uploads.
- Renaming any preserved token, or changing `submitTaskReport`, `approveTask`
  and `returnTask` behavior.

## Decisions

1. **A new `task_completion_requests` table rather than new `task_requests`
   types.** The request is a work submission with its own lifecycle: state
   reuses the ticket codes (`PEN`/`APP`/`REJ`), which `task_requests.status`
   cannot express without widening its check constraint and re-interpreting its
   meaning; and it needs columns (`scope`, `title`, `declared_progress`,
   `planned_stage_count`, `decision_reason`) with no analogue in
   `task_requests`. A separate table also keeps `taskBadges` and the extension
   flow untouched. Alternatives considered: adding `COMPLETION` to
   `request_type` and adding nullable columns (one table, but two different
   lifecycles sharing one status vocabulary and one "reason is required"
   constraint), and extending `submitTaskReport` with an audit-only payload
   (no reviewable entity, so no per-attempt state and no decision attachments).

2. **Attachments are inserted provisionally under the ticket and re-parented;
   `owner_id` stays `NOT NULL`.** The upload route stores a task id in the
   request, so a newly uploaded file is inserted as `owner_type = 'TASK'`,
   `owner_id = <taskId>` — an owner that exists before the request does. When
   the request is created, the existing `linkAttachments` re-parents the
   employee's evidence to `TASK_COMPLETION_REQUEST`; a rejection re-parents the
   reviewer's files to `TASK_COMPLETION_DECISION`. Alternatives considered:
   making `owner_id` nullable and inserting with a null owner (rejected: it
   weakens the only ownership constraint the table has and leaves rows with no
   attributable owner), and a separate staging table (a migration and a second
   code path for no behavioral gain). Consequence: files uploaded into a dialog
   the assignee then abandons remain visible in the ticket's attachment section
   — attributable, harmless, and out of scope for this change.

3. **Progress is derived, floored, and never decreasing.** On approving a
   `MILESTONE` entry: `approved` = count of the ticket's `APP` `MILESTONE`
   entries including this one; `planned` = `tasks.planned_stage_count`;
   `computed = planned > 0 ? min(100, floor(approved * 100 / planned)) : (entry.declared_progress ?? current)`; the ticket's percentage
   becomes `max(current, computed)`. `logTaskProgress` is unchanged for quick
   notes and keeps its own monotonic rule; it no longer implies a ladder.
   `MULTI_DAY_MILESTONES` and `multiDayMilestone()` stay in place for rendering
   legacy rows only, and the progress card reads `~X%` with the stage ledger.

4. **File storage is an injected `AttachmentStore` port.** `src/storage/s3.ts`
   wraps `Bun.S3Client` (`virtualHostedStyle: false`, region defaulting to
   `garage`) behind a small interface (`write`, `read`, `exists`) so the tests
   inject an in-memory fake, exactly as the Settings domain already injects its
   ports and the mail change injected `MailSender`. No new dependency, and no
   network in the automated suite.

5. **Two REST routes beside the GraphQL endpoint, both bearer-gated like
   `/api/v1/exports/:id`.** `POST /api/v1/files` takes a typed multipart body
   (`t.Object({ taskId: t.String(), files: t.Files() })`) so Elysia validates
   the shape, authorizes the caller against the task's data scope, then writes
   and records each accepted file and reports per-file failures in the body.
   `GET /api/v1/files/*` resolves the key from the path, streams the object,
   sets `Content-Disposition: attachment` only for `?download=1`, and forwards
   `Range` to the store. GraphQL keeps carrying `attachmentIds`; binaries do not
   go through the GraphQL layer (the existing import path base64-encodes CSV,
   which does not scale to 25 MB media).

6. **No presigned URLs.** The presign host caveat in
   `docs/garage-s3-clients.md` means a signature minted for `garage:3900` is
   unreachable from a laptop and vice versa, so a browser-facing presigned URL
   would require per-environment configuration and would hand out credentials
   indirectly. Files are streamed through the existing route instead, and the
   frontend proxy `app/api/mes/files/route.ts` carries the cookie→bearer hop.

7. **Validation is a denylist plus a MIME/extension consistency check**, not an
   allowlist: the module accepts a wide, evolving set of formats (images, video,
   audio, PDF, Office, text/CSV/Markdown/JSON, archives) and blocks
   executables (`exe dll bat cmd sh msi scr com` and similar), size, count and
   empty-file violations. Office documents stay download-only because no
   conversion is built.

8. **The review surface is a completion-request review, not a second
   `TaskRequestReview`.** `task-request-review.tsx` reviews `TaskRequest`
   values (extension / late explanation). The new surface reviews a
   `TaskCompletionRequest` with a mandatory reason plus required-fix attachments
   on rejection, so it is its own component that composes `ReasonDialog` with the
   attachment field; the direct approve/return buttons in `TaskActions` are
   replaced by it for the `PEN` state, while `approveTask` / `returnTask` remain
   in the contract for direct API callers.

9. **Rejected requests resubmit through the same dialog.** Submitting from `REJ`
   reuses `submitTaskCompletionRequest` (state guard allows `ACT` and `REJ`),
  creating a new `PEN` entry next to the rejected one rather than mutating it,
  so the journey keeps every attempt. Resubmission awards no new KPI event;
  a rejection awards the existing `KPI_RETURNED_TICKET` each time it happens,
  matching `returnTask`.

## Risks / Trade-offs

- [Garage may reject `Range`] → The route forwards the header and records the
  limitation in the docs; media still plays, seeking falls back to sequential
  buffering. A test asserts the header is forwarded, not that Garage honors it.
- [A bulk upload of large files holds bytes in memory] → The 25 MB per-file cap
  and the per-request count cap bound it; the writes stream from the request's
  File objects rather than re-buffering the whole body.
- [An abandoned dialog leaves attachments behind] → Accepted trade-off above;
  the provisional ticket owner keeps them attributable, and deletion is out of
  scope.
- [Existing multi-day tickets read low percentages under the new model] → The
  ticket keeps its recorded percentage as a floor; legacy rows keep their
  milestone label, and this is stated in the proposal and the §6.1 update.
- [Storage growth without a delete path] → Out of scope; noted as a follow-up in
  Open Questions.
- [A denylist can be evaded by renaming an executable] → The MIME/extension
  consistency check catches the common mismatch case; the route never executes
  stored content, and downloads are served as attachments or inline with their
  own content type. Stricter content sniffing is a follow-up, not a blocker.
- [S3 outage at upload time] → Files are validated before the store is touched,
  the per-file failure list reports a failed store write as a per-file failure,
  and nothing is recorded as an attachment unless its object was written.
- [Per-request multi-file writes are not atomic] → Intended: the contract is
  per-file success reporting, so one failed file must not fail the batch.

## Migration Plan

1. Generate the Drizzle migration for `task_completion_requests`,
   `tasks.planned_stage_count` and `attachments.size_bytes`
   (`bun run db:generate`) and mirror the same model in
   `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`. The migration is additive
   (`ALTER TABLE ... ADD COLUMN` plus `CREATE TABLE`), so applying it to an
   existing database keeps every row and takes effect on the next boot.
2. Land storage, then the data model, then the domain functions, then the
   GraphQL surface, then the UI — each step keeps the suite green because the
   earlier operations (`submitTaskReport`, `approveTask`, `returnTask`) are
   untouched.
3. **Rollback**: reverting the release removes the new routes and screens and
   leaves `task_completion_requests` rows orphaned but harmless; the migration
   is additive so no rollback SQL is needed for the columns. Files already in
   the bucket remain reachable only through the file route, whose removal makes
   them unreachable — delete them from the bucket if that matters.
4. Update `API_CONTACT_SPECIFICATION.md` §6.1 (types, inputs, operations, the
   multi-day progress-model note) and `docs/garage-s3-clients.md` in the same
   change, so the contract and the operational doc match the code.

## Open Questions

None that block the specified behavior. Two deferred items, both safe to decide
later: whether pending completion requests should also surface on the Planning
Approval Board (the ticket detail already shows them, and the board reads
`Task.requests`), and whether attachments need a delete/cleanup endpoint once
real usage shows how much abandoned upload costs.
