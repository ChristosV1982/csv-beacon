// public/inspection-question-set-items-page.js
// C.S.V. BEACON - Assurance Question Set Items Page

const BUILD = "assurance_question_set_items_page_v02_preview_20260602";
const sb = window.AUTH.ensureSupabase();
let SESSION = null;
let PROFILE = null;
let QUESTION_SET = null;
let ITEMS = [];
let EVENT_USAGE_COUNT = 0;

function el(id){return document.getElementById(id)}
function qsParam(){return new URLSearchParams(location.search).get("id")||""}
function esc(value){return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function showWarn(msg){const n=el("warnBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function showOk(msg){const n=el("okBox"); if(!n)return; n.textContent=msg||""; n.style.display=msg?"block":"none"}
function clearMessages(){showWarn("");showOk("")}
function canManage(){return ["super_admin","company_admin"].includes(String(PROFILE?.role||""))}
function sourceLabel(v){return {SIRE_2_0:"SIRE 2.0",RISQ_3:"RISQ 3",COMPANY_SPECIFIC:"Company",FREE_TEXT:"Free text",MIXED:"Mixed"}[v]||v||"-"}
function isUnusedTemplate(){return Number(EVENT_USAGE_COUNT||0)===0}

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
async function loadQuestionSet(){
  const id=qsParam();
  if(!id) throw new Error("Missing question set id.");
  const {data,error}=await sb.from("assurance_question_sets").select("id,company_id,question_set_name,question_set_code,status,source_scope,question_set_type").eq("id",id).single();
  if(error) throw error;
  QUESTION_SET=data;
  await loadUsageCount();
  updateSelectedLine();
  el("subLine").textContent=`${PROFILE.username||"User"} · ${PROFILE.role||""} · ${data.question_set_name}`;
}
async function loadUsageCount(){
  if(!QUESTION_SET?.id){EVENT_USAGE_COUNT=0;return;}
  const {count,error}=await sb.from("assurance_inspection_events").select("id",{count:"exact",head:true}).eq("question_set_id",QUESTION_SET.id);
  if(error){EVENT_USAGE_COUNT=0;return;}
  EVENT_USAGE_COUNT=Number(count||0);
}
function updateSelectedLine(){
  const line=el("selectedLine");
  if(!line||!QUESTION_SET)return;
  const code=QUESTION_SET.question_set_code?` · ${QUESTION_SET.question_set_code}`:"";
  const usage=isUnusedTemplate()?"unused template: remove allowed":"used template: deactivate only";
  line.textContent=`Selected: ${QUESTION_SET.question_set_name}${code} · ${QUESTION_SET.status} · ${usage}`;
}
async function loadItems(){
  const {data,error}=await sb.from("assurance_question_set_items").select("id,item_no,order_index,source_library,source_question_no,chapter,section,short_text,custom_question_text,expected_evidence,inspector_guidance,criticality,is_active").eq("question_set_id",QUESTION_SET.id).order("order_index",{ascending:true}).order("item_no",{ascending:true});
  if(error) throw error;
  ITEMS=data||[];
  renderItems();
  window.CSVB_INSPECTION_QS_ITEMS_PAGE={build:BUILD,question_set_id:QUESTION_SET.id,item_count:ITEMS.length,event_usage_count:EVENT_USAGE_COUNT};
}
function renderItems(){
  const body=el("itemsBody");
  if(!body)return;
  if(!ITEMS.length){body.innerHTML='<tr><td colspan="7">No items in this question set yet.</td></tr>';return;}
  body.innerHTML=ITEMS.map(row=>{
    const title=row.short_text||row.custom_question_text||row.expected_evidence||"-";
    const question=row.custom_question_text&&row.custom_question_text!==title?row.custom_question_text:"";
    const sub=[row.chapter?`Ch. ${row.chapter}`:"",row.section||"",row.expected_evidence?`Evidence: ${row.expected_evidence}`:""].filter(Boolean).join(" · ");
    const pill=row.is_active===false?'<span class="pill off">Inactive</span>':'<span class="pill">Active</span>';
    const removeBtn=isUnusedTemplate()?`<button class="btn danger" data-action="remove" data-id="${esc(row.id)}" ${!canManage()?"disabled":""}>Remove</button>`:"";
    return `<tr><td class="mono">${esc(row.item_no||"-")}</td><td>${esc(sourceLabel(row.source_library))}</td><td class="mono">${esc(row.source_question_no||"-")}</td><td><div class="q-preview-title">${esc(title)}</div>${question?`<div class="q-preview-text">${esc(question)}</div>`:""}<div class="q-preview-sub">${esc(sub||"-")}</div></td><td>${esc(row.criticality||"normal")}</td><td>${pill}</td><td><div class="actions"><button class="btn secondary" data-action="toggle" data-id="${esc(row.id)}" ${!canManage()?"disabled":""}>${row.is_active===false?"Activate":"Deactivate"}</button>${removeBtn}</div></td></tr>`;
  }).join("");
}
function clearForm(){["questionNo","chapter","section","shortText","questionText","expectedEvidence","guidance"].forEach(id=>{const n=el(id); if(n)n.value=""});el("sourceLibrary").value="COMPANY_SPECIFIC";el("criticality").value="normal";el("isRequired").checked=true;el("answerRequired").checked=true;el("findingAllowed").checked=true;}
function payload(){
  if(!canManage()) throw new Error("You do not have permission to add items.");
  const source_library=el("sourceLibrary").value;
  const source_question_no=String(el("questionNo").value||"").trim()||null;
  const custom_question_text=String(el("questionText").value||"").trim()||null;
  if(!source_question_no&&!custom_question_text) throw new Error("Either Question No / Ref. or Question text is required.");
  const nextNo=ITEMS.reduce((m,r)=>Math.max(m,Number(r.item_no||0)),0)+1;
  const nextOrder=ITEMS.reduce((m,r)=>Math.max(m,Number(r.order_index||0)),0)+100;
  return {company_id:QUESTION_SET.company_id,question_set_id:QUESTION_SET.id,item_no:nextNo,order_index:nextOrder,source_library,source_question_no,chapter:String(el("chapter").value||"").trim()||null,section:String(el("section").value||"").trim()||null,short_text:String(el("shortText").value||"").trim()||null,custom_question_text,expected_evidence:String(el("expectedEvidence").value||"").trim()||null,inspector_guidance:String(el("guidance").value||"").trim()||null,criticality:el("criticality").value,is_required:el("isRequired").checked,answer_required:el("answerRequired").checked,finding_allowed:el("findingAllowed").checked,is_active:true,created_by:SESSION.user.id,updated_by:SESSION.user.id,metadata:{created_from:"inspection-question-set-items.html",build:BUILD}};
}
async function addItem(){clearMessages();const {error}=await sb.from("assurance_question_set_items").insert(payload());if(error)throw error;showOk("Manual item saved.");clearForm();await loadItems();}
async function toggleItem(id){const row=ITEMS.find(x=>String(x.id)===String(id));if(!row)return;const {error}=await sb.from("assurance_question_set_items").update({is_active:row.is_active===false,updated_by:SESSION.user.id}).eq("id",id);if(error)throw error;await loadItems();}
async function removeItem(id){
  if(!isUnusedTemplate()) throw new Error("This question set has been used. Questions cannot be removed; deactivate instead.");
  const ok=confirm("Remove this question completely from the unused template?");
  if(!ok)return;
  const {error}=await sb.from("assurance_question_set_items").delete().eq("id",id).eq("question_set_id",QUESTION_SET.id);
  if(error)throw error;
  showOk("Question removed from unused template.");
  await loadItems();
}
function bind(){el("logoutBtn")?.addEventListener("click",async()=>{await window.AUTH.logout()});el("addBtn")?.addEventListener("click",()=>addItem().catch(e=>showWarn(e.message||String(e))));el("clearBtn")?.addEventListener("click",clearForm);el("refreshBtn")?.addEventListener("click",()=>loadItems().catch(e=>showWarn(e.message||String(e))));el("itemsBody")?.addEventListener("click",e=>{const b=e.target.closest("button[data-action]");if(!b)return;const action=b.dataset.action;if(action==="toggle")toggleItem(b.dataset.id).catch(err=>showWarn(err.message||String(err)));if(action==="remove")removeItem(b.dataset.id).catch(err=>showWarn(err.message||String(err)));});}
async function init(){try{bind();SESSION=await getSession();PROFILE=await getProfile();await loadQuestionSet();if(!canManage()){el("manualItemDetails").style.display="none";}await loadItems();}catch(e){showWarn(e.message||String(e));if(el("subLine"))el("subLine").textContent="Not ready."}}
init();
