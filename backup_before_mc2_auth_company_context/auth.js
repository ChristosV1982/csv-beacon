// public/auth.js
(() => {
  "use strict";

  // Bump when you change auth behavior (helps you confirm cache is cleared)
  const AUTH_BUILD = "AUTH-2026-01-21A";

  const SUPABASE_URL = "https://bdidrcyufazskpuwmfca.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaWRyY3l1ZmF6c2twdXdtZmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDI4ODMsImV4cCI6MjA4MzUxODg4M30.Uqj4WCzoNS9wnlzI-xew6iTFzTUi77dcGeBjUgFjZbQ";

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
    try {
      alert(msg);
    } catch (_) {}
  }

  function ensureSupabase() {
    // Prefer a single canonical instance
    if (window.__SUPABASE_CLIENT) return window.__SUPABASE_CLIENT;

    if (!window.supabase?.createClient) {
      showPageMessage("Supabase JS not loaded. Check @supabase/supabase-js script tag.");
      throw new Error("Supabase JS not available");
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    // IMPORTANT: publish BOTH names because some modules use __supabaseClient
    window.__SUPABASE_CLIENT = client;
    window.__supabaseClient = client;

    return client;
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
          "Error: " +
          String(e?.message || e)
      );
      throw e;
    }

    const { session, user, profile } = bundle;

    if (!session?.user) {
      window.location.href = redirectTo;
      return null;
    }

    if (profile && (profile.is_active === false || profile.is_disabled === true)) {
      showPageMessage("Your account is inactive. Please contact the administrator.");
      await ensureSupabase().auth.signOut();
      window.location.href = redirectTo;
      return null;
    }

    if (allowedRoles && Array.isArray(allowedRoles) && allowedRoles.length) {
      const ok = allowedRoles.includes(profile?.role);
      if (!ok) {
        showPageMessage("Access denied for your role. Redirecting…");
        setTimeout(() => {
          window.location.href = unauthorizedRedirect;
        }, 600);
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

  function fillUserBadge(meOrBundle, badgeId = "userBadge") {
    const el = document.getElementById(badgeId);
    if (!el) return;

    const profile = meOrBundle?.profile || null;
    const username = profile?.username || meOrBundle?.user?.email || "";
    const uiRole = meOrBundle?.uiRole || roleToUi(profile?.role);

    const parts = [];
    if (username) parts.push(username);
    if (uiRole) parts.push(uiRole);

    el.textContent = parts.join(" • ");
  }

  async function logoutAndGoLogin(redirectTo = "./login.html") {
    try {
      await ensureSupabase().auth.signOut();
    } catch (_) {}
    window.location.href = redirectTo;
  }

  /**
   * Dashboard helper:
   * - wires login/logout/switch buttons
   * - fills badge
   * - returns the same bundle as requireAuth() (without role restriction)
   */
  async function setupAuthButtons(cfg = {}) {
    const badgeId = cfg.badgeId || "userBadge";
    const loginBtnId = cfg.loginBtnId || "loginBtn";
    const logoutBtnId = cfg.logoutBtnId || "logoutBtn";
    const switchBtnId = cfg.switchBtnId || "switchUserBtn";
    const loginPath = cfg.loginPath || "./login.html";

    const loginBtn = document.getElementById(loginBtnId);
    const logoutBtn = document.getElementById(logoutBtnId);
    const switchBtn = document.getElementById(switchBtnId);

    const me = await requireAuth([], { redirectTo: loginPath });

    // requireAuth redirects when not logged in; however some pages want "logged-out mode".
    // So if not logged in, do NOT redirect; instead show login button.
    // We detect "logged out" by checking session from getSessionUserProfile directly.
    const bundle = await getSessionUserProfile();

    const loggedIn = !!bundle?.session?.user;

    if (loginBtn) {
      loginBtn.style.display = loggedIn ? "none" : "inline-block";
      loginBtn.onclick = () => {
        const next = safePath(window.location.pathname.split("/").pop()) || "q-dashboard.html";
        window.location.href = `${loginPath}?next=${encodeURIComponent(next)}`;
      };
    }

    if (logoutBtn) {
      logoutBtn.style.display = loggedIn ? "inline-block" : "none";
      logoutBtn.onclick = () => logoutAndGoLogin(loginPath);
    }

    if (switchBtn) {
      // Switch user = sign out and go login
      switchBtn.style.display = "inline-block";
      switchBtn.onclick = () => logoutAndGoLogin(loginPath);
    }

    const out = loggedIn
      ? {
          session: bundle.session,
          user: bundle.user,
          profile: bundle.profile,
          uiRole: roleToUi(bundle.profile?.role),
          vesselPosition: deriveVesselPosition(bundle.profile?.username),
        }
      : { session: null, user: null, profile: null };

    fillUserBadge(out, badgeId);
    return out;
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
    setupAuthButtons,
  };
})();
