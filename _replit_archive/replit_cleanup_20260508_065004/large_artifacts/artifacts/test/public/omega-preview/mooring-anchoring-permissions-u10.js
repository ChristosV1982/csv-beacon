/* public/mooring-anchoring-permissions-u10.js */
/* C.S.V. BEACON – U-10 MAI shared permission helper */

(() => {
  "use strict";

  const BUILD = "MAI-PERMISSIONS-U10-20260512-1";
  const APP_MODULE_CODE = "MOORING_ANCHORING_INVENTORIES";

  const state = {
    loaded: false,
    profile: null,
    rows: [],
    isOffice: false,
    isPlatform: false,
    isOnboard: false,
    canView: false,
    canEdit: false,
    canExport: false,
    canAdmin: false,
    isReadOnly: false,
    reason: ""
  };

  function roleIsPlatform(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function roleIsOffice(role) {
    return [
      "super_admin",
      "platform_owner",
      "company_admin",
      "company_superintendent"
    ].includes(role);
  }

  function hasAction(action) {
    return (state.rows || []).some((row) => {
      return row.module_code === APP_MODULE_CODE &&
        row.permission_action === action &&
        row.is_granted === true;
    });
  }

  function snapshot() {
    return {
      build: BUILD,
      loaded: state.loaded,
      profile: state.profile,
      rows: state.rows,
      isOffice: state.isOffice,
      isPlatform: state.isPlatform,
      isOnboard: state.isOnboard,
      canView: state.canView,
      canEdit: state.canEdit,
      canExport: state.canExport,
      canAdmin: state.canAdmin,
      isReadOnly: state.isReadOnly,
      reason: state.reason
    };
  }

  async function refresh() {
    if (!window.AUTH?.getSessionUserProfile || !window.AUTH?.ensureSupabase) {
      state.loaded = true;
      state.reason = "AUTH helper unavailable.";
      return snapshot();
    }

    const bundle = await window.AUTH.getSessionUserProfile();

    state.profile = bundle?.profile || null;
    state.rows = [];
    state.isOffice = false;
    state.isPlatform = false;
    state.isOnboard = false;
    state.canView = false;
    state.canEdit = false;
    state.canExport = false;
    state.canAdmin = false;
    state.isReadOnly = false;
    state.reason = "";

    if (!bundle?.session?.user || !state.profile) {
      state.loaded = true;
      state.reason = "No logged-in user.";
      return snapshot();
    }

    const role = state.profile.role || "";

    state.isPlatform = roleIsPlatform(role);
    state.isOffice = roleIsOffice(role);
    state.isOnboard = role === "vessel";

    if (state.isPlatform) {
      state.canView = true;
      state.canEdit = true;
      state.canExport = true;
      state.canAdmin = true;
      state.loaded = true;
      state.reason = "Platform role.";
      return snapshot();
    }

    if (state.isOffice) {
      state.canView = true;
      state.canEdit = true;
      state.canExport = true;
      state.canAdmin = role !== "company_superintendent";
      state.loaded = true;
      state.reason = "Office role.";
      return snapshot();
    }

    if (state.isOnboard) {
      if (state.profile.onboard_access_enabled === false) {
        state.loaded = true;
        state.reason = "Onboard access disabled.";
        return snapshot();
      }

      if (state.profile.onboard_status === "inactive") {
        state.loaded = true;
        state.reason = "Onboard status inactive.";
        return snapshot();
      }

      if (
        state.profile.onboard_status === "disembarked" &&
        state.profile.read_only_after_disembarkation !== true
      ) {
        state.loaded = true;
        state.reason = "Disembarked without read-only access.";
        return snapshot();
      }
    }

    const sb = window.AUTH.ensureSupabase();

    const { data, error } = await sb.rpc("csvb_my_effective_app_permissions");

    if (error) {
      state.loaded = true;
      state.reason = error.message || "Could not load effective permissions.";
      return snapshot();
    }

    state.rows = data || [];
    state.canView = hasAction("view");
    state.canEdit = hasAction("edit");
    state.canExport = hasAction("export");
    state.canAdmin = hasAction("admin");

    state.isReadOnly =
      state.canView === true &&
      state.canEdit !== true;

    if (
      state.isOnboard &&
      state.profile.onboard_status === "disembarked" &&
      state.profile.read_only_after_disembarkation === true
    ) {
      state.isReadOnly = true;
      state.canEdit = false;
      state.canExport = false;
      state.canAdmin = false;
    }

    state.loaded = true;
    state.reason = "Effective permissions loaded.";

    return snapshot();
  }

  let readyPromise = null;

  function whenReady() {
    if (!readyPromise) {
      readyPromise = refresh()
        .then((result) => {
          window.dispatchEvent(new CustomEvent("csvb:mai-permissions-ready", { detail: result }));
          return result;
        })
        .catch((error) => {
          state.loaded = true;
          state.reason = String(error?.message || error);
          const result = snapshot();
          window.dispatchEvent(new CustomEvent("csvb:mai-permissions-ready", { detail: result }));
          return result;
        });
    }

    return readyPromise;
  }

  window.CSVB_MAI_PERMISSIONS = {
    BUILD,
    refresh: async () => {
      readyPromise = null;
      return whenReady();
    },
    whenReady,
    get: snapshot,
    hasAction: (action) => {
      const snap = snapshot();
      if (action === "view") return snap.canView;
      if (action === "edit") return snap.canEdit;
      if (action === "export") return snap.canExport;
      if (action === "admin") return snap.canAdmin;
      return false;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => whenReady());
  } else {
    whenReady();
  }
})();
