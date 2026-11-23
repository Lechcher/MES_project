# Design

## Context

See `proposal.md` — Why. In brief: the service records nothing durable, so a
failure has to be reproduced live to be diagnosed.

The backend has no logging abstraction today. `backend/src/config.ts` already
centralises environment access and owns `redactMailUrl`, which masks the
credential in a mail URL so it never reaches a log or an error message;
`backend/src/mail/delivery.ts` already records every delivery attempt in the
`notifications` table with a redacted `errorMessage`, `errorCode`, and `delivered`
flag, and `backend/src/mail/sender.ts` already provides `createCredentialScrubber`,
which masks both the whole connection URL and the password in any encoding.
`backend/src/graphql/` returns failures in a response body with a stable
`extensions.code` rather than throwing. `docs/DEVELOPMENT.md` documents the
environment variables and the run commands.

Constraints: no new dependency (`AGENTS.md`); the existing test suite constructs
the service directly via `createService` with temp databases and must keep running
without writing to the developer's real directories.

## Goals / Non-Goals

**Goals**
- A run is observable live *and* in review afterwards, from one code path.
- Failures survive the process: an error line is durable the moment it is recorded.
- Secrets cannot reach a log, by construction rather than by filtering.
- Tests stay hermetic — no test writes into `backend/data/`.

**Non-Goals**
- Per-request logging (method, path, status, duration). Deferred; not in the specs.
- Frontend logging — this is a backend service concern.
- Structured log aggregation or a shipping pipeline — out of scope for a prototype.
- Changing any API response body, status code, or the `notifications` table.

## Decisions

### 1. No logging dependency — a small in-repo module

`pino`/`bunyan`/`winston` (or Elysia's own logger plugin) would bring levels and
rotation for free, but `AGENTS.md` requires preferring installed packages and the
standard library, and the required behaviour is small: four levels, one line
format, an append-only file, and a size bound.

*Alternative rejected:* add `pino` or `@elysiajs/logger`. A dependency for what is
~100 lines is not a saving here, and it would also decide the on-disk format for us.

Chosen: `backend/src/logging/` exporting a `Logger` interface, a `createLogger`,
level formatting, a redacting text sink, and a rotating file sink — all on
`node:fs`.

### 2. The logger is an injectable dependency that defaults to silent

`createService` already receives `db`, `auth`, and `config`, so a logger follows
the same shape and land in `ServiceDependencies`. Two choices follow:

- It is **optional**. `index.test.ts` and any other direct construction keep
  working unchanged and stay quiet, because they do not pass one.
- Its default is a **silent** logger rather than the real one. A service built
  without an explicit logger records nothing. Only `bootstrap()` — the single
  production entry — constructs the real logger and passes it in.

*Alternative rejected:* a module-scoped singleton created at import time. It would
quietly point at `backend/data/logs` during tests, and would make the log directory
un-injectable.

### 3. Synchronous append, not a buffered flush

Each recorded line is written with a single `fs.appendFileSync` against the current
file. A crash mid-run must not lose the line that explains it; durability is the
entire point of the change. One short line per event is not throughput-bound in a
prototype, and the write is off the request path's critical section.

*Alternative rejected:* accumulate and flush asynchronously. It would be faster and
would risk losing exactly the lines the user wants to check.

### 4. Rotation by size, bounded by retained count

The directory holds `mes-backend.log` as the live file. When it reaches
`MES_LOG_MAX_BYTES` (default 5 MB) it is rolled to `mes-backend.1.log`, existing
numbered files shift up, and the oldest beyond `MES_LOG_KEEP_FILES` (default 3) is
discarded. Every name ends in `.log`, which the root `.gitignore` already ignores
via `**/*.log`.

*Alternative rejected:* one file per day. It needs a separate cleanup rule to stay
bounded, and the size bound is what protects disk on a service that never restarts.

### 5. GraphQL failures are read from the response, not from a throw

The `/api/v1/graphql` route returns errors in a body with status 200 — it never
throws for a domain or validation failure (see `index.ts`), so `onError` alone would
miss every failure that matters. The lifecycle hook must inspect what the route
returned:

- `onError` catches genuinely thrown and unhandled failures — the stack-trace
  requirement — recording the error, the event that failed, and the route's stack.
- `onAfterHandle` inspects the returned value for an `errors` array and records each
  entry's `extensions.code` together with the operation name it can recover from
  the request. The status is read from `set.status` *before* the existing
  normalisation in that hook sets it to 200.
- `onStart` / `onStop` record the lifecycle.

This is the one place where the implementation could quietly miss the requirement,
so the tasks carry a test that proves it.

### 6. Mail outcomes are consumed, not re-instrumented

`deliverMail` already returns a `MailOutcome` carrying `delivered`, `errorCode`,
and a redacted `errorMessage`, and already records the attempt in `notifications`.
Rather than duplicating detection inside the mail modules, the password-reset path
logs one line from that outcome. The logger is therefore handed an already-safe
string, and redaction stays a second line of defence rather than the only one.

### 7. Redaction is applied inside the sink, reusing the existing scrubber

`config.ts`'s `redactMailUrl` masks the password in a *connection URL*;
`createCredentialScrubber` masks the password in *any* text, in plain and
percent-encoded form, and the whole URL. The logging module applies the scrubber
when a mail endpoint is configured, so a line can never carry the credential even
if a future call site passes a raw string.

*Correction to the proposal:* it named `redactMailUrl` as the primitive to reuse.
The rule is the same, but `createCredentialScrubber` is the stronger existing
implementation of it, so the design uses that.

### 8. Configuration is logged as a derived summary, never as the config object

The startup line records port, environment, database path, log directory, mail
host/port, and whether the endpoint has credentials — never the URL, never the
auth secret. Nothing sensitive is passed to the logger at all, which is stronger
than filtering the object before it is formatted.

New settings, all optional, all following the `MES_*` convention already in
`config.ts`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MES_LOG_DIR` | `./data/logs` | Directory for log files. |
| `MES_LOG_LEVEL` | `info` | Minimum recorded severity: `debug`, `info`, `warn`, `error`. |
| `MES_LOG_FILE` | `mes-backend.log` | Base name of the live log file. |
| `MES_LOG_MAX_BYTES` | `5242880` | Size at which the live file rolls. |
| `MES_LOG_KEEP_FILES` | `3` | Number of rolled files retained. |

Invalid values are rejected in `loadConfig` with `ConfigurationError`, matching how
`MES_API_PORT` and `MES_SMTP_URL` are already validated. `bootstrap()` creates the
log directory before the service starts.

## Risks / Trade-offs

- **[A crashed run still loses the last line]** → every line is appended
  synchronously, so a line that was recorded is on disk by the time the caller
  continues. This is why the logger is not buffered.
- **[`appendFileSync` blocks the event loop per line]** → one short line per event,
  on a debug tool for a prototype. If request logging is ever enabled by default,
  this is the first thing to revisit.
- **[Synchronous rotation shifts files in-place, so a concurrent writer could race]**
  → the backend is a single process with all logging on its main path; rotation is
  best-effort and a failed roll disables the file sink for the rest of the run
  rather than throwing into a request. Tests cover the happy path and an unwritable
  directory.
- **[A future call site could hand the logger a raw config or a raw URL]** →
  redaction runs inside the sink on every line, not at the call sites, and the mail
  path already passes a scrubbed outcome.
- **[Log files land under `backend/data/`, which is not gitignored as a directory]**
  → every produced name ends in `.log`, which the root `.gitignore` already covers.
  Task 1.2 makes this explicit by adding `backend/data/logs/` to `.gitignore`, so a
  mis-named file cannot be committed by accident.

## Migration Plan

Nothing to migrate: the change adds a module and new optional configuration.
Existing deployments keep working with the defaults.

**Rollout**
1. Add the logging module and its unit tests.
2. Wire it into `createService` and `bootstrap`, and add the config settings.
3. Run the full suite and both lint commands; manually start the backend and
   confirm the terminal lines and the file in `backend/data/logs/`.

**Rollback**
Drop the `logging` entry from `ServiceDependencies` and restore the single
`console.log` in `index.ts`. The config settings become inert keys, and any log
files already written are ignored by git and by the old code.

## Open Questions

None. The three decisions that materially affected behaviour — terminal verbosity,
file format, and retention — were put to the user and settled before this design:
lifecycle-and-errors only, plain text one line per event, and size-based rotation
with a bounded retained count.
