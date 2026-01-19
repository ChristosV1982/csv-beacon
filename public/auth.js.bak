// public/auth.js
(() => {
  "use strict";

  // Build marker (helps you confirm the browser loaded the latest file)
  const AUTH_BUILD = "AUTH-2026-01-15A";

  const SUPABASE_URL = "https://bdidrcyufazskpuwmfca.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaWRyY3l1ZmF6c2twdXdtZmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDI4ODMsImV4cCI6MjA4MzUxODg4M30.Uqj4WCzoNS9wnlzI-xew6iTFzTUi77dcGeBjUgFjZbQ";

  // Your username convention: if user enters "master_olympicfighter"
  // we login as "master_olympicfighter@csvtest.local"
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
    } catch {
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

  function pageMessage(msg) {
    const ids = ["warnBox", "errBox", "loginError"];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = msg;
        el.style.display = "block";
        return;
      }
    }
    try { alert(msg); } catch {}
  }

  function ensureSupabase() {
    // Backward-compatible singletons
    if (window.__supabaseClient) return window.__supabaseClient;
    if (window.__SUPABASE_CLIENT) return window.__SUPABASE_CLIENT;

    if (!window.supabase?.createClient) {
      pageMessage("Supabase JS not loaded. Check the @supabase/supabase-js <script> tag order.");
      throw new Error("Supabase JS not available");
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    window.__supabaseClient = client;
    window.__SUPABASE_CLIENT = client;
    return client;
  }

  function deriveVesselPositionFromUsername(username) {
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
    if (!session?.user) return { session: null, user: null, profile: null, vessel_name: "" };

    const user = session.user;

    const { data: profile, error } = await sb
      .from("profiles")
      .select("id, username, role, vessel_id, position, is_active")
      .eq("id", user.id)
      .single();

    if (error) throw error;

    let vessel_name = "";
    if (profile?.vessel_id) {
      const { data: v, error: vErr } = await sb
        .from("vessels")
        .select("name")
        .eq("id", profile.vessel_id)
        .maybeSingle();
      if (!vErr) vessel_name = v?.name || "";
    }

    return { session, user, profile, vessel_name };
  }

  async function requireAuth(allowedRoles = null, opts = {}) {
    const redirectTo = opts.redirectTo || "./login.html";
    const unauthorizedRedirect = opts.unauthorizedRedirect || "./q-dashboard.html";

    let bundle;
    try {
      bundle = await getSessionUserProfile();
    } catch (e) {
      pageMessage(
        "Profile missing or blocked by RLS.\n" +
        "Ensure a row exists in public.profiles for this user, and RLS allows select.\n\n" +
        "Error: " + String(e?.message || e)
      );
      throw e;
    }

    const { session, user, profile, vessel_name } = bundle;

    if (!session?.user) {
      window.location.href = redirectTo;
      return null;
    }

    if (profile && profile.is_active === false) {
      pageMessage("Your account is inactive. Please contact the administrator.");
      await ensureSupabase().auth.signOut();
      window.location.href = redirectTo;
      return null;
    }

    if (allowedRoles && Array.isArray(allowedRoles) && allowedRoles.length) {
      const ok = allowedRoles.includes(profile?.role);
      if (!ok) {
        pageMessage("Access denied for your role. Redirecting…");
        setTimeout(() => { window.location.href = unauthorizedRedirect; }, 600);
        return null;
      }
    }

    return {
      session,
      user,
      profile,
      vessel_name,
      uiRole: roleToUi(profile?.role),
      vesselPosition: profile?.position || deriveVesselPositionFromUsername(profile?.username),
    };
  }

  function fillUserBadge(meOrBundle, elementId = "userBadge") {
    const el = document.getElementById(elementId);
    if (!el) return;

    const profile = meOrBundle?.profile || meOrBundle?.profile === null ? meOrBundle.profile : meOrBundle;
    const role = meOrBundle?.uiRole || roleToUi(profile?.role);
    const username = profile?.username || meOrBundle?.user?.email || "(unknown)";
    const vesselName = meOrBundle?.vessel_name || "";

    const parts = [];
    parts.push(username);
    if (role) parts.push(`(${role})`);
    if (vesselName) parts.push(`— ${vesselName}`);

    el.textContent = parts.join(" ");
  }

  async function logoutAndGoLogin() {
    try { await ensureSupabase().auth.signOut(); } catch {}
    window.location.href = "./login.html";
  }

  async function logoutAndGoIndex() {
    try { await ensureSupabase().auth.signOut(); } catch {}
    window.location.href = "./index.html";
  }

  function goLogin() {
    window.location.href = "./login.html";
  }

  async function setupAuthButtons(opts = {}) {
    const loginBtnId = opts.loginBtnId || "loginBtn";
    const logoutBtnId = opts.logoutBtnId || "logoutBtn";
    const switchBtnId = opts.switchBtnId || "switchUserBtn";
    const badgeId = opts.badgeId || "userBadge";

    const loginBtn = document.getElementById(loginBtnId);
    const logoutBtn = document.getElementById(logoutBtnId);
    const switchBtn = document.getElementById(switchBtnId);

    let bundle = null;
    try {
      bundle = await getSessionUserProfile();
    } catch (e) {
      // If profile select is blocked, still show a safe UI state
      if (loginBtn) loginBtn.style.display = "inline-block";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (switchBtn) switchBtn.style.display = "inline-block";
      return null;
    }

    const loggedIn = !!bundle?.session?.user;

    // Toggle Login/Logout
    if (loginBtn) loginBtn.style.display = loggedIn ? "none" : "inline-block";
    if (logoutBtn) logoutBtn.style.display = loggedIn ? "inline-block" : "none";
    if (switchBtn) switchBtn.style.display = "inline-block"; // always visible

    // Badge
    if (loggedIn) fillUserBadge(bundle, badgeId);
    else {
      const el = document.getElementById(badgeId);
      if (el) el.textContent = "Logged out";
    }

    // Bind buttons
    if (loginBtn) loginBtn.onclick = () => goLogin();
    if (logoutBtn) logoutBtn.onclick = () => logoutAndGoLogin();
    if (switchBtn) switchBtn.onclick = () => logoutAndGoLogin();

    return bundle;
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
    getSessionUserProfile,
    requireAuth,
    fillUserBadge,
    setupAuthButtons,
    logoutAndGoLogin,
    logoutAndGoIndex,
    deriveVesselPositionFromUsername,
  };
})();
