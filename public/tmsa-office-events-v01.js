// public/tmsa-office-events-v01.js
// C.S.V. BEACON - TMSA Office Inspection Events v01

const BUILD = "tmsa_office_events_v01_20260610";
const sb = window.AUTH.ensureSupabase();
const COMPANY_KEY = "csvb_tmsa_office_events_selected_company_id";

let PROFILE = null;
let COMPANIES = [];
let EVENTS = [];
let ITEMS = [];
let KPI_ROWS = [];
let EVIDENCE_ROWS = [];
let CURRENT_EVENT = null;
let CURRENT_ITEM = null;

function el(id){return document.getElementById(id)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function showWarn(msg){const n=el("warnBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function showOk(msg){const n=el("okBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function clearMessages(){showWarn("");showOk("")}
function isPlatformRole(role){return role==="super_admin" || role==="platform_owner"}
function label(v){return String(v||"-").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function date(v){return v?String(v).slice(0,10):"-"}
function dtLocal(v){return v?String(v).slice(0,16):""}
function value(id){return el(id)?.value || ""}
function nullIfEmpty(v){const s=String(v??"").trim(); return s?s:null}
function companyId(){
  const n=el("companyFilter");
  if(n && n.style.display!=="none" && n.value) return n.value;
  return null;
}

function pill(text, cls=""){
  return `<span class="pill ${cls}">${esc(text)}</span>`;
}

function statusClass(status){
  if(status==="completed" || status==="closed" || status==="satisfactory")return "green";
  if(status==="in_progress" || status==="observations" || status==="partly_ready")return "amber";
  if(status==="cancelled" || status==="archived" || status==="major_gaps" || status==="not_ready" || status==="critical")return "red";
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

async function loadReferenceData(){
  const [kpis, evidence] = await Promise.all([
    sb.rpc("csvb_tmsa_kpi_matrix_for_me",{
      p_element_code: null,
      p_search: null,
      p_company_id: companyId()
    }),
    sb.rpc("csvb_tmsa_evidence_for_me",{
      p_company_id: companyId(),
      p_search: null,
      p_include_inactive: false
    })
  ]);

  if(kpis.error)throw kpis.error;
  if(evidence.error)throw evidence.error;

  KPI_ROWS=kpis.data||[];
  EVIDENCE_ROWS=evidence.data||[];

  renderKpiSelect();
  renderEvidenceSelect();
}

function renderKpiSelect(){
  const n=el("kpiSelect");
  if(!n)return;
  n.innerHTML=`<option value="">No KPI link</option>`+KPI_ROWS.map(r=>{
    return `<option value="${esc(r.kpi_id)}">${esc(r.kpi_code)} · L${esc(r.kpi_level)} · ${esc(r.element_title||"")}</option>`;
  }).join("");
}

function renderEvidenceSelect(){
  const n=el("evidenceSelect");
  if(!n)return;
  n.innerHTML=`<option value="">No evidence link</option>`+EVIDENCE_ROWS.map(r=>{
    return `<option value="${esc(r.id)}">${esc(r.evidence_title)}${r.document_reference?` · ${esc(r.document_reference)}`:""}</option>`;
  }).join("");
}

function clearEventForm(){
  CURRENT_EVENT=null;
  el("eventFormTitle").textContent="New TMSA Office Event";

  [
    "eventTitle","oilMajorName","inspectionReference","officeLocation","scheduledDate",
    "startDatetime","endDatetime","leadInspector","companyLead","scopeSummary","readinessSummary"
  ].forEach(id=>{el(id).value="";});

  el("inspectionType").value="oil_major_tmsa";
  el("eventStatus").value="planned";
  el("overallResult").value="not_assessed";
}

function openEvent(row){
  CURRENT_EVENT=row;
  el("eventFormTitle").textContent="Edit TMSA Office Event";

  el("eventTitle").value=row.event_title||"";
  el("oilMajorName").value=row.oil_major_name||"";
  el("inspectionType").value=row.inspection_type||"oil_major_tmsa";
  el("inspectionReference").value=row.inspection_reference||"";
  el("officeLocation").value=row.office_location||"";
  el("scheduledDate").value=row.scheduled_date?String(row.scheduled_date).slice(0,10):"";
  el("startDatetime").value=dtLocal(row.start_datetime);
  el("endDatetime").value=dtLocal(row.end_datetime);
  el("leadInspector").value=row.lead_inspector||"";
  el("companyLead").value=row.company_lead||"";
  el("eventStatus").value=row.status||"planned";
  el("overallResult").value=row.overall_result||"not_assessed";
  el("scopeSummary").value=row.scope_summary||"";
  el("readinessSummary").value=row.readiness_summary||"";

  el("selectedEventPill").textContent=`Selected: ${row.event_title}`;
  clearItemForm();
  loadItems().catch(e=>showWarn(e.message||String(e)));
}

function eventPayload(){
  if(!nullIfEmpty(value("eventTitle")))throw new Error("Event title is required.");

  return {
    p_event_id: CURRENT_EVENT?.id || null,
    p_company_id: CURRENT_EVENT?.company_id || companyId(),
    p_event_title: value("eventTitle"),
    p_oil_major_name: value("oilMajorName") || null,
    p_inspection_type: value("inspectionType"),
    p_inspection_reference: value("inspectionReference") || null,
    p_office_location: value("officeLocation") || null,
    p_scheduled_date: value("scheduledDate") || null,
    p_start_datetime: value("startDatetime") || null,
    p_end_datetime: value("endDatetime") || null,
    p_lead_inspector: value("leadInspector") || null,
    p_company_lead: value("companyLead") || null,
    p_status: value("eventStatus"),
    p_overall_result: value("overallResult"),
    p_scope_summary: value("scopeSummary") || null,
    p_readiness_summary: value("readinessSummary") || null
  };
}

async function saveEvent(){
  clearMessages();

  const {data,error}=await sb.rpc("csvb_tmsa_save_office_event",eventPayload());
  if(error)throw error;

  showOk(`Event saved. ID: ${data}`);
  await loadEvents();
  const row=EVENTS.find(e=>String(e.id)===String(data));
  if(row)openEvent(row);
}

async function loadEvents(){
  clearMessages();

  const {data,error}=await sb.rpc("csvb_tmsa_office_events_for_me",{
    p_company_id: companyId(),
    p_status: value("statusFilter") || null,
    p_search: value("eventSearch") || null,
    p_include_archived: !!el("includeArchived").checked
  });

  if(error)throw error;

  EVENTS=data||[];
  renderEvents();
  updateGlobalState();
}

function renderEvents(){
  const body=el("eventsBody");
  el("eventCountPill").textContent=`${EVENTS.length} event${EVENTS.length===1?"":"s"}`;

  if(!EVENTS.length){
    body.innerHTML=`<tr><td colspan="6">No TMSA office events found.</td></tr>`;
    return;
  }

  body.innerHTML=EVENTS.map(row=>{
    const selected=CURRENT_EVENT && String(CURRENT_EVENT.id)===String(row.id);
    return `<tr class="${selected?"selected":""}">
      <td>
        <strong>${esc(row.event_title)}</strong>
        <div class="small">${esc(row.company_name||"")}</div>
        <div class="small">${esc(row.inspection_reference||"")}</div>
      </td>
      <td>${esc(row.oil_major_name||"-")}<div class="small">${esc(label(row.inspection_type))}</div></td>
      <td>${date(row.scheduled_date)}<div class="small">${esc(row.office_location||"")}</div></td>
      <td>${pill(label(row.status),statusClass(row.status))}<br>${pill(label(row.overall_result),statusClass(row.overall_result))}</td>
      <td>
        ${esc(row.item_count||0)} total<br>
        <span class="small">${esc(row.open_item_count||0)} open · ${esc(row.finding_count||0)} findings · ${esc(row.action_count||0)} actions</span>
      </td>
      <td><button class="btn secondary" type="button" data-open-event="${esc(row.id)}">Open</button></td>
    </tr>`;
  }).join("");
}

async function loadItems(){
  if(!CURRENT_EVENT){
    ITEMS=[];
    renderItems();
    return;
  }

  const {data,error}=await sb.rpc("csvb_tmsa_office_event_items_for_me",{
    p_event_id: CURRENT_EVENT.id
  });

  if(error)throw error;

  ITEMS=data||[];
  renderItems();
  updateGlobalState();
}

function clearItemForm(){
  CURRENT_ITEM=null;
  el("itemFormTitle").textContent="New Event Item";

  el("itemType").value="question";
  el("itemStatus").value="open";
  el("severity").value="medium";
  el("sortOrder").value="1000";
  el("kpiSelect").value="";
  el("evidenceSelect").value="";

  [
    "questionText","documentRequested","responseSummary","findingText",
    "actionRequired","actionOwner","dueDate","closureNotes"
  ].forEach(id=>{el(id).value="";});
}

function openItem(row){
  CURRENT_ITEM=row;
  el("itemFormTitle").textContent="Edit Event Item";

  el("itemType").value=row.item_type||"question";
  el("itemStatus").value=row.item_status||"open";
  el("severity").value=row.severity||"medium";
  el("sortOrder").value=row.sort_order ?? 1000;
  el("kpiSelect").value=row.kpi_id||"";
  el("evidenceSelect").value=row.evidence_id||"";
  el("questionText").value=row.question_text||"";
  el("documentRequested").value=row.document_requested||"";
  el("responseSummary").value=row.response_summary||"";
  el("findingText").value=row.finding_text||"";
  el("actionRequired").value=row.action_required||"";
  el("actionOwner").value=row.action_owner||"";
  el("dueDate").value=row.due_date?String(row.due_date).slice(0,10):"";
  el("closureNotes").value=row.closure_notes||"";
}

function itemPayload(){
  if(!CURRENT_EVENT)throw new Error("Select an event first.");

  return {
    p_item_id: CURRENT_ITEM?.id || null,
    p_event_id: CURRENT_EVENT.id,
    p_element_id: null,
    p_kpi_id: value("kpiSelect") || null,
    p_evidence_id: value("evidenceSelect") || null,
    p_item_type: value("itemType"),
    p_item_status: value("itemStatus"),
    p_severity: value("severity"),
    p_question_text: value("questionText") || null,
    p_document_requested: value("documentRequested") || null,
    p_response_summary: value("responseSummary") || null,
    p_finding_text: value("findingText") || null,
    p_action_required: value("actionRequired") || null,
    p_action_owner: value("actionOwner") || null,
    p_due_date: value("dueDate") || null,
    p_closed_at: null,
    p_closure_notes: value("closureNotes") || null,
    p_sort_order: value("sortOrder") ? Number(value("sortOrder")) : 1000
  };
}

async function saveItem(){
  clearMessages();

  const {data,error}=await sb.rpc("csvb_tmsa_save_office_event_item",itemPayload());
  if(error)throw error;

  showOk(`Event item saved. ID: ${data}`);
  clearItemForm();
  await loadItems();
  await loadEvents();
}

function renderItems(){
  const body=el("itemsBody");
  el("itemCountPill").textContent=`${ITEMS.length} item${ITEMS.length===1?"":"s"}`;

  if(!CURRENT_EVENT){
    body.innerHTML=`<tr><td colspan="5">Select an event.</td></tr>`;
    el("selectedEventPill").textContent="No event selected";
    return;
  }

  if(!ITEMS.length){
    body.innerHTML=`<tr><td colspan="5">No items recorded for this event yet.</td></tr>`;
    return;
  }

  body.innerHTML=ITEMS.map(row=>{
    const content=[
      row.question_text?`Q: ${esc(row.question_text)}`:"",
      row.document_requested?`Doc: ${esc(row.document_requested)}`:"",
      row.finding_text?`Finding: ${esc(row.finding_text)}`:"",
      row.response_summary?`Response: ${esc(row.response_summary)}`:""
    ].filter(Boolean).join("<br>")||"-";

    return `<tr>
      <td>${pill(label(row.item_type))}<br>${pill(label(row.item_status),statusClass(row.item_status))}<br>${pill(label(row.severity),statusClass(row.severity))}</td>
      <td>
        ${row.kpi_code?`<strong>${esc(row.kpi_code)}</strong><div class="small">Element ${esc(row.element_code||"")}</div>`:"-"}
        ${row.evidence_title?`<div class="small">Evidence: ${esc(row.evidence_title)}</div>`:""}
      </td>
      <td>${content}</td>
      <td>
        ${esc(row.action_required||"-")}
        <div class="small">${row.action_owner?`Owner: ${esc(row.action_owner)}`:""}</div>
        <div class="small">${row.due_date?`Due: ${date(row.due_date)}`:""}</div>
      </td>
      <td><button class="btn secondary" type="button" data-open-item="${esc(row.id)}">Edit</button></td>
    </tr>`;
  }).join("");
}

function updateGlobalState(){
  window.CSVB_TMSA_OFFICE_EVENTS={
    build: BUILD,
    loaded: true,
    event_count: EVENTS.length,
    item_count: ITEMS.length,
    kpi_count: KPI_ROWS.length,
    evidence_count: EVIDENCE_ROWS.length,
    selected_event_id: CURRENT_EVENT?.id || null,
    profile: PROFILE
  };
}

function bind(){
  el("logoutBtn")?.addEventListener("click",async()=>window.AUTH.logout());

  el("newEventBtn")?.addEventListener("click",()=>{
    clearEventForm();
    CURRENT_EVENT=null;
    ITEMS=[];
    renderItems();
    updateGlobalState();
  });

  el("saveEventBtn")?.addEventListener("click",()=>saveEvent().catch(e=>showWarn(e.message||String(e))));
  el("refreshBtn")?.addEventListener("click",()=>loadAll().catch(e=>showWarn(e.message||String(e))));
  el("newItemBtn")?.addEventListener("click",clearItemForm);
  el("saveItemBtn")?.addEventListener("click",()=>saveItem().catch(e=>showWarn(e.message||String(e))));

  ["statusFilter","eventSearch","includeArchived"].forEach(id=>{
    el(id)?.addEventListener("input",()=>loadEvents().catch(e=>showWarn(e.message||String(e))));
    el(id)?.addEventListener("change",()=>loadEvents().catch(e=>showWarn(e.message||String(e))));
  });

  el("companyFilter")?.addEventListener("change",()=>{
    localStorage.setItem(COMPANY_KEY,el("companyFilter").value||"");
    CURRENT_EVENT=null;
    clearEventForm();
    clearItemForm();
    loadAll().catch(e=>showWarn(e.message||String(e)));
  });

  el("eventsBody")?.addEventListener("click",e=>{
    const btn=e.target.closest("button[data-open-event]");
    if(!btn)return;
    const row=EVENTS.find(x=>String(x.id)===String(btn.dataset.openEvent));
    if(row)openEvent(row);
  });

  el("itemsBody")?.addEventListener("click",e=>{
    const btn=e.target.closest("button[data-open-item]");
    if(!btn)return;
    const row=ITEMS.find(x=>String(x.id)===String(btn.dataset.openItem));
    if(row)openItem(row);
  });
}

async function loadAll(){
  await loadReferenceData();
  await loadEvents();
  if(CURRENT_EVENT)await loadItems();
  else renderItems();
  updateGlobalState();
}

async function init(){
  try{
    bind();

    const auth=await window.AUTH.setupAuthButtons({logoutBtnId:"logoutBtn"});
    PROFILE=auth?.profile||null;

    if(el("subLine")){
      el("subLine").textContent=PROFILE?.username
        ? `${PROFILE.username} · ${PROFILE.role}`
        : "TMSA Office Inspection Events";
    }

    await setupCompanyFilter();
    await loadAll();
  }catch(e){
    showWarn(e.message||String(e));
    if(el("subLine"))el("subLine").textContent="Not ready.";
  }
}

init();
