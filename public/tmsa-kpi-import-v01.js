// public/tmsa-kpi-import-v01.js
// C.S.V. BEACON - TMSA KPI Exact Text Import v01

const BUILD = "tmsa_kpi_import_v01_20260602";
const sb = window.AUTH.ensureSupabase();

let PROFILE = null;
let TEMPLATE = [];

function el(id){return document.getElementById(id)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function showWarn(msg){const n=el("warnBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function showOk(msg){const n=el("okBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function clearMessages(){showWarn("");showOk("")}
function isAdmin(){return ["super_admin","platform_owner"].includes(String(PROFILE?.role||""))}

function renderTemplate(){
  const body=el("templateBody");
  if(!body)return;

  el("templateCount").textContent=`${TEMPLATE.length} skeleton rows`;

  if(!TEMPLATE.length){
    body.innerHTML=`<tr><td colspan="5">No template rows loaded.</td></tr>`;
    return;
  }

  body.innerHTML=TEMPLATE.slice(0,300).map(r=>{
    return `<tr>
      <td><strong>${esc(r.element_code)}</strong><div class="small">${esc(r.element_title)}</div></td>
      <td class="mono">${esc(r.kpi_code)}</td>
      <td>L${esc(r.kpi_level)}</td>
      <td>${esc(r.current_import_status||"-")}</td>
      <td><div class="small">${esc(r.current_kpi_statement||"-")}</div></td>
    </tr>`;
  }).join("");

  if(TEMPLATE.length>300){
    body.innerHTML+=`<tr><td colspan="5">Showing first 300 of ${esc(TEMPLATE.length)} rows.</td></tr>`;
  }
}

async function loadTemplate(){
  clearMessages();

  const {data,error}=await sb.rpc("csvb_tmsa_kpi_import_template_for_me");
  if(error)throw error;

  TEMPLATE=data||[];
  renderTemplate();

  window.CSVB_TMSA_KPI_IMPORT={
    build:BUILD,
    loaded:true,
    template_count:TEMPLATE.length,
    profile:PROFILE
  };
}

function parseJson(){
  const raw=String(el("jsonInput")?.value||"").trim();
  if(!raw)throw new Error("JSON import payload is empty.");

  let parsed;
  try{
    parsed=JSON.parse(raw);
  }catch(e){
    throw new Error("Invalid JSON: "+(e.message||String(e)));
  }

  if(!Array.isArray(parsed))throw new Error("JSON payload must be an array.");

  el("previewCount").textContent=`${parsed.length} import rows`;

  return parsed;
}

function previewJson(){
  clearMessages();
  const rows=parseJson();
  const missing=rows.filter(r=>!String(r?.kpi_code||"").trim()||!String(r?.kpi_statement||"").trim()).length;

  if(missing){
    showWarn(`${rows.length} row(s) parsed. ${missing} row(s) have missing kpi_code or kpi_statement.`);
  }else{
    showOk(`${rows.length} row(s) parsed. Basic validation passed.`);
  }
}

function csvCell(value){
  const s=String(value??"");
  return `"${s.replaceAll('"','""')}"`;
}

function downloadCsvTemplate(){
  if(!TEMPLATE.length){
    showWarn("Load template first.");
    return;
  }

  const headers=[
    "element_code",
    "element_title",
    "kpi_code",
    "kpi_level",
    "kpi_statement",
    "best_practice_guidance",
    "source_page",
    "source_publication"
  ];

  const lines=[
    headers.map(csvCell).join(","),
    ...TEMPLATE.map(r=>[
      r.element_code,
      r.element_title,
      r.kpi_code,
      r.kpi_level,
      "",
      "",
      "",
      r.source_publication||"OCIMF TMSA 3rd Edition 2017"
    ].map(csvCell).join(","))
  ];

  const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="tmsa-kpi-import-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importRows(){
  clearMessages();

  if(!isAdmin()){
    throw new Error("Only Super Admin / Platform Owner may import official TMSA KPI text.");
  }

  const rows=parseJson();

  const ok=confirm(`Import exact text for ${rows.length} row(s)? This will update matching TMSA KPI records.`);
  if(!ok)return;

  const typed=prompt("Type IMPORT to confirm.");
  if(String(typed||"").trim()!=="IMPORT"){
    showWarn("Import cancelled. Confirmation text did not match IMPORT.");
    return;
  }

  const btn=el("importBtn");
  if(btn)btn.disabled=true;

  try{
    const {data,error}=await sb.rpc("csvb_tmsa_import_kpi_text",{p_rows:rows});
    if(error)throw error;

    showOk(JSON.stringify(data,null,2));
    await loadTemplate();
  }finally{
    if(btn)btn.disabled=false;
  }
}

function bind(){
  el("logoutBtn")?.addEventListener("click",async()=>window.AUTH.logout());
  el("loadTemplateBtn")?.addEventListener("click",()=>loadTemplate().catch(e=>showWarn(e.message||String(e))));
  el("downloadCsvBtn")?.addEventListener("click",downloadCsvTemplate);
  el("previewJsonBtn")?.addEventListener("click",()=>{try{previewJson();}catch(e){showWarn(e.message||String(e));}});
  el("importBtn")?.addEventListener("click",()=>importRows().catch(e=>showWarn(e.message||String(e))));
}

async function init(){
  try{
    bind();

    const auth=await window.AUTH.setupAuthButtons({logoutBtnId:"logoutBtn"});
    PROFILE=auth?.profile||null;

    if(el("subLine")){
      el("subLine").textContent=PROFILE?.username
        ? `${PROFILE.username} · ${PROFILE.role}`
        : "TMSA KPI Import";
    }

    if(!isAdmin()){
      showWarn("This import page is restricted to Super Admin / Platform Owner. You may view the template, but import will be blocked.");
    }

    await loadTemplate();
  }catch(e){
    showWarn(e.message||String(e));
    if(el("subLine"))el("subLine").textContent="Not ready.";
  }
}

init();
