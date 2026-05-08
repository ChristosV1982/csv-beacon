const fs = require("fs");

const file = "public/su-admin.js";

if (!fs.existsSync(file)) {
  console.error("ERROR: public/su-admin.js not found.");
  process.exit(1);
}

fs.mkdirSync("backup_before_mc3b5b_dropdown_repair", { recursive: true });
fs.copyFileSync(file, "backup_before_mc3b5b_dropdown_repair/su-admin.js");

let s = fs.readFileSync(file, "utf8");

/*
  Repair:
  Some MC-3B5B calls were inserted, but the helper function was not present.
  We insert it near the top before it can be called.
*/

const helper = `
/* ======================== MC-3B5B Repair: Vessel Company Dropdown ======================== */

function renderVesselCompanyDropdown() {
  const sel = document.getElementById("v_company");
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
}

/* Compatibility alias in case a previous patch inserted a misspelled call */
function renderVeselCompanyDropdown() {
  return renderVesselCompanyDropdown();
}

`;

if (!s.includes("function renderVesselCompanyDropdown()")) {
  const marker = "/* ======================== Render: roles/vessels dropdown ======================== */";

  if (s.includes(marker)) {
    s = s.replace(marker, helper + "\n" + marker);
  } else {
    const stateEnd = s.indexOf("/* ======================== Tabs ========================");
    if (stateEnd >= 0) {
      s = s.slice(0, stateEnd) + helper + "\n" + s.slice(stateEnd);
    } else {
      s = helper + "\n" + s;
    }
  }
} else if (!s.includes("function renderVeselCompanyDropdown()")) {
  s += "\n\nfunction renderVeselCompanyDropdown(){ return renderVesselCompanyDropdown(); }\n";
}

fs.writeFileSync(file, s, "utf8");

// Bump service worker cache version.
const sw = "public/service-worker.js";
if (fs.existsSync(sw)) {
  let x = fs.readFileSync(sw, "utf8");
  if (/const CACHE_VERSION = "[^"]+";/.test(x)) {
    x = x.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v11-mc3b5b-dropdown-repair";'
    );
    fs.writeFileSync(sw, x, "utf8");
  }
}

fs.writeFileSync(
  "public/MC3B5B_DROPDOWN_REPAIR_APPLIED.txt",
  "Repaired missing renderVesselCompanyDropdown helper. No DB/auth/Supabase key changes.\\n",
  "utf8"
);

console.log("DONE: MC-3B5B vessel company dropdown repair applied.");
