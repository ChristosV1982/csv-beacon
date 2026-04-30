#!/usr/bin/env bash
set -euo pipefail

echo "Creating backups..."
ts=$(date +%Y%m%d_%H%M%S)

cp public/post_inspection_stats.js "public/post_inspection_stats.js.bak_${ts}"
cp public/csvb-post-stats-pgno-final.css "public/csvb-post-stats-pgno-final.css.bak_${ts}" 2>/dev/null || true

node <<'NODE'
const fs = require("fs");

const jsFile = "public/post_inspection_stats.js";
let js = fs.readFileSync(jsFile, "utf8");

function mustReplaceExact(src, find, repl, label) {
  if (!src.includes(find)) {
    throw new Error("Could not find block for: " + label);
  }
  return src.replace(find, repl);
}

/* --------------------------------------------------
   1) PGNO by Question:
      use question text when available
-------------------------------------------------- */
js = mustReplaceExact(
  js,
  `  const byPgnoQuestion = groupObjectiveRows(pgRows, (r) => r.question_no).slice(0, 50);`,
  `  const questionTextByNo = new Map();
  (rows || []).forEach((r) => {
    const qno = String(r.question_no || "").trim();
    if (!qno || questionTextByNo.has(qno)) return;

    const txt = String(
      r.short_text ||
      r.question_short_text ||
      r.question_text ||
      r.question ||
      r.library_short_text ||
      ""
    ).trim();

    if (txt) questionTextByNo.set(qno, txt);
  });

  const byPgnoQuestion = groupObjectiveRows(pgRows, (r) => r.question_no)
    .map((x) => {
      const qno = String(x.key || "").trim();
      const qtxt = String(questionTextByNo.get(qno) || "").trim();
      return {
        ...x,
        display_label: qtxt ? \`\${qno} — \${qtxt}\` : qno,
      };
    })
    .slice(0, 50);`,
  "PGNO by Question label enrichment"
);

/* --------------------------------------------------
   2) PGNO by Question chart:
      show display_label, not only raw question no
-------------------------------------------------- */
js = mustReplaceExact(
  js,
  `  renderBarChart("chartPgnoQuestion", byPgnoQuestion.map((x) => ({ ...x, rows: pgRows.filter((r) => r.question_no === x.key) })), {
    limit: 50,
    emptyText: "No PGNO/question data for current filters.",
    titleFn: (r) => \`PGNO Question: \${r.key}\`,
  });`,
  `  renderBarChart("chartPgnoQuestion", byPgnoQuestion.map((x) => ({ ...x, rows: pgRows.filter((r) => r.question_no === x.key) })), {
    limit: 50,
    labelFn: (r) => r.display_label || r.key,
    emptyText: "No PGNO/question data for current filters.",
    titleFn: (r) => \`PGNO Question: \${r.display_label || r.key}\`,
  });`,
  "PGNO by Question renderBarChart"
);

/* --------------------------------------------------
   3) Vessel / filter dropdown:
      force closed on init and close properly
-------------------------------------------------- */
const bindDropdownRegex = /function bindDropdown\(dropId, btnId\) \{[\s\S]*?\n\}\n\nfunction closeAllDropdowns\(\) \{/;

if (!bindDropdownRegex.test(js)) {
  throw new Error("Could not find bindDropdown() block.");
}

js = js.replace(
  bindDropdownRegex,
`function bindDropdown(dropId, btnId) {
  const drop = safeEl(dropId);
  const btn = safeEl(btnId);
  if (!drop || !btn) return;

  const panel = drop.querySelector(".filterPanel");

  // Force closed at startup
  drop.classList.remove("open");

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const shouldOpen = !drop.classList.contains("open");
    closeAllDropdowns();
    if (shouldOpen) drop.classList.add("open");
  });

  if (panel) {
    panel.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }
}

function closeAllDropdowns() {`
);

fs.writeFileSync(jsFile, js, "utf8");

/* --------------------------------------------------
   4) CSS tidy only
-------------------------------------------------- */
const cssFile = "public/csvb-post-stats-pgno-final.css";
let css = fs.existsSync(cssFile) ? fs.readFileSync(cssFile, "utf8") : "";

const marker = "/* === SAFE PGNO TIDY OVERRIDE === */";
if (!css.includes(marker)) {
  css += `

${marker}

/* PGNO text should not be bold */
html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barLabel,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barLabel,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barLabel,
html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) td:first-child {
  font-weight: 400 !important;
}

/* Keep rows horizontal but not oversized */
html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barRow,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barRow,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barRow {
  align-items: center !important;
  padding-top: 6px !important;
  padding-bottom: 6px !important;
}

/* Use the width better for PGNO by Question */
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barRow {
  grid-template-columns: minmax(0, 1fr) 4px 120px 64px !important;
}

/* Slightly tighter stat text */
html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barValue,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barValue,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barValue {
  font-size: 13px !important;
}

/* Label wrapping should look cleaner */
html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barLabel,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barLabel,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barLabel {
  line-height: 1.28 !important;
}
`;
}

fs.writeFileSync(cssFile, css, "utf8");

console.log("Patched safely.");
NODE

echo "Done."
echo "Now hard refresh the page with Ctrl + Shift + R"
