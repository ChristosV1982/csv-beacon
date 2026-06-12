// public/tmsa-element-v01.js
// C.S.V. BEACON - TMSA Element / KPI Workspace v01

const BUILD = "tmsa_element_workspace_import_status_v03_20260612";
const sb = window.AUTH.ensureSupabase();
const COMPANY_KEY = "csvb_tmsa_element_workspace_selected_company_id";

let PROFILE = null;
let COMPANIES = [];
let ROWS = [];
let ELEMENTS = [];
let IMPORT_STATUS_ROWS = [];
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

async function loadWorkspace(){
  clearMessages();

  const workspaceResult = await sb.rpc("csvb_tmsa_element_workspace_for_me",{
    p_element_code: ELEMENT_CODE,
    p_company_id: companyId()
  });

  if(workspaceResult.error)throw workspaceResult.error;

  const statusResult = await sb.rpc("csvb_tmsa_element_import_status_for_me",{
    p_element_code: ELEMENT_CODE
  });

  if(statusResult.error)throw statusResult.error;

  IMPORT_STATUS_ROWS = statusResult.data || [];
  const byId = new Map(IMPORT_STATUS_ROWS.map(r=>[String(r.kpi_id),r]));

  ROWS=(workspaceResult.data||[]).map(r=>{
    const meta=byId.get(String(r.kpi_id)) || {};
    return {...r,...meta};
  });

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
    r.company_response,
    r.audit_answer_summary,
    r.evidence_to_present,
    r.internal_remarks,
    r.calculation_method,
    r.calculation_notes
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

  const rows=filteredRows();
  updateStats(rows);

  const guidancePendingRows = rows.filter(r=>r.guidance_pending);
  if(guidancePendingRows.length){
    showWarn(`Best Practice Guidance pending for ${guidancePendingRows.length} KPI(s): ${guidancePendingRows.map(r=>r.kpi_code).join(", ")}`);
  }else{
    showWarn("");
  }

  const levels=[...new Set(rows.map(r=>r.kpi_level))].sort((a,b)=>Number(a)-Number(b));

  body.innerHTML=levels.map(level=>{
    const levelRows=rows.filter(r=>String(r.kpi_level)===String(level));
    return `<section class="levelBlock">
      <h3 class="levelTitle">Level / Stage ${esc(level)} · ${levelRows.length} KPI(s)</h3>
      ${levelRows.map(renderKpiCard).join("")}
    </section>`;
  }).join("");
}

function renderKpiCard(r){
  const evidence=Array.isArray(r.linked_evidence)?r.linked_evidence:[];
  const textImported=!!r.has_exact_text || ["exact_text_imported","exact_kpi_text_imported_guidance_pending"].includes(r.import_status);
  const hasGuidance=!!r.has_guidance || String(r.best_practice_guidance||"").trim() !== "";
  const guidancePending=!!r.guidance_pending || (textImported && !hasGuidance);
  const sourceReference=String(r.exact_text_source_reference||"").trim();
  const sourceLabel=String(r.exact_text_source_label||"").trim();
  const importedAt=r.exact_text_imported_at
    ? String(r.exact_text_imported_at).slice(0,19).replace("T"," ")+" UTC"
    : "";

  return `<article class="kpiCard" data-kpi-card="${esc(r.kpi_id)}">
    <div class="kpiHeader">
      <div>
        <div class="kpiTitle">${esc(r.kpi_code)} · Level ${esc(r.kpi_level)}</div>
        <div class="small">${esc(r.company_name||"")}</div>
      </div>
      <div>
        ${pill(label(r.coverage_status))}
        ${pill(label(r.readiness_status),readinessClass(r.readiness_status))}
        ${pill(label(r.input_method))}
        ${r.requires_calculation?pill("Calculation required","amber"):""}
        ${textImported?pill("Exact Text Imported","green"):pill(label(r.import_status),"amber")}
        ${guidancePending?pill("Guidance Pending","amber"):""}
      </div>
    </div>

    <div class="sectionGrid">
      <div class="box">
        <h4>KPI text</h4>
        <div class="text">${esc(r.kpi_statement||"No KPI text available.")}</div>
      </div>
      <div class="box">
        <h4>Best Practice Guidance</h4>
        <div class="text">${r.best_practice_guidance?esc(r.best_practice_guidance):'<span class="small">Guidance pending / blank in extracted source.</span>'}</div>
      </div>
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
        <label>Coverage status</label>
        <select data-field="coverage_status">${optionSet(["not_reviewed","not_covered","partly_covered","covered_weak_evidence","covered_acceptable_evidence","verified"],r.coverage_status)}</select>
      </div>
      <div>
        <label>Claimed level</label>
        <select data-field="claimed_level">${levelOptions(r.claimed_level)}</select>
      </div>
      <div>
        <label>Target level</label>
        <select data-field="target_level">${levelOptions(r.target_level)}</select>
      </div>

      <div>
        <label>Input method</label>
        <select data-field="input_method">${optionSet(["narrative","yes_no","level_claim","numeric_metric","percentage_metric","date_based","frequency_based","document_reference","evidence_checklist","action_plan","mixed"],r.input_method)}</select>
      </div>
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
      <div>
        <label>Owner department</label>
        <input data-field="owner_department" value="${esc(r.owner_department||"")}" />
      </div>
      <div>
        <label>Responsible presenter</label>
        <input data-field="responsible_presenter" value="${esc(r.responsible_presenter||"")}" />
      </div>

      <div class="full">
        <label>Company answer / interpretation</label>
        <textarea data-field="company_response">${esc(r.company_response||"")}</textarea>
      </div>

      <div>
        <label>SMS reference</label>
        <textarea data-field="sms_reference">${esc(r.sms_reference||"")}</textarea>
      </div>
      <div>
        <label>Forms / records</label>
        <textarea data-field="forms_records">${esc(r.forms_records||"")}</textarea>
      </div>
      <div>
        <label>Internal notes / remarks</label>
        <textarea data-field="internal_remarks">${esc(r.internal_remarks||"")}</textarea>
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
        <textarea data-field="gap_action">${esc([r.gap_summary,r.action_required].filter(Boolean).join("\\n\\n"))}</textarea>
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

      <div class="full">
        <div class="box">
          <h4>Linked Evidence (${esc(r.linked_evidence_count||0)})</h4>
          ${renderEvidence(evidence)}
        </div>
      </div>
    </div>

    <div class="actions" style="margin-top:8px;">
      <button class="btn" data-save-kpi="${esc(r.kpi_id)}" type="button">Save KPI Workspace</button>
      <a class="btn secondary" href="./tmsa-kpi-presentation.html?kpi_id=${encodeURIComponent(r.kpi_id)}">Open Audit Presentation</a>
      <a class="btn secondary" href="./tmsa-evidence.html">Open Evidence Register</a>
    </div>
  </article>`;
}

function renderEvidence(items){
  if(!items.length)return `<div class="small">No evidence linked yet.</div>`;

  return items.map(ev=>{
    return `<div class="evidenceItem">
      <strong>${esc(ev.evidence_title||"-")}</strong>
      ${ev.is_primary?pill("Primary","green"):""}
      ${ev.evidence_strength?pill(label(ev.evidence_strength),readinessClass(ev.evidence_strength)):""}
      <div class="small">Doc: ${esc(ev.document_reference||"-")} · SMS: ${esc(ev.sms_reference||"-")}</div>
      ${ev.link_note?`<div class="small">Link note: ${esc(ev.link_note)}</div>`:""}
    </div>`;
  }).join("");
}

function optionSet(values,current){
  return values.map(v=>`<option value="${esc(v)}" ${String(v)===String(current)?"selected":""}>${esc(label(v))}</option>`).join("");
}

function levelOptions(current){
  return `<option value="">-</option>`+[1,2,3,4].map(v=>`<option value="${v}" ${Number(current)===v?"selected":""}>Level ${v}</option>`).join("");
}

async function saveKpi(kpiId){
  clearMessages();

  const card=document.querySelector(`[data-kpi-card="${CSS.escape(kpiId)}"]`);
  if(!card)throw new Error("KPI card not found.");

  const gapAction=nval(card,"gap_action").split(/\n\s*\n/);

  const payload={
    p_kpi_id: kpiId,
    p_company_id: companyId(),
    p_coverage_status: nval(card,"coverage_status"),
    p_claimed_level: nval(card,"claimed_level")?Number(nval(card,"claimed_level")):null,
    p_target_level: nval(card,"target_level")?Number(nval(card,"target_level")):null,
    p_input_method: nval(card,"input_method"),
    p_readiness_status: nval(card,"readiness_status"),
    p_company_response: nval(card,"company_response") || null,
    p_sms_reference: nval(card,"sms_reference") || null,
    p_forms_records: nval(card,"forms_records") || null,
    p_owner_department: nval(card,"owner_department") || null,
    p_evidence_strength: nval(card,"evidence_strength"),
    p_oil_major_sensitivity: nval(card,"oil_major_sensitivity"),
    p_audit_answer_summary: nval(card,"audit_answer_summary") || null,
    p_evidence_to_present: nval(card,"evidence_to_present") || null,
    p_weakness_to_avoid: nval(card,"weakness_to_avoid") || null,
    p_responsible_presenter: nval(card,"responsible_presenter") || null,
    p_gap_summary: gapAction[0] || null,
    p_action_required: gapAction.slice(1).join("\n\n") || null,
    p_internal_remarks: nval(card,"internal_remarks") || null,
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

  const {data,error}=await sb.rpc("csvb_tmsa_save_kpi_workspace",payload);
  if(error)throw error;

  showOk(`KPI workspace saved. Matrix ID: ${data}`);
  await loadWorkspace();
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
    profile: PROFILE
  };
}

function bind(){
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

  el("workspaceBody")?.addEventListener("click",e=>{
    const btn=e.target.closest("button[data-save-kpi]");
    if(!btn)return;
    saveKpi(btn.dataset.saveKpi).catch(err=>showWarn(err.message||String(err)));
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
