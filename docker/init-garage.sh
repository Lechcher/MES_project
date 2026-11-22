#!/usr/bin/env bash
#
# Provision the bundled Garage node: apply the single-node layout, create the
# attachment bucket and an access key, and grant the key read/write on the bucket.
#
# Idempotent: the layout, bucket, and key are created only when absent, so it is
# safe to run more than once. Run it from the `docker/` directory after the stack
# is up:
#
#   docker compose up -d garage
#   ./init-garage.sh
#
# It prints the generated access key id and secret for `docker/.env`:
#   S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
set -euo pipefail

COMPOSE=${COMPOSE:-docker compose}
BUCKET=${S3_BUCKET:-ticket-jobs-attachment-files}
KEY_NAME=${GARAGE_KEY_NAME:-mes-system-s3-bucket}
ZONE=${GARAGE_ZONE:-dc1}
CAPACITY=${GARAGE_CAPACITY:-1G}

# NO_COLOR keeps the CLI output free of ANSI escapes so it can be parsed.
garage() {
	$COMPOSE exec -T -e NO_COLOR=1 garage /garage "$@"
}

echo "Waiting for the garage service to answer..."
ready=""
for _ in $(seq 1 30); do
	if garage status >/dev/null 2>&1; then
		ready="yes"
		break
	fi
	sleep 2
done
if [ -z "$ready" ]; then
	echo "garage did not become reachable; is the stack up? (docker compose ps)" >&2
	exit 1
fi

# --- 1. Cluster layout (single node) -----------------------------------------
NODE_ID=$(garage node id 2>/dev/null | head -1 | cut -d@ -f1 | tr -d '[:space:]')
if [ -z "$NODE_ID" ]; then
	echo "Could not read the Garage node id." >&2
	exit 1
fi

apply_layout() {
	# The CLI prints the exact version to use ("... apply --version N").
	local version
	version=$(garage layout show 2>/dev/null |
		sed -n 's/.*apply --version \([0-9][0-9]*\).*/\1/p' | head -1)
	garage layout apply --version "${version:-1}"
}

# `garage status` lists the node under its 16-character short id, while
# `garage node id` prints the full public key, so match on the short prefix.
SHORT_ID=${NODE_ID:0:16}
if garage layout show 2>/dev/null | grep -q "apply --version"; then
	# Role changes are already staged (e.g. a previous run was interrupted).
	echo "Applying staged layout changes..."
	apply_layout
elif garage status 2>/dev/null |
	awk -v id="$SHORT_ID" -v z="$ZONE" 'index($1, id) == 1 && $5 == z { found = 1 } END { exit(found ? 0 : 1) }'; then
	echo "Layout already applied for node $NODE_ID."
else
	echo "Assigning node $NODE_ID to zone $ZONE with capacity $CAPACITY..."
	garage layout assign -z "$ZONE" -c "$CAPACITY" "$NODE_ID"
	apply_layout
fi

# --- 2. Bucket ----------------------------------------------------------------
if garage bucket list 2>/dev/null | grep -qw "$BUCKET"; then
	echo "Bucket '$BUCKET' already exists."
else
	echo "Creating bucket '$BUCKET'..."
	garage bucket create "$BUCKET"
fi

# --- 3. Access key and grant --------------------------------------------------
if garage key list 2>/dev/null | grep -qw "$KEY_NAME"; then
	echo "Key '$KEY_NAME' already exists."
else
	echo "Creating key '$KEY_NAME'..."
	garage key create "$KEY_NAME"
fi
garage bucket allow --read --write "$BUCKET" --key "$KEY_NAME"

# --- 4. Credentials -----------------------------------------------------------
echo
echo "Add these to docker/.env, then restart the backend:"
garage key info "$KEY_NAME" --show-secret
