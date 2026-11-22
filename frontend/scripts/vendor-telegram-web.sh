#!/usr/bin/env bash
# Refresh the vendored Telegram Web client (telegram-tt) build served at
# /telegram-web/ from the local clone in sample/telegram-tt.
#
# The source build itself is run inside the clone (npm run build:production)
# so this repo never carries the 2 GB source tree; only the built static
# output is committed under frontend/public/telegram-web/.
#
# Excluded from the copy (see NOTICES.md):
#   *.map                    JavaScript source maps
#   build-stats.json         bundle-size report
#   statoscope-report.html   bundle analysis page
#   img-apple-160/ img-apple-64/  emoji tiles for home-screen icons only
#
# The MES-local patches in frontend/scripts/telegram-tt-patches/ are applied
# to the source tree before building (see NOTICES.md): a patch that no longer
# applies aborts the run instead of shipping an unpatched build.
#
# Usage: bun run vendor:telegram-web [--skip-build]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE="$ROOT/sample/telegram-tt"
TARGET="$ROOT/frontend/public/telegram-web"
PATCH_DIR="$ROOT/frontend/scripts/telegram-tt-patches"

if [[ ! -d "$SOURCE" ]]; then
  echo "error: $SOURCE not found — clone telegram-tt there first" >&2
  exit 1
fi

# The vendored build intentionally deviates from upstream telegram-tt (see
# NOTICES.md): apply the tracked MES patches to the source tree first. A patch
# that no longer applies is version drift — abort rather than ship an
# unpatched build; a patch that is already applied is skipped.
if [[ -d "$PATCH_DIR" ]]; then
  echo "==> applying MES patches to telegram-tt"
  for patch in "$PATCH_DIR"/*.patch; do
    [[ -e "$patch" ]] || continue
    if git -C "$SOURCE" apply --reverse --check "$patch" 2>/dev/null; then
      echo "  $(basename "$patch"): already applied"
    elif git -C "$SOURCE" apply --check "$patch" 2>/dev/null; then
      echo "  $(basename "$patch"): applied"
      git -C "$SOURCE" apply "$patch"
    else
      echo "error: $(basename "$patch") does not apply to $SOURCE" >&2
      echo "       rebase it onto the current telegram-tt version before vendoring" >&2
      exit 1
    fi
  done
fi

if [[ "${1:-}" != "--skip-build" ]]; then
  echo "==> building telegram-tt (npm run build:production)"
  (cd "$SOURCE" && npm run build:production)
fi

if [[ ! -f "$SOURCE/dist/index.html" ]]; then
  echo "error: $SOURCE/dist/index.html missing — run the build first" >&2
  exit 1
fi

echo "==> source version: $(python3 -c "import json;print(json.load(open('$SOURCE/package.json'))['version'])")"

echo "==> copying $SOURCE/dist -> $TARGET"
mkdir -p "$TARGET"
rsync -a --delete \
  --exclude="*.map" \
  --exclude="build-stats.json" \
  --exclude="statoscope-report.html" \
  --exclude="img-apple-160/" \
  --exclude="img-apple-64/" \
  "$SOURCE/dist/" "$TARGET/"

echo "==> done ($(du -sh "$TARGET" | cut -f1), $(find "$TARGET" -type f | wc -l) files)"
echo "    verify the bundled version against NOTICES.md before committing"