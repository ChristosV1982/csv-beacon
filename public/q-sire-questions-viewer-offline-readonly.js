// public/q-sire-questions-viewer-offline-readonly.js
// C.S.V. BEACON — SIRE Questions Viewer Offline Read-only Runtime
// Phase 2B. Local IndexedDB package only. No server writes. No sync execution.

(() => {
  "use strict";

  const BUILD = "SIRE-OFFLINE-READONLY-2026-05-26-PHASE2B";
  const PACKAGE_ID = "sire_questions_viewer_active_v1";

  const $ = (id) => document.getElementById(id);
  const s = (v) => v === null || v === undefined ? "" : String(v);
  const esc = (v) => s(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  let pkg = null;
  let rows = [];
  let selected = null;

  function msg(id, value) {
    const el = $(id);
    if (!el) return;
    el.textContent = value || "";
    el.style.display = value ? "block" : "none";
  }

  function pget(p, keys) {
    if (!p || typeof p !== "object") return "";
    for (const k of keys) {
      const v = p[k];
      if (v === null || v === undefined) continue;
      const out = s(v);
      if (out.trim()) return out;
    }
    return "";
  }

  function numberBase(row) {
    const raw = s(row?.number_base || row?.number_full || "").trim().replace(/-$/, "");
    const m = raw.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) return raw || "—";
    return `${String(Number(m[1])).padStart(2, "0")}.${String(Number(m[2])).padStart(2, "0")}.${String(Number(m[3])).padStart(2, "0")}`;
  }

  function qno(row) {
    const nb = numberBase(row);
    const suffix = s(row?.number_suffix).trim();
    return suffix ? `${nb}-${suffix}` : nb;
  }

  function qkey(row) {
    const nb = numberBase(row);
    const m = nb.match(/^(\d+)\.(\d+)\.(\d+)$/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), nb] : [999,999,999,nb];
  }

  function normNone(v) {
    const out = s(v).trim();
    return out && out.toLowerCase() !== "none" ? out : "";
  }

  function responseTypes(p) {
    const out = [];
    if (normNone(pget(p, ["Human Response Type", "Human_Response_Type", "human_response_type", "humanResponseType"]))) out.push("Human");
    if (normNone(pget(p, ["Hardware Response Type", "Hardware_Response_Type", "hardware_response_type", "hardwareResponseType"]))) out.push("Hardware");
    if (normNone(pget(p, ["Process Response Type", "Process_Response_Type", "process_response_type", "processResponseType"]))) out.push("Process");
    if (s(pget(p, ["Photo Response", "Photo_Response", "photo_response", "photoResponse"])).trim().toUpperCase() === "Y") out.push("Photo");
    return out;
  }

  function splitTokens(v) {
    return s(v).split(",").map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean);
  }

  function rankTokens(row) {
    return splitTokens(pget(row?.payload || {}, [
      "Company Rank Allocation",
      "Company_Rank_Allocation",
      "company_rank_allocation",
      "companyRankAllocation"
    ]));
  }

  function chapter(row) {
    const m = numberBase(row).match(/^(\d+)\./);
    return m ? String(Number(m[1])).padStart(2, "0") : "";
  }

  function flatten(value) {
    if (value === null || value === undefined) return "";
    if (["string", "number", "boolean"].includes(typeof value)) return s(value);
    if (Array.isArray(value)) return value.map(flatten).join(" ");
    if (typeof value === "object") return Object.values(value).map(flatten).join(" ");
    return "";
  }

  function haystack(row) {
    const p = row?.payload || {};
    return [
      qno(row), row?.version, row?.status, row?.source_type,
      pget(p, ["short_text", "Short Text", "ShortText", "shortText"]),
      pget(p, ["question", "Question"]),
      pget(p, ["inspection_guidance", "Inspection Guidance", "InspectionGuidance", "guidance"]),
      pget(p, ["suggested_inspector_actions", "Suggested Inspector Actions", "SuggestedInspectorActions", "actions"]),
      pget(p, ["Question Type", "question_type", "questionType"]),
      pget(p, ["Vessel Type", "vessel_type", "vesselType"]),
      pget(p, ["Company Rank Allocation", "Company_Rank_Allocation", "company_rank_allocation", "companyRankAllocation"]),
      responseTypes(p).join(" "),
      flatten(p.__offline_pgno),
      flatten(p.__offline_ee),
      flatten(p.__offline_references)
    ].join(" ").toLowerCase();
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
  }

  function fillSelect(id, values, label) {
    const el = $(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = `<option value="">${esc(label)}</option>` + values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    if (current && values.includes(current)) el.value = current;
  }

  function populateFilters() {
    fillSelect("chapterFilter", unique(rows.map(chapter)), "All chapters");
    fillSelect("qtypeFilter", unique(rows.map((r) => pget(r.payload || {}, ["Question Type", "question_type", "questionType"])).filter(Boolean)), "All question types");
    fillSelect("rtypeFilter", unique(rows.flatMap((r) => responseTypes(r.payload || {}))), "All response types");
    fillSelect("rankFilter", unique(rows.flatMap(rankTokens)), "All ranks");
  }

  function filteredRows() {
    const term = s($("searchInput")?.value).trim().toLowerCase();
    const ch = s($("chapterFilter")?.value);
    const qt = s($("qtypeFilter")?.value);
    const rt = s($("rtypeFilter")?.value);
    const rk = s($("rankFilter")?.value);

    return rows
      .filter((row) => !term || haystack(row).includes(term))
      .filter((row) => !ch || chapter(row) === ch)
      .filter((row) => !qt || pget(row.payload || {}, ["Question Type", "question_type", "questionType"]) === qt)
      .filter((row) => !rt || responseTypes(row.payload || {}).includes(rt))
      .filter((row) => !rk || rankTokens(row).includes(rk))
      .sort((a, b) => {
        const ka = qkey(a), kb = qkey(b);
        for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
        return ka[3].localeCompare(kb[3]);
      });
  }

  function renderList() {
    const list = $("qList");
    if (!list) return;
    const data = filteredRows();
    $("countLine").textContent = `${data.length}/${rows.length}`;

    if (!data.length) {
      list.innerHTML = `<div class="notice">No matching questions.</div>`;
      return;
    }

    list.innerHTML = data.map((row) => {
      const p = row.payload || {};
      const sub = pget(p, ["short_text", "Short Text", "ShortText", "shortText"]) || pget(p, ["question", "Question"]);
      const active = selected && qno(selected) === qno(row) ? " active" : "";
      return `<div class="qItem${active}" data-qno="${esc(qno(row))}"><div class="qNo">${esc(qno(row))}</div><div class="qSub">${esc(sub)}</div></div>`;
    }).join("");

    list.querySelectorAll(".qItem").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-qno");
        const row = rows.find((x) => qno(x) === id);
        if (row) selectRow(row);
      });
    });
  }

  function attrTile(label, value) {
    return `<div class="tile"><div class="lbl">${esc(label)}</div><div class="val">${esc(value || "—")}</div></div>`;
  }

  function pgnoCode(row, index) {
    return `${numberBase(row)}.${String(index + 1).padStart(2, "0")}`;
  }

  function renderListItems(items, type, row) {
    if (!Array.isArray(items) || !items.length) return `<div>No ${esc(type)} stored in offline package.</div>`;
    return items.map((it, i) => {
      const code = type === "PGNO" ? pgnoCode(row, i) : String(i + 1) + ".";
      const extra = [it.esms_references ? `eSMS Reference(s): ${it.esms_references}` : "", it.esms_forms ? `eSMS Form(s): ${it.esms_forms}` : "", it.remarks ? `Remarks: ${it.remarks}` : ""].filter(Boolean).join("\n");
      return `<div class="itemBox"><div class="code">${esc(code)}</div><div>${esc(it.text || "")}</div>${extra ? `<div style="margin-top:6px;color:#5E6F86;font-weight:750;">${esc(extra)}</div>` : ""}</div>`;
    }).join("");
  }

  function selectRow(row) {
    selected = row;
    const p = row.payload || {};
    $("emptyState").style.display = "none";
    $("detailPanel").style.display = "block";

    $("vNo").textContent = qno(row);
    $("vShort").textContent = pget(p, ["short_text", "Short Text", "ShortText", "shortText"]);
    $("vQuestion").textContent = pget(p, ["question", "Question"]);
    $("vGuidance").textContent = pget(p, ["inspection_guidance", "Inspection Guidance", "InspectionGuidance", "guidance"]);
    $("vActions").textContent = pget(p, ["suggested_inspector_actions", "Suggested Inspector Actions", "SuggestedInspectorActions", "actions"]);

    $("vAttrs").innerHTML = `<div class="grid2">${[
      attrTile("Question Type", pget(p, ["Question Type", "question_type", "questionType"])),
      attrTile("Vessel Type", pget(p, ["Vessel Type", "vessel_type", "vesselType"])),
      attrTile("Company Rank Allocation", pget(p, ["Company Rank Allocation", "Company_Rank_Allocation", "company_rank_allocation", "companyRankAllocation"])),
      attrTile("Response Type", responseTypes(p).join(", ")),
      attrTile("Version", row.version),
      attrTile("Status", row.status || "active")
    ].join("")}</div>`;

    $("vEe").innerHTML = renderListItems(p.__offline_ee || [], "Expected Evidence", row);
    $("vPgno").innerHTML = renderListItems(p.__offline_pgno || [], "PGNO", row);
    renderList();
  }

  async function loadPackage() {
    msg("warnBox", "");
    msg("okBox", "");
    $("connectionPill").textContent = navigator.onLine ? "Online" : "Offline";

    if (!window.CSVB_OFFLINE_DB) throw new Error("Offline DB helper is not loaded.");
    const offlineDb = window.CSVB_OFFLINE_DB;
    pkg = await offlineDb.get(offlineDb.STORES.PACKAGES, PACKAGE_ID);

    if (!pkg?.rows?.length) {
      rows = [];
      $("packageMeta").textContent = "No SIRE offline package found on this device. Open Online Viewer and download package first.";
      msg("warnBox", "No SIRE Questions Viewer offline package found on this device.");
      renderList();
      return;
    }

    rows = pkg.rows || [];
    populateFilters();
    $("packageMeta").textContent = `Package downloaded: ${pkg.downloaded_at || "—"} • Questions: ${rows.length} • PGNO sets: ${Object.keys(pkg.pgno_by_question_id || {}).length} • Evidence sets: ${Object.keys(pkg.ee_by_question_id || {}).length} • Build: ${BUILD}`;
    msg("okBox", `Offline package loaded. ${rows.length} active SIRE questions available locally.`);
    renderList();
    if (rows.length) selectRow(filteredRows()[0] || rows[0]);
  }

  function wire() {
    $("reloadBtn")?.addEventListener("click", () => loadPackage().catch((e) => msg("warnBox", String(e?.message || e))));
    ["searchInput", "chapterFilter", "qtypeFilter", "rtypeFilter", "rankFilter"].forEach((id) => {
      $(id)?.addEventListener("input", renderList);
      $(id)?.addEventListener("change", renderList);
    });
    window.addEventListener("online", () => { $("connectionPill").textContent = "Online"; });
    window.addEventListener("offline", () => { $("connectionPill").textContent = "Offline"; });
  }

  async function boot() {
    window.CSVB_SIRE_OFFLINE_READONLY = { BUILD, loadPackage, getRows: () => rows.slice(), getSelected: () => selected };
    wire();
    try { await loadPackage(); }
    catch (e) { msg("warnBox", "Failed to load offline package:\n\n" + String(e?.message || e)); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
