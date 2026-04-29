#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc3b7_company_aware_user_creation

cp public/su-admin.html backup_before_mc3b7_company_aware_user_creation/su-admin.html
cp public/su-admin.js backup_before_mc3b7_company_aware_user_creation/su-admin.js

if [ -f "public/service-worker.js" ]; then
  cp public/service-worker.js backup_before_mc3b7_company_aware_user_creation/service-worker.js
fi

node <<'NODE'
const fs = require("fs");

const htmlPath = "public/su-admin.html";
let html = fs.readFileSync(htmlPath, "utf8");

/* ------------------------------------------------------------
   1. Add Company dropdown to Create User form
------------------------------------------------------------ */

if (!html.includes('id="cu_company"')) {
  html = html.replace(
    `<div class="field">
              <label>Username (without @domain)</label>
              <input id="cu_username" placeholder="e.g. master_olympic_fighter" />
              <div class="muted small">The Edge Function will append your configured username domain.</div>
            </div>`,
    `<div class="field">
              <label>Company</label>
              <select id="cu_company">
                <option value="">Loading companies…</option>
              </select>
              <div class="muted small">Required for all non-platform users. Vessel list is filtered by selected company.</div>
            </div>

            <div style="height:10px;"></div>

            <div class="field">
              <label>Username (without @domain)</label>
              <input id="cu_username" placeholder="e.g. master_olympic_fighter" />
              <div class="muted small">The Edge Function will append your configured username domain.</div>
            </div>`
  );
}

/* ------------------------------------------------------------
   2. Add Company column to Users list
------------------------------------------------------------ */

html = html.replace(
  `<th>Username</th>
                    <th>Role</th>`,
  `<th>Company</th>
                    <th>Username</th>
                    <th>Role</th>`
);

html = html.replace(
  `<tr><td colspan="7" class="muted small">Loading…</td></tr>`,
  `<tr><td colspan="8" class="muted small">Loading…</td></tr>`
);

fs.writeFileSync(htmlPath, html, "utf8");
NODE

node <<'NODE'
const fs = require("fs");

const jsPath = "public/su-admin.js";
let s = fs.readFileSync(jsPath, "utf8");

function findBlockEnd(str, start) {
  const open = str.indexOf("{", start);
  if (open < 0) return -1;

  let depth = 0;
  let quote = null;
  let escape = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = open; i < str.length; i++) {
    const ch = str[i];
    const next = str[i + 1];

    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === "/" && next === "/") {
      lineComment = true;
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      blockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }

  return -1;
}

function replaceFunction(name, replacement) {
  const marker = `function ${name}(`;
  const start = s.indexOf(marker);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  const end = findBlockEnd(s, start);
  if (end < 0) throw new Error(`Could not find end of function: ${name}`);
  s = s.slice(0, start) + replacement + s.slice(end);
}

function replaceAsyncFunction(name, replacement) {
  const marker = `async function ${name}(`;
  const start = s.indexOf(marker);
  if (start < 0) throw new Error(`Async function not found: ${name}`);
  const end = findBlockEnd(s, start);
  if (end < 0) throw new Error(`Could not find end of async function: ${name}`);
  s = s.slice(0, start) + replacement + s.slice(end);
}

/* ------------------------------------------------------------
   1. Add MC-3B7 helpers
------------------------------------------------------------ */

if (!s.includes("MC-3B7 Company-aware User Creation Helpers")) {
  const helper = `

/* ======================== MC-3B7 Company-aware User Creation Helpers ======================== */

function isPlatformUserRole(role) {
  return String(role || "") === "super_admin" || String(role || "") === "platform_owner";
}

function renderUserCompanyDropdown() {
  const sel = document.getElementById("cu_company");
  if (!sel) return;

  const companies = Array.isArray(state.companies) ? state.companies : [];

  if (!companies.length) {
    sel.innerHTML = '<option value="">No companies loaded</option>';
    return;
  }

  const current = sel.value || state.selectedCompanyId || companies[0]?.id || "";

  sel.innerHTML = [
    '<option value="">Select company…</option>',
    ...companies
      .filter((c) => c.is_active !== false)
      .map((c) => {
        const label = c.company_name || c.short_name || c.company_code || c.id;
        return '<option value="' + esc(c.id) + '">' + esc(label) + '</option>';
      })
  ].join("");

  if (current && companies.some((c) => String(c.id) === String(current))) {
    sel.value = current;
  } else if (companies[0]?.id) {
    sel.value = companies[0].id;
  }

  updateCreateUserCompanyControls();
}

function currentCreateUserCompanyId() {
  const role = document.getElementById("cu_role")?.value || "";
  if (isPlatformUserRole(role)) return null;

  return (document.getElementById("cu_company")?.value || "").trim() || null;
}

function updateCreateUserCompanyControls() {
  const role = document.getElementById("cu_role")?.value || "";
  const companySel = document.getElementById("cu_company");
  const vesselSel = document.getElementById("cu_vessel");

  const isPlatform = isPlatformUserRole(role);

  if (companySel) companySel.disabled = isPlatform;
  if (vesselSel) vesselSel.disabled = isPlatform;

  if (isPlatform) {
    if (companySel) companySel.value = "";
    if (vesselSel) vesselSel.value = "";
  }
}

async function findUserIdByUsername(username) {
  const target = String(username || "").trim().toLowerCase();
  if (!target) return null;

  const existing = (state.users || []).find((u) => String(u.username || "").toLowerCase() === target);
  if (existing?.id) return existing.id;

  const rpcUsers = await csvbRpc("csvb_admin_list_users_by_company", { p_company_id: null });
  const found = (rpcUsers || []).find((u) => String(u.username || "").toLowerCase() === target);

  return found?.id || null;
}

function extractCreatedUserId(resp) {
  if (!resp || typeof resp !== "object") return null;

  const candidates = [
    resp.user_id,
    resp.id,
    resp.profile_id,
    resp?.user?.id,
    resp?.profile?.id,
    resp?.data?.user?.id,
    resp?.data?.profile?.id,
  ];

  const found = candidates.find((x) => x && isUUID(x));
  return found || null;
}
`;

  const marker = "/* ======================== Render: roles/vessels dropdown ======================== */";
  if (s.includes(marker)) {
    s = s.replace(marker, helper + "\n" + marker);
  } else {
    s = helper + "\n" + s;
  }
}

/* ------------------------------------------------------------
   2. Patch renderRoleDropdown
------------------------------------------------------------ */

replaceFunction("renderRoleDropdown", `function renderRoleDropdown() {
  const sel = document.getElementById("cu_role");
  if (!sel) return;

  const current = sel.value;

  sel.innerHTML = state.roles.map((r) => '<option value="' + esc(r) + '">' + esc(r) + '</option>').join("");

  if (current && state.roles.includes(current)) {
    sel.value = current;
  }

  updateCreateUserCompanyControls();
}`);

/* ------------------------------------------------------------
   3. Patch renderVesselDropdown to filter by create-user company
------------------------------------------------------------ */

replaceFunction("renderVesselDropdown", `function renderVesselDropdown() {
  const sel = document.getElementById("cu_vessel");
  if (!sel) return;

  const current = sel.value;
  const companyId = currentCreateUserCompanyId();

  const opts = [];
  opts.push('<option value="">(No vessel)</option>');

  for (const v of state.vessels) {
    if (companyId && String(v.company_id || "") !== String(companyId)) continue;

    const vesselName = v.name || v.vessel_name || v.title || v.id;
    const company = v.company_name ? " — " + v.company_name : "";
    opts.push('<option value="' + esc(v.id) + '">' + esc(vesselName + company) + '</option>');
  }

  sel.innerHTML = opts.join("");

  if (current && Array.from(sel.options).some((o) => String(o.value) === String(current))) {
    sel.value = current;
  }

  updateCreateUserCompanyControls();
}`);

/* ------------------------------------------------------------
   4. Patch renderUsers to show company column
------------------------------------------------------------ */

replaceFunction("renderUsers", `function renderUsers() {
  const tbody = document.getElementById("usersBody");
  if (!tbody) return;

  const q = (document.getElementById("u_search")?.value || "").trim().toLowerCase();
  const users = Array.isArray(state.users) ? state.users : [];

  const filtered = users.filter((u) => {
    if (!q) return true;

    const hay = [
      u.company_name,
      u.username,
      u.role,
      u.role_name,
      u.position,
      u.user_position,
      vesselNameById(u.vessel_id),
      u.vessel_name
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return hay.includes(q);
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="muted small">No users found.</td></tr>';
    return;
  }

  const rows = [];

  for (const u of filtered) {
    const disabled = !!u.is_disabled;
    const active = u.is_active === false ? false : true;

    const statusPill =
      disabled || !active
        ? '<span class="pill bad">Disabled</span>'
        : '<span class="pill ok">Active</span>';

    const forceReset = u.force_password_reset
      ? '<span class="pill bad">Yes</span>'
      : '<span class="pill ok">No</span>';

    const uid = u.id;
    const roleName = u.role || u.role_name || "";
    const positionName = u.position || u.user_position || "";

    const actionBtns = [];

    if (disabled || !active) {
      actionBtns.push(
        '<button class="btnSmall btn" data-act="enable_user" data-id="' + esc(uid) + '" type="button">Enable</button>'
      );
    } else {
      actionBtns.push(
        '<button class="btnSmall btnDanger" data-act="disable_user" data-id="' + esc(uid) + '" type="button">Disable</button>'
      );
    }

    actionBtns.push(
      '<button class="btnSmall btn2" data-act="reset_password" data-id="' + esc(uid) + '" type="button">Reset password</button>'
    );

    rows.push(\`
      <tr>
        <td>\${esc(u.company_name || "")}</td>
        <td class="mono">\${esc(u.username || "")}</td>
        <td>\${esc(roleName)}</td>
        <td>\${esc(positionName)}</td>
        <td>\${esc(u.vessel_name || vesselNameById(u.vessel_id) || "")}</td>
        <td>\${statusPill}</td>
        <td>\${forceReset}</td>
        <td><div class="actions">\${actionBtns.join("")}</div></td>
      </tr>
    \`);
  }

  tbody.innerHTML = rows.join("");

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
}`);

/* ------------------------------------------------------------
   5. Patch refreshUsers to use company-aware RPC
------------------------------------------------------------ */

replaceAsyncFunction("refreshUsers", `async function refreshUsers() {
  setStatus("Loading users…");

  if (typeof ensureCompaniesLoaded === "function") {
    await ensureCompaniesLoaded();
  }

  const rows = await csvbRpc("csvb_admin_list_users_by_company", {
    p_company_id: null
  });

  state.users = (rows || []).map((u) => ({
    ...u,
    role: u.role || u.role_name,
    position: u.position || u.user_position
  }));

  renderUsers();
  renderUserCompanyDropdown();
  renderVesselDropdown();

  setStatus("Ready");
}`);

/* ------------------------------------------------------------
   6. Patch initCreateUser
------------------------------------------------------------ */

replaceFunction("initCreateUser", `function initCreateUser() {
  const btn = document.getElementById("cu_createBtn");
  const clearBtn = document.getElementById("cu_clearBtn");
  const companySel = document.getElementById("cu_company");
  const roleSel = document.getElementById("cu_role");

  const posPick = document.getElementById("cu_position_pick");

  if (posPick) {
    posPick.addEventListener("change", () => {
      const v = posPick.value || "";
      const free = document.getElementById("cu_position");
      if (v && free) free.value = v;
    });
  }

  if (companySel) {
    companySel.addEventListener("change", () => {
      renderVesselDropdown();
    });
  }

  if (roleSel) {
    roleSel.addEventListener("change", () => {
      updateCreateUserCompanyControls();
      renderVesselDropdown();
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

      renderUserCompanyDropdown();
      renderVesselDropdown();
    });
  }

  renderUserCompanyDropdown();
  renderVesselDropdown();

  if (!btn) return;

  btn.addEventListener("click", async () => {
    clearWarn();
    clearOk();

    try {
      if (typeof ensureCompaniesLoaded === "function") {
        await ensureCompaniesLoaded();
      }

      renderUserCompanyDropdown();
      renderVesselDropdown();

      const username = (document.getElementById("cu_username").value || "").trim();
      const password = (document.getElementById("cu_password").value || "").trim();
      const role = document.getElementById("cu_role").value;
      const position = (document.getElementById("cu_position").value || "").trim();
      const company_id = currentCreateUserCompanyId();
      const vessel_id = (document.getElementById("cu_vessel").value || "").trim();
      const force_password_reset = !!document.getElementById("cu_force_reset").checked;

      if (!username) throw new Error("Username is required.");
      if (!password) throw new Error("Password is required.");
      if (!role) throw new Error("Role is required.");

      if (!isPlatformUserRole(role) && !company_id) {
        throw new Error("Company is required for non-platform users.");
      }

      if (isPlatformUserRole(role) && vessel_id) {
        throw new Error("Platform users cannot be assigned to vessels.");
      }

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

      let userId = extractCreatedUserId(resp);

      await refreshUsers();

      if (!userId) {
        userId = await findUserIdByUsername(username);
      }

      if (!userId) {
        throw new Error(
          "User was created, but the new profile id could not be found for company assignment. Refresh the page and verify the user."
        );
      }

      if (!isPlatformUserRole(role)) {
        if (vessel_id) {
          await csvbRpc("csvb_admin_set_profile_vessel", {
            p_user_id: userId,
            p_vessel_id: vessel_id,
          });
        } else {
          await csvbRpc("csvb_admin_set_profile_company", {
            p_user_id: userId,
            p_company_id: company_id,
          });
        }
      }

      showOk("User created and company context assigned.\\n\\n" + JSON.stringify(resp, null, 2));

      document.getElementById("cu_username").value = "";
      document.getElementById("cu_password").value = "";
      document.getElementById("cu_position").value = "";
      document.getElementById("cu_position_pick").value = "";
      document.getElementById("cu_vessel").value = "";
      document.getElementById("cu_force_reset").checked = false;

      state.selectedCompanyId = company_id || state.selectedCompanyId;

      await refreshUsers();

      if (typeof refreshCompanies === "function") {
        await refreshCompanies();
      }

      if (typeof refreshSelectedCompanyDetails === "function") {
        await refreshSelectedCompanyDetails();
      }

      renderUserCompanyDropdown();
      renderVesselDropdown();

      setStatus("Ready");
    } catch (e) {
      setStatus("Ready");
      showWarn(String(e?.message || e));
    }
  });
}`);

/* ------------------------------------------------------------
   7. Ensure refreshVessels also refreshes create-user controls
------------------------------------------------------------ */

if (!s.includes("renderUserCompanyDropdown();\n\n  renderVessels();")) {
  s = s.replace(
    "renderVessels();\n  renderVesselDropdown();",
    "renderUserCompanyDropdown();\n\n  renderVessels();\n  renderVesselDropdown();"
  );
}

fs.writeFileSync(jsPath, s, "utf8");
NODE

# Bump service worker cache version
if [ -f "public/service-worker.js" ]; then
  node <<'NODE'
const fs = require("fs");
const p = "public/service-worker.js";
let s = fs.readFileSync(p, "utf8");

if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
  s = s.replace(/const CACHE_VERSION = "[^"]+";/, 'const CACHE_VERSION = "v14-mc3b7-company-aware-users";');
}

fs.writeFileSync(p, s);
NODE
fi

cat > public/MC3B7_COMPANY_AWARE_USER_CREATION_APPLIED.txt <<'TXT'
MC-3B7 applied:
- Create User form now has Company dropdown.
- Vessel dropdown is filtered by selected company.
- User list now shows Company column.
- User creation still uses existing su-admin Edge Function.
- After creation, user is assigned to selected company/vessel using existing RPCs.
- No auth.js changes.
- No Supabase key changes.
- No SQL changes.
TXT

echo "DONE: MC-3B7 company-aware user creation applied."
echo "Next: open Superuser Administration > Users and hard refresh with Ctrl + Shift + R."
