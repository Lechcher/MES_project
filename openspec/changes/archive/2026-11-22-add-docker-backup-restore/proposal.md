# Proposal

## Why

The container stack keeps all MES state in two places — the SQLite database
(with exported reports) and the Garage attachment store — and nothing copies
that state out or brings it back. A bad migration, an accidental delete, or a
corrupted volume currently means permanent data loss. Operators need a
one-command snapshot and a one-command restore they can trust in an emergency.

## What Changes

- Add `docker/backup.sh`: writes a single timestamped archive under
  `docker/backups/` containing the database, exported reports, and attachment
  objects. Services that write that state are paused for the capture and
  resumed afterwards; an already-stopped stack stays stopped.
- Add `docker/restore.sh <archive>`: validates the archive before touching
  anything, archives the current state as a pre-restore snapshot, replaces the
  database, exports, and attachments from the archive, and starts the stack
  again, waiting until the API answers.
- Keep the newest 7 archives by default (`KEEP` overridable, `0` disables
  pruning). Pre-restore snapshots are never auto-pruned.
- Archives are self-describing: a manifest records the format version, creation
  time, and each member's size and SHA-256 checksum, and a restore verifies
  them before any state changes.
- Keep backups out of git and image build contexts (`docker/backups/`
  gitignored).
- Document the workflow in `docs/DEVELOPMENT.md` §14: what is and is not
  captured, retention, an optional host cron example, restoring into a fresh
  checkout, and recovering when `docker/.env` is lost.

Out of scope by decision: Mailpit mail history and Caddy state (disposable
local artifacts), and scheduling inside the stack (scripts are on-demand;
scheduling is a documented host-level choice). `docker/.env` is deliberately
not captured — it holds credentials and stays with the operator.

## Capabilities

### New Capabilities

- `deployment/backup-restore`: capturing the container stack's state into a
  portable, verified archive and restoring from it, including safety
  snapshots, retention, and documented recovery procedures.

### Modified Capabilities

None.

## Impact

- New: `docker/backup.sh`, `docker/restore.sh`, `docker/backup-lib.sh`,
  `docker/backups/` (gitignored, created on first run).
- Changed: `.gitignore`, `.dockerignore`, `docs/DEVELOPMENT.md`.
- Unchanged: service definitions, published ports, runtime behavior, and
  application code — the scripts orchestrate the existing Compose stack only.
- Operational: a backup briefly stops the backend and Garage (seconds to
  minutes, depending on data size); a restore stops the whole stack for the
  replacement. Archives are plaintext copies of application data (including
  password hashes) and are written with restrictive permissions.
