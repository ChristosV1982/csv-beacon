const MSCAT_BUILD = "csvb_mscat_ui_v06a_ai_suggestions_source_fix_2026-06-17";
const MSCAT_SOURCE_REF = "DNV M-SCAT 8.2";

const mscat = {
  supabase: null,
  reportId: "",
  itemId: "",
  item: null,
  taxonomy: [],
  selections: [],
  aiSuggestions: [],
  aiSuggestedIds: new Set(),
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

    /* v05 full-window compact M-SCAT modal */
    .csvb-mscat-dialog{
      width:96vw;
      max-width:none;
      height:92vh;
      max-height:92vh;
      border-radius:16px;
      box-shadow:0 20px 60px rgba(11,31,52,.35);
    }
    .csvb-mscat-dialog::backdrop{
      background:rgba(7,18,31,.48);
    }
    .csvb-mscat-dialog .dlg{
      height:92vh;
      max-height:92vh;
      padding:0;
      overflow:hidden;
      display:flex;
      flex-direction:column;
      background:#ffffff;
    }
    .csvb-mscat-dialog-header{
      display:flex;
      justify-content:space-between;
      gap:12px;
      align-items:flex-start;
      padding:10px 14px;
      border-bottom:1px solid #dbe8f8;
      background:#ffffff;
      flex:0 0 auto;
    }
    .csvb-mscat-dialog h3{
      margin:0 0 4px;
      font-size:18px;
      line-height:1.15;
    }
    .csvb-mscat-dialog .dlg-sub{
      margin:0;
      font-size:12px;
      line-height:1.25;
    }
    .csvb-mscat-dialog-body{
      flex:1 1 auto;
      overflow:auto;
      padding:8px 12px 10px;
      background:#f8fbff;
    }
    .csvb-mscat-dialog-toolbar{
      margin:0;
      padding:7px 12px;
      border-bottom:1px solid #e5eefc;
      background:#ffffff;
      flex:0 0 auto;
    }
    .csvb-mscat-dialog-toolbar .btn,
    .csvb-mscat-dialog-actions .btn,
    .csvb-mscat-close-window{
      padding:7px 11px;
      font-size:12px;
      line-height:1.15;
    }
    .csvb-mscat-compact-note{
      margin:0;
      border:none;
      border-radius:0;
      border-bottom:1px solid #e5eefc;
      padding:7px 12px;
      font-size:12px;
      line-height:1.25;
      background:#f8fbff;
      flex:0 0 auto;
    }
    .csvb-mscat-dialog-actions{
      margin:0;
      padding:9px 12px;
      border-top:1px solid #dbe8f8;
      background:#ffffff;
      flex:0 0 auto;
    }
    .csvb-mscat-section-card{
      margin:6px 0;
      border-radius:12px;
    }
    .csvb-mscat-section-card summary{
      padding:7px 10px;
      gap:8px;
    }
    .csvb-mscat-section-main{
      font-size:13px;
      line-height:1.15;
    }
    .csvb-mscat-section-sub{
      font-size:11px;
      line-height:1.15;
    }
    .csvb-mscat-section-count{
      font-size:11px;
      padding:3px 8px;
    }
    .csvb-mscat-section-body{
      padding:6px 8px 7px;
    }
    .csvb-mscat-subgroup{
      padding-top:5px;
      margin-top:5px;
      border-top:1px dashed rgba(80,111,143,.28);
    }
    .csvb-mscat-subgroup:first-child{
      margin-top:0;
      padding-top:0;
      border-top:none;
    }
    .csvb-mscat-subgroup h5{
      margin:3px 0 5px;
      font-size:12px;
      line-height:1.15;
    }
    .csvb-mscat-option-grid{
      display:grid;
      grid-template-columns:repeat(3,minmax(220px,1fr));
      gap:3px 8px;
      align-items:start;
    }
    .csvb-mscat-check{
      padding:3px 4px;
      gap:5px;
      border-bottom:none;
      border-radius:7px;
      background:rgba(255,255,255,.78);
      font-size:12px;
      line-height:1.18;
      min-height:28px;
    }
    .csvb-mscat-check:hover{
      background:#ffffff;
      box-shadow:0 0 0 1px rgba(120,150,185,.20) inset;
    }
    .csvb-mscat-check input{
      margin-top:1px;
      transform:scale(.92);
    }
    .csvb-mscat-code{
      font-size:11px;
    }
    .csvb-mscat-ai-note{
      border:1px solid #c9dcf5;
      background:#eef6ff;
      color:#123e68;
      border-radius:10px;
      padding:7px 9px;
      margin:0 0 7px;
      font-size:12px;
      font-weight:800;
      line-height:1.25;
    }
    .csvb-mscat-check.csvb-mscat-ai-suggested{
      background:#fff9df;
      box-shadow:0 0 0 1px #edd37b inset;
    }
    .csvb-mscat-ai-badge{
      display:inline-flex;
      align-items:center;
      margin-left:5px;
      padding:1px 5px;
      border-radius:999px;
      background:#ffe89a;
      border:1px solid #e2c25a;
      color:#5c4100;
      font-size:10px;
      font-weight:900;
      white-space:nowrap;
    }
    .csvb-mscat-ai-reason{
      display:block;
      margin-top:2px;
      color:#5c4100;
      font-size:10.5px;
      font-weight:800;
      line-height:1.15;
    }

    .csvb-mscat-section-card.csvb-mscat-immediate{
      border-color:#f0c2a4;
      background:#fff8f3;
    }
    .csvb-mscat-section-card.csvb-mscat-immediate summary{
      background:#fff0e5;
      border-bottom-color:#f0c2a4;
      color:#73320e;
    }
    .csvb-mscat-section-card.csvb-mscat-immediate .csvb-mscat-section-count{
      border-color:#efc4ab;
      color:#73320e;
      background:#fffaf6;
    }

    .csvb-mscat-section-card.csvb-mscat-basic{
      border-color:#c9dcf5;
      background:#f7fbff;
    }
    .csvb-mscat-section-card.csvb-mscat-basic summary{
      background:#edf6ff;
      border-bottom-color:#c9dcf5;
      color:#123e68;
    }
    .csvb-mscat-section-card.csvb-mscat-basic .csvb-mscat-section-count{
      border-color:#c9dcf5;
      color:#123e68;
      background:#ffffff;
    }

    .csvb-mscat-section-card.csvb-mscat-control{
      border-color:#c8e5d0;
      background:#f5fbf7;
    }
    .csvb-mscat-section-card.csvb-mscat-control summary{
      background:#eaf8ee;
      border-bottom-color:#c8e5d0;
      color:#14522c;
    }
    .csvb-mscat-section-card.csvb-mscat-control .csvb-mscat-section-count{
      border-color:#c8e5d0;
      color:#14522c;
      background:#ffffff;
    }

    @media (max-width:1250px){
      .csvb-mscat-option-grid{ grid-template-columns:repeat(2,minmax(220px,1fr)); }
    }
    @media (max-width:760px){
      .csvb-mscat-dialog{
        width:98vw;
        height:94vh;
        max-height:94vh;
      }
      .csvb-mscat-dialog .dlg{
        height:94vh;
        max-height:94vh;
      }
      .csvb-mscat-option-grid{ grid-template-columns:1fr; }
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
      <button class="btn btn-muted" id="suggestMscatBtn" type="button">AI Suggest M-SCAT</button>
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
      <div class="csvb-mscat-dialog-header">
        <div>
          <h3>M-SCAT Analysis</h3>
          <div class="dlg-sub">
            Select Immediate Cause(s), Basic Cause(s), and Control Area(s) for Improvement Actions.
          </div>
        </div>
        <button class="btn btn-muted csvb-mscat-close-window" id="mscatCloseWindowTopBtn" type="button">Close Window</button>
      </div>

      <div class="csvb-mscat-dialog-toolbar">
        <button class="btn btn-muted" id="mscatExpandAllBtn" type="button">Expand all</button>
        <button class="btn btn-muted" id="mscatCollapseAllBtn" type="button">Collapse all</button>
        <button class="btn btn-muted" id="mscatAiSuggestBtn" type="button">AI Suggest M-SCAT</button>
      </div>

      <div class="csvb-mscat-compact-note">
        The list is grouped in five M-SCAT families. Open the relevant family and tick the applicable item(s).
      </div>

      <div id="mscatDialogBody" class="csvb-mscat-dialog-body"></div>

      <div class="csvb-mscat-dialog-actions">
        <button class="btn btn-muted" id="mscatCloseWindowBtn" type="button">Close Window</button>
        <button class="btn primary" id="mscatSaveBtn" type="button">Save M-SCAT Selection</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  return dialog;
}

function mscatPanelTitle(row) {
  if (row.section_key === "immediate_cause") {
    return `${row.section_label} — ${row.subsection_label}`;
  }

  return row.section_label;
}

function mscatPanelKey(row) {
  if (row.section_key === "immediate_cause") {
    return `${row.section_key}|||${row.subsection_key}|||${mscatPanelTitle(row)}`;
  }

  return `${row.section_key}|||${row.section_label}|||${mscatPanelTitle(row)}`;
}

function mscatPanelClass(panel) {
  const key = String(panel?.section_key || "").toLowerCase();

  if (key.includes("immediate")) return "csvb-mscat-immediate";
  if (key.includes("basic")) return "csvb-mscat-basic";
  return "csvb-mscat-control";
}

function aiSuggestionForCode(itemCode) {
  const code = String(itemCode || "").trim();
  return (mscat.aiSuggestions || []).find((s) => String(s.item_code || "").trim() === code) || null;
}

function renderMscatOption(row, selected) {
  const rowId = String(row.id);
  const suggestion = aiSuggestionForCode(row.item_code);
  const isAiSuggested = Boolean(suggestion) || Boolean(mscat.aiSuggestedIds?.has(rowId));
  const checked = selected.has(rowId) || isAiSuggested ? "checked" : "";
  const label = `${row.item_no ? row.item_no + " " : ""}${row.item_label}`;
  const cssClass = isAiSuggested ? "csvb-mscat-check csvb-mscat-ai-suggested" : "csvb-mscat-check";
  const reason = suggestion?.reason ? String(suggestion.reason) : "";
  const confidence = Number(suggestion?.confidence || 0);
  const confidencePct = confidence ? ` ${Math.round(confidence * 100)}%` : "";
  const badge = isAiSuggested ? `<span class="csvb-mscat-ai-badge">AI Suggested${esc(confidencePct)}</span>` : "";
  const reasonHtml = reason ? `<span class="csvb-mscat-ai-reason">${esc(reason)}</span>` : "";

  return `
    <label class="${cssClass}">
      <input type="checkbox" name="mscatTaxonomyId" value="${esc(row.id)}" ${checked}>
      <span><span class="csvb-mscat-code">${esc(row.item_code)}</span> — ${esc(label)}${badge}${reasonHtml}</span>
    </label>
  `;
}

function renderDialogBody() {
  const body = q("mscatDialogBody");
  if (!body) return;

  const selected = selectedIds();
  const panelMap = new Map();

  for (const row of mscat.taxonomy || []) {
    const panelKey = mscatPanelKey(row);

    if (!panelMap.has(panelKey)) {
      panelMap.set(panelKey, {
        title: mscatPanelTitle(row),
        section_key: row.section_key,
        rows: [],
      });
    }

    panelMap.get(panelKey).rows.push(row);
  }

  let html = "";

  if ((mscat.aiSuggestions || []).length) {
    html += `
      <div class="csvb-mscat-ai-note">
        AI has pre-ticked ${esc(mscat.aiSuggestions.length)} suggested M-SCAT item(s). Review, untick if not applicable, add any missing items, then press Save M-SCAT Selection to confirm.
      </div>
    `;
  }

  for (const panel of panelMap.values()) {
    const selectedInPanel = panel.rows.filter((row) => selected.has(String(row.id))).length;
    const openAttr = selectedInPanel ? "open" : "";
    const safeId = panel.title.replace(/[^a-z0-9_-]/gi, "_");
    const panelClass = mscatPanelClass(panel);

    html += `
      <details class="csvb-mscat-section-card ${esc(panelClass)}" id="mscatPanel_${esc(safeId)}" ${openAttr}>
        <summary>
          <span class="csvb-mscat-section-title">
            <span class="csvb-mscat-section-main">${esc(panel.title)}</span>
            <span class="csvb-mscat-section-sub">Open to review and select from this M-SCAT family</span>
          </span>
          <span class="csvb-mscat-section-count">${selectedInPanel} selected / ${panel.rows.length}</span>
        </summary>
        <div class="csvb-mscat-section-body">
    `;

    if (panel.section_key === "immediate_cause") {
      html += `<div class="csvb-mscat-option-grid">`;
      for (const row of panel.rows) html += renderMscatOption(row, selected);
      html += `</div>`;
    } else {
      const subMap = new Map();

      for (const row of panel.rows) {
        const subKey = `${row.subsection_key}|||${row.subsection_label}`;
        if (!subMap.has(subKey)) subMap.set(subKey, []);
        subMap.get(subKey).push(row);
      }

      for (const [subKey, rows] of subMap.entries()) {
        const [, subLabel] = subKey.split("|||");

        html += `
          <div class="csvb-mscat-subgroup">
            <h5>${esc(subLabel)}</h5>
            <div class="csvb-mscat-option-grid">
        `;

        for (const row of rows) html += renderMscatOption(row, selected);

        html += `
            </div>
          </div>
        `;
      }
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
    const rows = toAdd.map((taxonomyId) => {
      const suggestion = (mscat.aiSuggestions || []).find((s) => String(s.taxonomy_id) === String(taxonomyId));

      return {
        observation_item_id: mscat.item.id,
        report_id: mscat.item.report_id,
        company_id: mscat.item.company_id || null,
        taxonomy_id: taxonomyId,
        selection_source: suggestion ? "ai_suggested" : "manual",
        notes: suggestion?.reason || null,
      };
    });

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
  mscat.aiSuggestions = [];
  mscat.aiSuggestedIds = new Set();
  renderCard();

  const dialog = q("mscatDialog");
  if (dialog?.open) dialog.close();

  setTopStatus("M-SCAT saved");
}

function setAiButtonsBusy(busy) {
  const ids = ["suggestMscatBtn", "mscatAiSuggestBtn"];
  for (const id of ids) {
    const btn = q(id);
    if (!btn) continue;
    btn.disabled = Boolean(busy);
    btn.textContent = busy ? "AI suggesting…" : "AI Suggest M-SCAT";
  }
}

function presentMscatDialog() {
  const dialog = ensureDialog();
  renderDialogBody();

  const closeDialog = () => dialog.open && dialog.close();

  q("mscatCloseWindowBtn").onclick = closeDialog;
  q("mscatCloseWindowTopBtn").onclick = closeDialog;
  q("mscatSaveBtn").onclick = saveDialog;
  q("mscatExpandAllBtn").onclick = () => setAllMscatGroupsOpen(true);
  q("mscatCollapseAllBtn").onclick = () => setAllMscatGroupsOpen(false);
  q("mscatAiSuggestBtn").onclick = suggestMscatWithAi;

  if (!dialog.open) dialog.showModal();
}

async function openDialog() {
  if (!itemNeedsMscat(mscat.item)) {
    alert("M-SCAT analysis is required for Negative and Largely as Expected observations only.");
    return;
  }

  await loadSelections();
  mscat.aiSuggestions = [];
  mscat.aiSuggestedIds = new Set();
  presentMscatDialog();
}

async function suggestMscatWithAi() {
  if (!itemNeedsMscat(mscat.item)) {
    alert("AI M-SCAT suggestion is required for Negative and Largely as Expected observations only.");
    return;
  }

  try {
    setAiButtonsBusy(true);
    setTopStatus("AI suggesting M-SCAT…");

    if (!mscat.taxonomy.length) await loadTaxonomy();
    await loadSelections();

    const { data, error } = await mscat.supabase.functions.invoke("suggest-post-inspection-mscat", {
      body: {
        report_id: mscat.reportId,
        observation_item_id: mscat.itemId,
      },
    });

    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "AI M-SCAT suggestion failed.");

    mscat.aiSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
    mscat.aiSuggestedIds = new Set(
      mscat.aiSuggestions
        .map((s) => String(s.taxonomy_id || "").trim())
        .filter(Boolean)
    );

    if (!mscat.aiSuggestions.length) {
      alert("AI did not return any valid M-SCAT suggestions for this observation.");
      setTopStatus("AI M-SCAT: no valid suggestions");
      return;
    }

    setTopStatus(`AI suggested ${mscat.aiSuggestions.length} M-SCAT item(s). Review before saving.`);
    presentMscatDialog();
  } catch (e) {
    console.error(e);
    setTopStatus("AI M-SCAT suggestion error");
    alert("AI M-SCAT suggestion failed: " + (e?.message || String(e)));
  } finally {
    setAiButtonsBusy(false);
  }
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
  q("suggestMscatBtn").addEventListener("click", suggestMscatWithAi);
  q("reloadMscatBtn").addEventListener("click", reloadAll);

  await reloadAll();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initMscat().catch(console.error));
} else {
  initMscat().catch(console.error);
}
