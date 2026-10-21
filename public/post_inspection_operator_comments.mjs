export const RESPONSE_FIELDS = [
  ["immediate_cause", "Immediate Cause"],
  ["root_cause", "Root Cause"],
  ["corrective_action", "Corrective Action"],
  ["preventative_action", "Preventative Action"],
];

const text = (value) => String(value ?? "").trim();
const normalized = (value) => text(value).normalize("NFKC")
  .replace(/[‘’]/g, "'").replace(/[‐‑‒–—]/g, "-")
  .replace(/\s+/g, " ").toLowerCase();
const question = (value) => text(value).split(".").map((part) =>
  /^\d+$/.test(part) ? String(Number(part)) : part
).join(".");
const designation = (value) => normalized(value).replace(/^photograph$/, "photo");
const negative = (row) => normalized(row.obs_type) === "negative" &&
  normalized(row.observation_type) === "negative_observation";
const responseValue = (value) => text(value) || null;

export function matchOperatorCommentToRows(entry, rows) {
  const base = rows.filter((row) =>
    negative(row) &&
    question(row.question_no || row.question_base) === question(entry.question_base) &&
    designation(row.designation) === designation(entry.designation)
  );
  if (entry.parser_identity_status !== "unique_finding_identity") {
    return { status: base.length > 1 ? "ambiguous" : "unmatched", candidates: base };
  }
  const soc = normalized(entry.classification_coding);
  const noc = normalized(entry.nature_of_concern);
  const observation = normalized(entry.observation_text);
  const excerpt = normalized(entry.source_excerpt);
  const matches = base.filter((row) => {
    if (!soc && !noc) return false;
    if (soc && normalized(row.classification_coding) !== soc) return false;
    if (noc && normalized(row.nature_of_concern) !== noc) return false;
    const observationMatches = observation &&
      normalized(row.observation_text) === observation;
    // An excerpt is a fallback only when supporting text is unavailable,
    // never a way to ignore conflicting supporting observation text.
    const excerptMatches = (!observation || !normalized(row.observation_text)) &&
      excerpt && normalized(row.source_excerpt) === excerpt;
    return observationMatches || excerptMatches;
  });
  return {
    status: matches.length === 1 ? "matched" : matches.length > 1 ? "ambiguous" : "unmatched",
    candidates: base,
    row: matches.length === 1 ? matches[0] : null,
  };
}

function node(tag, value, style = "") {
  const result = document.createElement(tag);
  if (value != null) result.textContent = value;
  if (style) result.style.cssText = style;
  return result;
}

function rowLabel(row) {
  return `Q${question(row.question_no || row.question_base)} · ${row.designation || "—"} · ` +
    `${row.classification_coding || "No SOC"} / ${row.nature_of_concern || "No NOC"} · ` +
    text(row.observation_text).slice(0, 150);
}

function differs(entry, row) {
  return RESPONSE_FIELDS.some(([key]) => responseValue(entry[key]) !== responseValue(row[key]));
}

function needsOverwrite(entry, row) {
  return RESPONSE_FIELDS.some(([key]) =>
    responseValue(row[key]) && responseValue(entry[key]) !== responseValue(row[key])
  );
}

async function reviewOperatorComments(entries, rows, reportRef) {
  const dialog = node("dialog", null,
    "width:calc(100vw - 32px);max-width:1100px;border:0;border-radius:16px;padding:18px;color:#143a63;");
  const content = node("div", null, "max-height:82vh;overflow:auto;");
  content.append(node("h3", `Import Operator Comments — ${reportRef || "existing report"}`));
  content.append(node("p",
    "Review only: no report data has been changed. Only the four response fields on selected existing negative findings can be updated. Unresolved matches are skipped."));
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const models = entries.map((entry) => ({
    entry,
    match: matchOperatorCommentToRows(entry, rows),
  }));
  const automaticIds = models.map((model) => model.match.row?.id).filter(Boolean);
  for (const model of models) {
    if (model.match.row && automaticIds.filter((id) => id === model.match.row.id).length > 1) {
      model.match = { ...model.match, row: null, status: "ambiguous" };
    }
  }

  for (const [index, model] of models.entries()) {
    const { entry } = model;
    const card = node("section", null,
      "border:1px solid #d8e3ef;border-radius:12px;padding:12px;margin:10px 0;background:#f8fbff;");
    card.append(node("h4", `#${index + 1} · Question ${question(entry.question_base)} · ${entry.designation || "—"}`,
      "margin:0 0 6px;"));
    card.append(node("div", `SOC: ${entry.classification_coding || "—"}\nNOC: ${entry.nature_of_concern || "—"}\nFinding: ${entry.observation_text || entry.source_excerpt || "—"}`,
      "white-space:pre-wrap;font-size:13px;"));
    if (entry.comment_timestamp || entry.comment_byline) {
      card.append(node("p", `PDF comment metadata: ${entry.comment_timestamp || "No timestamp"} · ${entry.comment_byline || "No byline"}`,
        "font-size:12px;margin:6px 0;"));
    }
    const selectLabel = node("label", "Existing negative finding (choose explicitly to resolve a match):",
      "display:block;font-weight:700;margin-top:8px;");
    const select = node("select", null, "width:100%;max-width:100%;padding:6px;margin-top:4px;");
    const empty = node("option", "— Skip / unresolved —");
    empty.value = "";
    select.append(empty);
    // Manual resolution remains scoped to this question/designation and report.
    for (const row of model.match.candidates) {
      const option = node("option", rowLabel(row));
      option.value = row.id;
      select.append(option);
    }
    select.value = model.match.row?.id || "";
    selectLabel.append(select);
    card.append(selectLabel);
    const status = node("p", "", "font-weight:700;margin:6px 0;");
    card.append(status);
    const fields = node("div", null,
      "display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;");
    const savedDisplays = new Map();
    for (const [key, label] of RESPONSE_FIELDS) {
      const field = node("div", null, "border:1px solid #e0e7ef;border-radius:8px;padding:8px;background:white;");
      field.append(node("strong", label));
      field.append(node("pre", `PDF:\n${entry[key] || "(blank)"}`,
        "white-space:pre-wrap;font:inherit;font-size:13px;margin:5px 0;"));
      const saved = node("pre", "", "white-space:pre-wrap;font:inherit;font-size:12px;margin:5px 0;color:#334155;");
      savedDisplays.set(key, saved);
      field.append(saved);
      fields.append(field);
    }
    card.append(fields);
    const applyLabel = node("label", null, "display:block;margin-top:8px;font-weight:700;");
    const apply = document.createElement("input");
    apply.type = "checkbox";
    apply.checked = Boolean(model.match.row);
    applyLabel.append(apply, document.createTextNode(" Apply this comments block"));
    card.append(applyLabel);
    const overwriteLabel = node("label", null, "display:block;margin-top:6px;color:#9b1c1c;font-weight:700;");
    const overwrite = document.createElement("input");
    overwrite.type = "checkbox";
    overwriteLabel.append(overwrite,
      document.createTextNode(" I explicitly approve replacing the differing saved response values for this item (including any blank PDF fields)."));
    card.append(overwriteLabel);
    const refresh = (manual = false) => {
      const selected = byId.get(select.value);
      if (manual) {
        apply.checked = Boolean(selected);
        overwrite.checked = false;
      }
      const populated = selected && RESPONSE_FIELDS.some(([key]) => responseValue(selected[key]));
      status.textContent = selected
        ? `${manual || !model.match.row || select.value !== String(model.match.row.id) ? "Resolved manually" : "Unique identity match"} · Saved response fields ${populated ? "already populated" : "blank"}`
        : `${model.match.status === "ambiguous" ? "Ambiguous" : "Unmatched"} — skipped unless you choose the correct existing finding.`;
      overwriteLabel.hidden = !selected || !needsOverwrite(entry, selected);
      for (const [key] of RESPONSE_FIELDS) {
        savedDisplays.get(key).textContent = `Saved:\n${selected?.[key] || "(blank)"}`;
      }
    };
    select.addEventListener("change", () => refresh(true));
    refresh();
    Object.assign(model, { select, apply, overwrite });
    content.append(card);
  }

  const actions = node("div", null, "display:flex;gap:8px;justify-content:flex-end;margin-top:12px;");
  const cancel = node("button", "Cancel", "padding:8px 14px;");
  cancel.className = "btn btn-muted";
  const confirm = node("button", "Apply selected Operator Comments", "padding:8px 14px;");
  confirm.className = "btn primary";
  actions.append(cancel, confirm);
  content.append(actions);
  dialog.append(content);
  document.body.append(dialog);
  try {
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        dialog.close();
        resolve(value);
      };
      cancel.onclick = () => finish(null);
      dialog.oncancel = (event) => { event.preventDefault(); finish(null); };
      confirm.onclick = () => {
        const selectedIds = models.map((model) => model.select.value).filter(Boolean);
        const duplicateIds = new Set(selectedIds.filter((id, i) => selectedIds.indexOf(id) !== i));
        const updates = [];
        let matched = 0;
        let ambiguous = 0;
        let unchanged = 0;
        for (const model of models) {
          const row = byId.get(model.select.value);
          if (!row || duplicateIds.has(String(row.id))) {
            if (duplicateIds.has(model.select.value) || model.match.status === "ambiguous") ambiguous++;
            continue;
          }
          matched++;
          if (!model.apply.checked) continue;
          if (needsOverwrite(model.entry, row) && !model.overwrite.checked) continue;
          if (!differs(model.entry, row)) { unchanged++; continue; }
          const update = {
            observation_item_id: row.id,
            overwrite_approved: model.overwrite.checked,
          };
          for (const [key] of RESPONSE_FIELDS) {
            update[key] = responseValue(model.entry[key]);
            update[`expected_${key}`] = row[key] ?? null;
          }
          updates.push(update);
        }
        finish({ updates, matched, ambiguous, unchanged, total: entries.length });
      };
      dialog.showModal();
    });
  } finally {
    dialog.remove();
  }
}

export async function importOperatorCommentsFromPdf({
  file, report, supabase, pdfBucket, pdfFolderPrefix,
  assertFunctionVersion, formatEdgeFunctionError, cleanupTemporaryPdfSource,
  setSaveStatus, getActiveReportId, onApplied,
}) {
  const reportId = text(report?.id);
  if (!file || !reportId) throw new Error("Load an existing report before importing Operator Comments.");
  const safeName = String(file.name || "report.pdf").replace(/[^a-zA-Z0-9._-]+/g, "_");
  let tempPath = `${pdfFolderPrefix}/tmp/operator_comments_${reportId}_${Date.now()}_${safeName}`;
  let cleanupError = null;
  let operationError = null;
  try {
    setSaveStatus("Uploading temporary Operator Comments PDF…");
    const { error: uploadError } = await supabase.storage.from(pdfBucket)
      .upload(tempPath, file, { upsert: false, contentType: "application/pdf" });
    if (uploadError) throw uploadError;
    setSaveStatus("Extracting Operator Comments…");
    const { data, error } = await supabase.functions.invoke("import-post-inspection-pdf", {
      body: { report_id: reportId, pdf_storage_path: tempPath, operator_comments_only: true, debug: true },
    });
    if (error) throw new Error(await formatEdgeFunctionError(error, "Operator Comments extraction failed"));
    if (!data?.ok) throw new Error(data?.error || "Operator Comments extraction failed.");
    assertFunctionVersion(data);
    if (data.operator_comments_version !== "operator-comments-v1") {
      throw new Error("The deployed parser does not support this Operator Comments import version.");
    }
    cleanupError = await cleanupTemporaryPdfSource(tempPath);
    if (cleanupError) throw new Error(`Extraction finished, but temporary PDF cleanup failed: ${cleanupError}`);
    tempPath = "";
    const extractedRef = normalized(data.extracted?.header?.report_reference).replace(/\s/g, "");
    if (!extractedRef || extractedRef !== normalized(report.report_ref).replace(/\s/g, "")) {
      throw new Error("The selected PDF does not identify the same report. No response fields were changed.");
    }
    const entries = Array.isArray(data.extracted?.operator_comments) ? data.extracted.operator_comments : [];
    if (!entries.length) throw new Error("No Operator Comments sections were found under negative findings. No data was changed.");
    const { data: items, error: itemsError } = await supabase.from("post_inspection_observation_items")
      .select("*").eq("report_id", reportId);
    if (itemsError) throw itemsError;
    const rows = (items || []).filter(negative);
    if (!rows.length) throw new Error("This report has no modern negative observation items to update.");
    setSaveStatus("Review Operator Comments — nothing written");
    const review = await reviewOperatorComments(entries, rows, report.report_ref);
    if (!review) { setSaveStatus("Operator Comments import cancelled"); return; }
    if (String(getActiveReportId() || "") !== reportId) {
      throw new Error("The active report changed during review. No response fields were changed.");
    }
    let applied = 0;
    let refreshError = "";
    if (review.updates.length) {
      setSaveStatus(`Applying Operator Comments to ${review.updates.length} item(s)…`);
      const { data: result, error: saveError } = await supabase.rpc(
        "csvb_post_inspection_apply_operator_comments_for_me",
        { p_report_id: reportId, p_updates: review.updates },
      );
      if (saveError) throw new Error(`Operator Comments were not applied: ${saveError.message || saveError}`);
      applied = Number(result?.applied || 0);
      if (onApplied) {
        try { await onApplied(); } catch (error) { refreshError = error?.message || String(error); }
      }
    }
    setSaveStatus("Operator Comments review complete");
    alert(`Operator Comments import complete.\n\nMatched: ${review.matched}\nApplied: ${applied}\nSkipped: ${review.total - applied}\nAmbiguous: ${review.ambiguous}\nUnchanged: ${review.unchanged}\n\nFindings, report header, linked PDF, workflow, photos and risk snapshots were not changed.${refreshError ? `\n\nResponses were saved, but the display needs a reload: ${refreshError}` : ""}`);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    if (tempPath) {
      cleanupError = await cleanupTemporaryPdfSource(tempPath);
      if (cleanupError) {
        throw new Error(`${operationError?.message || "Operator Comments import stopped."}\nTemporary PDF cleanup failed: ${cleanupError}`);
      }
    }
  }
}
