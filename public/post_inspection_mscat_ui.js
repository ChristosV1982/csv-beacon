const MSCAT_BUILD = "csvb_mscat_ui_v03_compact_grouped_dialog_2026-06-17";
const MSCAT_SOURCE_REF = "DNV M-SCAT 8.2";

const mscat = {
  supabase: null,
  reportId: "",
  itemId: "",
  item: null,
  taxonomy: [],
  selections: [],
};

function q(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAuth(ms = 5000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (window.AUTH && window.AUTH.ensureSupabase) return true;
    await sleep(50);
  }
  return false;
}

function setTopStatus(text) {
  const saveStatus = q("saveStatus");
  if (saveStatus) saveStatus.textContent = text;
}

function injectMscatStyle() {
  if (q("mscatUiStyle")) return;

  const style = document.createElement("style");
  style.id = "mscatUiStyle";
  style.textContent = `
    .csvb-mscat-status-grid{
      display:grid;
      grid-template-columns:repeat(4,minmax(160px,1fr));
      gap:12px;
      margin-top:12px;
    }
    .csvb-mscat-metric{
      border:1px solid #dbe8f8;
      border-radius:14px;
      background:#fbfdff;
      padding:12px;
    }
    .csvb-mscat-metric label{
      display:block;
      color:#55708f;
      font-weight:900;
      font-size:12px;
      margin-bottom:6px;
      text-transform:uppercase;
      letter-spacing:.03em;
    }
    .csvb-mscat-metric div{
      color:#0c1b2a;
      font-weight:900;
      font-size:18px;
    }
    .csvb-mscat-summary{
      margin-top:12px;
      border:1px dashed #cfe0f4;
      border-radius:14px;
      background:#f8fbff;
      padding:12px;
      color:#143a63;
      font-weight:800;
      line-height:1.45;
    }
    .csvb-mscat-actions{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      margin-top:12px;
    }
    .csvb-mscat-dialog{
      border:none;
      border-radius:18px;
      padding:0;
      width:calc(100vw - 40px);
      max-width:1180px;
    }
    .csvb-mscat-dialog .dlg{
      padding:16px;
      max-height:88vh;
      overflow:auto;
    }
    .csvb-mscat-dialog h3{
      margin:0 0 8px;
      color:#143a63;
      font-weight:900;
    }
    .csvb-mscat-dialog .dlg-sub{
      color:#55708f;
      font-weight:800;
      margin-bottom:12px;
    }
    .csvb-mscat-dialog-actions{
      display:flex;
      justify-content:flex-end;
      gap:10px;
      flex-wrap:wrap;
      margin-top:14px;
      padding-top:12px;
      border-top:1px solid #e5eefc;
    }
    .csvb-mscat-group{
      border:1px solid #dbe8f8;
      border-radius:16px;
      background:#fbfdff;
      margin:12px 0;
      padding:12px;
    }
    .csvb-mscat-group h4{
      margin:0 0 8px;
      color:#113a63;
      font-weight:900;
    }
    .csvb-mscat-subgroup{
      border-top:1px dashed #dbe8f8;
      padding-top:10px;
      margin-top:10px;
    }
    .csvb-mscat-subgroup h5{
      margin:0 0 8px;
      color:#143a63;
      font-weight:900;
      font-size:15px;
    }
    .csvb-mscat-check{
      display:flex;
      align-items:flex-start;
      gap:10px;
      padding:7px 4px;
      border-bottom:1px solid #eef4fb;
      color:#0c1b2a;
      font-weight:700;
      line-height:1.35;
    }
    .csvb-mscat-check:last-child{ border-bottom:none; }
    .csvb-mscat-check input{ margin-top:3px; flex:0 0 auto; }
    .csvb-mscat-code{ color:#55708f; font-weight:900; }
    .csvb-mscat-compact-note{
      border:1px solid #dbe8f8;
      background:#f8fbff;
      color:#143a63;
      border-radius:14px;
      padding:10px 12px;
      font-weight:800;
      margin:10px 0 12px;
    }
    .csvb-mscat-dialog-toolbar{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      margin:10px 0 12px;
      align-items:center;
    }
    .csvb-mscat-section-card{
      border:1px solid #dbe8f8;
      border-radius:16px;
      background:#fbfdff;
      margin:10px 0;
      overflow:hidden;
    }
    .csvb-mscat-section-card summary{
      cursor:pointer;
      list-style:none;
      padding:12px 14px;
      display:flex;
      justify-content:space-between;
      gap:12px;
      align-items:center;
      color:#113a63;
      font-weight:900;
      background:#f3f8ff;
      border-bottom:1px solid #dbe8f8;
    }
    .csvb-mscat-section-card summary::-webkit-details-marker{ display:none; }
    .csvb-mscat-section-title{
      display:flex;
      flex-direction:column;
      gap:4px;
    }
    .csvb-mscat-section-main{
      font-size:15px;
      font-weight:900;
    }
    .csvb-mscat-section-sub{
      font-size:12px;
      color:#55708f;
      font-weight:900;
    }
    .csvb-mscat-section-count{
      display:inline-flex;
      align-items:center;
      white-space:nowrap;
      border:1px solid #cfe0f4;
      background:#fff;
      color:#143a63;
      border-radius:999px;
      padding:5px 10px;
      font-size:12px;
      font-weight:900;
    }
    .csvb-mscat-section-body{
      padding:8px 12px 10px;
    }
    .csvb-mscat-section-card:not([open]) .csvb-mscat-section-body{
      display:none;
    }
    @media (max-width:1100px){
      .csvb-mscat-status-grid{ grid-template-columns:1fr; }
      .csvb-mscat-section-card summary{
        align-items:flex-start;
        flex-direction:column;
      }
    }
  `;
  document.head.appendChild(style);
}

function findCardByHeading(title) {
  const wanted = String(title || "").trim().toLowerCase();
  for (const h of document.querySelectorAll(".pi-card h2")) {
    if (String(h.textContent || "").trim().toLowerCase() === wanted) {
      return h.closest(".pi-card");
    }
  }
  return null;
}

function ensureCard() {
  let card = q("mscatCard");
  if (card) return card;

  card = document.createElement("div");
  card.className = "pi-card";
  card.id = "mscatCard";
  card.innerHTML = `
    <h2>M-SCAT Analysis</h2>
    <div class="muted">
      Structured cause analysis for Negative and Largely as Expected observations. Saved selections are KPIable for trend analysis.
    </div>
    <div class="muted" style="margin-top:6px;">build: ${MSCAT_BUILD}</div>

    <div class="csvb-mscat-status-grid">
      <div class="csvb-mscat-metric">
        <label>Status</label>
        <div id="mscatStatusVal">—</div>
      </div>
      <div class="csvb-mscat-metric">
        <label>Immediate Causes</label>
        <div id="mscatImmediateVal">0</div>
      </div>
      <div class="csvb-mscat-metric">
        <label>Basic Causes</label>
        <div id="mscatBasicVal">0</div>
      </div>
      <div class="csvb-mscat-metric">
        <label>Control Areas</label>
        <div id="mscatControlVal">0</div>
      </div>
    </div>

    <div class="csvb-mscat-summary" id="mscatSummary">
      M-SCAT selections not loaded yet.
    </div>

    <div class="csvb-mscat-actions">
      <button class="btn primary" id="openMscatBtn" type="button">Select M-SCAT Causes / Actions</button>
      <button class="btn btn-muted" id="reloadMscatBtn" type="button">Reload M-SCAT</button>
    </div>
  `;

  const pgno = findCardByHeading("PGNO Selection");
  if (pgno && pgno.parentElement) {
    pgno.parentElement.insertBefore(card, pgno);
  } else {
    document.querySelector(".pi-wrap")?.appendChild(card);
  }

  return card;
}

function itemNeedsMscat(item) {
  const k = String(item?.obs_type || item?.kind || "").trim().toLowerCase();
  return k === "negative" || k === "largely";
}

function selectedIds() {
  return new Set((mscat.selections || []).map((x) => String(x.taxonomy_id)));
}

function countSection(sectionKey) {
  const selected = selectedIds();
  return (mscat.taxonomy || [])
    .filter((x) => String(x.section_key) === sectionKey && selected.has(String(x.id)))
    .length;
}

function renderCard() {
  ensureCard();

  const required = itemNeedsMscat(mscat.item);
  const selectedCount = (mscat.selections || []).length;

  const statusEl = q("mscatStatusVal");
  const immediateEl = q("mscatImmediateVal");
  const basicEl = q("mscatBasicVal");
  const controlEl = q("mscatControlVal");
  const summaryEl = q("mscatSummary");
  const openBtn = q("openMscatBtn");

  if (!statusEl || !summaryEl) return;

  if (!required) {
    statusEl.textContent = "N/A";
    immediateEl.textContent = "0";
    basicEl.textContent = "0";
    controlEl.textContent = "0";
    summaryEl.textContent = "M-SCAT analysis is required for Negative and Largely as Expected observations only.";
    if (openBtn) openBtn.disabled = true;
    return;
  }

  if (openBtn) openBtn.disabled = false;

  statusEl.textContent = selectedCount ? "Analysed" : "Not analysed";
  immediateEl.textContent = String(countSection("immediate_cause"));
  basicEl.textContent = String(countSection("basic_cause"));
  controlEl.textContent = String(countSection("control_area"));

  if (!mscat.taxonomy.length) {
    summaryEl.textContent = "M-SCAT taxonomy not loaded.";
    return;
  }

  if (!selectedCount) {
    summaryEl.textContent = "No M-SCAT causes/actions selected for this observation yet.";
    return;
  }

  const selected = selectedIds();
  const grouped = new Map();

  for (const row of mscat.taxonomy) {
    if (!selected.has(String(row.id))) continue;
    const key = `${row.section_label} — ${row.subsection_label}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(`${row.item_no ? row.item_no + " " : ""}${row.item_label}`);
  }

  summaryEl.innerHTML = Array.from(grouped.entries())
    .map(([group, items]) => `
      <div style="margin-bottom:8px;">
        <strong>${esc(group)}</strong><br>
        ${items.map(esc).join("<br>")}
      </div>
    `)
    .join("");
}

async function loadItem() {
  const { data, error } = await mscat.supabase
    .from("post_inspection_observation_items")
    .select("id,report_id,company_id,obs_type,question_no,question_base,designation,nature_of_concern,classification_coding,observation_text")
    .eq("id", mscat.itemId)
    .eq("report_id", mscat.reportId)
    .single();

  if (error) throw error;
  mscat.item = data;
}

async function loadTaxonomy() {
  const { data, error } = await mscat.supabase
    .from("post_inspection_mscat_taxonomy")
    .select("id,section_key,section_label,subsection_key,subsection_label,item_code,item_no,item_label,sort_order")
    .eq("source_ref", MSCAT_SOURCE_REF)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  mscat.taxonomy = data || [];
}

async function loadSelections() {
  if (!mscat.item?.id || !itemNeedsMscat(mscat.item)) {
    mscat.selections = [];
    return;
  }

  const { data, error } = await mscat.supabase
    .from("post_inspection_observation_mscat")
    .select("id,taxonomy_id,selection_source,notes")
    .eq("observation_item_id", mscat.item.id);

  if (error) throw error;
  mscat.selections = data || [];
}

async function reloadAll() {
  try {
    setTopStatus("Loading M-SCAT…");
    await loadItem();
    await loadTaxonomy();
    await loadSelections();
    renderCard();
    setTopStatus("M-SCAT loaded");
  } catch (e) {
    console.error(e);
    setTopStatus("M-SCAT load error");
    const summary = q("mscatSummary");
    if (summary) summary.textContent = "M-SCAT failed to load: " + (e?.message || String(e));
  }
}

function ensureDialog() {
  let dialog = q("mscatDialog");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "mscatDialog";
  dialog.className = "csvb-mscat-dialog";
  dialog.innerHTML = `
    <div class="dlg">
      <h3>M-SCAT Analysis</h3>
      <div class="dlg-sub">
        Select Immediate Cause(s), Basic Cause(s), and Control Area(s) for Improvement Actions.
      </div>
      <div class="csvb-mscat-compact-note">
        The list is grouped and collapsed for easier review. Open only the relevant M-SCAT family and tick the applicable item(s).
      </div>
      <div class="csvb-mscat-dialog-toolbar">
        <button class="btn btn-muted" id="mscatExpandAllBtn" type="button">Expand all</button>
        <button class="btn btn-muted" id="mscatCollapseAllBtn" type="button">Collapse all</button>
      </div>
      <div id="mscatDialogBody"></div>
      <div class="csvb-mscat-dialog-actions">
        <button class="btn btn-muted" id="mscatCancelBtn" type="button">Cancel</button>
        <button class="btn primary" id="mscatSaveBtn" type="button">Save M-SCAT Selection</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  return dialog;
}

function renderDialogBody() {
  const body = q("mscatDialogBody");
  if (!body) return;

  const selected = selectedIds();
  const groupMap = new Map();

  for (const row of mscat.taxonomy || []) {
    const key = `${row.section_key}|||${row.section_label}|||${row.subsection_key}|||${row.subsection_label}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        section_key: row.section_key,
        section_label: row.section_label,
        subsection_key: row.subsection_key,
        subsection_label: row.subsection_label,
        rows: [],
      });
    }

    groupMap.get(key).rows.push(row);
  }

  let html = "";

  for (const group of groupMap.values()) {
    const selectedInGroup = group.rows.filter((row) => selected.has(String(row.id))).length;
    const openAttr = selectedInGroup ? "open" : "";
    const groupTitle = `${group.section_label} — ${group.subsection_label}`;
    const safeId = `${group.section_key}-${group.subsection_key}`.replace(/[^a-z0-9_-]/gi, "_");

    html += `
      <details class="csvb-mscat-section-card" id="mscatGroup_${esc(safeId)}" ${openAttr}>
        <summary>
          <span class="csvb-mscat-section-title">
            <span class="csvb-mscat-section-main">${esc(groupTitle)}</span>
            <span class="csvb-mscat-section-sub">Open to select from this M-SCAT family</span>
          </span>
          <span class="csvb-mscat-section-count">${selectedInGroup} selected / ${group.rows.length}</span>
        </summary>
        <div class="csvb-mscat-section-body">
    `;

    for (const row of group.rows) {
      const checked = selected.has(String(row.id)) ? "checked" : "";
      const label = `${row.item_no ? row.item_no + " " : ""}${row.item_label}`;

      html += `
        <label class="csvb-mscat-check">
          <input type="checkbox" name="mscatTaxonomyId" value="${esc(row.id)}" ${checked}>
          <span><span class="csvb-mscat-code">${esc(row.item_code)}</span> — ${esc(label)}</span>
        </label>
      `;
    }

    html += `
        </div>
      </details>
    `;
  }

  body.innerHTML = html || `<div class="csvb-mscat-summary">No M-SCAT taxonomy rows found.</div>`;

  document.querySelectorAll('input[name="mscatTaxonomyId"]').forEach((checkbox) => {
    checkbox.addEventListener("change", updateDialogGroupCounts);
  });

  updateDialogGroupCounts();
}

function updateDialogGroupCounts() {
  document.querySelectorAll(".csvb-mscat-section-card").forEach((details) => {
    const boxes = Array.from(details.querySelectorAll('input[name="mscatTaxonomyId"]'));
    const checked = boxes.filter((x) => x.checked).length;
    const pill = details.querySelector(".csvb-mscat-section-count");
    if (pill) pill.textContent = `${checked} selected / ${boxes.length}`;
  });
}

function setAllMscatGroupsOpen(open) {
  document.querySelectorAll(".csvb-mscat-section-card").forEach((details) => {
    details.open = Boolean(open);
  });
}

async function saveDialog() {
  if (!mscat.item?.id) {
    alert("M-SCAT cannot be saved because the observation item is not loaded.");
    return;
  }

  const desired = new Set(
    Array.from(document.querySelectorAll('input[name="mscatTaxonomyId"]:checked'))
      .map((x) => String(x.value || "").trim())
      .filter(Boolean)
  );

  const current = selectedIds();
  const toAdd = Array.from(desired).filter((id) => !current.has(id));
  const toRemove = Array.from(current).filter((id) => !desired.has(id));

  setTopStatus("Saving M-SCAT…");

  if (toRemove.length) {
    const { error } = await mscat.supabase
      .from("post_inspection_observation_mscat")
      .delete()
      .eq("observation_item_id", mscat.item.id)
      .in("taxonomy_id", toRemove);

    if (error) {
      console.error(error);
      setTopStatus("M-SCAT save error");
      alert("M-SCAT delete failed: " + (error.message || String(error)));
      return;
    }
  }

  if (toAdd.length) {
    const rows = toAdd.map((taxonomyId) => ({
      observation_item_id: mscat.item.id,
      report_id: mscat.item.report_id,
      company_id: mscat.item.company_id || null,
      taxonomy_id: taxonomyId,
      selection_source: "manual",
    }));

    const { error } = await mscat.supabase
      .from("post_inspection_observation_mscat")
      .insert(rows);

    if (error) {
      console.error(error);
      setTopStatus("M-SCAT save error");
      alert("M-SCAT insert failed: " + (error.message || String(error)));
      return;
    }
  }

  await loadSelections();
  renderCard();

  const dialog = q("mscatDialog");
  if (dialog?.open) dialog.close();

  setTopStatus("M-SCAT saved");
}

async function openDialog() {
  if (!itemNeedsMscat(mscat.item)) {
    alert("M-SCAT analysis is required for Negative and Largely as Expected observations only.");
    return;
  }

  await loadSelections();

  const dialog = ensureDialog();
  renderDialogBody();

  q("mscatCancelBtn").onclick = () => dialog.open && dialog.close();
  q("mscatSaveBtn").onclick = saveDialog;
  q("mscatExpandAllBtn").onclick = () => setAllMscatGroupsOpen(true);
  q("mscatCollapseAllBtn").onclick = () => setAllMscatGroupsOpen(false);

  dialog.showModal();
}

async function initMscat() {
  injectMscatStyle();
  ensureCard();

  const params = new URLSearchParams(location.search);
  mscat.reportId = params.get("report_id") || "";
  mscat.itemId = params.get("item_id") || "";

  if (!mscat.reportId || !mscat.itemId) {
    q("mscatSummary").textContent = "M-SCAT unavailable: missing report_id or item_id.";
    return;
  }

  const ok = await waitForAuth(5000);
  if (!ok) {
    q("mscatSummary").textContent = "M-SCAT unavailable: authentication module not loaded.";
    return;
  }

  mscat.supabase = window.AUTH.ensureSupabase();

  q("openMscatBtn").addEventListener("click", openDialog);
  q("reloadMscatBtn").addEventListener("click", reloadAll);

  await reloadAll();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initMscat().catch(console.error));
} else {
  initMscat().catch(console.error);
}
