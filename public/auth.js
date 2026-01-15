// public/auth.js
(() => {
  "use strict";

  const AUTH_BUILD = "AUTH-2026-01-15A";

  const SUPABASE_URL = "https://bdidrcyufazskpuwmfca.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaWRyY3l1ZmF6c2twdXdtZmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDI4ODMsImV4cCI6MjA4MzUxODg4M30.Uqj4WCzoNS9wnlzI-xew6iTFzTUi77dcGeBjUgFjZbQ";

  // IMPORTANT:
  // This domain must match whatever you used when bulk-creating auth users (email = username@domain).
  const USERNAME_DOMAIN = "csvtest.local";

  const ROLES = {
    SUPER_ADMIN: "super_admin",
    COMPANY_ADMIN: "company_admin",
    COMPANY_SUPERINTENDENT: "company_superintendent",
    VESSEL: "vessel",
    INSPECTOR: "inspector",
  };

  const UI_ROLE_MAP = {
    [ROLES.SUPER_ADMIN]: "Super Admin",
    [ROLES.COMPANY_ADMIN]: "Company Admin",
    [ROLES.COMPANY_SUPERINTENDENT]: "Company Superintendent",
    [ROLES.VESSEL]: "Vessel",
    [ROLES.INSPECTOR]: "Inspector / Third Party",
  };

  function roleToUi(role) {
    return UI_ROLE_MAP[role] || role || "";
  }

  function qs(name) {
    try {
      return new URLSearchParams(window.location.search || "").get(name);
    } catch (_) {
      return null;
    }
  }

  function safePath(p) {
    const v = String(p || "").trim();
    if (!v) return "";
    if (v.startsWith("http://") || v.startsWith("https://") || v.startsWith("//")) return "";
    if (v.includes("..")) return "";
    if (!v.endsWith(".html")) return "";
    return v;
  }

  function usernameToEmail(usernameOrEmail) {
    const v = String(usernameOrEmail || "").trim();
    if (!v) return "";
    if (v.includes("@")) return v;
    return `${v}@${USERNAME_DOMAIN}`;
  }

  function showPageMessage(msg) {
    const ids = ["warnBox", "errBox", "loginError"];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = msg;
        el.style.display = "block";
        return;
      }
    }
    try { alert(msg); } catch (_) {}
  }

  function ensureSupabase() {
    if (window.__SUPABASE_CLIENT) return window.__SUPABASE_CLIENT;

    if (!window.supabase?.createClient) {
      showPageMessage("Supabase JS not loaded. Check @supabase/supabase-js script tag.");
      throw new Error("Supabase JS not available");
    }

    window.__SUPABASE_CLIENT = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    return window.__SUPABASE_CLIENT;
  }

  function deriveVesselPosition(username) {
    const u = String(username || "").trim().toLowerCase();
    if (u.startsWith("master_")) return "master";
    if (u.startsWith("chiefofficer_")) return "chief_officer";
    if (u.startsWith("chiefengineer_")) return "chief_engineer";
    return null;
  }

  async function getSession() {
    const sb = ensureSupabase();
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  }

  async function getSessionUserProfile() {
    const sb = ensureSupabase();
    const session = await getSession();
    if (!session?.user) return { session: null, user: null, profile: null };

    const user = session.user;

    const { data: profile, error } = await sb
      .from("profiles")
      .select("id, username, role, vessel_id, position, is_active")
      .eq("id", user.id)
      .single();

    if (error) throw error;

    return { session, user, profile };
  }

  async function requireAuth(allowedRoles = null, opts = {}) {
    const redirectTo = opts.redirectTo || "./login.html";
    const unauthorizedRedirect = opts.unauthorizedRedirect || "./q-dashboard.html";

    let bundle;
    try {
      bundle = await getSessionUserProfile();
    } catch (e) {
      showPageMessage(
        "Profile missing or blocked by RLS.\n" +
        "Ensure a row exists in public.profiles for this user, and RLS allows select.\n\n" +
        "Error: " + String(e?.message || e)
      );
      throw e;
    }

    const { session, user, profile } = bundle;

    if (!session?.user) {
      window.location.href = redirectTo;
      return null;
    }

    if (profile && profile.is_active === false) {
      showPageMessage("Your account is inactive. Please contact the administrator.");
      await ensureSupabase().auth.signOut();
      window.location.href = redirectTo;
      return null;
    }

    if (allowedRoles && Array.isArray(allowedRoles) && allowedRoles.length) {
      const ok = allowedRoles.includes(profile?.role);
      if (!ok) {
        showPageMessage("Access denied for your role. Redirecting…");
        setTimeout(() => { window.location.href = unauthorizedRedirect; }, 600);
        return null;
      }
    }

    return {
      session,
      user,
      profile,
      uiRole: roleToUi(profile?.role),
      vesselPosition: deriveVesselPosition(profile?.username),
    };
  }

  function fillUserBadge(me, elementId = "userBadge") {
    const el = document.getElementById(elementId);
    if (!el) return;

    const username = me?.profile?.username || me?.user?.email || "(unknown)";
    const uiRole = me?.uiRole || roleToUi(me?.profile?.role);
    const pos = me?.profile?.position || me?.vesselPosition || "";
    const posTxt = pos ? ` • ${pos}` : "";

    el.textContent = `${username} • ${uiRole}${posTxt}`;
  }

  async function logoutAndGoLogin() {
    try {
      const sb = ensureSupabase();
      await sb.auth.signOut();
    } catch (_) {}
    try {
      // cleanup common keys used by the app
      localStorage.removeItem("active_qid");
      localStorage.removeItem("q_session_v1");
    } catch (_) {}
    window.location.href = "./login.html";
  }

  // “Switch User” is effectively a logout + go to login.
  async function switchUser() {
    await logoutAndGoLogin();
  }

  window.AUTH = {
    AUTH_BUILD,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    USERNAME_DOMAIN,
    ROLES,
    roleToUi,
    qs,
    safePath,
    usernameToEmail,
    ensureSupabase,
    requireAuth,
    getSessionUserProfile,
    deriveVesselPosition,
    fillUserBadge,
    logoutAndGoLogin,
    switchUser,
  };
})();
