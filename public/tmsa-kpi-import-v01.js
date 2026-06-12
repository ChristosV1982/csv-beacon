// public/tmsa-kpi-import-v01.js
// C.S.V. BEACON - TMSA Exact KPI Text Import v02

const BUILD = "tmsa_exact_kpi_text_import_progress_v03_20260612";
const sb = window.AUTH.ensureSupabase();

let PROFILE = null;
let TEMPLATE = [];
let PROGRESS = [];
let PREVIEW = [];
let VALIDATION = { validRows: [], errors: [] };

const EXPORT_COLUMNS = [
  "element_code",
  "kpi_code",
  "kpi_level",
  "kpi_id",
  "exact_kpi_statement",
  "exact_best_practice_guidance",
  "source_reference",
  "import_comment"
];

function el(id){return document.getElementById(id)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function showWarn(msg){const n=el("warnBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function showOk(msg){const n=el("okBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function clearMessages(){showWarn("");showOk("")}
function val(v){return v===null||v===undefined?"":String(v)}
function trimVal(v){return String(v??"").trim()}

function csvEscape(v){
  const s=val(v);
  if(/[",\n\r]/.test(s)) return `"${s.replaceAll('"','""')}"`;
  return s;
}

function toCsv(rows, columns=EXPORT_COLUMNS){
  const lines=[columns.join(",")];
  rows.forEach(r=>lines.push(columns.map(c=>csvEscape(r[c])).join(",")));
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
    const ch=src[i], next=src[i+1];

    if(inQuotes){
      if(ch==='"' && next==='"'){cell+='"'; i++;}
      else if(ch==='"'){inQuotes=false;}
      else{cell+=ch;}
    }else{
      if(ch==='"')inQuotes=true;
      else if(ch===","){row.push(cell); cell="";}
      else if(ch==="\n"){row.push(cell); rows.push(row); row=[]; cell="";}
      else if(ch==="\r"){}
      else cell+=ch;
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
      headers.forEach((h,idx)=>{if(h)obj[h]=r[idx] ?? "";});
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
    throw new Error("JSON must be an array or an object with rows: [].");
  }

  return parseCsv(raw);
}

function isUuid(s){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s||"").trim());
}

function templateMatch(row){
  const kpiId=trimVal(row.kpi_id);
  const code=trimVal(row.kpi_code);
  const element=trimVal(row.element_code);
  const level=trimVal(row.kpi_level);

  if(kpiId && TEMPLATE.some(t=>String(t.kpi_id)===kpiId))return true;

  if(code){
    return TEMPLATE.some(t=>{
      return String(t.kpi_code)===code
        && (!element || String(t.element_code)===element)
        && (!level || String(t.kpi_level)===level);
    });
  }

  return false;
}

function validateRows(rows){
  const validRows=[];
  const errors=[];

  rows.forEach((row,idx)=>{
    const rowNum=idx+1;
    const rowErrors=[];
    const kpiId=trimVal(row.kpi_id);
    const kpiCode=trimVal(row.kpi_code);

    if(!kpiId && !kpiCode) rowErrors.push("Provide kpi_id or kpi_code.");
    if(kpiId && !isUuid(kpiId)) rowErrors.push("kpi_id is not a valid UUID.");
    if((kpiId || kpiCode) && !templateMatch(row)) rowErrors.push("KPI could not be matched to template.");

    const exact = trimVal(row.exact_kpi_statement || row.kpi_statement);
    if(!exact) rowErrors.push("exact_kpi_statement is required.");

    const level=trimVal(row.kpi_level);
    if(level && !["1","2","3","4"].includes(level)) rowErrors.push("kpi_level must be 1, 2, 3 or 4.");

    if(rowErrors.length){
      errors.push({
        row_number: rowNum,
        element_code: trimVal(row.element_code),
        kpi_code: kpiCode,
        kpi_level: level,
        errors: rowErrors
      });
    }else{
      validRows.push(row);
    }
  });

  return {validRows, errors};
}

function renderValidation(result){
  const box=el("validationBox");

  if(!result){
    box.className="note";
    box.textContent="No preview loaded.";
    el("previewCountPill").textContent="0 preview";
    el("validCountPill").textContent="0 valid";
    el("errorCountPill").textContent="0 errors";
    return;
  }

  el("previewCountPill").textContent=`${PREVIEW.length} preview`;
  el("validCountPill").textContent=`${result.validRows.length} valid`;
  el("errorCountPill").textContent=`${result.errors.length} errors`;

  if(!result.errors.length){
    box.className="note oknote";
    box.textContent=`Validation clean. ${result.validRows.length} row(s) ready for controlled import.`;
    return;
  }

  box.className="note error";
  box.innerHTML=`
    <strong>Validation failed.</strong> ${result.errors.length} row(s) contain errors. Import is blocked.
    <div class="validationList">
      ${result.errors.slice(0,80).map(e=>{
        return `<div><strong>Row ${esc(e.row_number)}</strong>${e.kpi_code?` · KPI ${esc(e.kpi_code)}`:""}: ${esc(e.errors.join(" | "))}</div>`;
      }).join("")}
      ${result.errors.length>80?`<div>Only first 80 errors shown.</div>`:""}
    </div>
  `;
}

async function loadData(){
  clearMessages();

  const [template, progress] = await Promise.all([
    sb.rpc("csvb_tmsa_kpi_import_template_for_me"),
    sb.rpc("csvb_tmsa_kpi_text_import_progress")
  ]);

  if(template.error)throw template.error;
  if(progress.error)throw progress.error;

  TEMPLATE=template.data||[];
  PROGRESS=progress.data||[];

  PREVIEW=[];
  VALIDATION={validRows:[],errors:[]};

  renderTemplate();
  renderProgress();
  renderValidation(null);
  updateGlobalState();
}

function renderProgress(){
  const total=PROGRESS.reduce((s,r)=>s+Number(r.total_kpis||0),0);
  const imported=PROGRESS.reduce((s,r)=>s+Number(r.exact_text_imported||0),0);
  const guidance=PROGRESS.reduce((s,r)=>s+Number(r.guidance_imported||0),0);
  const exactPending=PROGRESS.reduce((s,r)=>s+Number((r.exact_text_pending ?? r.pending_kpis)||0),0);
  const guidancePending=PROGRESS.reduce((s,r)=>s+Number(r.guidance_pending||0),0);

  el("totalKpis").textContent=total;
  el("importedKpis").textContent=imported;
  el("guidanceKpis").textContent=guidance;
  el("pendingKpis").textContent=exactPending;
  if(el("guidancePendingKpis")) el("guidancePendingKpis").textContent=guidancePending;
  el("templateCountPill").textContent=`${TEMPLATE.length} KPI${TEMPLATE.length===1?"":"s"}`;
}

function filteredTemplate(){
  const q=String(el("templateSearch").value||"").trim().toLowerCase();
  if(!q)return TEMPLATE;
  return TEMPLATE.filter(r=>[
    r.element_code,
    r.element_title,
    r.kpi_code,
    r.kpi_level,
    r.import_status,
    r.current_kpi_statement,
    r.current_best_practice_guidance,
    r.exact_text_source_reference
  ].some(x=>String(x||"").toLowerCase().includes(q)));
}

function renderTemplate(rows=null){
  const body=el("templateBody");
  const data=rows || filteredTemplate();

  if(!data.length){
    body.innerHTML=`<tr><td colspan="6">No rows.</td></tr>`;
    return;
  }

  body.innerHTML=data.slice(0,250).map(r=>{
    return `<tr>
      <td><strong>${esc(r.element_code||"-")}</strong><div class="small">${esc(r.element_title||"")}</div></td>
      <td><strong>${esc(r.kpi_code||"-")}</strong><div class="small">Level ${esc(r.kpi_level||"")}<br>${esc(r.kpi_id||"")}</div></td>
      <td>${statusPill(r.import_status)}</td>
      <td><div class="small">${esc(String(r.current_kpi_statement||"").slice(0,240))}</div></td>
      <td><div class="small">${esc(String(r.current_best_practice_guidance||"").slice(0,240))}</div></td>
      <td><div class="small">${esc(r.exact_text_source_reference||r.source_reference||"")}</div></td>
    </tr>`;
  }).join("");
}

function statusPill(status){
  const s=String(status||"");
  if(s==="exact_text_imported")return `<span class="pill green">Exact text imported</span>`;
  if(s==="exact_kpi_text_imported_guidance_pending")return `<span class="pill amber">Guidance pending</span>`;
  return `<span class="pill amber">${esc(s || "Pending")}</span>`;
}

function previewPaste(){
  clearMessages();
  const rows=parsePaste();
  PREVIEW=rows;
  VALIDATION=validateRows(rows);
  renderTemplate(PREVIEW);
  renderValidation(VALIDATION);
  updateGlobalState();

  if(VALIDATION.errors.length){
    showWarn(`Preview loaded with ${VALIDATION.errors.length} validation error row(s). Import is blocked.`);
  }else{
    showOk(`Preview loaded: ${PREVIEW.length} row(s). Validation clean. Nothing imported yet.`);
  }
}

async function importExactText(){
  clearMessages();

  if(el("confirmText").value !== "IMPORT"){
    throw new Error('Type IMPORT in the confirmation field before importing.');
  }

  const rows=PREVIEW.length ? PREVIEW : parsePaste();
  const validation=validateRows(rows);

  PREVIEW=rows;
  VALIDATION=validation;
  renderTemplate(PREVIEW);
  renderValidation(VALIDATION);
  updateGlobalState();

  if(validation.errors.length){
    throw new Error(`Import blocked. ${validation.errors.length} validation error row(s).`);
  }

  const ok=confirm(`Import exact text for ${rows.length} KPI row(s)?`);
  if(!ok)return;

  const {data,error}=await sb.rpc("csvb_tmsa_import_kpi_text",{
    p_rows: rows,
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
    showWarn(msg+"\n\nDatabase-side errors:\n"+JSON.stringify(result.errors||[],null,2));
  }else{
    showOk(msg);
  }

  el("confirmText").value="";
  await loadData();
}

function updateGlobalState(){
  const total=PROGRESS.reduce((s,r)=>s+Number(r.total_kpis||0),0);
  const imported=PROGRESS.reduce((s,r)=>s+Number(r.exact_text_imported||0),0);
  const guidance=PROGRESS.reduce((s,r)=>s+Number(r.guidance_imported||0),0);
  const exactPending=PROGRESS.reduce((s,r)=>s+Number((r.exact_text_pending ?? r.pending_kpis)||0),0);
  const guidancePending=PROGRESS.reduce((s,r)=>s+Number(r.guidance_pending||0),0);

  window.CSVB_TMSA_KPI_IMPORT={
    build: BUILD,
    loaded: true,
    template_count: TEMPLATE.length,
    progress_rows: PROGRESS.length,
    total_kpis: total,
    exact_text_imported: imported,
    guidance_imported: guidance,
    exact_text_pending: exactPending,
    guidance_pending: guidancePending,
    preview_count: PREVIEW.length,
    valid_count: VALIDATION.validRows.length,
    error_count: VALIDATION.errors.length,
    profile: PROFILE
  };
}

function bind(){
  el("logoutBtn")?.addEventListener("click",async()=>window.AUTH.logout());
  el("refreshBtn")?.addEventListener("click",()=>loadData().catch(e=>showWarn(e.message||String(e))));
  el("templateSearch")?.addEventListener("input",()=>renderTemplate());

  el("downloadCsvBtn")?.addEventListener("click",()=>{
    const rows=TEMPLATE.map(r=>{
      const out={};
      EXPORT_COLUMNS.forEach(c=>out[c]=r[c] ?? "");
      return out;
    });
    download("tmsa_exact_kpi_text_import_template.csv",toCsv(rows),"text/csv");
  });

  el("downloadJsonBtn")?.addEventListener("click",()=>{
    const rows=TEMPLATE.map(r=>{
      const out={};
      EXPORT_COLUMNS.forEach(c=>out[c]=r[c] ?? "");
      return out;
    });
    download("tmsa_exact_kpi_text_import_template.json",JSON.stringify(rows,null,2),"application/json");
  });

  el("previewBtn")?.addEventListener("click",()=>{try{previewPaste()}catch(e){showWarn(e.message||String(e))}});
  el("importBtn")?.addEventListener("click",()=>importExactText().catch(e=>showWarn(e.message||String(e))));
}

async function init(){
  try{
    bind();

    const auth=await window.AUTH.setupAuthButtons({logoutBtnId:"logoutBtn"});
    PROFILE=auth?.profile||null;

    if(el("subLine")){
      el("subLine").textContent=PROFILE?.username
        ? `${PROFILE.username} · ${PROFILE.role}`
        : "TMSA Exact KPI Text Import";
    }

    await loadData();
  }catch(e){
    showWarn(e.message||String(e));
    if(el("subLine"))el("subLine").textContent="Not ready.";
  }
}

init();
