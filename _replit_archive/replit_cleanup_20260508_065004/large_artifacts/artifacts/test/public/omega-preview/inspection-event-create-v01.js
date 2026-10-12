// public/inspection-event-create-v01.js
const BUILD="assurance_inspection_event_create_v01_20260602_2";
const sb=window.AUTH.ensureSupabase();
let PROFILE=null, OPTIONS=[], QUESTION_SETS=[], VESSELS=[], PROFILES=[];

function el(id){return document.getElementById(id)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function showWarn(msg){const n=el("warnBox");if(!n)return;n.textContent=msg||"";n.style.display=msg?"block":"none"}
function showOk(msg){const n=el("okBox");if(!n)return;n.textContent=msg||"";n.style.display=msg?"block":"none"}
function clearMessages(){showWarn("");showOk("")}
function label(v){return String(v||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function optLabel(r){return `${r.label||"-"}${r.code?" · "+r.code:""}`}
function selectedQS(){const id=el("questionSetId")?.value||"";return QUESTION_SETS.find(x=>String(x.id)===String(id))||null}
function selectedVessel(){const id=el("vesselId")?.value||"";return VESSELS.find(x=>String(x.id)===String(id))||null}

function renderQuestionSets(){
  const n=el("questionSetId"); if(!n)return;
  if(!QUESTION_SETS.length){n.innerHTML=`<option value="">No accessible question sets found</option>`;return;}
  n.innerHTML=`<option value="">Select question set...</option>`+QUESTION_SETS.map(r=>{
    const c=Number(r.metadata?.item_count||0);
    return `<option value="${esc(r.id)}">${esc(optLabel(r)+" · "+label(r.metadata?.question_set_type||"")+" · "+c+" active item(s)")}</option>`;
  }).join("");
}
function renderVessels(){
  const n=el("vesselId"); if(!n)return;
  const qs=selectedQS(); const companyId=String(qs?.company_id||"");
  const rows=companyId?VESSELS.filter(v=>!v.company_id||String(v.company_id)===companyId):VESSELS;
  if(!rows.length){n.innerHTML=`<option value="">No accessible vessel found</option>`;return;}
  n.innerHTML=`<option value="">Select vessel...</option>`+rows.map(r=>`<option value="${esc(r.id)}">${esc(optLabel(r))}</option>`).join("");
}
function renderProfiles(){
  const a=el("assignedToProfileId"), r=el("reviewerProfileId");
  const qs=selectedQS(), vessel=selectedVessel();
  const companyId=String(qs?.company_id||""), vesselId=String(vessel?.id||"");
  const rows=PROFILES.filter(p=>{
    const pc=String(p.company_id||"");
    const pv=String(p.metadata?.vessel_id||"");
    return !companyId || pc===companyId || pv===vesselId || !pc;
  });
  const html=rows.map(p=>`<option value="${esc(p.id)}">${esc((p.label||"-")+(p.code?" · "+label(p.code):""))}</option>`).join("");
  if(a)a.innerHTML=`<option value="">Not assigned</option>${html}`;
  if(r)r.innerHTML=`<option value="">No reviewer selected</option>${html}`;
}
function updateQSInfo(){
  const qs=selectedQS();
  const info=el("questionSetInfo");
  if(!info)return;
  if(!qs){info.textContent="Select a question set.";renderVessels();renderProfiles();return;}
  info.textContent=`Company: ${qs.company_id} · Status: ${qs.status||"-"} · Source: ${qs.metadata?.source_scope||"-"} · Active items: ${Number(qs.metadata?.item_count||0)}`;
  if(qs.metadata?.default_inspection_type && el("inspectionType"))el("inspectionType").value=qs.metadata.default_inspection_type;
  renderVessels(); renderProfiles(); maybeTitle();
}
function maybeTitle(){
  const t=el("inspectionTitle"); if(!t||t.value.trim())return;
  const qs=selectedQS(), v=selectedVessel(); if(!qs||!v)return;
  const planned=el("plannedDate")?.value||"";
  t.value=`${v.label} - ${label(el("inspectionType")?.value||"Inspection Event")}${planned?" - "+planned:""}`;
}
async function loadOptions(){
  clearMessages();
  const {data,error}=await sb.rpc("csvb_assurance_event_options_for_me");
  if(error)throw error;
  OPTIONS=data||[];
  QUESTION_SETS=OPTIONS.filter(x=>x.option_type==="QUESTION_SET");
  VESSELS=OPTIONS.filter(x=>x.option_type==="VESSEL");
  PROFILES=OPTIONS.filter(x=>x.option_type==="PROFILE");
  renderQuestionSets(); renderVessels(); renderProfiles();
  window.CSVB_INSPECTION_EVENT_CREATE={build:BUILD,loaded:true,option_count:OPTIONS.length,question_set_count:QUESTION_SETS.length,vessel_count:VESSELS.length,profile_count:PROFILES.length};
}
function payload(){
  const qs=selectedQS();
  if(!qs)throw new Error("Question set is required.");
  if(!el("vesselId")?.value)throw new Error("Vessel is required.");
  if(!el("inspectionTitle")?.value.trim())throw new Error("Inspection title is required.");
  return {
    p_company_id:qs.company_id,
    p_vessel_id:el("vesselId").value,
    p_question_set_id:qs.id,
    p_inspection_title:el("inspectionTitle").value.trim(),
    p_inspection_type:el("inspectionType").value,
    p_event_status:el("eventStatus").value||"draft",
    p_planned_date:el("plannedDate").value||null,
    p_due_date:el("dueDate").value||null,
    p_assigned_to_profile_id:el("assignedToProfileId").value||null,
    p_reviewer_profile_id:el("reviewerProfileId").value||null,
    p_remarks:el("remarks").value.trim()||null
  };
}
async function createEvent(){
  clearMessages();
  const b=el("createBtn"); if(b)b.disabled=true;
  try{
    const {data,error}=await sb.rpc("csvb_assurance_create_inspection_event",payload());
    if(error)throw error;
    showOk(`Inspection event created. Event ID: ${data}`);
    setTimeout(()=>{location.href="./inspection-events.html"},850);
  }finally{if(b)b.disabled=false;}
}
function resetForm(){location.reload();}
function bind(){
  el("logoutBtn")?.addEventListener("click",async()=>window.AUTH.logout());
  el("questionSetId")?.addEventListener("change",updateQSInfo);
  el("vesselId")?.addEventListener("change",()=>{renderProfiles();maybeTitle();});
  el("inspectionType")?.addEventListener("change",maybeTitle);
  el("plannedDate")?.addEventListener("change",maybeTitle);
  el("createBtn")?.addEventListener("click",()=>createEvent().catch(e=>showWarn(e.message||String(e))));
  el("resetBtn")?.addEventListener("click",resetForm);
}
async function init(){
  try{
    bind();
    const auth=await window.AUTH.setupAuthButtons({logoutBtnId:"logoutBtn"});
    PROFILE=auth?.profile||null;
    el("subLine").textContent=PROFILE?.username?`${PROFILE.username} · ${PROFILE.role}`:"Create Inspection Event";
    await loadOptions();
  }catch(e){
    showWarn(e.message||String(e));
    if(el("subLine"))el("subLine").textContent="Not ready.";
  }
}
init();
