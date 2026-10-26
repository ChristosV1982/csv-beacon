import { humanPifsFromItem, uniquePifs } from "./csvb-human-pifs.mjs?v=20261026_human_pifs_v1";

export const HUMAN_PIF_VERSION = "human-multi-pifs-v1";
const text = (value) => String(value ?? "").trim();
const normalized = (value) => text(value).normalize("NFKC")
  .replace(/[‘’]/g, "'").replace(/[‐‑‒–—]/g, "-").replace(/\s+/g, " ").toLowerCase();
const question = (value) => text(value).split(".").map((part) =>
  /^\d+$/.test(part) ? String(Number(part)) : part).join(".");
function findingType(row) {
  return ({ negative_observation: "negative", positive_observation: "positive", note_improvement: "largely" })[
    normalized(row.observation_type || row.finding_kind)
  ] || normalized(row.obs_type);
}
function rank(row) {
  return normalized(row.positive_rank ||
    text(row.source_excerpt).match(/^Human\s+(.+?):/i)?.[1]);
}
function identity(row) {
  const context = rank(row);
  const observation = normalized(row.observation_text);
  const type = findingType(row);
  if (!context || !observation || !["negative", "positive", "largely"].includes(type)) return "";
  return [question(row.question_base || row.question_no), type, context, observation].join("\u001f");
}

export function planHumanPifRepairs(extracted, stored) {
  const rows = stored.filter((row) => normalized(row.designation) === "human" &&
    row.id && !String(row.id).startsWith("legacy-"));
  const plans = extracted.filter((row) => normalized(row.designation) === "human").map((entry) => {
    const sourceKey = identity(entry);
    const candidates = sourceKey ? rows.filter((row) => identity(row) === sourceKey) : [];
    const row = candidates.length === 1 ? candidates[0] : null;
    const current = row ? humanPifsFromItem(row) : [];
    const incoming = humanPifsFromItem(entry);
    // Never discard an existing manually entered/unknown PIF during repair.
    const proposed = uniquePifs([...incoming, ...current]);
    const changed = row && incoming.length &&
      normalized(proposed.join(" | ")) !== normalized(text(row.classification_coding));
    return {
      entry, row, current, proposed,
      status: !sourceKey ? "Unmatched — missing rank/context or finding text"
        : candidates.length > 1 ? "Ambiguous"
        : !row ? "Unmatched"
        : !incoming.length ? "Skipped — no extracted PIFs"
        : changed ? "Ready" : "Already up to date",
    };
  });
  // A stored row may be selected only once, even if the PDF contains repeated blocks.
  const counts = new Map();
  for (const plan of plans) if (plan.row) counts.set(plan.row.id, (counts.get(plan.row.id) || 0) + 1);
  for (const plan of plans) if (plan.row && counts.get(plan.row.id) > 1) {
    plan.status = "Ambiguous — repeated source finding";
  }
  return plans;
}

export async function applyHumanPifRepairs(supabase, reportId, selected) {
  const result = { applied: 0, skipped: 0, failed: 0, errors: [] };
  const seen = new Set();
  for (const plan of selected) {
    const row = plan.row;
    if (plan.status !== "Ready" || !row || row.report_id !== reportId ||
        seen.has(row.id) || !plan.proposed.length) {
      result.skipped++;
      continue;
    }
    seen.add(row.id);
    try {
      // User-scoped client/RLS, same report+item, and optimistic concurrency:
      // never overwrite a PIF edited while the review dialog was open.
      let query = supabase.from("post_inspection_observation_items")
        .update({ classification_coding: plan.proposed.join(" | ") })
        .eq("id", row.id).eq("report_id", reportId).eq("designation", row.designation);
      query = row.classification_coding == null
        ? query.is("classification_coding", null)
        : query.eq("classification_coding", row.classification_coding);
      if (row.updated_at) query = query.eq("updated_at", row.updated_at);
      const { data, error } = await query.select("id");
      if (error) throw error;
      if (data?.length !== 1) throw new Error("Access denied or finding changed since review; reload before retrying.");
      result.applied++;
    } catch (error) {
      result.failed++;
      result.errors.push(`${row.question_no || row.question_base}: ${error.message || String(error)}`);
    }
  }
  return result;
}

function node(tag, value) {
  const element = document.createElement(tag);
  if (value != null) element.textContent = value;
  return element;
}
function list(values) {
  const ul = node("ul");
  ul.className = "csvb-human-pif-list";
  if (!values.length) ul.append(node("li", "None recorded"));
  else for (const value of values) ul.append(node("li", value));
  return ul;
}
async function review(plans, reportRef) {
  const dialog = node("dialog");
  dialog.className = "csvb-pif-review";
  dialog.append(node("h3", `Refresh / Repair Human PIFs — ${reportRef}`));
  dialog.append(node("p", "Review only: nothing has been written. Apply updates PIF classification only on uniquely matched findings. It does not replace findings, alter responses or refresh risk snapshots. Existing additional PIFs are retained."));
  const content = node("div");
  content.className = "csvb-pif-review-content";
  const table = node("table");
  const head = node("tr");
  for (const title of ["Apply", "Finding / context", "Current PIFs", "PDF PIFs / retained values", "Match status"]) head.append(node("th", title));
  const thead = node("thead"); thead.append(head); table.append(thead);
  const tbody = node("tbody");
  const choices = [];
  for (const plan of plans) {
    const tr = node("tr");
    const selectCell = node("td");
    const checkbox = node("input");
    checkbox.type = "checkbox";
    checkbox.checked = plan.status === "Ready";
    checkbox.disabled = plan.status !== "Ready";
    checkbox.setAttribute("aria-label", `Repair PIFs for question ${plan.entry.question_base}`);
    choices.push({ plan, checkbox });
    selectCell.append(checkbox);
    tr.append(selectCell, node("td", `${plan.entry.question_base} · ${findingType(plan.entry)} · ${rank(plan.entry)}\n${text(plan.entry.observation_text)}`));
    const before = node("td"); before.append(list(plan.current));
    const after = node("td"); after.append(list(plan.proposed));
    tr.append(before, after, node("td", plan.status));
    tbody.append(tr);
  }
  table.append(tbody); content.append(table); dialog.append(content);
  const actions = node("div"); actions.className = "csvb-pif-review-actions";
  const cancel = node("button", "Cancel"); cancel.className = "btn btn-muted"; cancel.type = "button";
  const apply = node("button", "Apply selected PIF repairs"); apply.className = "btn"; apply.type = "button";
  apply.disabled = !plans.some((plan) => plan.status === "Ready");
  actions.append(cancel, apply); dialog.append(actions); document.body.append(dialog);
  return new Promise((resolve) => {
    const finish = (selection) => { dialog.close(); dialog.remove(); resolve(selection); };
    cancel.onclick = () => finish(null);
    dialog.oncancel = (event) => { event.preventDefault(); finish(null); };
    apply.onclick = () => finish(choices.filter(({ checkbox }) => checkbox.checked).map(({ plan }) => plan));
    dialog.showModal();
  });
}

export async function refreshHumanPifsFromLinkedPdf({ supabase, report, formatError }) {
  if (!report?.id || !report.pdf_storage_path) throw new Error("Load a stored report with a linked PDF first.");
  const { data, error } = await supabase.functions.invoke("import-post-inspection-pdf", {
    body: { report_id: report.id, pdf_storage_path: report.pdf_storage_path, human_pif_repair_only: true },
  });
  if (error) throw new Error(formatError ? await formatError(error, "Human PIF extraction failed") : error.message);
  if (!data?.ok) throw new Error(data?.error || "Human PIF extraction failed.");
  if (data.human_pif_version !== HUMAN_PIF_VERSION) {
    throw new Error("The hosted PDF parser has not been updated for Human multi-PIF repair. No data was changed.");
  }
  const reportKey = (value) => text(value).replace(/\s+/g, "").toUpperCase();
  if (!reportKey(report.report_ref) ||
      reportKey(data.extracted?.header?.report_reference) !== reportKey(report.report_ref)) {
    throw new Error("The extracted PDF reference does not match this report. No data was changed.");
  }
  const { data: stored, error: readError } = await supabase
    .from("post_inspection_observation_items").select("*").eq("report_id", report.id);
  if (readError) throw readError;
  const plans = planHumanPifRepairs(data.extracted?.observations || [], stored || []);
  if (!plans.length) throw new Error("No Human findings were extracted. No data was changed.");
  const selected = await review(plans, report.report_ref);
  if (!selected) return null;
  const result = await applyHumanPifRepairs(supabase, report.id, selected);
  const skipped = plans.length - selected.length + result.skipped;
  const ambiguous = plans.filter((plan) => plan.status.startsWith("Ambiguous")).length;
  return `Human PIF repair: ${result.applied} applied, ${skipped} skipped, ${ambiguous} ambiguous, ${result.failed} failed.` +
    (result.errors.length ? `\n${result.errors.join("\n")}` : "") +
    "\nFinding counts and risk snapshots were not changed.";
}
