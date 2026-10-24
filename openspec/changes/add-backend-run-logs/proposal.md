# Proposal

## Why

The backend runs silently today: it logs one line at startup and then nothing else.
When a password reset fails to send, a GraphQL call errors, or an export download
breaks, the failure is returned to the client and then lost — there is no record
anywhere to check afterwards. Diagnosing a problem therefore means reproducing it
while watching a blank terminal, and the one diagnostic that would help (a trace of
what actually happened) is never written down.

## What Changes

- Add a small logger to the backend that writes every event to the terminal and,
  in parallel, to a log file, so a run can be watched live *and* reviewed later.
- Log lifecycle events: startup (port, environment, resolved paths), and shutdown.
- Log unhandled failures with their stack trace, so a crash leaves a record.
- Log GraphQL request failures with the request's operation name and the stable
  error `extensions.code`, so a client-visible error can be traced to its cause.
- Log mail delivery outcomes (sent, or failed, including the reason) so the
  password-reset path's Zoho authentication failures are visible on the spot
  instead of only in the client response.
- Persist those events to a rotating file under the configured log directory,
  bounded in size so a long-running dev server cannot fill the disk.
- Redact secrets (notably `MES_SMTP_URL`'s password) from every logged line, using
  the existing `redactMailUrl` rule already enforced for config errors.
- Keep the default output quiet at rest — lifecycle and errors only — so real
  problems stand out; no new dependency is introduced (Bun's own `console`,
  `fs`, and Elysia lifecycle hooks are sufficient).
- Document the new environment variables in `backend/.env.example` and
  `docs/DEVELOPMENT.md`.

Explicitly out of scope: per-request logging (method, path, status, duration),
which would be noise under the frontend's polling, and frontend logging — this
change covers the backend service only.

## Capabilities

### New Capabilities

- `tooling/backend-run-logs`: How the backend service reports its own runtime to
  the people operating it — what it writes to the terminal while running, and what
  it persists to log files so failures can be checked after the fact.

### Modified Capabilities

None. No existing spec's requirements change: the backend's API behavior is
untouched, and the `frontend/*` capabilities and `tooling/lint-configuration`
describe different surfaces.

## Impact

- **Code**: new `backend/src/logging/` module (logger, redaction, file sink);
  `backend/src/index.ts` wires the logger into Elysia's `onError` / `onAfterHandle`
  / `onStart` / `onStop` hooks; `backend/src/config.ts` gains `MES_LOG_DIR`
  (default `./data/logs`) and log-level settings; `backend/src/mail/delivery.ts`
  and the password-reset path report outcomes through the logger.
- **Configuration**: new `MES_LOG_DIR` and level settings in `backend/.env.example`.
- **Dependencies**: none added (constraint from `AGENTS.md`).
- **Tests**: unit tests for the logger, redaction, and rotation; an integration
  test in the existing `backend/src/index.test.ts` style proving an error is both
  printed and written to the file.
- **Storage**: log files land in `backend/data/logs/`; the root `.gitignore`
  already ignores `**/*.log`, so they are never committed.
- **Docs**: `docs/DEVELOPMENT.md` gains a section on reading the logs.
