// public/tmsa-element-v01.js
// C.S.V. BEACON - TMSA Element / KPI Workspace v04B

const BUILD = "tmsa_element_workspace_esms_reference_picker_search_v04f_b4_20260615";
const sb = window.AUTH.ensureSupabase();
const COMPANY_KEY = "csvb_tmsa_element_workspace_selected_company_id";

let PROFILE = null;
let COMPANIES = [];
let ROWS = [];
let ELEMENTS = [];
let IMPORT_STATUS_ROWS = [];
let SUPPORT_BY_KPI = new Map();
let TITLE_BY_KPI = new Map();
let NARRATIVE_BY_KPI = new Map();
let POLICY_NODES = [];
let ELEMENT_TARGET = null;
let ELEMENT_CODE = new URLSearchParams(location.search).get("element_code") || "1";

function el(id){return document.getElementById(id)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function showWarn(msg){const n=el("warnBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function showOk(msg){const n=el("okBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function clearMessages(){showWarn("");showOk("")}
function isPlatformRole(role){return role==="super_admin" || role==="platform_owner"}
function label(v){return String(v||"-").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function date(v){return v?String(v).slice(0,10):""}
function nval(card,name){const node=card.querySelector(`[data-field="${name}"]`); return node?.value ?? ""}
function bval(card,name){const node=card.querySelector(`[data-field="${name}"]`); return !!node?.checked}
function numOrNull(v){return String(v??"").trim()===""?null:Number(v)}
function arr(v){return Array.isArray(v)?v:[]}

function companyId(){
  const n=el("companyFilter");
  if(n && n.style.display!=="none" && n.value) return n.value;
  return null;
}

function pill(text, cls=""){
  return `<span class="pill ${cls}">${esc(text)}</span>`;
}

function readinessClass(v){
  if(v==="ready" || v==="oil_major_ready" || v==="verified")return "green";
  if(v==="partly_ready" || v==="defined" || v==="requires_definition")return "amber";
  if(v==="not_ready" || v==="weak")return "red";
  return "";
}

function supportFor(kpiId){
  return SUPPORT_BY_KPI.get(String(kpiId)) || {
    departments: [],
    personnel: [],
    presenters: [],
    internal_notes: [],
    policy_links: [],
    matrix_meta: {},
    evidence_records: []
  };
}

async function setupCompanyFilter(){
  const n=el("companyFilter");

  if(!n || !PROFILE || !isPlatformRole(PROFILE.role)){
    if(n)n.style.display="none";
    return;
  }

  const {data,error}=await sb.rpc("csvb_admin_list_companies");
  if(error){
    showWarn("Could not load company selector: "+(error.message||String(error)));
    n.style.display="none";
    return;
  }

  COMPANIES=data||[];
  n.style.display="block";
  n.innerHTML=COMPANIES.map(c=>{
    const text=c.company_name||c.short_name||c.company_code||c.id;
    return `<option value="${esc(c.id)}">${esc(text)}</option>`;
  }).join("");

  const saved=localStorage.getItem(COMPANY_KEY)||"";
  if(saved && COMPANIES.some(c=>String(c.id)===String(saved))){
    n.value=saved;
  }else if(COMPANIES.length){
    n.value=COMPANIES[0].id;
    localStorage.setItem(COMPANY_KEY,n.value);
  }
}

async function loadElementList(){
  const {data,error}=await sb.rpc("csvb_tmsa_kpi_matrix_for_me",{
    p_element_code: null,
    p_search: null,
    p_company_id: companyId()
  });

  if(error)throw error;

  const seen=new Set();
  ELEMENTS=[];
  (data||[]).forEach(r=>{
    if(!seen.has(r.element_code)){
      seen.add(r.element_code);
      ELEMENTS.push({code:r.element_code,title:r.element_title});
    }
  });

  el("elementJump").innerHTML=ELEMENTS.map(x=>{
    return `<option value="${esc(x.code)}">${esc(x.code)} - ${esc(x.title)}</option>`;
  }).join("");

  el("elementJump").value=ELEMENT_CODE;
}

async function loadSupportForRows(rows){
  SUPPORT_BY_KPI = new Map();

  const cid = companyId();

  const calls = await Promise.all(rows.map(async r=>{
    const {data,error}=await sb.rpc("csvb_tmsa_kpi_support_for_me",{
      p_kpi_id: r.kpi_id,
      p_company_id: cid
    });

    if(error)throw error;

    const support=(data||[])[0]||{};
    SUPPORT_BY_KPI.set(String(r.kpi_id),{
      departments: arr(support.departments),
      personnel: arr(support.personnel),
      presenters: arr(support.presenters),
      internal_notes: arr(support.internal_notes),
      policy_links: arr(support.policy_links),
      matrix_meta: support.matrix_meta || {},
      evidence_records: arr(support.evidence_records)
    });

    return true;
  }));

  return calls.length;
}

async function loadWorkspace(){
  clearMessages();

  const cid = companyId();

  const workspaceResult = await sb.rpc("csvb_tmsa_element_workspace_for_me",{
    p_element_code: ELEMENT_CODE,
    p_company_id: cid
  });

  if(workspaceResult.error)throw workspaceResult.error;

  const statusResult = await sb.rpc("csvb_tmsa_element_import_status_for_me",{
    p_element_code: ELEMENT_CODE
  });

  if(statusResult.error)throw statusResult.error;

  const targetResult = await sb.rpc("csvb_tmsa_element_target_for_me",{
    p_element_code: ELEMENT_CODE,
    p_company_id: cid
  });

  if(targetResult.error)throw targetResult.error;

  const titlesResult = await sb.rpc("csvb_tmsa_kpi_titles_for_me",{
    p_element_code: ELEMENT_CODE,
    p_company_id: cid
  });

  if(titlesResult.error)throw titlesResult.error;

  const narrativesResult = await sb.rpc("csvb_tmsa_kpi_narratives_for_me",{
    p_element_code: ELEMENT_CODE,
    p_company_id: cid
  });

  if(narrativesResult.error)throw narrativesResult.error;

  const policyNodesResult = await sb.rpc("csvb_tmsa_policy_node_picker_for_me",{
    p_search: "",
    p_book_key: "main_policy",
    p_limit: 100
  });

  if(policyNodesResult.error)throw policyNodesResult.error;

  POLICY_NODES = policyNodesResult.data || [];

  ELEMENT_TARGET = (targetResult.data || [])[0] || null;

  IMPORT_STATUS_ROWS = statusResult.data || [];
  const byId = new Map(IMPORT_STATUS_ROWS.map(r=>[String(r.kpi_id),r]));

  TITLE_BY_KPI = new Map((titlesResult.data || []).map(r=>[String(r.kpi_id),r]));
  NARRATIVE_BY_KPI = new Map((narrativesResult.data || []).map(r=>[String(r.kpi_id),r]));

  ROWS=(workspaceResult.data||[]).map(r=>{
    const meta=byId.get(String(r.kpi_id)) || {};
    const titleMeta=TITLE_BY_KPI.get(String(r.kpi_id)) || {};
    const narrativeMeta=NARRATIVE_BY_KPI.get(String(r.kpi_id)) || {};
    return {...r,...meta,...titleMeta,...narrativeMeta};
  });

  await loadSupportForRows(ROWS);

  renderWorkspace();
  updateGlobalState();
}

function filteredRows(){
  const q=String(el("searchBox").value||"").trim().toLowerCase();
  if(!q)return ROWS;

  return ROWS.filter(r=>[
    r.kpi_code,
    r.kpi_statement,
    r.best_practice_guidance,
    r.original_kpi_statement,
    r.original_best_practice_guidance,
    r.company_kpi_statement,
    r.company_best_practice_guidance,
    r.effective_kpi_statement,
    r.effective_best_practice_guidance,
    r.company_response,
    r.audit_answer_summary,
    r.evidence_to_present,
    r.internal_remarks,
    r.calculation_method,
    r.calculation_notes,
    supportFor(r.kpi_id).matrix_meta?.kpi_short_title
  ].some(x=>String(x||"").toLowerCase().includes(q)));
}

function updateStats(rows=ROWS){
  const levels=new Set(rows.map(r=>r.kpi_level));
  const ready=rows.filter(r=>["ready","oil_major_ready"].includes(r.readiness_status)).length;
  const calc=rows.filter(r=>r.requires_calculation).length;
  const evidence=rows.reduce((sum,r)=>sum+Number(r.linked_evidence_count||0),0);

  el("statKpis").textContent=rows.length;
  el("statLevels").textContent=levels.size;
  el("statReady").textContent=ready;
  el("statCalc").textContent=calc;
  el("statEvidence").textContent=evidence;
}

function ensureElementTargetPanel(){
  let panel=el("elementTargetPanel");
  const body=el("workspaceBody");
  if(panel || !body || !body.parentNode)return panel;

  panel=document.createElement("div");
  panel.id="elementTargetPanel";
  panel.className="elementTargetPanel";
  body.parentNode.insertBefore(panel, body);
  return panel;
}

function renderElementTargetPanel(){
  const panel=ensureElementTargetPanel();
  if(!panel)return;

  const level = ELEMENT_TARGET?.target_level || "";
  const note = ELEMENT_TARGET?.target_note || "";

  panel.innerHTML = `
    <div class="toolbar">
      <div class="left">
        <h3 style="margin:0;color:#06305c;">Element target level</h3>
        <span class="pill">${level ? "Target Level " + esc(level) : "No target level set"}</span>
      </div>
      <div class="right small">
        Target level applies to the whole TMSA element, not to individual KPIs.
      </div>
    </div>

    <div class="elementTargetRow" style="margin-top:8px;">
      <div>
        <label for="elementTargetLevel">Target level</label>
        <select id="elementTargetLevel">
          <option value="">-</option>
          <option value="1" ${String(level)==="1"?"selected":""}>Level 1</option>
          <option value="2" ${String(level)==="2"?"selected":""}>Level 2</option>
          <option value="3" ${String(level)==="3"?"selected":""}>Level 3</option>
          <option value="4" ${String(level)==="4"?"selected":""}>Level 4</option>
        </select>
      </div>

      <div style="flex:1;min-width:260px;">
        <label for="elementTargetNote">Target note</label>
        <input id="elementTargetNote" value="${esc(note)}" placeholder="Optional element-level target note" />
      </div>

      <button class="btn" id="saveElementTargetBtn" type="button">Save Element Target</button>
    </div>
  `;
}

async function saveElementTarget(){
  clearMessages();

  const levelRaw=el("elementTargetLevel")?.value || "";
  const note=el("elementTargetNote")?.value || null;

  const {error}=await sb.rpc("csvb_tmsa_save_element_target_level",{
    p_element_code: ELEMENT_CODE,
    p_company_id: companyId(),
    p_target_level: levelRaw ? Number(levelRaw) : null,
    p_target_note: note
  });

  if(error)throw error;

  showOk("Element target level saved.");
  await loadWorkspace();
}

function renderWorkspace(){
  const body=el("workspaceBody");

  if(!ROWS.length){
    el("elementTitle").textContent=`Element ${ELEMENT_CODE}`;
    el("elementCodePill").textContent=`Element ${ELEMENT_CODE}`;
    body.innerHTML=`No KPIs found for this TMSA element.`;
    updateStats([]);
    return;
  }

  const first=ROWS[0];
  el("elementTitle").textContent=`Element ${first.element_code} - ${first.element_title}`;
  el("elementCodePill").textContent=`Element ${first.element_code}`;
  renderElementTargetPanel();

  const rows=filteredRows();
  updateStats(rows);

  const guidancePendingRows = rows.filter(r=>r.guidance_pending);
  if(guidancePendingRows.length){
    showWarn(`Best Practice Guidance pending for ${guidancePendingRows.length} KPI(s): ${guidancePendingRows.map(r=>r.kpi_code).join(", ")}`);
  }else{
    showWarn("");
  }

  const levels=[...new Set(rows.map(r=>r.kpi_level))].sort((a,b)=>Number(a)-Number(b));

  body.innerHTML=levels.map((level,levelIdx)=>{
    const levelRows=rows.filter(r=>String(r.kpi_level)===String(level));
    return `<details class="levelBlock" ${levelIdx===0?"open":""}>
      <summary class="levelSummary">
        <span>Level / Stage ${esc(level)} · ${levelRows.length} KPI(s)</span>
        <span class="small">Click to expand / collapse</span>
      </summary>
      ${levelRows.map((r,idx)=>renderKpiCard(r,idx)).join("")}
    </details>`;
  }).join("");
}

function renderKpiCard(r, idx){
  const support=supportFor(r.kpi_id);
  const evidence=Array.isArray(r.linked_evidence)?r.linked_evidence:[];
  const textImported=!!r.has_exact_text || ["exact_text_imported","exact_kpi_text_imported_guidance_pending"].includes(r.import_status);

  const originalKpiText = r.original_kpi_statement || r.kpi_statement || "";
  const companyKpiText = r.company_kpi_statement || "";
  const effectiveKpiText = r.effective_kpi_statement || companyKpiText || originalKpiText || "";

  const originalGuidanceText = r.original_best_practice_guidance || r.best_practice_guidance || "";
  const companyGuidanceText = r.company_best_practice_guidance || "";
  const effectiveGuidanceText = r.effective_best_practice_guidance || companyGuidanceText || originalGuidanceText || "";

  const hasGuidance=!!r.has_guidance || String(effectiveGuidanceText||"").trim() !== "";
  const guidancePending=!!r.guidance_pending || (textImported && !hasGuidance);
  const sourceReference=String(r.exact_text_source_reference||"").trim();
  const sourceLabel=String(r.exact_text_source_label||"").trim();
  const importedAt=r.exact_text_imported_at
    ? String(r.exact_text_imported_at).slice(0,19).replace("T"," ")+" UTC"
    : "";

  const meta=support.matrix_meta||{};
  const shortTitle=meta.kpi_short_title || r.effective_short_title || r.default_short_title || "";
  const ownerDepartmentId=meta.owner_department_id || "";
  const selectedPresenterIds=new Set(arr(support.presenters).map(p=>String(p.profile_id)));

  return `<details class="kpiCard" data-kpi-card="${esc(r.kpi_id)}" ${idx===0?"open":""}>
    <summary class="kpiSummary">
      <span class="kpiSummaryLeft">
        <span>
          <span class="kpiTitle">${esc(r.kpi_code)} · Level ${esc(r.kpi_level)}</span>
          ${shortTitle?`<span class="kpiShortPill">${esc(shortTitle)}</span>`:""}
        </span>
        <span class="small">${esc(r.company_name || "")}</span>
      </span>
      <span>
        ${pill(label(r.coverage_status))}
        ${pill(label(r.input_method))}
        ${r.requires_calculation?pill("Calculation required","amber"):""}
        ${textImported?pill("Exact Text Imported","green"):pill(label(r.import_status),"amber")}
        ${guidancePending?pill("Guidance Pending","amber"):""}
      </span>
    </summary>

    <div class="sectionGrid" style="margin-top:8px;">
      ${renderNarrativeEditor(
        "kpi_statement",
        "KPI text",
        originalKpiText,
        companyKpiText,
        effectiveKpiText
      )}

      ${renderNarrativeEditor(
        "best_practice_guidance",
        "Best Practice Guidance",
        originalGuidanceText,
        companyGuidanceText,
        effectiveGuidanceText
      )}
    </div>

    ${textImported?`<div class="box" data-import-status-box style="margin-top:8px;">
      <h4>Import status / source</h4>
      <div class="small">
        <strong>Status:</strong> Exact Text Imported${guidancePending?" · Guidance Pending":""}<br>
        <strong>Source label:</strong> ${esc(sourceLabel||"-")}<br>
        <strong>Source reference:</strong> ${esc(sourceReference||"-")}<br>
        <strong>Imported at:</strong> ${esc(importedAt||"-")}
      </div>
    </div>`:""}

    <div class="formGrid" style="margin-top:8px;">
      <div>
        <label>KPI short title / name</label>
        <input data-field="kpi_short_title" value="${esc(shortTitle)}" placeholder="Short internal name for this KPI" />
      </div>
      <div>
        <label>Coverage status</label>
        <select data-field="coverage_status">${optionSet(["not_reviewed","not_covered","partly_covered","covered_weak_evidence","covered_acceptable_evidence","verified"],r.coverage_status)}</select>
      </div>
      <div>
        <label>Input / response method</label>
        <select data-field="input_method">${optionSet(["narrative","yes_no","level_claim","numeric_metric","percentage_metric","date_based","frequency_based","document_reference","evidence_checklist","action_plan","mixed"],r.input_method)}</select>
      </div>

      <div>
        <label>Claimed level</label>
        <select data-field="claimed_level">${levelOptions(r.claimed_level)}</select>
      </div>

      <div>
        <label>Owner department</label>
        <select data-field="owner_department_id">
          <option value="">-</option>
          ${departmentOptions(support.departments,ownerDepartmentId)}
        </select>
        <div class="miniRow" style="margin-top:5px;">
          <input data-field="new_department_name" placeholder="Add department..." />
          <button class="miniBtn" data-add-department="${esc(r.kpi_id)}" type="button">Add</button>
          <button class="miniBtn danger" data-remove-department="${esc(r.kpi_id)}" type="button">Delete selected</button>
        </div>
        <div class="small">Department deletion is guarded. It is blocked if assigned to any KPI.</div>
      </div>

      <div class="full">
        <label>Responsible presenter(s)</label>
        <div class="supportList">
          ${renderPresenterList(r.kpi_id,support.presenters)}
        </div>
        <div class="miniRow" style="margin-top:7px;">
          <select data-field="presenter_add_id">
            ${presenterAddOptions(support.personnel,selectedPresenterIds)}
          </select>
          <button class="miniBtn" data-add-presenter="${esc(r.kpi_id)}" type="button">Add presenter</button>
        </div>
        <div class="small">Choose a presenter from the dropdown, then add. Existing presenters can be removed.</div>
      </div>

      <div class="full">
        <label>Company answer / interpretation</label>
        <textarea data-field="company_response">${esc(r.company_response||"")}</textarea>
      </div>
    </div>

    <div class="supportGrid">
      ${renderPolicyBox(r,"esms_reference","eSMS reference(s)",support.policy_links)}
      ${renderPolicyBox(r,"esms_form","eSMS Form(s)",support.policy_links)}
    </div>

    <div class="supportGrid">
      ${renderRecordsBox(r,support.evidence_records)}
      ${renderInternalNotesBox(support.internal_notes)}
    </div>

    ${renderAdvancedFields(r)}

    <div class="actions" style="margin-top:8px;">
      <button class="btn" data-save-kpi="${esc(r.kpi_id)}" type="button">Save KPI Workspace</button>
      <a class="btn secondary" href="./tmsa-kpi-presentation.html?kpi_id=${encodeURIComponent(r.kpi_id)}">Open Audit Presentation</a>
      <a class="btn secondary" href="./tmsa-evidence.html">Open Records / Evidence Register</a>
    </div>
  </details>`;
}

function narrativeStatus(companyText){
  return String(companyText||"").trim()
    ? pill("Company edited","green")
    : pill("Using imported source");
}

function renderNarrativeEditor(kind,title,originalText,companyText,effectiveText){
  const field = kind === "kpi_statement"
    ? "company_kpi_statement"
    : "company_best_practice_guidance";

  const hasOriginal = String(originalText||"").trim() !== "";

  return `<div class="box">
    <h4>${esc(title)} <span class="small">(editable)</span></h4>

    <div class="narrativeMeta">
      ${narrativeStatus(companyText)}
      ${hasOriginal ? pill("Imported source preserved","green") : pill("No imported source","amber")}
    </div>

    <textarea
      class="narrativeTextarea"
      data-field="${esc(field)}"
      placeholder="Enter company working narrative..."
    >${esc(effectiveText || "")}</textarea>

    <div class="narrativeActions">
      <button class="miniBtn" data-save-narrative="${esc(kind)}" type="button">Save ${esc(title)}</button>
      <button class="miniBtn danger" data-reset-narrative="${esc(kind)}" type="button">Reset to imported text</button>
    </div>

    <details>
      <summary class="small" style="cursor:pointer;font-weight:750;margin-top:7px;">Show original imported text</summary>
      <div class="originalTextBox">${hasOriginal ? esc(originalText) : "No original imported text available."}</div>
    </details>
  </div>`;
}

function policyNodeLabel(n){
  return n.display_label || [n.node_code,n.node_title].filter(Boolean).join(" - ") || n.policy_node_id;
}

function filteredPolicyNodes(searchTerm=""){
  const q=String(searchTerm||"").trim().toLowerCase();
  if(!q)return POLICY_NODES;

  return POLICY_NODES.filter(n=>{
    const hay=[
      n.display_label,
      n.node_code,
      n.node_title,
      n.node_type
    ].filter(Boolean).join(" ").toLowerCase();

    return hay.includes(q);
  });
}

function policyNodeOptions(searchTerm=""){
  const nodes=filteredPolicyNodes(searchTerm);
  const firstLabel = nodes.length
    ? "Select Company Policy item..."
    : "No matching Company Policy item";

  return `<option value="">${esc(firstLabel)}</option>` + nodes.map(n=>{
    const label=policyNodeLabel(n);
    return `<option
      value="${esc(n.policy_node_id)}"
      data-code="${esc(n.node_code || "")}"
      data-label="${esc(label)}"
    >${esc(label)}</option>`;
  }).join("");
}

function renderPolicyBox(r,kind,title,links){
  const filtered=arr(links).filter(x=>x.link_kind===kind);

  const linkedHtml = filtered.length ? filtered.map(link=>`<div class="supportItem">
    <strong>${esc(link.display_label||"-")}</strong>
    ${link.reference_code?`<div class="small">Reference: ${esc(link.reference_code)}</div>`:""}
    ${link.link_note?`<div class="small">Note: ${esc(link.link_note)}</div>`:""}
    <div class="policyLinkedActions">
      ${link.policy_node_id?`<button class="miniBtn" data-open-policy-node="${esc(link.policy_node_id)}" type="button">Open</button>`:""}
      <button class="miniBtn danger" data-archive-policy-link="${esc(link.id)}" type="button">Remove</button>
    </div>
  </div>`).join("") : `<div class="small">No ${esc(title)} linked yet.</div>`;

  if(kind === "esms_reference"){
    return `<div class="box">
      <h4>${esc(title)}</h4>
      <div class="supportList">
        ${linkedHtml}
      </div>

      <div class="policySearchRow">
        <input
          data-field="esms_reference_policy_search"
          data-policy-picker-search
          placeholder="Filter Company Policy by code or title..."
        />
        <span class="policySearchMeta" data-policy-picker-count>${esc(String(POLICY_NODES.length))} policy items available.</span>
      </div>

      <div class="policyPickerRow">
        <select data-field="esms_reference_policy_node_id" data-policy-picker-select>
          ${policyNodeOptions()}
        </select>
        <button class="miniBtn" data-add-policy-link="${esc(kind)}" type="button">Add selected eSMS reference</button>
      </div>

      <div class="small">
        Select from Company Policy. Linked items open in company_policy.html using the policy node deep link.
      </div>
    </div>`;
  }

  const codeField=kind+"_code";
  const labelField=kind+"_label";

  return `<div class="box">
    <h4>${esc(title)}</h4>
    <div class="supportList">
      ${linkedHtml}
    </div>
    <div class="miniRow" style="margin-top:7px;">
      <input data-field="${esc(codeField)}" placeholder="Reference code" />
      <input data-field="${esc(labelField)}" placeholder="Display label" />
      <button class="miniBtn" data-add-policy-link="${esc(kind)}" type="button">Add</button>
    </div>
    <div class="small">Manual temporary link. eSMS document/form repository will be connected when usable form documents exist.</div>
  </div>`;
}

function renderRecordsBox(r,items){
  const list=arr(items);

  return `<div class="box">
    <h4>Records / uploaded evidence</h4>

    ${list.length?list.map(ev=>`<div class="evidenceItem">
      <strong>${esc(ev.evidence_title||"-")}</strong>
      ${ev.is_primary?pill("Primary","green"):""}
      ${ev.evidence_strength?pill(label(ev.evidence_strength),readinessClass(ev.evidence_strength)):""}
      <div class="small">Doc: ${esc(ev.document_reference||"-")} · eSMS: ${esc(ev.sms_reference||"-")}</div>
      ${ev.file_name?`<div class="small">File: ${esc(ev.file_name)} ${ev.file_type?`(${esc(ev.file_type)})`:""}</div>`:""}
      ${ev.storage_path?`<div class="small">Storage: ${esc(ev.storage_path)}</div>`:""}
      ${ev.link_note?`<div class="small">Link note: ${esc(ev.link_note)}</div>`:""}
      <div class="recordActions">
        ${ev.storage_path?`<button class="miniBtn" data-open-record="${esc(ev.storage_path)}" type="button">Open</button>`:""}
        ${ev.link_id?`<button class="miniBtn danger" data-unlink-record="${esc(ev.link_id)}" type="button">Remove link</button>`:""}
        ${ev.evidence_id?`<button class="miniBtn danger" data-deactivate-record="${esc(ev.evidence_id)}" type="button">Deactivate record</button>`:""}
      </div>
    </div>`).join(""):`<div class="small">No records linked yet.</div>`}

    <div class="uploadBox">
      <label>Upload evidence / record for this KPI</label>
      <input data-field="evidence_file" type="file" />
      <div class="miniRow" style="margin-top:6px;">
        <input data-field="evidence_title" placeholder="Evidence title; optional, defaults to file name" />
        <input data-field="evidence_doc_ref" placeholder="Document / record reference; optional" />
      </div>
      <div class="miniRow" style="margin-top:6px;">
        <select data-field="evidence_type">
          <option value="record">Record</option>
          <option value="report">Report</option>
          <option value="meeting_minutes">Meeting Minutes</option>
          <option value="training_record">Training Record</option>
          <option value="kpi_dashboard">KPI Dashboard</option>
          <option value="audit_report">Audit Report</option>
          <option value="inspection_report">Inspection Report</option>
          <option value="other">Other</option>
        </select>
        <label style="display:flex;gap:6px;align-items:center;margin:0;">
          <input data-field="evidence_primary" type="checkbox" style="width:auto;min-height:auto;" />
          Primary evidence
        </label>
        <button class="miniBtn" data-upload-evidence="${esc(r.kpi_id)}" type="button">Upload evidence</button>
      </div>
      <div class="small">File will be stored under this company / element / KPI path and linked automatically to this KPI.</div>
    </div>
  </div>`;
}

function renderInternalNotesBox(notes){
  return `<div class="box">
    <h4>Internal notes / remarks</h4>
    <div class="notesList">
      ${notes.length?notes.map(n=>`<div class="noteItem">
        <div class="text">${esc(n.note_text||"")}</div>
        <div class="small">${esc(n.created_by_username||"-")} · ${esc(String(n.created_at||"").slice(0,19).replace("T"," "))}</div>
        <button class="miniBtn danger" data-archive-note="${esc(n.id)}" type="button">Remove</button>
      </div>`).join(""):`<div class="small">No internal notes yet.</div>`}
    </div>
    <label>Add internal note</label>
    <textarea data-field="new_internal_note" placeholder="Add new note; it will be stored as a separate note when you save."></textarea>
  </div>`;
}

function renderAdvancedFields(r){
  const gapText=[r.gap_summary,r.action_required].filter(Boolean).join("\\n\\n");

  return `<details class="advancedFields">
    <summary>Advanced / Optional Fields</summary>

    <div class="formGrid" style="margin-top:8px;">
      <div>
        <label>Readiness status</label>
        <select data-field="readiness_status">${optionSet(["not_assessed","not_ready","partly_ready","ready","oil_major_ready"],r.readiness_status)}</select>
      </div>
      <div>
        <label>Evidence strength</label>
        <select data-field="evidence_strength">${optionSet(["no_evidence","weak","moderate","strong","oil_major_ready"],r.evidence_strength)}</select>
      </div>
      <div>
        <label>Oil Major sensitivity</label>
        <select data-field="oil_major_sensitivity">${optionSet(["low","medium","high","critical"],r.oil_major_sensitivity)}</select>
      </div>

      <div class="full">
        <label>Audit answer summary</label>
        <textarea data-field="audit_answer_summary">${esc(r.audit_answer_summary||"")}</textarea>
      </div>
      <div>
        <label>Evidence to present</label>
        <textarea data-field="evidence_to_present">${esc(r.evidence_to_present||"")}</textarea>
      </div>
      <div>
        <label>Weakness / risk to avoid</label>
        <textarea data-field="weakness_to_avoid">${esc(r.weakness_to_avoid||"")}</textarea>
      </div>
      <div>
        <label>Gap / action required</label>
        <textarea data-field="gap_action">${esc(gapText)}</textarea>
      </div>

      <div class="full">
        <div class="box">
          <h4>Monitoring / Calculation</h4>
          <label style="display:flex;gap:7px;align-items:center;margin:4px 0;">
            <input data-field="requires_calculation" type="checkbox" ${r.requires_calculation?"checked":""} style="width:auto;min-height:auto;" />
            This KPI requires a defined calculation / measurable monitoring method
          </label>

          <div class="formGrid">
            <div>
              <label>Calculation status</label>
              <select data-field="calculation_status">${optionSet(["not_assessed","not_required","requires_definition","defined","verified"],r.calculation_status)}</select>
            </div>
            <div>
              <label>Measurement unit</label>
              <input data-field="measurement_unit" value="${esc(r.measurement_unit||"")}" />
            </div>
            <div>
              <label>Measurement frequency</label>
              <input data-field="measurement_frequency" value="${esc(r.measurement_frequency||"")}" />
            </div>
            <div>
              <label>Metric direction</label>
              <select data-field="metric_direction">${optionSet(["not_applicable","higher_is_better","lower_is_better","range","exact"],r.metric_direction)}</select>
            </div>
            <div>
              <label>Target value</label>
              <input data-field="target_value" type="number" step="any" value="${esc(r.target_value??"")}" />
            </div>
            <div>
              <label>Actual value</label>
              <input data-field="actual_value" type="number" step="any" value="${esc(r.actual_value??"")}" />
            </div>
            <div>
              <label>Minimum acceptable</label>
              <input data-field="minimum_acceptable_value" type="number" step="any" value="${esc(r.minimum_acceptable_value??"")}" />
            </div>
            <div>
              <label>Maximum acceptable</label>
              <input data-field="maximum_acceptable_value" type="number" step="any" value="${esc(r.maximum_acceptable_value??"")}" />
            </div>
            <div>
              <label>Last measured</label>
              <input data-field="last_measured_at" type="date" value="${esc(date(r.last_measured_at))}" />
            </div>
            <div>
              <label>Next review due</label>
              <input data-field="next_review_due" type="date" value="${esc(date(r.next_review_due))}" />
            </div>
            <div class="full">
              <label>Monitoring method</label>
              <textarea data-field="monitoring_method">${esc(r.monitoring_method||"")}</textarea>
            </div>
            <div class="full">
              <label>Calculation method / formula</label>
              <textarea data-field="calculation_method">${esc(r.calculation_method||"")}</textarea>
            </div>
            <div class="full">
              <label>Calculation notes</label>
              <textarea data-field="calculation_notes">${esc(r.calculation_notes||"")}</textarea>
            </div>
          </div>
        </div>
      </div>
    </div>
  </details>`;
}

function departmentOptions(departments,current){
  return arr(departments).map(d=>{
    return `<option value="${esc(d.id)}" ${String(d.id)===String(current)?"selected":""}>${esc(d.department_name)}</option>`;
  }).join("");
}

function presenterAddOptions(personnel,selectedIds){
  return `<option value="">Select presenter...</option>` + arr(personnel)
    .filter(p=>!selectedIds.has(String(p.profile_id)))
    .map(p=>{
      const id=String(p.profile_id);
      return `<option value="${esc(id)}">${esc(p.display_label||p.username||id)}</option>`;
    }).join("");
}

function renderPresenterList(kpiId,presenters){
  const list=arr(presenters);
  if(!list.length){
    return `<div class="small">No responsible presenter selected yet.</div>`;
  }

  return list.map(p=>{
    return `<div class="supportItem">
      <strong>${esc(p.presenter_label||p.profile_id||"-")}</strong>
      <button class="miniBtn danger" data-remove-presenter="${esc(kpiId)}" data-profile-id="${esc(p.profile_id)}" type="button">Remove</button>
    </div>`;
  }).join("");
}

function optionSet(values,current){
  return values.map(v=>`<option value="${esc(v)}" ${String(v)===String(current)?"selected":""}>${esc(label(v))}</option>`).join("");
}

function levelOptions(current){
  return `<option value="">-</option>`+[1,2,3,4].map(v=>`<option value="${v}" ${Number(current)===v?"selected":""}>Level ${v}</option>`).join("");
}

function selectedPresenterIds(card){
  return arr(supportFor(card.dataset.kpiCard).presenters)
    .map(p=>String(p.profile_id))
    .filter(Boolean);
}

function selectedPresenterLabels(card){
  return arr(supportFor(card.dataset.kpiCard).presenters)
    .map(p=>p.presenter_label || p.profile_id)
    .filter(Boolean);
}

function policyLabels(card,kind){
  const links=arr(supportFor(card.dataset.kpiCard).policy_links).filter(x=>x.link_kind===kind);
  return links.map(x=>x.display_label || x.reference_code).filter(Boolean);
}

function ownerDepartmentLabel(card){
  const sel=card.querySelector('[data-field="owner_department_id"]');
  return sel?.selectedOptions?.[0]?.textContent?.trim() || "";
}

async function saveKpi(kpiId){
  clearMessages();

  const card=document.querySelector(`[data-kpi-card="${CSS.escape(kpiId)}"]`);
  if(!card)throw new Error("KPI card not found.");

  const gapAction=nval(card,"gap_action").split(/\n\s*\n/);
  const presenters=selectedPresenterIds(card);
  const presenterLabels=selectedPresenterLabels(card);

  const payload={
    p_kpi_id: kpiId,
    p_company_id: companyId(),
    p_coverage_status: nval(card,"coverage_status"),
    p_claimed_level: nval(card,"claimed_level")?Number(nval(card,"claimed_level")):null,
    p_target_level: null,
    p_input_method: nval(card,"input_method"),
    p_readiness_status: nval(card,"readiness_status"),
    p_company_response: nval(card,"company_response") || null,
    p_sms_reference: policyLabels(card,"esms_reference").join("; ") || null,
    p_forms_records: policyLabels(card,"esms_form").join("; ") || null,
    p_owner_department: ownerDepartmentLabel(card) || null,
    p_evidence_strength: nval(card,"evidence_strength"),
    p_oil_major_sensitivity: nval(card,"oil_major_sensitivity"),
    p_audit_answer_summary: nval(card,"audit_answer_summary") || null,
    p_evidence_to_present: nval(card,"evidence_to_present") || null,
    p_weakness_to_avoid: nval(card,"weakness_to_avoid") || null,
    p_responsible_presenter: presenterLabels.join("; ") || null,
    p_gap_summary: gapAction[0] || null,
    p_action_required: gapAction.slice(1).join("\n\n") || null,
    p_internal_remarks: null,
    p_measurement_unit: nval(card,"measurement_unit") || null,
    p_measurement_frequency: nval(card,"measurement_frequency") || null,
    p_metric_direction: nval(card,"metric_direction"),
    p_target_value: numOrNull(nval(card,"target_value")),
    p_actual_value: numOrNull(nval(card,"actual_value")),
    p_minimum_acceptable_value: numOrNull(nval(card,"minimum_acceptable_value")),
    p_maximum_acceptable_value: numOrNull(nval(card,"maximum_acceptable_value")),
    p_green_threshold: null,
    p_amber_threshold: null,
    p_red_threshold: null,
    p_last_measured_at: nval(card,"last_measured_at") || null,
    p_next_review_due: nval(card,"next_review_due") || null,
    p_requires_calculation: bval(card,"requires_calculation"),
    p_calculation_status: nval(card,"calculation_status"),
    p_monitoring_method: nval(card,"monitoring_method") || null,
    p_calculation_method: nval(card,"calculation_method") || null,
    p_calculation_notes: nval(card,"calculation_notes") || null
  };

  const {error}=await sb.rpc("csvb_tmsa_save_kpi_workspace",payload);
  if(error)throw error;

  const meta=await sb.rpc("csvb_tmsa_save_kpi_workspace_meta_v04",{
    p_kpi_id: kpiId,
    p_company_id: companyId(),
    p_kpi_short_title: nval(card,"kpi_short_title") || null,
    p_owner_department_id: nval(card,"owner_department_id") || null
  });
  if(meta.error)throw meta.error;

  const presenterSave=await sb.rpc("csvb_tmsa_save_kpi_presenters",{
    p_kpi_id: kpiId,
    p_company_id: companyId(),
    p_presenter_ids: presenters
  });
  if(presenterSave.error)throw presenterSave.error;

  const noteText=nval(card,"new_internal_note").trim();
  if(noteText){
    const noteResult=await sb.rpc("csvb_tmsa_add_kpi_internal_note",{
      p_kpi_id: kpiId,
      p_company_id: companyId(),
      p_note_text: noteText,
      p_note_type: "general"
    });
    if(noteResult.error)throw noteResult.error;
  }

  showOk("KPI workspace saved.");
  await loadWorkspace();
}

async function addDepartment(kpiId){
  clearMessages();

  const card=document.querySelector(`[data-kpi-card="${CSS.escape(kpiId)}"]`);
  if(!card)throw new Error("KPI card not found.");

  const name=nval(card,"new_department_name").trim();
  if(!name)throw new Error("Department name is required.");

  const {error}=await sb.rpc("csvb_tmsa_create_department",{
    p_company_id: companyId(),
    p_department_name: name
  });

  if(error)throw error;

  showOk("Department added.");
  await loadWorkspace();
}

async function removeDepartment(kpiId){
  clearMessages();

  const card=document.querySelector(`[data-kpi-card="${CSS.escape(kpiId)}"]`);
  if(!card)throw new Error("KPI card not found.");

  const departmentId=nval(card,"owner_department_id");
  if(!departmentId)throw new Error("Select a department to delete.");

  const selectedName=card.querySelector('[data-field="owner_department_id"]')?.selectedOptions?.[0]?.textContent?.trim() || "selected department";
  const ok=confirm(`Delete department "${selectedName}"? This will be blocked if the department is assigned to any KPI.`);
  if(!ok)return;

  const {error}=await sb.rpc("csvb_tmsa_archive_department",{
    p_department_id: departmentId
  });

  if(error)throw error;

  showOk("Department deleted.");
  await loadWorkspace();
}

async function addPresenter(kpiId){
  clearMessages();

  const card=document.querySelector(`[data-kpi-card="${CSS.escape(kpiId)}"]`);
  if(!card)throw new Error("KPI card not found.");

  const newId=nval(card,"presenter_add_id");
  if(!newId)throw new Error("Select a presenter first.");

  const current=selectedPresenterIds(card);
  const next=[...new Set([...current,newId])];

  const {error}=await sb.rpc("csvb_tmsa_save_kpi_presenters",{
    p_kpi_id: kpiId,
    p_company_id: companyId(),
    p_presenter_ids: next
  });

  if(error)throw error;

  showOk("Presenter added.");
  await loadWorkspace();
}

async function removePresenter(kpiId,profileId){
  clearMessages();

  const card=document.querySelector(`[data-kpi-card="${CSS.escape(kpiId)}"]`);
  if(!card)throw new Error("KPI card not found.");

  const next=selectedPresenterIds(card).filter(id=>String(id)!==String(profileId));

  const {error}=await sb.rpc("csvb_tmsa_save_kpi_presenters",{
    p_kpi_id: kpiId,
    p_company_id: companyId(),
    p_presenter_ids: next
  });

  if(error)throw error;

  showOk("Presenter removed.");
  await loadWorkspace();
}

async function addPolicyLink(card,kind){
  clearMessages();

  const kpiId=card.dataset.kpiCard;

  if(kind === "esms_reference"){
    const sel=card.querySelector('[data-field="esms_reference_policy_node_id"]');
    const nodeId=sel?.value || "";
    const opt=sel?.selectedOptions?.[0] || null;

    if(!nodeId)throw new Error("Select a Company Policy item first.");

    const code=opt?.dataset?.code || "";
    const label=opt?.dataset?.label || opt?.textContent?.trim() || nodeId;

    const {error}=await sb.rpc("csvb_tmsa_save_kpi_policy_link",{
      p_kpi_id: kpiId,
      p_company_id: companyId(),
      p_link_kind: kind,
      p_policy_node_id: nodeId,
      p_policy_document_id: null,
      p_reference_code: code || null,
      p_display_label: label,
      p_link_note: null,
      p_sort_order: 100
    });

    if(error)throw error;

    showOk("eSMS reference linked to KPI.");
    await loadWorkspace();
    return;
  }

  const code=nval(card,kind+"_code").trim();
  const lbl=nval(card,kind+"_label").trim();

  if(!code && !lbl)throw new Error("Reference code or display label is required.");

  const {error}=await sb.rpc("csvb_tmsa_save_kpi_policy_link",{
    p_kpi_id: kpiId,
    p_company_id: companyId(),
    p_link_kind: kind,
    p_policy_node_id: null,
    p_policy_document_id: null,
    p_reference_code: code || null,
    p_display_label: lbl || code,
    p_link_note: null,
    p_sort_order: 100
  });

  if(error)throw error;

  showOk(kind==="esms_reference" ? "eSMS reference added." : "eSMS form added.");
  await loadWorkspace();
}

async function archivePolicyLink(linkId){
  clearMessages();

  const {error}=await sb.rpc("csvb_tmsa_archive_kpi_policy_link",{
    p_link_id: linkId
  });

  if(error)throw error;

  showOk("Link removed.");
  await loadWorkspace();
}

async function archiveNote(noteId){
  clearMessages();

  const {error}=await sb.rpc("csvb_tmsa_archive_kpi_internal_note",{
    p_note_id: noteId
  });

  if(error)throw error;

  showOk("Internal note removed.");
  await loadWorkspace();
}

async function saveNarrative(card,kind){
  clearMessages();

  if(!card)throw new Error("KPI card not found.");
  const kpiId=card.dataset.kpiCard;
  const current=NARRATIVE_BY_KPI.get(String(kpiId)) || {};

  const companyKpiStatement = kind === "kpi_statement"
    ? nval(card,"company_kpi_statement")
    : (current.company_kpi_statement || null);

  const companyBestPracticeGuidance = kind === "best_practice_guidance"
    ? nval(card,"company_best_practice_guidance")
    : (current.company_best_practice_guidance || null);

  const {error}=await sb.rpc("csvb_tmsa_save_kpi_narrative_override",{
    p_kpi_id: kpiId,
    p_company_id: companyId(),
    p_company_kpi_statement: companyKpiStatement,
    p_company_best_practice_guidance: companyBestPracticeGuidance
  });

  if(error)throw error;

  showOk(kind === "kpi_statement"
    ? "KPI text company narrative saved."
    : "Best Practice Guidance company narrative saved."
  );

  await loadWorkspace();
}

async function resetNarrative(card,kind){
  clearMessages();

  if(!card)throw new Error("KPI card not found.");
  const kpiId=card.dataset.kpiCard;

  const ok=confirm("Reset this narrative to the imported source text?");
  if(!ok)return;

  const {error}=await sb.rpc("csvb_tmsa_reset_kpi_narrative_override",{
    p_kpi_id: kpiId,
    p_company_id: companyId(),
    p_reset_kpi_statement: kind === "kpi_statement",
    p_reset_best_practice_guidance: kind === "best_practice_guidance"
  });

  if(error)throw error;

  showOk("Narrative reset to imported source text.");
  await loadWorkspace();
}

function cleanFileName(name){
  return String(name||"file")
    .replace(/[^\w.\-]+/g,"_")
    .replace(/_+/g,"_")
    .slice(0,160);
}

function storagePathFor(row,file){
  const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\..+$/,"Z");
  return [
    companyId(),
    String(row.element_code||"element").replace(/[^\w.\-]+/g,"_"),
    String(row.kpi_code||"kpi").replace(/[^\w.\-]+/g,"_"),
    `${stamp}_${cleanFileName(file.name)}`
  ].join("/");
}

async function uploadEvidenceForKpi(kpiId){
  clearMessages();

  const card=document.querySelector(`[data-kpi-card="${CSS.escape(kpiId)}"]`);
  if(!card)throw new Error("KPI card not found.");

  const row=ROWS.find(r=>String(r.kpi_id)===String(kpiId));
  if(!row)throw new Error("KPI row not found.");

  const fileInput=card.querySelector('[data-field="evidence_file"]');
  const file=fileInput?.files?.[0];

  if(!file)throw new Error("Select a file to upload.");

  const path=storagePathFor(row,file);

  const upload=await sb.storage
    .from("tmsa-kpi-evidence")
    .upload(path,file,{
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream"
    });

  if(upload.error)throw upload.error;

  const title=nval(card,"evidence_title").trim() || file.name;
  const docRef=nval(card,"evidence_doc_ref").trim() || `${row.kpi_code} / ${file.name}`;
  const type=nval(card,"evidence_type") || "record";
  const primary=bval(card,"evidence_primary");

  const evidence=await sb.rpc("csvb_tmsa_save_evidence",{
    p_evidence_id: null,
    p_company_id: companyId(),
    p_evidence_title: title,
    p_evidence_type: type,
    p_document_reference: docRef,
    p_sms_reference: policyLabels(card,"esms_reference").join("; ") || null,
    p_revision_no: null,
    p_revision_date: null,
    p_valid_from: null,
    p_valid_until: null,
    p_owner_department: ownerDepartmentLabel(card) || null,
    p_storage_path: path,
    p_file_name: file.name,
    p_file_type: file.type || null,
    p_evidence_strength: "moderate",
    p_confidentiality_level: "internal",
    p_remarks: `Uploaded from TMSA Element Workspace for KPI ${row.kpi_code}.`,
    p_is_active: true
  });

  if(evidence.error)throw evidence.error;

  const evidenceId=evidence.data;

  const link=await sb.rpc("csvb_tmsa_link_evidence_to_kpi",{
    p_evidence_id: evidenceId,
    p_kpi_id: kpiId,
    p_company_id: companyId(),
    p_link_note: "Uploaded directly under this KPI from Element Workspace.",
    p_is_primary: primary
  });

  if(link.error)throw link.error;

  showOk("Evidence uploaded and linked to KPI.");
  await loadWorkspace();
}

async function openRecord(storagePath){
  clearMessages();

  const signed=await sb.storage
    .from("tmsa-kpi-evidence")
    .createSignedUrl(storagePath,60 * 10);

  if(signed.error)throw signed.error;
  window.open(signed.data.signedUrl,"_blank","noopener,noreferrer");
}

async function unlinkRecord(linkId){
  clearMessages();

  const ok=confirm("Remove this record link from the KPI?");
  if(!ok)return;

  const {error}=await sb.rpc("csvb_tmsa_unlink_evidence_from_kpi",{
    p_link_id: linkId
  });

  if(error)throw error;

  showOk("Record link removed from KPI.");
  await loadWorkspace();
}

async function deactivateRecord(evidenceId){
  clearMessages();

  const ok=confirm("Deactivate this evidence record? The stored file will not be deleted in this step.");
  if(!ok)return;

  const {error}=await sb.rpc("csvb_tmsa_set_evidence_active",{
    p_evidence_id: evidenceId,
    p_is_active: false
  });

  if(error)throw error;

  showOk("Evidence record deactivated.");
  await loadWorkspace();
}

function updatePolicyNodeSelect(searchInput){
  const card=searchInput.closest("[data-kpi-card]");
  if(!card)return;

  const select=card.querySelector('[data-field="esms_reference_policy_node_id"]');
  const count=card.querySelector("[data-policy-picker-count]");
  if(!select)return;

  const term=searchInput.value || "";
  const matches=filteredPolicyNodes(term);

  select.innerHTML=policyNodeOptions(term);

  if(count){
    const q=String(term||"").trim();
    count.textContent = q
      ? `${matches.length} matching policy item${matches.length===1?"":"s"}.`
      : `${POLICY_NODES.length} policy items available.`;
  }
}

function openPolicyNode(nodeId){
  if(!nodeId)return;
  const url = `./company_policy.html?node_id=${encodeURIComponent(nodeId)}&from=tmsa`;
  window.open(url,"_blank","noopener,noreferrer");
}

function updateGlobalState(){
  const exactImportedCount = ROWS.filter(r=>!!r.has_exact_text || ["exact_text_imported","exact_kpi_text_imported_guidance_pending"].includes(r.import_status)).length;
  const guidancePendingCount = ROWS.filter(r=>!!r.guidance_pending).length;

  window.CSVB_TMSA_ELEMENT_WORKSPACE={
    build: BUILD,
    loaded: true,
    element_code: ELEMENT_CODE,
    kpi_count: ROWS.length,
    level_count: new Set(ROWS.map(r=>r.kpi_level)).size,
    calculation_required_count: ROWS.filter(r=>r.requires_calculation).length,
    linked_evidence_count: ROWS.reduce((sum,r)=>sum+Number(r.linked_evidence_count||0),0),
    exact_text_imported_count: exactImportedCount,
    guidance_pending_count: guidancePendingCount,
    support_loaded_count: SUPPORT_BY_KPI.size,
    title_loaded_count: TITLE_BY_KPI.size,
    narrative_loaded_count: NARRATIVE_BY_KPI.size,
    company_narrative_override_count: ROWS.filter(r=>String(r.company_kpi_statement||"").trim() || String(r.company_best_practice_guidance||"").trim()).length,
    policy_node_picker_count: POLICY_NODES.length,
    policy_node_picker_search_enabled: true,
    element_target_level: ELEMENT_TARGET?.target_level || null,
    evidence_record_count: Array.from(SUPPORT_BY_KPI.values()).reduce((sum,s)=>sum+arr(s.evidence_records).length,0),
    profile: PROFILE
  };
}

function bind(){
  document.addEventListener("click",e=>{
    const btn=e.target.closest("#saveElementTargetBtn");
    if(!btn)return;
    saveElementTarget().catch(err=>showWarn(err.message||String(err)));
  });

  el("logoutBtn")?.addEventListener("click",async()=>window.AUTH.logout());
  el("refreshBtn")?.addEventListener("click",()=>loadWorkspace().catch(e=>showWarn(e.message||String(e))));
  el("searchBox")?.addEventListener("input",renderWorkspace);

  el("elementJump")?.addEventListener("change",()=>{
    ELEMENT_CODE=el("elementJump").value || "1";
    const url=new URL(location.href);
    url.searchParams.set("element_code",ELEMENT_CODE);
    history.replaceState(null,"",url.toString());
    loadWorkspace().catch(e=>showWarn(e.message||String(e)));
  });

  el("companyFilter")?.addEventListener("change",()=>{
    localStorage.setItem(COMPANY_KEY,el("companyFilter").value||"");
    loadElementList()
      .then(loadWorkspace)
      .catch(e=>showWarn(e.message||String(e)));
  });

  el("workspaceBody")?.addEventListener("input",e=>{
    const policySearch=e.target.closest("[data-policy-picker-search]");
    if(policySearch){
      updatePolicyNodeSelect(policySearch);
      return;
    }
  });

  el("workspaceBody")?.addEventListener("click",e=>{
    const saveNarrativeBtn=e.target.closest("button[data-save-narrative]");
    if(saveNarrativeBtn){
      const card=e.target.closest("[data-kpi-card]");
      saveNarrative(card,saveNarrativeBtn.dataset.saveNarrative).catch(err=>showWarn(err.message||String(err)));
      return;
    }

    const resetNarrativeBtn=e.target.closest("button[data-reset-narrative]");
    if(resetNarrativeBtn){
      const card=e.target.closest("[data-kpi-card]");
      resetNarrative(card,resetNarrativeBtn.dataset.resetNarrative).catch(err=>showWarn(err.message||String(err)));
      return;
    }

    const save=e.target.closest("button[data-save-kpi]");
    if(save){
      saveKpi(save.dataset.saveKpi).catch(err=>showWarn(err.message||String(err)));
      return;
    }

    const addDept=e.target.closest("button[data-add-department]");
    if(addDept){
      addDepartment(addDept.dataset.addDepartment).catch(err=>showWarn(err.message||String(err)));
      return;
    }

    const removeDept=e.target.closest("button[data-remove-department]");
    if(removeDept){
      removeDepartment(removeDept.dataset.removeDepartment).catch(err=>showWarn(err.message||String(err)));
      return;
    }

    const addPresenterBtn=e.target.closest("button[data-add-presenter]");
    if(addPresenterBtn){
      addPresenter(addPresenterBtn.dataset.addPresenter).catch(err=>showWarn(err.message||String(err)));
      return;
    }

    const removePresenterBtn=e.target.closest("button[data-remove-presenter]");
    if(removePresenterBtn){
      removePresenter(
        removePresenterBtn.dataset.removePresenter,
        removePresenterBtn.dataset.profileId
      ).catch(err=>showWarn(err.message||String(err)));
      return;
    }

    const addLink=e.target.closest("button[data-add-policy-link]");
    if(addLink){
      const card=e.target.closest("[data-kpi-card]");
      addPolicyLink(card,addLink.dataset.addPolicyLink).catch(err=>showWarn(err.message||String(err)));
      return;
    }

    const openPolicyNodeBtn=e.target.closest("button[data-open-policy-node]");
    if(openPolicyNodeBtn){
      openPolicyNode(openPolicyNodeBtn.dataset.openPolicyNode);
      return;
    }

    const archiveLink=e.target.closest("button[data-archive-policy-link]");
    if(archiveLink){
      archivePolicyLink(archiveLink.dataset.archivePolicyLink).catch(err=>showWarn(err.message||String(err)));
      return;
    }

    const uploadBtn=e.target.closest("button[data-upload-evidence]");
    if(uploadBtn){
      uploadEvidenceForKpi(uploadBtn.dataset.uploadEvidence).catch(err=>showWarn(err.message||String(err)));
      return;
    }

    const openRecordBtn=e.target.closest("button[data-open-record]");
    if(openRecordBtn){
      openRecord(openRecordBtn.dataset.openRecord).catch(err=>showWarn(err.message||String(err)));
      return;
    }

    const unlinkRecordBtn=e.target.closest("button[data-unlink-record]");
    if(unlinkRecordBtn){
      unlinkRecord(unlinkRecordBtn.dataset.unlinkRecord).catch(err=>showWarn(err.message||String(err)));
      return;
    }

    const deactivateRecordBtn=e.target.closest("button[data-deactivate-record]");
    if(deactivateRecordBtn){
      deactivateRecord(deactivateRecordBtn.dataset.deactivateRecord).catch(err=>showWarn(err.message||String(err)));
      return;
    }

    const archiveNoteBtn=e.target.closest("button[data-archive-note]");
    if(archiveNoteBtn){
      archiveNote(archiveNoteBtn.dataset.archiveNote).catch(err=>showWarn(err.message||String(err)));
      return;
    }
  });
}

async function init(){
  try{
    bind();

    const auth=await window.AUTH.setupAuthButtons({logoutBtnId:"logoutBtn"});
    PROFILE=auth?.profile||null;

    if(el("subLine")){
      el("subLine").textContent=PROFILE?.username
        ? `${PROFILE.username} · ${PROFILE.role}`
        : "TMSA Element Workspace";
    }

    await setupCompanyFilter();
    await loadElementList();
    await loadWorkspace();
  }catch(e){
    showWarn(e.message||String(e));
    if(el("subLine"))el("subLine").textContent="Not ready.";
  }
}

init();
