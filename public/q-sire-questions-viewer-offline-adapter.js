// public/q-sire-questions-viewer-offline-adapter.js
// C.S.V. BEACON — SIRE Questions Viewer Offline Adapter
// Phase 2C. Same Viewer UI, different data source when offline.
// Online mode remains unchanged. Offline mode reads local IndexedDB package only.
// No server writes. No sync execution. No device-gate enforcement.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-OFFLINE-ADAPTER-2026-05-26-PHASE2C";
  const PACKAGE_ID = "sire_questions_viewer_active_v1";
  const FORCE_PARAM = "offline_package";
  const FORCE_KEY = "csvb_force_sire_viewer_offline_package";

  function shouldUseOfflinePackage() {
    try {
      const qs = new URLSearchParams(location.search || "");
      if (qs.get(FORCE_PARAM) === "1") return true;
      if (localStorage.getItem(FORCE_KEY) === "1") return true;
    } catch (_) {}
    return navigator.onLine === false;
  }

  function makeOfflineUserBundle() {
    return {
      session: { user: { id: "offline-local-user", email: "offline@csvbeacon.local" } },
      user: { id: "offline-local-user", email: "offline@csvbeacon.local" },
      profile: {
        id: "offline-local-user",
        username: "Offline package",
        role: "offline_read_only",
        company_id: null,
        vessel_id: null,
        is_active: true,
        is_disabled: false
      },
      company: null,
      company_id: null,
      isPlatformAdmin: false,
      uiRole: "Offline Read-only",
      vesselPosition: null
    };
  }

  async function getOfflinePackage() {
    if (window.CSVB_SIRE_VIEWER_OFFLINE?.getPackage) {
      return await window.CSVB_SIRE_VIEWER_OFFLINE.getPackage();
    }

    if (!window.CSVB_OFFLINE_DB) {
      throw new Error("Offline DB helper is not loaded.");
    }

    return await window.CSVB_OFFLINE_DB.get(window.CSVB_OFFLINE_DB.STORES.PACKAGES, PACKAGE_ID);
  }

  async function rpcFromPackage(name, args = {}) {
    const pkg = await getOfflinePackage();

    if (!pkg?.rows?.length) {
      return {
        data: null,
        error: {
          message: "No SIRE Questions Viewer offline package found on this device. Go online and download the package first."
        }
      };
    }

    if (name === "csvb_questions_master_for_me") {
      return { data: pkg.rows || [], error: null };
    }

    const questionId = args?.p_question_id;

    if (name === "csvb_pgno_master_for_question_for_me") {
      const items = (pkg.pgno_by_question_id || {})[questionId] || [];
      return {
        data: items.map((it) => ({
          pgno_text: it.text || it.pgno_text || "",
          remarks: it.remarks || ""
        })),
        error: null
      };
    }

    if (name === "csvb_expected_evidence_for_question_for_me") {
      const items = (pkg.ee_by_question_id || {})[questionId] || [];
      return {
        data: items.map((it) => ({
          evidence_text: it.text || it.evidence_text || "",
          esms_references: it.esms_references || "",
          esms_forms: it.esms_forms || "",
          remarks: it.remarks || ""
        })),
        error: null
      };
    }

    if (name === "csvb_sire_question_references_for_question") {
      const ref = (pkg.references_by_question_id || {})[questionId] || {};
      return { data: [ref], error: null };
    }

    return {
      data: null,
      error: { message: `Offline package RPC not supported: ${name}` }
    };
  }

  function makeOfflineSupabaseClient() {
    return {
      rpc: rpcFromPackage,
      auth: {
        async getSession() {
          return { data: { session: makeOfflineUserBundle().session }, error: null };
        },
        async signOut() {
          return { error: null };
        }
      },
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          single() { return Promise.resolve({ data: makeOfflineUserBundle().profile, error: null }); }
        };
      }
    };
  }

  function install() {
    window.CSVB_SIRE_VIEWER_OFFLINE_ADAPTER = {
      BUILD,
      PACKAGE_ID,
      FORCE_KEY,
      shouldUseOfflinePackage,
      getOfflinePackage,
      makeOfflineSupabaseClient
    };

    if (!shouldUseOfflinePackage()) return;

    // The main Viewer checks for window.supabase before AUTH.ensureSupabase().
    // If the CDN is unavailable offline, provide a harmless local stub.
    if (!window.supabase) {
      window.supabase = {
        createClient() {
          return makeOfflineSupabaseClient();
        }
      };
    }

    if (!window.AUTH) return;

    const originalEnsureSupabase = window.AUTH.ensureSupabase?.bind(window.AUTH);
    const originalSetupAuthButtons = window.AUTH.setupAuthButtons?.bind(window.AUTH);
    const originalGetSessionUserProfile = window.AUTH.getSessionUserProfile?.bind(window.AUTH);
    const originalRequireAuth = window.AUTH.requireAuth?.bind(window.AUTH);

    window.AUTH.ensureSupabase = function ensureOfflineSupabase() {
      if (shouldUseOfflinePackage()) {
        const fake = makeOfflineSupabaseClient();
        window.__SUPABASE_CLIENT = fake;
        window.__supabaseClient = fake;
        return fake;
      }
      return originalEnsureSupabase ? originalEnsureSupabase() : makeOfflineSupabaseClient();
    };

    window.AUTH.getSessionUserProfile = async function getOfflineSessionUserProfile() {
      if (shouldUseOfflinePackage()) {
        const bundle = makeOfflineUserBundle();
        window.CSVB_CONTEXT = bundle;
        return bundle;
      }
      return originalGetSessionUserProfile ? await originalGetSessionUserProfile() : makeOfflineUserBundle();
    };

    window.AUTH.requireAuth = async function requireOfflineAuth(allowedRoles, opts) {
      if (shouldUseOfflinePackage()) {
        const bundle = makeOfflineUserBundle();
        window.CSVB_CONTEXT = bundle;
        return bundle;
      }
      return originalRequireAuth ? await originalRequireAuth(allowedRoles, opts) : makeOfflineUserBundle();
    };

    window.AUTH.setupAuthButtons = async function setupOfflineAuthButtons(cfg = {}) {
      if (!shouldUseOfflinePackage()) {
        return originalSetupAuthButtons ? await originalSetupAuthButtons(cfg) : makeOfflineUserBundle();
      }

      const bundle = makeOfflineUserBundle();
      window.CSVB_CONTEXT = bundle;

      const badgeId = cfg.badgeId || "userBadge";
      const badge = document.getElementById(badgeId);
      if (badge) badge.textContent = "Offline package • Read-only";

      const loginBtn = document.getElementById(cfg.loginBtnId || "loginBtn");
      const logoutBtn = document.getElementById(cfg.logoutBtnId || "logoutBtn");
      const switchBtn = document.getElementById(cfg.switchBtnId || "switchUserBtn");

      if (loginBtn) loginBtn.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (switchBtn) switchBtn.style.display = "none";

      return bundle;
    };

    window.addEventListener("DOMContentLoaded", () => {
      const ok = document.getElementById("okBox");
      if (ok) {
        ok.textContent = "Offline package mode active. Same Viewer UI is using local read-only package data.";
        ok.style.display = "block";
      }
      const mode = document.getElementById("modeLine");
      if (mode) mode.textContent = "Role: Offline package • Mode: Read-only • Module: SIRE_QUESTIONS_VIEWER";
    });
  }

  install();
})();
