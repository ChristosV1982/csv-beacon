#!/usr/bin/env bash
set -euo pipefail

echo "Restoring Post-Inspection Stats to clean working state..."

mkdir -p backup_before_restore_post_stats_clean

cp public/post_inspection_stats.html backup_before_restore_post_stats_clean/post_inspection_stats.html
cp public/post_inspection_stats.js backup_before_restore_post_stats_clean/post_inspection_stats.js
cp public/csvb-post-inspection-stats-polish.css backup_before_restore_post_stats_clean/csvb-post-inspection-stats-polish.css
cp public/service-worker.js backup_before_restore_post_stats_clean/service-worker.js

latest_js_backup="$(ls -t public/post_inspection_stats.js.bak_* 2>/dev/null | head -1 || true)"

if [ -n "$latest_js_backup" ]; then
  echo "Restoring JS from: $latest_js_backup"
  cp "$latest_js_backup" public/post_inspection_stats.js
else
  echo "WARNING: No post_inspection_stats.js.bak_* backup found. Keeping current JS."
fi

node <<'NODE'
const fs = require("fs");

const htmlFile = "public/post_inspection_stats.html";
let html = fs.readFileSync(htmlFile, "utf8");

const removeFiles = [
  "csvb-post-stats-safe-repair.css",
  "csvb-post-stats-safe-repair.js",
  "csvb-post-stats-pgno-layout.css",
  "csvb-post-stats-pgno-final.css",
  "csvb-post-stats-stable-polish.css",
  "csvb-post-stats-vessel-dropdown-fix.css",
  "csvb-post-stats-vessel-dropdown-fix.js"
];

for (const f of removeFiles) {
  html = html.replace(new RegExp(`\\s*<link[^>]+${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*>\\s*`, "g"), "\n");
  html = html.replace(new RegExp(`\\s*<script[^>]+${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*><\\/script>\\s*`, "g"), "\n");
}

fs.writeFileSync(htmlFile, html, "utf8");

const cssFile = "public/csvb-post-inspection-stats-polish.css";
let css = fs.readFileSync(cssFile, "utf8");

for (const marker of [
  "/* === POST STATS PGNO CLEANUP SAFE === */",
  "/* === POST STATS SAFE FILTER POLISH === */"
]) {
  const idx = css.indexOf(marker);
  if (idx >= 0) css = css.slice(0, idx).trimEnd() + "\n";
}

fs.writeFileSync(cssFile, css, "utf8");

const sw = "public/service-worker.js";
let s = fs.readFileSync(sw, "utf8");
s = s.replace(/const CACHE_VERSION = "[^"]+";/, 'const CACHE_VERSION = "v50-restore-post-stats-clean";');
fs.writeFileSync(sw, s, "utf8");

fs.writeFileSync(
  "public/POST_STATS_CLEAN_RESTORE_DONE.txt",
  "Post-Inspection Stats restored to clean working visual baseline. Risky PGNO/filter polish removed.\n",
  "utf8"
);

console.log("Clean restore complete.");
NODE

echo "DONE. Now hard refresh post_inspection_stats.html with Ctrl + Shift + R."
