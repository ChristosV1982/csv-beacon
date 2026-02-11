// public/q-questions-editor.js
(() => {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function safeStr(v) { return v === null || v === undefined ? "" : String(v); }

  // Null-safe event binder
  function onClick(id, fn) {
    const el = $(id);
    if (!el) {
      console.warn(`[q-questions-editor] Missing element #${id} (HTML out of sync).`);
      return false;
    }
    el.onclick = fn;
    return true;
  }
  function onChange(id, fn) {
    const el = $(id);
    if (!el) {
      console.warn(`[q-questions-editor] Missing element #${id} (HTML out of sync).`);
      return false;
    }
    el.onchange = fn;
    return true;
  }
  function onInput(id, fn) {
    const el = $(id);
    if (!el) {
      console.warn(`[q-questions-editor] Missing element #${id} (HTML out of sync).`);
      return false;
    }
    el.oninput = fn;
    return true;
  }

  function showWarn(msg) {
    const w = $("warnBox");
    if (!w) return;
    w.textContent = msg || "";
    w.style.display = msg ? "block" : "none";
  }
  function showOk(msg) {
    const w = $("okBox");
    if (!w) return;
    w.textContent = msg || "";
    w.style.display = msg ? "block" : "none";
  }
  function setText(id, txt) {
    const el = $(id);
    if (el) el.textContent = txt || "";
  }
  function isIntLike(v) {
    const n = Number(v);
    return Number.isFinite(n) && Math.floor(n) === n;
  }

  // ========= Payload helpers (handles keys with spaces / casing) =========
  function pGet(p, keys) {
    if (!p || typeof p !== "object") return "";
    for (const k of keys) {
      const v = p[k];
      if (v === null || v === undefined) continue;
      const s = safeStr(v);
      if (s.trim() !== "") return s;
    }
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(p, k)) return safeStr(p[k]);
    }
    return "";
  }
  function pSet(p, keyPreferred, altKeys, value) {
    p[keyPreferred] = value;
    if (Array.isArray(altKeys)) {
      for (const k of altKeys) p[k] = value;
    }
  }

  function normNone(v) {
    const s = safeStr(v).trim();
    if (!s) return "";
    if (s.toLowerCase() === "none") return "";
    return s;
  }

  function computeResponseTypesFromPayload(p) {
    const out = [];
    if (normNone(pGet(p, ["Human Response Type", "Human_Response_Type", "human_response_type", "humanResponseType"]))) out.push("Human");
    if (normNone(pGet(p, ["Hardware Response Type", "Hardware_Response_Type", "hardware_response_type", "hardwareResponseType"]))) out.push("Hardware");
    if (normNone(pGet(p, ["Process Response Type", "Process_Response_Type", "process_response_type", "processResponseType"]))) out.push("Process");

    const photo = safeStr(pGet(p, ["Photo Response", "Photo_Response", "photo_response", "photoResponse"])).trim().toUpperCase();
    if (photo === "Y") out.push("Photo");

    return out;
  }

  function responseTypeStringFromPayload(p) {
    const arr = computeResponseTypesFromPayload(p);
    return arr.length ? arr.join(", ") : "";
  }

  // ===== Number helpers =====
  function buildNumberBase(sourceType, xx, yy, zz) {
    const a = Number(xx), b = Number(yy), c = Number(zz);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return "";

    const p2 = (n) => String(n).padStart(2, "0");
    if (sourceType === "SIRE") return `${p2(a)}.${p2(b)}.${p2(c)}`;

    const p3 = (n) => String(n).padStart(3, "0");
    return `${p2(a)}.${p2(b)}.${p3(c)}`;
  }

  function computeNumberFull(numberBase, suffix) {
    const nb = safeStr(numberBase).trim();
    const sx = safeStr(suffix).trim();
    if (!nb) return "";
    return sx ? `${nb}-${sx}` : nb;
  }

  function normalizeNumberBaseValue(sourceType, numberBase) {
    const nb = safeStr(numberBase).trim();
    const m = nb.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return nb;

    const a = Number(m[1]), b = Number(m[2]), c = Number(m[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return nb;

    const p2 = (n) => String(n).padStart(2, "0");
    const p3 = (n) => String(n).padStart(3, "0");

    if (sourceType === "SIRE") return `${p2(a)}.${p2(b)}.${p2(c)}`;
    return `${p2(a)}.${p2(b)}.${p3(c)}`;
  }

  function normalizeNumberBaseRow(row) {
    const st = safeStr(row?.source_type).trim() || "SIRE";
    return normalizeNumberBaseValue(st, row?.number_base);
  }

  function displayNumber(row) {
    const sx = safeStr(row?.number_suffix).trim();
    const nbNorm = normalizeNumberBaseRow(row);
    const computed = computeNumberFull(nbNorm, sx);

    let nf = safeStr(row?.number_full).trim();
    if (nf && nf.endsWith("-") && !sx) nf = nf.slice(0, -1);

    return computed || nf || "—";
  }

  function parseNumberBase(nb) {
    const s = safeStr(nb).trim();
    const m = s.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return { xx:"", yy:"", zz:"" };
    return { xx: String(Number(m[1])), yy: String(Number(m[2])), zz: String(Number(m[3])) };
  }

  function numberKey(row) {
    const nb = normalizeNumberBaseRow(row);
    const m = nb.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return [9999, 9999, 999999, nb];
    return [Number(m[1]), Number(m[2]), Number(m[3]), nb];
  }

  function escapeHtml(s) {
    return safeStr(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Smart bullet split: avoids splitting wrapped lines into new bullets
  function splitBulletsSmart(text) {
    const raw = safeStr(text || "");
    if (!raw.trim()) return [];

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];

    const isBulletStart = (l) => (
      l.startsWith("•") ||
      l.startsWith("-") ||
      l.startsWith("–") ||
      l.startsWith("—") ||
      /^\d+\./.test(l)
    );

    const out = [];
    for (const line of lines) {
      const clean = line
        .replace(/^•\s*/, "")
        .replace(/^-\s*/, "")
        .replace(/^–\s*/, "")
        .replace(/^—\s*/, "")
        .trim();
      if (!clean) continue;

      if (!out.length) { out.push(clean); continue; }

      if (isBulletStart(line)) out.push(clean);
      else out[out.length - 1] = (out[out.length - 1] + " " + clean).trim();
    }
    return out;
  }

  // ===== PGNO helpers =====
  function pgnoCode(numberBase, seq1based, sourceType) {
    const nbNorm = normalizeNumberBaseValue(sourceType || "SIRE", numberBase);
    const s2 = String(seq1based).padStart(2, "0");
    return nbNorm ? `${nbNorm}.${s2}` : `?.?.?.${s2}`;
  }

  // ===== state =====
  let sb = null;
  let me = null;

  let allRows = [];
  let selected = null; // cloned copy
  let mode = "VIEW";   // VIEW | EDIT

  // list preference: short vs full question
  const LS_SHOW_FULL = "qe_show_full_question_in_list";
  function getShowFullInList() {
    return localStorage.getItem(LS_SHOW_FULL) === "1";
  }
  function setShowFullInList(v) {
    localStorage.setItem(LS_SHOW_FULL, v ? "1" : "0");
  }


  // ===== Facet filters (client-side) =====
  // Facet filters (all tick-boxes). Empty selection = "Select All".
  // Status/Source/Version are also used to build the DB query (server-side filtering).
  const FACETS = [
    { key: "status", title: "Status" },
    { key: "source", title: "Source" },
    { key: "version", title: "Version" },
    { key: "questionType", title: "Question Type" },
    { key: "vesselType", title: "Vessel Type" },
    { key: "responseType", title: "Response Type" },
    { key: "companyRank", title: "Company Rank Allocation" },
    { key: "chapter", title: "SIRE 2.0 Chapter" },
  ];

  const LS_FACET_PREFIX = "qe_facet_";
  function loadFacetSet(key) {
    try {
      const raw = localStorage.getItem(LS_FACET_PREFIX + key);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch {
      return new Set();
    }
  }
  function saveFacetSet(key, set) {
    try {
      localStorage.setItem(LS_FACET_PREFIX + key, JSON.stringify(Array.from(set)));
    } catch {}
  }

  const facetSelected = {
    status: loadFacetSet("status"),
    source: loadFacetSet("source"),
    version: loadFacetSet("version"),
    questionType: loadFacetSet("questionType"),
    vesselType: loadFacetSet("vesselType"),
    responseType: loadFacetSet("responseType"),
    companyRank: loadFacetSet("companyRank"),
    chapter: loadFacetSet("chapter"),
  };

  const SERVER_FACETS = new Set(["status", "source", "version"]);

  function facetDisplay(key, value) {
    const v = safeStr(value).trim();
    if (!v) return "";
    if (key === "status") return v; // active / inactive
    if (key === "source") {
      const map = {
        "SIRE": "SIRE",
        "COMPANY_CUSTOM": "Company (custom)",
        "SPARE_X": "Spare X",
        "SPARE_Z": "Spare Z",
      };
      return map[v] || v;
    }
    if (key === "chapter") return v; // already padded 2-digit
    return v;
  }

  function chapterKey(row) {
    const nb = normalizeNumberBaseRow(row);
    const m = nb.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return "";
    return String(Number(m[1])).padStart(2, "0");
  }

  // ===== Token helpers for facets stored as comma-separated combinations =====
  function splitCsvTokens(v) {
    const s = safeStr(v).trim();
    if (!s) return [];
    return s
      .split(",")
      .map(x => safeStr(x).trim())
      .map(x => x.replace(/\s+/g, " "))
      .filter(Boolean);
  }

  function normalizeVesselToken(t) {
    const s = safeStr(t).trim().toLowerCase();
    if (!s) return "";
    if (s === "oil") return "Oil";
    if (s === "chemical" || s === "chem") return "Chemical";
    if (s === "lng") return "LNG";
    if (s === "lpg") return "LPG";
    return "";
  }

  function vesselTokensFromRow(row) {
    const p = row?.payload || {};
    const raw = safeStr(pGet(p, ["Vessel Type", "vessel_type", "vesselType"])).trim();
    const toks = splitCsvTokens(raw).map(normalizeVesselToken).filter(Boolean);
    // dedupe
    return Array.from(new Set(toks));
  }

  function companyRankTokensFromRow(row) {
    const p = row?.payload || {};
    const raw = safeStr(pGet(p, ["Company Rank Allocation", "company_rank_allocation", "companyRankAllocation"])).trim();
    const toks = splitCsvTokens(raw)
      .map(x => x.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return Array.from(new Set(toks));
  }

  function facetValue(row, key) {
    const p = row?.payload || {};
    if (key === "status") return safeStr(row?.status).trim();
    if (key === "source") return safeStr(row?.source_type).trim();
    if (key === "version") return safeStr(row?.version).trim();
    if (key === "questionType") return safeStr(pGet(p, ["Question Type", "question_type", "questionType"])).trim();
    // vesselType & companyRank are handled as token arrays (not single combined strings)
    if (key === "chapter") return chapterKey(row);
    return "";
  }

  function responseTypesArray(row) {
    const p = row?.payload || {};
    return computeResponseTypesFromPayload(p);
  }

  function rowMatchesFacet(row, key, excludeKey) {
    if (excludeKey && key === excludeKey) return true;

    const sel = facetSelected[key];
    if (!sel || sel.size === 0) return true;

    if (key === "responseType") {
      const rt = responseTypesArray(row);
      for (const want of sel) {
        if (rt.includes(want)) return true;
      }
      return false;
    }

    if (key === "vesselType") {
      const toks = vesselTokensFromRow(row);
      for (const want of sel) {
        if (toks.includes(want)) return true;
      }
      return false;
    }

    if (key === "companyRank") {
      const toks = companyRankTokensFromRow(row);
      for (const want of sel) {
        if (toks.includes(want)) return true;
      }
      return false;
    }

    const v = facetValue(row, key);
    return sel.has(v);
  }

  function rowMatchesAllFacets(row, excludeKey = "") {
    return (
      rowMatchesFacet(row, "status", excludeKey) &&
      rowMatchesFacet(row, "source", excludeKey) &&
      rowMatchesFacet(row, "version", excludeKey) &&
      rowMatchesFacet(row, "questionType", excludeKey) &&
      rowMatchesFacet(row, "vesselType", excludeKey) &&
      rowMatchesFacet(row, "responseType", excludeKey) &&
      rowMatchesFacet(row, "companyRank", excludeKey) &&
      rowMatchesFacet(row, "chapter", excludeKey)
    );
  }

  function summarizeSelected(key) {
    const sel = facetSelected[key];
    if (!sel || sel.size === 0) return "";
    const arr = Array.from(sel);
    arr.sort((a,b)=>a.localeCompare(b));
    const head = arr.slice(0, 2).join(", ");
    const more = arr.length > 2 ? ` +${arr.length - 2}` : "";
    return head + more;
  }

  function ensureFacetOpenState() {
    for (const f of FACETS) {
      const det = $("facet_" + f.key);
      if (!det) continue;
      det.open = facetSelected[f.key]?.size > 0;
    }
  }

  function rebuildFacetUI() {
    // called after loadQuestions() and after each list render
    ensureFacetOpenState();

    const term = safeStr($("searchInput")?.value).trim();

    for (const f of FACETS) {
      const sumEl = $("facetSummary_" + f.key);
      if (sumEl) sumEl.textContent = summarizeSelected(f.key);

      const host = $("facetOptions_" + f.key);
      if (!host) continue;
      host.innerHTML = "";

      // counts are computed on the current data set, respecting: search term + other facet selections
      const counts = new Map();

      for (const r of allRows) {
        if (!passesSearch(r, term)) continue;
        if (!rowMatchesAllFacets(r, f.key)) continue;

        if (f.key === "responseType") {
          for (const rt of responseTypesArray(r)) {
            counts.set(rt, (counts.get(rt) || 0) + 1);
          }
          continue;
        }

        if (f.key === "vesselType") {
          for (const vt of vesselTokensFromRow(r)) {
            counts.set(vt, (counts.get(vt) || 0) + 1);
          }
          continue;
        }

        if (f.key === "companyRank") {
          for (const rk of companyRankTokensFromRow(r)) {
            counts.set(rk, (counts.get(rk) || 0) + 1);
          }
          continue;
        }

        if (f.key === "vesselType") {
          for (const vt of vesselTokensFromRow(r)) {
            counts.set(vt, (counts.get(vt) || 0) + 1);
          }
          continue;
        }

        if (f.key === "companyRank") {
          for (const rk of companyRankTokensFromRow(r)) {
            counts.set(rk, (counts.get(rk) || 0) + 1);
          }
          continue;
        }

        const v = facetValue(r, f.key);
        if (!v) continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }

      const values = Array.from(counts.entries())
        .map(([v,c]) => ({ v, c }))
        .sort((a,b) => {
          if (f.key === "chapter") return Number(a.v) - Number(b.v);
          return a.v.localeCompare(b.v);
        });

      // Defensive fallback: for Status/Source/Version, always derive options from the currently
      // loaded rows so the UI never appears empty.
      if (!values.length && allRows.length && (f.key === "status" || f.key === "source" || f.key === "version")) {
        const fallback = new Map();
        for (const r of allRows) {
          const v = facetValue(r, f.key);
          if (!v) continue;
          fallback.set(v, (fallback.get(v) || 0) + 1);
        }
        values.push(
          ...Array.from(fallback.entries()).map(([v,c]) => ({ v, c }))
            .sort((a,b)=>a.v.localeCompare(b.v))
        );
      }

      if (!values.length) {
        const div = document.createElement("div");
        div.className = "muted small";
        div.textContent = "No options";
        host.appendChild(div);
        continue;
      }

      // ---- Select All (empty selection = all) ----
      const allRow = document.createElement("div");
      allRow.className = "facetOpt facetOptAll";
      const allChecked = !(facetSelected[f.key] && facetSelected[f.key].size);
      const allCount = values.reduce((s, it) => s + (it.c || 0), 0);
      const allId = `facet_${f.key}__ALL`;

      allRow.innerHTML = `
        <label>
          <input type="checkbox" id="${allId}" ${allChecked ? "checked" : ""} />
          <span><b>Select All</b></span>
        </label>
        <span class="facetCount">${allCount}</span>
      `;

      const allCb = allRow.querySelector("input");
      if (allCb) {
        allCb.addEventListener("change", async () => {
          // Any click on "Select All" means: clear selections (ALL)
          facetSelected[f.key].clear();
          saveFacetSet(f.key, facetSelected[f.key]);
          if (SERVER_FACETS.has(f.key)) await loadQuestions();
          else renderList();
        });
      }
      host.appendChild(allRow);

      for (const it of values) {
        const row = document.createElement("div");
        row.className = "facetOpt";

        const id = `facet_${f.key}_${it.v.replace(/[^a-zA-Z0-9]/g, "_")}`;
        const checked = facetSelected[f.key]?.has(it.v);

        row.innerHTML = `
          <label>
            <input type="checkbox" id="${id}" ${checked ? "checked" : ""} />
            <span>${escapeHtml(facetDisplay(f.key, it.v))}</span>
          </label>
          <span class="facetCount">${it.c}</span>
        `;

        const cb = row.querySelector("input");
        if (cb) {
          cb.addEventListener("change", async () => {
            if (cb.checked) facetSelected[f.key].add(it.v);
            else facetSelected[f.key].delete(it.v);
            saveFacetSet(f.key, facetSelected[f.key]);
            if (SERVER_FACETS.has(f.key)) await loadQuestions();
            else renderList();
          });
        }

        host.appendChild(row);
      }
    }
  }

  function setMode(newMode) {
    mode = newMode;
    const empty = $("emptyState");
    const v = $("viewPanel");
    const e = $("editPanel");

    if (!selected) {
      if (empty) empty.style.display = "block";
      if (v) v.style.display = "none";
      if (e) e.style.display = "none";
      return;
    }

    if (empty) empty.style.display = "none";
    if (v) v.style.display = (mode === "VIEW") ? "block" : "none";
    if (e) e.style.display = (mode === "EDIT") ? "block" : "none";

    if (mode === "EDIT") {
      const dis = !!selected.__isNew || !selected.id;
      const bDel = $("btnDeleteQuestion");
      const bDea = $("btnDeactivateQuestion");
      if (bDel) bDel.disabled = dis;
      if (bDea) bDea.disabled = dis;
    }

    syncDeactivateButtonUI();
  }

  function setPillsFromSelected() {
    const st = selected?.source_type || "—";
    const status = selected?.status || "—";
    const sx = safeStr(selected?.number_suffix);

    setText("vSourcePill", `source: ${st}`);
    setText("vStatusPill", `status: ${status}`);
    setText("vSuffixPill", `suffix: ${sx || "(blank)"}`);

    setText("pillSource", `source: ${st}`);
    setText("pillStatus", `status: ${status}`);
    setText("pillSuffix", `suffix: ${sx || "(blank)"}`);

    syncDeactivateButtonUI();
  }


  // ===== Deactivate button toggle UI =====
  function syncDeactivateButtonUI() {
    const btn = $("btnDeactivateQuestion");
    if (!btn) return;

    // default presentation
    btn.classList.add("warn");
    btn.classList.remove("primary");
    btn.title = "Toggle active/inactive";

    if (!selected || selected.__isNew || !selected.id) {
      btn.textContent = "Deactivate";
      return;
    }

    const st = safeStr(selected.status).trim().toLowerCase() || "active";
    if (st === "inactive") {
      btn.textContent = "Activate";
      btn.classList.remove("warn");
      btn.classList.add("primary");
      btn.title = "Set status to active";
    } else {
      btn.textContent = "Deactivate";
      btn.classList.add("warn");
      btn.classList.remove("primary");
      btn.title = "Set status to inactive";
    }
  }

  // ===== fallback builders from payload =====
  function ensurePgnoStateFromPayloadIfEmpty() {
    if (!selected) return;
    if (Array.isArray(selected.pgno_items) && selected.pgno_items.length) return;

    const p = selected.payload || {};
    const old =
      p.potential_grounds_for_negative_observations ??
      p["Potential Grounds for Negative Observations"] ??
      p["Potential grounds for negative observations"] ??
      p.PGNO;

    if (Array.isArray(old)) {
      selected.pgno_items = old.map(t => ({ text: safeStr(t), remarks: "" }));
      return;
    }
    if (typeof old === "string" && old.trim()) {
      const items = splitBulletsSmart(old);
      selected.pgno_items = items.map(t => ({ text: t, remarks: "" }));
      return;
    }
    selected.pgno_items = [];
  }

  function ensureEeStateFromPayloadIfEmpty() {
    if (!selected) return;
    if (Array.isArray(selected.ee_items) && selected.ee_items.length) return;

    const p = selected.payload || {};

    const byObjArray = (arr) => arr
      .map(o => ({
        text: safeStr(o?.text ?? o?.evidence_text ?? o?.Evidence ?? "").trim(),
        esms_references: safeStr(o?.ch ?? o?.esms_references ?? o?.esms_reference ?? o?.["eSMS Reference(s)"] ?? "").trim(),
        esms_forms: safeStr(o?.form ?? o?.esms_forms ?? o?.["eSMS Form(s)"] ?? "").trim(),
        remarks: safeStr(o?.remarks ?? "").trim(),
      }))
      .filter(x => x.text);

    const byTextArray = (arr) => arr
      .map(t => ({
        text: safeStr(t).trim(),
        esms_references: "",
        esms_forms: "",
        remarks: "",
      }))
      .filter(x => x.text);

    let raw =
      p.expected_evidence ??
      p["Expected Evidence"] ??
      p.ExpEv_Bullets ??
      p["ExpEv_Bullets"];

    if (Array.isArray(raw)) {
      if (raw.length && typeof raw[0] === "object") {
        selected.ee_items = byObjArray(raw);
        return;
      }
      selected.ee_items = byTextArray(raw);
      return;
    }

    if (typeof raw === "string" && raw.trim()) {
      const items = splitBulletsSmart(raw);
      selected.ee_items = items.map(t => ({ text: t, esms_references: "", esms_forms: "", remarks: "" }));
      return;
    }

    selected.ee_items = [];
  }

  // ===== PGNO renderers =====
  function renderPgnoView() {
    const host = $("vPgnoList");
    if (!host) return;

    ensurePgnoStateFromPayloadIfEmpty();

    const items = selected?.pgno_items || [];
    setText("vPgnoCount", `${items.length} PGNO(s)`);

    if (!items.length) {
      host.innerHTML = `<div class="muted">No PGNOs recorded for this question.</div>`;
      return;
    }

    const nb = normalizeNumberBaseRow(selected);
    const st = selected?.source_type || "SIRE";

    host.innerHTML = items.map((it, i) => {
      const code = pgnoCode(nb, i + 1, st);
      const t = safeStr(it.text);
      const r = safeStr(it.remarks);
      return `
        <div class="masterRow">
          <div class="masterHdr">
            <div class="masterCode">${escapeHtml(code)}</div>
          </div>
          <div class="masterTiny" style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(t)}</div>
          ${r ? `<div class="masterTiny" style="margin-top:8px;"><b>Remarks:</b> ${escapeHtml(r)}</div>` : ``}
        </div>
      `;
    }).join("");
  }

  function renderPgnoEditor() {
    const host = $("pgnoEditorList");
    if (!host) return;

    ensurePgnoStateFromPayloadIfEmpty();

    const items = selected.pgno_items || [];
    setText("pgnoCountLine", `${items.length} PGNO(s)`);

    const nb = previewNumberBaseForHeader();
    const st = $("dbSourceType")?.value || (selected?.source_type || "SIRE");

    host.innerHTML = "";

    items.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "masterRow";

      const code = pgnoCode(nb, idx + 1, st);

      row.innerHTML = `
        <div class="masterHdr">
          <div>
            <div class="masterCode">${escapeHtml(code)}</div>
            <div class="masterTiny">Seq: ${idx + 1}</div>
          </div>
          <div>
            <button class="btn" type="button" data-del="${idx}">Delete</button>
          </div>
        </div>

        <div class="masterGrid">
          <div class="full">
            <label class="lbl">PGNO text</label>
            <textarea class="ta" data-text="${idx}"></textarea>
          </div>
          <div class="full">
            <label class="lbl">Remarks (per PGNO)</label>
            <textarea class="ta" data-remarks="${idx}" placeholder="Optional remarks for this PGNO"></textarea>
          </div>
        </div>
      `;

      host.appendChild(row);

      const taText = row.querySelector(`textarea[data-text="${idx}"]`);
      const taRem = row.querySelector(`textarea[data-remarks="${idx}"]`);
      if (taText) taText.value = safeStr(it.text);
      if (taRem) taRem.value = safeStr(it.remarks);

      if (taText) taText.addEventListener("input", () => { selected.pgno_items[idx].text = taText.value; });
      if (taRem) taRem.addEventListener("input", () => { selected.pgno_items[idx].remarks = taRem.value; });

      const delBtn = row.querySelector(`button[data-del="${idx}"]`);
      if (delBtn) {
        delBtn.addEventListener("click", () => {
          selected.pgno_items.splice(idx, 1);
          renderPgnoEditor();
        });
      }
    });
  }

  function addPgnoRow() {
    if (!selected) return;
    ensurePgnoStateFromPayloadIfEmpty();
    selected.pgno_items.push({ text: "", remarks: "" });
    renderPgnoEditor();
  }

  // ===== Expected Evidence renderers =====
  function renderEeView() {
    const host = $("vEeList");
    if (!host) return;

    ensureEeStateFromPayloadIfEmpty();

    const items = selected?.ee_items || [];
    setText("vEeCount", `${items.length} item(s)`);

    if (!items.length) {
      host.innerHTML = `<div class="muted">No Expected Evidence recorded for this question.</div>`;
      return;
    }

    host.innerHTML = items.map((it, i) => {
      const t = safeStr(it.text);
      const ch = safeStr(it.esms_references);
      const form = safeStr(it.esms_forms);
      const r = safeStr(it.remarks);

      return `
        <div class="masterRow">
          <div class="masterHdr">
            <div class="masterCode">${i + 1}.</div>
          </div>
          <div class="masterTiny" style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(t)}</div>

          ${(ch || form || r) ? `
            <div style="height:8px;"></div>
            ${ch ? `<div class="masterTiny"><b>eSMS Reference(s):</b> ${escapeHtml(ch)}</div>` : ``}
            ${form ? `<div class="masterTiny"><b>eSMS Form(s):</b> ${escapeHtml(form)}</div>` : ``}
            ${r ? `<div class="masterTiny"><b>Remarks:</b> ${escapeHtml(r)}</div>` : ``}
          ` : ``}
        </div>
      `;
    }).join("");
  }

  function renderEeEditor() {
    const host = $("eeEditorList");
    if (!host) return;

    ensureEeStateFromPayloadIfEmpty();

    const items = selected.ee_items || [];
    setText("eeCountLine", `${items.length} item(s)`);

    host.innerHTML = "";

    items.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "masterRow";

      row.innerHTML = `
        <div class="masterHdr">
          <div>
            <div class="masterCode">${idx + 1}.</div>
            <div class="masterTiny">Seq: ${idx + 1}</div>
          </div>
          <div>
            <button class="btn" type="button" data-del-ee="${idx}">Delete</button>
          </div>
        </div>

        <div class="masterGrid">
          <div class="full">
            <label class="lbl">Expected Evidence text</label>
            <textarea class="ta" data-ee-text="${idx}"></textarea>
          </div>

          <div class="full">
            <label class="lbl">eSMS Reference(s)</label>
            <textarea class="ta" data-ee-ch="${idx}" placeholder="Optional (e.g. eSMS Ch. 7.3, 7.5 etc.)"></textarea>
          </div>

          <div class="full">
            <label class="lbl">eSMS Form(s)</label>
            <textarea class="ta" data-ee-form="${idx}" placeholder="Optional (e.g. CBO-04, IG-01 etc.)"></textarea>
          </div>

          <div class="full">
            <label class="lbl">Remarks</label>
            <textarea class="ta" data-ee-remarks="${idx}" placeholder="Optional remarks for this Expected Evidence item"></textarea>
          </div>
        </div>
      `;

      host.appendChild(row);

      const taText = row.querySelector(`textarea[data-ee-text="${idx}"]`);
      const taCh = row.querySelector(`textarea[data-ee-ch="${idx}"]`);
      const taForm = row.querySelector(`textarea[data-ee-form="${idx}"]`);
      const taRem = row.querySelector(`textarea[data-ee-remarks="${idx}"]`);

      if (taText) taText.value = safeStr(it.text);
      if (taCh) taCh.value = safeStr(it.esms_references);
      if (taForm) taForm.value = safeStr(it.esms_forms);
      if (taRem) taRem.value = safeStr(it.remarks);

      if (taText) taText.addEventListener("input", () => { selected.ee_items[idx].text = taText.value; });
      if (taCh) taCh.addEventListener("input", () => { selected.ee_items[idx].esms_references = taCh.value; });
      if (taForm) taForm.addEventListener("input", () => { selected.ee_items[idx].esms_forms = taForm.value; });
      if (taRem) taRem.addEventListener("input", () => { selected.ee_items[idx].remarks = taRem.value; });

      const delBtn = row.querySelector(`button[data-del-ee="${idx}"]`);
      if (delBtn) {
        delBtn.addEventListener("click", () => {
          selected.ee_items.splice(idx, 1);
          renderEeEditor();
        });
      }
    });
  }

  function addEeRow() {
    if (!selected) return;
    ensureEeStateFromPayloadIfEmpty();
    selected.ee_items.push({ text: "", esms_references: "", esms_forms: "", remarks: "" });
    renderEeEditor();
  }

  // ========= Question Attributes (View + Edit) =========
  function fillAttributesViewFromPayload(p) {
    setText("vAttrQuestionType", pGet(p, ["Question Type", "question_type", "questionType"]));
    setText("vAttrVesselType", pGet(p, ["Vessel Type", "vessel_type", "vesselType"]));
    setText("vAttrRoviq", pGet(p, ["ROVIQ List", "ROVIQ", "roviq_list", "roviqList"]));
    setText("vAttrCompanyRank", pGet(p, ["Company Rank Allocation", "Company_Rank_Allocation", "company_rank_allocation", "companyRankAllocation"]));
    setText("vAttrTmsa3", pGet(p, ["TMSA3 Reference", "TMSA3", "tmsa3_reference", "tmsa3Reference"]));
    setText("vAttrTmsa4", pGet(p, ["TMSA4 Reference", "TMSA4", "tmsa4_reference", "tmsa4Reference"]));
    setText("vAttrResponseType", responseTypeStringFromPayload(p));
  }

  function fillAttributesEditFromPayload(p) {
    const qt = pGet(p, ["Question Type", "question_type", "questionType"]);
    const vt = pGet(p, ["Vessel Type", "vessel_type", "vesselType"]);
    const ro = pGet(p, ["ROVIQ List", "ROVIQ", "roviq_list", "roviqList"]);
    const cr = pGet(p, ["Company Rank Allocation", "Company_Rank_Allocation", "company_rank_allocation", "companyRankAllocation"]);
    const t3 = pGet(p, ["TMSA3 Reference", "TMSA3", "tmsa3_reference", "tmsa3Reference"]);
    const t4 = pGet(p, ["TMSA4 Reference", "TMSA4", "tmsa4_reference", "tmsa4Reference"]);

    if ($("eQuestionType")) $("eQuestionType").value = qt;
    if ($("eVesselType")) $("eVesselType").value = vt;
    if ($("eRoviqList")) $("eRoviqList").value = ro;
    if ($("eCompanyRankAllocation")) $("eCompanyRankAllocation").value = cr;
    if ($("eTmsa3")) $("eTmsa3").value = t3;
    if ($("eTmsa4")) $("eTmsa4").value = t4;

    const arr = computeResponseTypesFromPayload(p);
    const setChk = (id, on) => { const el = $(id); if (el) el.checked = !!on; };

    setChk("rtHuman", arr.includes("Human"));
    setChk("rtHardware", arr.includes("Hardware"));
    setChk("rtProcess", arr.includes("Process"));
    setChk("rtPhoto", arr.includes("Photo"));

    setText("eAttrResponseTypePreview", arr.length ? arr.join(", ") : "");
  }

  function applyAttributesFromEditUIIntoPayload(payload) {
    const qt = safeStr($("eQuestionType")?.value).trim();
    pSet(payload, "Question Type", ["question_type"], qt);

    const vt = safeStr($("eVesselType")?.value).trim();
    pSet(payload, "Vessel Type", ["vessel_type"], vt);

    const ro = safeStr($("eRoviqList")?.value).trim();
    pSet(payload, "ROVIQ List", ["roviq_list"], ro);

    const cr = safeStr($("eCompanyRankAllocation")?.value).trim();
    pSet(payload, "Company Rank Allocation", ["company_rank_allocation"], cr);

    const t3 = safeStr($("eTmsa3")?.value).trim();
    const t4 = safeStr($("eTmsa4")?.value).trim();
    pSet(payload, "TMSA3 Reference", ["tmsa3_reference"], t3);
    pSet(payload, "TMSA4 Reference", ["tmsa4_reference"], t4);

    const wantHuman = !!$("rtHuman")?.checked;
    const wantHardware = !!$("rtHardware")?.checked;
    const wantProcess = !!$("rtProcess")?.checked;
    const wantPhoto = !!$("rtPhoto")?.checked;

    const setResp = (key) => {
      const existing = safeStr(payload[key]).trim();
      if (existing && existing.toLowerCase() !== "none") return existing;
      return "Graduated";
    };

    payload["Human Response Type"] = wantHuman ? setResp("Human Response Type") : "None";
    payload["Hardware Response Type"] = wantHardware ? setResp("Hardware Response Type") : "None";
    payload["Process Response Type"] = wantProcess ? setResp("Process Response Type") : "None";
    payload["Photo Response"] = wantPhoto ? "Y" : "N";

    payload["Question Response Type"] = responseTypeStringFromPayload(payload);
  }

  function refreshResponseTypePreviewFromCheckboxes() {
    const arr = [];
    if ($("rtHuman")?.checked) arr.push("Human");
    if ($("rtHardware")?.checked) arr.push("Hardware");
    if ($("rtProcess")?.checked) arr.push("Process");
    if ($("rtPhoto")?.checked) arr.push("Photo");
    setText("eAttrResponseTypePreview", arr.join(", "));
  }

  // ===== view/edit fill =====
  function fillViewPanel(r) {
    setText("vhdrNumber", displayNumber(r));
    setText("vhdrId", r.id ? `DB id: ${r.id}` : "");

    const p = r.payload || {};

    setText("vShortText", pGet(p, ["short_text", "Short Text", "ShortText", "shortText"]));
    setText("vQuestion", pGet(p, ["question", "Question"]));

    setText("vGuidance", pGet(p, ["inspection_guidance", "Inspection Guidance", "InspectionGuidance", "guidance"]));
    setText("vActions", pGet(p, ["suggested_inspector_actions", "Suggested Inspector Actions", "SuggestedInspectorActions", "actions"]));

    fillAttributesViewFromPayload(p);

    setText("vTags", Array.isArray(r.tags) ? r.tags.join(", ") : safeStr(r.tags || ""));
    setText("vVersion", safeStr(r.version || ""));

    const rawEl = $("vRaw");
    if (rawEl) {
      try { rawEl.textContent = JSON.stringify(p, null, 2); }
      catch { rawEl.textContent = ""; }
    }

    setPillsFromSelected();
    renderEeView();
    renderPgnoView();
  }

  function fillEditPanel(r) {
    if ($("dbSourceType")) $("dbSourceType").value = r.source_type || "SIRE";
    if ($("dbStatus")) $("dbStatus").value = r.status || "active";
    if ($("dbNumberSuffix")) $("dbNumberSuffix").value = safeStr(r.number_suffix);
    if ($("dbTags")) $("dbTags").value = Array.isArray(r.tags) ? r.tags.join(", ") : safeStr(r.tags || "");

    if ($("dbVersion")) $("dbVersion").value = safeStr(r.version || "");
    if ($("dbChangeReason")) $("dbChangeReason").value = safeStr(r.change_reason || "");

    const parts = parseNumberBase(normalizeNumberBaseRow(r));
    if ($("numChapter")) $("numChapter").value = parts.xx;
    if ($("numSection")) $("numSection").value = parts.yy;
    if ($("numItem")) $("numItem").value = parts.zz;

    setText("hdrId", r.id ? `DB id: ${r.id}` : "Not saved yet");
    setText("hdrNumber", displayNumber(r));

    const p = r.payload || {};

    if ($("pShortText")) $("pShortText").value = pGet(p, ["short_text", "Short Text", "ShortText", "shortText"]);
    if ($("pQuestion")) $("pQuestion").value = pGet(p, ["question", "Question"]);
    if ($("pGuidance")) $("pGuidance").value = pGet(p, ["inspection_guidance", "Inspection Guidance", "InspectionGuidance", "guidance"]);
    if ($("pActions")) $("pActions").value = pGet(p, ["suggested_inspector_actions", "Suggested Inspector Actions", "SuggestedInspectorActions", "actions"]);

    fillAttributesEditFromPayload(p);

    try { if ($("pRaw")) $("pRaw").value = JSON.stringify(p, null, 2); }
    catch { if ($("pRaw")) $("pRaw").value = ""; }

    setPillsFromSelected();
    renderEeEditor();
    renderPgnoEditor();
  }

  function previewNumberBaseForHeader() {
    const src = $("dbSourceType")?.value || (selected?.source_type || "SIRE");
    const xx = $("numChapter")?.value;
    const yy = $("numSection")?.value;
    const zz = $("numItem")?.value;

    const nb = buildNumberBase(src, xx, yy, zz);
    return nb || normalizeNumberBaseRow(selected) || safeStr(selected?.number_base).trim();
  }

  function refreshHeaderFromNumberInputs() {
    if (!selected) return;
    const nb = previewNumberBaseForHeader();
    const sx = safeStr($("dbNumberSuffix")?.value).trim();
    const tmp = { ...selected, number_base: nb, number_suffix: sx, number_full: "" };

    setText("hdrNumber", displayNumber(tmp));
    renderPgnoEditor();
  }

  // ===== list =====
  function passesSearch(r, term) {
    if (!term) return true;
    const t = term.toLowerCase();

    const n = displayNumber(r).toLowerCase();
    const p = r.payload || {};
    const st = pGet(p, ["short_text", "Short Text", "ShortText", "shortText"]).toLowerCase();
    const qu = pGet(p, ["question", "Question"]).toLowerCase();

    return n.includes(t) || st.includes(t) || qu.includes(t);
  }

  function renderList() {
    const list = $("qList");
    if (!list) return;
    list.innerHTML = "";

    const term = safeStr($("searchInput")?.value).trim();
    const filtered = allRows.filter(r => passesSearch(r, term) && rowMatchesAllFacets(r));

    filtered.sort((a, b) => {
      const ka = numberKey(a);
      const kb = numberKey(b);
      for (let i = 0; i < 3; i++) {
        if (ka[i] < kb[i]) return -1;
        if (ka[i] > kb[i]) return 1;
      }
      return ka[3].localeCompare(kb[3]);
    });

    setText("countLine", `${filtered.length} questions`);
    setText("loadedLine", `Loaded ${allRows.length}`);

    const showFull = getShowFullInList();

    for (const r of filtered) {
      const div = document.createElement("div");
      div.className = "qitem" + (selected && !selected.__isNew && selected.id === r.id ? " active" : "");

      const p = r.payload || {};
      const shortText = pGet(p, ["short_text", "Short Text", "ShortText", "shortText"]);
      const questionText = pGet(p, ["question", "Question"]);
      const sub = showFull ? (questionText || shortText) : (shortText || questionText);

      div.innerHTML = `
        <div class="qno">${escapeHtml(displayNumber(r))}</div>
        <div class="qsub">${escapeHtml(sub)}</div>
      `;
      div.onclick = () => selectRow(r);
      list.appendChild(div);
    }

    rebuildFacetUI();
  }

  // ===== DB load =====
  async function loadQuestions() {
    showWarn("");
    showOk("");
    setText("loadHint", "Loading…");

    try {
      const statusSel = facetSelected.status;
      const sourceSel = facetSelected.source;
      const versionSel = facetSelected.version;

      let q = sb
        .from("questions_master")
        .select("id, number_base, number_suffix, number_full, source_type, is_custom, status, version, tags, payload, change_reason, updated_at, created_at")
        .order("created_at", { ascending: true });

      if (statusSel && statusSel.size) q = q.in("status", Array.from(statusSel));
      if (sourceSel && sourceSel.size) q = q.in("source_type", Array.from(sourceSel));
      if (versionSel && versionSel.size) q = q.in("version", Array.from(versionSel));

      const { data, error } = await q;
      if (error) throw error;

      allRows = data || [];
      setText("loadHint", `Loaded ${allRows.length}`);
      renderList();

      if (allRows.length) await selectRow(allRows[0]);
      else {
        selected = null;
        setMode("VIEW");
      }
    } catch (e) {
      setText("loadHint", "");
      showWarn("Failed to load questions from DB:\n\n" + (e?.message || String(e)));
    }
  }

  // ===== PGNO DB operations =====
  async function loadPgnoFromDb(questionId) {
    const { data, error } = await sb
      .from("pgno_master")
      .select("id, seq, pgno_code, pgno_text, remarks")
      .eq("question_id", questionId)
      .order("seq", { ascending: true });

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      text: safeStr(r.pgno_text),
      remarks: safeStr(r.remarks),
    }));
  }

  // FIX: sourceType must be used to format nb (SIRE vs zzz) in pgno_code
  async function savePgnoToDb(questionId, numberBase, items, sourceType) {
    const clean = (items || [])
      .map(x => ({ text: safeStr(x.text).trim(), remarks: safeStr(x.remarks).trim() }))
      .filter(x => x.text.length > 0);

    const { error: delErr } = await sb.from("pgno_master").delete().eq("question_id", questionId);
    if (delErr) throw delErr;

    if (!clean.length) return;

    const st = sourceType || "SIRE";

    const rows = clean.map((x, i) => ({
      question_id: questionId,
      seq: i + 1,
      pgno_code: pgnoCode(numberBase, i + 1, st),
      pgno_text: x.text,
      remarks: x.remarks,
      created_by: me?.user?.id || null,
      updated_by: me?.user?.id || null,
    }));

    const { error: insErr } = await sb.from("pgno_master").insert(rows);
    if (insErr) throw insErr;
  }

  // ===== Expected Evidence DB operations =====
  async function loadEeFromDb(questionId) {
    const { data, error } = await sb
      .from("expected_evidence_master")
      .select("id, seq, evidence_text, esms_references, esms_forms, remarks")
      .eq("question_id", questionId)
      .order("seq", { ascending: true });

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      text: safeStr(r.evidence_text),
      esms_references: safeStr(r.esms_references),
      esms_forms: safeStr(r.esms_forms),
      remarks: safeStr(r.remarks),
    }));
  }

  async function saveEeToDb(questionId, items) {
    const clean = (items || [])
      .map(x => ({
        text: safeStr(x.text).trim(),
        esms_references: safeStr(x.esms_references).trim(),
        esms_forms: safeStr(x.esms_forms).trim(),
        remarks: safeStr(x.remarks).trim(),
      }))
      .filter(x => x.text.length > 0);

    const { error: delErr } = await sb.from("expected_evidence_master").delete().eq("question_id", questionId);
    if (delErr) throw delErr;

    if (!clean.length) return;

    const rows = clean.map((x, i) => ({
      question_id: questionId,
      seq: i + 1,
      evidence_text: x.text,
      esms_references: x.esms_references || null,
      esms_forms: x.esms_forms || null,
      remarks: x.remarks || null,
      created_by: me?.user?.id || null,
      updated_by: me?.user?.id || null,
    }));

    const { error: insErr } = await sb.from("expected_evidence_master").insert(rows);
    if (insErr) throw insErr;
  }

  // ===== select =====
  async function selectRow(row) {
    selected = JSON.parse(JSON.stringify(row));
    selected.__isNew = false;

    selected.pgno_items = [];
    selected.ee_items = [];

    try {
      if (selected.id) selected.pgno_items = await loadPgnoFromDb(selected.id);
    } catch (e) {
      selected.pgno_items = [];
      showWarn(
        "Warning: could not load PGNO rows from pgno_master.\n" +
        "Fallback to payload PGNO list.\n\n" +
        "Error: " + String(e?.message || e)
      );
    }

    try {
      if (selected.id) selected.ee_items = await loadEeFromDb(selected.id);
    } catch (e) {
      selected.ee_items = [];
      showWarn(
        (safeStr($("warnBox")?.textContent) ? $("warnBox").textContent + "\n\n---\n\n" : "") +
        "Warning: could not load Expected Evidence rows from expected_evidence_master.\n" +
        "Fallback to payload Expected Evidence.\n\n" +
        "Error: " + String(e?.message || e)
      );
    }

    fillViewPanel(selected);
    fillEditPanel(selected);
    setMode("VIEW");
    renderList();
    syncDeactivateButtonUI();
  }

  // ===== new question =====
  function newQuestion() {
    showWarn("");
    showOk("");
    setText("saveStatus", "");

    const versionFromFilter = (facetSelected.version && facetSelected.version.size === 1)
      ? Array.from(facetSelected.version)[0]
      : "";

    selected = {
      __isNew: true,
      id: null,
      source_type: "COMPANY_CUSTOM",
      is_custom: true,
      status: "active",
      version: versionFromFilter || "SIRE_2_0_QL",
      tags: [],
      number_base: "",
      number_suffix: "C",
      payload: {
        short_text: "",
        question: "",
        inspection_guidance: "",
        suggested_inspector_actions: "",

        "Question Type": "",
        "Vessel Type": "",
        "ROVIQ List": "",
        "Company Rank Allocation": "",
        "TMSA3 Reference": "",
        "TMSA4 Reference": "",
        "Human Response Type": "None",
        "Hardware Response Type": "None",
        "Process Response Type": "None",
        "Photo Response": "N",

        expected_evidence: [],
        potential_grounds_for_negative_observations: [],
      },
      pgno_items: [],
      ee_items: [],
    };

    fillViewPanel(selected);
    fillEditPanel(selected);
    setMode("EDIT");
    syncDeactivateButtonUI();
    setPillsFromSelected();
    refreshHeaderFromNumberInputs();
  }

  // ===== deactivate / delete =====
  async function toggleActiveSelected() {
    if (!selected || selected.__isNew || !selected.id) return;

    showWarn("");
    showOk("");
    setText("saveStatus", "");

    const current = safeStr(selected.status).trim().toLowerCase() || "active";
    const next = (current === "inactive") ? "active" : "inactive";

    const qno = displayNumber(selected);
    const ok = confirm(
      `${next === "inactive" ? "Deactivate" : "Activate"} question ${qno}?\n\n` +
      `This will set status = ${next}.`
    );
    if (!ok) return;

    try {
      const { error } = await sb
        .from("questions_master")
        .update({ status: next, updated_by: me?.user?.id || null })
        .eq("id", selected.id);

      if (error) throw error;

      // Auto-switch Status facet so you immediately see the question after toggle
      facetSelected.status = new Set([next]);
      saveFacetSet("status", facetSelected.status);

      selected.status = next;
      setPillsFromSelected();
      syncDeactivateButtonUI();

      showOk(`${next === "inactive" ? "Deactivated" : "Activated"} ${qno}.`);

      await loadQuestions();

      // Re-select the same row if it still exists in the filtered list
      const still = allRows.find(r => r.id === selected.id);
      if (still) await selectRow(still);
      else {
        selected = null;
        setMode("VIEW");
      }
    } catch (e) {
      showWarn(`${next === "inactive" ? "Deactivate" : "Activate"} failed:\n\n` + (e?.message || String(e)));
    }
  }

async function deleteSelected() {
    if (!selected || selected.__isNew || !selected.id) return;

    showWarn("");
    showOk("");
    setText("saveStatus", "");

    const qno = displayNumber(selected);
    const ok = confirm(
      `DELETE question ${qno}?\n\n` +
      `This will permanently delete:\n` +
      `- questions_master\n` +
      `- pgno_master (children)\n` +
      `- expected_evidence_master (children)\n\n` +
      `This cannot be undone.`
    );
    if (!ok) return;

    try {
      // Children can be 0 rows; we don't treat that as an error.
      const { error: e1 } = await sb.from("pgno_master").delete().eq("question_id", selected.id);
      if (e1) throw e1;

      const { error: e2 } = await sb.from("expected_evidence_master").delete().eq("question_id", selected.id);
      if (e2) throw e2;

      // IMPORTANT:
      // With Supabase RLS, a DELETE that is blocked often returns *no error* but deletes 0 rows.
      // So we request the deleted row back and verify we actually deleted something.
      const { data: delRows, error: e3 } = await sb
        .from("questions_master")
        .delete()
        .eq("id", selected.id)
        .select("id");
      if (e3) throw e3;

      const deletedCount = Array.isArray(delRows) ? delRows.length : 0;
      if (deletedCount === 0) {
        showWarn(
          "Delete did not remove any row. This is almost always caused by Supabase RLS policies blocking DELETE.\n\n" +
          "You can still SELECT the question, but the database refuses to DELETE it.\n\n" +
          "Fix: add DELETE policies for these tables:\n" +
          "- questions_master\n" +
          "- pgno_master\n" +
          "- expected_evidence_master"
        );
        setText("saveStatus", "");
        return;
      }

      showOk(`Deleted ${qno}.`);
      selected = null;
      await loadQuestions();
      setMode("VIEW");
    } catch (e) {
      showWarn("Delete failed:\n\n" + (e?.message || String(e)));
    }
  }

  // ===== save =====
  async function saveSelected() {
    if (!selected) return;

    showWarn("");
    showOk("");
    setText("saveStatus", "Saving…");

    try {
      const src = $("dbSourceType")?.value;
      const status = safeStr($("dbStatus")?.value || "active");
      const version = safeStr($("dbVersion")?.value).trim() || safeStr(selected.version || "SIRE_2_0_QL");

      const xx = $("numChapter")?.value;
      const yy = $("numSection")?.value;
      const zz = $("numItem")?.value;

      if (!isIntLike(Number(xx)) || !isIntLike(Number(yy)) || !isIntLike(Number(zz))) {
        setText("saveStatus", "");
        showWarn("Chapter / Section / Item must be whole numbers.");
        return;
      }

      const number_base = buildNumberBase(src, xx, yy, zz);
      if (!number_base) {
        setText("saveStatus", "");
        showWarn("Number is required.");
        return;
      }

      const number_suffix = safeStr($("dbNumberSuffix")?.value).trim();

      const tagsCsv = safeStr($("dbTags")?.value).trim();
      const tags = tagsCsv ? tagsCsv.split(",").map(s => s.trim()).filter(Boolean) : [];

      let payload = {};
      const raw = safeStr($("pRaw")?.value).trim();
      if (raw) {
        try { payload = JSON.parse(raw); }
        catch { payload = selected.payload || {}; }
      } else {
        payload = selected.payload || {};
      }

      payload.short_text = safeStr($("pShortText")?.value);
      payload.question = safeStr($("pQuestion")?.value);
      payload.inspection_guidance = safeStr($("pGuidance")?.value);
      payload.suggested_inspector_actions = safeStr($("pActions")?.value);

      applyAttributesFromEditUIIntoPayload(payload);

      ensurePgnoStateFromPayloadIfEmpty();
      ensureEeStateFromPayloadIfEmpty();

      payload.potential_grounds_for_negative_observations = (selected.pgno_items || [])
        .map(x => safeStr(x.text).trim())
        .filter(Boolean);

      payload.expected_evidence = (selected.ee_items || [])
        .map(x => safeStr(x.text).trim())
        .filter(Boolean);

      const is_custom = (src !== "SIRE");

      const row = {
        source_type: src,
        is_custom,
        status,
        version,
        tags,
        number_base,
        number_suffix,
        payload,
        change_reason: safeStr($("dbChangeReason")?.value).trim() || null,
        updated_by: me?.user?.id || null,
      };

      if (selected.__isNew) {
        row.created_by = me?.user?.id || null;

        const { data, error } = await sb
          .from("questions_master")
          .insert(row)
          .select("id, number_base, number_suffix, number_full, source_type, is_custom, status, version, tags, payload, change_reason, updated_at, created_at")
          .single();

        if (error) throw error;

        try { await savePgnoToDb(data.id, number_base, selected.pgno_items || [], src); }
        catch (e) { showWarn("Question saved, but PGNO rows could not be saved.\n\nError: " + String(e?.message || e)); }

        try { await saveEeToDb(data.id, selected.ee_items || []); }
        catch (e) {
          showWarn(
            (safeStr($("warnBox")?.textContent) ? $("warnBox").textContent + "\n\n---\n\n" : "") +
            "Question saved, but Expected Evidence rows could not be saved.\n\nError: " + String(e?.message || e)
          );
        }

        showOk("Saved new question.");
        setText("saveStatus", "");
        await loadQuestions();

        const newRow = allRows.find(x => x.id === data.id);
        if (newRow) await selectRow(newRow);

      } else {
        const { error } = await sb
          .from("questions_master")
          .update(row)
          .eq("id", selected.id);

        if (error) throw error;

        try { await savePgnoToDb(selected.id, number_base, selected.pgno_items || [], src); }
        catch (e) { showWarn("Question saved, but PGNO rows could not be saved.\n\nError: " + String(e?.message || e)); }

        try { await saveEeToDb(selected.id, selected.ee_items || []); }
        catch (e) {
          showWarn(
            (safeStr($("warnBox")?.textContent) ? $("warnBox").textContent + "\n\n---\n\n" : "") +
            "Question saved, but Expected Evidence rows could not be saved.\n\nError: " + String(e?.message || e)
          );
        }

        showOk("Saved changes.");
        setText("saveStatus", "");
        await loadQuestions();

        const updated = allRows.find(x => x.id === selected.id);
        if (updated) await selectRow(updated);
      }

    } catch (e) {
      setText("saveStatus", "");
      showWarn("Save failed:\n\n" + (e?.message || String(e)));
    }
  }

  function toggleAdvanced(which) {
    const el = $(which);
    if (!el) return;
    el.style.display = (el.style.display === "block") ? "none" : "block";
  }

  function wireUI() {
    onClick("reloadBtn", () => loadQuestions());

    onInput("searchInput", () => renderList());
    onClick("newQuestionBtn", () => newQuestion());

    const tgl = $("showFullQuestionToggle");
    if (tgl) {
      tgl.checked = getShowFullInList();
      setText("showFullQuestionState", tgl.checked ? "ON (Question)" : "OFF (Short Text)");
      tgl.addEventListener("change", () => {
        setShowFullInList(tgl.checked);
        setText("showFullQuestionState", tgl.checked ? "ON (Question)" : "OFF (Short Text)");
        renderList();
      });
    }

    onClick("btnEdit", () => {
      const ok = confirm("Enter edit mode for this question?");
      if (!ok) return;
      setMode("EDIT");
    });

    onClick("btnView", () => setMode("VIEW"));

    onClick("btnReset", async () => {
      if (!selected) return;
      if (selected.__isNew) newQuestion();
      else {
        const r = allRows.find(x => x.id === selected.id);
        if (r) await selectRow(r);
      }
    });

    onClick("btnSave", () => saveSelected());

    // Deactivate / Delete (edit mode only)
    onClick("btnDeactivateQuestion", () => toggleActiveSelected());
    onClick("btnDeleteQuestion", () => deleteSelected());


    // Robust click delegation (prevents "nothing happens" if HTML is slightly out of sync)
    document.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!t) return;

      if (t.id === "btnDeleteQuestion") {
        ev.preventDefault();
        deleteSelected();
      }
      if (t.id === "btnDeactivateQuestion") {
        ev.preventDefault();
        toggleActiveSelected();
      }
    }, true);

    onChange("dbSourceType", () => {
      const st = $("dbSourceType")?.value;
      if (st === "SIRE") $("dbNumberSuffix").value = "";
      if (st !== "SIRE" && !safeStr($("dbNumberSuffix")?.value).trim()) $("dbNumberSuffix").value = "C";
      refreshHeaderFromNumberInputs();
    });

    onInput("dbNumberSuffix", () => refreshHeaderFromNumberInputs());
    onInput("numChapter", () => refreshHeaderFromNumberInputs());
    onInput("numSection", () => refreshHeaderFromNumberInputs());
    onInput("numItem", () => refreshHeaderFromNumberInputs());

    onClick("btnToggleAdvancedView", () => toggleAdvanced("viewAdvanced"));
    onClick("btnToggleAdvancedEdit", () => toggleAdvanced("editAdvanced"));

    onClick("btnAddPgno", () => addPgnoRow());
    onClick("btnAddEe", () => addEeRow());

    ["rtHuman","rtHardware","rtProcess","rtPhoto"].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener("change", refreshResponseTypePreviewFromCheckboxes);
    });


    // Facet clear buttons
    onClick("facetClear_questionType", () => clearFacet("questionType"));
    onClick("facetClear_vesselType", () => clearFacet("vesselType"));
    onClick("facetClear_responseType", () => clearFacet("responseType"));
    onClick("facetClear_companyRank", () => clearFacet("companyRank"));
    onClick("facetClear_chapter", () => clearFacet("chapter"));
 }

  async function boot() {
    showWarn("");
    showOk("");

    try {
      if (!window.supabase) {
        showWarn("Boot failed:\n\nSupabase JS not available.");
        return;
      }
      if (!window.AUTH) {
        showWarn("Boot failed:\n\nAUTH helper not loaded (auth.js).");
        return;
      }

      sb = window.AUTH.ensureSupabase();

      me = await window.AUTH.setupAuthButtons({
        badgeId: "userBadge",
        loginBtnId: "loginBtn",
        logoutBtnId: "logoutBtn",
        switchBtnId: "switchUserBtn",
        loginPath: "./login.html",
      });

      if (!me?.session?.user) return;

      const role = me.profile?.role || "—";
      setText("modeLine", `Role: ${role} • Mode: Admin • Module: QUESTIONS_EDITOR`);

      wireUI();
      await loadQuestions();
    } catch (e) {
      showWarn("Boot failed:\n\n" + (e?.message || String(e)));
    }
  }

  boot();
})();
