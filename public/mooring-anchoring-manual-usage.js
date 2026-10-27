/* Manual usage uses the existing ledger, never the operation-recording RPC. */
(() => {
  "use strict";
  const ids=["maiUsageDate","maiUsageHours","maiUsageRemarks","maiUsageType","maiUsageSearch",
    "maiUsageSelectAll","maiUsageClear","maiUsageComponents","maiUsageSelected","maiUsageReview",
    "maiUsageApply","maiUsageBack","maiUsageInventory","maiUsageMore","maiUsageMessage","maiUsageVessel"];
  const el=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));
  const state={client:null,vesselId:"",rows:[],selected:new Set(),canEdit:false,pending:false,done:false,
    requestId:null,requestSignature:"",uncertain:false,generation:0};
  const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function dateToday() {
    const now=new Date(); now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
    return now.toISOString().slice(0,10);
  }
  function visible() {
    const query=el.maiUsageSearch.value.trim().toLowerCase(),type=el.maiUsageType.value;
    return state.rows.filter(row=>(!type || row.component_type_id===type) &&
      (!query || `${row.unique_id} ${row.component_type_name} ${row.current_status}`.toLowerCase().includes(query)));
  }
  function payload() {
    return {p_vessel_id:state.vesselId,p_component_ids:[...state.selected].sort(),
      p_usage_date:el.maiUsageDate.value,p_hours:Number(el.maiUsageHours.value),
      p_remarks:el.maiUsageRemarks.value.trim() || null};
  }
  function valid() {
    const data=payload();
    return state.canEdit && !state.pending && !state.done && data.p_component_ids.length>0 &&
      Number.isFinite(data.p_hours) && data.p_hours>0 && el.maiUsageHours.validity.valid &&
      !!data.p_usage_date && el.maiUsageDate.validity.valid;
  }
  function render() {
    const locked=state.pending || state.done || state.uncertain || !state.canEdit;
    for (const id of ["maiUsageDate","maiUsageHours","maiUsageRemarks","maiUsageType","maiUsageSearch","maiUsageSelectAll","maiUsageClear"]) {
      el[id].disabled=locked;
    }
    el.maiUsageBack.disabled=el.maiUsageInventory.disabled=state.pending;
    el.maiUsageComponents.innerHTML=visible().map(row=>`<label class="mai-usage-component-row">
      <input type="checkbox" data-usage-component="${escape(row.id)}"${state.selected.has(row.id)?" checked":""}${locked?" disabled":""}>
      <span><strong>${escape(row.unique_id)}</strong> <span>${escape(row.component_type_name)}</span>
      <small>${escape(row.current_status)}</small></span></label>`).join("") ||
      '<p class="hint-text">No eligible components match these filters.</p>';
    const hidden=[...state.selected].filter(id=>!visible().some(row=>row.id===id)).length;
    el.maiUsageSelected.textContent=`${state.selected.size} selected${hidden?` (${hidden} outside current filters)`:""} · ${visible().length} visible`;
    const data=payload(),labels=state.rows.filter(row=>state.selected.has(row.id)).map(row=>row.unique_id);
    el.maiUsageReview.textContent=labels.length
      ? `${data.p_hours>0?data.p_hours:"Enter positive"} hours EACH · ${data.p_usage_date || "Select effective date"} · ${labels.length} components: ${labels.join(", ")}${data.p_remarks?` · Reference / remarks: ${data.p_remarks}`:""}. Manual usage only; no operation will be created.`
      : "Select at least one component, an effective date and positive usage hours.";
    el.maiUsageApply.disabled=!valid();
    el.maiUsageApply.textContent=state.pending?"Applying usage hours…":state.uncertain
      ?"Check / Retry Same Usage Request":"Apply Usage Hours to Selected Components";
    el.maiUsageMore.hidden=!state.done;
  }
  async function open({vesselId,componentId,client}) {
    if(state.pending) return;
    const generation=++state.generation;
    Object.assign(state,{client,vesselId,rows:[],selected:new Set(),canEdit:false,done:false,
      requestId:null,requestSignature:"",uncertain:false});
    el.maiUsageDate.value=dateToday(); el.maiUsageHours.value=""; el.maiUsageRemarks.value="";
    el.maiUsageSearch.value=""; el.maiUsageType.innerHTML='<option value="">All component types</option>';
    el.maiUsageMessage.textContent="Loading authorized components…"; el.maiUsageVessel.textContent="Loading vessel…";
    render();
    try {
      const permissions=await window.CSVB_MAI_PERMISSIONS.whenReady();
      const result=await client.rpc("mai_manual_usage_components",{p_vessel_id:vesselId});
      if(generation!==state.generation) return;
      if(result.error) throw result.error;
      const data=result.data || {};
      if(data.vessel_id!==vesselId || !Array.isArray(data.components)) throw Error("Unexpected vessel usage response.");
      state.rows=data.components;
      state.canEdit=!!data.can_edit && !!permissions.canEdit && !permissions.isReadOnly;
      el.maiUsageVessel.textContent=`Vessel: ${data.vessel_name}`;
      const types=new Map(state.rows.map(row=>[row.component_type_id,row.component_type_name]));
      el.maiUsageType.innerHTML='<option value="">All component types</option>'+[...types]
        .sort((a,b)=>String(a[1]).localeCompare(String(b[1])))
        .map(([id,name])=>`<option value="${escape(id)}">${escape(name)}</option>`).join("");
      if(componentId && state.rows.some(row=>row.id===componentId)) state.selected.add(componentId);
      el.maiUsageMessage.textContent=!state.canEdit?"Read-only: you do not have permission to register usage."
        : componentId && !state.selected.size?"This component is not eligible for manual usage. No hours were applied."
        :"Manual entry applies the same hours and date to each selected component.";
    } catch(error) {
      if(generation!==state.generation) return;
      el.maiUsageMessage.textContent=`Usage lookup failed: ${error.message || error}`;
    }
    render();
    document.getElementById("maiUsageWorkspace").scrollIntoView({block:"start"});
    (state.canEdit?el.maiUsageDate:el.maiUsageBack).focus({preventScroll:true});
  }
  el.maiUsageComponents.addEventListener("change",event=>{
    const id=event.target.dataset.usageComponent;
    if(state.pending || state.done || state.uncertain || !state.canEdit || !state.rows.some(row=>row.id===id)) return;
    if(event.target.checked) state.selected.add(id); else state.selected.delete(id);
    render();
  });
  for (const id of ["maiUsageType","maiUsageSearch","maiUsageDate","maiUsageHours","maiUsageRemarks"]) {
    el[id].addEventListener("input",render);
    el[id].addEventListener("change",render);
  }
  el.maiUsageSelectAll.addEventListener("click",()=>{
    if(!state.pending && !state.done && !state.uncertain && state.canEdit) visible().forEach(row=>state.selected.add(row.id));
    render();
  });
  el.maiUsageClear.addEventListener("click",()=>{
    if(!state.pending && !state.done && !state.uncertain) state.selected.clear();
    render();
  });
  async function submit() {
    if(!valid()) return;
    const data=payload(),signature=JSON.stringify(data);
    if(state.requestSignature && state.requestSignature!==signature && state.uncertain) return;
    if(!window.confirm(`Apply ${data.p_hours} hours EACH to ${data.p_component_ids.length} selected components on ${data.p_usage_date}? This creates separate manual usage records, not an operation.`)) return;
    if(state.pending) return;
    if(!state.requestId || state.requestSignature!==signature) {
      state.requestId=crypto.randomUUID(); state.requestSignature=signature;
    }
    state.pending=true; render(); el.maiUsageMessage.textContent="Applying all entries atomically…";
    try {
      const result=await state.client.rpc("mai_register_manual_usage_bulk",{...data,p_request_id:state.requestId});
      if(result.error) throw result.error;
      state.done=true; state.uncertain=false;
      el.maiUsageMessage.textContent=`${result.data.hours} hours applied to ${result.data.component_count} components.`;
      // A completed write is not reported as failed merely because totals cannot reload.
      try { await window.CSVB_MAI_INVENTORY_CONTEXT.refresh(); }
      catch(error) { el.maiUsageMessage.textContent+=` Saved successfully, but inventory totals could not reload: ${error.message || error}`; }
    } catch(error) {
      // Retain request/payload on any unknown outcome so a retry cannot double-credit.
      state.uncertain=!/^(P0001|42501|22|23|42)/.test(error.code || "");
      el.maiUsageMessage.textContent=`Usage request did not return success: ${error.message || error}. `+
        (state.uncertain?"Check / Retry resends the SAME request; it cannot credit it twice."
          :"No hours were applied. Correct the entry or reopen the workspace to reload eligible components.");
    } finally {state.pending=false;render();}
  }
  el.maiUsageApply.addEventListener("click",submit);
  function leave(inventory=false) {
    if(state.pending) return;
    if(state.uncertain && !confirm("This request has an uncertain outcome. Check / Retry is safer before leaving. Leave and review usage history before registering these hours again?")) return;
    ++state.generation;
    window.CSVB_MAI_INVENTORY_CONTEXT.closeManualUsage(inventory);
  }
  el.maiUsageBack.addEventListener("click",()=>leave());
  el.maiUsageInventory.addEventListener("click",()=>leave(true));
  el.maiUsageMore.addEventListener("click",()=>open({vesselId:state.vesselId,client:state.client}));
  window.CSVB_MAI_MANUAL_USAGE=Object.freeze({open});
})();
