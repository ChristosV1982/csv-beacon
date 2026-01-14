// public/su-admin.js
const sb = window.AUTH.ensureSupabase();

function showWarn(msg) {
  const w = document.getElementById("warnBox");
  if (!w) return alert(msg);
  w.textContent = msg;
  w.style.display = "block";
}

async function init() {
  const me = await window.AUTH.requireAuth(["super_admin"], {
    unauthorizedRedirect: "./q-dashboard.html",
  });
  if (!me) return;

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.href = "./login.html";
  });
}

init().catch((e) => showWarn(String(e?.message || e)));
