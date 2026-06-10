// public/tmsa-kpi-config-import-v01.js
// C.S.V. BEACON - TMSA Bulk KPI Configuration Import v01

const BUILD = "tmsa_kpi_config_import_v01_20260610";
const sb = window.AUTH.ensureSupabase();
const COMPANY_KEY = "csvb_tmsa_config_import_selected_company_id";

let PROFILE = null;
let COMPANIES = [];
let TEMPLATE = [];
let PREVIEW = [];

const EXPORT_COLUMNS = [
  "element_code",
  "kpi_code",
  "kpi_id",
  "coverage_status",
  "claimed_level",
  "target_level",
  "input_method",
  "readiness_status",
  "company_response",
  "sms_reference",
  "forms_records",
  "owner_department",
  "evidence_strength",
  "oil_major_sensitivity",
  "gap_summary",
  "action_required",
  "internal_remarks",
  "audit_answer_summary",
  "evidence_to_present",
  "weakness_to_avoid",
  "responsible_presenter",
  "measurement_unit",
  "measurement_frequency",
  "metric_direction",
  "target_value",
  "actual_value",
  "minimum_acceptable_value",
  "maximum_acceptable_value",
  "green_threshold",
  "amber_threshold",
  "red_threshold",
  "last_measured_at",
  "last_reviewed_at",
  "next_review_due"
];

function el(id){return document.getElementById(id)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function showWarn(msg){const n=el("warnBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function showOk(msg){const n=el("okBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function clearMessages(){showWarn("");showOk("")}
function isPlatformRole(role){return role==="super_admin" || role==="platform_owner"}
function label(v){return String(v||"-").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function val(v){return v===null||v===undefined?"":String(v)}
function companyId(){
  const n=el("companyFilter");
  if(n && n.style.display!=="none" && n.value) return n.value;
  return null;
}

function csvEscape(v){
  const s=val(v);
  if(/[",\n\r]/.test(s)) return `"${s.replaceAll('"','""')}"`;
  return s;
}

function toCsv(rows){
  const lines=[EXPORT_COLUMNS.join(",")];
  rows.forEach(r=>{
    lines.push(EXPORT_COLUMNS.map(c=>csvEscape(r[c])).join(","));
  });
  return lines.join("\n");
}

function download(filename, content, type="text/plain"){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseCsv(text){
  const rows=[];
  let row=[];
  let cell="";
  let inQuotes=false;

  const src=String(text||"").replace(/^\uFEFF/,"");

  for(let i=0;i<src.length;i++){
    const ch=src[i];
    const next=src[i+1];

    if(inQuotes){
      if(ch==='"' && next==='"'){
        cell+='"';
        i++;
      }else if(ch==='"'){
        inQuotes=false;
      }else{
        cell+=ch;
      }
    }else{
      if(ch==='"'){
        inQuotes=true;
      }else if(ch===","){
        row.push(cell);
        cell="";
      }else if(ch==="\n"){
        row.push(cell);
        rows.push(row);
        row=[];
        cell="";
      }else if(ch==="\r"){
        // ignore CR
      }else{
        cell+=ch;
      }
    }
  }

  row.push(cell);
  if(row.length>1 || row.some(x=>String(x).trim()!=="")) rows.push(row);

  if(!rows.length)return [];

  const headers=rows[0].map(h=>String(h||"").trim());
  return rows.slice(1)
    .filter(r=>r.some(c=>String(c||"").trim()!==""))
    .map(r=>{
      const obj={};
      headers.forEach((h,idx)=>{
        if(h)obj[h]=r[idx] ?? "";
      });
      return obj;
    });
}

function parsePaste(){
  const raw=String(el("pasteBox").value||"").trim();
  if(!raw)throw new Error("Paste box is empty.");

  if(raw.startsWith("[") || raw.startsWith("{")){
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed))return parsed;
    if(Array.isArray(parsed.rows))return parsed.rows;
    throw new Error("JSON must be an array or an object containing rows: [].");
  }

  return parseCsv(raw);
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

async function loadTemplate(){
  clearMessages();

  const {data,error}=await sb.rpc("csvb_tmsa_kpi_configuration_import_template_for_me",{
    p_company_id: companyId()
  });

  if(error)throw error;

  TEMPLATE=data||[];
  PREVIEW=[];
  renderTemplate();

  el("templateCountPill").textContent=`${TEMPLATE.length} KPI${TEMPLATE.length===1?"":"s"}`;

  window.CSVB_TMSA_KPI_CONFIG_IMPORT={
    build: BUILD,
    loaded: true,
    template_count: TEMPLATE.length,
    preview_count: 0,
    selected_company_id: companyId(),
    profile: PROFILE
  };
}

function filteredTemplate(){
  const q=String(el("templateSearch").value||"").trim().toLowerCase();
  if(!q)return TEMPLATE;
  return TEMPLATE.filter(r=>[
    r.element_code,
    r.element_title,
    r.kpi_code,
    r.kpi_statement,
    r.input_method,
    r.readiness_status,
    r.audit_answer_summary,
    r.evidence_to_present,
    r.owner_department,
    r.responsible_presenter
  ].some(x=>String(x||"").toLowerCase().includes(q)));
}

function renderTemplate(rows=null){
  const body=el("templateBody");
  const data=rows || filteredTemplate();
  el("previewCountPill").textContent=`${rows?rows.length:0} preview row${rows&&rows.length===1?"":"s"}`;

  if(!data.length){
    body.innerHTML=`<tr><td colspan="7">No rows.</td></tr>`;
    return;
  }

  body.innerHTML=data.slice(0,250).map(r=>{
    return `<tr>
      <td><strong>${esc(r.element_code||"-")}</strong><div class="small">${esc(r.element_title||"")}</div></td>
      <td><strong>${esc(r.kpi_code||"-")}</strong><div class="small">${esc(r.kpi_id||"")}</div></td>
      <td>${esc(label(r.input_method||"narrative"))}<div class="small">${esc(label(r.readiness_status||"not_assessed"))}</div></td>
      <td>Claimed: ${esc(r.claimed_level||"-")}<br>Target: ${esc(r.target_level||"-")}</td>
      <td><div class="small"><strong>Answer:</strong> ${esc(r.audit_answer_summary||"")}</div><div class="small"><strong>Evidence:</strong> ${esc(r.evidence_to_present||"")}</div></td>
      <td>Target: ${esc(r.target_value||"-")} ${esc(r.measurement_unit||"")}<br>Actual: ${esc(r.actual_value||"-")} ${esc(r.measurement_unit||"")}</td>
      <td>${esc(r.owner_department||"-")}<div class="small">${esc(r.responsible_presenter||"")}</div><div class="small">Next: ${esc(r.next_review_due||"-")}</div></td>
    </tr>`;
  }).join("");
}

function previewPaste(){
  clearMessages();
  const rows=parsePaste();
  PREVIEW=rows;
  renderTemplate(PREVIEW);
  el("previewCountPill").textContent=`${PREVIEW.length} preview row${PREVIEW.length===1?"":"s"}`;

  window.CSVB_TMSA_KPI_CONFIG_IMPORT={
    ...(window.CSVB_TMSA_KPI_CONFIG_IMPORT||{}),
    preview_count: PREVIEW.length
  };

  showOk(`Preview loaded: ${PREVIEW.length} row(s). Nothing imported yet.`);
}

async function importConfig(){
  clearMessages();

  if(el("confirmText").value !== "IMPORT"){
    throw new Error('Type IMPORT in the confirmation field before importing.');
  }

  const rows=PREVIEW.length ? PREVIEW : parsePaste();

  if(!rows.length)throw new Error("No rows to import.");

  const ok=confirm(`Import ${rows.length} KPI configuration row(s)? This will update existing company KPI handling records.`);
  if(!ok)return;

  const {data,error}=await sb.rpc("csvb_tmsa_import_kpi_configuration",{
    p_rows: rows,
    p_company_id: companyId(),
    p_source_label: el("sourceLabel").value || null,
    p_import_note: el("importNote").value || null
  });

  if(error)throw error;

  const result=(data||[])[0]||{};
  const msg=[
    `Import batch: ${result.batch_id || "-"}`,
    `Total rows: ${result.total_rows ?? rows.length}`,
    `Success: ${result.success_count ?? "-"}`,
    `Errors: ${result.error_count ?? "-"}`
  ].join("\n");

  if(Number(result.error_count||0)>0){
    showWarn(msg+"\n\nErrors:\n"+JSON.stringify(result.errors||[],null,2));
  }else{
    showOk(msg);
  }

  el("confirmText").value="";
  await loadTemplate();
}

function bind(){
  el("logoutBtn")?.addEventListener("click",async()=>window.AUTH.logout());
  el("refreshBtn")?.addEventListener("click",()=>loadTemplate().catch(e=>showWarn(e.message||String(e))));
  el("templateSearch")?.addEventListener("input",()=>renderTemplate());
  el("previewBtn")?.addEventListener("click",()=>{try{previewPaste()}catch(e){showWarn(e.message||String(e))}});
  el("importBtn")?.addEventListener("click",()=>importConfig().catch(e=>showWarn(e.message||String(e))));

  el("downloadCsvBtn")?.addEventListener("click",()=>{
    download("tmsa_kpi_configuration_template.csv",toCsv(TEMPLATE),"text/csv");
  });

  el("downloadJsonBtn")?.addEventListener("click",()=>{
    download("tmsa_kpi_configuration_template.json",JSON.stringify(TEMPLATE.map(r=>{
      const o={};
      EXPORT_COLUMNS.forEach(c=>o[c]=r[c] ?? "");
      return o;
    }),null,2),"application/json");
  });

  el("companyFilter")?.addEventListener("change",()=>{
    localStorage.setItem(COMPANY_KEY,el("companyFilter").value||"");
    loadTemplate().catch(e=>showWarn(e.message||String(e)));
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
        : "TMSA Bulk KPI Configuration Import";
    }

    await setupCompanyFilter();
    await loadTemplate();
  }catch(e){
    showWarn(e.message||String(e));
    if(el("subLine"))el("subLine").textContent="Not ready.";
  }
}

init();
