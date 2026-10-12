// public/inspection-events-list-v01.js
const BUILD="assurance_inspection_events_list_v01_20260602_2";
const sb=window.AUTH.ensureSupabase();
let PROFILE=null;
let EVENTS=[];

function el(id){return document.getElementById(id)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function showWarn(msg){const n=el("warnBox");if(!n)return;n.textContent=msg||"";n.style.display=msg?"block":"none"}
function showOk(msg){const n=el("okBox");if(!n)return;n.textContent=msg||"";n.style.display=msg?"block":"none"}
function clearMessages(){showWarn("");showOk("")}
function label(v){return String(v||"-").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function date(v){return v?String(v).slice(0,10):"-"}
function dt(v){try{return v?new Date(v).toLocaleString():"-"}catch{return String(v||"-")}}
function pill(v){const s=String(v||"draft").toLowerCase();return `<span class="pill ${esc(s)}">${esc(label(s))}</span>`}

function rows(){
  const term=String(el("searchInput")?.value||"").trim().toLowerCase();
  if(!term)return EVENTS;
  return EVENTS.filter(r=>[
    r.inspection_title,r.vessel_name,r.question_set_name,r.question_set_code,
    r.inspection_type,r.event_status,r.company_name,r.assigned_to_username,
    r.reviewer_username,r.remarks
  ].join(" ").toLowerCase().includes(term));
}

function render(){
  const body=el("eventsBody");
  const count=el("countPill");
  if(!body)return;
  const data=rows();
  if(count)count.textContent=`${data.length} record${data.length===1?"":"s"}`;
  if(!data.length){body.innerHTML=`<tr><td colspan="11">No inspection events found.</td></tr>`;return;}

  body.innerHTML=data.map(r=>{
    const qs=[r.question_set_code?`<span class="mono">${esc(r.question_set_code)}</span>`:"",esc(r.question_set_name||"-")].filter(Boolean).join(" · ");
    const assigned=[r.assigned_to_username?`Assigned: ${esc(r.assigned_to_username)}`:"",r.reviewer_username?`Reviewer: ${esc(r.reviewer_username)}`:""].filter(Boolean).join("<br>")||"-";
    return `<tr>
      <td>${pill(r.event_status)}</td>
      <td><strong>${esc(r.inspection_title||"-")}</strong><div class="small mono">${esc(r.id)}</div></td>
      <td>${esc(r.vessel_name||"-")}</td>
      <td>${qs}<div class="small">${esc(label(r.question_set_type||""))} · ${esc(r.source_scope||"")}</div></td>
      <td>${esc(label(r.inspection_type||""))}</td>
      <td>${esc(date(r.planned_date))}</td>
      <td>${esc(date(r.due_date))}</td>
      <td>${esc(Number(r.active_item_count||0))} active / ${esc(Number(r.item_count||0))} total</td>
      <td>${assigned}</td>
      <td>${esc(dt(r.created_at))}<div class="small">${r.created_by_username?"By "+esc(r.created_by_username):""}</div></td>
      <td><button class="btn secondary" type="button" data-copy-id="${esc(r.id)}">Copy ID</button> <button class="btn secondary" type="button" disabled>Open</button></td>
    </tr>`;
  }).join("");
}

async function loadEvents(){
  clearMessages();
  const {data,error}=await sb.rpc("csvb_assurance_events_for_me");
  if(error)throw error;
  EVENTS=data||[];
  render();
  window.CSVB_INSPECTION_EVENTS_LIST={build:BUILD,loaded:true,event_count:EVENTS.length};
}

function bind(){
  el("logoutBtn")?.addEventListener("click",async()=>window.AUTH.logout());
  el("refreshBtn")?.addEventListener("click",()=>loadEvents().catch(e=>showWarn(e.message||String(e))));
  el("createPageBtn")?.addEventListener("click",()=>{location.href="./inspection-event-create.html"});
  el("searchInput")?.addEventListener("input",render);
  el("eventsBody")?.addEventListener("click",async e=>{
    const b=e.target.closest("button[data-copy-id]");
    if(!b)return;
    try{await navigator.clipboard.writeText(b.dataset.copyId||"");showOk("Inspection event ID copied.");}
    catch{showWarn(`Copy failed. Event ID:\n${b.dataset.copyId||""}`);}
  });
}

async function init(){
  try{
    bind();
    const auth=await window.AUTH.setupAuthButtons({logoutBtnId:"logoutBtn"});
    PROFILE=auth?.profile||null;
    el("subLine").textContent=PROFILE?.username?`${PROFILE.username} · ${PROFILE.role}`:"Inspection Events";
    await loadEvents();
  }catch(e){
    showWarn(e.message||String(e));
    if(el("subLine"))el("subLine").textContent="Not ready.";
  }
}
init();
