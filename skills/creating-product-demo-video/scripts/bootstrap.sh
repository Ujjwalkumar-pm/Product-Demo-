#!/usr/bin/env bash
# One-time setup: create an isolated venv and install minimal deps.
# Safe to re-run. Verifies system ffmpeg/ffprobe are present (we never pip-install media libs).
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../.." && pwd)"
VENV="$SKILL_DIR/.venv"

for bin in ffmpeg ffprobe python3; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERROR: '$bin' not found on PATH." >&2; exit 1; }
done

if [ ! -d "$VENV" ]; then
  echo "Creating venv at $VENV"
  python3 -m venv "$VENV"
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r "$REPO_ROOT/requirements.txt"
if [ "${1:-}" = "--dev" ] && [ -f "$REPO_ROOT/requirements-dev.txt" ]; then
  python -m pip install --quiet -r "$REPO_ROOT/requirements-dev.txt"
fi

echo "OK: ffmpeg=$(ffmpeg -version | head -1 | awk '{print $3}') python=$(python --version 2>&1 | awk '{print $2}')"
echo "Activate with: source $VENV/bin/activate"
