#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc3b8_user_list_filters

cp public/su-admin.js backup_before_mc3b8_user_list_filters/su-admin.js

if [ -f "public/service-worker.js" ]; then
  cp public/service-worker.js backup_before_mc3b8_user_list_filters/service-worker.js
fi

node <<'NODE'
const fs = require("fs");

const file = "public/su-admin.js";

if (!fs.existsSync(file)) {
  console.error("ERROR: public/su-admin.js not found.");
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

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

  if (start < 0) {
    throw new Error(`Function not found: ${name}`);
  }

  const end = findBlockEnd(s, start);

  if (end < 0) {
    throw new Error(`Could not find end of function: ${name}`);
  }

  s = s.slice(0, start) + replacement + s.slice(end);
}

/* ------------------------------------------------------------
   1. Add filter helper functions
------------------------------------------------------------ */

if (!s.includes("MC-3B8 User List Filters")) {
  const helper = `

/* ======================== MC-3B8 User List Filters ======================== */

function userRoleValue(u) {
  return String(u?.role || u?.role_name || "");
}

function userPositionValue(u) {
  return String(u?.position || u?.user_position || "");
}

function userCompanyValue(u) {
  return u?.company_id ? String(u.company_id) : "__platform";
}

function userVesselValue(u) {
  return u?.vessel_id ? String(u.vessel_id) : "__none";
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
}

function setSelectOptionsPreserve(sel, options, previousValue) {
  if (!sel) return;

  sel.innerHTML = options.map((o) => {
    return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>';
  }).join("");

  if (previousValue && Array.from(sel.options).some((o) => String(o.value) === String(previousValue))) {
    sel.value = previousValue;
  }
}

function ensureUserFiltersBar() {
  const search = document.getElementById("u_search");
  if (!search) return;

  if (document.getElementById("u_filters_bar")) return;

  const hostRow = search.closest(".row") || search.parentElement;

  const bar = document.createElement("div");
  bar.id = "u_filters_bar";
  bar.style.marginTop = "10px";
  bar.style.marginBottom = "10px";
  bar.style.padding = "10px";
  bar.style.border = "1px solid #D6E4F5";
  bar.style.borderRadius = "12px";
  bar.style.background = "#F4F8FC";

  bar.innerHTML =
    '<div style="font-weight:950;color:#062A5E;margin-bottom:8px;">User filters</div>' +
    '<div style="display:grid;grid-template-columns:repeat(5,minmax(130px,1fr));gap:8px;align-items:end;">' +
      '<div class="field"><label>Company</label><select id="u_filter_company"><option value="">All companies</option></select></div>' +
      '<div class="field"><label>Role</label><select id="u_filter_role"><option value="">All roles</option></select></div>' +
      '<div class="field"><label>Status</label><select id="u_filter_status">' +
        '<option value="">All statuses</option>' +
        '<option value="active">Active</option>' +
        '<option value="disabled">Disabled / inactive</option>' +
      '</select></div>' +
      '<div class="field"><label>Vessel</label><select id="u_filter_vessel"><option value="">All vessels</option></select></div>' +
      '<div class="field"><label>&nbsp;</label><button class="btn2 btnSmall" type="button" id="u_filter_clear">Clear filters</button></div>' +
    '</div>';

  hostRow.insertAdjacentElement("afterend", bar);

  ["u_filter_company", "u_filter_role", "u_filter_status", "u_filter_vessel"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", renderUsers);
  });

  const clearBtn = document.getElementById("u_filter_clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const q = document.getElementById("u_search");
      if (q) q.value = "";

      ["u_filter_company", "u_filter_role", "u_filter_status", "u_filter_vessel"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });

      renderUsers();
    });
  }
}

function renderUserFilterDropdowns() {
  ensureUserFiltersBar();

  const users = Array.isArray(state.users) ? state.users : [];

  const companySel = document.getElementById("u_filter_company");
  const roleSel = document.getElementById("u_filter_role");
  const vesselSel = document.getElementById("u_filter_vessel");

  const prevCompany = companySel?.value || "";
  const prevRole = roleSel?.value || "";
  const prevVessel = vesselSel?.value || "";

  const companies = [];

  companies.push({ value: "", label: "All companies" });

  const activeCompanies = Array.isArray(state.companies) ? state.companies : [];

  activeCompanies.forEach((c) => {
    companies.push({
      value: String(c.id),
      label: c.company_name || c.short_name || c.company_code || c.id,
    });
  });

  if (users.some((u) => !u.company_id)) {
    companies.push({ value: "__platform", label: "Platform / no company" });
  }

  setSelectOptionsPreserve(companySel, companies, prevCompany);

  const roles = uniqueSorted(users.map((u) => userRoleValue(u)));

  setSelectOptionsPreserve(
    roleSel,
    [{ value: "", label: "All roles" }, ...roles.map((r) => ({ value: r, label: r }))],
    prevRole
  );

  const vesselOptions = [{ value: "", label: "All vessels" }];

  if (users.some((u) => !u.vessel_id)) {
    vesselOptions.push({ value: "__none", label: "No vessel" });
  }

  const vesselMap = new Map();

  (Array.isArray(state.vessels) ? state.vessels : []).forEach((v) => {
    vesselMap.set(String(v.id), v.name || v.vessel_name || v.id);
  });

  users.forEach((u) => {
    if (u.vessel_id && !vesselMap.has(String(u.vessel_id))) {
      vesselMap.set(String(u.vessel_id), u.vessel_name || String(u.vessel_id));
    }
  });

  Array.from(vesselMap.entries())
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    .forEach(([id, name]) => {
      vesselOptions.push({ value: id, label: name });
    });

  setSelectOptionsPreserve(vesselSel, vesselOptions, prevVessel);
}

`;

  const marker = "/* ======================== Render: users ======================== */";

  if (s.includes(marker)) {
    s = s.replace(marker, helper + "\n" + marker);
  } else {
    s += helper;
  }
}

/* ------------------------------------------------------------
   2. Replace renderUsers with filter-aware version
------------------------------------------------------------ */

replaceFunction("renderUsers", `function renderUsers() {
  const tbody = document.getElementById("usersBody");
  if (!tbody) return;

  ensureUserFiltersBar();
  renderUserFilterDropdowns();

  const q = (document.getElementById("u_search")?.value || "").trim().toLowerCase();

  const fCompany = document.getElementById("u_filter_company")?.value || "";
  const fRole = document.getElementById("u_filter_role")?.value || "";
  const fStatus = document.getElementById("u_filter_status")?.value || "";
  const fVessel = document.getElementById("u_filter_vessel")?.value || "";

  const users = Array.isArray(state.users) ? state.users : [];

  const filtered = users.filter((u) => {
    const roleName = userRoleValue(u);
    const positionName = userPositionValue(u);
    const companyValue = userCompanyValue(u);
    const vesselValue = userVesselValue(u);

    const disabled = !!u.is_disabled || u.is_active === false;
    const statusValue = disabled ? "disabled" : "active";

    if (fCompany && companyValue !== fCompany) return false;
    if (fRole && roleName !== fRole) return false;
    if (fStatus && statusValue !== fStatus) return false;
    if (fVessel && vesselValue !== fVessel) return false;

    if (q) {
      const hay = [
        u.company_name,
        u.username,
        roleName,
        positionName,
        vesselNameById(u.vessel_id),
        u.vessel_name
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!hay.includes(q)) return false;
    }

    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="muted small">No users match the selected filters.</td></tr>';
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

    rows.push(
      '<tr>' +
        '<td>' + esc(u.company_name || "") + '</td>' +
        '<td class="mono">' + esc(u.username || "") + '</td>' +
        '<td>' + esc(roleName) + '</td>' +
        '<td>' + esc(positionName) + '</td>' +
        '<td>' + esc(u.vessel_name || vesselNameById(u.vessel_id) || "") + '</td>' +
        '<td>' + statusPill + '</td>' +
        '<td>' + forceReset + '</td>' +
        '<td><div class="actions">' + actionBtns.join("") + '</div></td>' +
      '</tr>'
    );
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
   3. Ensure search input continues to work
------------------------------------------------------------ */

if (!s.includes("initUserFilters();")) {
  s = s.replace(
    "initSearch();",
    "initSearch();\n  if (typeof initUserFilters === \"function\") initUserFilters();"
  );
}

if (!s.includes("function initUserFilters()")) {
  s += `

function initUserFilters() {
  ensureUserFiltersBar();
  renderUserFilterDropdowns();
}
`;
}

fs.writeFileSync(file, s, "utf8");

// Bump service worker cache version.
const sw = "public/service-worker.js";

if (fs.existsSync(sw)) {
  let x = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(x)) {
    x = x.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v16-mc3b8-user-list-filters";'
    );
  }

  fs.writeFileSync(sw, x, "utf8");
}

fs.writeFileSync(
  "public/MC3B8_USER_LIST_FILTERS_APPLIED.txt",
  "Added User List filters for Company, Role, Status, Vessel, and search text. No DB/auth/Supabase key changes.\\n",
  "utf8"
);

console.log("DONE: MC-3B8 User List filters applied.");
NODE

echo "DONE: MC-3B8 completed."
echo "Next: open Superuser Administration > Users and hard refresh with Ctrl + Shift + R."
