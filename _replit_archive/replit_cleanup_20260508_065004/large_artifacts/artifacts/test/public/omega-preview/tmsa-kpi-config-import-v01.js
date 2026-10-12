// public/tmsa-kpi-config-import-v01.js
// C.S.V. BEACON - TMSA Bulk KPI Configuration Import v02
// Adds front-end validation and Excel workflow help.

const BUILD = "tmsa_kpi_config_import_validation_v02_20260610";
const sb = window.AUTH.ensureSupabase();
const COMPANY_KEY = "csvb_tmsa_config_import_selected_company_id";

let PROFILE = null;
let COMPANIES = [];
let TEMPLATE = [];
let PREVIEW = [];
let VALIDATION = { validRows: [], errors: [] };

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

const ALLOWED = {
  coverage_status: ["not_reviewed","not_covered","partly_covered","covered_weak_evidence","covered_acceptable_evidence","verified"],
  input_method: ["narrative","yes_no","level_claim","numeric_metric","percentage_metric","date_based","frequency_based","document_reference","evidence_checklist","action_plan","mixed"],
  readiness_status: ["not_assessed","not_ready","partly_ready","ready","oil_major_ready"],
  evidence_strength: ["no_evidence","weak","moderate","strong","oil_major_ready"],
  oil_major_sensitivity: ["low","medium","high","critical"],
  metric_direction: ["not_applicable","higher_is_better","lower_is_better","range","exact"]
};

const NUMERIC_COLUMNS = [
  "target_value",
  "actual_value",
  "minimum_acceptable_value",
  "maximum_acceptable_value",
  "green_threshold",
  "amber_threshold",
  "red_threshold"
];

const INTEGER_LEVEL_COLUMNS = ["claimed_level","target_level"];
const DATE_COLUMNS = ["last_measured_at","last_reviewed_at","next_review_due"];

const COLUMN_HELP = [
  ["element_code","Optional when kpi_id is used. Useful when matching by kpi_code.","No","1",""],
  ["kpi_code","KPI code. Used to match KPI if kpi_id is blank.","Required if kpi_id blank","1.1.1",""],
  ["kpi_id","Database KPI UUID. Safest matching field.","Recommended","uuid",""],
  ["coverage_status","Company coverage status.","No","not_reviewed",ALLOWED.coverage_status.join(" | ")],
  ["claimed_level","Company claimed TMSA level for this KPI.","No","1 to 4",""],
  ["target_level","Company target TMSA level for this KPI.","No","1 to 4",""],
  ["input_method","How the KPI is answered/presented.","No","narrative",ALLOWED.input_method.join(" | ")],
  ["readiness_status","Audit readiness status.","No","not_assessed",ALLOWED.readiness_status.join(" | ")],
  ["company_response","Internal company response/handling.","No","Free text",""],
  ["sms_reference","SMS reference to be shown.","No","SMS Ch. X.X",""],
  ["forms_records","Forms/records references.","No","Form A / Report B",""],
  ["owner_department","Department responsible.","No","Marine / HSQE / Technical",""],
  ["evidence_strength","Strength of evidence.","No","no_evidence",ALLOWED.evidence_strength.join(" | ")],
  ["oil_major_sensitivity","Risk/sensitivity for Oil Major audit.","No","medium",ALLOWED.oil_major_sensitivity.join(" | ")],
  ["audit_answer_summary","What the presenter will say during the audit.","No","Free text",""],
  ["evidence_to_present","What documents/records will be shown.","No","Free text",""],
  ["weakness_to_avoid","Known weak points to avoid.","No","Free text",""],
  ["responsible_presenter","Person/role presenting.","No","Marine Superintendent",""],
  ["measurement_unit","Unit for target/actual.","No","%, days, count",""],
  ["measurement_frequency","Measurement frequency.","No","monthly / quarterly / annual",""],
  ["metric_direction","How actual value is assessed.","No","not_applicable",ALLOWED.metric_direction.join(" | ")],
  ["target_value","Target numeric value.","No","90","Numeric"],
  ["actual_value","Actual/current numeric value.","No","88","Numeric"],
  ["minimum_acceptable_value","Minimum acceptable value.","No","85","Numeric"],
  ["maximum_acceptable_value","Maximum acceptable value.","No","30","Numeric"],
  ["green_threshold","Green traffic-light threshold.","No","90","Numeric"],
  ["amber_threshold","Amber traffic-light threshold.","No","85","Numeric"],
  ["red_threshold","Red threshold/reference.","No","80","Numeric"],
  ["last_measured_at","Last measurement date.","No","2026-06-10","YYYY-MM-DD"],
  ["last_reviewed_at","Last review date.","No","2026-06-10","YYYY-MM-DD"],
  ["next_review_due","Next review due date.","No","2026-09-10","YYYY-MM-DD"]
];

function el(id){return document.getElementById(id)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function showWarn(msg){const n=el("warnBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function showOk(msg){const n=el("okBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function clearMessages(){showWarn("");showOk("")}
function isPlatformRole(role){return role==="super_admin" || role==="platform_owner"}
function label(v){return String(v||"-").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function val(v){return v===null||v===undefined?"":String(v)}
function trimVal(v){return String(v??"").trim()}
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

function toCsv(rows, columns=EXPORT_COLUMNS){
  const lines=[columns.join(",")];
  rows.forEach(r=>{
    lines.push(columns.map(c=>csvEscape(r[c])).join(","));
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

function isUuid(s){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s||"").trim());
}

function isNumeric(s){
  if(trimVal(s)==="")return true;
  return Number.isFinite(Number(s));
}

function isDateYYYYMMDD(s){
  const v=trimVal(s);
  if(v==="")return true;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const d=new Date(v+"T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===v;
}

function templateKpiExists(row){
  const kpiId=trimVal(row.kpi_id);
  const kpiCode=trimVal(row.kpi_code);
  const elementCode=trimVal(row.element_code);

  if(kpiId && TEMPLATE.some(t=>String(t.kpi_id)===kpiId))return true;

  if(kpiCode){
    return TEMPLATE.some(t=>{
      const codeOk=String(t.kpi_code)===kpiCode;
      const elementOk=!elementCode || String(t.element_code)===elementCode;
      return codeOk && elementOk;
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

    if(!kpiId && !kpiCode){
      rowErrors.push("Provide either kpi_id or kpi_code.");
    }

    if(kpiId && !isUuid(kpiId)){
      rowErrors.push("kpi_id is not a valid UUID.");
    }

    if((kpiId || kpiCode) && !templateKpiExists(row)){
      rowErrors.push("KPI could not be matched against the current template/company view.");
    }

    Object.keys(ALLOWED).forEach(col=>{
      const v=trimVal(row[col]);
      if(v && !ALLOWED[col].includes(v)){
        rowErrors.push(`${col} has invalid value "${v}". Allowed: ${ALLOWED[col].join(", ")}.`);
      }
    });

    INTEGER_LEVEL_COLUMNS.forEach(col=>{
      const v=trimVal(row[col]);
      if(v){
        const n=Number(v);
        if(!Number.isInteger(n) || n<1 || n>4){
          rowErrors.push(`${col} must be an integer from 1 to 4.`);
        }
      }
    });

    NUMERIC_COLUMNS.forEach(col=>{
      if(!isNumeric(row[col])){
        rowErrors.push(`${col} must be numeric.`);
      }
    });

    DATE_COLUMNS.forEach(col=>{
      if(!isDateYYYYMMDD(row[col])){
        rowErrors.push(`${col} must be in YYYY-MM-DD format.`);
      }
    });

    if(rowErrors.length){
      errors.push({
        row_number: rowNum,
        kpi_code: kpiCode || "",
        element_code: trimVal(row.element_code),
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
  if(!box)return;

  if(!result){
    box.className="note";
    box.innerHTML="No preview loaded.";
    el("previewCountPill").textContent="0 preview";
    el("validCountPill").textContent="0 valid";
    el("errorCountPill").textContent="0 errors";
    return;
  }

  const total=PREVIEW.length;
  const valid=result.validRows.length;
  const errorCount=result.errors.length;

  el("previewCountPill").textContent=`${total} preview`;
  el("validCountPill").textContent=`${valid} valid`;
  el("errorCountPill").textContent=`${errorCount} errors`;

  if(!errorCount){
    box.className="note oknote";
    box.innerHTML=`Validation clean. ${valid} row(s) ready for import.`;
    return;
  }

  box.className="note error";
  box.innerHTML=`
    <strong>Validation failed.</strong> ${errorCount} row(s) contain errors. Import is blocked until corrected.
    <div class="validationList">
      ${result.errors.slice(0,80).map(e=>{
        return `<div><strong>Row ${esc(e.row_number)}</strong>${e.kpi_code?` · KPI ${esc(e.kpi_code)}`:""}: ${esc(e.errors.join(" | "))}</div>`;
      }).join("")}
      ${result.errors.length>80?`<div>Only first 80 errors shown.</div>`:""}
    </div>
  `;
}

function updateGlobalState(extra={}){
  window.CSVB_TMSA_KPI_CONFIG_IMPORT={
    build: BUILD,
    loaded: true,
    template_count: TEMPLATE.length,
    preview_count: PREVIEW.length,
    valid_count: VALIDATION.validRows.length,
    error_count: VALIDATION.errors.length,
    selected_company_id: companyId(),
    profile: PROFILE,
    ...extra
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

async function loadTemplate(){
  clearMessages();

  const {data,error}=await sb.rpc("csvb_tmsa_kpi_configuration_import_template_for_me",{
    p_company_id: companyId()
  });

  if(error)throw error;

  TEMPLATE=data||[];
  PREVIEW=[];
  VALIDATION={validRows:[],errors:[]};

  renderTemplate();
  renderValidation(null);

  el("templateCountPill").textContent=`${TEMPLATE.length} KPI${TEMPLATE.length===1?"":"s"}`;
  updateGlobalState();
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
  VALIDATION=validateRows(PREVIEW);
  renderTemplate(PREVIEW);
  renderValidation(VALIDATION);
  updateGlobalState();

  if(VALIDATION.errors.length){
    showWarn(`Preview loaded with ${VALIDATION.errors.length} validation error row(s). Import is blocked.`);
  }else{
    showOk(`Preview loaded: ${PREVIEW.length} row(s). Validation clean. Nothing imported yet.`);
  }
}

async function importConfig(){
  clearMessages();

  if(el("confirmText").value !== "IMPORT"){
    throw new Error('Type IMPORT in the confirmation field before importing.');
  }

  const rows=PREVIEW.length ? PREVIEW : parsePaste();
  if(!rows.length)throw new Error("No rows to import.");

  const validation=validateRows(rows);
  PREVIEW=rows;
  VALIDATION=validation;
  renderTemplate(PREVIEW);
  renderValidation(VALIDATION);
  updateGlobalState();

  if(VALIDATION.errors.length){
    throw new Error(`Import blocked. ${VALIDATION.errors.length} row(s) have validation errors.`);
  }

  const ok=confirm(`Import ${rows.length} validated KPI configuration row(s)? This will update existing company KPI handling records.`);
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
    showWarn(msg+"\n\nDatabase-side errors:\n"+JSON.stringify(result.errors||[],null,2));
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

  el("downloadHelpBtn")?.addEventListener("click",()=>{
    const rows=COLUMN_HELP.map(x=>({
      column:x[0],
      purpose:x[1],
      required:x[2],
      example:x[3],
      allowed_values_or_format:x[4]
    }));
    download("tmsa_kpi_configuration_column_help.csv",toCsv(rows,["column","purpose","required","example","allowed_values_or_format"]),"text/csv");
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
