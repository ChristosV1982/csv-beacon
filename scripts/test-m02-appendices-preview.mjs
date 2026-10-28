export async function verifyAppendicesUI({ev,wait,check,screenshot,call,sid}) {
  await ev(`{
    for(const key of ["pms","unscheduled","jobs"])document.querySelector('[data-add-maintenance="'+key+'"]').click();
    document.getElementById("addM02Finding").click();document.getElementById("addM02Finding").click();
    document.getElementById("addM02Photo").click();
    const put=(e,value)=>{e.value=value;e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));};
    ["maintenancePmsRows","maintenanceUnscheduledRows","maintenanceJobsRows"].forEach((id,i)=>{
      put(document.querySelector("#"+id+" [data-appendix-field=reference]"),"Maintenance "+i);
      put(document.querySelector("#"+id+" [data-appendix-field=comments]"),"Verified maintenance notes "+i);
    });
    put(document.querySelector("#maintenanceJobsRows [data-appendix-field=due_date]"),"2026-12-01");
    Array.from(document.querySelectorAll("#findingsRows [data-appendix-record]")).forEach((row,i)=>{
      put(row.querySelector("[data-appendix-field=reference]"),"Remark "+(i+1));
      put(row.querySelector("[data-appendix-field=description]"),"M02 finding "+(i+1));
      put(row.querySelector("[data-appendix-field=corrective_action]"),"Plan corrective action");
      put(row.querySelector("[data-appendix-field=root_cause]"),"Free text root cause");
      put(row.querySelector("[data-appendix-field=severity]"),i===0?"High":"Low");
      put(row.querySelector("[data-appendix-field=question_id]"),document.querySelector("[data-response]").dataset.response);
    });
    put(document.querySelector("#photoRecords [data-appendix-field=description]"),"M02 private photo caption");
    put(document.querySelector("[data-critical-response='1']"),"N/A");
    put(document.querySelector("[data-critical-comments='1']"),"Equipment test result");
    document.getElementById("maintenanceClosed").checked=true;
    document.getElementById("maintenanceClosed").dispatchEvent(new Event("change",{bubbles:true}));
  }`);
  await check("All new appendices render and Part 2 totals derive immediately",
    `document.querySelectorAll("#findingsRows [data-appendix-record]").length===2 && document.getElementById("totalHigh").value==="1" && document.getElementById("totalLow").value==="1" && document.getElementById("totalMedium").value==="0" && document.getElementById("criticalProgress").textContent==="Answered 1 / 29 · Remaining 28" && document.querySelector("#photoRecords input[type=file]").disabled`);
  await ev(`document.getElementById("saveDraft").click()`);
  await wait(`!document.getElementById("saveDraft").disabled && document.getElementById("editorMessage").textContent.includes("Draft saved") && !document.querySelector("#photoRecords input[type=file]").disabled`);
  await ev(`{
    const f=document.querySelector("#photoRecords input[type=file]"),d=new DataTransfer();
    d.items.add(new File([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRuoAAAAASUVORK5CYII="),c=>c.charCodeAt(0))],"appendix-photo.png",{type:"image/png"}));
    f.files=d.files;f.dispatchEvent(new Event("change",{bubbles:true}));
  }`);
  await wait(`!!document.querySelector("#photoRecords [data-preview-attachment]") && !document.getElementById("saveDraft").disabled`);
  await ev(`document.getElementById("section-photos").scrollIntoView()`);
  await ev(`document.querySelector("#photoRecords [data-preview-attachment]").click()`);
  await wait(`document.querySelector("#photoRecords img")?.naturalWidth>0 && !document.getElementById("saveDraft").disabled`);
  await check("Private Appendix 5 image upload and signed preview work", `document.querySelector("#photoRecords img").src.includes("token=") && document.querySelector("#photoRecords .m02-attachment-row").textContent.includes("appendix-photo.png")`);
  await ev(`document.getElementById("section-photos").scrollIntoView()`);
  await screenshot("appendix5-photos-desktop");
  await call("Page.reload",{ignoreCache:true},sid);
  await wait(`!!document.getElementById("companySelect")?.value && document.getElementById("taskLanding")?.hidden===false`);
  await ev(`document.querySelector('[data-view="register"]').click()`);
  await wait(`!!document.querySelector("#reportRows button")`);
  await ev(`document.querySelector("#reportRows button").click()`);
  await wait(`document.querySelectorAll("#findingsRows [data-appendix-record]").length===2 && !document.getElementById("editorView").hidden`);
  await check("Appendix 1/2/4/5 survive full reload/reopen",
    `document.querySelector("#maintenancePmsRows [data-appendix-field=comments]").value==="Verified maintenance notes 0" && document.querySelector("#maintenanceJobsRows [data-appendix-field=due_date]").value==="2026-12-01" && document.getElementById("maintenanceClosed").checked && document.querySelector("[data-critical-response='1']").value==="N/A" && document.querySelector("[data-critical-comments='1']").value==="Equipment test result" && document.getElementById("totalHigh").value==="1" && document.querySelector("#photoRecords [data-appendix-field=description]").value==="M02 private photo caption" && document.querySelector("#photoRecords .m02-attachment-row").textContent.includes("appendix-photo.png")`);
  await call("Emulation.setDeviceMetricsOverride",{width:402,height:874,deviceScaleFactor:1,mobile:true},sid);
  for (const section of ["maintenance","critical","findings","photos"]) {
    await ev(`document.getElementById("section-${section}").scrollIntoView()`);
    await check(`Appendix ${section} stacks without mobile overflow`,`document.documentElement.scrollWidth<=window.innerWidth+2 && getComputedStyle(document.querySelector("#section-${section} .m02-appendix-grid")).gridTemplateColumns.split(" ").length===1`);
    await screenshot("appendix-"+section+"-mobile");
  }
  await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sid);
}
