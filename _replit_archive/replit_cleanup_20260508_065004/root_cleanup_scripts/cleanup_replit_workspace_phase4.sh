#!/usr/bin/env bash
set -euo pipefail

echo "C.S.V. BEACON - Replit workspace cleanup phase 4"
echo "This archives the large artifacts folder."
echo "It does NOT delete files."

ARCHIVE_DIR="$(find _replit_archive -maxdepth 1 -type d -name 'replit_cleanup_*' | sort | tail -n 1)"

if [ -z "${ARCHIVE_DIR:-}" ]; then
  echo "No existing _replit_archive/replit_cleanup_* folder found."
  exit 1
fi

mkdir -p "$ARCHIVE_DIR/large_artifacts"
mkdir -p "$ARCHIVE_DIR/root_cleanup_scripts"

if [ -d artifacts ]; then
  echo "Moving artifacts/ to $ARCHIVE_DIR/large_artifacts/"
  mv artifacts "$ARCHIVE_DIR/large_artifacts/"
else
  echo "No artifacts/ folder found."
fi

if [ -e cleanup_replit_workspace_phase4.sh ]; then
  mv cleanup_replit_workspace_phase4.sh "$ARCHIVE_DIR/root_cleanup_scripts/"
fi

echo ""
echo "Phase 4 complete."
echo ""
echo "Remaining top-level files/folders:"
find . -maxdepth 1 -mindepth 1 | sort
