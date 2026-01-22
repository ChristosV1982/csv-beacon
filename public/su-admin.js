// public/su-admin.js
const sb = window.AUTH.ensureSupabase();

/* ------------------------ UI helpers ------------------------ */
function showWarn(msg) {
  const w = document.getElementById("warnBox");
  const ok = document.getElementById("okBox");
  if (ok) ok.style.display = "none";
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
function showOk(msg) {
  const ok = document.getElementById("okBox");
  const w = document.getElementById("warnBox");
  if (w) w.style.display = "none";
  if (!ok) return;
  ok.textContent = msg;
  ok.style.display = "block";
}
function clearOk() {
  const ok = document.getElementById("okBox");
  if (!ok) return;
  ok.textContent = "";
  ok.style.display = "none";
}
function setStatus(text) {
  const el = document.getElementById("statusLine");
  if (el) el.textContent = text || "";
}
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function isUUID(x) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(x || ""));
}

/* ------------------------ Supabase call ------------------------ */
async function getAccessToken() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("No session token. Please login again.");
  return token;
}

async function callSuAdmin(body) {
  const token = await getAccessToken();

  const url = `${window.AUTH.SUPABASE_URL}/functions/v1/su-admin`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: window.AUTH.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text(); // capture raw body even on errors

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}\n\n${text || "(empty response body)"}`);
  }

  // Try parse JSON, fallback to raw text
  try {
    const data = JSON.parse(text || "{}");
    if (data?.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
    return data;
  } catch {
    return { raw: text };
  }
}

/* ------------------------ State ------------------------ */
const state = {
  vessels: [],
  users: [],
  roles: ["super_admin", "company_admin", "company_superintendent", "vessel", "inspector"],
};

/* ------------------------ Tabs ------------------------ */
function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const t = btn.getAttribute("data-tab");
      document.getElementById("tab-users").style.display = t === "users" ? "" : "none";
      document.getElementById("tab-vessels").style.display = t === "vessels" ? "" : "none";
      document.getElementById("tab-rights").style.display = t === "rights" ? "" : "none";
    });
  });
}

/* ------------------------ Render: dropdowns ------------------------ */
function renderRoleDropdown() {
  const sel = document.getElementById("cu_role");
  if (!sel) return;
  sel.innerHTML = state.roles.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
}

function renderVesselDropdown() {
  const sel = document.getElementById("cu_vessel");
  if (!sel) return;

  const opts = [];
  opts.push(`<option value="">(No vessel)</option>`);
  for (const v of state.vessels) {
    opts.push(`<option value="${esc(v.id)}">${esc(v.name || v.vessel_name || v.title || v.id)}</option>`);
  }
  sel.innerHTML = opts.join("");
}

/* ------------------------ Render: users ------------------------ */
function vesselNameById(id) {
  if (!id) return "";
  const v = state.vessels.find((x) => String(x.id) === String(id));
  return v?.name || v?.vessel_name || "";
}

function renderUsers() {
  const tbody = document.getElementById("usersBody");
  if (!tbody) return;

  const q = (document.getElementById("u_search")?.value || "").trim().toLowerCase();

  const rows = [];
  const users = Array.isArray(state.users) ? state.users : [];

  const filtered = users.filter((u) => {
    if (!q) return true;
    const hay = [
      u.username,
      u.role,
      u.position,
      vesselNameById(u.vessel_id),
      u.vessel_name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted small">No users found.</td></tr>`;
    return;
  }

  for (const u of filtered) {
    const disabled = !!u.is_disabled;
    const active = u.is_active === false ? false : true; // default true if missing
    const statusPill = disabled || !active
      ? `<span class="pill bad">Disabled</span>`
      : `<span class="pill ok">Active</span>`;

    const forceReset = u.force_password_reset ? `<span class="pill bad">Yes</span>` : `<span class="pill ok">No</span>`;

    // We assume the profile id is the auth user id (UUID) stored in profiles.id
    const uid = u.id;

    const actionBtns = [];
    if (disabled || !active) {
      actionBtns.push(
        `<button class="btnSmall btn" data-act="enable_user" data-id="${esc(uid)}" type="button">Enable</button>`
      );
    } else {
      actionBtns.push(
        `<button class="btnSmall btnDanger" data-act="disable_user" data-id="${esc(uid)}" type="button">Disable</button>`
      );
    }
    actionBtns.push(
      `<button class="btnSmall btn2" data-act="reset_password" data-id="${esc(uid)}" type="button">Reset password</button>`
    );

    rows.push(`
      <tr>
        <td class="mono">${esc(u.username || "")}</td>
        <td>${esc(u.role || "")}</td>
        <td>${esc(u.position || "")}</td>
        <td>${esc(u.vessel_name || vesselNameById(u.vessel_id) || "")}</td>
        <td>${statusPill}</td>
        <td>${forceReset}</td>
        <td><div class="actions">${actionBtns.join("")}</div></td>
      </tr>
    `);
  }

  tbody.innerHTML = rows.join("");

  // Row button handlers (event delegation)
  tbody.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      clearWarn();
      clearOk();

      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");

      try {
        if (!id || !isUUID(id)) throw new Error("Invalid user id in row.");

        if (act === "disable_user") {
          const reason = prompt("Disable reason (optional):") || "";
          await callSuAdmin({ action: "disable_user", user_id: id, reason });
          showOk("User disabled.");
          await refreshUsers();
        } else if (act === "enable_user") {
          await callSuAdmin({ action: "enable_user", user_id: id });
          showOk("User enabled.");
          await refreshUsers();
        } else if (act === "reset_password") {
          const newPass = prompt("Enter new password for this user:");
          if (!newPass) return;
          const force = confirm("Force password change on next login?");
          await callSuAdmin({ action: "reset_password", user_id: id, new_password: newPass, force_password_reset: force });
          showOk("Password reset completed.");
          await refreshUsers();
        }
      } catch (e) {
        showWarn(String(e?.message || e));
      }
    });
  });
}

/* ------------------------ Render: vessels ------------------------ */
function renderVessels() {
  const tbody = document.getElementById("vesselsBody");
  if (!tbody) return;

  const q = (document.getElementById("v_search")?.value || "").trim().toLowerCase();
  const vessels = Array.isArray(state.vessels) ? state.vessels : [];

  const filtered = vessels.filter((v) => {
    if (!q) return true;
    const hay = [v.name, v.imo_number, v.hull_number, v.call_sign].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted small">No vessels found.</td></tr>`;
    return;
  }

  const rows = [];
  for (const v of filtered) {
    const active = v.is_active === false ? false : true;
    const statusPill = active ? `<span class="pill ok">Active</span>` : `<span class="pill bad">Inactive</span>`;

    // We will use upsert_vessel for activate/deactivate, passing is_active toggle.
    const btn = active
      ? `<button class="btnSmall btnDanger" data-act="deactivate" data-id="${esc(v.id)}" type="button">Deactivate</button>`
      : `<button class="btnSmall btn" data-act="activate" data-id="${esc(v.id)}" type="button">Activate</button>`;

    rows.push(`
      <tr>
        <td>${esc(v.name || "")}</td>
        <td>${esc(v.hull_number || "")}</td>
        <td>${esc(v.imo_number || "")}</td>
        <td>${esc(v.call_sign || "")}</td>
        <td>${statusPill}</td>
        <td><div class="actions">${btn}</div></td>
      </tr>
    `);
  }

  tbody.innerHTML = rows.join("");

  tbody.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      clearWarn();
      clearOk();
      try {
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        const v = state.vessels.find((x) => String(x.id) === String(id));
        if (!v) throw new Error("Vessel not found in state.");

        const nextActive = act === "activate";
        await callSuAdmin({
          action: "upsert_vessel",
          vessel: {
            id: v.id,
            name: v.name,
            hull_number: v.hull_number,
            imo_number: v.imo_number,
            call_sign: v.call_sign,
            is_active: nextActive,
          },
        });

        showOk(nextActive ? "Vessel activated." : "Vessel deactivated.");
        await refreshVessels();
        renderVesselDropdown(); // keeps Create User dropdown up to date
      } catch (e) {
        showWarn(String(e?.message || e));
      }
    });
  });
}

/* ------------------------ Refresh data ------------------------ */
function normalizeListResponse(resp) {
  // Allow different shapes: array, {data:[...]}, {users:[...]} etc.
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp?.data)) return resp.data;
  if (Array.isArray(resp?.users)) return resp.users;
  if (Array.isArray(resp?.vessels)) return resp.vessels;
  if (Array.isArray(resp?.items)) return resp.items;
  return [];
}

async function refreshUsers() {
  setStatus("Loading users…");
  const resp = await callSuAdmin({ action: "list_users" });
  state.users = normalizeListResponse(resp);
  renderUsers();
  setStatus("Ready");
}

async function refreshVessels() {
  setStatus("Loading vessels…");
  const resp = await callSuAdmin({ action: "list_vessels" });
  state.vessels = normalizeListResponse(resp);
  renderVessels();
  setStatus("Ready");
}

/* ------------------------ Create user ------------------------ */
function initCreateUser() {
  const btn = document.getElementById("cu_createBtn");
  const clearBtn = document.getElementById("cu_clearBtn");

  const posPick = document.getElementById("cu_position_pick");
  if (posPick) {
    posPick.addEventListener("change", () => {
      const v = posPick.value || "";
      if (v && document.getElementById("cu_position")) {
        document.getElementById("cu_position").value = v;
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearWarn();
      clearOk();
      document.getElementById("cu_username").value = "";
      document.getElementById("cu_password").value = "";
      document.getElementById("cu_position").value = "";
      document.getElementById("cu_position_pick").value = "";
      document.getElementById("cu_vessel").value = "";
      document.getElementById("cu_force_reset").checked = false;
    });
  }

  if (!btn) return;

  btn.addEventListener("click", async () => {
    clearWarn();
    clearOk();

    try {
      const username = (document.getElementById("cu_username").value || "").trim();
      const password = (document.getElementById("cu_password").value || "").trim();
      const role = document.getElementById("cu_role").value;
      const position = (document.getElementById("cu_position").value || "").trim();
      const vessel_id = (document.getElementById("cu_vessel").value || "").trim();
      const force_password_reset = !!document.getElementById("cu_force_reset").checked;

      if (!username) throw new Error("Username is required.");
      if (!password) throw new Error("Password is required.");
      if (!role) throw new Error("Role is required.");

      // Send exactly what the Edge Function needs. Username is WITHOUT domain by design.
      setStatus("Creating user…");
      const resp = await callSuAdmin({
        action: "create_user",
        username,
        password,
        role,
        position: position || null,
        vessel_id: vessel_id || null,
        force_password_reset,
      });

      showOk(`User created successfully.\n\nResponse:\n${JSON.stringify(resp, null, 2)}`);

      // Refresh list
      await refreshUsers();
      setStatus("Ready");
    } catch (e) {
      setStatus("Ready");
      showWarn(String(e?.message || e));
    }
  });
}

/* ------------------------ Vessel create ------------------------ */
function initAddVessel() {
  const btn = document.getElementById("v_addBtn");
  const clearBtn = document.getElementById("v_clearBtn");

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearWarn();
      clearOk();
      document.getElementById("v_name").value = "";
      document.getElementById("v_hull").value = "";
      document.getElementById("v_imo").value = "";
      document.getElementById("v_call").value = "";
    });
  }

  if (!btn) return;

  btn.addEventListener("click", async () => {
    clearWarn();
    clearOk();

    try {
      const name = (document.getElementById("v_name").value || "").trim();
      const hull_number = (document.getElementById("v_hull").value || "").trim();
      const imo_number = (document.getElementById("v_imo").value || "").trim();
      const call_sign = (document.getElementById("v_call").value || "").trim();

      if (!name) throw new Error("Vessel name is required.");

      setStatus("Adding vessel…");
      const resp = await callSuAdmin({
        action: "upsert_vessel",
        vessel: {
          name,
          hull_number: hull_number || null,
          imo_number: imo_number || null,
          call_sign: call_sign || null,
          is_active: true,
        },
      });

      showOk(`Vessel saved.\n\nResponse:\n${JSON.stringify(resp, null, 2)}`);

      await refreshVessels();
      renderVesselDropdown();
      setStatus("Ready");
    } catch (e) {
      setStatus("Ready");
      showWarn(String(e?.message || e));
    }
  });
}

/* ------------------------ Search inputs ------------------------ */
function initSearch() {
  const u = document.getElementById("u_search");
  if (u) u.addEventListener("input", () => renderUsers());

  const v = document.getElementById("v_search");
  if (v) v.addEventListener("input", () => renderVessels());
}

/* ------------------------ Init ------------------------ */
async function init() {
  clearWarn();
  clearOk();
  setStatus("Loading…");

  initTabs();

  const me = await window.AUTH.requireAuth(["super_admin"], {
    unauthorizedRedirect: "./q-dashboard.html",
  });
  if (!me) return;

  // Optional: show user badge
  const badge = document.getElementById("userBadge");
  if (badge) badge.textContent = `Logged in`;

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.href = "./login.html";
  });

  // Connectivity test (shows real error if Function missing)
  await callSuAdmin({ action: "ping" });

  // Initialize UI wiring
  renderRoleDropdown();
  initCreateUser();
  initAddVessel();
  initSearch();

  // Load data
  await refreshVessels();
  renderVesselDropdown();
  await refreshUsers();

  setStatus("Ready");
}

init().catch((e) => showWarn(String(e?.message || e)));
