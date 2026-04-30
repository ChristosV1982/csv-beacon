#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc9c3c_effective_template_flow

for f in \
  public/q-company.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc9c3c_effective_template_flow/$(basename "$f")
  fi
done

node <<'NODE'
const fs = require("fs");

const file = "public/q-company.js";

if (!fs.existsSync(file)) {
  console.error("ERROR: public/q-company.js not found.");
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

replaceAsyncFunction("createQuestionnaireFromTemplateFlow", `async function createQuestionnaireFromTemplateFlow(templateId) {
  clearWarn();

  const vesselId = el("vesselSelect")?.value || "";
  const title = (el("titleInput")?.value || "").trim();
  const assigned = getAssignedPositionFromUI();

  if (!vesselId) {
    showWarn("Select a vessel first (Vessel).");
    return;
  }

  if (!title) {
    showWarn("Enter a title first (Title).");
    return;
  }

  setSubLine("Creating questionnaire from template using effective company library...");

  const { data, error } = await supabaseClient.rpc("csvb_create_questionnaire_from_template_effective", {
    p_template_id: templateId,
    p_vessel_id: vesselId,
    p_title: title,
    p_assigned_position: assigned || null
  });

  if (error) {
    showWarn("Create from template failed: " + error.message);
    setSubLine("Ready.");
    return;
  }

  const qid = data;

  await refreshAll();

  if (qid) {
    window.location.href = "./q-answer.html?qid=" + encodeURIComponent(qid);
  }
}`);

const sw = "public/service-worker.js";

if (fs.existsSync(sw)) {
  let x = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(x)) {
    x = x.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v26-mc9c3c-effective-template-flow";'
    );
  }

  fs.writeFileSync(sw, x, "utf8");
}

fs.writeFileSync(file, s, "utf8");

fs.writeFileSync(
  "public/MC9C3C_EFFECTIVE_TEMPLATE_FLOW_APPLIED.txt",
  "MC-9C3C applied: Company Builder template creation now uses effective company question library RPC.\\n",
  "utf8"
);

console.log("DONE: MC-9C3C template flow patched.");
NODE

echo "DONE: MC-9C3C completed."
echo "Next: open Company Builder and hard refresh with Ctrl + Shift + R."
