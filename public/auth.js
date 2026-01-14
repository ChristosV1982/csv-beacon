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
  return p.startsWith("./") ? p : `./${p}`;
}

async function tryGetVesselName(vesselId) {
  if (!vesselId) return "";
  try {
    const supabaseClient = getClient();
    const { data, error } = await supabaseClient
      .from("vessels")
      .select("name")
      .eq("id", vesselId)
      .maybeSingle();
    if (error) return "";
    return data?.name || "";
  } catch {
    return "";
  }
}

function setCompatSession(profile, user, vesselName) {
  localStorage.setItem(
    SESSION_KEY_COMPAT,
    JSON.stringify({
      username: profile?.username || (user?.email ? user.email.split("@")[0] : ""),
      role: profile?.role || "",
      position: profile?.position || "",
      vessel_id: profile?.vessel_id || null,
      vessel: vesselName || "",
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

  const { data: profile, error: profErr } = await supabaseClient
    .from("profiles")
    .select("id, username, role, vessel_id, position")
    .eq("id", user.id)
    .single();

  if (profErr) throw profErr;

  const vesselName = await tryGetVesselName(profile?.vessel_id);
  setCompatSession(profile, user, vesselName);

  return { user, profile, vesselName };
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
 * @param {string[]} allowedRoles - array of DB role strings. If empty/null -> any logged-in role allowed.
 */
async function requireAuth(allowedRoles) {
  try {
    const me = await getMyProfile();

    if (!me || !me.user || !me.profile) {
      localStorage.removeItem(SESSION_KEY_COMPAT);
      redirectToLogin();
      return null;
    }

    const role = me.profile.role;

    if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
      if (!allowedRoles.includes(role)) {
        redirectToDashboard();
        return null;
      }
    }

    return me;
  } catch (e) {
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
  } catch {}
  localStorage.removeItem(SESSION_KEY_COMPAT);
  window.location.href = "./login.html";
}

function fillUserBadge(me, badgeId) {
  const el = document.getElementById(badgeId);
  if (!el || !me) return;

  const username = me.profile?.username || (me.user?.email ? me.user.email.split("@")[0] : "");
  const role = me.profile?.role || "";
  const position = me.profile?.position || "";
  const vesselName = me.vesselName || "";

  const extra = [
    position ? `Position: ${position}` : "",
    vesselName ? `Vessel: ${vesselName}` : "",
  ].filter(Boolean).join(" | ");

  el.textContent = `User: ${username} | Role: ${role}` + (extra ? ` | ${extra}` : "");
}

window.AUTH = {
  ROLES,
  getClient,
  requireAuth,
  logoutAndGoLogin,
  fillUserBadge,
  safePath,
  qs,
  USERNAME_DOMAIN,
};
