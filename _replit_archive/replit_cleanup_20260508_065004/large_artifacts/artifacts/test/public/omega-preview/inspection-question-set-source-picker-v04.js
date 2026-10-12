// public/inspection-question-set-source-picker-v04.js
// C.S.V. BEACON - Assurance Question Set Source Picker v04
// Question text remains visible; supporting source details are collapsed by default.
// New items store source payload in metadata for preview / inspection execution details.

(() => {
  "use strict";

  const BUILD = "ASSURANCE-QS-SOURCE-PICKER-V04-20260602";
  const MANAGE_ROLES = new Set(["super_admin", "company_admin"]);
  const SOURCE_MAP = {
    SIRE_2_0: new Set(["SIRE", "SIRE_2_0", "SIRE 2.0"]),
    RISQ_3: new Set(["RISQ", "RISQ_3", "RISQ 3", "RISQ_3_2", "RIGHTSHIP"])
  };

  let sb = null;
  let session = null;
  let profile = null;
  let questionSet = null;
  let allRows = [];
  let sourceRows = [];
  let visibleRows = [];
  let existingKeys = new Set();
  let selectedKeys = new Set();

  const $ = (id) => document.getElementById(id);
  const s = (v) => v === null || v === undefined ? "" : String(v);
  const esc = (v) => s(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const qsId = () => new URLSearchParams(location.search || "").get("id") || "";
  const canManage = () => MANAGE_ROLES.has(s(profile?.role));
  const pget = (p, keys) => { for (const k of keys) { const v = p?.[k]; const out = textify(v).trim(); if (out) return out; } return ""; };

  function textify(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(textify).filter(Boolean).join("\n");
    if (typeof value === "object") {
      try { return JSON.stringify(value, null, 2); } catch { return String(value); }
    }
    return String(value);
  }
  function numberBase(row) {
    const raw = s(row?.number_base || row?.number_full || "").replace(/-$/, "").trim();
    return raw || s(row?.payload?.number || row?.payload?.QuestionNo || row?.payload?.printed_question_no || "").trim();
  }
  function qno(row) {
    const base = numberBase(row);
    const suffix = s(row?.number_suffix).trim();
    return suffix ? `${base}-${suffix}` : base;
  }
  function chapter(row) {
    const fromPayload = s(row?.payload?.chapter || row?.payload?.section_number || "").trim().replace(/^0+/, "");
    if (fromPayload) return fromPayload;
    const m = qno(row).match(/^(\d+)\./);
    return m ? String(Number(m[1])) : "";
  }
  function sourceForRow(row) {
    const raw = s(row?.source_type || row?.source || "").trim().toUpperCase();
    for (const [key, set] of Object.entries(SOURCE_MAP)) {
      if (Array.from(set).some(x => raw === s(x).trim().toUpperCase())) return key;
    }
    return raw || "UNKNOWN";
  }
  function sourceLabel(value) {
    return value === "RISQ_3" ? "RISQ 3" : value === "SIRE_2_0" ? "SIRE 2.0" : value === "COMPANY_SPECIFIC" ? "Company" : value;
  }
  function detectedQuestionType(row) {
    const p = row.payload || {};
    return pget(p, ["question_type", "Question Type", "questionType", "type", "Type"]);
  }
  function criticalityForRow(row) {
    const source = sourceForRow(row);
    const qtype = detectedQuestionType(row).trim().toLowerCase();
    return source === "SIRE_2_0" && qtype === "core" ? "high" : "normal";
  }
  function sourceEnabled(source) {
    const cb = document.querySelector(`input[data-picker-source="${source}"]`);
    return !!cb?.checked;
  }
  function selectedSources() {
    return Object.keys(SOURCE_MAP).filter(sourceEnabled);
  }
  function rowKey(row) {
    return `${sourceForRow(row)}::${qno(row).trim().toUpperCase()}`;
  }
  function existingKey(source, no) {
    return `${source}::${s(no).trim().toUpperCase()}`;
  }
  function detailField(label, value) {
    const out = textify(value).trim();
    if (!out) return "";
    return `<div class="csvb-picker-detail-field"><div class="csvb-picker-detail-label">${esc(label)}</div><div class="csvb-picker-detail-value">${esc(out)}</div></div>`;
  }
  function sourceDetails(row) {
    const p = row.payload || {};
    const fields = [
      detailField("Source", sourceLabel(sourceForRow(row))),
      detailField("Question No.", qno(row)),
      detailField("Chapter", chapter(row)),
      detailField("Section", pget(p,["section","Section","section_title","section_code"])),
      detailField("Expected evidence", pget(p,["expected_evidence","Expected Evidence","ExpEv_Bullets","esms_references","esms_forms"])),
      detailField("Inspector guidance", pget(p,["inspection_guidance","Inspection Guidance","guidance","guide_to_inspection"])),
      detailField("Question type / origin", pget(p,["question_type","Question Type","questionType","type","Type","question_origin"])),
      detailField("Answer type / options", [pget(p,["answer_type"]), pget(p,["answer_options"])].filter(Boolean).join("\n")),
      detailField("References", [pget(p,["esms_references"]), pget(p,["esms_forms"]), pget(p,["remarks"])].filter(Boolean).join("\n"))
    ].filter(Boolean).join("");
    return `<details class="csvb-picker-more"><summary>More question information</summary><div class="csvb-picker-more-body"><div class="csvb-picker-detail-grid">${fields || detailField("Information", "No additional stored details.")}</div></div></details>`;
  }

  function showWarn(message) { const n = $("warnBox"); if (!n) return; n.textContent = message || ""; n.style.display = message ? "block" : "none"; }
  function showOk(message) { const n = $("okBox"); if (!n) return; n.textContent = message || ""; n.style.display = message ? "block" : "none"; }

  function injectStyle() {
    if ($("csvbSourcePickerV04Style")) return;
    const style = document.createElement("style");
    style.id = "csvbSourcePickerV04Style";
    style.textContent = `
      #csvbSourcePickerPanel{margin-top:0}.csvb-picker-controls{display:grid;grid-template-columns:260px 1fr 120px auto auto auto;gap:7px;align-items:end;margin:8px 0}.csvb-source-checks{display:flex;gap:10px;flex-wrap:wrap;border:1px solid #cbd7ee;border-radius:9px;min-height:36px;align-items:center;padding:5px 9px;background:#fff}.csvb-source-checks label{display:inline-flex;gap:6px;align-items:center;margin:0;font-weight:450}.csvb-source-checks input{width:auto!important;min-height:auto!important}.csvb-picker-controls label{font-size:.82rem;font-weight:600;margin:0 0 4px;color:#1a4170}.csvb-picker-controls input{width:100%;box-sizing:border-box;border:1px solid #cbd7ee;border-radius:9px;padding:7px 9px;background:#fff;color:#1a4170;font-size:.9rem;min-height:36px}.csvb-picker-meta{font-size:.82rem;color:#48628e;margin:6px 0}.csvb-picker-table-wrap{max-height:470px;overflow:auto;border:1px solid #d5deef;border-radius:10px;background:#fff}.csvb-picker-table{width:100%;border-collapse:collapse;min-width:1040px}.csvb-picker-table th,.csvb-picker-table td{padding:7px 8px;border-bottom:1px solid #e6eefb;vertical-align:top;font-size:.86rem}.csvb-picker-table th{background:#f2f7ff;color:#1a4170;font-weight:650;text-align:left;position:sticky;top:0;z-index:1}.csvb-picker-small{font-size:.82rem;color:#173a68;line-height:1.35;margin-top:3px}.csvb-picker-dup{opacity:.55;background:#f6f8fb}.csvb-picker-check{width:auto!important;min-height:auto!important}.csvb-picker-more{margin-top:6px;border:1px solid #d5deef;border-radius:10px;background:#f7fbff;overflow:hidden}.csvb-picker-more>summary{cursor:pointer;padding:6px 8px;font-weight:650;color:#06305c}.csvb-picker-more-body{border-top:1px solid #d5deef;padding:8px;background:#fff}.csvb-picker-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.csvb-picker-detail-field{border:1px solid #e1eaf7;border-radius:9px;background:#fbfdff;padding:7px}.csvb-picker-detail-label{font-size:.76rem;font-weight:700;color:#48628e;margin-bottom:3px}.csvb-picker-detail-value{font-size:.84rem;color:#173a68;line-height:1.35;white-space:pre-wrap} @media(max-width:1200px){.csvb-picker-controls{grid-template-columns:1fr 1fr}.csvb-picker-controls .wide{grid-column:1/-1}}@media(max-width:900px){.csvb-picker-detail-grid{grid-template-columns:1fr}}@media(max-width:620px){.csvb-picker-controls{grid-template-columns:1fr}.csvb-picker-table{min-width:900px}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if ($("csvbSourcePickerPanel")) return;
    const previewCard = $("previewCard") || $("itemsBody")?.closest(".card");
    if (!previewCard) return;
    const panel = document.createElement("section");
    panel.id = "csvbSourcePickerPanel";
    panel.className = "card";
    panel.innerHTML = `
      <h2>Choose Questions from Source Library</h2>
      <div class="note">Question text is visible. Supporting details are collapsed under each question.</div>
      <div class="csvb-picker-controls">
        <div><label>Sources visible</label><div class="csvb-source-checks"><label><input type="checkbox" data-picker-source="SIRE_2_0" checked /> SIRE 2.0</label><label><input type="checkbox" data-picker-source="RISQ_3" checked /> RISQ 3</label></div></div>
        <div class="wide"><label for="csvbPickerSearch">Search</label><input id="csvbPickerSearch" placeholder="Search question no / short text / question text..." /></div>
        <div><label for="csvbPickerChapter">Chapter</label><input id="csvbPickerChapter" placeholder="e.g. 5" /></div>
        <button class="btn secondary" id="csvbPickerLoadBtn" type="button">Load</button><button class="btn secondary" id="csvbPickerSelectVisibleBtn" type="button">Select Visible</button><button class="btn" id="csvbPickerAddBtn" type="button">Save Selected to Question Set</button>
      </div>
      <div class="csvb-picker-meta" id="csvbPickerMeta">Not loaded.</div>
      <div class="csvb-picker-table-wrap"><table class="csvb-picker-table"><thead><tr><th style="width:46px;"><input id="csvbPickerAll" class="csvb-picker-check" type="checkbox" /></th><th style="width:95px;">Source</th><th style="width:115px;">Question No.</th><th style="width:90px;">Chapter</th><th>Question</th><th style="width:110px;">Status</th></tr></thead><tbody id="csvbPickerBody"><tr><td colspan="6">Load source questions.</td></tr></tbody></table></div>`;
    previewCard.parentNode.insertBefore(panel, previewCard);
    $("csvbPickerLoadBtn")?.addEventListener("click", () => loadSourceRows().catch(e => showWarn(e.message || String(e))));
    $("csvbPickerSearch")?.addEventListener("input", renderPicker); $("csvbPickerChapter")?.addEventListener("input", renderPicker);
    document.querySelectorAll("input[data-picker-source]").forEach(cb => cb.addEventListener("change", renderPicker));
    $("csvbPickerSelectVisibleBtn")?.addEventListener("click", selectVisible);
    $("csvbPickerAddBtn")?.addEventListener("click", () => addSelected().catch(e => showWarn(e.message || String(e))));
    $("csvbPickerAll")?.addEventListener("change", e => { if (e.target.checked) selectVisible(); else { selectedKeys.clear(); renderPicker(); } });
    $("csvbPickerBody")?.addEventListener("change", e => { const cb = e.target.closest("input[data-row-key]"); if (!cb) return; if (cb.checked) selectedKeys.add(cb.dataset.rowKey); else selectedKeys.delete(cb.dataset.rowKey); updateMeta(); });
  }

  async function boot() {
    injectStyle(); ensurePanel();
    if (!window.AUTH?.ensureSupabase) throw new Error("AUTH helper is not available.");
    sb = window.AUTH.ensureSupabase();
    const { data: sessionData, error: sessionError } = await sb.auth.getSession(); if (sessionError) throw sessionError;
    session = sessionData?.session || null; if (!session?.user) throw new Error("You are not logged in.");
    const { data: prof, error: profError } = await sb.from("profiles").select("id,role,company_id").eq("id", session.user.id).single(); if (profError) throw profError; profile = prof;
    const { data: qs, error: qsError } = await sb.from("assurance_question_sets").select("id,company_id,question_set_name").eq("id", qsId()).single(); if (qsError) throw qsError; questionSet = qs;
    if (!canManage()) { $("csvbSourcePickerPanel").style.display = "none"; return; }
    await loadExistingKeys();
  }

  async function loadExistingKeys() {
    existingKeys = new Set(); if (!questionSet?.id) return;
    const { data, error } = await sb.from("assurance_question_set_items").select("source_library,source_question_no").eq("question_set_id", questionSet.id); if (error) throw error;
    for (const row of data || []) existingKeys.add(existingKey(row.source_library, row.source_question_no));
  }

  async function loadQuestionRowsFromRpc() {
    const { data, error } = await sb.rpc("csvb_assurance_source_questions_for_me", { p_include_sire: true, p_include_risq: true });
    if (!error) return data || [];
    const msg = String(error.message || error).toLowerCase();
    if (!msg.includes("csvb_assurance_source_questions_for_me") && !msg.includes("could not find") && !msg.includes("schema cache")) throw error;
    const fallback = await sb.rpc("csvb_questions_master_for_me"); if (fallback.error) throw fallback.error;
    showWarn("RISQ source RPC is not installed yet. Showing SIRE 2.0 rows only until the Supabase RPC is created.");
    return fallback.data || [];
  }
  async function loadSourceRows() {
    showWarn(""); showOk(""); selectedKeys.clear(); await loadExistingKeys(); $("csvbPickerMeta").textContent = "Loading source questions...";
    allRows = (await loadQuestionRowsFromRpc()).filter(row => Object.keys(SOURCE_MAP).includes(sourceForRow(row))).filter(row => { const status = s(row.status).trim().toLowerCase(); return !status || status === "active"; }).sort((a,b) => sourceForRow(a).localeCompare(sourceForRow(b)) || qno(a).localeCompare(qno(b), undefined, { numeric:true })); renderPicker();
  }
  function filteredRows() {
    const sources = selectedSources(); const term = s($("csvbPickerSearch")?.value).trim().toLowerCase(); const ch = s($("csvbPickerChapter")?.value).trim().replace(/^0+/, ""); sourceRows = allRows.filter(row => sources.includes(sourceForRow(row)));
    return sourceRows.filter(row => { const p = row.payload || {}; const no = qno(row); if (ch && chapter(row) !== ch) return false; if (!term) return true; const hay = [sourceLabel(sourceForRow(row)), no, pget(p,["short_text","Short Text","shortText","inspection_marker"]), pget(p,["question","Question","question_text"]), pget(p,["inspection_guidance","Inspection Guidance","guidance"]), pget(p,["guide_to_inspection"]), pget(p,["inspection_marker"])].join(" ").toLowerCase(); return hay.includes(term); });
  }
  function renderPicker() {
    const body = $("csvbPickerBody"); if (!body) return; visibleRows = filteredRows();
    if (!allRows.length) { body.innerHTML = `<tr><td colspan="6">No source questions loaded.</td></tr>`; updateMeta(); return; }
    if (!visibleRows.length) { body.innerHTML = `<tr><td colspan="6">No matching questions.</td></tr>`; updateMeta(); return; }
    body.innerHTML = visibleRows.map(row => { const key = rowKey(row); const source = sourceForRow(row); const no = qno(row); const p = row.payload || {}; const shortText = pget(p,["short_text","Short Text","shortText","inspection_marker"]); const question = pget(p,["question","Question","question_text"]); const isDup = existingKeys.has(existingKey(source, no)); const checked = selectedKeys.has(key) && !isDup; return `<tr class="${isDup ? "csvb-picker-dup" : ""}"><td><input class="csvb-picker-check" type="checkbox" data-row-key="${esc(key)}" ${checked ? "checked" : ""} ${isDup ? "disabled" : ""} /></td><td>${esc(sourceLabel(source))}</td><td class="mono">${esc(no)}</td><td>${esc(chapter(row)||"-")}</td><td><div>${esc(shortText || question || "-")}</div>${question && question !== shortText ? `<div class="csvb-picker-small">${esc(question)}</div>` : ""}${sourceDetails(row)}</td><td>${isDup ? "Already added" : "Available"}</td></tr>`; }).join(""); updateMeta();
  }
  function updateMeta() { const meta = $("csvbPickerMeta"); if (!meta) return; const dupCount = visibleRows.filter(row => existingKeys.has(existingKey(sourceForRow(row), qno(row)))).length; const counts = Object.keys(SOURCE_MAP).map(src => `${sourceLabel(src)}: ${allRows.filter(row => sourceForRow(row) === src).length}`).join(" · "); meta.textContent = `${visibleRows.length} visible / ${sourceRows.length} source-filtered / ${allRows.length} loaded. ${counts}. ${selectedKeys.size} selected. ${dupCount} already in this set.`; }
  function selectVisible() { for (const row of visibleRows) { const source = sourceForRow(row); const no = qno(row); if (!existingKeys.has(existingKey(source, no))) selectedKeys.add(rowKey(row)); } renderPicker(); }
  async function addSelected() {
    showWarn(""); showOk(""); if (!canManage()) throw new Error("You do not have permission to add source questions."); const selected = allRows.filter(row => selectedKeys.has(rowKey(row))); if (!selected.length) throw new Error("No source questions selected."); await loadExistingKeys();
    const { data: existingItems, error: itemError } = await sb.from("assurance_question_set_items").select("item_no,order_index").eq("question_set_id", questionSet.id); if (itemError) throw itemError;
    let nextNo = (existingItems || []).reduce((m,r) => Math.max(m, Number(r.item_no || 0)), 0) + 1; let nextOrder = (existingItems || []).reduce((m,r) => Math.max(m, Number(r.order_index || 0)), 0) + 100; const payloads = [];
    for (const row of selected) { const source = sourceForRow(row); const no = qno(row); const key = existingKey(source, no); if (existingKeys.has(key)) continue; const p = row.payload || {}; payloads.push({ company_id: questionSet.company_id, question_set_id: questionSet.id, item_no: nextNo++, order_index: nextOrder, source_library: source, source_question_id: row.id || null, source_question_no: no, chapter: chapter(row) || null, section: pget(p,["section","Section","section_title","section_code"]) || null, short_text: pget(p,["short_text","Short Text","shortText","inspection_marker"]) || null, custom_question_text: pget(p,["question","Question","question_text"]) || null, expected_evidence: pget(p,["expected_evidence","Expected Evidence","ExpEv_Bullets"]) || null, inspector_guidance: pget(p,["inspection_guidance","Inspection Guidance","guidance","guide_to_inspection"]) || null, criticality: criticalityForRow(row), is_required: true, answer_required: true, finding_allowed: true, is_active: true, created_by: session.user.id, updated_by: session.user.id, metadata: { created_from:"source_picker_v04", build:BUILD, source_payload:p, source_row:{id:row.id||null,source_type:row.source_type||null,number_base:row.number_base||null,number_full:row.number_full||null,version:row.version||null} } }); nextOrder += 100; }
    if (!payloads.length) throw new Error("Selected questions are already in this question set."); const { error } = await sb.from("assurance_question_set_items").insert(payloads); if (error) throw error; showOk(`${payloads.length} source question(s) saved to question set. Reloading...`); window.setTimeout(() => location.reload(), 700);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => boot().catch(e => showWarn(e.message || String(e))), { once:true }); else boot().catch(e => showWarn(e.message || String(e)));
})();
