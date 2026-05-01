#!/bin/bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/aksel/rusty-goat-dashboard}"
DOPPLER_PROJECT="${DOPPLER_PROJECT:-ezer-mirror}"
DOPPLER_CONFIG="${DOPPLER_CONFIG:-prd}"
GITHUB_SECRET_NAME="${GITHUB_SECRET_NAME:-GH_PAT}"
EXPORT_SCRIPT="$REPO_DIR/scripts/export-snapshot.sh"

if ! command -v doppler >/dev/null 2>&1; then
  echo "ERROR: doppler CLI not found" >&2
  exit 1
fi

GH_PAT="$(doppler secrets get "$GITHUB_SECRET_NAME" --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --plain)"
if [ -z "$GH_PAT" ]; then
  echo "ERROR: failed to read $GITHUB_SECRET_NAME from Doppler" >&2
  exit 1
fi

export GIT_TERMINAL_PROMPT=0
ASKPASS="$(mktemp)"
cat > "$ASKPASS" <<'EOF'
#!/bin/sh
case "$1" in
  *Username*) echo "x-access-token" ;;
  *Password*) echo "$GH_PAT" ;;
  *) echo "" ;;
esac
EOF
# inject secret after file creation without exposing in ps args
python3 - <<'PY2' "$ASKPASS" "$GH_PAT"
from pathlib import Path
import sys
p = Path(sys.argv[1])
token = sys.argv[2]
text = p.read_text()
p.write_text(text.replace('$GH_PAT', token))
PY2
chmod 700 "$ASKPASS"
export GIT_ASKPASS="$ASKPASS"
trap 'rm -f "$ASKPASS"' EXIT

cd "$REPO_DIR"
git config user.name "${GIT_AUTHOR_NAME:-Aksel Chernitzky}"
git config user.email "${GIT_AUTHOR_EMAIL:-akselcherny@gmail.com}"

# ensure repo is current before generating a new snapshot commit
git fetch origin main
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ]; then
  git checkout main
fi
git reset --hard origin/main

/bin/bash "$EXPORT_SCRIPT"
