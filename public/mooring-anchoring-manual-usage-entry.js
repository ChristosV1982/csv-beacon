/* Keep history separate; navigate to the common, permission-checked entry workspace. */
(() => {
  "use strict";
  async function init() {
    const button=document.getElementById("registerUsageBtn");
    if(!button) return;
    const permission=await window.CSVB_MAI_PERMISSIONS?.whenReady();
    const id=new URLSearchParams(location.search).get("id");
    if(!permission?.canEdit || permission.isReadOnly || !/^[0-9a-f-]{36}$/i.test(id || "")) return;
    button.hidden=false;
    button.disabled=false;
    button.addEventListener("click",()=>{
      location.href=`./mooring-anchoring-inventories-v4.html?usage_component_id=${encodeURIComponent(id)}`;
    });
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",()=>init().catch(console.error),{once:true});
  else init().catch(console.error);
})();
