#!/usr/bin/env bash
#
# Shared primitives for docker/backup.sh and docker/restore.sh.
#
# Sourced, never executed directly:
#
#   source "$(dirname "$0")/backup-lib.sh"
#
# Callers run with `set -euo pipefail`, `umask 077`, and their working
# directory set to this file's directory (the scripts do all three). The
# library defines the paths (DOCKER_DIR, BACKUP_DIR, COMPOSE), project-name
# resolution, container state detection, the database dump, writer quiescing,
# capture of the archive members, manifest write/verify, packing, retention
# pruning, and the backend health wait.
#
# Archive layout (format=2): manifest.txt plus a custom-format PostgreSQL
# dump (database.dump) and three uncompressed tar members — exports.tar,
# garage-meta.tar, garage-data.tar.

LOG_TAG="${LOG_TAG:-mes-backup}"

# This file's directory (the compose directory) and where archives live.
DOCKER_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${MES_BACKUP_DIR:-$DOCKER_DIR/database}"
case "$BACKUP_DIR" in
/*) ;;
*) BACKUP_DIR="$DOCKER_DIR/$BACKUP_DIR" ;;
esac

# Compose command; override with COMPOSE=... (mirrors init-garage.sh).
COMPOSE="${COMPOSE:-docker compose}"

ARCHIVE_MEMBERS=(database.dump exports.tar garage-meta.tar garage-data.tar)

# The PostgreSQL service and database names (compose service `postgres`,
# POSTGRES_DB from docker/.env).
PG_SERVICE=postgres
PG_DB="${POSTGRES_DB:-mes}"

log() { printf '[%s] %s\n' "$LOG_TAG" "$*"; }
warn() { printf '[%s] WARNING: %s\n' "$LOG_TAG" "$*" >&2; }
die() {
	printf '[%s] ERROR: %s\n' "$LOG_TAG" "$*" >&2
	exit 1
}

timestamp() { date +%Y%m%d-%H%M%S; }

require_env_file() {
	if [ ! -f "$DOCKER_DIR/.env" ]; then
		die "docker/.env is missing — copy docker/.env.example to docker/.env and fill it in (docs/DEVELOPMENT.md §14)."
	fi
}

# The Compose project name (`name:` in docker-compose.yml), resolved once.
MES_COMPOSE_PROJECT=""
compose_project() {
	if [ -z "$MES_COMPOSE_PROJECT" ]; then
		MES_COMPOSE_PROJECT="$(
			$COMPOSE config 2>/dev/null | sed -n 's/^name:[[:space:]]*//p' | head -1 || true
		)"
		if [ -z "$MES_COMPOSE_PROJECT" ]; then
			MES_COMPOSE_PROJECT="mes"
		fi
	fi
	printf '%s' "$MES_COMPOSE_PROJECT"
}

# True while the named service has a running container in this project.
# `docker compose ps` output differs across providers, so detection relies on
# the com.docker.compose.* labels that both Docker Compose and podman-compose
# set. Use in `if` conditions.
running() {
	docker ps -q \
		--filter "label=com.docker.compose.project=$(compose_project)" \
		--filter "label=com.docker.compose.service=$1" | grep -q .
}

# --- writer state: backend (exports) and garage (files) are paused ----------
WAS_RUNNING_BACKEND=0
WAS_RUNNING_GARAGE=0

record_writer_state() {
	WAS_RUNNING_BACKEND=0
	WAS_RUNNING_GARAGE=0
	if running backend; then
		WAS_RUNNING_BACKEND=1
	fi
	if running garage; then
		WAS_RUNNING_GARAGE=1
	fi
}

# Stops only the file-state writers that were running, so a stopped stack
# stays stopped. The database is captured through pg_dump's own consistent
# snapshot, so it is never paused.
pause_writers() {
	if [ "$WAS_RUNNING_BACKEND" = 1 ]; then
		log "stopping backend for the file capture"
		$COMPOSE stop backend
	fi
	if [ "$WAS_RUNNING_GARAGE" = 1 ]; then
		log "stopping garage for the file capture"
		$COMPOSE stop garage
	fi
}

# Starts the writer services that were running before the capture. Never
# aborts on a single failure (it also runs from exit traps): reports each
# failure and returns nonzero when any service could not be started.
resume_writers() {
	local failed=0
	if [ "$WAS_RUNNING_GARAGE" = 1 ]; then
		log "restarting garage"
		if ! $COMPOSE start garage; then
			warn "could not restart garage"
			failed=1
		fi
	fi
	if [ "$WAS_RUNNING_BACKEND" = 1 ]; then
		log "restarting backend"
		if ! $COMPOSE start backend; then
			warn "could not restart backend"
			failed=1
		fi
	fi
	return "$failed"
}

# --- database state: postgres runs for the dump, stopped before and after ----
STARTED_POSTGRES=0

record_database_state() {
	STARTED_POSTGRES=0
	if ! running "$PG_SERVICE"; then
		STARTED_POSTGRES=1
	fi
}

# Starts the database service when it is not running, so a stopped stack can
# still be backed up. The caller stops it again through
# stop_postgres_if_started.
ensure_postgres_up() {
	if [ "$STARTED_POSTGRES" = 1 ]; then
		log "starting $PG_SERVICE for the dump"
		$COMPOSE start "$PG_SERVICE"
		wait_postgres_ready || die "the $PG_SERVICE service did not become ready"
	fi
}

stop_postgres_if_started() {
	if [ "$STARTED_POSTGRES" = 1 ]; then
		log "stopping $PG_SERVICE again (it was stopped before the backup)"
		$COMPOSE stop "$PG_SERVICE" || warn "could not stop $PG_SERVICE again"
	fi
}

# Waits (bounded) until the database service answers on its own port.
wait_postgres_ready() {
	local timeout="${HEALTH_TIMEOUT:-90}"
	local deadline=$((SECONDS + timeout)) cid status
	while :; do
		cid="$(docker ps -q \
			--filter "label=com.docker.compose.project=$(compose_project)" \
			--filter "label=com.docker.compose.service=$PG_SERVICE")"
		if [ -n "$cid" ]; then
			status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)"
			if [ "$status" = "healthy" ]; then
				return 0
			fi
		fi
		if [ "$SECONDS" -ge "$deadline" ]; then
			return 1
		fi
		sleep 2
	done
}

# --- staging and capture -----------------------------------------------------
# A fresh staging directory under BACKUP_DIR (mode 700). A killed run leaves
# an obvious .tmp-* leftover that the next run clears.
new_staging() {
	mkdir -p "$BACKUP_DIR"
	local dir="$BACKUP_DIR/.tmp-$(timestamp)-$$"
	mkdir -p "$dir"
	chmod 700 "$dir"
	printf '%s' "$dir"
}

clean_stale_staging() {
	local dir
	shopt -s nullglob
	for dir in "$BACKUP_DIR"/.tmp-*; do
		warn "removing stale staging directory $(basename "$dir")"
		rm -rf -- "$dir"
	done
	shopt -u nullglob
}

# A custom-format pg_dump of the application database, streamed from the
# postgres service. The service's own credentials (POSTGRES_USER/DB) make the
# in-container pg_dump work without the password.
dump_database() {
	$COMPOSE exec -T "$PG_SERVICE" \
		pg_dump -U "${POSTGRES_USER:-mes}" -Fc -d "$PG_DB" \
		>"$1/database.dump"
}

# The exports directory is not a host path portably, so it is captured
# through the stack's own image. -u 0 is required: under rootless Podman a
# non-root container user cannot write the host staging directory.
capture_exports() {
	$COMPOSE run --rm --no-deps -T -u 0 -v "$1:/backup" backend \
		tar -cf /backup/exports.tar -C /app/backend data/exports
}

# The Garage directories are plain host directories (bind mounts).
capture_garage_meta() {
	tar -cf "$1/garage-meta.tar" -C "$DOCKER_DIR/volumes/garage" meta
}

capture_garage_data() {
	tar -cf "$1/garage-data.tar" -C "$DOCKER_DIR/volumes/garage" data
}

# Captures the file-based members into a staging directory. Writers must
# already be stopped (pause_writers) when they are part of the running stack.
capture_file_state() {
	local staging="$1" dir
	for dir in meta data; do
		mkdir -p "$DOCKER_DIR/volumes/garage/$dir"
	done
	log "capturing exports (exports.tar)"
	capture_exports "$staging"
	log "capturing Garage metadata (garage-meta.tar)"
	capture_garage_meta "$staging"
	log "capturing Garage objects (garage-data.tar)"
	capture_garage_data "$staging"
}

# --- manifest, packing, verification ----------------------------------------
write_manifest() {
	local staging="$1" f
	for f in "${ARCHIVE_MEMBERS[@]}"; do
		if [ ! -f "$staging/$f" ]; then
			die "expected member $f was not captured"
		fi
	done
	{
		printf 'format=2\n'
		printf 'created_at=%s\n' "$(date -Iseconds)"
		for f in "${ARCHIVE_MEMBERS[@]}"; do
			printf 'member %s %s %s\n' \
				"$f" \
				"$(sha256sum "$staging/$f" | cut -d' ' -f1)" \
				"$(stat -c %s "$staging/$f")"
		done
	} >"$staging/manifest.txt"
}

# Prints the manifest stored inside an archive; fails when it is unreadable.
archive_manifest() {
	tar -xzOf "$1" manifest.txt 2>/dev/null
}

# SHA-256 and byte size of one member, computed from the archive stream.
archive_member_sha() {
	tar -xzOf "$1" "$2" 2>/dev/null | sha256sum | cut -d' ' -f1
}

archive_member_size() {
	tar -xzOf "$1" "$2" 2>/dev/null | wc -c | tr -d '[:space:]'
}

# Verifies an archive against its manifest: the format marker, the expected
# member set, and every member's SHA-256 and size. Prints the first problem
# and returns nonzero, or returns zero silently.
verify_archive() {
	local archive="$1" manifest kind name sha size got expected
	manifest="$(archive_manifest "$archive")" || {
		printf 'cannot read manifest.txt from %s (not a MES backup, or damaged)\n' "$archive" >&2
		return 1
	}
	if ! grep -q '^format=2$' <<<"$manifest"; then
		printf 'unsupported archive format in %s (expected format=2 — the PostgreSQL backup format)\n' "$archive" >&2
		return 1
	fi
	for expected in "${ARCHIVE_MEMBERS[@]}"; do
		if ! grep -q "^member $expected " <<<"$manifest"; then
			printf 'manifest in %s is missing %s\n' "$archive" "$expected" >&2
			return 1
		fi
	done
	while read -r kind name sha size; do
		if [ "$kind" != "member" ]; then
			continue
		fi
		got="$(archive_member_sha "$archive" "$name")" || {
			printf 'member %s is missing or unreadable in %s\n' "$name" "$archive" >&2
			return 1
		}
		if [ "$got" != "$sha" ]; then
			printf 'member %s checksum mismatch in %s\n' "$name" "$archive" >&2
			return 1
		fi
		got="$(archive_member_size "$archive" "$name")" || {
			printf 'member %s is unreadable in %s\n' "$name" "$archive" >&2
			return 1
		}
		if [ "$got" != "$size" ]; then
			printf 'member %s size mismatch in %s\n' "$name" "$archive" >&2
			return 1
		fi
	done <<<"$manifest"
	return 0
}

# Where a new archive of the given kind (mes-backup, mes-pre-restore) goes.
archive_path() {
	printf '%s/%s-%s.tar.gz' "$BACKUP_DIR" "$1" "$(timestamp)"
}

# Packs a completed staging directory into the final archive: one gzip pass,
# written under a temporary name and renamed only when complete.
pack_archive() {
	local staging="$1" final="$2" tmp="$2.tmp"
	rm -f -- "$tmp"
	tar -czf "$tmp" -C "$staging" manifest.txt "${ARCHIVE_MEMBERS[@]}"
	mv -f -- "$tmp" "$final"
	chmod 600 "$final"
}

# Keeps the newest $KEEP (default 7; 0 disables) mes-backup-*.tar.gz files.
# Pre-restore snapshots never match and are left alone.
prune_backups() {
	local keep="${KEEP:-7}"
	case "$keep" in
	'' | *[!0-9]*) die "KEEP must be a non-negative integer (got '$keep')" ;;
	esac
	if [ "$keep" = 0 ]; then
		return 0
	fi
	local -a files sorted
	shopt -s nullglob
	files=("$BACKUP_DIR"/mes-backup-*.tar.gz)
	shopt -u nullglob
	if [ "${#files[@]}" -le "$keep" ]; then
		return 0
	fi
	# Names are timestamps, so reverse lexical order is newest first.
	mapfile -t sorted < <(printf '%s\n' "${files[@]}" | sort -r)
	local i
	for ((i = keep; i < ${#sorted[@]}; i++)); do
		log "pruning old backup $(basename "${sorted[i]}")"
		rm -f -- "${sorted[i]}"
	done
	return 0
}

# Waits (bounded) until the backend service reports healthy; used after
# resuming writers and after a restore. Returns nonzero on timeout.
wait_backend_health() {
	local timeout="${HEALTH_TIMEOUT:-90}"
	local deadline=$((SECONDS + timeout)) cid status
	while :; do
		cid="$(docker ps -q \
			--filter "label=com.docker.compose.project=$(compose_project)" \
			--filter "label=com.docker.compose.service=backend")"
		if [ -n "$cid" ]; then
			status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)"
			if [ "$status" = "healthy" ]; then
				return 0
			fi
		fi
		if [ "$SECONDS" -ge "$deadline" ]; then
			return 1
		fi
		sleep 2
	done
}
