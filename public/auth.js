// public/auth.js
(() => {
  "use strict";

  // Bump when you change auth behavior (helps confirm cache is cleared)
  const AUTH_BUILD = "AUTH-2026-05-12-ONBOARD-CONTEXT-U07B";

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

  const PROFILE_SELECT = [
    "id",
    "username",
    "first_name",
    "last_name",
    "role",
    "company_id",
    "vessel_id",
    "position",
    "danaos_credential",
    "onboard_rank_id",
    "onboard_status",
    "onboard_access_enabled",
    "read_only_after_disembarkation",
    "embarkation_date",
    "disembarkation_date",
    "onboard_access_notes",
    "is_active",
    "is_disabled",
    "disabled_at",
    "disabled_reason",
    "force_password_reset",
  ].join(", ");

  const COMPANY_SELECT = [
    "id",
    "company_name",
    "short_name",
    "company_code",
    "is_active",
  ].join(", ");

  function roleToUi(role) {
    return UI_ROLE_MAP[role] || role || "";
  }

  function isPlatformAdminRole(role) {
    return role === ROLES.SUPER_ADMIN || role === "platform_owner";
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
    if (window.__SUPABASE_CLIENT) return window.__SUPABASE_CLIENT;

    if (!window.supabase?.createClient) {
      showPageMessage("Supabase JS not loaded. Check @supabase/supabase-js script tag.");
      throw new Error("Supabase JS not available");
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    window.__SUPABASE_CLIENT = client;
    window.__supabaseClient = client;

    return client;
  }

  function companyLabel(company) {
    if (!company) return "";
    return company.short_name || company.company_name || company.company_code || "";
  }

  async function getSession() {
    const sb = ensureSupabase();
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  }

  async function fetchCompany(companyId) {
    if (!companyId) return null;

    const sb = ensureSupabase();

    const { data, error } = await sb
      .from("companies")
      .select(COMPANY_SELECT)
      .eq("id", companyId)
      .maybeSingle();

    if (error) throw error;

    return data || null;
  }

  async function getSessionUserProfile() {
    const sb = ensureSupabase();
    const session = await getSession();

    if (!session?.user) {
      const out = { session: null, user: null, profile: null, company: null };
      window.CSVB_CONTEXT = out;
      return out;
    }

    const user = session.user;

    const { data: profile, error } = await sb
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", user.id)
      .single();

    if (error) throw error;

    const company = await fetchCompany(profile?.company_id);

    const enrichedProfile = {
      ...(profile || {}),
      company,
    };

    const out = {
      session,
      user,
      profile: enrichedProfile,
      company,
      company_id: enrichedProfile.company_id || null,
      isPlatformAdmin: isPlatformAdminRole(enrichedProfile.role),
      uiRole: roleToUi(enrichedProfile.role),
      vesselPosition: enrichedProfile.role === "vessel"
        ? await resolveCanonicalVesselPosition(sb, enrichedProfile) : null,
    };

    window.CSVB_CONTEXT = out;

    await enforceVesselRoute(sb, out);
    return out;
  }

  const vesselRanks = new Map();
  // Kept as a public compatibility helper, but accepts rank identity only.
  // Username prefixes are deliberately not an authorization source.
  function deriveVesselPosition(rank) {
    const key = String(rank || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return ({master:"master",chiefofficer:"chief_officer",chiefengineer:"chief_engineer",
      secondengineer:"second_engineer","2ndengineer":"second_engineer"})[key] || key || null;
  }
  async function resolveCanonicalVesselPosition(sb, profile) {
    if (!profile.onboard_rank_id) {
      return deriveVesselPosition(profile.position);
    }
    if (!vesselRanks.has(profile.onboard_rank_id)) {
      vesselRanks.set(profile.onboard_rank_id, sb.from("onboard_ranks")
        .select("rank_code,rank_name,is_active").eq("id", profile.onboard_rank_id).maybeSingle()
        .then(({data,error}) => {
          if (error || !data?.is_active) return null;
          const code = deriveVesselPosition(data.rank_code);
          const name = deriveVesselPosition(data.rank_name);
          const officers = ["master","chief_officer","chief_engineer","second_engineer"];
          return officers.includes(code) ? code : officers.includes(name) ? name : code;
        }));
    }
    return vesselRanks.get(profile.onboard_rank_id);
  }

  // Every authenticated module using AUTH gets the same fail-closed route gate.
  // This is UI protection only; RPCs/RLS remain authoritative.
  let vesselRouteAccess;
  async function enforceVesselRoute(sb, context) {
    if (context.profile?.role !== "vessel") return;
    const page = location.pathname.split("/").pop() || "index.html";
    if (["index.html","login.html","q-dashboard.html","mode-selection.html"].includes(page)) return;
    const routes = {
      "q-sire-questions-viewer.html": "SIRE_QUESTIONS_VIEWER",
      "sire-fleet-vetting-experience.html": "SIRE_FLEET_VETTING_EXPERIENCE",
      "mooring-anchoring-inventories-v4.html": "MOORING_ANCHORING_INVENTORIES",
      "mooring-anchoring-component.html": "MOORING_ANCHORING_INVENTORIES",
      "mooring-anchoring-operations.html": "MOORING_ANCHORING_INVENTORIES",
      "port-call-intelligence.html": "PORT_CALL_INTELLIGENCE",
      "portable-lifting-appliances-wires.html": "PORTABLE_LIFTING_APPLIANCES_WIRES",
      "portable-lifting-appliances-wire-component.html": "PORTABLE_LIFTING_APPLIANCES_WIRES"
    };
    const moduleCode = routes[page];
    if (!vesselRouteAccess) vesselRouteAccess = sb.rpc("csvb_my_effective_app_permissions")
      .then(({data,error}) => { if (error) throw error; return data || []; });
    let allowed = false;
    try {
      const rows = await vesselRouteAccess;
      allowed = !!moduleCode && rows.some(r => r.module_code === moduleCode &&
        r.permission_action === "view" && r.is_granted === true);
    } catch (_) { /* fail closed */ }
    if (!allowed) {
      location.replace("./q-dashboard.html");
      throw new Error("Vessel access denied by module/rank policy.");
    }
  }

  async function requireAuth(allowedRoles = null, opts = {}) {
    const redirectTo = opts.redirectTo || "./login.html";
    const unauthorizedRedirect = opts.unauthorizedRedirect || "./q-dashboard.html";

    let bundle;

    try {
      bundle = await getSessionUserProfile();
    } catch (e) {
      showPageMessage(
        "Profile missing, company context missing, or blocked by RLS.\n" +
          "Ensure a row exists in public.profiles for this user, and RLS allows select.\n\n" +
          "Error: " +
          String(e?.message || e)
      );
      throw e;
    }

    const { session, profile } = bundle;

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

    window.CSVB_CONTEXT = bundle;
    return bundle;
  }

  function fillUserBadge(meOrBundle, badgeId = "userBadge") {
    const el = document.getElementById(badgeId);
    if (!el) return;

    const profile = meOrBundle?.profile || null;
    const company = meOrBundle?.company || profile?.company || null;

    const username = profile?.username || meOrBundle?.user?.email || "";
    const uiRole = meOrBundle?.uiRole || roleToUi(profile?.role);
    const companyName = companyLabel(company);

    const parts = [];

    if (username) parts.push(username);
    if (uiRole) parts.push(uiRole);

    if (companyName) {
      parts.push(companyName);
    } else if (isPlatformAdminRole(profile?.role)) {
      parts.push("Platform");
    }

    el.textContent = parts.join(" • ");
  }

  async function logoutAndGoLogin(redirectTo = "./login.html") {
    try {
      await ensureSupabase().auth.signOut();
    } catch (_) {}
    window.location.href = redirectTo;
  }

  async function setupAuthButtons(cfg = {}) {
    const badgeId = cfg.badgeId || "userBadge";
    const loginBtnId = cfg.loginBtnId || "loginBtn";
    const logoutBtnId = cfg.logoutBtnId || "logoutBtn";
    const switchBtnId = cfg.switchBtnId || "switchUserBtn";
    const loginPath = cfg.loginPath || "./login.html";

    const loginBtn = document.getElementById(loginBtnId);
    const logoutBtn = document.getElementById(logoutBtnId);
    const switchBtn = document.getElementById(switchBtnId);

    let bundle;

    try {
      bundle = await getSessionUserProfile();
    } catch (e) {
      showPageMessage(
        "Profile/company loading error.\n\n" +
          String(e?.message || e)
      );
      throw e;
    }

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
      switchBtn.style.display = "inline-block";
      switchBtn.onclick = () => logoutAndGoLogin(loginPath);
    }

    fillUserBadge(bundle, badgeId);
    return bundle;
  }

  window.AUTH = {
    AUTH_BUILD,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    USERNAME_DOMAIN,
    ROLES,

    roleToUi,
    isPlatformAdminRole,
    companyLabel,

    qs,
    safePath,
    usernameToEmail,
    ensureSupabase,

    getSession,
    getSessionUserProfile,
    fetchCompany,
    requireAuth,

    deriveVesselPosition,
    fillUserBadge,
    logoutAndGoLogin,
    setupAuthButtons,
  };
})();
