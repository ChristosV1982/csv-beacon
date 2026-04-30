#!/usr/bin/env bash
set -e

if [ ! -f "public/post_inspection_stats.html" ]; then
  echo "ERROR: public/post_inspection_stats.html not found."
  exit 1
fi

mkdir -p backup_before_mc10d5_s2a_vessel_dropdown_exact_fix

for f in \
  public/post_inspection_stats.html \
  public/csvb-post-stats-vessel-dropdown-fix.css \
  public/csvb-post-stats-vessel-dropdown-fix.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" "backup_before_mc10d5_s2a_vessel_dropdown_exact_fix/$(basename "$f")"
  fi
done

cat > public/csvb-post-stats-vessel-dropdown-fix.css <<'CSS'
/* MC-10D5-S2A
   Exact vessel dropdown fix only.
   Targets only #vesselDrop.
*/

html[data-csvb-page="post_inspection_stats.html"] #vesselDrop:not(.open) > .filterPanel {
  display: none !important;
}

html[data-csvb-page="post_inspection_stats.html"] #vesselDrop.open > .filterPanel {
  display: block !important;
}

html[data-csvb-page="post_inspection_stats.html"] #vesselDrop > .filterPanel {
  max-height: 320px !important;
  overflow-y: auto !important;
  z-index: 5000 !important;
}
CSS

cat > public/csvb-post-stats-vessel-dropdown-fix.js <<'JS'
// MC-10D5-S2A
// Exact vessel dropdown close behavior only.
// No stats logic. No chart logic. No broad DOM detection.

(() => {
  "use strict";

  const BUILD = "MC10D5-S2A-2026-04-30";

  function mark() {
    window.CSVB_POST_STATS_VESSEL_DROPDOWN_FIX_BUILD = BUILD;
    document.documentElement.setAttribute("data-csvb-page", "post_inspection_stats.html");
  }

  function closeVesselDrop() {
    const drop = document.getElementById("vesselDrop");
    if (drop) drop.classList.remove("open");
  }

  function wire() {
    mark();

    const drop = document.getElementById("vesselDrop");
    const btn = document.getElementById("vesselDropBtn");

    if (!drop || !btn || drop.dataset.csvbExactVesselFix === "1") return;

    drop.dataset.csvbExactVesselFix = "1";

    // Force closed after the original page script finishes rendering.
    closeVesselDrop();
    setTimeout(closeVesselDrop, 300);
    setTimeout(closeVesselDrop, 900);

    // Keep original button logic, but ensure outside click closes it.
    document.addEventListener("click", (event) => {
      const freshDrop = document.getElementById("vesselDrop");
      if (!freshDrop) return;

      if (!freshDrop.contains(event.target)) {
        freshDrop.classList.remove("open");
      }
    }, true);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeVesselDrop();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
JS

node <<'NODE'
const fs = require("fs");

const htmlFile = "public/post_inspection_stats.html";
let html = fs.readFileSync(htmlFile, "utf8");

const cssTag = '<link rel="stylesheet" href="./csvb-post-stats-vessel-dropdown-fix.css?v=20260430_1" />';
const jsTag = '<script src="./csvb-post-stats-vessel-dropdown-fix.js?v=20260430_1"></script>';

if (!html.includes("csvb-post-stats-vessel-dropdown-fix.css")) {
  html = html.replace("</head>", `  ${cssTag}\n</head>`);
}

if (!html.includes("csvb-post-stats-vessel-dropdown-fix.js")) {
  html = html.replace("</body>", `  ${jsTag}\n</body>`);
}

fs.writeFileSync(htmlFile, html, "utf8");

const sw = "public/service-worker.js";
if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");
  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v47-mc10d5-s2a-vessel-dropdown-exact-fix";'
    );
  }
  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC10D5_S2A_VESSEL_DROPDOWN_EXACT_FIX_APPLIED.txt",
  "MC-10D5-S2A applied: exact vessel dropdown close fix only.\n",
  "utf8"
);

console.log("DONE: MC-10D5-S2A vessel dropdown exact fix applied.");
NODE

echo "DONE: MC-10D5-S2A completed."
