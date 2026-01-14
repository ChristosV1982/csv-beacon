// public/auth.js
// Central auth + Supabase singleton + role guards.
// Load AFTER supabase-js (<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>)

(() => {
  const SUPABASE_URL = "https://bdidrcyufazskpuwmfca.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaWRyY3l1ZmF6c2twdXdtZmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDI4ODMsImV4cCI6MjA4MzUxODg4M30.Uqj4WCzoNS9wnlzI-xew6iTFzTUi77dcGeBjUgFjZbQ";

  // IMPORTANT: login.html builds email as: username@USERNAME_DOMAIN
  // This must exist, otherwise email becomes username@undefined and login fails.
  const USERNAME_DOMAIN = "csvtest.local";

  // Canonical role constants used across pages
  const ROLES = {
    SUPER_ADMIN: "super_admin",
    COMPANY_ADMIN: "company_admin",
    COMPANY_SUPERINTENDENT: "company_superintendent",
    VESSEL: "vessel",
    INSPECTOR: "inspector",
  };

  const UI_ROLE_MAP = {
    super_admin: "Super Admin",
    company_admin: "Company Admin",
    company_superintendent: "Company Superintendent",
    vessel: "Vessel",
    inspector: "Inspector / Third Party",
  };

  function roleToUi(role) {
    return UI_ROLE_MAP[role] || role || "";
  }

  function showPageMessage(msg) {
    // Try common containers first
    const ids = ["warnBox", "errBox"];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = msg;
        el.style.display = "block";
        return;
      }
    }
    // Fallback
    try {
      alert(msg);
    } catch (_) {}
  }

  function ensureSupabase() {
    if (window.__SUPABASE_CLIENT) return window.__SUPABASE_CLIENT;

    if (!window.supabase?.createClient) {
      showPageMessage(
        "Supabase JS not loaded. Check the <script> tag for @supabase/supabase-js."
      );
      throw new Error("Supabase JS not available");
    }

    window.__SUPABASE_CLIENT = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );

    return window.__SUPABASE_CLIENT;
  }

  function deriveVesselPosition(username) {
    const u = String(username || "").trim().toLowerCase();
    if (u.startsWith("master_")) return "master";
    if (u.startsWith("chiefofficer_")) return "chief_officer";
    if (u.startsWith("chiefengineer_")) return "chief_engineer";
    return null;
  }

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  // Allow only internal relative paths (prevents open redirects)
  function safePath(p) {
    const v = String(p || "").trim();
    if (!v) return "";
    if (v.includes("://")) return "";
    if (v.startsWith("//")) return "";
    if (v.toLowerCase().startsWith("javascript:")) return "";
    // allow ./xxx or /xxx or xxx (same folder)
    if (v.startsWith("./") || v.startsWith("/") || /^[A-Za-z0-9._-]+/.test(v)) return v;
    return "";
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
      .select("id, username, role, vessel_id")
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

  window.AUTH = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,

    USERNAME_DOMAIN,
    ROLES,
    qs,
    safePath,

    roleToUi,
    ensureSupabase,
    requireAuth,
    getSessionUserProfile,
    deriveVesselPosition,
  };
})();
