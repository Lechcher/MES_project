#!/usr/bin/env bash
#
# Restore a MES backup archive: PostgreSQL database + exports + Garage
# attachment store.
#
#   cd docker
#   ./restore.sh database/mes-backup-<timestamp>.tar.gz
#
# The archive is verified first (manifest and checksums) and no state changes
# if it fails. The stack is then stopped, the current state is captured as a
# mes-pre-restore-<timestamp>.tar.gz snapshot (so the restore can be undone by
# restoring that snapshot), the database is recreated and loaded from the
# archive's dump and the exports and Garage directories are replaced, and the
# stack is started and checked for readiness.
#
# See docs/DEVELOPMENT.md §14 for the full workflow.
set -euo pipefail

LOG_TAG=mes-restore
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./backup-lib.sh
source "$SCRIPT_DIR/backup-lib.sh"

cd "$DOCKER_DIR"
require_env_file

# --- argument and archive ------------------------------------------------------
if [ "$#" -ne 1 ]; then
	die "usage: $0 <archive.tar.gz> — candidates: ls database/mes-backup-*.tar.gz"
fi
archive="$1"
case "$archive" in
/*) ;;
*) archive="$DOCKER_DIR/$archive" ;;
esac
if [ ! -f "$archive" ]; then
	die "archive not found: $archive"
fi

stage=""
prestaging=""
cleanup() {
	if [ -n "$stage" ]; then
		rm -rf -- "$stage" || true
	fi
	if [ -n "$prestaging" ]; then
		rm -rf -- "$prestaging" || true
	fi
}
trap cleanup EXIT

# --- 1. verify before touching anything -----------------------------------------
log "verifying archive $(basename "$archive")"
if ! verify_archive "$archive"; then
	die "refusing to restore from an invalid archive — no state was changed"
fi

# --- 2. stop the stack -----------------------------------------------------------
log "stopping the stack"
$COMPOSE down

# --- 3. safety snapshot: archive the current state first --------------------------
pre="$(archive_path mes-pre-restore)"
prestaging="$(new_staging)"
log "snapshotting the current state as $(basename "$pre") so this restore can be undone"
record_writer_state
record_database_state
# The database service is up for the snapshot dump (the stack is down), and
# returned to the state it was in afterwards.
ensure_postgres_up
dump_database "$prestaging"
capture_file_state "$prestaging"
stop_postgres_if_started
write_manifest "$prestaging"
pack_archive "$prestaging" "$pre"
rm -rf -- "$prestaging"
prestaging=""

# --- 4. replace the state -----------------------------------------------------------
log "loading the database from the archive's dump"
$COMPOSE start "$PG_SERVICE"
wait_postgres_ready || die "the $PG_SERVICE service did not become ready"
# A clean recreate: the dump carries the schema and data, so dropping the
# database first removes anything the archive does not.
$COMPOSE exec -T "$PG_SERVICE" \
	psql -U "${POSTGRES_USER:-mes}" -d postgres \
	-c "DROP DATABASE IF EXISTS \"$PG_DB\"" \
	-c "CREATE DATABASE \"$PG_DB\""
stage="$(new_staging)"
tar -xzOf "$archive" database.dump >"$stage/database.dump"
$COMPOSE exec -T -i "$PG_SERVICE" \
	pg_restore -U "${POSTGRES_USER:-mes}" --no-owner --no-privileges \
	-d "$PG_DB" <"$stage/database.dump"
rm -rf -- "$stage"
stage=""

log "replacing the exports directory"
stage="$(new_staging)"
tar -xzOf "$archive" exports.tar >"$stage/exports.tar"
$COMPOSE run --rm --no-deps -T -u 0 -v "$stage:/backup:ro" backend \
	sh -c 'find /app/backend/data/exports -mindepth 1 -delete 2>/dev/null || true; tar -xf /backup/exports.tar -C /app/backend'
rm -rf -- "$stage"
stage=""

log "replacing the Garage directories"
for member in garage-meta garage-data; do
	target="$DOCKER_DIR/volumes/garage/${member#garage-}"
	mkdir -p "$target"
	find "$target" -mindepth 1 -delete
	tar -xzOf "$archive" "$member.tar" | tar -xf - -C "$DOCKER_DIR/volumes/garage"
done

# --- 5. start and report --------------------------------------------------------------
log "starting the stack"
$COMPOSE up -d

if ! wait_backend_health; then
	die "the backend did not report healthy within ${HEALTH_TIMEOUT:-90}s — check: $COMPOSE logs backend"
fi
log "backend is healthy"

origin="$(sed -n 's/^MES_PUBLIC_ORIGIN=//p' "$DOCKER_DIR/.env" | tail -1 | tr -d '"\r')"
if ! command -v curl >/dev/null 2>&1; then
	warn "curl not found — skipping the origin check"
elif [ -z "$origin" ]; then
	warn "MES_PUBLIC_ORIGIN is not set in .env — skipping the origin check"
else
	answered="no"
	for _ in $(seq 1 30); do
		code="$(curl -s -o /dev/null -w '%{http_code}' "$origin/api/mes/session" 2>/dev/null || true)"
		if [ "$code" = "200" ]; then
			answered="yes"
			break
		fi
		sleep 2
	done
	if [ "$answered" = "yes" ]; then
		log "the app answers at $origin"
	else
		die "the app did not answer at $origin within 60s — check: $COMPOSE logs"
	fi
fi

log "restore complete from $(basename "$archive")"
log "the previous state is kept in $(basename "$pre") — undo with: $0 database/$(basename "$pre")"