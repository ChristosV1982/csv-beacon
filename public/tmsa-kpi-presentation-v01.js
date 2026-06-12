// public/tmsa-kpi-presentation-v01.js
// C.S.V. BEACON - TMSA KPI Audit Presentation View v01

const BUILD = "tmsa_kpi_audit_presentation_cleanup_v04c_20260612";
const sb = window.AUTH.ensureSupabase();
const COMPANY_KEY = "csvb_tmsa_presentation_selected_company_id";

let PROFILE = null;
let COMPANIES = [];
let KPI_ROWS = [];
let CURRENT = null;

function el(id){return document.getElementById(id)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function showWarn(msg){const n=el("warnBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function showOk(msg){const n=el("okBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function clearMessages(){showWarn("");showOk("")}
function isPlatformRole(role){return role==="super_admin" || role==="platform_owner"}
function label(v){return String(v||"-").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function date(v){return v?String(v).slice(0,10):"-"}
function text(v,fallback="-"){return v?esc(v):fallback}
function companyId(){
  const n=el("companyFilter");
  if(n && n.style.display!=="none" && n.value) return n.value;
  return null;
}

function pill(value, cls=""){
  return `<span class="pill ${cls}">${esc(value)}</span>`;
}

function readinessClass(v){
  if(v==="oil_major_ready" || v==="ready")return "green";
  if(v==="partly_ready")return "amber";
  if(v==="not_ready")return "red";
  return "";
}

function valueWithUnit(v, unit){
  if(v===null || v===undefined || v==="")return "-";
  return `${esc(v)}${unit?` ${esc(unit)}`:""}`;
}

function traffic(row){
  const actual = row.actual_value;
  const dir = row.metric_direction || "not_applicable";
  const unit = row.measurement_unit || "";

  if(actual===null || actual===undefined || dir==="not_applicable"){
    return {label:"Not measured", cls:"", detail:"No actual value / metric direction defined."};
  }

  const a = Number(actual);
  const green = row.green_threshold===null||row.green_threshold===undefined?null:Number(row.green_threshold);
  const amber = row.amber_threshold===null||row.amber_threshold===undefined?null:Number(row.amber_threshold);
  const min = row.minimum_acceptable_value===null||row.minimum_acceptable_value===undefined?null:Number(row.minimum_acceptable_value);
  const max = row.maximum_acceptable_value===null||row.maximum_acceptable_value===undefined?null:Number(row.maximum_acceptable_value);
  const target = row.target_value===null||row.target_value===undefined?null:Number(row.target_value);

  if(dir==="higher_is_better"){
    if(green!==null && a>=green)return {label:"Green",cls:"green",detail:`Actual ${a}${unit?` ${unit}`:""} is at/above green threshold.`};
    if(amber!==null && a>=amber)return {label:"Amber",cls:"amber",detail:`Actual ${a}${unit?` ${unit}`:""} is at/above amber threshold but below green.`};
    return {label:"Red",cls:"red",detail:`Actual ${a}${unit?` ${unit}`:""} is below defined threshold.`};
  }

  if(dir==="lower_is_better"){
    if(green!==null && a<=green)return {label:"Green",cls:"green",detail:`Actual ${a}${unit?` ${unit}`:""} is at/below green threshold.`};
    if(amber!==null && a<=amber)return {label:"Amber",cls:"amber",detail:`Actual ${a}${unit?` ${unit}`:""} is at/below amber threshold but above green.`};
    return {label:"Red",cls:"red",detail:`Actual ${a}${unit?` ${unit}`:""} is above defined threshold.`};
  }

  if(dir==="range"){
    if(min!==null && max!==null && a>=min && a<=max)return {label:"Green",cls:"green",detail:`Actual ${a}${unit?` ${unit}`:""} is within acceptable range.`};
    return {label:"Red",cls:"red",detail:`Actual ${a}${unit?` ${unit}`:""} is outside acceptable range or range is incomplete.`};
  }

  if(dir==="exact"){
    if(target!==null && a===target)return {label:"Green",cls:"green",detail:`Actual equals target.`};
    return {label:"Red",cls:"red",detail:`Actual does not equal target or target is missing.`};
  }

  return {label:"Not measured", cls:"", detail:"Metric direction not evaluated."};
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

async function loadKpis(){
  const {data,error}=await sb.rpc("csvb_tmsa_kpi_matrix_for_me",{
    p_element_code: null,
    p_search: null,
    p_company_id: companyId()
  });

  if(error)throw error;

  KPI_ROWS=data||[];
  renderElementFilter();
  renderKpiFilter();

  const qs=new URLSearchParams(location.search);
  const requestedKpi=qs.get("kpi_id");
  if(requestedKpi && KPI_ROWS.some(r=>String(r.kpi_id)===String(requestedKpi))){
    el("kpiFilter").value=requestedKpi;
  }

  if(!el("kpiFilter").value && KPI_ROWS.length){
    el("kpiFilter").value=KPI_ROWS[0].kpi_id;
  }

  const selected=KPI_ROWS.find(r=>String(r.kpi_id)===String(el("kpiFilter").value));
  if(selected && el("elementFilter").value!==selected.element_code){
    el("elementFilter").value=selected.element_code;
    renderKpiFilter(selected.kpi_id);
  }
}

function renderElementFilter(){
  const n=el("elementFilter");
  const seen=new Set();
  const opts=[];

  KPI_ROWS.forEach(r=>{
    if(!r.element_code || seen.has(r.element_code))return;
    seen.add(r.element_code);
    opts.push({code:r.element_code,title:r.element_title});
  });

  n.innerHTML=opts.map(x=>`<option value="${esc(x.code)}">${esc(x.code)} - ${esc(x.title)}</option>`).join("");
}

function renderKpiFilter(preferredKpiId=null){
  const n=el("kpiFilter");
  const element=el("elementFilter").value || KPI_ROWS[0]?.element_code || "";
  const rows=KPI_ROWS.filter(r=>r.element_code===element);

  n.innerHTML=rows.map(r=>{
    return `<option value="${esc(r.kpi_id)}">${esc(r.kpi_code)} · Level ${esc(r.kpi_level)}</option>`;
  }).join("");

  if(preferredKpiId && rows.some(r=>String(r.kpi_id)===String(preferredKpiId))){
    n.value=preferredKpiId;
  }else if(rows.length){
    n.value=rows[0].kpi_id;
  }
}

async function loadPresentation(){
  clearMessages();

  const kpiId=el("kpiFilter").value;
  if(!kpiId){
    el("presentationBody").innerHTML="No KPI selected.";
    return;
  }

  const {data,error}=await sb.rpc("csvb_tmsa_kpi_audit_presentation_for_me",{
    p_kpi_id: kpiId,
    p_company_id: companyId()
  });

  if(error)throw error;

  CURRENT=(data||[])[0]||null;
  renderPresentation();

  window.CSVB_TMSA_KPI_PRESENTATION={
    build: BUILD,
    loaded: true,
    kpi_count: KPI_ROWS.length,
    selected_kpi_id: CURRENT?.kpi_id || null,
    selected_kpi_code: CURRENT?.kpi_code || "",
    linked_evidence_count: CURRENT?.linked_evidence_count ?? null,
    profile: PROFILE
  };
}

function renderPresentation(){
  const n=el("presentationBody");
  if(!CURRENT){
    n.innerHTML="No KPI presentation record found.";
    return;
  }

  const r=CURRENT;
  const t=traffic(r);
  const linked=Array.isArray(r.linked_evidence)?r.linked_evidence:[];

  n.innerHTML=`
    <div class="printOnly">
      <h1>TMSA KPI Audit Presentation</h1>
    </div>

    <div class="auditHeader">
      <div>
        <h2 style="margin:0 0 6px;color:#06305c;">${esc(r.kpi_code)} · Level ${esc(r.kpi_level)}</h2>
        <div class="small">${esc(r.element_code)} - ${esc(r.element_title)}</div>
        <div class="small">${esc(r.company_name||"")}</div>
      </div>
      <div>
        ${pill(`Coverage: ${label(r.coverage_status)}`)}
        ${pill(`Input: ${label(r.input_method)}`)}
        ${r.import_status && r.import_status!=="exact_text_imported"?pill(`Text: ${label(r.import_status)}`,"amber"):""}
      </div>
    </div>

    <div class="sectionGrid" style="margin-top:10px;">
      <div class="box">
        <h3>KPI Statement</h3>
        <div class="text">${text(r.kpi_statement)}</div>
      </div>

      <div class="box">
        <h3>Best Practice Guidance</h3>
        <div class="text">${text(r.best_practice_guidance, '<span class="small">Not imported yet.</span>')}</div>
      </div>
    </div>

    <div class="sectionGrid" style="margin-top:10px;">
      <div class="box">
        <h3>Audit Answer Summary</h3>
        <div class="text">${text(r.audit_answer_summary, '<span class="small">No audit answer summary entered yet.</span>')}</div>
      </div>

      <div class="box">
        <h3>Evidence to Present</h3>
        <div class="text">${text(r.evidence_to_present, '<span class="small">No evidence presentation notes entered yet.</span>')}</div>
      </div>
    </div>

    <div class="sectionGrid" style="margin-top:10px;">
      <div class="box">
        <h3>Company Handling / eSMS References</h3>
        <div class="kv"><div class="k">Claimed level</div><div>${r.claimed_level?`Level ${esc(r.claimed_level)}`:"-"}</div></div>
        <div class="kv"><div class="k">Target level</div><div>${r.target_level?`Level ${esc(r.target_level)}`:"-"}</div></div>
        <div class="kv"><div class="k">eSMS reference</div><div>${text(r.sms_reference)}</div></div>
        <div class="kv"><div class="k">eSMS Forms / records</div><div>${text(r.forms_records)}</div></div>
        <div class="kv"><div class="k">Owner department</div><div>${text(r.owner_department)}</div></div>
        <div class="kv"><div class="k">Presenter</div><div>${text(r.responsible_presenter)}</div></div>
      </div>

      <div class="box">
        <h3>Targets / Actual / Limits</h3>
        <div>${pill(t.label,t.cls)} <span class="small">${esc(t.detail)}</span></div>
        <div class="kv"><div class="k">Direction</div><div>${esc(label(r.metric_direction))}</div></div>
        <div class="kv"><div class="k">Frequency</div><div>${text(r.measurement_frequency)}</div></div>
        <div class="kv"><div class="k">Target</div><div>${valueWithUnit(r.target_value,r.measurement_unit)}</div></div>
        <div class="kv"><div class="k">Actual</div><div>${valueWithUnit(r.actual_value,r.measurement_unit)}</div></div>
        <div class="kv"><div class="k">Acceptable range</div><div>${valueWithUnit(r.minimum_acceptable_value,r.measurement_unit)} / ${valueWithUnit(r.maximum_acceptable_value,r.measurement_unit)}</div></div>
        <div class="kv"><div class="k">Thresholds</div><div>Green ${valueWithUnit(r.green_threshold,r.measurement_unit)} · Amber ${valueWithUnit(r.amber_threshold,r.measurement_unit)} · Red ${valueWithUnit(r.red_threshold,r.measurement_unit)}</div></div>
        <div class="kv"><div class="k">Measured / review</div><div>Measured: ${date(r.last_measured_at)} · Reviewed: ${date(r.last_reviewed_at)} · Next due: ${date(r.next_review_due)}</div></div>
      </div>
    </div>

    <div class="box" style="margin-top:10px;">
      <h3>Linked Evidence Records (${esc(r.linked_evidence_count||0)})</h3>
      <div class="evidenceList">
        ${renderEvidence(linked)}
      </div>
    </div>
  `;
}

function renderEvidence(items){
  if(!items.length){
    return `<div class="small">No linked evidence records yet.</div>`;
  }

  return items.map(ev=>{
    return `<div class="evidenceItem">
      <div class="evidenceTitle">
        ${esc(ev.evidence_title||"-")}
        ${ev.is_primary?pill("Primary","green"):""}
        ${ev.evidence_strength?pill(label(ev.evidence_strength), ev.evidence_strength==="oil_major_ready"||ev.evidence_strength==="strong"?"green":ev.evidence_strength==="weak"?"red":""):""}
      </div>
      <div class="small">${esc(label(ev.evidence_type))} · ${esc(label(ev.confidentiality_level))}</div>
      <div class="kv"><div class="k">Document reference</div><div>${text(ev.document_reference)}</div></div>
      <div class="kv"><div class="k">eSMS reference</div><div>${text(ev.sms_reference)}</div></div>
      <div class="kv"><div class="k">Revision / validity</div><div>Rev ${text(ev.revision_no)} · Rev date ${date(ev.revision_date)} · Valid ${date(ev.valid_from)} to ${date(ev.valid_until)}</div></div>
      <div class="kv"><div class="k">Owner / file</div><div>${text(ev.owner_department)} · ${text(ev.file_name)} ${ev.file_type?`(${esc(ev.file_type)})`:""}</div></div>
      <div class="kv"><div class="k">Storage path</div><div>${text(ev.storage_path)}</div></div>
      <div class="kv"><div class="k">Link note</div><div>${text(ev.link_note)}</div></div>
      <div class="kv"><div class="k">Remarks</div><div>${text(ev.remarks)}</div></div>
    </div>`;
  }).join("");
}

function selectedIndex(){
  const id=el("kpiFilter").value;
  return KPI_ROWS.findIndex(r=>String(r.kpi_id)===String(id));
}

function moveKpi(delta){
  if(!KPI_ROWS.length)return;
  let idx=selectedIndex();
  if(idx<0)idx=0;
  idx=Math.min(Math.max(idx+delta,0),KPI_ROWS.length-1);
  const row=KPI_ROWS[idx];
  el("elementFilter").value=row.element_code;
  renderKpiFilter(row.kpi_id);
  loadPresentation().catch(e=>showWarn(e.message||String(e)));
}

function bind(){
  el("logoutBtn")?.addEventListener("click",async()=>window.AUTH.logout());
  el("printBtn")?.addEventListener("click",()=>window.print());
  el("refreshBtn")?.addEventListener("click",()=>loadAll().catch(e=>showWarn(e.message||String(e))));
  el("prevBtn")?.addEventListener("click",()=>moveKpi(-1));
  el("nextBtn")?.addEventListener("click",()=>moveKpi(1));

  el("companyFilter")?.addEventListener("change",()=>{
    localStorage.setItem(COMPANY_KEY,el("companyFilter").value||"");
    loadAll().catch(e=>showWarn(e.message||String(e)));
  });

  el("elementFilter")?.addEventListener("change",()=>{
    renderKpiFilter();
    loadPresentation().catch(e=>showWarn(e.message||String(e)));
  });

  el("kpiFilter")?.addEventListener("change",()=>{
    loadPresentation().catch(e=>showWarn(e.message||String(e)));
  });
}

async function loadAll(){
  await loadKpis();
  await loadPresentation();
}

async function init(){
  try{
    bind();

    const auth=await window.AUTH.setupAuthButtons({logoutBtnId:"logoutBtn"});
    PROFILE=auth?.profile||null;

    if(el("subLine")){
      el("subLine").textContent=PROFILE?.username
        ? `${PROFILE.username} · ${PROFILE.role}`
        : "TMSA KPI Audit Presentation";
    }

    await setupCompanyFilter();
    await loadAll();
  }catch(e){
    showWarn(e.message||String(e));
    if(el("subLine"))el("subLine").textContent="Not ready.";
  }
}

init();
