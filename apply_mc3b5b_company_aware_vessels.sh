#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc3b5b_company_aware_vessels

cp public/su-admin.html backup_before_mc3b5b_company_aware_vessels/su-admin.html
cp public/su-admin.js backup_before_mc3b5b_company_aware_vessels/su-admin.js

if [ -f "public/service-worker.js" ]; then
  cp public/service-worker.js backup_before_mc3b5b_company_aware_vessels/service-worker.js
fi

node <<'NODE'
const fs = require("fs");

const htmlPath = "public/su-admin.html";
let html = fs.readFileSync(htmlPath, "utf8");

/* ------------------------------------------------------------
   1. Add Company dropdown to Add vessel form
------------------------------------------------------------ */

if (!html.includes('id="v_company"')) {
  html = html.replace(
    `<div class="field">
            <label>Vessel name</label>
            <input id="v_name" placeholder="e.g. OLYMPIC FIGHTER" />
          </div>`,
    `<div class="field">
            <label>Company</label>
            <select id="v_company">
              <option value="">Loading companies…</option>
            </select>
            <div class="muted small">New vessel will be created under the selected company.</div>
          </div>

          <div style="height:10px;"></div>

          <div class="field">
            <label>Vessel name</label>
            <input id="v_name" placeholder="e.g. OLYMPIC FIGHTER" />
          </div>`
  );
}

/* ------------------------------------------------------------
   2. Add Company column to Vessel list table
------------------------------------------------------------ */

html = html.replace(
  `<th>Name</th>
                  <th>Hull</th>`,
  `<th>Company</th>
                  <th>Name</th>
                  <th>Hull</th>`
);

html = html.replace(
  `<tr><td colspan="6" class="muted small">Loading…</td></tr>`,
  `<tr><td colspan="7" class="muted small">Loading…</td></tr>`
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
  if (start < 0) {
    throw new Error(`Function not found: ${name}`);
  }
  const end = findBlockEnd(s, start);
  if (end < 0) {
    throw new Error(`Could not find end of function: ${name}`);
  }
  s = s.slice(0, start) + replacement + s.slice(end);
}

function replaceAsyncFunction(name, replacement) {
  const marker = `async function ${name}(`;
  const start = s.indexOf(marker);
  if (start < 0) {
    throw new Error(`Async function not found: ${name}`);
  }
  const end = findBlockEnd(s, start);
  if (end < 0) {
    throw new Error(`Could not find end of async function: ${name}`);
  }
  s = s.slice(0, start) + replacement + s.slice(end);
}

/* ------------------------------------------------------------
   Add helper if missing
------------------------------------------------------------ */

if (!s.includes("function renderVesselCompanyDropdown()")) {
  const helper = `

function renderVesselCompanyDropdown() {
  const sel = document.getElementById("v_company");
  if (!sel) return;

  const companies = Array.isArray(state.companies) ? state.companies : [];

  if (!companies.length) {
    sel.innerHTML = '<option value="">No companies loaded</option>';
    return;
  }

  const selected = sel.value || state.selectedCompanyId || companies[0]?.id || "";

  sel.innerHTML = [
    '<option value="">Select company…</option>',
    ...companies
      .filter((c) => c.is_active !== false)
      .map((c) => {
        const label = c.company_name || c.short_name || c.company_code || c.id;
        return '<option value="' + esc(c.id) + '">' + esc(label) + '</option>';
      })
  ].join("");

  if (selected && companies.some((c) => String(c.id) === String(selected))) {
    sel.value = selected;
  } else if (companies[0]?.id) {
    sel.value = companies[0].id;
  }
}
`;

  s = s.replace("/* ======================== Render: roles/vessels dropdown ======================== */", helper + "\n/* ======================== Render: roles/vessels dropdown ======================== */");
}

/* ------------------------------------------------------------
   Patch renderVesselDropdown for Create User dropdown
------------------------------------------------------------ */

replaceFunction("renderVesselDropdown", `function renderVesselDropdown() {
  const sel = document.getElementById("cu_vessel");
  if (!sel) return;

  const opts = [];
  opts.push('<option value="">(No vessel)</option>');

  for (const v of state.vessels) {
    const vesselName = v.name || v.vessel_name || v.title || v.id;
    const company = v.company_name ? " — " + v.company_name : "";
    opts.push('<option value="' + esc(v.id) + '">' + esc(vesselName + company) + '</option>');
  }

  sel.innerHTML = opts.join("");
}`);

/* ------------------------------------------------------------
   Patch renderVessels
------------------------------------------------------------ */

replaceFunction("renderVessels", `function renderVessels() {
  const tbody = document.getElementById("vesselsBody");
  if (!tbody) return;

  const q = (document.getElementById("v_search")?.value || "").trim().toLowerCase();
  const vessels = Array.isArray(state.vessels) ? state.vessels : [];

  const filtered = vessels.filter((v) => {
    if (!q) return true;
    const hay = [
      v.company_name,
      v.name,
      v.imo_number,
      v.hull_number,
      v.call_sign
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted small">No vessels found.</td></tr>';
    return;
  }

  const rows = [];

  for (const v of filtered) {
    const active = v.is_active === false ? false : true;
    const statusPill = active
      ? '<span class="pill ok">Active</span>'
      : '<span class="pill bad">Inactive</span>';

    const btn = active
      ? '<button class="btnSmall btnDanger" data-act="deactivate" data-id="' + esc(v.id) + '" type="button">Deactivate</button>'
      : '<button class="btnSmall btn" data-act="activate" data-id="' + esc(v.id) + '" type="button">Activate</button>';

    rows.push(\`
      <tr>
        <td>\${esc(v.company_name || "")}</td>
        <td>\${esc(v.name || "")}</td>
        <td>\${esc(v.hull_number || "")}</td>
        <td>\${esc(v.imo_number || "")}</td>
        <td>\${esc(v.call_sign || "")}</td>
        <td>\${statusPill}</td>
        <td><div class="actions">\${btn}</div></td>
      </tr>
    \`);
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

        setStatus(nextActive ? "Activating vessel…" : "Deactivating vessel…");

        await csvbRpc("csvb_admin_upsert_vessel", {
          p_vessel_id: v.id,
          p_company_id: v.company_id || publicDefaultCompanyId(),
          p_name: v.name || "",
          p_hull_number: v.hull_number || null,
          p_imo_number: v.imo_number ? String(v.imo_number) : null,
          p_call_sign: v.call_sign || null,
          p_is_active: nextActive,
          p_move_related: false
        });

        showOk(nextActive ? "Vessel activated." : "Vessel deactivated.");

        await refreshVessels();
        renderVesselDropdown();

        if (typeof refreshCompanies === "function") {
          await refreshCompanies();
        }

        setStatus("Ready");
      } catch (e) {
        setStatus("Ready");
        showWarn(String(e?.message || e));
      }
    });
  });
}`);

/* ------------------------------------------------------------
   Helper for default company fallback
------------------------------------------------------------ */

if (!s.includes("function publicDefaultCompanyId()")) {
  s = s.replace(
    "function vesselNameById(id) {",
    `function publicDefaultCompanyId() {
  return state.selectedCompanyId || state.companies?.[0]?.id || null;
}

function vesselNameById(id) {`
  );
}

/* ------------------------------------------------------------
   Patch refreshVessels
------------------------------------------------------------ */

replaceAsyncFunction("refreshVessels", `async function refreshVessels() {
  setStatus("Loading vessels…");

  if (typeof ensureCompaniesLoaded === "function") {
    await ensureCompaniesLoaded();
  }

  renderVesselCompanyDropdown();

  state.vessels = await csvbRpc("csvb_admin_list_vessels_by_company", {
    p_company_id: null
  });

  renderVessels();
  renderVesselDropdown();

  setStatus("Ready");
}`);

/* ------------------------------------------------------------
   Patch initAddVessel
------------------------------------------------------------ */

replaceFunction("initAddVessel", `function initAddVessel() {
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

      renderVesselCompanyDropdown();
    });
  }

  if (!btn) return;

  btn.addEventListener("click", async () => {
    clearWarn();
    clearOk();

    try {
      if (typeof ensureCompaniesLoaded === "function") {
        await ensureCompaniesLoaded();
      }

      renderVesselCompanyDropdown();

      const company_id = (document.getElementById("v_company")?.value || "").trim();
      const name = (document.getElementById("v_name").value || "").trim();
      const hull_number = (document.getElementById("v_hull").value || "").trim();
      const imo_number_raw = (document.getElementById("v_imo").value || "").trim();
      const call_sign = (document.getElementById("v_call").value || "").trim();

      if (!company_id) throw new Error("Company is required.");
      if (!name) throw new Error("Vessel name is required.");

      if (imo_number_raw && !/^\\\\d+$/.test(imo_number_raw)) {
        throw new Error("IMO number must contain digits only, or remain blank.");
      }

      setStatus("Adding vessel…");

      const resp = await csvbRpc("csvb_admin_upsert_vessel", {
        p_vessel_id: null,
        p_company_id: company_id,
        p_name: name,
        p_hull_number: hull_number || null,
        p_imo_number: imo_number_raw || null,
        p_call_sign: call_sign || null,
        p_is_active: true,
        p_move_related: true
      });

      showOk("Vessel saved.\\n\\n" + JSON.stringify(resp, null, 2));

      document.getElementById("v_name").value = "";
      document.getElementById("v_hull").value = "";
      document.getElementById("v_imo").value = "";
      document.getElementById("v_call").value = "";

      state.selectedCompanyId = company_id;

      await refreshVessels();

      if (typeof refreshCompanies === "function") {
        await refreshCompanies();
        const c = companyById(company_id);
        if (c) fillCompanyForm(c);
        if (typeof refreshSelectedCompanyDetails === "function") {
          await refreshSelectedCompanyDetails();
        }
      }

      setStatus("Ready");
    } catch (e) {
      setStatus("Ready");
      showWarn(String(e?.message || e));
    }
  });
}`);

/* ------------------------------------------------------------
   Ensure renderVesselCompanyDropdown is called after companies refresh
------------------------------------------------------------ */

if (!s.includes("renderVesselCompanyDropdown();\n\n  renderCompanies();")) {
  s = s.replace(
    "renderCompanies();\n\n  if (!state.selectedCompanyId",
    "renderVesselCompanyDropdown();\n\n  renderCompanies();\n\n  if (!state.selectedCompanyId"
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
  s = s.replace(/const CACHE_VERSION = "[^"]+";/, 'const CACHE_VERSION = "v10-mc3b5b-company-aware-vessels";');
}

fs.writeFileSync(p, s);
NODE
fi

cat > public/MC3B5B_COMPANY_AWARE_VESSELS_APPLIED.txt <<'TXT'
MC-3B5B applied:
- Vessels tab now has Company dropdown when adding a vessel.
- Vessel list now includes Company column.
- Vessel add/activate/deactivate uses csvb_admin_upsert_vessel RPC.
- No auth.js changes.
- No Supabase key changes.
- No SQL changes.
TXT

echo "DONE: MC-3B5B company-aware vessels UI applied."
echo "Next: open Superuser Administration > Vessels and hard refresh with Ctrl + Shift + R."
