#!/usr/bin/env bash
set -euo pipefail

echo "C.S.V. BEACON - Replit workspace cleanup phase 2"
echo "This archives remaining obvious old inspection/rollback/maintenance files."
echo "It does NOT delete files."

ARCHIVE_DIR="$(find _replit_archive -maxdepth 1 -type d -name 'replit_cleanup_*' | sort | tail -n 1)"

if [ -z "${ARCHIVE_DIR:-}" ]; then
  echo "No existing _replit_archive/replit_cleanup_* folder found."
  exit 1
fi

mkdir -p "$ARCHIVE_DIR/root_scripts_phase2"
mkdir -p "$ARCHIVE_DIR/root_reports_phase2"
mkdir -p "$ARCHIVE_DIR/root_archives_phase2"
mkdir -p "$ARCHIVE_DIR/root_temp_phase2"

echo ""
echo "Using archive folder:"
echo "$ARCHIVE_DIR"

echo ""
echo "Archiving remaining root maintenance scripts..."
for f in \
  emergency_disable_*.sh \
  enlarge_*.sh \
  force_archive_*.sh \
  inspect_*.sh \
  make_chatgpt_project_snapshot.sh \
  repair_*.sh \
  restore_*.sh \
  rollback_*.sh
do
  if [ -e "$f" ]; then
    echo "  moving script: $f"
    mv "$f" "$ARCHIVE_DIR/root_scripts_phase2/"
  fi
done

echo ""
echo "Archiving generated inspection/project text reports..."
for f in \
  _CHATGPT_PROJECT_SNAPSHOT_*.txt \
  _LOGIN_PAGE_INSPECTION_*.txt
do
  if [ -e "$f" ]; then
    echo "  moving report: $f"
    mv "$f" "$ARCHIVE_DIR/root_reports_phase2/"
  fi
done

echo ""
echo "Archiving generated tar.gz maintenance archives..."
for f in _maintenance_archive*.tar.gz; do
  if [ -e "$f" ]; then
    echo "  moving archive: $f"
    mv "$f" "$ARCHIVE_DIR/root_archives_phase2/"
  fi
done

echo ""
echo "Archiving obvious root temp/scan files..."
for f in \
  mc5f_direct_query_scan.js \
  sed8N9V8x
do
  if [ -e "$f" ]; then
    echo "  moving temp/scan file: $f"
    mv "$f" "$ARCHIVE_DIR/root_temp_phase2/"
  fi
done

echo ""
echo "Phase 2 complete."
echo ""
echo "Remaining top-level files/folders:"
find . -maxdepth 1 -mindepth 1 | sort
