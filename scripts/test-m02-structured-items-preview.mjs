export async function verifyStructuredItems({ev, wait, check, call, sid, screenshot}) {
  // Seed only the browser fixture's own report using the existing authenticated RPC.
  const rid = await ev(`(async()=>{
    const sb=await (window.AUTH.getSupabase?.()||window.AUTH.ensureSupabase?.());
    const id=document.querySelector("#reportRows [data-open-report]").dataset.openReport;
    const loaded=await sb.rpc("csvb_m02_get_v3",{p_report_id:id});if(loaded.error)throw Error(loaded.error.message);
    const r=loaded.data.report;
    const actor=await sb.auth.getUser();
    if(r.created_by!==actor.data.user.id)throw Error("Refusing to change a report not owned by this disposable test login");
    const saved=await sb.rpc("csvb_m02_save_v3",{p_report:{...r,details:{...r.details,
      unrelated_feature:{nested:{keep:"unchanged"},array:[1,{x:"y"}]},
      chapter_scores:{...r.details.chapter_scores,unknown_key:"retain-me"},
      m02_structured_items:{schema_version:1,extension:{keep:true},company_items:{"16":{extra:"retain-item-metadata"}},critical_items:{"2":{extra:"retain-critical-metadata"}}}
    }},p_workspace:r.workspace_state});if(saved.error)throw Error(saved.error.message);
    return id;
  })()`);
  async function reopen() {
    await call("Page.reload",{ignoreCache:true},sid);
    await wait(`!!document.getElementById("companySelect")?.value && document.getElementById("taskLanding")?.hidden===false`);
    await ev(`document.querySelector('[data-view="register"]').click()`);
    await wait(`!!document.querySelector('[data-open-report="${rid}"]')`);
    await ev(`document.querySelector('[data-open-report="${rid}"]').click()`);
    await wait(`!document.getElementById("editorView").hidden && document.querySelectorAll("[data-m02-critical-date]").length===29`);
  }
  await reopen();
  await check("Only Company items 1/2/16/24 gain supporting fields; existing responses/attachments remain",
    `document.querySelectorAll(".m02-company-card .m02-item-support").length===4 &&
     [1,2,16,24].every(n=>document.querySelector('[data-company-card="'+n+'"] [data-upload-file]') &&
       Array.from(document.querySelector('[data-company-response="'+n+'"]').options).map(o=>o.value).join(",")===",Yes,No,N/S") &&
     document.querySelectorAll("[data-m02-critical-date]").length===29 &&
     Array.from(document.querySelector("[data-critical-response]").options).map(o=>o.value).join(",")===",Yes,No,N/A"`);
  await ev(`{
    const put=(e,v)=>{if(!e)throw Error("Supporting control missing");e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));};
    const row=(no,i,key)=>document.querySelectorAll('[data-company-card="'+no+'"] [data-m02-support-row]')[i].querySelector('[data-m02-support-field="'+key+'"]');
    put(row(1,0,"meeting_date"),"2025-11-04");put(row(1,0,"details"),"Safety meeting discussion topics");
    document.querySelector('[data-m02-add-supporting="1"]').click();
    put(row(1,1,"meeting_date"),"2025-11-06");put(row(1,1,"details"),"Second optional meeting");
    const drills=[["Fire Drill (SLOP(P))","2025-11-05"],["Abandon Ship Drill","2025-11-05"],["Quarterly Life Boat & Rescue Boat Drill","2025-11-07"]];
    drills.forEach((d,i)=>{if(i)document.querySelector('[data-m02-add-supporting="2"]').click();put(row(2,i,"drill_type"),d[0]);put(row(2,i,"drill_date"),d[1]);put(row(2,i,"remarks"),"Drill verification remarks "+i);});
    for(const p of ["orb_part_i","orb_part_ii"]){
      const block=document.querySelector('[data-m02-orb-part="'+p+'"]');
      put(block.querySelector('[data-m02-support-field="from_period"]'),"Mar. 2025");
      put(block.querySelector('[data-m02-support-field="to_period"]'),"Nov. 2025");
      put(block.querySelector('[data-m02-support-field="findings"]'),"No specific findings noted");
    }
    for(let i=0;i<5;i++){
      if(i)document.querySelector('[data-m02-add-supporting="24"]').click();
      put(row(24,i,"reference"),"UDE-S48-2025-"+String(23+i).padStart(3,"0"));
      put(row(24,i,"description"),i===0?"Portable ladder in unsatisfactory condition":"Near-miss verification entry "+i);
      put(row(24,i,"date"),"2025-10-29");put(row(24,i,"remarks"),"Supporting reference "+i);
    }
    put(document.querySelector('[data-critical-response="1"]'),"Yes");
    put(document.querySelector('[data-m02-critical-date="1"]'),"2025-11-05");
    put(document.querySelector('[data-critical-comments="1"]'),"Tested with satisfactory results");
    put(document.querySelector('[data-critical-response="2"]'),"No");
    put(document.querySelector('[data-critical-comments="2"]'),"Not tested due to operational restrictions");
    put(document.querySelector('[data-critical-response="3"]'),"N/A");
    put(document.querySelector('[data-critical-comments="3"]'),"Not applicable");
  }`);
  await check("Supporting dates/rows do not answer Company checks; No/N/A need no test date",
    `document.getElementById("companyProgress").textContent==="Answered 1 / 51 · Remaining 50" &&
     document.getElementById("criticalProgress").textContent==="Answered 3 / 29 · Remaining 26" &&
     !document.querySelector('[data-m02-critical-date="2"]').required && !document.querySelector('[data-m02-critical-date="2"]').value &&
     !document.querySelector('[data-m02-critical-date="3"]').required && !document.querySelector('[data-m02-critical-date="3"]').value &&
     document.querySelector('[data-company-comments="1"]').value==="Minutes and crew discussion"`);
  async function save() {
    await ev(`document.getElementById("saveDraft").click()`);
    await wait(`!document.getElementById("saveDraft").disabled && document.getElementById("editorMessage").textContent.includes("Draft saved")`);
  }
  await save();
  await reopen();
  await check("Meeting, three dated drills, separated ORB periods and five near misses survive reload",
    `document.querySelectorAll('[data-company-card="1"] [data-m02-support-row]').length===2 &&
     document.querySelector('[data-company-card="1"] [data-m02-support-field="meeting_date"]').value==="2025-11-04" &&
     document.querySelectorAll('[data-company-card="2"] [data-m02-support-row]').length===3 &&
     document.querySelectorAll('[data-company-card="2"] [data-m02-support-field="drill_type"]')[2].value==="Quarterly Life Boat & Rescue Boat Drill" &&
     document.querySelectorAll('[data-m02-orb-part]').length===2 &&
     Array.from(document.querySelectorAll('[data-m02-support-field="from_period"]')).every(e=>e.value==="Mar. 2025") &&
     Array.from(document.querySelectorAll('[data-m02-support-field="findings"]')).every(e=>e.value==="No specific findings noted") &&
     document.querySelectorAll('[data-company-card="24"] [data-m02-support-row]').length===5 &&
     document.querySelectorAll('[data-company-card="24"] [data-m02-support-field="reference"]')[4].value==="UDE-S48-2025-027" &&
     document.querySelector('[data-m02-critical-date="1"]').value==="2025-11-05" &&
     !document.querySelector('[data-m02-critical-date="2"]').value && document.querySelector('[data-critical-response="2"]').value==="No" &&
     !document.querySelector('[data-m02-critical-date="3"]').value && document.querySelector('[data-critical-response="3"]').value==="N/A"`);
  await ev(`document.querySelectorAll('[data-company-card="1"] .m02-support-row .m02-remove-row')[1].click()`);
  await save();
  const persisted = await ev(`(async()=>{
    const sb=await (window.AUTH.getSupabase?.()||window.AUTH.ensureSupabase?.()),r=await sb.rpc("csvb_m02_get_v3",{p_report_id:"${rid}"});
    if(r.error)throw Error(r.error.message);
    const d=r.data.report.details,n=d.m02_structured_items;
    return d.unrelated_feature.nested.keep==="unchanged" && d.unrelated_feature.array[1].x==="y" &&
      d.chapter_scores.unknown_key==="retain-me" && n.schema_version===1 && n.extension.keep===true &&
      n.company_items["16"].extra==="retain-item-metadata" && n.critical_items["2"].extra==="retain-critical-metadata" &&
      n.company_items["1"].meetings.length===1 && n.company_items["2"].drills.length===3 &&
      n.company_items["24"].near_misses.length===5 &&
      r.data.company_items.find(x=>x.item_no===1).comments==="Minutes and crew discussion";
  })()`);
  if (!persisted) throw Error("Existing details/namespace/response comments were lost");
  await check("Existing unrelated/nested details and comments retained; optional extra meeting can be removed", "true");
  for (const [name, selector] of [["meetings", '[data-company-card="1"]'], ["drills", '[data-company-card="2"]'], ["orb", '[data-company-card="16"]'], ["near-misses", '[data-company-card="24"]'], ["date-tested", '[data-critical-item="1"]']]) {
    await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"start"})`);
    await screenshot("structured-"+name+"-desktop");
  }
  await call("Emulation.setDeviceMetricsOverride",{width:402,height:874,deviceScaleFactor:1,mobile:true},sid);
  await check("Supporting fields remain usable without mobile page overflow", `document.documentElement.scrollWidth<=window.innerWidth+2 &&
    getComputedStyle(document.querySelector(".m02-support-fields")).gridTemplateColumns.split(" ").length===1 &&
    getComputedStyle(document.querySelector(".m02-orb-blocks")).gridTemplateColumns.split(" ").length===1`);
  await ev(`document.querySelector('[data-company-card="16"]').scrollIntoView({block:"start"})`);
  await screenshot("structured-orb-mobile");
  await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sid);
}
