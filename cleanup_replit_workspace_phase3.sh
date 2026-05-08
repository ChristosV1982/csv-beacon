#!/usr/bin/env bash
set -euo pipefail

echo "C.S.V. BEACON - Replit workspace cleanup phase 3"
echo "This archives root-level duplicate web files because runtime serves ./public."
echo "It does NOT delete files."

ARCHIVE_DIR="$(find _replit_archive -maxdepth 1 -type d -name 'replit_cleanup_*' | sort | tail -n 1)"

if [ -z "${ARCHIVE_DIR:-}" ]; then
  echo "No existing _replit_archive/replit_cleanup_* folder found."
  exit 1
fi

mkdir -p "$ARCHIVE_DIR/root_duplicate_web_files"
mkdir -p "$ARCHIVE_DIR/root_cleanup_scripts"

echo ""
echo "Using archive folder:"
echo "$ARCHIVE_DIR"

echo ""
echo "Archiving root-level duplicate web files..."
for f in \
  app.js \
  index.html \
  library.html \
  login.html \
  manifest.json \
  print.js \
  q-answer.html \
  q-company.html \
  q-dashboard.html \
  q-inspector.html \
  q-report.html \
  q-vessel.html \
  questionlib.js \
  service-worker.js \
  sire_questions_all_columns_named.json \
  style.css
do
  if [ -e "$f" ]; then
    echo "  moving duplicate root file: $f"
    mv "$f" "$ARCHIVE_DIR/root_duplicate_web_files/"
  fi
done

echo ""
echo "Archiving cleanup scripts themselves..."
for f in cleanup_replit_workspace_phase1.sh cleanup_replit_workspace_phase2.sh; do
  if [ -e "$f" ]; then
    echo "  moving cleanup script: $f"
    mv "$f" "$ARCHIVE_DIR/root_cleanup_scripts/"
  fi
done

echo ""
echo "Phase 3 complete."
echo ""
echo "Remaining top-level files/folders:"
find . -maxdepth 1 -mindepth 1 | sort
