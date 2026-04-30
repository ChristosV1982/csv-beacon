#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo "POST-INSPECTION STATS AUDIT - NO CHANGES WILL BE MADE"
echo "============================================================"
echo

echo "Current directory:"
pwd
echo

echo "Checking expected current files..."
for f in \
  public/post_inspection_stats.html \
  public/post_inspection_stats.js \
  public/csvb-post-inspection-stats-polish.css
do
  if [ -f "$f" ]; then
    echo "FOUND: $f"
    echo "  Size: $(wc -c < "$f") bytes"
    echo "  Lines: $(wc -l < "$f")"
    echo "  Modified: $(stat -c '%y' "$f" 2>/dev/null || stat -f '%Sm' "$f")"
    echo "  SHA256: $(sha256sum "$f" | awk '{print $1}')"
  else
    echo "MISSING: $f"
  fi
  echo
done

echo "============================================================"
echo "Available Post-Inspection Stats backups:"
echo "============================================================"

find public -maxdepth 1 -type f \( \
  -name 'post_inspection_stats.html*' -o \
  -name 'post_inspection_stats.js*' -o \
  -name 'csvb-post-inspection-stats-polish.css*' \
\) | sort -V | while read -r f; do
  echo "$f"
  echo "  Size: $(wc -c < "$f") bytes"
  echo "  Lines: $(wc -l < "$f")"
  echo "  Modified: $(stat -c '%y' "$f" 2>/dev/null || stat -f '%Sm' "$f")"
  echo "  SHA256: $(sha256sum "$f" | awk '{print $1}')"
  echo
done

echo "============================================================"
echo "Quick script/link checks in HTML:"
echo "============================================================"

if [ -f public/post_inspection_stats.html ]; then
  grep -nE '<link|<script' public/post_inspection_stats.html || true
else
  echo "Cannot check HTML links/scripts because public/post_inspection_stats.html is missing."
fi

echo
echo "AUDIT COMPLETE. No files were changed."
