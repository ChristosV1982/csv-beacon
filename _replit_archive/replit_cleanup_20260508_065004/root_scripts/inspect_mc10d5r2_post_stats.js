const fs = require("fs");

const files = [
  "public/post_inspection_stats.html",
  "public/post_inspection_stats.js",
  "public/post_inspection_kpis.html",
  "public/post_inspection_kpis.js",
  "public/csvb-post-inspection-stats-polish.css",
  "public/csvb-post-inspection-stats-polish.js",
  "public/style.css"
];

console.log("C.S.V. BEACON — MC-10D5R2 Post-Inspection Stats Inspection");
console.log("READ ONLY. NO FILES MODIFIED.");
console.log("");

for (const file of files) {
  console.log("\n==================================================");
  console.log(file);
  console.log("==================================================");

  if (!fs.existsSync(file)) {
    console.log("MISSING");
    continue;
  }

  const s = fs.readFileSync(file, "utf8");
  console.log("Length:", s.length);

  if (file.endsWith(".html")) {
    console.log("\nLinked CSS/JS:");
    const links = s.match(/<link[^>]+href=["'][^"']+["'][^>]*>/gi) || [];
    const scripts = s.match(/<script[^>]+src=["'][^"']+["'][^>]*><\/script>/gi) || [];
    [...links, ...scripts].forEach(x => console.log(x));
  }

  const patterns = [
    "vessel",
    "vessels",
    "dropdown",
    "filter",
    "multi",
    "checkbox",
    "pgno",
    "Top PGNO",
    "PGNO by Question",
    "Missing PGNO",
    "render",
    "View",
    "All",
    "None",
    "open",
    "close",
    "toggle",
    "classList",
    "style.display",
    "innerHTML"
  ];

  console.log("\nRelevant lines:");
  const lines = s.split(/\r?\n/);

  lines.forEach((line, idx) => {
    const lower = line.toLowerCase();
    const hit = patterns.some(p => lower.includes(String(p).toLowerCase()));
    if (hit) {
      console.log(String(idx + 1).padStart(5, " ") + ": " + line.slice(0, 260));
    }
  });
}
