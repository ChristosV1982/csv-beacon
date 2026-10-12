// public/inspection-question-set-items-v01.js
// C.S.V. BEACON — Inspection & Assurance Question Set Items v01.
// Adds item management to inspection-question-sets.html.
// No old questionnaire, self-assessment, or post-inspection records are modified.

(() => {
  "use strict";

  const BUILD = "INSPECTION-QUESTION-SET-ITEMS-V01-20260601";
  const SELECTED_KEY = "csvb_assurance_selected_question_set_id";

  window.CSVB_INSPECTION_QS_ITEMS_BUILD = BUILD;

  const MANAGE_ROLES = new Set(["super_admin", "company_admin"]);
  const VIEW_ROLES = new Set(["super_admin", "company_admin", "company_superintendent"]);

  let sb = null;
  let session = null;
  let profile = null;
  let selectedSet = null;
  let items = [];

  function el(id) {
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

  function showWarn(message) {
    const box = el("warnBox");
    if (!box) return;
    box.textContent = message || "";
    box.style.display = message ? "block" : "none";
  }

  function showOk(message) {
    const box = el("okBox");
    if (!box) return;
    box.textContent = message || "";
    box.style.display = message ? "block" : "none";
  }

  function canManage() {
    return MANAGE_ROLES.has(String(profile?.role || ""));
  }

  function canView() {
    return VIEW_ROLES.has(String(profile?.role || ""));
  }

  function sourceLabel(value) {
    const map = {
      SIRE_2_0: "SIRE 2.0",
      RISQ_3: "RISQ 3",
      COMPANY_SPECIFIC: "Company",
      MIXED: "Mixed",
      FREE_TEXT: "Free text"
    };
    return map[value] || value || "-";
  }

  function injectStyle() {
    if (document.getElementById("csvbInspectionQsItemsV01Style")) return;

    const style = document.createElement("style");
    style.id = "csvbInspectionQsItemsV01Style";
    style.textContent = `
      #csvbQsItemsPanel{
        margin-top:10px;
        border:1px solid #d5deef;
        border-radius:14px;
        background:#fff;
        padding:10px;
        box-shadow:0 3px 14px rgba(18,44,87,.08);
      }
      .csvb-qsi-head{
        display:flex;
        gap:10px;
        align-items:flex-start;
        justify-content:space-between;
        flex-wrap:wrap;
        border-bottom:1px solid #e6eefb;
        padding-bottom:8px;
        margin-bottom:8px;
      }
      .csvb-qsi-title{
        font-size:.98rem;
        font-weight:650;
        color:#06305c;
        line-height:1.25;
      }
      .csvb-qsi-sub{
        font-size:.83rem;
        font-weight:400;
        color:#4d6283;
        line-height:1.3;
        margin-top:2px;
      }
      .csvb-qsi-badge{
        display:inline-block;
        border:1px solid #bfe0f5;
        border-radius:999px;
        background:#eaf7ff;
        color:#06305c;
        font-size:.74rem;
        font-weight:600;
        padding:3px 8px;
      }
      .csvb-qsi-grid{
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:8px;
        align-items:start;
      }
      .csvb-qsi-grid .wide{grid-column:span 2;}
      .csvb-qsi-grid .full{grid-column:1/-1;}
      .csvb-qsi-label{
        display:block;
        margin:7px 0 4px;
        font-size:.84rem;
        font-weight:600;
        color:#1a4170;
      }
      .csvb-qsi-input,
      .csvb-qsi-select,
      .csvb-qsi-textarea{
        width:100%;
        box-sizing:border-box;
        border:1px solid #cbd7ee;
        border-radius:9px;
        padding:7px 9px;
        background:#fff;
        color:#1a4170;
        font-family:"Segoe UI",Arial,sans-serif;
        font-size:.9rem;
        font-weight:400;
        outline:none;
      }
      .csvb-qsi-textarea{
        min-height:64px;
        resize:vertical;
      }
      .csvb-qsi-options{
        display:flex;
        gap:12px;
        flex-wrap:wrap;
        align-items:center;
        margin-top:8px;
        color:#1a4170;
        font-size:.84rem;
      }
      .csvb-qsi-options label{
        display:inline-flex;
        align-items:center;
        gap:6px;
        font-weight:450;
        margin:0;
      }
      .csvb-qsi-options input{width:auto;}
      .csvb-qsi-actions{
        display:flex;
        gap:7px;
        flex-wrap:wrap;
        margin-top:8px;
      }
      .csvb-qsi-btn{
        border:1px solid #9fd8ec;
        border-radius:9px;
        background:#eaf6fb;
        color:#062A5E;
        padding:7px 10px;
        font-weight:650;
        font-size:.86rem;
        cursor:pointer;
      }
      .csvb-qsi-btn.primary{
        background:#063b71;
        border-color:#063b71;
        color:#fff;
      }
      .csvb-qsi-btn.danger{
        background:#fff0f0;
        border-color:#f1c7c7;
        color:#7a1f1f;
      }
      .csvb-qsi-btn:disabled{
        opacity:.55;
        cursor:not-allowed;
      }
      .csvb-qsi-table-wrap{
        overflow:auto;
        border:1px solid #d5deef;
        border-radius:10px;
        margin-top:9px;
      }
      .csvb-qsi-table{
        width:100%;
        border-collapse:collapse;
        min-width:980px;
      }
      .csvb-qsi-table th,
      .csvb-qsi-table td{
        padding:7px 8px;
        border-bottom:1px solid #e6eefb;
        vertical-align:top;
      }
      .csvb-qsi-table th{
        background:#f2f7ff;
        color:#1a4170;
        font-weight:650;
        text-align:left;
        position:sticky;
        top:0;
        z-index:1;
      }
      .csvb-qsi-table td{
        color:#223a66;
        font-weight:450;
        font-size:.86rem;
      }
      .csvb-qsi-muted{
        color:#6b7890;
        font-weight:400;
        font-size:.82rem;
        line-height:1.3;
      }
      .csvb-qsi-pill{
        display:inline-block;
        border:1px solid #d5deef;
        border-radius:999px;
        background:#eaf1fb;
        color:#1a4170;
        font-weight:600;
        font-size:.72rem;
        padding:2px 7px;
        white-space:nowrap;
      }
      .csvb-qsi-pill.off{
        background:#fff0f0;
        border-color:#f1c7c7;
        color:#7a1f1f;
      }
      @media(max-width:1100px){
        .csvb-qsi-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
        .csvb-qsi-grid .wide{grid-column:span 2;}
      }
      @media(max-width:620px){
        .csvb-qsi-grid{grid-template-columns:1fr;}
        .csvb-qsi-grid .wide{grid-column:1/-1;}
        .csvb-qsi-btn{width:100%;}
        .csvb-qsi-table{min-width:860px;}
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    let panel = el("csvbQsItemsPanel");
    if (panel) return panel;

    const tableCard = el("setsBody")?.closest(".card") || document.querySelector(".grid .card:nth-child(2)");
    if (!tableCard) return null;

    panel = document.createElement("section");
    panel.id = "csvbQsItemsPanel";
    panel.innerHTML = `
      <div class="csvb-qsi-head">
        <div>
          <div class="csvb-qsi-title">Question Set Items</div>
          <div class="csvb-qsi-sub" id="csvbQsiSelectedLine">Select a question set using the Open button.</div>
        </div>
        <span class="csvb-qsi-badge">build: ${esc(BUILD)}</span>
      </div>

      <div id="csvbQsiEditor" style="display:none;">
        <div class="csvb-qsi-grid">
          <div>
            <label class="csvb-qsi-label" for="csvbQsiSource">Source</label>
            <select class="csvb-qsi-select" id="csvbQsiSource">
              <option value="SIRE_2_0">SIRE 2.0</option>
              <option value="RISQ_3">RISQ 3</option>
              <option value="COMPANY_SPECIFIC">Company specific</option>
              <option value="FREE_TEXT">Free text</option>
              <option value="MIXED">Mixed</option>
            </select>
          </div>
          <div>
            <label class="csvb-qsi-label" for="csvbQsiNo">Question No / Ref.</label>
            <input class="csvb-qsi-input" id="csvbQsiNo" placeholder="e.g. 5.8.2 or COMPANY-001" />
          </div>
          <div>
            <label class="csvb-qsi-label" for="csvbQsiChapter">Chapter</label>
            <input class="csvb-qsi-input" id="csvbQsiChapter" placeholder="e.g. 5" />
          </div>
          <div>
            <label class="csvb-qsi-label" for="csvbQsiCriticality">Criticality</label>
            <select class="csvb-qsi-select" id="csvbQsiCriticality">
              <option value="normal">Normal</option>
              <option value="important">Important</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div class="wide">
            <label class="csvb-qsi-label" for="csvbQsiSection">Section</label>
            <input class="csvb-qsi-input" id="csvbQsiSection" placeholder="Section / topic" />
          </div>
          <div class="wide">
            <label class="csvb-qsi-label" for="csvbQsiShort">Short text</label>
            <input class="csvb-qsi-input" id="csvbQsiShort" placeholder="Short title shown in tables" />
          </div>
          <div class="full">
            <label class="csvb-qsi-label" for="csvbQsiQuestion">Question text / inspection item</label>
            <textarea class="csvb-qsi-textarea" id="csvbQsiQuestion" placeholder="Write the inspection question or company-specific check item..."></textarea>
          </div>
          <div class="wide">
            <label class="csvb-qsi-label" for="csvbQsiEvidence">Expected evidence</label>
            <textarea class="csvb-qsi-textarea" id="csvbQsiEvidence" placeholder="Evidence / document / demonstration expected..."></textarea>
          </div>
          <div class="wide">
            <label class="csvb-qsi-label" for="csvbQsiGuidance">Guidance</label>
            <textarea class="csvb-qsi-textarea" id="csvbQsiGuidance" placeholder="Inspector / superintendent guidance..."></textarea>
          </div>
        </div>

        <div class="csvb-qsi-options">
          <label><input id="csvbQsiRequired" type="checkbox" checked /> Required</label>
          <label><input id="csvbQsiAnswerRequired" type="checkbox" checked /> Answer required</label>
          <label><input id="csvbQsiFindingAllowed" type="checkbox" checked /> Finding allowed</label>
        </div>

        <div class="csvb-qsi-actions">
          <button class="csvb-qsi-btn primary" id="csvbQsiAddBtn" type="button">Add Item</button>
          <button class="csvb-qsi-btn" id="csvbQsiRefreshBtn" type="button">Refresh Items</button>
          <button class="csvb-qsi-btn" id="csvbQsiClearBtn" type="button">Clear Item Form</button>
        </div>
      </div>

      <div class="csvb-qsi-table-wrap">
        <table class="csvb-qsi-table">
          <thead>
            <tr>
              <th style="width:70px;">No.</th>
              <th style="width:120px;">Source</th>
              <th style="width:130px;">Question Ref.</th>
              <th>Item</th>
              <th style="width:120px;">Criticality</th>
              <th style="width:95px;">Status</th>
              <th style="width:160px;">Actions</th>
            </tr>
          </thead>
          <tbody id="csvbQsiBody">
            <tr><td colspan="7" class="csvb-qsi-muted">No question set selected.</td></tr>
          </tbody>
        </table>
      </div>
    `;

    tableCard.appendChild(panel);

    el("csvbQsiAddBtn")?.addEventListener("click", () => addItem().catch(err => showWarn(err.message || String(err))));
    el("csvbQsiRefreshBtn")?.addEventListener("click", () => refreshItems().catch(err => showWarn(err.message || String(err))));
    el("csvbQsiClearBtn")?.addEventListener("click", clearItemForm);
    el("csvbQsiBody")?.addEventListener("click", handleItemAction);

    return panel;
  }

  async function getSessionAndProfile() {
    if (!window.AUTH?.ensureSupabase) throw new Error("AUTH helper is not available.");

    sb = window.AUTH.ensureSupabase();

    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    if (sessionError) throw sessionError;

    session = sessionData?.session || null;
    if (!session?.user) throw new Error("You are not logged in.");

    const { data, error } = await sb
      .from("profiles")
      .select("id, username, role, company_id, vessel_id, position")
      .eq("id", session.user.id)
      .single();

    if (error) throw error;
    profile = data;

    if (!canView()) {
      throw new Error("Question set item management is not available to this role in this phase.");
    }
  }

  function saveSelectedId(id) {
    try {
      localStorage.setItem(SELECTED_KEY, id || "");
    } catch {}
  }

  function loadSelectedId() {
    try {
      return localStorage.getItem(SELECTED_KEY) || "";
    } catch {
      return "";
    }
  }

  async function selectQuestionSet(id) {
    if (!id) return;

    await getSessionAndProfile();

    const { data, error } = await sb
      .from("assurance_question_sets")
      .select("id, company_id, question_set_name, question_set_code, question_set_type, source_scope, status, is_active")
      .eq("id", id)
      .single();

    if (error) throw error;

    selectedSet = data;
    saveSelectedId(id);
    renderSelectedSet();
    await refreshItems();
  }

  function renderSelectedSet() {
    ensurePanel();

    const line = el("csvbQsiSelectedLine");
    const editor = el("csvbQsiEditor");

    if (!selectedSet) {
      if (line) line.textContent = "Select a question set using the Open button.";
      if (editor) editor.style.display = "none";
      renderItems();
      return;
    }

    const code = selectedSet.question_set_code ? ` · ${selectedSet.question_set_code}` : "";
    const status = selectedSet.status ? ` · ${selectedSet.status}` : "";

    if (line) {
      line.textContent = `Selected: ${selectedSet.question_set_name}${code}${status}`;
    }

    if (editor) editor.style.display = canManage() ? "block" : "none";
  }

  function clearItemForm() {
    [
      "csvbQsiNo",
      "csvbQsiChapter",
      "csvbQsiSection",
      "csvbQsiShort",
      "csvbQsiQuestion",
      "csvbQsiEvidence",
      "csvbQsiGuidance"
    ].forEach(id => {
      const node = el(id);
      if (node) node.value = "";
    });

    if (el("csvbQsiSource")) el("csvbQsiSource").value = "SIRE_2_0";
    if (el("csvbQsiCriticality")) el("csvbQsiCriticality").value = "normal";
    if (el("csvbQsiRequired")) el("csvbQsiRequired").checked = true;
    if (el("csvbQsiAnswerRequired")) el("csvbQsiAnswerRequired").checked = true;
    if (el("csvbQsiFindingAllowed")) el("csvbQsiFindingAllowed").checked = true;
  }

  function collectItemPayload() {
    if (!selectedSet?.id) throw new Error("Select a question set first.");
    if (!canManage()) throw new Error("Only Super Admin and Company Admin can add question set items in this phase.");

    const source_library = String(el("csvbQsiSource")?.value || "COMPANY_SPECIFIC").trim();
    const source_question_no = String(el("csvbQsiNo")?.value || "").trim() || null;
    const chapter = String(el("csvbQsiChapter")?.value || "").trim() || null;
    const section = String(el("csvbQsiSection")?.value || "").trim() || null;
    const short_text = String(el("csvbQsiShort")?.value || "").trim() || null;
    const custom_question_text = String(el("csvbQsiQuestion")?.value || "").trim() || null;
    const expected_evidence = String(el("csvbQsiEvidence")?.value || "").trim() || null;
    const inspector_guidance = String(el("csvbQsiGuidance")?.value || "").trim() || null;
    const criticality = String(el("csvbQsiCriticality")?.value || "normal").trim();

    if (!source_question_no && !custom_question_text) {
      throw new Error("Either Question No / Ref. or Question text is required.");
    }

    const nextItemNo = items.reduce((max, row) => Math.max(max, Number(row.item_no || 0)), 0) + 1;
    const nextOrder = items.reduce((max, row) => Math.max(max, Number(row.order_index || 0)), 0) + 100;

    return {
      company_id: selectedSet.company_id,
      question_set_id: selectedSet.id,
      item_no: nextItemNo,
      order_index: nextOrder,
      source_library,
      source_question_no,
      chapter,
      section,
      short_text,
      custom_question_text,
      expected_evidence,
      inspector_guidance,
      criticality,
      is_required: !!el("csvbQsiRequired")?.checked,
      answer_required: !!el("csvbQsiAnswerRequired")?.checked,
      finding_allowed: !!el("csvbQsiFindingAllowed")?.checked,
      is_active: true,
      created_by: session.user.id,
      updated_by: session.user.id,
      metadata: {
        created_from: "inspection-question-set-items-v01.js",
        build: BUILD
      }
    };
  }

  async function addItem() {
    showWarn("");
    showOk("");

    const payload = collectItemPayload();

    const { error } = await sb
      .from("assurance_question_set_items")
      .insert(payload);

    if (error) throw error;

    showOk("Question set item added.");
    clearItemForm();
    await refreshItems();
  }

  async function refreshItems() {
    ensurePanel();

    if (!selectedSet?.id) {
      items = [];
      renderItems();
      return;
    }

    const { data, error } = await sb
      .from("assurance_question_set_items")
      .select("id, question_set_id, item_no, order_index, source_library, source_question_no, chapter, section, short_text, custom_question_text, expected_evidence, inspector_guidance, criticality, is_required, answer_required, finding_allowed, is_active, updated_at")
      .eq("question_set_id", selectedSet.id)
      .order("order_index", { ascending: true })
      .order("item_no", { ascending: true });

    if (error) throw error;

    items = data || [];
    renderItems();

    window.CSVB_INSPECTION_QS_ITEMS_STATE = {
      build: BUILD,
      selected_question_set_id: selectedSet?.id || null,
      item_count: items.length
    };
  }

  function renderItems() {
    const tbody = el("csvbQsiBody");
    if (!tbody) return;

    if (!selectedSet) {
      tbody.innerHTML = `<tr><td colspan="7" class="csvb-qsi-muted">No question set selected.</td></tr>`;
      return;
    }

    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="csvb-qsi-muted">No items in this question set yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(row => {
      const itemText = row.short_text || row.custom_question_text || row.expected_evidence || "-";
      const sub = [row.chapter ? `Ch. ${row.chapter}` : "", row.section || ""].filter(Boolean).join(" · ");
      const activePill = row.is_active === false
        ? `<span class="csvb-qsi-pill off">Inactive</span>`
        : `<span class="csvb-qsi-pill">Active</span>`;

      return `
        <tr>
          <td class="mono">${esc(row.item_no || "-")}</td>
          <td>${esc(sourceLabel(row.source_library))}</td>
          <td class="mono">${esc(row.source_question_no || "-")}</td>
          <td>
            <div>${esc(itemText)}</div>
            <div class="csvb-qsi-muted">${esc(sub || "-")}</div>
          </td>
          <td>${esc(row.criticality || "normal")}</td>
          <td>${activePill}</td>
          <td>
            <button class="csvb-qsi-btn" data-qsi-action="toggle" data-id="${esc(row.id)}" type="button" ${!canManage() ? "disabled" : ""}>${row.is_active === false ? "Activate" : "Deactivate"}</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function handleItemAction(event) {
    const btn = event.target?.closest?.("button[data-qsi-action]");
    if (!btn) return;

    try {
      showWarn("");
      showOk("");

      const action = btn.getAttribute("data-qsi-action");
      const id = btn.getAttribute("data-id");
      const row = items.find(x => String(x.id) === String(id));
      if (!row) return;

      if (!canManage()) throw new Error("You do not have permission to edit question set items.");

      if (action === "toggle") {
        const { error } = await sb
          .from("assurance_question_set_items")
          .update({
            is_active: row.is_active === false,
            updated_by: session.user.id
          })
          .eq("id", id);

        if (error) throw error;

        await refreshItems();
      }
    } catch (err) {
      showWarn(err.message || String(err));
    }
  }

  function hookQuestionSetOpenButtons() {
    document.addEventListener("click", event => {
      const btn = event.target?.closest?.('button[data-action="open"][data-id]');
      if (!btn) return;

      const id = btn.getAttribute("data-id") || "";
      if (!id) return;

      window.setTimeout(() => {
        selectQuestionSet(id).catch(err => showWarn(err.message || String(err)));
      }, 50);
    }, true);
  }

  async function restoreSelection() {
    const id = loadSelectedId();
    if (!id) return;

    try {
      await selectQuestionSet(id);
    } catch (_) {
      saveSelectedId("");
      selectedSet = null;
      items = [];
      renderSelectedSet();
    }
  }

  async function init() {
    injectStyle();
    ensurePanel();
    hookQuestionSetOpenButtons();

    try {
      await getSessionAndProfile();
      renderSelectedSet();
      await restoreSelection();
    } catch (err) {
      showWarn(err.message || String(err));
    }

    window.CSVB_INSPECTION_QS_ITEMS_STATE = {
      build: BUILD,
      selected_question_set_id: selectedSet?.id || null,
      item_count: items.length
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
