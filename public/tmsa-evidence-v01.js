// public/tmsa-evidence-v01.js
// C.S.V. BEACON - TMSA Evidence Register v01

const BUILD = "tmsa_evidence_register_v01_20260610";
const sb = window.AUTH.ensureSupabase();
const TMSA_EVIDENCE_COMPANY_KEY = "csvb_tmsa_evidence_selected_company_id";

let PROFILE = null;
let COMPANIES = [];
let ROWS = [];
let CURRENT = null;

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

  window.scrollTo({top:0,behavior:"smooth"});
}

async function saveEvidence(){
  clearMessages();

  const {data,error}=await sb.rpc("csvb_tmsa_save_evidence",payload());
  if(error) throw error;

  showOk(`Evidence record saved. ID: ${data}`);
  clearForm();
  await loadEvidence();
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
  await loadEvidence();
}

async function loadEvidence(){
  clearMessages();

  const {data,error}=await sb.rpc("csvb_tmsa_evidence_for_me",{
    p_company_id: selectedCompanyId(),
    p_search: el("searchInput").value || null,
    p_include_inactive: el("includeInactive").checked
  });

  if(error) throw error;

  ROWS=data||[];
  renderRows();

  window.CSVB_TMSA_EVIDENCE_REGISTER={
    build: BUILD,
    loaded: true,
    row_count: ROWS.length,
    selected_company_id: selectedCompanyId(),
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
          ${row.is_active===false
            ? `<button class="btn secondary" type="button" data-reactivate-id="${esc(row.id)}">Reactivate</button>`
            : `<button class="btn danger" type="button" data-deactivate-id="${esc(row.id)}">Deactivate</button>`
          }
        </div>
      </td>
    </tr>`;
  }).join("");
}

function bind(){
  el("logoutBtn")?.addEventListener("click",async()=>window.AUTH.logout());
  el("newBtn")?.addEventListener("click",clearForm);
  el("clearBtn")?.addEventListener("click",clearForm);
  el("saveBtn")?.addEventListener("click",()=>saveEvidence().catch(e=>showWarn(e.message||String(e))));
  el("refreshBtn")?.addEventListener("click",()=>loadEvidence().catch(e=>showWarn(e.message||String(e))));
  el("searchInput")?.addEventListener("input",()=>loadEvidence().catch(e=>showWarn(e.message||String(e))));
  el("includeInactive")?.addEventListener("change",()=>loadEvidence().catch(e=>showWarn(e.message||String(e))));
  el("companyFilter")?.addEventListener("change",()=>{
    localStorage.setItem(TMSA_EVIDENCE_COMPANY_KEY,el("companyFilter").value||"");
    loadEvidence().catch(e=>showWarn(e.message||String(e)));
  });

  el("evidenceBody")?.addEventListener("click",e=>{
    const edit=e.target.closest("button[data-edit-id]");
    const deact=e.target.closest("button[data-deactivate-id]");
    const react=e.target.closest("button[data-reactivate-id]");

    if(edit){
      const row=ROWS.find(r=>String(r.id)===String(edit.dataset.editId));
      if(row)openEdit(row);
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
    await loadEvidence();
  }catch(e){
    showWarn(e.message||String(e));
    if(el("subLine"))el("subLine").textContent="Not ready.";
  }
}

init();
