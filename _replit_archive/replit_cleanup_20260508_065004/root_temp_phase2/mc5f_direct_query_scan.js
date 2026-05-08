const fs = require("fs");

const files = [
  "public/q-dashboard.html",
  "public/post_inspection.js",
  "public/post_inspection_detail.js",
  "public/post_inspection_stats.js",
  "public/post_inspection_kpis.js",
  "public/q-company.js",
  "public/q-vessel.js",
  "public/sa_assignments.js",
  "public/sa_tasks.js",
  "public/sa_compare.js",
  "public/audit_observations.js",
  "public/inspector_intelligence.js",
  "public/q-questions-editor.js",
  "public/q-report.html"
];

const riskyTables = [
  "vessels",
  "profiles",
  "questionnaires",
  "questionnaire_questions",
  "questionnaire_templates",
  "questionnaire_template_questions",
  "answers_pgno",
  "self_assess_campaigns",
  "self_assess_instances",
  "post_inspection_reports",
  "post_inspection_observation_items",
  "audit_reports",
  "audit_observation_items",
  "third_party_inspector_observations",
  "questions_master",
  "pgno_master",
  "expected_evidence_master"
];

console.log("C.S.V. BEACON MC-5F direct query scan");
console.log("This is not automatically an error; it flags direct table access for review.");
console.log("");

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  const s = fs.readFileSync(file, "utf8");
  const lines = s.split(/\r?\n/);

  const hits = [];

  lines.forEach((line, idx) => {
    const l = line.trim();

    for (const t of riskyTables) {
      if (
        l.includes(`.from("${t}")`) ||
        l.includes(`.from('${t}')`) ||
        l.includes(`"${t}"`) && (l.includes(".insert(") || l.includes(".update(") || l.includes(".delete("))
      ) {
        hits.push({
          line: idx + 1,
          table: t,
          text: line.slice(0, 220)
        });
      }
    }
  });

  if (hits.length) {
    console.log("==================================================");
    console.log(file);
    console.log("==================================================");
    for (const h of hits) {
      console.log(String(h.line).padStart(5, " ") + " | " + h.table.padEnd(38) + " | " + h.text);
    }
    console.log("");
  }
}
