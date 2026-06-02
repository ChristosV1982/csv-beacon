// public/inspection-question-set-create.js
// C.S.V. BEACON - Create Inspection & Assurance Question Set

const BUILD = "assurance_question_set_create_v01_20260601";
const sb = window.AUTH.ensureSupabase();
let SESSION = null;
let PROFILE = null;
let COMPANIES = [];

function el(id){return document.getElementById(id)}
function showWarn(msg){const n=el("warnBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function showOk(msg){const n=el("okBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function clearMessages(){showWarn("");showOk("")}
function isPlatform(){return ["super_admin","platform_owner"].includes(String(PROFILE?.role||""))}
function canCreate(){return ["super_admin","platform_owner","company_admin"].includes(String(PROFILE?.role||""))}

async function getSession(){
  const {data,error}=await sb.auth.getSession();
  if(error) throw error;
  const session=data?.session||null;
  if(!session?.user) throw new Error("You are not logged in.");
  return session;
}

async function getProfile(){
  const {data,error}=await sb.from("profiles").select("id,username,role,company_id,position").eq("id",SESSION.user.id).single();
  if(error) throw error;
  return data;
}

async function loadCompanies(){
  if(!isPlatform()) return;
  const wrap=el("companyWrap");
  const sel=el("companySelect");
  if(wrap) wrap.style.display="block";
  const {data,error}=await sb.rpc("csvb_admin_list_companies");
  if(error) throw new Error("Could not load companies: "+error.message);
  COMPANIES=data||[];
  if(sel){
    sel.innerHTML='<option value="">Select company...</option>'+COMPANIES.map(c=>{
      const label=c.company_name||c.short_name||c.company_code||c.id;
      return `<option value="${String(c.id).replaceAll('"','&quot;')}">${String(label).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</option>`;
    }).join("");
  }
}

function selectedCompanyId(){
  if(isPlatform()) return String(el("companySelect")?.value||"").trim();
  return PROFILE?.company_id||"";
}

function collectPayload(){
  const company_id=selectedCompanyId();
  if(!company_id) throw new Error("Company is required.");
  const question_set_name=String(el("qsName")?.value||"").trim();
  if(!question_set_name) throw new Error("Question set name is required.");
  const status=String(el("statusInput")?.value||"draft").trim();
  return {
    company_id,
    question_set_name,
    question_set_code:String(el("qsCode")?.value||"").trim().toUpperCase()||null,
    question_set_type:String(el("qsType")?.value||"company_specific").trim(),
    source_scope:String(el("sourceScope")?.value||"MIXED").trim(),
    default_inspection_type:String(el("defaultInspectionType")?.value||"company_specific_inspection").trim(),
    version:String(el("versionInput")?.value||"1.0").trim()||"1.0",
    status,
    description:String(el("descInput")?.value||"").trim()||null,
    is_active:status!=="archived",
    created_by:SESSION.user.id,
    updated_by:SESSION.user.id,
    metadata:{created_from:"inspection-question-set-create.html",build:BUILD}
  };
}

function clearForm(){
  ["qsName","qsCode","descInput"].forEach(id=>{const n=el(id); if(n)n.value=""});
  if(el("versionInput")) el("versionInput").value="1.0";
  if(el("statusInput")) el("statusInput").value="draft";
  clearMessages();
}

async function createSet(){
  clearMessages();
  if(!canCreate()) throw new Error("You do not have permission to create question sets.");
  const payload=collectPayload();
  const {data,error}=await sb.from("assurance_question_sets").insert(payload).select("id").single();
  if(error) throw error;
  showOk("Question set created. Opening item management page...");
  window.setTimeout(()=>{location.href=`./inspection-question-set-items.html?id=${encodeURIComponent(data.id)}`},500);
}

async function init(){
  try{
    SESSION=await getSession();
    PROFILE=await getProfile();
    el("logoutBtn")?.addEventListener("click",async()=>{await window.AUTH.logout()});
    el("createBtn")?.addEventListener("click",()=>createSet().catch(e=>showWarn(e.message||String(e))));
    el("clearBtn")?.addEventListener("click",clearForm);
    el("subLine").textContent=`${PROFILE.username||"User"} · ${PROFILE.role||""} · build ${BUILD}`;
    if(!canCreate()){
      el("createBtn")?.setAttribute("disabled","disabled");
      showWarn("Read-only role: only Super Admin and Company Admin can create question sets.");
    }
    await loadCompanies();
  }catch(e){showWarn(e.message||String(e)); if(el("subLine")) el("subLine").textContent="Not ready."}
}

init();
