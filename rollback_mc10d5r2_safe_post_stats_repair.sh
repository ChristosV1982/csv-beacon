#!/usr/bin/env bash
set -e

echo "Rolling back MC-10D5R2 safe post stats repair..."

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found."
  exit 1
fi

mkdir -p backup_before_rollback_mc10d5r2

for f in \
  public/post_inspection_stats.html \
  public/post_inspection_stats.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" "backup_before_rollback_mc10d5r2/$(basename "$f")"
  fi
done

# Prefer exact backup created before MC-10D5R2
if [ -f "backup_before_mc10d5r2_safe_post_stats_repair/post_inspection_stats.js" ]; then
  cp backup_before_mc10d5r2_safe_post_stats_repair/post_inspection_stats.js public/post_inspection_stats.js
  echo "Restored public/post_inspection_stats.js from MC-10D5R2 backup."
else
  echo "WARNING: MC-10D5R2 JS backup not found. Will attempt text cleanup."
fi

if [ -f "backup_before_mc10d5r2_safe_post_stats_repair/post_inspection_stats.html" ]; then
  cp backup_before_mc10d5r2_safe_post_stats_repair/post_inspection_stats.html public/post_inspection_stats.html
  echo "Restored public/post_inspection_stats.html from MC-10D5R2 backup."
else
  echo "WARNING: MC-10D5R2 HTML backup not found. Will remove injected tags manually."

  node <<'NODE'
const fs = require("fs");
const htmlFile = "public/post_inspection_stats.html";

if (fs.existsSync(htmlFile)) {
  let html = fs.readFileSync(htmlFile, "utf8");

  html = html.replace(
    /\s*<link rel="stylesheet" href="\.\/csvb-post-stats-safe-repair\.css\?v=20260430_1" \/>\s*/g,
    "\n"
  );

  html = html.replace(
    /\s*<script src="\.\/csvb-post-stats-safe-repair\.js\?v=20260430_1"><\/script>\s*/g,
    "\n"
  );

  html = html.replace(
    /\s*<link rel="stylesheet" href="\.\/csvb-post-stats-pgno-layout\.css\?v=20260430_1" \/>\s*/g,
    "\n"
  );

  fs.writeFileSync(htmlFile, html, "utf8");
}
NODE
fi

# Remove PGNO layout-only patch too, since it depends on the repaired PGNO renderer
node <<'NODE'
const fs = require("fs");

const htmlFile = "public/post_inspection_stats.html";

if (fs.existsSync(htmlFile)) {
  let html = fs.readFileSync(htmlFile, "utf8");

  html = html.replace(
    /\s*<link rel="stylesheet" href="\.\/csvb-post-stats-pgno-layout\.css\?v=20260430_1" \/>\s*/g,
    "\n"
  );

  fs.writeFileSync(htmlFile, html, "utf8");
}

const sw = "public/service-worker.js";
if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v45-rollback-mc10d5r2-post-stats-repair";'
    );
  }

  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC10D5R2_POST_STATS_SAFE_REPAIR_ROLLED_BACK.txt",
  "Rolled back MC-10D5R2 safe post stats repair and removed dependent PGNO layout CSS link.\n",
  "utf8"
);
NODE

echo "DONE: MC-10D5R2 rollback completed."
echo "Now hard refresh post_inspection_stats.html with Ctrl + Shift + R."
