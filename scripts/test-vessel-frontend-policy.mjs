// Executes the served scripts in an isolated browser-API fixture.
// Complements database tests; this is not a real signed-in browser test.
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs/promises";
const auth=await fs.readFile("public/auth.js","utf8");
const dashboard=await fs.readFile("public/csvb-dashboard-rank-access-u07.js","utf8");
const mapping={
  sire_questions_viewer:"SIRE_QUESTIONS_VIEWER",
  sire_fleet_vetting_experience:"SIRE_FLEET_VETTING_EXPERIENCE",
  mooring_anchoring_inventories:"MOORING_ANCHORING_INVENTORIES",
  port_call_intelligence:"PORT_CALL_INTELLIGENCE",
  portable_lifting_appliances_wires:"PORTABLE_LIFTING_APPLIANCES_WIRES",
  post:"POST_INSPECTION",threads:"THREADS",unknown_card:"DENIED"
};
for(const rank of ["master","chief_officer","chief_engineer","second_engineer","bosun"]){
  const count=["master","chief_officer"].includes(rank)?5:
    ["chief_engineer","second_engineer"].includes(rank)?2:1;
  const allowed=Object.values(mapping).slice(0,count);
  const profile={id:"fixture",username:"not-a-rank",role:"vessel",position:"Wrong position",
    company_id:"company",vessel_id:"vessel",onboard_rank_id:"rank",
    is_active:true,is_disabled:false,onboard_status:"onboard",onboard_access_enabled:true};
  const cards=Object.keys(mapping).map(key=>({style:{display:"block"},getAttribute:()=>key}));
  let redirected="";
  const window={
    console,setTimeout,clearTimeout,URLSearchParams,Promise,Map,Set,
    location:{pathname:"/q-dashboard.html",search:"",replace:path=>{redirected=path;}},
    document:{readyState:"complete",querySelectorAll:()=>cards,getElementById:()=>null}
  };
  window.window=window;
  window.CSVB_DASHBOARD_BASE_READY=Promise.resolve();
  window.__SUPABASE_CLIENT={
    auth:{getSession:async()=>({data:{session:{user:{id:"fixture"}}}})},
    from(name){
      return{select(){return this;},eq(){return this;},single(){return this.maybeSingle();},async maybeSingle(){
        return{data:name==="profiles"?profile:name==="companies"?{company_name:"Test Company"}:
          name==="onboard_ranks"?{rank_code:rank,is_active:true}:null,error:null};
      }};
    },
    async rpc(){return{data:allowed.map(module_code=>({
      module_code,permission_action:"view",is_granted:true,scope:"company"
    })),error:null};}
  };
  const context=vm.createContext(window);
  vm.runInContext(auth,context);
  assert.equal((await window.AUTH.getSessionUserProfile()).vesselPosition,rank);
  vm.runInContext(dashboard,context);
  await window.CSVB_DASHBOARD_RANK_ACCESS_READY;
  // run() may be scheduled through DOM readiness; drain its Promise chain.
  await new Promise(r=>setTimeout(r,10));
  assert.equal(cards.filter(card=>card.style.display!=="none").length,count,rank);
  window.location.pathname="/post_inspection.html";
  await assert.rejects(()=>window.AUTH.getSessionUserProfile(),/Vessel access denied/);
  assert.equal(redirected,"./q-dashboard.html");
  profile.role="company_admin";
  assert.equal((await window.AUTH.getSessionUserProfile()).profile.role,"company_admin");
  console.log(`PASS ${rank}: ${count} cards; denied route redirected; Office unaffected.`);
}
