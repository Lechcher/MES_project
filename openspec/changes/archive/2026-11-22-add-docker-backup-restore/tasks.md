# Tasks

## 1. Repository hygiene

- [x] 1.1 Add `/docker/backups/` to `.gitignore` and `docker/backups` to the root `.dockerignore`; verify with a placeholder file under `docker/backups/`: `git status` lists nothing for it and a backend image build context does not include `docker/backups` (inspect the context listing or build output)

## 2. Backup command

- [x] 2.1 Add `docker/backup-lib.sh` with the shared primitives: locate the compose directory, resolve the project name from `docker compose config` (fallback `mes`), `running()` detection via `com.docker.compose.*` container labels, capture of the three members (`backend-data.tar` via `docker compose run --rm --no-deps -T -u 0 -v "$staging:/backup" backend tar -cf …`; `garage-meta.tar` and `garage-data.tar` via host `tar -C volumes/garage …`), manifest write/read (`format=1`, `created_at`, `member <name> <sha256> <bytes>`), checksum verification, and pruning; verify by sourcing it and capturing the current state into a temp staging directory: each member lists with `tar -tf` and every manifest checksum matches a fresh `sha256sum`
- [x] 2.2 Add `docker/backup.sh`: require `docker/.env`, clear stale `.tmp-*`, stop only the running writer services (`backend`, `garage`), capture, commit the final `mes-backup-<timestamp>.tar.gz` atomically (temp name → rename, `umask 077`, trap cleanup), resume exactly the previously running services and wait briefly for backend health, then prune `mes-backup-*` beyond `KEEP` (default 7, `0` disables); verify with the stack up: two runs produce two archives, all five services run afterwards, and `KEEP=1` keeps only the newest `mes-backup-*` while any `mes-pre-restore-*` remains
- [x] 2.3 Verify the stopped-stack and failure paths of `docker/backup.sh`: with the stack fully stopped it produces an archive and starts nothing; an induced capture failure (e.g. `chmod 000 volumes/garage/meta` during the run) exits nonzero, leaves no final archive, cleans staging/temp files, and resumes the paused services; restore directory permissions after the check
- [x] 2.4 Verify a capture is quiescent and complete against live data: confirm from the run output that `backend` and `garage` are paused for the capture, note a task count before the run, then confirm the archived database (extracted from `backend-data.tar`, opened with a bun helper) has the same count and that an existing attachment object appears in `garage-data.tar`
- [x] 2.5 Verify archive hygiene: members contain no `.env`; `BETTER_AUTH_SECRET` and `GARAGE_RPC_SECRET` appear in no member; the only secret bytes are the S3 access-key credentials Garage persists inside its own metadata database (required by a restore); archives are mode `600` and staging directories `700`

## 3. Restore command

- [x] 3.1 Add `docker/restore.sh <archive>`: validate the archive before touching anything (manifest present; every member's streamed `sha256sum` and size match; refuse with a named problem otherwise), `docker compose down`, capture the current state into `mes-pre-restore-<timestamp>.tar.gz`, replace the backend volume through the helper (`find … -mindepth 1 -delete` then `tar -xf`, as root) and the Garage directories from streamed members, `docker compose up -d`, then poll the backend container's health and the public origin, reporting success only when the API answers (timeout → nonzero with a `docker compose logs` hint); verify against a real archive: a row count and an attachment download through `http://localhost:8080` match the backup, the stack ends healthy, and a `mes-pre-restore-*` snapshot exists
- [x] 3.2 Verify refusal and guards: a corrupted archive (flipped byte) and a non-archive file are both refused with a named problem, nonzero exit, no state replaced, and a running stack left running; both `backup.sh` and `restore.sh` also fail with a clear message when `docker/.env` is temporarily moved away
- [x] 3.3 Verify the pre-restore snapshot undoes a restore: plant a marker file in `exports/`, restore an older archive, confirm the marker is gone, then restore the `mes-pre-restore-*` snapshot and confirm the marker and newer data are back
- [x] 3.4 Disaster drill on wiped state: `docker compose down -v`, clear `volumes/garage/{meta,data}`, run `./restore.sh <archive>`, then sign in through the proxy with a seeded account, confirm task counts match the backup, and download an attachment byte-identically

## 4. Documentation

- [x] 4.1 Add a "Backup and restore" subsection to `docs/DEVELOPMENT.md` §14 covering the two commands and `KEEP`, what is captured and excluded (mail history, proxy state, `docker/.env`), retention and the safety snapshot, an optional host cron example, restoring into a fresh checkout, and keeping/recovering `docker/.env` (including that `./init-garage.sh` reprints the retained S3 key secret after a restore); verify every referenced file, command, and variable exists as written and run the documented backup command once

## 5. Integration checks

- [x] 5.1 Run the existing suites unchanged and record the result: `cd frontend && bun test src/ && bunx tsc --noEmit && bunx biome check` (all pass) and `cd backend && bunx biome check` (passes; the backend unit suite and `tsc` failures are pre-existing host-specific issues and must not grow)
- [x] 5.2 Run the complete operator journey from the documentation on the running stack: backup, change data, restore, and verify the restored state and the app served on `http://localhost:8080` match the archive

## Workflow follow-up

- Run `openspec validate --strict` and archive the change with `/opsx-archive` after review.
