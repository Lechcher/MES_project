#!/usr/bin/env bash
#
# Create a MES backup: PostgreSQL dump + exports + Garage attachment store.
#
#   cd docker
#   ./backup.sh
#
# Writes docker/database/mes-backup-<timestamp>.tar.gz (mode 600) containing
# manifest.txt, database.dump (a custom-format pg_dump of the application
# database), exports.tar, garage-meta.tar, and garage-data.tar.
#
# The database is captured through pg_dump's own consistent snapshot, so the
# stack keeps running while it is dumped. The file-based state (exports,
# Garage directories) is captured only while the services that write it are
# stopped; an already-stopped stack stays stopped, and the database service is
# started only for the dump and stopped again afterwards when it was stopped
# before. After a successful backup, the newest KEEP (default 7) mes-backup
# archives are kept and older ones are deleted.
#
# See docs/DEVELOPMENT.md §14 for the full workflow.
set -euo pipefail

LOG_TAG=mes-backup
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./backup-lib.sh
source "$SCRIPT_DIR/backup-lib.sh"

cd "$DOCKER_DIR"
require_env_file
clean_stale_staging

archive="$(archive_path mes-backup)"
staging=""
writers_paused=0

# Runs on every exit: if the capture was interrupted after the writers were
# paused, start them again; restore the database service to the state it was
# in before, and never leave staging or temp files behind.
cleanup() {
	if [ "$writers_paused" = 1 ]; then
		warn "backup interrupted — restarting paused services"
		resume_writers || true
	fi
	stop_postgres_if_started || true
	if [ -n "$staging" ]; then
		rm -rf -- "$staging" || true
	fi
	rm -f -- "$archive.tmp" || true
}
trap cleanup EXIT

log "creating backup $(basename "$archive")"

staging="$(new_staging)"
record_writer_state
record_database_state

# 1. The database: a consistent snapshot while the stack keeps serving.
ensure_postgres_up
log "dumping the database (database.dump)"
dump_database "$staging"

# 2. The file state: writers paused, exports and Garage directories copied.
writers_paused=1
pause_writers
capture_file_state "$staging"

if ! resume_writers; then
	die "could not restart all paused services — check: $COMPOSE ps"
fi
writers_paused=0

# Return the database service to the state it was in before the backup.
stop_postgres_if_started

write_manifest "$staging"
pack_archive "$staging" "$archive"

if [ "$WAS_RUNNING_BACKEND" = 1 ]; then
	if wait_backend_health; then
		log "backend is healthy again"
	else
		warn "backend did not report healthy within ${HEALTH_TIMEOUT:-90}s — check: $COMPOSE logs backend"
	fi
fi

prune_backups
log "backup complete: $archive"