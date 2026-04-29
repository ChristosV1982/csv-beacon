#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc3b6b_vessel_delete_button

cp public/su-admin.js backup_before_mc3b6b_vessel_delete_button/su-admin.js

if [ -f "public/service-worker.js" ]; then
  cp public/service-worker.js backup_before_mc3b6b_vessel_delete_button/service-worker.js
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

/* Replace renderVessels with safe-delete-aware version */
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

    const activeBtn = active
      ? '<button class="btnSmall btnDanger" data-act="deactivate" data-id="' + esc(v.id) + '" type="button">Deactivate</button>'
      : '<button class="btnSmall btn" data-act="activate" data-id="' + esc(v.id) + '" type="button">Activate</button>';

    const deleteBtn =
      '<button class="btnSmall btnDanger" data-act="delete" data-id="' + esc(v.id) + '" type="button">Delete</button>';

    rows.push(\`
      <tr>
        <td>\${esc(v.company_name || "")}</td>
        <td>\${esc(v.name || "")}</td>
        <td>\${esc(v.hull_number || "")}</td>
        <td>\${esc(v.imo_number || "")}</td>
        <td>\${esc(v.call_sign || "")}</td>
        <td>\${statusPill}</td>
        <td><div class="actions">\${activeBtn}\${deleteBtn}</div></td>
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

        if (act === "delete") {
          const message =
            "Delete vessel?\\n\\n" +
            "Vessel: " + (v.name || id) + "\\n" +
            "Company: " + (v.company_name || "") + "\\n\\n" +
            "This will only work if the vessel has no linked users, questionnaires, inspections, audits, or other operational records.\\n\\n" +
            "If linked records exist, deletion will be blocked and you should deactivate the vessel instead.";

          if (!confirm(message)) return;

          const typeConfirm = prompt('Type DELETE to confirm vessel deletion:');

          if (typeConfirm !== "DELETE") {
            showWarn("Delete cancelled. Confirmation text did not match DELETE.");
            return;
          }

          setStatus("Deleting vessel…");

          const result = await csvbRpc("csvb_admin_delete_vessel_if_unused", {
            p_vessel_id: id
          });

          showOk("Vessel deleted.\\n\\n" + JSON.stringify(result, null, 2));

          await refreshVessels();

          if (typeof refreshCompanies === "function") {
            await refreshCompanies();
          }

          if (typeof refreshSelectedCompanyDetails === "function") {
            await refreshSelectedCompanyDetails();
          }

          setStatus("Ready");
          return;
        }

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

        if (typeof refreshSelectedCompanyDetails === "function") {
          await refreshSelectedCompanyDetails();
        }

        setStatus("Ready");
      } catch (e) {
        setStatus("Ready");
        showWarn(String(e?.message || e));
      }
    });
  });
}`);

fs.writeFileSync(file, s, "utf8");

// Bump service worker cache version.
const sw = "public/service-worker.js";

if (fs.existsSync(sw)) {
  let x = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(x)) {
    x = x.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v13-mc3b6b-vessel-delete-button";'
    );
  }

  fs.writeFileSync(sw, x, "utf8");
}

fs.writeFileSync(
  "public/MC3B6B_VESSEL_DELETE_BUTTON_APPLIED.txt",
  "Added safe Delete button to Superuser Administration > Vessels. Uses csvb_admin_delete_vessel_if_unused. No auth/Supabase key/SQL changes.\\n",
  "utf8"
);

console.log("DONE: MC-3B6B vessel delete button applied.");
NODE

echo "DONE: MC-3B6B completed."
echo "Next: open Superuser Administration > Vessels and hard refresh with Ctrl + Shift + R."
