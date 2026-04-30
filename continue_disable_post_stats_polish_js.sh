#!/usr/bin/env bash
set -euo pipefail

HTML="public/post_inspection_stats.html"

echo "============================================================"
echo "CONTINUE POST-STATS STABILIZATION"
echo "============================================================"

if [ ! -f "$HTML" ]; then
  echo "ERROR: Missing $HTML"
  exit 1
fi

echo
echo "Creating extra HTML safety backup..."
cp "$HTML" "${HTML}.before_disable_polish_js_$(date +%Y%m%d_%H%M%S)"
echo "Backup created."

echo
echo "Disabling csvb-post-inspection-stats-polish.js if still active..."

perl -0pi -e 's#  <script src="\./csvb-post-inspection-stats-polish\.js\?v=20260430_1"></script>#  <!-- disabled during Post-Inspection Stats stabilization: <script src="./csvb-post-inspection-stats-polish.js?v=20260430_1"></script> -->#g' "$HTML"

echo
echo "============================================================"
echo "VERIFY RESULT"
echo "============================================================"

echo
echo "post_inspection_stats.js:"
echo "  Size:   $(wc -c < public/post_inspection_stats.js) bytes"
echo "  Lines:  $(wc -l < public/post_inspection_stats.js)"
echo "  SHA256: $(sha256sum public/post_inspection_stats.js | awk '{print $1}')"

echo
echo "Expected restored JS SHA256:"
echo "  202aee2973b73228bbb7377cb4d75cf13c2cfaa505ecedc9a70b25a9b2bdce15"

echo
echo "Relevant HTML script/link lines:"
grep -nE 'post_inspection_stats.js|csvb-post-inspection-stats-polish|csvb-post-stats-safe-css-polish' "$HTML" || true

echo
echo "DONE."
echo "Now hard refresh browser with Ctrl + Shift + R."
