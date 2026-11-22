# Design

## Context

See `proposal.md` — Why. This design builds on the container stack delivered by
`add-docker-compose-stack` and takes its files as they are today
(`docker/docker-compose.yml`, `docker/init-garage.sh`, `docs/DEVELOPMENT.md`
§14).

State to protect:

- Named volume `backend-data` → `/app/backend/data`: `mes.db` (WAL mode, plus
  `-wal`/`-shm`), and `exports/`.
- Garage bind mounts `docker/volumes/garage/{meta,data}`: SQLite metadata
  (layout, bucket/key registry, object index) and attachment objects.
- Disposable, excluded: `mailpit-data`, `caddy-data`, `caddy-config`,
  `docker/.env`.

Mechanics verified against the running stack before writing this design
(reference host: Docker CLI emulated by Podman 6.1.4, rootless, with
`podman-compose` 1.6.0; the scripts must equally work under Docker Compose v2):

- `podman-compose run` supports `--rm`, `--no-deps`, `-T`, `-u/--user`, `-v`;
  Docker Compose v2 supports the same flags.
- The backend runtime image contains `tar` and `find`, but not `gzip` or
  `sha256sum` (Debian slim), so members are packed uncompressed in the
  container and compressed/checked on the host.
- A `run` container with `-u 0` can write to a host bind mount under rootless
  Podman (a non-root container user maps to a sub-UID and cannot); the files it
  writes belong to the invoking host user.
- Extracting as container root preserves the archived ownership (uid/gid 1000 =
  `bun`), so a restored volume stays writable by the backend.
- `docker compose ps -q <service>` is not usable on the reference provider
  (silently returns nothing; `ps <service>` errors), but container labels are:
  `docker ps -q --filter label=com.docker.compose.project=mes --filter
  label=com.docker.compose.service=<service>` returns the container id only
  while it runs (verified in both directions). podman-compose sets the
  `com.docker.compose.*` labels.
- The Compose project name is pinned (`name: mes`) and `docker compose config`
  prints it.

## Goals / Non-Goals

**Goals:**

- One command captures every durable byte of application state into one file;
  one command puts it back and reports readiness.
- Nothing is replaced until the archive passes integrity checks, and the
  previous state is always snapshotted first — a bad archive and a wrong
  restore are both recoverable.
- Bounded, predictable disk usage and hygiene: no git tracking, no build
  contexts, no credentials.
- Provider-neutral mechanics: Compose CLI plus host coreutils only (no jq,
  python, or provider-specific volume commands).

**Non-Goals:**

- Point-in-time recovery, incremental/differential backups, archive
  encryption (an operator step; documented).
- Off-host replication and scheduling inside the stack (proposal).
- Capturing Mailpit, Caddy, images, or `docker/.env`.
- Any change to services, ports, or application code.

## Decisions

### D1 — Captured scope: application data only

| Member | Source | Contents |
| --- | --- | --- |
| `backend-data.tar` | named volume `backend-data` | `data/mes.db`, `data/mes.db-wal`, `data/mes.db-shm`, `data/exports/**` |
| `garage-meta.tar` | `docker/volumes/garage/meta` | Garage metadata (layout, bucket/key registry, object index) |
| `garage-data.tar` | `docker/volumes/garage/data` | attachment objects (content-addressed blobs) |

Garage metadata and objects are captured together — either alone leaves
attachments unreadable. Mailpit mail and Caddy state are disposable; `docker/.env`
holds credentials and stays with the operator.

### D2 — Consistency: quiesce the writers, then copy

The database runs in WAL mode and Garage's metadata is itself SQLite; copying
either under a live writer can capture a torn state, and Garage has no online
snapshot command. A backup therefore stops only the two writers — `backend` and
`garage` — captures, and then resumes exactly the services that were running
before (detected per D6). `frontend`, `caddy`, and `mailpit` keep running; API
calls during the window fail fast and recover on resume. Rejected: SQLite
`VACUUM INTO` hot copy — Garage would still require a stop, so it would add a
second mechanism for no gain.

### D3 — Capture mechanics

Backend volume (a named volume is not a host path portably), through the
stack's own image as root:

```bash
docker compose run --rm --no-deps -T -u 0 -v "$staging:/backup" backend \
  tar -cf /backup/backend-data.tar -C /app/backend data
```

Garage (plain host directories), directly on the host:

```bash
tar -cf "$staging/garage-meta.tar" -C volumes/garage meta
tar -cf "$staging/garage-data.tar" -C volumes/garage data
```

`compose run` resolves the image and the named volume per provider, so the
scripts never touch provider-specific volume paths. `-u 0` is required because
a non-root container user cannot write the host staging directory under
rootless Podman. Rejected: `docker compose cp` (not uniformly supported by
podman-compose); streaming through stdout (provider output is not guaranteed
byte-clean); `podman volume export/import` (not portable to Docker).

### D4 — Archive format

One file, `docker/backups/mes-backup-<YYYYmmdd-HHMMSS>.tar.gz`, containing:

- `manifest.txt` — `format=1`, `created_at=<ISO-8601>`, and one
  `member <name> <sha256> <bytes>` line per member.
- The three uncompressed members from D1.

Members are uncompressed `tar` files (the helper image has no gzip);
compression happens once, when the outer archive is packed on the host:

```bash
tar -czf "$tmp" -C "$staging" manifest.txt backend-data.tar garage-meta.tar garage-data.tar
```

The archive is written under a temporary name and renamed only when complete; a
`trap` removes the staging directory (`.tmp-<ts>/`) and temp files on any exit.
One file makes off-host copying and long-term storage trivial.

### D5 — Restore flow

```
./restore.sh <archive>
 1. Verify   read manifest.txt (tar -xzOf); for each member stream
             tar -xzOf archive <member> | sha256sum and compare against the
             manifest. Any failure → exit nonzero, nothing touched.
 2. Stop     docker compose down           # keeps volumes and docker/volumes
 3. Safety   capture the current state into mes-pre-restore-<ts>.tar.gz
             (same members as a backup; the stack is already stopped)
 4. Replace  backend — stage the member, then run:
               docker compose run --rm --no-deps -T -u 0 \
                 -v "$staging:/backup:ro" backend \
                 sh -c 'find /app/backend/data -mindepth 1 -delete &&
                        tar -xf /backup/backend-data.tar -C /app/backend'
             garage — streamed, so attachment-sized data is never staged:
               find volumes/garage/<dir> -mindepth 1 -delete
               tar -xzOf "$archive" garage-<dir>.tar | tar -xf - -C volumes/garage
 5. Start    docker compose up -d
 6. Report   poll the backend container's health (label lookup + inspect of
             State.Health.Status) until healthy; when curl is present, also
             confirm MES_PUBLIC_ORIGIN (from .env) answers. On timeout, exit
             nonzero with a `docker compose logs` hint; restored data stays.
```

Extraction runs as container root so the archived ownership (uid 1000, `bun`)
is restored; `find … -delete` (not `rm -rf`) also removes dotfiles and leaves
the mount point itself in place. Garage directories are replaced on the host,
mirroring their bind-mount layout.

### D6 — Running-state detection via compose labels

Because `docker compose ps` and `-q` are unreliable on the reference provider,
the scripts detect what to pause and resume with:

```bash
running() {
  docker ps -q --filter "label=com.docker.compose.project=$project" \
               --filter "label=com.docker.compose.service=$1" | grep -q .
}
```

`$project` comes from `docker compose config` (line `name: mes`), with `mes` as
fallback. Verified: empty while stopped, non-empty while running. This uses only
labels both Compose implementations set.

### D7 — Safety snapshot and retention

- Every restore first writes `mes-pre-restore-<ts>.tar.gz` (step 3) so a wrong
  archive can be undone by restoring the snapshot.
- After a successful backup, keep the newest `KEEP` (default 7, `0` disables)
  `mes-backup-*.tar.gz` files and delete older ones. `mes-pre-restore-*` never
  matches the prune pattern and is kept until the operator removes it.

### D8 — Secrets, permissions, and recovery notes

- Scripts run with `umask 077`: archives and snapshots are `0600`, staging is
  `0700`. Archives are plaintext copies of application data (password hashes
  included) — documented.
- The scripts never read or copy `docker/.env`. Garage persists access-key
  credentials in its own metadata database, so any complete archive
  necessarily contains them — without them a restored Garage could not serve
  or accept attachments, which is exactly the state a restore restores. No
  other secret material appears in an archive: the auth secret and the Garage
  RPC/admin/metrics tokens are configuration-only and are captured nowhere
  (verified per archive in task 2.5).
- `docker/.env` is never a member. The docs tell operators to keep `.env` with
  their backups, and how to recover when it is lost: recreate it from
  `.env.example`, restore the archive, then run `./init-garage.sh` — it is
  idempotent and unconditionally prints the retained S3 key's secret
  (`garage key info --show-secret`) from the restored Garage metadata. A new
  `BETTER_AUTH_SECRET` invalidates sessions; expected and documented.
- A restored database older than the code migrates forward at boot (additive
  migrations); docs recommend restoring with the same or a newer checkout.

### D9 — Script layout and conventions

- `docker/backup-lib.sh` — shared: path/argument setup, `running()`, capture of
  the three members, manifest write/read, checksum verify, prune.
- `docker/backup.sh` — D2 pause → D3 capture → D4 commit → resume → D7 prune.
- `docker/restore.sh <archive>` — the D5 flow.
- Bash, `set -euo pipefail`, `cd "$(dirname "$0")"` (works from anywhere in the
  repo), `COMPOSE=${COMPOSE:-docker compose}`, plain `echo` progress —
  mirroring `init-garage.sh`. Host tools used: `tar`, `sha256sum`, `find`,
  `docker`/compose, and `curl` (health check; skipped with a warning when
  absent). Both scripts require `docker/.env` and fail with a clear message
  when it is missing.

### D10 — Repository hygiene and documentation

- `.gitignore`: add `/docker/backups/` (archives are already covered by the
  global `**/*.tar.gz` rule; the explicit entry also covers staging and temp
  files).
- Root `.dockerignore`: add `docker/backups` so no build context can pick up
  archive data.
- `docs/DEVELOPMENT.md` §14: new "Backup and restore" subsection with commands,
  captured/excluded content, retention and `KEEP`, a cron example, the `.env`
  guidance and lost-`.env` recovery, and the safety-snapshot undo.

## Risks / Trade-offs

- **Capture time grows with attachment size** → only the two writers pause;
  the UI and mail keep running; docs show a cron example for off-hours runs.
- **Staging uses about the uncompressed state size under `docker/backups/`** →
  single visible location, cleaned by trap; documented free-space note.
- **Rootless ownership subtleties on restore** → extraction as container root
  restores the archived uid 1000 (`bun`); the verification tasks re-check app
  write access after a restore (backend healthy, attachment download).
- **Provider flag differences** → every flag used is supported by
  podman-compose 1.6 and Docker Compose v2 and exercised by the tasks on the
  reference provider; `set -euo pipefail` makes divergences fail loudly.
- **Interrupted runs leave staging/temp files** → temp-then-rename means no
  partial final archive; trap cleanup plus stale-`.tmp-*` cleanup at start;
  backups are documented as one-at-a-time.
- **Plaintext archives** → `umask 077`, gitignored, docs state where copies may
  be kept; encryption is out of scope.
- **Wrong archive restored** → the pre-restore snapshot is always taken; docs
  describe the undo (restore the `mes-pre-restore-*` snapshot).

## Migration Plan

Additive only: three scripts, two ignore rules, one docs section; no service,
port, or data changes. Deploying is merging the change. Rolling the scripts
back is reverting the commit; archives remain plain `tar`+`gzip` and can be
unpacked by hand if needed. Undoing an accidental restore is restoring the
pre-restore snapshot (documented).
