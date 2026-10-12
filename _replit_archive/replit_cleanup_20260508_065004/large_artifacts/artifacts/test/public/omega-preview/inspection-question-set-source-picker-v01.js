// public/inspection-question-set-source-picker-v01.js
// C.S.V. BEACON - Assurance Question Set Source Picker v01
// Lets users select source questions with checkboxes and add them in bulk to a question set.

(() => {
  "use strict";

  const BUILD = "ASSURANCE-QS-SOURCE-PICKER-V01-20260601";
  const MANAGE_ROLES = new Set(["super_admin", "company_admin"]);
  const SOURCE_MAP = {
    SIRE_2_0: new Set(["SIRE", "SIRE_2_0", "SIRE 2.0"]),
    RISQ_3: new Set(["RISQ", "RISQ_3", "RISQ 3", "RISQ_3_2", "RIGHTSHIP"])
  };

  let sb = null;
  let session = null;
  let profile = null;
  let questionSet = null;
  let sourceRows = [];
  let visibleRows = [];
  let existingKeys = new Set();
  let selectedIds = new Set();

  const $ = (id) => document.getElementById(id);
  const s = (v) => v === null || v === undefined ? "" : String(v);
  const esc = (v) => s(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const params = () => new URLSearchParams(location.search || "");
  const qsId = () => params().get("id") || "";
  const canManage = () => MANAGE_ROLES.has(s(profile?.role));
  const pget = (p, keys) => { for (const k of keys) { const v = p?.[k]; if (v !== null && v !== undefined && s(v).trim()) return s(v); } return ""; };

  function numberBase(row) {
    const raw = s(row?.number_base || row?.number_full || "").replace(/-$/, "").trim();
    return raw || s(row?.payload?.number || row?.payload?.QuestionNo || "").trim();
  }
  function qno(row) {
    const base = numberBase(row);
    const suffix = s(row?.number_suffix).trim();
    return suffix ? `${base}-${suffix}` : base;
  }
  function chapter(row) {
    const m = qno(row).match(/^(\d+)\./);
    return m ? String(Number(m[1])) : "";
  }
  function sourceMatches(row, selectedSource) {
    const raw = s(row?.source_type || row?.source || "").trim().toUpperCase();
    const allowed = SOURCE_MAP[selectedSource] || new Set([selectedSource]);
    return Array.from(allowed).some(x => raw === s(x).trim().toUpperCase());
  }
  function sourceLabel(value) {
    return value === "RISQ_3" ? "RISQ 3" : value === "SIRE_2_0" ? "SIRE 2.0" : value;
  }
  function existingKey(source, no) {
    return `${source}::${s(no).trim().toUpperCase()}`;
  }

  function showWarn(message) {
    const n = $("warnBox");
    if (!n) return;
    n.textContent = message || "";
    n.style.display = message ? "block" : "none";
  }
  function showOk(message) {
    const n = $("okBox");
    if (!n) return;
    n.textContent = message || "";
    n.style.display = message ? "block" : "none";
  }

  function injectStyle() {
    if ($("csvbSourcePickerStyle")) return;
    const style = document.createElement("style");
    style.id = "csvbSourcePickerStyle";
    style.textContent = `
      #csvbSourcePickerPanel{margin-top:10px}.csvb-picker-controls{display:grid;grid-template-columns:170px 1fr 120px auto auto auto;gap:7px;align-items:end;margin:8px 0}.csvb-picker-controls label{font-size:.82rem;font-weight:600;margin:0 0 4px;color:#1a4170}.csvb-picker-controls input,.csvb-picker-controls select{width:100%;box-sizing:border-box;border:1px solid #cbd7ee;border-radius:9px;padding:7px 9px;background:#fff;color:#1a4170;font-size:.9rem;min-height:36px}.csvb-picker-meta{font-size:.82rem;color:#48628e;margin:6px 0}.csvb-picker-table-wrap{max-height:420px;overflow:auto;border:1px solid #d5deef;border-radius:10px;background:#fff}.csvb-picker-table{width:100%;border-collapse:collapse;min-width:920px}.csvb-picker-table th,.csvb-picker-table td{padding:7px 8px;border-bottom:1px solid #e6eefb;vertical-align:top;font-size:.86rem}.csvb-picker-table th{background:#f2f7ff;color:#1a4170;font-weight:650;text-align:left;position:sticky;top:0;z-index:1}.csvb-picker-small{font-size:.8rem;color:#48628e;line-height:1.3}.csvb-picker-dup{opacity:.55;background:#f6f8fb}.csvb-picker-check{width:auto!important;min-height:auto!important}@media(max-width:1100px){.csvb-picker-controls{grid-template-columns:1fr 1fr}.csvb-picker-controls .wide{grid-column:1/-1}}@media(max-width:620px){.csvb-picker-controls{grid-template-columns:1fr}.csvb-picker-table{min-width:820px}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if ($("csvbSourcePickerPanel")) return;
    const itemsCard = $("itemsBody")?.closest(".card");
    if (!itemsCard) return;
    const panel = document.createElement("section");
    panel.id = "csvbSourcePickerPanel";
    panel.className = "card";
    panel.innerHTML = `
      <h2>Choose Questions from Source Library</h2>
      <div class="note">Select source, filter the list, tick one or more questions, then add selected questions to this question set.</div>
      <div class="csvb-picker-controls">
        <div><label for="csvbPickerSource">Source</label><select id="csvbPickerSource"><option value="SIRE_2_0">SIRE 2.0</option><option value="RISQ_3">RISQ 3</option></select></div>
        <div class="wide"><label for="csvbPickerSearch">Search</label><input id="csvbPickerSearch" placeholder="Search question no / short text / question text..." /></div>
        <div><label for="csvbPickerChapter">Chapter</label><input id="csvbPickerChapter" placeholder="e.g. 5" /></div>
        <button class="btn secondary" id="csvbPickerLoadBtn" type="button">Load</button>
        <button class="btn secondary" id="csvbPickerSelectVisibleBtn" type="button">Select Visible</button>
        <button class="btn" id="csvbPickerAddBtn" type="button">Add Selected</button>
      </div>
      <div class="csvb-picker-meta" id="csvbPickerMeta">Not loaded.</div>
      <div class="csvb-picker-table-wrap"><table class="csvb-picker-table"><thead><tr><th style="width:46px;"><input id="csvbPickerAll" class="csvb-picker-check" type="checkbox" /></th><th style="width:115px;">Question No.</th><th style="width:90px;">Chapter</th><th>Question</th><th style="width:100px;">Status</th></tr></thead><tbody id="csvbPickerBody"><tr><td colspan="5">Load source questions.</td></tr></tbody></table></div>
    `;
    itemsCard.parentNode.insertBefore(panel, itemsCard);
    $("csvbPickerLoadBtn")?.addEventListener("click", () => loadSourceRows().catch(e => showWarn(e.message || String(e))));
    $("csvbPickerSearch")?.addEventListener("input", renderPicker);
    $("csvbPickerChapter")?.addEventListener("input", renderPicker);
    $("csvbPickerSelectVisibleBtn")?.addEventListener("click", selectVisible);
    $("csvbPickerAddBtn")?.addEventListener("click", () => addSelected().catch(e => showWarn(e.message || String(e))));
    $("csvbPickerAll")?.addEventListener("change", e => { if (e.target.checked) selectVisible(); else { selectedIds.clear(); renderPicker(); } });
    $("csvbPickerBody")?.addEventListener("change", e => {
      const cb = e.target.closest("input[data-qid]");
      if (!cb) return;
      if (cb.checked) selectedIds.add(cb.dataset.qid); else selectedIds.delete(cb.dataset.qid);
      updateMeta();
    });
  }

  async function boot() {
    injectStyle();
    ensurePanel();
    if (!window.AUTH?.ensureSupabase) throw new Error("AUTH helper is not available.");
    sb = window.AUTH.ensureSupabase();
    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    if (sessionError) throw sessionError;
    session = sessionData?.session || null;
    if (!session?.user) throw new Error("You are not logged in.");
    const { data: prof, error: profError } = await sb.from("profiles").select("id,role,company_id").eq("id", session.user.id).single();
    if (profError) throw profError;
    profile = prof;
    const { data: qs, error: qsError } = await sb.from("assurance_question_sets").select("id,company_id,question_set_name").eq("id", qsId()).single();
    if (qsError) throw qsError;
    questionSet = qs;
    if (!canManage()) {
      $("csvbSourcePickerPanel").style.display = "none";
      return;
    }
    await loadExistingKeys();
  }

  async function loadExistingKeys() {
    existingKeys = new Set();
    if (!questionSet?.id) return;
    const { data, error } = await sb.from("assurance_question_set_items").select("source_library,source_question_no").eq("question_set_id", questionSet.id);
    if (error) throw error;
    for (const row of data || []) existingKeys.add(existingKey(row.source_library, row.source_question_no));
  }

  async function loadSourceRows() {
    showWarn(""); showOk("");
    selectedIds.clear();
    await loadExistingKeys();
    const selectedSource = $("csvbPickerSource").value;
    $("csvbPickerMeta").textContent = `Loading ${sourceLabel(selectedSource)} questions...`;
    const { data, error } = await sb.rpc("csvb_questions_master_for_me");
    if (error) throw error;
    sourceRows = (data || [])
      .filter(row => sourceMatches(row, selectedSource))
      .filter(row => {
        const status = s(row.status).trim().toLowerCase();
        return !status || status === "active";
      })
      .sort((a,b) => qno(a).localeCompare(qno(b), undefined, { numeric:true }));
    renderPicker();
  }

  function filteredRows() {
    const term = s($("csvbPickerSearch")?.value).trim().toLowerCase();
    const ch = s($("csvbPickerChapter")?.value).trim().replace(/^0+/, "");
    return sourceRows.filter(row => {
      const p = row.payload || {};
      const no = qno(row);
      if (ch && chapter(row) !== ch) return false;
      if (!term) return true;
      const hay = [no, pget(p,["short_text","Short Text","shortText"]), pget(p,["question","Question"]), pget(p,["inspection_guidance","Inspection Guidance","guidance"])].join(" ").toLowerCase();
      return hay.includes(term);
    });
  }

  function renderPicker() {
    const body = $("csvbPickerBody");
    if (!body) return;
    visibleRows = filteredRows();
    if (!sourceRows.length) {
      body.innerHTML = `<tr><td colspan="5">No source questions loaded.</td></tr>`;
      updateMeta();
      return;
    }
    if (!visibleRows.length) {
      body.innerHTML = `<tr><td colspan="5">No matching questions.</td></tr>`;
      updateMeta();
      return;
    }
    const selectedSource = $("csvbPickerSource").value;
    body.innerHTML = visibleRows.map(row => {
      const id = s(row.id || qno(row));
      const no = qno(row);
      const p = row.payload || {};
      const shortText = pget(p,["short_text","Short Text","shortText"]);
      const question = pget(p,["question","Question"]);
      const isDup = existingKeys.has(existingKey(selectedSource, no));
      const checked = selectedIds.has(id) && !isDup;
      return `<tr class="${isDup ? "csvb-picker-dup" : ""}"><td><input class="csvb-picker-check" type="checkbox" data-qid="${esc(id)}" ${checked ? "checked" : ""} ${isDup ? "disabled" : ""} /></td><td class="mono">${esc(no)}</td><td>${esc(chapter(row)||"-")}</td><td><div>${esc(shortText || question || "-")}</div>${question && question !== shortText ? `<div class="csvb-picker-small">${esc(question)}</div>` : ""}</td><td>${isDup ? "Already added" : "Available"}</td></tr>`;
    }).join("");
    updateMeta();
  }

  function updateMeta() {
    const meta = $("csvbPickerMeta");
    if (!meta) return;
    const dupCount = visibleRows.filter(row => existingKeys.has(existingKey($("csvbPickerSource")?.value, qno(row)))).length;
    meta.textContent = `${visibleRows.length} visible / ${sourceRows.length} loaded. ${selectedIds.size} selected. ${dupCount} already in this set.`;
  }

  function selectVisible() {
    const selectedSource = $("csvbPickerSource").value;
    for (const row of visibleRows) {
      const no = qno(row);
      if (!existingKeys.has(existingKey(selectedSource, no))) selectedIds.add(s(row.id || no));
    }
    renderPicker();
  }

  async function addSelected() {
    showWarn(""); showOk("");
    if (!canManage()) throw new Error("You do not have permission to add source questions.");
    const selectedSource = $("csvbPickerSource").value;
    const selected = sourceRows.filter(row => selectedIds.has(s(row.id || qno(row))));
    if (!selected.length) throw new Error("No source questions selected.");
    await loadExistingKeys();
    const { data: existingItems, error: itemError } = await sb.from("assurance_question_set_items").select("item_no,order_index").eq("question_set_id", questionSet.id);
    if (itemError) throw itemError;
    let nextNo = (existingItems || []).reduce((m,r) => Math.max(m, Number(r.item_no || 0)), 0) + 1;
    let nextOrder = (existingItems || []).reduce((m,r) => Math.max(m, Number(r.order_index || 0)), 0) + 100;
    const payloads = [];
    for (const row of selected) {
      const no = qno(row);
      const key = existingKey(selectedSource, no);
      if (existingKeys.has(key)) continue;
      const p = row.payload || {};
      payloads.push({
        company_id: questionSet.company_id,
        question_set_id: questionSet.id,
        item_no: nextNo++,
        order_index: nextOrder,
        source_library: selectedSource,
        source_question_id: row.id || null,
        source_question_no: no,
        chapter: chapter(row) || null,
        section: pget(p,["section","Section"]) || null,
        short_text: pget(p,["short_text","Short Text","shortText"]) || null,
        custom_question_text: pget(p,["question","Question"]) || null,
        expected_evidence: pget(p,["expected_evidence","Expected Evidence","ExpEv_Bullets"]) || null,
        inspector_guidance: pget(p,["inspection_guidance","Inspection Guidance","guidance"]) || null,
        criticality: "normal",
        is_required: true,
        answer_required: true,
        finding_allowed: true,
        is_active: true,
        created_by: session.user.id,
        updated_by: session.user.id,
        metadata: { created_from:"source_picker", build:BUILD }
      });
      nextOrder += 100;
    }
    if (!payloads.length) throw new Error("Selected questions are already in this question set.");
    const { error } = await sb.from("assurance_question_set_items").insert(payloads);
    if (error) throw error;
    showOk(`${payloads.length} source question(s) added. Reloading...`);
    window.setTimeout(() => location.reload(), 700);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => boot().catch(e => showWarn(e.message || String(e))), { once:true });
  else boot().catch(e => showWarn(e.message || String(e)));
})();
