#!/usr/bin/env bash
set -euo pipefail

echo "Creating emergency backup..."
mkdir -p backup_before_emergency_disable_rm1b

for f in \
  public/su-admin.html \
  public/csvb-rights-matrix-friendly-ui.js \
  public/csvb-rights-matrix-friendly-ui.css \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" "backup_before_emergency_disable_rm1b/$(basename "$f")"
  fi
done

node <<'NODE'
const fs = require("fs");

const htmlFile = "public/su-admin.html";
let html = fs.readFileSync(htmlFile, "utf8");

/* Remove every RM-1B CSS/JS reference from su-admin.html */
html = html
  .replace(/\s*<link[^>]*csvb-rights-matrix-friendly-ui\.css[^>]*>\s*/g, "\n")
  .replace(/\s*<script[^>]*csvb-rights-matrix-friendly-ui\.js[^>]*><\/script>\s*/g, "\n");

fs.writeFileSync(htmlFile, html, "utf8");

/* Keep same filenames but make them harmless in case old cached HTML still references them */
fs.writeFileSync(
  "public/csvb-rights-matrix-friendly-ui.js",
  `// RM-1B disabled emergency no-op
window.CSVB_RIGHTS_MATRIX_FRIENDLY_UI_BUILD = "DISABLED-RM1B-2026-05-06";
console.warn("RM-1B Rights Matrix friendly UI is disabled.");
`,
  "utf8"
);

fs.writeFileSync(
  "public/csvb-rights-matrix-friendly-ui.css",
  `/* RM-1B disabled emergency no-op */\n`,
  "utf8"
);

/* Bump service worker cache */
const swFile = "public/service-worker.js";
if (fs.existsSync(swFile)) {
  let sw = fs.readFileSync(swFile, "utf8");
  if (/const CACHE_VERSION = "[^"]+";/.test(sw)) {
    sw = sw.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v70-emergency-disable-rm1b";'
    );
  }
  fs.writeFileSync(swFile, sw, "utf8");
}

fs.writeFileSync(
  "public/RM1B_RIGHTS_MATRIX_FRIENDLY_UI_DISABLED.txt",
  "RM-1B disabled. Original script caused Rights Matrix performance issue.\\n",
  "utf8"
);

console.log("DONE: RM-1B hard-disabled.");
NODE

echo ""
echo "Verification:"
grep -n "csvb-rights-matrix-friendly-ui" public/su-admin.html || echo "OK: su-admin.html has no RM-1B references."
grep -n "DISABLED-RM1B" public/csvb-rights-matrix-friendly-ui.js
grep -n "CACHE_VERSION" public/service-worker.js
echo ""
git status --short | head -80
