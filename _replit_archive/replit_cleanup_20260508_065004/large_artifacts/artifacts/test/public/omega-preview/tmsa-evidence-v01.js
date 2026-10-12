// public/tmsa-evidence-v01.js
// C.S.V. BEACON - TMSA Evidence Register v02
// Adds Evidence ↔ KPI link management.

const BUILD = "tmsa_evidence_register_v02_20260610";
const sb = window.AUTH.ensureSupabase();
const TMSA_EVIDENCE_COMPANY_KEY = "csvb_tmsa_evidence_selected_company_id";

let PROFILE = null;
let COMPANIES = [];
let ROWS = [];
let KPI_ROWS = [];
let CURRENT = null;
let LINK_EVIDENCE = null;

function el(id){return document.getElementById(id)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function showWarn(msg){const n=el("warnBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function showOk(msg){const n=el("okBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function clearMessages(){showWarn("");showOk("")}
function isPlatformRole(role){return role==="super_admin" || role==="platform_owner"}
function label(v){return String(v||"-").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function date(v){return v?String(v).slice(0,10):"-"}

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
    showWarn("Could not load company selector: "+(error.message||String(error)));
    n.style.display="none";
    return;
  }

  COMPANIES=data||[];
  n.style.display="inline-block";
  n.innerHTML=`<option value="">All companies</option>`+COMPANIES.map(c=>{
    const text=c.company_name||c.short_name||c.company_code||c.id;
    return `<option value="${esc(c.id)}">${esc(text)}</option>`;
  }).join("");

  const saved=localStorage.getItem(TMSA_EVIDENCE_COMPANY_KEY)||"";
  if(saved && COMPANIES.some(c=>String(c.id)===String(saved))){
    n.value=saved;
  }else if(COMPANIES.length){
    n.value=COMPANIES[0].id;
    localStorage.setItem(TMSA_EVIDENCE_COMPANY_KEY,n.value);
  }
}

function evidenceStatusPill(row){
  if(row.is_active===false) return `<span class="pill off">Inactive</span>`;
  return `<span class="pill ready">Active</span>`;
}

function strengthPill(value){
  const v=String(value||"moderate");
  const cls=v==="oil_major_ready"||v==="strong"?"ready":v==="weak"?"off":"";
  return `<span class="pill ${cls}">${esc(label(v))}</span>`;
}

function payload(){
  const title=String(el("evidenceTitle").value||"").trim();
  if(!title) throw new Error("Evidence title is required.");

  return {
    p_evidence_id: CURRENT?.id || null,
    p_company_id: CURRENT?.company_id || selectedCompanyId() || null,
    p_evidence_title: title,
    p_evidence_type: el("evidenceType").value,
    p_document_reference: el("documentReference").value || null,
    p_sms_reference: el("smsReference").value || null,
    p_revision_no: el("revisionNo").value || null,
    p_revision_date: el("revisionDate").value || null,
    p_valid_from: el("validFrom").value || null,
    p_valid_until: el("validUntil").value || null,
    p_owner_department: el("ownerDepartment").value || null,
    p_storage_path: el("storagePath").value || null,
    p_file_name: el("fileName").value || null,
    p_file_type: el("fileType").value || null,
    p_evidence_strength: el("evidenceStrength").value,
    p_confidentiality_level: el("confidentialityLevel").value,
    p_remarks: el("remarks").value || null,
    p_is_active: CURRENT?.is_active !== false
  };
}

function clearForm(){
  CURRENT=null;
  el("formTitle").textContent="New Evidence Record";

  [
    "evidenceTitle",
    "documentReference",
    "smsReference",
    "revisionNo",
    "revisionDate",
    "validFrom",
    "validUntil",
    "ownerDepartment",
    "storagePath",
    "fileName",
    "fileType",
    "remarks"
  ].forEach(id=>{const n=el(id); if(n)n.value="";});

  el("evidenceType").value="sms_procedure";
  el("evidenceStrength").value="moderate";
  el("confidentialityLevel").value="internal";
}

function openEdit(row){
  CURRENT=row;
  el("formTitle").textContent="Edit Evidence Record";

  el("evidenceTitle").value=row.evidence_title||"";
  el("evidenceType").value=row.evidence_type||"sms_procedure";
  el("documentReference").value=row.document_reference||"";
  el("smsReference").value=row.sms_reference||"";
  el("revisionNo").value=row.revision_no||"";
  el("revisionDate").value=date(row.revision_date)==="-"?"":date(row.revision_date);
  el("validFrom").value=date(row.valid_from)==="-"?"":date(row.valid_from);
  el("validUntil").value=date(row.valid_until)==="-"?"":date(row.valid_until);
  el("ownerDepartment").value=row.owner_department||"";
  el("storagePath").value=row.storage_path||"";
  el("fileName").value=row.file_name||"";
  el("fileType").value=row.file_type||"";
  el("evidenceStrength").value=row.evidence_strength||"moderate";
  el("confidentialityLevel").value=row.confidentiality_level||"internal";
  el("remarks").value=row.remarks||"";

  openLinkPanel(row);
  window.scrollTo({top:0,behavior:"smooth"});
}

async function saveEvidence(){
  clearMessages();

  const {data,error}=await sb.rpc("csvb_tmsa_save_evidence",payload());
  if(error) throw error;

  showOk(`Evidence record saved. ID: ${data}`);
  clearForm();
  await loadAll();
}

async function setActive(row,isActive){
  clearMessages();

  const ok=confirm(`${isActive?"Reactivate":"Deactivate"} evidence record "${row.evidence_title}"?`);
  if(!ok)return;

  const {error}=await sb.rpc("csvb_tmsa_set_evidence_active",{
    p_evidence_id: row.id,
    p_is_active: !!isActive
  });

  if(error) throw error;

  showOk(`Evidence record ${isActive?"reactivated":"deactivated"}.`);
  await loadAll();
}

async function loadEvidence(){
  const {data,error}=await sb.rpc("csvb_tmsa_evidence_for_me",{
    p_company_id: selectedCompanyId(),
    p_search: el("searchInput").value || null,
    p_include_inactive: el("includeInactive").checked
  });

  if(error) throw error;

  ROWS=data||[];
  renderRows();

  if(LINK_EVIDENCE){
    const refreshed=ROWS.find(r=>String(r.id)===String(LINK_EVIDENCE.id));
    if(refreshed)openLinkPanel(refreshed);
    else clearLinkPanel();
  }
}

async function loadKpis(){
  const {data,error}=await sb.rpc("csvb_tmsa_kpi_matrix_for_me",{
    p_element_code: null,
    p_search: null,
    p_company_id: selectedCompanyId()
  });

  if(error) throw error;

  KPI_ROWS=data||[];
  renderLinkElementFilter();
  renderKpiSelect();
}

async function loadAll(){
  clearMessages();

  await loadKpis();
  await loadEvidence();

  window.CSVB_TMSA_EVIDENCE_REGISTER={
    build: BUILD,
    loaded: true,
    row_count: ROWS.length,
    kpi_count: KPI_ROWS.length,
    selected_company_id: selectedCompanyId(),
    link_evidence_id: LINK_EVIDENCE?.id || null,
    profile: PROFILE
  };
}

function renderRows(){
  const body=el("evidenceBody");
  if(!body)return;

  el("countPill").textContent=`${ROWS.length} record${ROWS.length===1?"":"s"}`;

  if(!ROWS.length){
    body.innerHTML=`<tr><td colspan="9">No evidence records found.</td></tr>`;
    return;
  }

  body.innerHTML=ROWS.map(row=>{
    const refs=[
      row.document_reference?`Doc: ${esc(row.document_reference)}`:"",
      row.sms_reference?`SMS: ${esc(row.sms_reference)}`:"",
      row.revision_no?`Rev: ${esc(row.revision_no)}`:""
    ].filter(Boolean).join("<br>")||"-";

    const validity=[
      row.revision_date?`Rev date: ${esc(date(row.revision_date))}`:"",
      row.valid_from?`From: ${esc(date(row.valid_from))}`:"",
      row.valid_until?`Until: ${esc(date(row.valid_until))}`:""
    ].filter(Boolean).join("<br>")||"-";

    const fileLine=[
      row.file_name?`File: ${esc(row.file_name)}`:"",
      row.file_type?`Type: ${esc(row.file_type)}`:"",
      row.storage_path?`Path: ${esc(row.storage_path)}`:""
    ].filter(Boolean).join("<br>");

    const kpis=Array.isArray(row.linked_kpis)
      ? row.linked_kpis.map(k=>esc(k.kpi_code)).join(", ")
      : "";

    return `<tr>
      <td>${evidenceStatusPill(row)}</td>
      <td>
        <strong>${esc(row.evidence_title||"-")}</strong>
        <div class="small">${esc(row.company_name||"")}</div>
        ${fileLine?`<div class="small">${fileLine}</div>`:""}
      </td>
      <td>${esc(label(row.evidence_type))}<div class="small">${esc(label(row.confidentiality_level))}</div></td>
      <td>${refs}</td>
      <td>${validity}</td>
      <td>${strengthPill(row.evidence_strength)}</td>
      <td>${esc(row.linked_kpi_count||0)} linked<div class="small">${kpis||""}</div></td>
      <td>${esc(row.owner_department||"-")}<div class="small">${row.uploaded_by_username?`Uploaded by ${esc(row.uploaded_by_username)}`:""}</div></td>
      <td>
        <div class="actions">
          <button class="btn secondary" type="button" data-edit-id="${esc(row.id)}">Edit</button>
          <button class="btn secondary" type="button" data-link-id="${esc(row.id)}">Link KPI</button>
          ${row.is_active===false
            ? `<button class="btn secondary" type="button" data-reactivate-id="${esc(row.id)}">Reactivate</button>`
            : `<button class="btn danger" type="button" data-deactivate-id="${esc(row.id)}">Deactivate</button>`
          }
        </div>
      </td>
    </tr>`;
  }).join("");
}

function renderLinkElementFilter(){
  const n=el("linkElementFilter");
  if(!n)return;

  const existing=n.value||"";
  const seen=new Set();
  const opts=[];

  KPI_ROWS.forEach(r=>{
    const code=String(r.element_code||"");
    if(!code || seen.has(code))return;
    seen.add(code);
    opts.push({code,title:r.element_title||""});
  });

  n.innerHTML=`<option value="">All elements</option>`+opts.map(x=>{
    return `<option value="${esc(x.code)}">${esc(x.code)} - ${esc(x.title)}</option>`;
  }).join("");

  n.value=existing;
}

function renderKpiSelect(){
  const n=el("linkKpiId");
  if(!n)return;

  const element=String(el("linkElementFilter")?.value||"").trim();
  const rows=KPI_ROWS.filter(r=>!element || r.element_code===element);

  n.innerHTML=`<option value="">Select KPI...</option>`+rows.map(r=>{
    return `<option value="${esc(r.kpi_id)}">${esc(r.kpi_code)} · L${esc(r.kpi_level)} · ${esc(r.element_title)}</option>`;
  }).join("");
}

function renderLinkedKpis(){
  const list=el("linkedKpisList");
  if(!list)return;

  if(!LINK_EVIDENCE){
    list.innerHTML=`<div class="small">No evidence selected.</div>`;
    return;
  }

  const links=Array.isArray(LINK_EVIDENCE.linked_kpis)?LINK_EVIDENCE.linked_kpis:[];

  if(!links.length){
    list.innerHTML=`<div class="small">No KPIs linked to this evidence record yet.</div>`;
    return;
  }

  list.innerHTML=links.map(l=>{
    return `<div class="linkItem">
      <div class="linkItemText">
        <strong>${esc(l.kpi_code||"-")}</strong>
        ${l.element_code?` · Element ${esc(l.element_code)}`:""}
        ${l.kpi_level?` · L${esc(l.kpi_level)}`:""}
        ${l.is_primary?` · Primary`:""}
        ${l.link_note?`<div>${esc(l.link_note)}</div>`:""}
      </div>
      <button class="btn danger" type="button" data-unlink-id="${esc(l.link_id)}">Unlink</button>
    </div>`;
  }).join("");
}

function openLinkPanel(row){
  LINK_EVIDENCE=row;
  el("linkEvidenceTitle").textContent=`Selected evidence: ${row.evidence_title}`;
  renderLinkedKpis();

  window.CSVB_TMSA_EVIDENCE_REGISTER={
    ...(window.CSVB_TMSA_EVIDENCE_REGISTER||{}),
    link_evidence_id: row.id,
    selected_linked_kpi_count: Number(row.linked_kpi_count||0)
  };
}

function clearLinkPanel(){
  LINK_EVIDENCE=null;
  el("linkEvidenceTitle").textContent="No evidence selected.";
  el("linkNote").value="";
  el("linkPrimary").checked=false;
  renderLinkedKpis();
}

async function linkSelectedKpi(){
  clearMessages();

  if(!LINK_EVIDENCE)throw new Error("Select an evidence record first.");
  if(!el("linkKpiId").value)throw new Error("Select a KPI to link.");

  const {data,error}=await sb.rpc("csvb_tmsa_link_evidence_to_kpi",{
    p_evidence_id: LINK_EVIDENCE.id,
    p_kpi_id: el("linkKpiId").value,
    p_company_id: LINK_EVIDENCE.company_id || selectedCompanyId(),
    p_link_note: el("linkNote").value || null,
    p_is_primary: el("linkPrimary").checked
  });

  if(error)throw error;

  showOk(`Evidence linked to KPI. Link ID: ${data}`);
  el("linkNote").value="";
  el("linkPrimary").checked=false;

  await loadAll();
}

async function unlinkKpi(linkId){
  clearMessages();

  const ok=confirm("Remove this evidence/KPI link?");
  if(!ok)return;

  const {error}=await sb.rpc("csvb_tmsa_unlink_evidence_from_kpi",{
    p_link_id: linkId
  });

  if(error)throw error;

  showOk("Evidence/KPI link removed.");
  await loadAll();
}

function bind(){
  el("logoutBtn")?.addEventListener("click",async()=>window.AUTH.logout());
  el("newBtn")?.addEventListener("click",clearForm);
  el("clearBtn")?.addEventListener("click",clearForm);
  el("saveBtn")?.addEventListener("click",()=>saveEvidence().catch(e=>showWarn(e.message||String(e))));
  el("refreshBtn")?.addEventListener("click",()=>loadAll().catch(e=>showWarn(e.message||String(e))));
  el("searchInput")?.addEventListener("input",()=>loadEvidence().catch(e=>showWarn(e.message||String(e))));
  el("includeInactive")?.addEventListener("change",()=>loadEvidence().catch(e=>showWarn(e.message||String(e))));
  el("companyFilter")?.addEventListener("change",()=>{
    localStorage.setItem(TMSA_EVIDENCE_COMPANY_KEY,el("companyFilter").value||"");
    clearLinkPanel();
    loadAll().catch(e=>showWarn(e.message||String(e)));
  });

  el("linkElementFilter")?.addEventListener("change",renderKpiSelect);
  el("linkKpiBtn")?.addEventListener("click",()=>linkSelectedKpi().catch(e=>showWarn(e.message||String(e))));
  el("clearLinkBtn")?.addEventListener("click",clearLinkPanel);

  el("linkedKpisList")?.addEventListener("click",e=>{
    const btn=e.target.closest("button[data-unlink-id]");
    if(!btn)return;
    unlinkKpi(btn.dataset.unlinkId||"").catch(err=>showWarn(err.message||String(err)));
  });

  el("evidenceBody")?.addEventListener("click",e=>{
    const edit=e.target.closest("button[data-edit-id]");
    const link=e.target.closest("button[data-link-id]");
    const deact=e.target.closest("button[data-deactivate-id]");
    const react=e.target.closest("button[data-reactivate-id]");

    if(edit){
      const row=ROWS.find(r=>String(r.id)===String(edit.dataset.editId));
      if(row)openEdit(row);
    }

    if(link){
      const row=ROWS.find(r=>String(r.id)===String(link.dataset.linkId));
      if(row)openLinkPanel(row);
    }

    if(deact){
      const row=ROWS.find(r=>String(r.id)===String(deact.dataset.deactivateId));
      if(row)setActive(row,false).catch(err=>showWarn(err.message||String(err)));
    }

    if(react){
      const row=ROWS.find(r=>String(r.id)===String(react.dataset.reactivateId));
      if(row)setActive(row,true).catch(err=>showWarn(err.message||String(err)));
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
        : "TMSA Evidence Register";
    }

    await setupCompanyFilter();
    await loadAll();
  }catch(e){
    showWarn(e.message||String(e));
    if(el("subLine"))el("subLine").textContent="Not ready.";
  }
}

init();
