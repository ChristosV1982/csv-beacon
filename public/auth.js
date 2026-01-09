/* public/auth.js
   Centralized Supabase auth + role-based route protection.
*/

const SUPABASE_URL = "https://bdidrcyufazskpuwmfca.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaWRyY3l1ZmF6c2twdXdtZmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDI4ODMsImV4cCI6MjA4MzUxODg4M30.Uqj4WCzoNS9wnlzI-xew6iTFzTUi77dcGeBjUgFjZbQ";

const SESSION_KEY_COMPAT = "q_session_v1"; // compatibility for any older pages
const USERNAME_DOMAIN = "csvtest.local";   // username@csvtest.local

// Role values are the DB values stored in public.profiles.role
const ROLES = {
  SUPER_ADMIN: "super_admin",
  COMPANY_ADMIN: "company_admin",
  COMPANY_SUPERINTENDENT: "company_superintendent",
  VESSEL: "vessel",
  INSPECTOR: "inspector",
};

function mustHaveSupabase() {
  if (!window.supabase || !window.supabase.createClient) {
    throw new Error("Supabase library missing. Ensure the supabase-js CDN script is included before auth.js.");
  }
}

function getClient() {
  mustHaveSupabase();
  if (!window.__supabaseClient) {
    window.__supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return window.__supabaseClient;
}

function qs(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

function safePath(p) {
  // Only allow local same-folder navigation like "./q-dashboard.html"
  if (!p) return "";
  if (p.includes("://")) return "";
  if (p.startsWith("//")) return "";
  if (!p.endsWith(".html")) return "";
  // allow "./x.html" or "x.html"
  return p.startsWith("./") ? p : `./${p}`;
}

function setCompatSession(profile, user) {
  const vesselName = profile?.vessels?.name || "";
  localStorage.setItem(
    SESSION_KEY_COMPAT,
    JSON.stringify({
      username: profile?.username || (user?.email ? user.email.split("@")[0] : ""),
      role: profile?.role || "",
      vessel: vesselName,
      created_at: new Date().toISOString(),
    })
  );
}

async function getMyProfile() {
  const supabaseClient = getClient();

  const { data: sessionData, error: sessionErr } = await supabaseClient.auth.getSession();
  if (sessionErr) throw sessionErr;

  const session = sessionData?.session;
  if (!session?.user) return null;

  const user = session.user;

  // IMPORTANT: keep this select minimal to avoid any unnecessary recursion/policy complexity.
  const { data: profile, error: profErr } = await supabaseClient
    .from("profiles")
    .select("id, username, role, vessel_id")
    .eq("id", user.id)
    .single();

  if (profErr) throw profErr;

  setCompatSession(profile, user);
  return { user, profile };
}

function redirectToLogin() {
  const returnTo = encodeURIComponent(window.location.pathname.split("/").pop() || "q-dashboard.html");
  window.location.href = `./login.html?returnTo=${returnTo}`;
}

function redirectToDashboard() {
  window.location.href = "./q-dashboard.html";
}

/**
 * Require authentication + (optionally) specific DB roles.
 * @param {string[]} allowedRoles - array of DB role strings (ROLES.*). If empty/null -> any logged-in role allowed.
 */
async function requireAuth(allowedRoles) {
  try {
    const me = await getMyProfile();

    if (!me || !me.user || !me.profile) {
      // Not logged in or profile missing
      localStorage.removeItem(SESSION_KEY_COMPAT);
      redirectToLogin();
      return null;
    }

    const role = me.profile.role;

    if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
      if (!allowedRoles.includes(role)) {
        // Logged in but not allowed here
        redirectToDashboard();
        return null;
      }
    }

    // Allowed
    return me;
  } catch (e) {
    // Any error (including RLS) -> force back to login with a clean state
    console.error("Auth guard error:", e);
    localStorage.removeItem(SESSION_KEY_COMPAT);
    redirectToLogin();
    return null;
  }
}

async function logoutAndGoLogin() {
  const supabaseClient = getClient();
  try {
    await supabaseClient.auth.signOut();
  } catch (e) {
    // ignore
  }
  localStorage.removeItem(SESSION_KEY_COMPAT);
  window.location.href = "./login.html";
}

// Small UI helper for protected pages
function fillUserBadge(me, badgeId) {
  const el = document.getElementById(badgeId);
  if (!el || !me) return;

  const username = me.profile?.username || (me.user?.email ? me.user.email.split("@")[0] : "");
  const role = me.profile?.role || "";
  el.textContent = `User: ${username} | Role: ${role}`;
}

window.AUTH = {
  ROLES,
  requireAuth,
  logoutAndGoLogin,
  fillUserBadge,
  safePath,
  qs,
  USERNAME_DOMAIN,
};
