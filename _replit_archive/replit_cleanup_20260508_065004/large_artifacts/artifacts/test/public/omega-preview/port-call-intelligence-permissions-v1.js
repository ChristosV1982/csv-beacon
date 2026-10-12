// C.S.V. BEACON — Port Call Intelligence effective-permission helper.
(() => {
  "use strict";
  const MODULE_CODE = "PORT_CALL_INTELLIGENCE";

  function granted(rows, action) {
    return (rows || []).some((row) => row.module_code === MODULE_CODE && row.permission_action === action && row.is_granted === true);
  }

  async function load(bundle) {
    const sb = window.AUTH.ensureSupabase();
    const { data, error } = await sb.rpc("csvb_my_effective_app_permissions");
    if (error) throw new Error("Could not load Port Call Intelligence permissions: " + error.message);
    const rows = data || [];
    const profile = bundle?.profile || {};
    const platform = window.AUTH.isPlatformAdminRole(profile.role);
    const officeRole = platform || profile.role === "company_admin" || profile.role === "company_superintendent";
    const vesselRole = profile.role === "vessel";
    const onboardActive = profile.onboard_access_enabled !== false && profile.onboard_status !== "inactive" && profile.onboard_status !== "disembarked";
    const simulatedCompanyId = platform ? (localStorage.getItem("csvb_superuser_company_view_id") || null) : null;
    const companyId = profile.company_id || simulatedCompanyId || null;
    const companyContextReady = Boolean(companyId);
    const canCreateVesselCall = vesselRole && companyContextReady && onboardActive && !window.CSVB_READ_ONLY_ACCESS && granted(rows, "edit");
    const canCreateOfficeCall = officeRole && companyContextReady && !window.CSVB_READ_ONLY_ACCESS && (platform || granted(rows, "edit") || granted(rows, "review") || granted(rows, "admin"));
    const canCreateCall = canCreateVesselCall || canCreateOfficeCall;
    const canManageOfficeInfo = officeRole && companyContextReady && !window.CSVB_READ_ONLY_ACCESS && (platform || granted(rows, "review") || granted(rows, "admin"));
    return {
      rows,
      canView: platform || granted(rows, "view"),
      canEdit: !window.CSVB_READ_ONLY_ACCESS && (platform || granted(rows, "edit")),
      canReview: companyContextReady && officeRole && (platform || granted(rows, "review") || granted(rows, "admin")),
      canAdmin: companyContextReady && officeRole && (platform || granted(rows, "admin")),
      canCreateCall,
      canCreateVesselCall,
      canCreateOfficeCall,
      canManageOfficeInfo,
      canAddTerminal: companyContextReady && (canCreateCall || canManageOfficeInfo),
      canManageTerminals: canManageOfficeInfo,
      companyContextReady,
      platform,
      officeRole,
      vesselRole,
      userId: bundle?.user?.id || null,
      companyId,
      vesselId: profile.vessel_id || null
    };
  }

  window.PCI_PERMISSIONS = { MODULE_CODE, load };
})();
