#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc5e2_questions_editor_filtering

for f in \
  public/q-questions-editor.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc5e2_questions_editor_filtering/$(basename "$f")
  fi
done

node <<'NODE'
const fs = require("fs");

const file = "public/q-questions-editor.js";

if (!fs.existsSync(file)) {
  console.error("ERROR: public/q-questions-editor.js not found.");
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

function findBlockEnd(str, start) {
  const open = str.indexOf("{", start);
  if (open < 0) return -1;

  let depth = 0;
  let quote = null;
  let escape = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = open; i < str.length; i++) {
    const ch = str[i];
    const next = str[i + 1];

    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === "/" && next === "/") {
      lineComment = true;
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      blockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }

  return -1;
}

function replaceFunction(name, replacement) {
  const marker = `function ${name}(`;
  const start = s.indexOf(marker);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  const end = findBlockEnd(s, start);
  if (end < 0) throw new Error(`Could not find end of function: ${name}`);
  s = s.slice(0, start) + replacement + s.slice(end);
}

function replaceAsyncFunction(name, replacement) {
  const marker = `async function ${name}(`;
  const start = s.indexOf(marker);
  if (start < 0) throw new Error(`Async function not found: ${name}`);
  const end = findBlockEnd(s, start);
  if (end < 0) throw new Error(`Could not find end of async function: ${name}`);
  s = s.slice(0, start) + replacement + s.slice(end);
}

/* ------------------------------------------------------------
   1. Add edit-safety helper
------------------------------------------------------------ */

if (!s.includes("MC-5E2 Questions Editor Access Helpers")) {
  const helper = `

  /* ======================== MC-5E2 Questions Editor Access Helpers ======================== */

  function canEditSelected() {
    if (!selected) return false;
    if (selected.__isNew) return true;
    return selected.can_edit === true;
  }

  function editableNotice() {
    return "This question is read-only for your company. You may edit only company custom questions belonging to your company.";
  }

`;

  s = s.replace("  function setMode(newMode) {", helper + "\n  function setMode(newMode) {");
}

/* ------------------------------------------------------------
   2. Replace setMode to respect can_edit
------------------------------------------------------------ */

replaceFunction("setMode", `function setMode(newMode) {
    mode = newMode;

    if (mode === "EDIT" && selected && !canEditSelected()) {
      mode = "VIEW";
      showWarn(editableNotice());
    }

    const empty = $("emptyState");
    const v = $("viewPanel");
    const e = $("editPanel");

    if (!selected) {
      if (empty) empty.style.display = "block";
      if (v) v.style.display = "none";
      if (e) e.style.display = "none";
      return;
    }

    if (empty) empty.style.display = "none";
    if (v) v.style.display = (mode === "VIEW") ? "block" : "none";
    if (e) e.style.display = (mode === "EDIT") ? "block" : "none";

    const bEdit = $("btnEdit");
    const bSave = $("btnSave");
    const bDel = $("btnDeleteQuestion");
    const bDea = $("btnDeactivateQuestion");

    const editable = canEditSelected();

    if (bEdit) {
      bEdit.disabled = !editable;
      bEdit.title = editable ? "Edit this question" : editableNotice();
    }

    if (bSave) bSave.disabled = !editable;
    if (bDel) bDel.disabled = !editable || !!selected.__isNew || !selected.id;
    if (bDea) bDea.disabled = !editable || !!selected.__isNew || !selected.id;

    syncDeactivateButtonUI();
  }`);

/* ------------------------------------------------------------
   3. Replace syncDeactivateButtonUI
------------------------------------------------------------ */

replaceFunction("syncDeactivateButtonUI", `function syncDeactivateButtonUI() {
    const btn = $("btnDeactivateQuestion");
    if (!btn) return;

    btn.classList.add("warn");
    btn.classList.remove("primary");
    btn.title = "Toggle active/inactive";

    if (!selected || selected.__isNew || !selected.id) {
      btn.textContent = "Deactivate";
      return;
    }

    if (!canEditSelected()) {
      btn.textContent = "Deactivate";
      btn.disabled = true;
      btn.title = editableNotice();
      return;
    }

    const st = safeStr(selected.status).trim().toLowerCase() || "active";

    if (st === "inactive") {
      btn.textContent = "Activate";
      btn.classList.remove("warn");
      btn.classList.add("primary");
      btn.title = "Set status to active";
    } else {
      btn.textContent = "Deactivate";
      btn.classList.add("warn");
      btn.classList.remove("primary");
      btn.title = "Set status to inactive";
    }
  }`);

/* ------------------------------------------------------------
   4. Replace loadQuestions with scoped RPC
------------------------------------------------------------ */

replaceAsyncFunction("loadQuestions", `async function loadQuestions() {
    showWarn("");
    showOk("");
    setText("loadHint", "Loading…");

    try {
      const statusSel = facetSelected.status;
      const sourceSel = facetSelected.source;
      const versionSel = facetSelected.version;

      const { data, error } = await sb.rpc("csvb_questions_master_for_me");

      if (error) throw error;

      let rows = data || [];

      if (statusSel && statusSel.size) {
        rows = rows.filter((r) => statusSel.has(String(r.status || "")));
      }

      if (sourceSel && sourceSel.size) {
        rows = rows.filter((r) => sourceSel.has(String(r.source_type || "")));
      }

      if (versionSel && versionSel.size) {
        rows = rows.filter((r) => versionSel.has(String(r.version || "")));
      }

      allRows = rows;

      setText("loadHint", \`Loaded \${allRows.length}\`);
      renderList();

      if (allRows.length) await selectRow(allRows[0]);
      else {
        selected = null;
        setMode("VIEW");
      }
    } catch (e) {
      setText("loadHint", "");
      showWarn("Failed to load questions from DB:\\n\\n" + (e?.message || String(e)));
    }
  }`);

/* ------------------------------------------------------------
   5. Replace PGNO DB functions
------------------------------------------------------------ */

replaceAsyncFunction("loadPgnoFromDb", `async function loadPgnoFromDb(questionId) {
    const { data, error } = await sb.rpc("csvb_pgno_master_for_question_for_me", {
      p_question_id: questionId
    });

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      text: safeStr(r.pgno_text),
      remarks: safeStr(r.remarks),
    }));
  }`);

replaceAsyncFunction("savePgnoToDb", `async function savePgnoToDb(questionId, numberBase, items, sourceType) {
    const clean = (items || [])
      .map((x, idx) => ({
        seq: idx + 1,
        pgno_code: pgnoCode(numberBase, idx + 1, sourceType || "SIRE"),
        pgno_text: safeStr(x.text).trim(),
        remarks: safeStr(x.remarks).trim()
      }))
      .filter(x => x.pgno_text.length > 0);

    const { error } = await sb.rpc("csvb_replace_pgno_for_question_for_me", {
      p_question_id: questionId,
      p_rows: clean
    });

    if (error) throw error;
  }`);

/* ------------------------------------------------------------
   6. Replace Expected Evidence DB functions
------------------------------------------------------------ */

replaceAsyncFunction("loadEeFromDb", `async function loadEeFromDb(questionId) {
    const { data, error } = await sb.rpc("csvb_expected_evidence_for_question_for_me", {
      p_question_id: questionId
    });

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      text: safeStr(r.evidence_text),
      esms_references: safeStr(r.esms_references),
      esms_forms: safeStr(r.esms_forms),
      remarks: safeStr(r.remarks),
    }));
  }`);

replaceAsyncFunction("saveEeToDb", `async function saveEeToDb(questionId, items) {
    const clean = (items || [])
      .map((x, idx) => ({
        seq: idx + 1,
        evidence_text: safeStr(x.text).trim(),
        esms_references: safeStr(x.esms_references).trim() || null,
        esms_forms: safeStr(x.esms_forms).trim() || null,
        remarks: safeStr(x.remarks).trim() || null
      }))
      .filter(x => x.evidence_text.length > 0);

    const { error } = await sb.rpc("csvb_replace_expected_evidence_for_question_for_me", {
      p_question_id: questionId,
      p_rows: clean
    });

    if (error) throw error;
  }`);

/* ------------------------------------------------------------
   7. Replace activate/deactivate with safe RPC upsert
------------------------------------------------------------ */

replaceAsyncFunction("toggleActiveSelected", `async function toggleActiveSelected() {
    if (!selected || selected.__isNew || !selected.id) return;

    if (!canEditSelected()) {
      showWarn(editableNotice());
      return;
    }

    showWarn("");
    showOk("");
    setText("saveStatus", "");

    const current = safeStr(selected.status).trim().toLowerCase() || "active";
    const next = (current === "inactive") ? "active" : "inactive";

    const qno = displayNumber(selected);
    const ok = confirm(
      \`\${next === "inactive" ? "Deactivate" : "Activate"} question \${qno}?\\n\\n\` +
      \`This will set status = \${next}.\`
    );
    if (!ok) return;

    try {
      const { error } = await sb.rpc("csvb_upsert_question_master_for_me", {
        p_question_id: selected.id,
        p_number_base: selected.number_base,
        p_number_suffix: selected.number_suffix || "",
        p_source_type: selected.source_type || "COMPANY_CUSTOM",
        p_status: next,
        p_version: selected.version || "1.0",
        p_tags: selected.tags || [],
        p_payload: selected.payload || {},
        p_change_reason: selected.change_reason || null
      });

      if (error) throw error;

      facetSelected.status = new Set([next]);
      saveFacetSet("status", facetSelected.status);

      selected.status = next;
      setPillsFromSelected();
      syncDeactivateButtonUI();

      showOk(\`\${next === "inactive" ? "Deactivated" : "Activated"} \${qno}.\`);

      await loadQuestions();

      const still = allRows.find(r => r.id === selected.id);
      if (still) await selectRow(still);
      else {
        selected = null;
        setMode("VIEW");
      }
    } catch (e) {
      showWarn(\`\${next === "inactive" ? "Deactivate" : "Activate"} failed:\\n\\n\` + (e?.message || String(e)));
    }
  }`);

/* ------------------------------------------------------------
   8. Replace delete with safe RPC
------------------------------------------------------------ */

replaceAsyncFunction("deleteSelected", `async function deleteSelected() {
    if (!selected || selected.__isNew || !selected.id) return;

    if (!canEditSelected()) {
      showWarn(editableNotice());
      return;
    }

    showWarn("");
    showOk("");
    setText("saveStatus", "");

    const qno = displayNumber(selected);
    const ok = confirm(
      \`DELETE question \${qno}?\\n\\n\` +
      \`This will permanently delete:\\n\` +
      \`- questions_master\\n\` +
      \`- pgno_master children\\n\` +
      \`- expected_evidence_master children\\n\\n\` +
      \`This cannot be undone.\`
    );
    if (!ok) return;

    try {
      const { data, error } = await sb.rpc("csvb_delete_question_master_for_me", {
        p_question_id: selected.id
      });

      if (error) throw error;

      showOk(\`Deleted \${qno}.\\n\\n\` + JSON.stringify(data, null, 2));

      selected = null;
      await loadQuestions();
      setMode("VIEW");
    } catch (e) {
      showWarn("Delete failed:\\n\\n" + (e?.message || String(e)));
    }
  }`);

/* ------------------------------------------------------------
   9. Replace saveSelected with safe RPC upsert
------------------------------------------------------------ */

replaceAsyncFunction("saveSelected", `async function saveSelected() {
    if (!selected) return;

    if (!canEditSelected()) {
      showWarn(editableNotice());
      return;
    }

    showWarn("");
    showOk("");
    setText("saveStatus", "Saving…");

    try {
      const src = $("dbSourceType")?.value;
      const status = safeStr($("dbStatus")?.value || "active");
      const version = safeStr($("dbVersion")?.value).trim() || safeStr(selected.version || "SIRE_2_0_QL");

      const xx = $("numChapter")?.value;
      const yy = $("numSection")?.value;
      const zz = $("numItem")?.value;

      if (!isIntLike(Number(xx)) || !isIntLike(Number(yy)) || !isIntLike(Number(zz))) {
        setText("saveStatus", "");
        showWarn("Chapter / Section / Item must be whole numbers.");
        return;
      }

      const number_base = buildNumberBase(src, xx, yy, zz);

      if (!number_base) {
        setText("saveStatus", "");
        showWarn("Number is required.");
        return;
      }

      const number_suffix = safeStr($("dbNumberSuffix")?.value).trim();

      const tagsCsv = safeStr($("dbTags")?.value).trim();
      const tags = tagsCsv ? tagsCsv.split(",").map(s => s.trim()).filter(Boolean) : [];

      let payload = {};
      const raw = safeStr($("pRaw")?.value).trim();

      if (raw) {
        try { payload = JSON.parse(raw); }
        catch { payload = selected.payload || {}; }
      } else {
        payload = selected.payload || {};
      }

      payload.short_text = safeStr($("pShortText")?.value);
      payload.question = safeStr($("pQuestion")?.value);
      payload.inspection_guidance = safeStr($("pGuidance")?.value);
      payload.suggested_inspector_actions = safeStr($("pActions")?.value);

      applyAttributesFromEditUIIntoPayload(payload);

      ensurePgnoStateFromPayloadIfEmpty();
      ensureEeStateFromPayloadIfEmpty();

      payload.potential_grounds_for_negative_observations = (selected.pgno_items || [])
        .map(x => safeStr(x.text).trim())
        .filter(Boolean);

      payload.expected_evidence = (selected.ee_items || [])
        .map(x => safeStr(x.text).trim())
        .filter(Boolean);

      const { data, error } = await sb.rpc("csvb_upsert_question_master_for_me", {
        p_question_id: selected.__isNew ? null : selected.id,
        p_number_base: number_base,
        p_number_suffix: number_suffix,
        p_source_type: src,
        p_status: status,
        p_version: version,
        p_tags: tags,
        p_payload: payload,
        p_change_reason: safeStr($("dbChangeReason")?.value).trim() || null
      });

      if (error) throw error;

      const savedRow = Array.isArray(data) ? data[0] : data;

      if (!savedRow?.id) {
        throw new Error("Question saved but returned row id was not found.");
      }

      try {
        await savePgnoToDb(savedRow.id, number_base, selected.pgno_items || [], src);
      } catch (e) {
        showWarn("Question saved, but PGNO rows could not be saved.\\n\\nError: " + String(e?.message || e));
      }

      try {
        await saveEeToDb(savedRow.id, selected.ee_items || []);
      } catch (e) {
        showWarn(
          (safeStr($("warnBox")?.textContent) ? $("warnBox").textContent + "\\n\\n---\\n\\n" : "") +
          "Question saved, but Expected Evidence rows could not be saved.\\n\\nError: " + String(e?.message || e)
        );
      }

      showOk(selected.__isNew ? "Saved new question." : "Saved changes.");
      setText("saveStatus", "");

      const savedId = savedRow.id;

      await loadQuestions();

      const updated = allRows.find(x => x.id === savedId);

      if (updated) await selectRow(updated);
      else {
        selected = null;
        setMode("VIEW");
      }
    } catch (e) {
      setText("saveStatus", "");
      showWarn("Save failed:\\n\\n" + (e?.message || String(e)));
    }
  }`);

/* ------------------------------------------------------------
   10. Patch Edit button behavior
------------------------------------------------------------ */

s = s.replace(
`    onClick("btnEdit", () => {
      const ok = confirm("Enter edit mode for this question?");
      if (!ok) return;
      setMode("EDIT");
    });`,
`    onClick("btnEdit", () => {
      if (!canEditSelected()) {
        showWarn(editableNotice());
        return;
      }

      const ok = confirm("Enter edit mode for this question?");
      if (!ok) return;

      setMode("EDIT");
    });`
);

fs.writeFileSync(file, s, "utf8");

/* ------------------------------------------------------------
   11. Service worker cache bump
------------------------------------------------------------ */

const sw = "public/service-worker.js";

if (fs.existsSync(sw)) {
  let x = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(x)) {
    x = x.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v22-mc5e2-questions-editor-filtering";'
    );
  }

  fs.writeFileSync(sw, x, "utf8");
}

fs.writeFileSync(
  "public/MC5E2_QUESTIONS_EDITOR_FILTERING_APPLIED.txt",
  "MC-5E2 applied: Questions Editor now uses scoped RPCs and safe company-aware write calls. No auth/Supabase key/RLS changes.\\n",
  "utf8"
);

console.log("DONE: MC-5E2 Questions Editor filtering applied.");
NODE

echo "DONE: MC-5E2 completed."
echo "Next: open Questions Editor and hard refresh with Ctrl + Shift + R."
