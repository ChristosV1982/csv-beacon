#!/usr/bin/env bash
set -euo pipefail

echo "C.S.V. BEACON - Replit workspace cleanup phase 1"
echo "This script archives obvious old backup/maintenance files."
echo "It does NOT delete files."

ARCHIVE_DIR="_replit_archive/replit_cleanup_$(date +%Y%m%d_%H%M%S)"

mkdir -p "$ARCHIVE_DIR/root_scripts"
mkdir -p "$ARCHIVE_DIR/backup_dirs"
mkdir -p "$ARCHIVE_DIR/zip_files"

echo ""
echo "Archive folder:"
echo "$ARCHIVE_DIR"

echo ""
echo "Archiving root backup directories..."
for d in backup_before_*; do
  if [ -d "$d" ]; then
    echo "  moving directory: $d"
    mv "$d" "$ARCHIVE_DIR/backup_dirs/"
  fi
done

echo ""
echo "Archiving root maintenance scripts..."
for f in \
  apply_*.sh \
  audit_*.sh \
  archive_*.sh \
  compress_maintenance_archive.sh \
  repair_*.js \
  inspect_*.js \
  apply_*.js
do
  if [ -e "$f" ]; then
    echo "  moving file: $f"
    mv "$f" "$ARCHIVE_DIR/root_scripts/"
  fi
done

echo ""
echo "Archiving root zip files..."
for f in *.zip; do
  if [ -e "$f" ]; then
    echo "  moving zip: $f"
    mv "$f" "$ARCHIVE_DIR/zip_files/"
  fi
done

echo ""
echo "Cleanup phase 1 complete."
echo "Moved files are under:"
echo "$ARCHIVE_DIR"

echo ""
echo "Remaining top-level files/folders:"
find . -maxdepth 1 -mindepth 1 | sort
