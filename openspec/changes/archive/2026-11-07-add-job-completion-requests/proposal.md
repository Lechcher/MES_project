# Proposal

## Why

Completing a ticket is today a single click: `submitTaskReport` moves `ACT → PEN`
with no evidence, and approvers answer with a bare `approveTask` / `returnTask`
that records no reason field, no files, and no per-attempt history. Real work
happens in stages — an outline, a draft, a review round — and none of that is
recorded, so the ticket gives no answer to "what was delivered, what was asked
for, and what still has to change". Multi-day tickets are worse: they are forced
onto a fixed 25/50/75/100 ladder that misreports progress the moment the stages
are uneven.

## What Changes

- **Completion requests.** The assignee's Complete action opens a dialog that
  collects a request title (required), a work-done description, and attachments,
  and submits them for approval. Each submission becomes one entry in a
  per-ticket **journey list** of work stages, each with its own state
  (`PEN`, `APP`, `REJ` — the preserved ticket codes).
- **Structured decisions.** Approvers approve or reject an entry with a
  mandatory reason, and may attach required-fix files to a rejection. Approving a
  full-job request closes the journey; approving a milestone request keeps the
  ticket open for the next stage.
- **Multi-day progress becomes derived.** The fixed 25/50/75/100 milestone gates
  stop gating behavior. `progressPercentage` is recomputed from the approved
  stage ledger (`planned_stage_count` ratio, otherwise the request's declared
  estimate) and never decreases; the UI shows `~X%` plus approved/planned stages.
  `MULTI_DAY_MILESTONES` remains for rendering legacy rows only. **This is an
  intentional behavior change** and is called out in the §6.1 contract update.
- **Attachments in Garage S3.** A new multipart `POST /api/v1/files` accepts many
  files in one request across images, video, audio, PDF, Office, text/CSV/JSON and
  archives, enforces a denylist plus per-file size and per-request file-count
  limits, and reports each failure individually so valid files still succeed. A
  new `GET /api/v1/files/*` streams downloads through the authenticated backend —
  no presigned browser uploads, no browser-held S3 credentials.
- **New persistence.** `task_completion_requests`, `tasks.planned_stage_count`,
  and `attachments.size_bytes`, plus a Drizzle migration and the reference-SQL
  mirror.
- **Frontend surfaces.** `task-completion-dialog`, `attachment-field`,
  `attachment-preview`, `task-journey`, and a completion-request review surface
  that replaces the direct `approveTask` / `returnTask` buttons on `PEN` (the
  mutations stay in the contract). All copy lands in `messages/en.json` and
  `messages/vi.json`.
- Attachments preview inline through the same authenticated route — image, video,
  audio and PDF inline; every other format as a downloadable file card.

## Capabilities

### New Capabilities

- `backend/attachment-storage`: bulk authenticated file upload to the Garage S3
  bucket, the accepted/rejected format and size rules, object key layout, and
  authenticated streaming download with inline-vs-attachment disposition.

### Modified Capabilities

- `frontend/jobs`: the ticket-detail lifecycle action set — the completion
  dialog, the journey list, the stage-derived progress card, the attachment
  preview section, and the `PEN` review surface replacing the direct
  approve/return buttons.
- `backend/graphql-api`: `TaskCompletionRequest` and its inputs/operations,
  plus `Task.journey` and `Task.plannedStageCount` on the Jobs read surface.
- `backend/persistence`: the `task_completion_requests` table, `tasks.planned_stage_count`,
  `attachments.size_bytes`, and the invariants they carry (one pending request
  per ticket, monotonic progress).

## Impact

- **Backend**: `src/domain/tasks.ts` (submit/review functions, progress
  recompute), `src/graphql/schema.ts`, `src/graphql/resolvers/jobs.ts`,
  `src/graphql/shapes.ts`, `src/graphql/access.ts`, `src/db/schema.ts`,
  `src/db/enums.ts`, `src/config.ts`, `src/index.ts` (file routes), new
  `src/storage/s3.ts`, `src/domain/notifications.ts` (three templates),
  `drizzle/`, `backend/.env.example`.
- **Frontend**: `components/jobs/task-actions.tsx`,
  `task-request-review.tsx`, `task-detail-view.tsx`, new
  `components/jobs/task-completion-dialog.tsx`, `task-journey.tsx`,
  `components/shared/attachment-field.tsx`, `attachment-preview.tsx`,
  `app/api/mes/files/route.ts`, `lib/mes/queries/jobs.ts`, `types.ts`,
  `registries.ts`, `messages/{en,vi}.json`.
- **Docs**: `API_CONTACT_SPECIFICATION.md` §6.1 (new types/inputs/operations and
  the multi-day progress-model change), `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`
  (new table and column), `docs/garage-s3-clients.md` (upload/download usage).
- **Dependencies**: none. `Bun.S3Client` is built in; the UI composes existing
  shadcn primitives.
- **Data**: a Drizzle migration adds the table and columns; existing rows keep
  their current progress values, which the new model treats as a floor.
- **Compatibility**: no preserved token is renamed. Logged multi-day progress
  stops implying a milestone ladder and no longer gates completion; the
  `submitTaskReport`, `approveTask` and `returnTask` operations remain in the
  contract unchanged and remain available, but the `PEN` review path in the UI
  moves to the completion-request flow.
