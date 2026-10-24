# Tasks

## 1. Logger core

- [ ] 1.1 Create `backend/src/logging/` with a `Logger` interface (`debug`, `info`, `warn`, `error`) and a minimum-level gate, formatting one line per event that carries the time it occurred, its severity, and what it describes; verify with `bun test backend/src/logging/logger.test.ts` asserting an event below the configured level is not recorded, a recorded line contains its level and message, and the line format carries a timestamp.
- [ ] 1.2 Provide a silent logger and make it the default when a service is built without an explicit one; verify with `bun test` in `backend/` still green and by confirming no `backend/data/logs` directory appears after the suite runs.
- [ ] 1.3 Apply redaction inside every sink so no line can carry credential material — a connection URL's password masked in plain and percent-encoded form — reusing `createCredentialScrubber` rather than duplicating the rule; verify with a unit test passing a line containing the URL and both password spellings and asserting the recorded output contains the mask and never the credential.

## 2. Rotating file sink

- [ ] 2.1 Add an appending file sink that creates the configured log directory on first use and writes each recorded event to the live log file; verify with a unit test in a temp directory asserting recorded events are appended one per line and that a second run appends rather than truncating.
- [ ] 2.2 Implement size-based rotation bounded by a retained-file count, rolling the live file when it reaches `MES_LOG_MAX_BYTES`, shifting retained numbered files, and discarding the oldest beyond `MES_LOG_KEEP_FILES`; verify with a unit test driving events past the bound and asserting the live file holds the newest events, the retained count is respected, and the oldest was discarded.
- [ ] 2.3 Make a failed roll or an unwritable log directory disable the file sink for the rest of the run instead of throwing into a request; verify with a unit test pointing the sink at an unwritable path and asserting it neither throws nor silently records as if the write succeeded.
- [ ] 2.4 Add `backend/data/logs/` to the repository's `.gitignore` so a log file cannot be committed even if its name ever stops ending in `.log`; verify with `git check-ignore -v backend/data/logs/any-file.log` returning a matching rule.

## 3. Configuration and environment documentation

- [ ] 3.1 Add `MES_LOG_DIR`, `MES_LOG_LEVEL`, `MES_LOG_FILE`, `MES_LOG_MAX_BYTES`, and `MES_LOG_KEEP_FILES` to `AppConfig` with the design's defaults, validated in `loadConfig` through `ConfigurationError` the way `MES_API_PORT` already is; verify with `bun test backend/src/config.test.ts` covering each default, a level outside the four accepted values, and a non-integer byte count.
- [ ] 3.2 Document each new variable with its default and its purpose in `backend/.env.example`; verify by confirming every variable added in 3.1 appears there with its default value and that no real credential value is written.
- [ ] 3.3 Build the log directory eagerly in `bootstrap()` before the service starts so an unusable directory surfaces at startup; verify by starting the backend with `MES_LOG_DIR` pointing at an unwritable path and confirming the startup fails with an actionable message rather than at the first event.

## 4. Service wiring

- [ ] 4.1 Add an optional `logging` dependency to `ServiceDependencies`; verify with `bun test backend/src/index.test.ts` unchanged and green, proving existing direct construction still works.
- [ ] 4.2 Record lifecycle in the service's start and stop hooks — a startup line carrying the port and environment, a shutdown line — and replace the startup `console.log` in `index.ts` with the logger; verify with an integration test asserting both lines are recorded, and manually by starting the backend and seeing the startup line in the terminal.
- [ ] 4.3 Record thrown and unhandled failures with their stack trace in the error hook; verify with an integration test that a route which throws produces a record carrying the error and its stack.
- [ ] 4.4 Record GraphQL failures from the returned body in the after-response hook — the operation involved and the returned `extensions.code` — reading the status before the existing hook normalises it to 200; verify with integration tests asserting a malformed query and an unauthenticated request each record `VALIDATION_FAILED` and `UNAUTHENTICATED` respectively.
- [ ] 4.5 Construct the real logger in `bootstrap()` from the resolved configuration and pass it to the service; verify by starting the backend and confirming the startup line appears in the terminal and in the log file under the configured directory.

## 5. Mail delivery outcomes

- [ ] 5.1 Record the password-reset delivery outcome on both branches from the `MailOutcome` `deliverMail` already returns — a sent outcome when delivered, and the failure with its reason and code when not; verify with a unit test asserting both branches record the expected line and that neither line contains the connection URL or its credential.
- [ ] 5.2 Confirm no mail-path line duplicates the `notifications` record — it is derived from the outcome, not a second detection of its own; verify with a unit test asserting one record per attempt.

## 6. Documentation and end-to-end verification

- [ ] 6.1 Add a "Reading the logs" section to `docs/DEVELOPMENT.md` naming the log directory, the level setting, and how rotation behaves; verify by following the documented steps against a running backend and finding the described file.
- [ ] 6.2 Prove an error line reaches both sinks at once — captured by a test logger and appended to a real log file; verify with an integration test asserting a failed request produces a record in the test logger and a corresponding line in a temp log file.
- [ ] 6.3 Run the full backend suite, `bun run typecheck`, and `bun run lint` in `backend/`; verify all exit 0, with the suite's prior test count plus the newly added logging tests.
- [ ] 6.4 Exercise a complete run manually — start the backend, issue a failing GraphQL call, stop the service — and verify the log file holds the startup line, the failure line, and the shutdown line.

## Workflow follow-up

- After the project's review requirements are satisfied, run `/opsx-archive` to move this change into `openspec/changes/archive/` and merge its delta into the `tooling/backend-run-logs` main spec.
