#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo "STABILIZE POST-INSPECTION STATS"
echo "============================================================"

ts="$(date +%Y%m%d_%H%M%S)"
backup_dir="public/_post_stats_stabilize_backup_${ts}"

HTML="public/post_inspection_stats.html"
JS="public/post_inspection_stats.js"
CSS="public/csvb-post-inspection-stats-polish.css"

TARGET_JS="public/post_inspection_stats.js.bak_20260430_142248"
TARGET_CSS="public/csvb-post-inspection-stats-polish.css.bak_20260430_142248"

echo
echo "Creating safety backup folder:"
echo "$backup_dir"
mkdir -p "$backup_dir"

for f in "$HTML" "$JS" "$CSS" \
  public/csvb-post-inspection-stats-polish.js \
  public/csvb-post-stats-safe-css-polish.css
do
  if [ -f "$f" ]; then
    cp "$f" "$backup_dir/"
    echo "Backed up: $f"
  else
    echo "Not present, skipped backup: $f"
  fi
done

echo
echo "Checking required restore source..."
if [ ! -f "$TARGET_JS" ]; then
  echo "ERROR: Required JS backup not found:"
  echo "$TARGET_JS"
  exit 1
fi

if [ ! -f "$HTML" ]; then
  echo "ERROR: HTML file not found:"
  echo "$HTML"
  exit 1
fi

echo
echo "Restoring earlier Post-Inspection Stats JS:"
echo "FROM: $TARGET_JS"
echo "TO:   $JS"
cp "$TARGET_JS" "$JS"

echo
echo "Keeping main Post-Inspection Stats CSS at current state."
echo "Current CSS already matches the earlier 14:22 backup based on audit."

echo
echo "Disabling page-specific Post-Inspection Stats polish JS from HTML..."
python3 - <<'PY'
from pathlib import Path

html_path = Path("public/post_inspection_stats.html")
text = html_path.read_text(encoding="utf-8")

target = '  <script src="./csvb-post-inspection-stats-polish.js?v=20260430_1"></script>'
replacement = '  <!-- disabled during Post-Inspection Stats stabilization: <script src="./csvb-post-inspection-stats-polish.js?v=20260430_1"></script> -->'

if target in text:
    text = text.replace(target, replacement)
    html_path.write_text(text, encoding="utf-8")
    print("Disabled csvb-post-inspection-stats-polish.js script link.")
elif "csvb-post-inspection-stats-polish.js" in text:
    print("WARNING: csvb-post-inspection-stats-polish.js found but not in the expected exact format.")
    print("No automatic HTML edit made for that line.")
else:
    print("csvb-post-inspection-stats-polish.js was already not active in HTML.")
PY

echo
echo "============================================================"
echo "RESULTING FILE CHECKS"
echo "============================================================"

for f in "$HTML" "$JS" "$CSS"; do
  echo "$f"
  echo "  Size: $(wc -c < "$f") bytes"
  echo "  Lines: $(wc -l < "$f")"
  echo "  SHA256: $(sha256sum "$f" | awk '{print $1}')"
  echo
done

echo "Active Post-Inspection Stats script/link references:"
grep -nE 'post_inspection_stats.js|csvb-post-inspection-stats-polish|csvb-post-stats-safe-css-polish' "$HTML" || true

echo
echo "STABILIZATION COMPLETE."
echo "Now hard refresh the browser page: Ctrl + Shift + R"
