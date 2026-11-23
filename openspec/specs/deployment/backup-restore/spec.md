# deployment/backup-restore Specification

## Purpose
Define how the container stack's application state is captured into a
self-describing archive and restored from it, so operators can recover from
data loss, corruption, or an accidental change.

## Requirements

### Requirement: One-command backup of the stack's state

The stack SHALL create a complete backup of its application state — the PostgreSQL database, its exported reports, and the attachment store — as a single timestamped archive under `docker/database/`, from one command run in `docker/`.

#### Scenario: Backup with the stack running
- **WHEN** the operator runs the documented backup command while the stack is up
- **THEN** a timestamped archive appears under `docker/database/` containing the database dump, exported reports, and attachment objects
- **AND** every service that was running before the command is running again when it exits

#### Scenario: Backup with the stack stopped
- **WHEN** the operator runs the backup command while the stack is stopped
- **THEN** the archive is still produced
- **AND** the database service is started only to produce the dump and is stopped again afterwards

#### Scenario: A failed capture leaves no partial archive
- **WHEN** the capture fails partway through
- **THEN** the command exits nonzero and leaves no partially written archive under its final name
- **AND** services paused for the capture are started again

### Requirement: Captures are quiescent and complete

Backup SHALL capture the database through the database engine's own consistent snapshot mechanism, and SHALL capture the file-based state — exported reports and the attachment store — only while the services that write them are stopped, so the archive is internally consistent and contains every record committed before the capture.

#### Scenario: Writers are paused for the capture

- **WHEN** a backup captures the exported reports or the attachment store
- **THEN** the services that write that state are stopped for the duration of the capture
- **AND** the database service is not stopped, because its dump is taken through the engine's own consistent snapshot mechanism
- **AND** only services that were running before the backup are restarted afterwards

#### Scenario: The database dump is a consistent snapshot
- **WHEN** a backup captures the database while the API is serving writes
- **THEN** the dump reflects one consistent point in time and contains every record committed before the capture began

#### Scenario: File writers are paused for the capture
- **WHEN** a backup captures the exported reports or the attachment store
- **THEN** the services that write that state are stopped for the duration of the capture
- **AND** only services that were running before the backup are restarted afterwards

#### Scenario: Committed data is always present
- **WHEN** a record or attachment is committed before a backup completes
- **THEN** the archive contains it

### Requirement: One-command restore from an archive

The stack SHALL replace its database, exported reports, and attachment store with the contents of a chosen backup archive from one command — loading the database dump into the PostgreSQL service — and SHALL leave the stack running afterwards.

#### Scenario: Restore replaces state
- **WHEN** the operator runs the documented restore command with an archive
- **THEN** the stack stops, the database, exports, and attachments are replaced with the archive's contents, and the stack starts again
- **AND** records and attachment bytes match the archive

#### Scenario: Restore completes only when the API answers
- **WHEN** a restore finishes replacing state
- **THEN** the command reports success only after the API answers, and otherwise reports failure with a pointer to the service logs

#### Scenario: Restore onto wiped state
- **WHEN** the stack's volumes and attachment directories are empty or missing
- **THEN** the restore recreates them and serves the archived data

### Requirement: A restore preserves the previous state

Before replacing any state, a restore SHALL capture the current database, exports, and attachments into a pre-restore snapshot under `docker/database/`, so an unintended restore can itself be undone.

#### Scenario: Pre-restore snapshot is created
- **WHEN** a restore begins replacing state
- **THEN** a pre-restore snapshot of the current state exists under `docker/database/` before the replacement

#### Scenario: The snapshot can undo the restore
- **WHEN** the operator restores the pre-restore snapshot after a restore
- **THEN** the state from before the first restore is back

### Requirement: Invalid archives are rejected without changes

A restore SHALL verify an archive against its manifest — every member present
and every checksum matching — and SHALL refuse, without modifying any state
or stopping the stack, when verification fails.

#### Scenario: A corrupt archive is rejected

- **WHEN** a member of the archive is missing or its checksum does not match
- **THEN** the restore exits nonzero, names the problem, and replaces no data
- **AND** a stack that was running keeps running

#### Scenario: A file that is not a backup is rejected

- **WHEN** the operator points the restore command at a file that carries no manifest
- **THEN** the restore refuses before any state is touched

### Requirement: Archives are self-describing

Every archive SHALL carry a manifest recording the archive format version,
the capture time, and for each member its file name, byte size, and SHA-256
checksum.

#### Scenario: Inspecting an archive

- **WHEN** an operator lists an archive's contents
- **THEN** the manifest and each state member appear
- **AND** the manifest states the format version, capture time, and each member's name, size, and checksum

### Requirement: Retention bounds the backup directory

After a successful backup the stack SHALL keep only the newest backup
archives — 7 by default, adjusted by `KEEP`, with `KEEP=0` disabling pruning —
and SHALL never automatically delete pre-restore snapshots.

#### Scenario: Old archives are pruned

- **WHEN** the archive count exceeds the configured `KEEP` after a backup
- **THEN** the oldest backup archives are deleted and the newest `KEEP` remain
- **AND** pre-restore snapshots remain untouched

#### Scenario: Pruning is disabled

- **WHEN** `KEEP` is 0
- **THEN** no backup archive is deleted

### Requirement: Backups stay out of git, builds, and secrets

Backup archives SHALL stay out of version control and image build contexts, SHALL be readable only by their owner, and SHALL NOT include the stack's credential file `docker/.env`.

#### Scenario: Archives are not tracked or built
- **WHEN** backup archives exist under `docker/database/`
- **THEN** git reports no change for them
- **AND** neither the backend nor the frontend image build context contains them

#### Scenario: Archive permissions are owner-only
- **WHEN** an archive is created
- **THEN** its file mode permits access only to the owner

#### Scenario: No credential file or unrelated secrets are captured
- **WHEN** an archive's members are inspected
- **THEN** no `.env` member appears
- **AND** none of the stack's other configured secrets (the auth secret, the Garage token secrets) appear in it
- **AND** the only credential bytes an archive carries are the Garage access-key credentials that Garage itself persists inside its metadata database, which a restore needs so attachments stay readable and writable

### Requirement: The recovery procedure is documented

The repository SHALL document the backup and restore workflow: the commands, what is and is not captured, retention, scheduling outside the stack, restoring into a fresh checkout, and what to do when `docker/.env` is lost.

#### Scenario: Documented commands work as written
- **WHEN** the operator follows the documented backup and restore commands against a running stack
- **THEN** each command runs as written

#### Scenario: The guide states coverage and exclusions
- **WHEN** the reader looks for what a backup contains
- **THEN** the guide names the database dump, exports, and attachments as captured, and mail history, proxy state, and `docker/.env` as not captured
