// public/su-admin.js
const sb = window.AUTH.ensureSupabase();

function showWarn(msg) {
  const w = document.getElementById("warnBox");
  if (!w) return alert(msg);
  w.textContent = msg;
  w.style.display = "block";
}
function clearWarn() {
  const w = document.getElementById("warnBox");
  if (!w) return;
  w.textContent = "";
  w.style.display = "none";
}

async function getAccessToken() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("No session token. Please login again.");
  return token;
}

async function callSuAdmin(body) {
  const token = await getAccessToken();
  const { data, error } = await sb.functions.invoke("su-admin", {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function init() {
  clearWarn();

  const me = await window.AUTH.requireAuth(["super_admin"], {
    unauthorizedRedirect: "./q-dashboard.html",
  });
  if (!me) return;

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.href = "./login.html";
  });

  // Quick connectivity test (shows real error if JWT/Function missing)
  try {
    await callSuAdmin({ action: "ping" });
  } catch (e) {
    showWarn(String(e?.message || e));
    return;
  }

  // If you already built UI tabs, keep using callSuAdmin({action: ...})
  // Example usage:
  // const users = await callSuAdmin({ action: "list_users" });
  // const vessels = await callSuAdmin({ action: "list_vessels" });
}

init().catch((e) => showWarn(String(e?.message || e)));
