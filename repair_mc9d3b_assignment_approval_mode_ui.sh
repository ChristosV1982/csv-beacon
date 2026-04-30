#!/usr/bin/env bash
set -e

if [ ! -f "public/csvb-question-admin.js" ]; then
  echo "ERROR: public/csvb-question-admin.js not found."
  exit 1
fi

mkdir -p backup_before_mc9d3b_repair
cp public/csvb-question-admin.js backup_before_mc9d3b_repair/csvb-question-admin.js
[ -f public/service-worker.js ] && cp public/service-worker.js backup_before_mc9d3b_repair/service-worker.js

node <<'NODE'
const fs = require("fs");

const file = "public/csvb-question-admin.js";
let s = fs.readFileSync(file, "utf8");

function failIfMissing(needle, label) {
  if (!s.includes(needle)) {
    console.log("WARNING: could not find:", label);
  }
}

/* ------------------------------------------------------------
   1. Build marker
------------------------------------------------------------ */
s = s.replace(
  /const BUILD = "MC9B2-2026-04-30";|const BUILD = "MC9D3B-2026-04-30";/,
  'const BUILD = "MC9D3B-REPAIR-2026-04-30";'
);

/* ------------------------------------------------------------
   2. Insert Override Approval Mode selector for Set Assignment
------------------------------------------------------------ */
if (!s.includes('id="qaSetApprovalMode"')) {
  const find = `          <label>Notes</label>
          <textarea id="qaSetNotes" class="qa-textarea" placeholder="Optional notes"></textarea>`;

  const repl = `          <label>Override Approval Mode</label>
          <select id="qaSetApprovalMode" class="qa-select">
            <option value="platform_review_required">platform_review_required</option>
            <option value="auto_publish">auto_publish</option>
            <option value="company_admin_review">company_admin_review</option>
          </select>
          <div class="qa-muted">
            For SIRE/platform question sets, normally keep platform_review_required.
          </div>

          <label>Notes</label>
          <textarea id="qaSetNotes" class="qa-textarea" placeholder="Optional notes"></textarea>`;

  if (!s.includes(find)) {
    failIfMissing(find, "set approval mode insertion point");
  } else {
    s = s.replace(find, repl);
  }
}

/* ------------------------------------------------------------
   3. Insert Override Approval Mode selector for Individual Question Assignment
------------------------------------------------------------ */
if (!s.includes('id="qaQuestionApprovalMode"')) {
  const find = `          <div id="qaQuestionResultsBox" class="qa-muted">Search questions to assign individually.</div>`;

  const repl = `          <label>Override Approval Mode</label>
          <select id="qaQuestionApprovalMode" class="qa-select">
            <option value="platform_review_required">platform_review_required</option>
            <option value="auto_publish">auto_publish</option>
            <option value="company_admin_review">company_admin_review</option>
          </select>
          <div class="qa-muted">
            For company-owned custom questions, auto_publish is normally acceptable. For SIRE/platform questions, platform_review_required is safer.
          </div>

          <div id="qaQuestionResultsBox" class="qa-muted">Search questions to assign individually.</div>`;

  if (!s.includes(find)) {
    failIfMissing(find, "question approval mode insertion point");
  } else {
    s = s.replace(find, repl);
  }
}

/* ------------------------------------------------------------
   4. Add Approval Mode column to Company Assignments header
------------------------------------------------------------ */
if (!s.includes("<th>Approval Mode</th>")) {
  s = s.replace(
    /<th>Edit Override<\/th>\s*<th>Action<\/th>/,
    `<th>Edit Override</th>
            <th>Approval Mode</th>
            <th>Action</th>`
  );
}

/* ------------------------------------------------------------
   5. Add Approval Mode value to Company Assignments rows
------------------------------------------------------------ */
if (!s.includes('a.override_approval_mode || "platform_review_required"')) {
  s = s.replace(
    /\<td>\$\{a\.can_edit_override \? "Yes" : "No"\}<\/td>\s*\<td>\<button class="qa-btn danger" data-delete-assignment="\$\{esc\(a\.id\)\}" type="button">Delete<\/button><\/td>/,
    `<td>\${a.can_edit_override ? "Yes" : "No"}</td>
                <td><span class="qa-pill">\${esc(a.override_approval_mode || "platform_review_required")}</span></td>
                <td><button class="qa-btn danger" data-delete-assignment="\${esc(a.id)}" type="button">Delete</button></td>`
  );
}

/* ------------------------------------------------------------
   6. Send approval mode when assigning set
------------------------------------------------------------ */
if (!s.includes('p_override_approval_mode: $("qaSetApprovalMode")')) {
  s = s.replace(
    /p_notes: \$\("qaSetNotes"\)\?\.value \|\| null\s*\}\);/,
    `p_notes: $("qaSetNotes")?.value || null,
      p_override_approval_mode: $("qaSetApprovalMode")?.value || "platform_review_required"
    });`
  );
}

/* ------------------------------------------------------------
   7. Send approval mode when assigning individual question
------------------------------------------------------------ */
if (!s.includes('p_override_approval_mode: $("qaQuestionApprovalMode")')) {
  s = s.replace(
    /p_notes: "Individual question assignment from MC-9B2 UI\."\s*\}\);/,
    `p_notes: "Individual question assignment from MC-9B2 UI.",
      p_override_approval_mode: $("qaQuestionApprovalMode")?.value || "platform_review_required"
    });`
  );
}

fs.writeFileSync(file, s, "utf8");

/* ------------------------------------------------------------
   8. Service worker bump
------------------------------------------------------------ */
const sw = "public/service-worker.js";
if (fs.existsSync(sw)) {
  let x = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(x)) {
    x = x.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v29-mc9d3b-repair-assignment-approval-mode-ui";'
    );
  }

  fs.writeFileSync(sw, x, "utf8");
}

fs.writeFileSync(
  "public/MC9D3B_ASSIGNMENT_APPROVAL_MODE_UI_REPAIRED.txt",
  "MC-9D3B repaired: approval mode column/dropdowns added to Superuser Question Assignment UI.\\n",
  "utf8"
);

/* ------------------------------------------------------------
   9. Verification output
------------------------------------------------------------ */
const out = fs.readFileSync(file, "utf8");

console.log("Verification:");
console.log("BUILD repair marker:", out.includes("MC9D3B-REPAIR-2026-04-30") ? "YES" : "NO");
console.log("qaSetApprovalMode:", out.includes('id="qaSetApprovalMode"') ? "YES" : "NO");
console.log("qaQuestionApprovalMode:", out.includes('id="qaQuestionApprovalMode"') ? "YES" : "NO");
console.log("Approval Mode header:", out.includes("<th>Approval Mode</th>") ? "YES" : "NO");
console.log("override_approval_mode display:", out.includes('a.override_approval_mode || "platform_review_required"') ? "YES" : "NO");
console.log("set RPC sends approval mode:", out.includes('p_override_approval_mode: $("qaSetApprovalMode")') ? "YES" : "NO");
console.log("question RPC sends approval mode:", out.includes('p_override_approval_mode: $("qaQuestionApprovalMode")') ? "YES" : "NO");
NODE

echo "DONE: MC-9D3B UI repair completed."
