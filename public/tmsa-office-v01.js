// public/tmsa-office-v01.js
// C.S.V. BEACON - TMSA Office Inspection Manager v02

const BUILD = "tmsa_office_manager_targets_v01_20260610";

const sb = window.AUTH.ensureSupabase();
const TMSA_COMPANY_KEY = "csvb_tmsa_selected_company_id";

let PROFILE = null;
let COMPANIES = [];
let DASHBOARD = null;
let ROWS = [];
let CURRENT = null;
let SELECTED_ELEMENT = null;

function el(id){return document.getElementById(id)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function showWarn(msg){const n=el("warnBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function showOk(msg){const n=el("okBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function clearMessages(){showWarn("");showOk("")}

function isPlatformRole(role){
  return role === "super_admin" || role === "platform_owner";
}

function label(v){
  return String(v||"-")
    .replaceAll("_"," ")
    .replace(/\b\w/g,c=>c.toUpperCase());
}

function statusPill(v){
  const s=String(v||"not_reviewed");
  let cls="";
  if(["not_covered","partly_covered","covered_weak_evidence"].includes(s)) cls="gap";
  if(["covered_acceptable_evidence","verified"].includes(s)) cls="okp";
  if(s==="not_reviewed") cls="warnp";
  return `<span class="pill ${cls}">${esc(label(s))}</span>`;
}

function setText(id, value){
  const n=el(id);
  if(n)n.textContent=String(value ?? "");
}

function selectedCompanyId(){
  const n=el("companyFilter");
  if(n && n.style.display !== "none" && n.value) return n.value;
  return null;
}

async function setupCompanyFilter(){
  const n=el("companyFilter");

  if(!n || !PROFILE || !isPlatformRole(PROFILE.role)){
    if(n)n.style.display="none";
    return;
  }

  const {data,error}=await sb.rpc("csvb_admin_list_companies");

  if(error){
    showWarn("Could not load company selector: " + (error.message || String(error)));
    n.style.display="none";
    return;
  }

  COMPANIES=data||[];
  n.style.display="inline-block";

  n.innerHTML=`<option value="">Select company...</option>`+COMPANIES.map(c=>{
    const text=c.company_name||c.short_name||c.company_code||c.id;
    return `<option value="${esc(c.id)}">${esc(text)}</option>`;
  }).join("");

  const saved=localStorage.getItem(TMSA_COMPANY_KEY)||"";

  if(saved && COMPANIES.some(c=>String(c.id)===String(saved))){
    n.value=saved;
  }else if(COMPANIES.length){
    n.value=COMPANIES[0].id;
    localStorage.setItem(TMSA_COMPANY_KEY,n.value);
  }
}

function rowsFiltered(){
  if(!SELECTED_ELEMENT) return [];

  const element=String(SELECTED_ELEMENT.element_code || "").trim();
  const term=String(el("searchInput")?.value||"").trim().toLowerCase();

  return ROWS.filter(r=>{
    if(element && r.element_code!==element) return false;

    if(!term) return true;

    const hay=[
      r.element_code,
      r.element_title,
      r.kpi_code,
      r.kpi_statement,
      r.best_practice_guidance,
      r.coverage_status,
      r.company_response,
      r.sms_reference,
      r.forms_records,
      r.owner_department,
      r.gap_summary,
      r.action_required
    ].join(" ").toLowerCase();

    return hay.includes(term);
  });
}

function renderStats(){
  if(!DASHBOARD)return;

  setText("elementCount", DASHBOARD.element_count||0);
  setText("kpiCount", DASHBOARD.kpi_count||0);
  setText("matrixCount", DASHBOARD.matrix_count||0);
  setText("evidenceCount", DASHBOARD.evidence_count||0);
  setText("eventCount", DASHBOARD.office_event_count||0);
}

function renderElementCards(){
  const grid=el("elementsGrid");
  if(!grid)return;

  const elements=DASHBOARD?.elements||[];

  if(!elements.length){
    grid.innerHTML=`<div class="note">No TMSA elements found.</div>`;
    return;
  }

  grid.innerHTML=elements.map(e=>{
    const kpiCount=Number(e.kpi_count||0);
    const handled=Number(e.matrix_count||0);
    const verified=Number(e.verified_count||0);
    const gaps=Number(e.gap_count||0);
    const ready=Number(e.oil_major_ready_count||0);

    return `<button class="elementCard" type="button" data-open-element="${esc(e.element_code)}">
      <div class="elementTop">
        <span class="elementCodeBadge">Element ${esc(e.element_code)}</span>
        <span class="elementOpen">Open →</span>
      </div>

      <div>
        <div class="elementTitle">${esc(e.element_title||"-")}</div>
      </div>

      <div class="elementMetricGrid">
        <div class="elementMetric">
          <strong>${esc(kpiCount)}</strong>
          <span>KPI records</span>
        </div>

        <div class="elementMetric">
          <strong>${esc(handled)}</strong>
          <span>Handled</span>
        </div>

        <div class="elementMetric good">
          <strong>${esc(verified)}</strong>
          <span>Verified</span>
        </div>

        <div class="elementMetric ${gaps ? "gap" : "good"}">
          <strong>${esc(gaps)}</strong>
          <span>Gaps</span>
        </div>
      </div>
    </button>`;
  }).join("");
}

function renderRows(){
  const body=el("matrixBody");
  const count=el("rowCount");
  if(!body)return;

  const data=rowsFiltered();

  if(count)count.textContent=`${data.length} row${data.length===1?"":"s"}`;

  if(!SELECTED_ELEMENT){
    body.innerHTML=`<tr><td colspan="10">Select a chapter.</td></tr>`;
    return;
  }

  if(!data.length){
    body.innerHTML=`<tr><td colspan="10">No TMSA KPI rows found for this chapter.</td></tr>`;
    return;
  }

  body.innerHTML=data.map(r=>{
    const claim=[
      r.claimed_level?`Claimed L${r.claimed_level}`:"",
      r.target_level?`Target L${r.target_level}`:"",
      r.readiness_status?`Readiness: ${label(r.readiness_status)}`:"",
      r.input_method?`Input: ${label(r.input_method)}`:"",
      r.target_value!==null&&r.target_value!==undefined?`Target: ${r.target_value}${r.measurement_unit?" "+r.measurement_unit:""}`:"",
      r.actual_value!==null&&r.actual_value!==undefined?`Actual: ${r.actual_value}${r.measurement_unit?" "+r.measurement_unit:""}`:""
    ].filter(Boolean).join("<br>")||"-";

    const response=[
      r.sms_reference?`SMS: ${r.sms_reference}`:"",
      r.audit_answer_summary?`Audit answer: ${r.audit_answer_summary}`:"",
      r.company_response?`Handling: ${r.company_response}`:""
    ].filter(Boolean).join("\n\n");
    const evidence=label(r.evidence_strength||"no_evidence");
    const sens=label(r.oil_major_sensitivity||"medium");

    return `<tr>
      <td><strong>${esc(r.element_code)}</strong><div class="small">${esc(r.element_title||"")}</div></td>
      <td class="mono">${esc(r.kpi_code)}</td>
      <td>L${esc(r.kpi_level)}</td>
      <td>
        <div><strong>${esc(r.kpi_statement||"-")}</strong></div>
        ${r.best_practice_guidance?`<details style="margin-top:6px;"><summary>Best Practice Guidance</summary><div class="small">${esc(r.best_practice_guidance)}</div></details>`:""}
        <div class="small">Import status: ${esc(r.import_status||"-")}</div>
      </td>
      <td>${statusPill(r.coverage_status)}</td>
      <td>${claim}</td>
      <td>${esc(evidence)}<div class="small">Oil Major: ${esc(sens)}</div></td>
      <td>${esc(r.owner_department||"-")}</td>
      <td><div class="small" style="white-space:pre-wrap;">${esc(response||"-")}</div></td>
      <td><button class="btn secondary" type="button" data-edit-kpi="${esc(r.kpi_id)}">Edit</button></td>
    </tr>`;
  }).join("");
}

function showElementHome(){
  SELECTED_ELEMENT=null;
  closeEdit();

  const home=el("elementHome");
  const matrix=el("matrixSection");

  if(home)home.style.display="block";
  if(matrix)matrix.style.display="none";

  renderRows();
}

function openElement(elementCode){
  const elements=DASHBOARD?.elements||[];
  const found=elements.find(e=>String(e.element_code)===String(elementCode));

  if(!found){
    showWarn("Selected TMSA element was not found.");
    return;
  }

  SELECTED_ELEMENT=found;
  closeEdit();

  const home=el("elementHome");
  const matrix=el("matrixSection");

  if(home)home.style.display="none";
  if(matrix)matrix.style.display="block";

  setText("selectedElementTitle", `Chapter / Element ${found.element_code} - ${found.element_title}`);
  setText("selectedElementSub", `${Number(found.kpi_count||0)} KPI(s) · ${Number(found.matrix_count||0)} handled · ${Number(found.gap_count||0)} gap(s)`);

  if(el("searchInput"))el("searchInput").value="";

  renderRows();

  matrix?.scrollIntoView({behavior:"smooth",block:"start"});
}

async function loadAll(){
  clearMessages();

  const dash=await sb.rpc("csvb_tmsa_dashboard_for_me");
  if(dash.error) throw dash.error;

  DASHBOARD=dash.data||{};

  renderStats();
  renderElementCards();

  const rows=await sb.rpc("csvb_tmsa_kpi_matrix_for_me",{
    p_element_code: null,
    p_search: null,
    p_company_id: selectedCompanyId()
  });

  if(rows.error) throw rows.error;

  ROWS=rows.data||[];

  if(SELECTED_ELEMENT){
    const code=SELECTED_ELEMENT.element_code;
    SELECTED_ELEMENT=(DASHBOARD.elements||[]).find(e=>String(e.element_code)===String(code))||null;
  }

  if(SELECTED_ELEMENT){
    openElement(SELECTED_ELEMENT.element_code);
  }else{
    showElementHome();
  }

  window.CSVB_TMSA_OFFICE_MANAGER={
    build: BUILD,
    loaded: true,
    element_count: DASHBOARD.element_count||0,
    kpi_count: DASHBOARD.kpi_count||0,
    row_count: ROWS.length,
    selected_company_id: selectedCompanyId(),
    selected_element_code: SELECTED_ELEMENT?.element_code || null,
    profile: DASHBOARD.profile||null
  };
}

function openEdit(row){
  CURRENT=row;

  const box=el("editBox");
  if(box)box.style.display="block";

  setText("editHeader", `${row.element_code} / ${row.kpi_code} / Level ${row.kpi_level}`);

  el("coverageStatus").value=row.coverage_status||"not_reviewed";
  el("claimedLevel").value=row.claimed_level||"";
  el("targetLevel").value=row.target_level||"";
  el("evidenceStrength").value=row.evidence_strength||"no_evidence";
  el("oilMajorSensitivity").value=row.oil_major_sensitivity||"medium";
  el("ownerDepartment").value=row.owner_department||"";
  el("companyResponse").value=row.company_response||"";
  el("smsReference").value=row.sms_reference||"";
  el("formsRecords").value=row.forms_records||"";
  el("gapSummary").value=row.gap_summary||"";
  el("actionRequired").value=row.action_required||"";
  el("internalRemarks").value=row.internal_remarks||"";

  el("inputMethod").value=row.input_method||"narrative";
  el("readinessStatus").value=row.readiness_status||"not_assessed";
  el("responsiblePresenter").value=row.responsible_presenter||"";
  el("auditAnswerSummary").value=row.audit_answer_summary||"";
  el("evidenceToPresent").value=row.evidence_to_present||"";
  el("weaknessToAvoid").value=row.weakness_to_avoid||"";
  el("measurementUnit").value=row.measurement_unit||"";
  el("measurementFrequency").value=row.measurement_frequency||"";
  el("metricDirection").value=row.metric_direction||"not_applicable";
  el("targetValue").value=row.target_value ?? "";
  el("actualValue").value=row.actual_value ?? "";
  el("minimumAcceptableValue").value=row.minimum_acceptable_value ?? "";
  el("maximumAcceptableValue").value=row.maximum_acceptable_value ?? "";
  el("greenThreshold").value=row.green_threshold ?? "";
  el("amberThreshold").value=row.amber_threshold ?? "";
  el("redThreshold").value=row.red_threshold ?? "";
  el("lastMeasuredAt").value=row.last_measured_at?String(row.last_measured_at).slice(0,10):"";
  el("lastReviewedAt").value=row.last_reviewed_at?String(row.last_reviewed_at).slice(0,10):"";
  el("nextReviewDue").value=row.next_review_due?String(row.next_review_due).slice(0,10):"";

  box?.scrollIntoView({behavior:"smooth",block:"start"});
}

function closeEdit(){
  CURRENT=null;

  const box=el("editBox");
  if(box)box.style.display="none";
}

async function saveHandling(){
  if(!CURRENT) throw new Error("No KPI selected.");

  clearMessages();

  const payload={
    p_kpi_id: CURRENT.kpi_id,
    p_company_id: CURRENT.company_id || selectedCompanyId() || null,
    p_coverage_status: el("coverageStatus").value,
    p_claimed_level: el("claimedLevel").value?Number(el("claimedLevel").value):null,
    p_target_level: el("targetLevel").value?Number(el("targetLevel").value):null,
    p_company_response: el("companyResponse").value||null,
    p_sms_reference: el("smsReference").value||null,
    p_forms_records: el("formsRecords").value||null,
    p_owner_department: el("ownerDepartment").value||null,
    p_evidence_strength: el("evidenceStrength").value,
    p_oil_major_sensitivity: el("oilMajorSensitivity").value,
    p_gap_summary: el("gapSummary").value||null,
    p_action_required: el("actionRequired").value||null,
    p_internal_remarks: el("internalRemarks").value||null,

    p_input_method: el("inputMethod").value,
    p_readiness_status: el("readinessStatus").value,
    p_audit_answer_summary: el("auditAnswerSummary").value||null,
    p_evidence_to_present: el("evidenceToPresent").value||null,
    p_weakness_to_avoid: el("weaknessToAvoid").value||null,
    p_responsible_presenter: el("responsiblePresenter").value||null,

    p_measurement_unit: el("measurementUnit").value||null,
    p_measurement_frequency: el("measurementFrequency").value||null,
    p_metric_direction: el("metricDirection").value,
    p_target_value: el("targetValue").value===""?null:Number(el("targetValue").value),
    p_actual_value: el("actualValue").value===""?null:Number(el("actualValue").value),
    p_minimum_acceptable_value: el("minimumAcceptableValue").value===""?null:Number(el("minimumAcceptableValue").value),
    p_maximum_acceptable_value: el("maximumAcceptableValue").value===""?null:Number(el("maximumAcceptableValue").value),
    p_green_threshold: el("greenThreshold").value===""?null:Number(el("greenThreshold").value),
    p_amber_threshold: el("amberThreshold").value===""?null:Number(el("amberThreshold").value),
    p_red_threshold: el("redThreshold").value===""?null:Number(el("redThreshold").value),
    p_last_measured_at: el("lastMeasuredAt").value||null,
    p_last_reviewed_at: el("lastReviewedAt").value||null,
    p_next_review_due: el("nextReviewDue").value||null
  };

  const {data,error}=await sb.rpc("csvb_tmsa_save_kpi_handling",payload);

  if(error) throw error;

  showOk(`TMSA KPI handling saved. Matrix ID: ${data}`);
  closeEdit();
  await loadAll();
}

function bind(){
  el("logoutBtn")?.addEventListener("click",async()=>window.AUTH.logout());

  el("refreshHomeBtn")?.addEventListener("click",()=>loadAll().catch(e=>showWarn(e.message||String(e))));
  el("refreshBtn")?.addEventListener("click",()=>loadAll().catch(e=>showWarn(e.message||String(e))));

  el("companyFilter")?.addEventListener("change",()=>{
    localStorage.setItem(TMSA_COMPANY_KEY,el("companyFilter").value||"");
    loadAll().catch(e=>showWarn(e.message||String(e)));
  });

  el("searchInput")?.addEventListener("input",renderRows);
  el("backToElementsBtn")?.addEventListener("click",showElementHome);
  el("closeEditBtn")?.addEventListener("click",closeEdit);
  el("saveHandlingBtn")?.addEventListener("click",()=>saveHandling().catch(e=>showWarn(e.message||String(e))));

  el("elementsGrid")?.addEventListener("click",e=>{
    const btn=e.target.closest("[data-open-element]");
    if(!btn)return;

    const code = btn.dataset.openElement || "";
    if(!code)return;

    window.location.href = "./tmsa-element.html?element_code=" + encodeURIComponent(code);
  });

  el("matrixBody")?.addEventListener("click",e=>{
    const btn=e.target.closest("button[data-edit-kpi]");
    if(!btn)return;
    const row=ROWS.find(x=>String(x.kpi_id)===String(btn.dataset.editKpi));
    if(row)openEdit(row);
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
        : "TMSA Office Inspection Manager";
    }

    await setupCompanyFilter();
    await loadAll();
  }catch(e){
    showWarn(e.message||String(e));
    if(el("subLine"))el("subLine").textContent="Not ready.";
  }
}

init();
