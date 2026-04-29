const fs = require("fs");
const path = require("path");

const publicDir = path.join(process.cwd(), "public");

if (!fs.existsSync(publicDir)) {
  console.error("ERROR: public folder not found. Run this from the Replit project root.");
  process.exit(1);
}

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function copyIfExists(src, dst) {
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

// ------------------------------------------------------------
// 1. Backup key files
// ------------------------------------------------------------
const backupDir = path.join(process.cwd(), "backup_before_csv_beacon_batch3");
fs.mkdirSync(backupDir, { recursive: true });

[
  "public/csv-beacon-theme.css",
  "public/style.css",
  "public/q-questions-editor.css",
  "public/manifest.json",
  "public/service-worker.js",
].forEach((f) => {
  copyIfExists(path.join(process.cwd(), f), path.join(backupDir, path.basename(f)));
});

// ------------------------------------------------------------
// 2. Update all public HTML cache references
// ------------------------------------------------------------
fs.readdirSync(publicDir)
  .filter((f) => f.endsWith(".html"))
  .forEach((file) => {
    const hp = path.join(publicDir, file);
    let text = read(hp);

    text = text.replace(/csv-beacon-theme\.css\?v=[0-9A-Za-z_]+/g, "csv-beacon-theme.css?v=20260428_3");
    text = text.replace(/href="\.\/style\.css(?:\?v=[0-9A-Za-z_]+)?"/g, 'href="./style.css?v=20260428_3"');
    text = text.replace(/href="style\.css(?:\?v=[0-9A-Za-z_]+)?"/g, 'href="style.css?v=20260428_3"');

    text = text.replace("<title>SIRE 2.0 – Questions Editor</title>", "<title>C.S.V. BEACON – Questions Editor</title>");
    text = text.replace("<title>SIRE 2.0 – Self-Assessment Assignments</title>", "<title>C.S.V. BEACON – Self-Assessment Assignments</title>");

    write(hp, text);
  });

// ------------------------------------------------------------
// 3. Append C.S.V. BEACON Batch 3 CSS
// ------------------------------------------------------------
const themePath = path.join(publicDir, "csv-beacon-theme.css");

if (!fs.existsSync(themePath)) {
  console.error("ERROR: public/csv-beacon-theme.css not found. Batch 1 must be applied first.");
  process.exit(1);
}

let theme = read(themePath);

const batch3Css = `

/* ------------------------------------------------------------------
   C.S.V. BEACON Branding Batch 3
   Global visual harmonization for legacy module pages.
------------------------------------------------------------------ */

html, body{
  background: var(--bg-main) !important;
  color: var(--text-main);
}

.topbar,
header.topbar{
  background: linear-gradient(90deg, var(--brand-navy-dark), var(--brand-navy)) !important;
  color: #FFFFFF !important;
  border: 0 !important;
  box-shadow: 0 8px 24px rgba(3,27,63,.16) !important;
}

.topbar:not(:has(.csvb-brand))::before,
header.topbar:not(:has(.csvb-brand))::before{
  content:"";
  width:42px;
  height:42px;
  min-width:42px;
  background: url("./assets/csv-beacon-icon.png") center center / contain no-repeat;
  display:block;
  flex:0 0 auto;
}

.topbar .title,
.topbar h1,
.topbar .brand,
header.topbar .brand{
  color:#FFFFFF !important;
}

.topbar .sub,
.topbar .muted,
.topbar .small,
header.topbar .muted{
  color:#BFEFF4 !important;
}

.hero{
  background: linear-gradient(135deg, var(--brand-navy-dark), var(--brand-navy)) !important;
  color:#FFFFFF !important;
  border:1px solid rgba(255,255,255,.12) !important;
  box-shadow:0 10px 30px rgba(3,27,63,.18) !important;
}

.hero h1,
.hero .title{
  color:#FFFFFF !important;
}

.hero p,
.hero .sub{
  color:#BFEFF4 !important;
}

.card,
.panel,
.statCard,
.summary-card,
.kpi-card,
.msg{
  background: var(--bg-card) !important;
  border-color: var(--border-soft) !important;
  color: var(--text-main) !important;
  box-shadow: 0 10px 30px rgba(3,27,63,.06) !important;
}

.card h1,
.card h2,
.card h3,
.panel h1,
.panel h2,
.panel h3,
.card-title,
.statN,
.drillN,
.tableCount,
label{
  color: var(--brand-navy) !important;
}

.btn,
.btn.primary,
button.btn,
button.btn.primary,
a.btn,
.submit-btn,
.tab.active{
  background: var(--brand-navy) !important;
  color:#FFFFFF !important;
  border-color: var(--brand-navy) !important;
}

.btn:hover,
.btn.primary:hover,
button.btn:hover,
a.btn:hover,
.submit-btn:hover{
  background: var(--brand-navy-dark) !important;
  border-color: var(--brand-navy-dark) !important;
}

.btn2,
.btn.light,
.btn.muted,
.btn-muted,
.btn-outline,
a.btn.btn-outline,
.tab{
  background: var(--btn-secondary-bg) !important;
  color: var(--brand-navy) !important;
  border:1px solid var(--btn-secondary-border) !important;
}

.topbar .btn2,
.topbar .btn.light,
.topbar .btn-muted,
.topbar .btn-outline,
.topbar a.btn.btn-outline,
.hero .btn.light,
.hero .btn-outline,
.hero a.btn.btn-outline{
  background: rgba(255,255,255,.12) !important;
  color:#FFFFFF !important;
  border:1px solid rgba(255,255,255,.32) !important;
}

input,
select,
textarea,
.inp,
.ta{
  border-color: var(--border-soft) !important;
  color: var(--text-main) !important;
}

input:focus,
select:focus,
textarea:focus,
.inp:focus,
.ta:focus{
  outline:3px solid var(--focus) !important;
  border-color: var(--brand-teal) !important;
}

table{
  background: var(--bg-card);
}

th,
thead th{
  background:#EEF6FC !important;
  color: var(--brand-navy) !important;
  border-color: var(--border-soft) !important;
}

td{
  border-color: var(--border-soft) !important;
}

tr:hover td{
  background:#F7FBFE !important;
}

.pill-pos,
.pill.ok,
.obs-badge.pos,
.pill-positive{
  background:#E9F8EF !important;
  color:var(--status-positive) !important;
  border-color:#BFE8CC !important;
}

.pill-progress,
.pill.progress,
.pill-own,
.pill-in-progress{
  background:#E8F8FA !important;
  color:var(--status-progress) !important;
  border-color:#B8E6EB !important;
}

.pill-lae,
.pill-neutral,
.obs-badge.lae{
  background:#EEF3F8 !important;
  color:var(--status-neutral) !important;
  border-color:#D6E4F5 !important;
}

.pill-neg,
.pill.bad,
.obs-badge.neg,
.pill-critical{
  background:#FDECEC !important;
  color:var(--status-negative) !important;
  border-color:#F5C2C2 !important;
}

.pill.pending,
.pill-warn,
.pill-warning{
  background:#FFF6E0 !important;
  color:#8A5A00 !important;
  border-color:#F6D58F !important;
}

.filter-dropdown-box{
  background: var(--brand-navy) !important;
  border-color: rgba(255,255,255,.18) !important;
  color:#FFFFFF !important;
}

.warn{
  background:#FFF4F4 !important;
  border-color:#F5C2C2 !important;
  color:#8B1D1D !important;
}

.ok{
  background:#E9F8EF !important;
  border-color:#BFE8CC !important;
  color:#0D4F2A !important;
}
`;

if (!theme.includes("C.S.V. BEACON Branding Batch 3")) {
  theme = theme.trimEnd() + "\n" + batch3Css + "\n";
  write(themePath, theme);
}

// ------------------------------------------------------------
// 4. Update public/style.css legacy colors
// ------------------------------------------------------------
const stylePath = path.join(publicDir, "style.css");

if (fs.existsSync(stylePath)) {
  let style = read(stylePath);

  if (!style.includes("--legacy-brand-navy")) {
    style = style.replace(
      "--li-margin-bottom: 6px;",
      `--li-margin-bottom: 6px;

  /* C.S.V. BEACON brand aliases for legacy style.css */
  --legacy-brand-navy: var(--brand-navy, #062A5E);
  --legacy-brand-navy-dark: var(--brand-navy-dark, #031B3F);
  --legacy-brand-teal: var(--brand-teal, #0097A7);
  --legacy-brand-gold: var(--brand-gold, #F4A000);
  --legacy-bg-main: var(--bg-main, #F4F8FC);
  --legacy-bg-card: var(--bg-card, #FFFFFF);
  --legacy-border-soft: var(--border-soft, #D6E4F5);
  --legacy-text-main: var(--text-main, #17324D);
  --legacy-text-muted: var(--text-muted, #5E6F86);`
    );
  }

  const replacements = [
    ["background: #f3f5f9;", "background: var(--legacy-bg-main);"],
    ["background: #f4a261;", "background: var(--legacy-brand-navy);"],
    ["background: #e98b3a;", "background: var(--legacy-brand-navy-dark);"],
    ["background: #dde6fa;", "background: #EAF3FB;"],
    ["color: #21395c;", "color: var(--legacy-text-main);"],
    ["color: #215b25;", "color: var(--status-positive, #168A4A);"],
    ["background: #eaf1fb;", "background: #EAF6FA;"],
    ["background: #f9fafc;", "background: var(--legacy-bg-main);"],
    ["border-right: 2px solid #dde3ec;", "border-right: 2px solid var(--legacy-border-soft);"],
    ["background: #fff;", "background: var(--legacy-bg-card);"],
    ["background: #e5efff;", "background: #EAF6FA;"],
    ["border-left: 4px solid #f4a261;", "border-left: 4px solid var(--legacy-brand-teal);"],
    ["border: 1px solid #c7d3e8;", "border: 1px solid var(--legacy-border-soft);"],
    ["color: #23292f;", "color: var(--legacy-text-main);"],
    ["background: #fff1e3;", "background: #FFF6E0;"],
    ["border-color: #f4a261;", "border-color: var(--legacy-brand-teal);"],
    ["border: 1px solid #d9772d;", "border: 1px solid var(--legacy-brand-navy);"],
    ["border: 2px solid #d9772d;", "border: 2px solid var(--legacy-brand-navy);"],
    ["color: #b2d5ff;", "color: #BFEFF4;"],
    ["box-shadow: 0 4px 16px #2226;", "box-shadow: 0 8px 24px rgba(3,27,63,.18);"],
    ["background:#f4f8fd;", "background:var(--legacy-bg-main);"],
    [".submit-btn:hover { background: #d9772d; }", ".submit-btn:hover { background: var(--legacy-brand-navy-dark); }"],
    [".search-nav-btn:hover { background: #f9c99b; }", ".search-nav-btn:hover { background: #FFE6B0; }"],
    ["background: #021c31 url('istockphoto-185097199-612x612.jpg') center center / cover no-repeat;", "background: linear-gradient(135deg, var(--legacy-brand-navy-dark), var(--legacy-brand-navy));"],
  ];

  replacements.forEach(([oldText, newText]) => {
    style = style.split(oldText).join(newText);
  });

  write(stylePath, style);
}

// ------------------------------------------------------------
// 5. Update questions editor CSS if present
// ------------------------------------------------------------
const qcssPath = path.join(publicDir, "q-questions-editor.css");

if (fs.existsSync(qcssPath)) {
  let qcss = read(qcssPath);

  [
    ["--bg:#f3f6fb;", "--bg:var(--bg-main, #F4F8FC);"],
    ["--card:#ffffff;", "--card:var(--bg-card, #FFFFFF);"],
    ["--ink:#0f172a;", "--ink:var(--text-main, #17324D);"],
    ["--muted:#64748b;", "--muted:var(--text-muted, #5E6F86);"],
    ["--line:#e2e8f0;", "--line:var(--border-soft, #D6E4F5);"],
    ["--blue:#1d4ed8;", "--blue:var(--brand-navy, #062A5E);"],
    ["--blue2:#2563eb;", "--blue2:var(--brand-navy, #062A5E);"],
    ["--red:#b91c1c;", "--red:var(--status-negative, #C62828);"],
    ["--amber:#b45309;", "--amber:#8A5A00;"],
    ["background:#0b2a55;", "background:linear-gradient(90deg, var(--brand-navy-dark, #031B3F), var(--brand-navy, #062A5E));"],
  ].forEach(([oldText, newText]) => {
    qcss = qcss.split(oldText).join(newText);
  });

  write(qcssPath, qcss);
}

// ------------------------------------------------------------
// 6. Update manifest
// ------------------------------------------------------------
const manifestPath = path.join(publicDir, "manifest.json");

if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(read(manifestPath));
    manifest.name = "C.S.V. BEACON";
    manifest.short_name = "C.S.V. BEACON";
    manifest.background_color = "#F4F8FC";
    manifest.theme_color = "#062A5E";
    manifest.description = "Marine Assurance & Compliance Platform for vetting, inspections, audits, ISM/SMS actions, equipment control and fleet performance.";
    write(manifestPath, JSON.stringify(manifest, null, 2));
  } catch (e) {
    console.warn("WARNING: manifest.json was not updated:", e.message);
  }
}

// ------------------------------------------------------------
// 7. Update service worker cache version
// ------------------------------------------------------------
const swPath = path.join(publicDir, "service-worker.js");

if (fs.existsSync(swPath)) {
  let sw = read(swPath);

  sw = sw.replace(/const CACHE_VERSION = "[^"]+";/, 'const CACHE_VERSION = "v4";');

  if (!sw.includes('"./csv-beacon-theme.css",')) {
    sw = sw.replace('  "./style.css",', '  "./style.css",\n  "./csv-beacon-theme.css",');
  }

  if (!sw.includes('"./assets/csv-beacon-icon.png",')) {
    sw = sw.replace(
      '  "./auth.js",',
      '  "./auth.js",\n  "./assets/csv-beacon-icon.png",\n  "./assets/csv-beacon-logo-full.png",'
    );
  }

  write(swPath, sw);
}

// ------------------------------------------------------------
// 8. Write applied marker
// ------------------------------------------------------------
write(
  path.join(publicDir, "CSV_BEACON_BRANDING_BATCH_3_APPLIED.txt"),
  "C.S.V. BEACON Branding Batch 3 was applied directly by Node script. No database/Supabase/business logic changes.\n"
);

console.log("DONE: C.S.V. BEACON Branding Batch 3 applied directly.");
console.log("Next: Stop/Run the Replit app, then press Ctrl + Shift + R in the browser.");
