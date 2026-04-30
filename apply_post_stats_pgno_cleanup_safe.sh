#!/usr/bin/env bash
set -euo pipefail

echo "Creating backups..."
ts=$(date +%Y%m%d_%H%M%S)

cp public/post_inspection_stats.js "public/post_inspection_stats.js.bak_${ts}"
cp public/csvb-post-inspection-stats-polish.css "public/csvb-post-inspection-stats-polish.css.bak_${ts}"

node <<'NODE'
const fs = require("fs");

/* =========================================================
   1) Replace ONLY renderPgnoAnalytics() safely
   ========================================================= */
const jsFile = "public/post_inspection_stats.js";
let js = fs.readFileSync(jsFile, "utf8");

const pgnoFnRegex =
  /function renderPgnoAnalytics\(rows,\s*reportRows\)\s*\{[\s\S]*?\n\}\n\nfunction renderSummaryFromRows/;

if (!pgnoFnRegex.test(js)) {
  throw new Error("Could not locate renderPgnoAnalytics() safely.");
}

const newPgnoFn = `
function renderPgnoAnalytics(rows, reportRows) {
  const pgRows = extractPgnoAnalyticsRows(rows);

  const byPgno = groupObjectiveRows(pgRows, (r) => r.pgno_label).slice(0, 50);

  const questionTextByNo = new Map();
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
        rows: pgRows.filter((r) => String(r.question_no || "").trim() === qno),
      };
    })
    .slice(0, 50);

  renderBarChart(
    "chartPgno",
    byPgno.map((x) => ({
      ...x,
      rows: pgRows.filter((r) => r.pgno_label === x.key),
    })),
    {
      labelFn: (r) => r.key,
      obsFn: (r) => r.observations,
      inspFn: (r) => r.inspections,
      limit: 50,
      emptyText: "No assigned PGNOs for current filters.",
      titleFn: (r) => \`PGNO: \${r.key}\`,
    }
  );

  renderBarChart(
    "chartPgnoQuestion",
    byPgnoQuestion,
    {
      labelFn: (r) => r.display_label || r.key,
      obsFn: (r) => r.observations,
      inspFn: (r) => r.inspections,
      limit: 50,
      emptyText: "No PGNO / question data for current filters.",
      titleFn: (r) => \`PGNO Question: \${r.display_label || r.key}\`,
    }
  );

  // Remove Missing PGNO Trend completely
  const missingChart = safeEl("chartPgnoMissing");
  if (missingChart) {
    const chartBox = missingChart.closest(".chartBox");
    if (chartBox) chartBox.remove();
  }

  const tbody = safeTbody("pgnoTableTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const r of byPgno) {
    const matched = pgRows.filter((x) => x.pgno_label === r.key);
    const drillId = registerDrill(\`PGNO: \${r.key}\`, matched, null, "Assigned PGNO records.");

    const tr = document.createElement("tr");
    tr.innerHTML = \`
      <td>\${esc(r.key || "")}</td>
      <td>\${esc(r.observations || 0)}</td>
      <td>\${esc(r.inspections || 0)}</td>
      <td>\${esc(avg(r.observations || 0, r.inspections || 0))}</td>
      <td>\${esc(r.last_seen || "")}</td>
      <td>\${buttonHtml(drillId)}</td>
    \`;
    tbody.appendChild(tr);
  }

  if (!byPgno.length) ensureTbodyMessage(tbody, 6, "No assigned PGNO data for current filters.");
}

function renderSummaryFromRows`;

js = js.replace(pgnoFnRegex, newPgnoFn);

fs.writeFileSync(jsFile, js, "utf8");

/* =========================================================
   2) Append CSS polish safely
   ========================================================= */
const cssFile = "public/csvb-post-inspection-stats-polish.css";
let css = fs.readFileSync(cssFile, "utf8");

const marker = "/* === POST STATS PGNO CLEANUP SAFE === */";

if (!css.includes(marker)) {
  css += `

${marker}

/* -------------------------------------------------
   Filter checklists: stack vertically, one below another
------------------------------------------------- */
#vesselCheckList,
#recordSourceCheckList,
#typeCheckList,
#recurringYearCheckList,
#recurringMonthCheckList {
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
}

#vesselCheckList > div,
#recordSourceCheckList > div,
#typeCheckList > div,
#recurringYearCheckList > div,
#recurringMonthCheckList > div {
  width: 100% !important;
}

.checkPanel > div,
.checkPanel label,
.checkRow {
  display: grid !important;
  grid-template-columns: 14px minmax(0, 1fr) !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 4px 6px !important;
  min-height: 24px !important;
  margin: 0 !important;
}

.checkPanel input[type="checkbox"],
.filterPanel input[type="checkbox"] {
  width: 13px !important;
  height: 13px !important;
  min-width: 13px !important;
  min-height: 13px !important;
  margin: 0 !important;
  transform: none !important;
}

.checkPanel span,
.checkPanel label span,
.checkPanel div span {
  font-size: 13px !important;
  line-height: 1.2 !important;
  font-weight: 400 !important;
}

/* -------------------------------------------------
   Chart header: title left, Obs / Insp / Avg right
------------------------------------------------- */
.chartBox {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto !important;
  gap: 2px 10px !important;
  align-items: end !important;
}

.chartBox > .chartTitle {
  grid-column: 1 !important;
  align-self: end !important;
}

.chartBox > .chartSub {
  grid-column: 2 !important;
  justify-self: end !important;
  text-align: right !important;
  white-space: nowrap !important;
  font-size: 12px !important;
  font-weight: 500 !important;
}

.chartBox > [id^="chart"] {
  grid-column: 1 / -1 !important;
  width: 100% !important;
  margin-top: 6px !important;
}

/* -------------------------------------------------
   Bar rows: label full left, stats right, button right
------------------------------------------------- */
.barRow {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 8px auto auto !important;
  gap: 10px !important;
  align-items: start !important;
  padding: 8px 0 !important;
}

.barLabel {
  min-width: 0 !important;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: clip !important;
  line-height: 1.35 !important;
  font-weight: 400 !important;
}

.barTrack {
  width: 8px !important;
  min-width: 8px !important;
  display: flex !important;
  align-items: stretch !important;
  justify-content: center !important;
}

.barFill {
  width: 3px !important;
  min-width: 3px !important;
}

.barValue {
  white-space: nowrap !important;
  text-align: right !important;
  font-weight: 400 !important;
  align-self: start !important;
}

.barRow > div:last-child {
  white-space: nowrap !important;
}

/* -------------------------------------------------
   PGNO section text should NOT be bold
------------------------------------------------- */
#chartPgno .barLabel,
#chartPgno .barValue,
#chartPgnoQuestion .barLabel,
#chartPgnoQuestion .barValue {
  font-weight: 400 !important;
}

/* -------------------------------------------------
   Remove Missing PGNO Trend header area if still present
------------------------------------------------- */
#chartPgnoMissing,
#chartPgnoMissing:empty {
  display: none !important;
}
`;
}

fs.writeFileSync(cssFile, css, "utf8");

console.log("PGNO cleanup safe patch applied successfully.");
NODE

echo "Done."
echo "IMPORTANT: Hard refresh with Ctrl + Shift + R"
