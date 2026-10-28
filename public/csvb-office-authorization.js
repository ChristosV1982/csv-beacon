/* Office-only action presentation. The API/Storage gates enforce authorization. */
(() => {
  "use strict";
  const ROUTES = {
    "q-sire-questions-viewer.html": "SIRE_QUESTIONS_VIEWER",
    "sire-fleet-vetting-experience.html": "SIRE_FLEET_VETTING_EXPERIENCE",
    "vetting-inspection-planner.html": "VETTING_INSPECTION_PLANNER",
    "post_inspection.html": "POST_INSPECTION",
    "post_inspection_detail.html": "POST_INSPECTION",
    "post_inspection_observation_detail.html": "POST_INSPECTION",
    "post_inspection_kpis.html": "POST_INSPECTION",
    "post_inspection_stats.html": "POST_INSPECTION_STATS",
    "inspector_intelligence.html": "INSPECTOR_INTELLIGENCE",
    "mooring-anchoring-inventories-v4.html": "MOORING_ANCHORING_INVENTORIES",
    "mooring-anchoring-component.html": "MOORING_ANCHORING_INVENTORIES",
    "mooring-anchoring-operations.html": "MOORING_ANCHORING_INVENTORIES",
    "port-call-intelligence.html": "PORT_CALL_INTELLIGENCE",
    "portable-lifting-appliances-wires.html": "PORTABLE_LIFTING_APPLIANCES_WIRES",
    "q-questions-editor.html": "QUESTIONS_EDITOR",
    "risq-questions-editor.html": "RISQ_QUESTIONS_EDITOR",
    "su-admin.html": "SU_ADMIN",
  };
  const moduleCode = ROUTES[location.pathname.split("/").pop()];
  let permissions, observer, queued = false;
  const editIds = new Set([
    "newReportBtn", "saveHeaderBtn", "importPdfBtn", "reimportFindingsPdfBtn",
    "reextractFindingsBtn", "importOperatorCommentsBtn", "repairHumanPifsBtn",
    "refreshRiskBtn", "refreshAllRisksBtn", "refreshAllRiskBtn", "importBtn",
    "saveBtn", "deleteBtn", "addItemBtn", "addObservationBtn", "saveItemBtn",
    "syncInspectorsBtn", "saveThirdPartyBtn", "newCallBtn", "newOfficeInfoBtn",
  ]);
  const can = (action, requiredModule = moduleCode) => permissions?.some(p => p.module_code === requiredModule &&
    p.action === action && p.decision?.allowed === true);
  function actionFor(node) {
    if (node.dataset.csvbPermission) return node.dataset.csvbPermission;
    if (node.matches("a[href]")) {
      const targetModule = ROUTES[new URL(node.href, location.href).pathname.split("/").pop()];
      if (targetModule && targetModule !== moduleCode) {
        node.dataset.csvbPermissionModule = targetModule;
        return "view";
      }
    }
    if (node.matches("input[type=file]")) return "edit";
    const text = `${node.textContent || ""} ${node.getAttribute("title") || ""}`
      .replace(/\s+/g, " ").trim().replace(/^[^A-Za-z]+/, "");
    if (/export|print\s*\/|save.*pdf/i.test(`${node.id} ${text}`) || node.hasAttribute("download"))
      return "export";
    if (/^(?:admin|btnAdmin|riskProfilesBtn|riskProfileSettingsBtn|manageTemplatesBtn)/i.test(node.id) ||
        /^(?:administration|admin\b|risk rating profiles|module settings|manage templates|configure permissions)/i.test(text))
      return "admin";
    if (editIds.has(node.id)) return "edit";
    if (!/filter|search|column|sort|chart|compare|expand|collapse/i.test(node.id) &&
        /^(?:btn)?(?:save|add|create|delete|remove|edit|issue|submit|register|record|import|new(?:Report|Call|Component)|task(?:Register|Record))/i.test(node.id))
      return "edit";
    if (/^(save\b|add\s|create\s|delete\b|remove\b|edit\s|issue\s|submit\b|return to vessel|register\s|record\s|import\s|re-import\s|re-extract\s|sync inspectors|use suggestion|refresh risk|refresh\s*\/\s*repair|new (?:report|post-inspection|call|component|office))/i.test(text))
      return "edit";
    return null;
  }
  function enforce() {
    queued = false;
    for (const node of document.querySelectorAll("button,a[href],input[type=file]")) {
      const action = actionFor(node);
      if (!action || can(action, node.dataset.csvbPermissionModule)) continue;
      node.dataset.csvbOfficeDenied = action;
      node.setAttribute("aria-disabled", "true");
      node.title = `${action[0].toUpperCase() + action.slice(1)} is not permitted by your Office Access Profile`;
      if ("disabled" in node) node.disabled = true;
    }
    if (!can("edit")) document.querySelectorAll("textarea").forEach(n => { n.readOnly = true; });
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enforce);
  }
  async function init() {
    if (!moduleCode || !window.AUTH?.ensureSupabase) return;
    window.CSVB_OFFICE_AUTHORIZATION_PROMISE ||= window.AUTH.ensureSupabase()
      .rpc("csvb_my_office_authorization").then(({ data, error }) => {
        if (error) throw Error(error.message);
        return data;
      });
    let data;
    try { data = await window.CSVB_OFFICE_AUTHORIZATION_PROMISE; }
    catch (error) { console.error("Office authorization presentation unavailable", error.message); return; }
    window.CSVB_OFFICE_AUTHORIZATION = data;
    if (!data?.enforced) return; // Preserve all existing non-migrated/Vessel/Inspector behavior.
    permissions = data.permissions || [];
    const style = document.createElement("style");
    style.textContent = "[data-csvb-office-denied]{display:none!important}";
    document.head.append(style);
    document.addEventListener("click", event => {
      const node = event.target.closest?.("button,a[href]");
      const action = node && actionFor(node);
      if (action && !can(action, node.dataset.csvbPermissionModule)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    // Only added/removed controls, never busy-indicator attribute mutations.
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    enforce();
  }
  // Some pages load auth.js as a deferred script near the end of <body>.
  if (document.readyState === "complete") init();
  else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
