#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc9d3b_assignment_approval_mode_ui

for f in \
  public/csvb-question-admin.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc9d3b_assignment_approval_mode_ui/$(basename "$f")
  fi
done

node <<'NODE'
const fs = require("fs");

const file = "public/csvb-question-admin.js";

if (!fs.existsSync(file)) {
  console.error("ERROR: public/csvb-question-admin.js not found.");
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

/* ------------------------------------------------------------
   1. Add approval mode selector for set assignment
------------------------------------------------------------ */

if (!s.includes('id="qaSetApprovalMode"')) {
  s = s.replace(
`          <label>Status</label>
          <select id="qaSetStatus" class="qa-select">
            <option value="assigned">assigned</option>
            <option value="open_for_review">open_for_review</option>
            <option value="locked">locked</option>
            <option value="archived">archived</option>
            <option value="disabled">disabled</option>
          </select>

          <label>Notes</label>`,
`          <label>Status</label>
          <select id="qaSetStatus" class="qa-select">
            <option value="assigned">assigned</option>
            <option value="open_for_review">open_for_review</option>
            <option value="locked">locked</option>
            <option value="archived">archived</option>
            <option value="disabled">disabled</option>
          </select>

          <label>Override Approval Mode</label>
          <select id="qaSetApprovalMode" class="qa-select">
            <option value="platform_review_required">platform_review_required</option>
            <option value="auto_publish">auto_publish</option>
            <option value="company_admin_review">company_admin_review</option>
          </select>
          <div class="qa-muted">
            For SIRE/platform question sets, keep platform_review_required unless specifically agreed.
          </div>

          <label>Notes</label>`
  );
}

/* ------------------------------------------------------------
   2. Add approval mode selector for individual question assignment
------------------------------------------------------------ */

if (!s.includes('id="qaQuestionApprovalMode"')) {
  s = s.replace(
`          <label>Status</label>
          <select id="qaQuestionStatus" class="qa-select">
            <option value="assigned">assigned</option>
            <option value="open_for_review">open_for_review</option>
            <option value="locked">locked</option>
            <option value="archived">archived</option>
            <option value="disabled">disabled</option>
          </select>

          <div id="qaQuestionResultsBox" class="qa-muted">Search questions to assign individually.</div>`,
`          <label>Status</label>
          <select id="qaQuestionStatus" class="qa-select">
            <option value="assigned">assigned</option>
            <option value="open_for_review">open_for_review</option>
            <option value="locked">locked</option>
            <option value="archived">archived</option>
            <option value="disabled">disabled</option>
          </select>

          <label>Override Approval Mode</label>
          <select id="qaQuestionApprovalMode" class="qa-select">
            <option value="platform_review_required">platform_review_required</option>
            <option value="auto_publish">auto_publish</option>
            <option value="company_admin_review">company_admin_review</option>
          </select>
          <div class="qa-muted">
            For company-owned custom questions, auto_publish is normally acceptable. For SIRE/platform questions, platform_review_required is safer.
          </div>

          <div id="qaQuestionResultsBox" class="qa-muted">Search questions to assign individually.</div>`
  );
}

/* ------------------------------------------------------------
   3. Add Approval Mode column to assignments table
------------------------------------------------------------ */

s = s.replace(
`            <th>Edit Override</th>
            <th>Action</th>`,
`            <th>Edit Override</th>
            <th>Approval Mode</th>
            <th>Action</th>`
);

s = s.replace(
`                <td>${a.can_edit_override ? "Yes" : "No"}</td>
                <td><button class="qa-btn danger" data-delete-assignment="${esc(a.id)}" type="button">Delete</button></td>`,
`                <td>${a.can_edit_override ? "Yes" : "No"}</td>
                <td><span class="qa-pill">${esc(a.override_approval_mode || "platform_review_required")}</span></td>
                <td><button class="qa-btn danger" data-delete-assignment="${esc(a.id)}" type="button">Delete</button></td>`
);

/* ------------------------------------------------------------
   4. Send approval mode when assigning set
------------------------------------------------------------ */

s = s.replace(
`      p_valid_to: null,
      p_notes: $("qaSetNotes")?.value || null
    });`,
`      p_valid_to: null,
      p_notes: $("qaSetNotes")?.value || null,
      p_override_approval_mode: $("qaSetApprovalMode")?.value || "platform_review_required"
    });`
);

/* ------------------------------------------------------------
   5. Send approval mode when assigning individual question
------------------------------------------------------------ */

s = s.replace(
`      p_valid_to: null,
      p_notes: "Individual question assignment from MC-9B2 UI."
    });`,
`      p_valid_to: null,
      p_notes: "Individual question assignment from MC-9B2 UI.",
      p_override_approval_mode: $("qaQuestionApprovalMode")?.value || "platform_review_required"
    });`
);

/* ------------------------------------------------------------
   6. Build marker
------------------------------------------------------------ */

if (!s.includes("MC9D3B-2026-04-30")) {
  s = s.replace(
    `const BUILD = "MC9B2-2026-04-30";`,
    `const BUILD = "MC9D3B-2026-04-30";`
  );
}

fs.writeFileSync(file, s, "utf8");

/* ------------------------------------------------------------
   7. Service worker bump
------------------------------------------------------------ */

const sw = "public/service-worker.js";

if (fs.existsSync(sw)) {
  let x = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(x)) {
    x = x.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v28-mc9d3b-assignment-approval-mode-ui";'
    );
  }

  fs.writeFileSync(sw, x, "utf8");
}

fs.writeFileSync(
  "public/MC9D3B_ASSIGNMENT_APPROVAL_MODE_UI_APPLIED.txt",
  "MC-9D3B applied: Superuser Question Assignment UI now supports override approval mode selection.\\n",
  "utf8"
);

console.log("DONE: MC-9D3B approval mode UI patch applied.");
NODE

echo "DONE: MC-9D3B completed."
echo "Next: open Superuser Administration and hard refresh with Ctrl + Shift + R."
