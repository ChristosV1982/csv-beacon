#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found."
  exit 1
fi

mkdir -p backup_before_rollback_mc10d5r

for f in \
  public/post_inspection_stats.html \
  public/post_inspection_kpis.html \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" "backup_before_rollback_mc10d5r/$(basename "$f")"
  fi
done

node <<'NODE'
const fs = require("fs");

const files = [
  "public/post_inspection_stats.html",
  "public/post_inspection_kpis.html"
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  let html = fs.readFileSync(file, "utf8");

  html = html.replace(
    /\s*<link rel="stylesheet" href="\.\/csvb-post-stats-repair\.css\?v=20260430_1" \/>\s*/g,
    "\n"
  );

  html = html.replace(
    /\s*<script src="\.\/csvb-post-stats-repair\.js\?v=20260430_1"><\/script>\s*/g,
    "\n"
  );

  fs.writeFileSync(file, html, "utf8");
}

const sw = "public/service-worker.js";
if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v42-rollback-mc10d5r-post-stats-repair";'
    );
  }

  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC10D5R_POST_STATS_REPAIR_ROLLED_BACK.txt",
  "MC-10D5R rollback applied: removed csvb-post-stats-repair CSS/JS from post inspection stats pages. Visual-only rollback.\n",
  "utf8"
);

console.log("DONE: MC-10D5R repair removed from post inspection stats pages.");
NODE

echo "DONE: rollback completed."
echo "Now hard refresh post_inspection_stats.html with Ctrl + Shift + R."
