// public/q-sire-questions-viewer.js
// C.S.V. BEACON — SIRE 2.0 Questions Viewer
// Read-only page script. It does not call save/delete/import/replace RPCs.

(() => {
  "use strict";

  const BUILD = "SIRE-QUESTIONS-VIEWER-20260527_OFFLINE_SAME_UI_4";
  window.CSVB_SIRE_QUESTIONS_VIEWER_BUILD = BUILD;

  const $ = (id) => document.getElementById(id);
  const s = (v) => v === null || v === undefined ? "" : String(v);
  const esc = (v) => s(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function txt(id, value) {
    const el = $(id);
    if (el) el.textContent = value || "";
  }

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
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(p, k)) return s(p[k]);
    }
    return "";
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

  function normNumber(sourceType, numberBase) {
    const raw = s(numberBase).trim();
    const m = raw.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return raw;
    const p2 = (n) => String(Number(n)).padStart(2, "0");
    const p3 = (n) => String(Number(n)).padStart(3, "0");
    return sourceType === "SIRE"
      ? `${p2(m[1])}.${p2(m[2])}.${p2(m[3])}`
      : `${p2(m[1])}.${p2(m[2])}.${p3(m[3])}`;
  }

  function numberBase(row) {
    return normNumber(s(row?.source_type).trim() || "SIRE", row?.number_base);
  }

  function qno(row) {
    const nb = numberBase(row);
    const suffix = s(row?.number_suffix).trim();
    if (nb) return suffix ? `${nb}-${suffix}` : nb;
    return s(row?.number_full).replace(/-$/, "") || "—";
  }

  function qkey(row) {
    const nb = numberBase(row);
    const m = nb.match(/^(\d+)\.(\d+)\.(\d+)$/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), nb] : [999,999,999,nb];
  }

  function rowId(row) {
    return s(row?.id || qno(row));
  }

  function chapter(row) {
    const m = numberBase(row).match(/^(\d+)\./);
    return m ? String(Number(m[1])).padStart(2, "0") : "";
  }

  function splitTokens(v) {
    return s(v).split(",").map(x => x.trim().replace(/\s+/g, " ")).filter(Boolean);
  }

  function vesselTokens(row) {
    const raw = pget(row?.payload || {}, ["Vessel Type", "vessel_type", "vesselType"]);
    const map = { oil: "Oil", chemical: "Chemical", chem: "Chemical", lng: "LNG", lpg: "LPG" };
    return Array.from(new Set(splitTokens(raw).map(x => map[x.toLowerCase()] || "").filter(Boolean)));
  }

  function rankTokens(row) {
    return Array.from(new Set(splitTokens(pget(row?.payload || {}, [
      "Company Rank Allocation",
      "Company_Rank_Allocation",
      "company_rank_allocation",
      "companyRankAllocation"
    ]))));
  }

  function bulletSplit(value) {
    const lines = s(value).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const out = [];
    const isStart = (x) => x.startsWith("•") || x.startsWith("-") || x.startsWith("–") || x.startsWith("—") || /^\d+\./.test(x);
    for (const line of lines) {
      const clean = line.replace(/^•\s*/, "").replace(/^[-–—]\s*/, "").trim();
      if (!clean) continue;
      if (!out.length || isStart(line)) out.push(clean);
      else out[out.length - 1] += " " + clean;
    }
    return out;
  }

  function pgnoCode(row, index) {
    return `${numberBase(row)}.${String(index + 1).padStart(2, "0")}`;
  }

  function normalizeArray(v) {
    if (Array.isArray(v)) return v;

    if (typeof v === "string") {
      const trimmed = v.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    return [];
  }

  function flattenText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return s(value);
    if (Array.isArray(value)) return value.map(flattenText).join(" ");
    if (typeof value === "object") return Object.values(value).map(flattenText).join(" ");
    return "";
  }

  const OFFLINE_PACKAGE_ID = "sire_questions_viewer_active_v1";
  const OFFLINE_FORCE_KEY = "csvb_sire_viewer_force_offline";

  function isTruthyFlag(value) {
    const v = s(value).trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
  }

  function offlineRequestStatus() {
    let queryValue = "";

    try {
      const params = new URLSearchParams(window.location.search || "");
      queryValue =
        params.get("offline") ||
        params.get("csvb_offline") ||
        params.get("offline_package") ||
        "";
    } catch (_) {}

    let forced = false;
    try {
      forced = localStorage.getItem(OFFLINE_FORCE_KEY) === "1";
    } catch (_) {}

    if (navigator.onLine === false) {
      return { requested: true, reason: "browser offline" };
    }

    if (isTruthyFlag(queryValue)) {
      return { requested: true, reason: "URL offline flag" };
    }

    if (forced) {
      return { requested: true, reason: "localStorage offline test flag" };
    }

    return { requested: false, reason: "online" };
  }

  function ensureOfflineUiStyles() {
    if ($("csvbSireViewerOfflineSameUiStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSireViewerOfflineSameUiStyles";
    style.textContent = `
      html[data-csvb-sire-offline="1"] .csvb-ai-source-launcher,
      html[data-csvb-sire-offline="1"] #csvbAiSourceModalBackdrop,
      html[data-csvb-sire-offline="1"] #csvbAiAskBtn,
      html[data-csvb-sire-offline="1"] #csvbAiCopyAnswerBtn {
        display: none !important;
      }

      html[data-csvb-sire-offline="1"] #loginBtn,
      html[data-csvb-sire-offline="1"] #switchUserBtn,
      html[data-csvb-sire-offline="1"] #logoutBtn {
        display: none !important;
      }
    `;

    document.head.appendChild(style);
  }

  let offlineSupabaseWarningSuppressTimer = null;

  function offlineModeDomActive() {
    return window.CSVB_SIRE_VIEWER_OFFLINE_ACTIVE === true ||
      document.documentElement.getAttribute("data-csvb-sire-offline") === "1";
  }

  function isOfflineSupabaseWarning(value) {
    const msg = s(value).toLowerCase();

    return msg.includes("supabase js not loaded") ||
      msg.includes("@supabase/supabase-js") ||
      msg.includes("supabase js not available");
  }

  function suppressOfflineSupabaseWarningOnce() {
    if (!offlineModeDomActive()) return;

    ["warnBox", "errBox", "loginError"].forEach((id) => {
      const el = $(id);
      if (!el) return;

      if (isOfflineSupabaseWarning(el.textContent || "")) {
        el.textContent = "";
        el.style.display = "none";
        el.dataset.csvbSuppressedOfflineSupabaseWarning = "1";
      }
    });
  }

  function stopOfflineSupabaseWarningSuppressor() {
    if (offlineSupabaseWarningSuppressTimer) {
      clearInterval(offlineSupabaseWarningSuppressTimer);
      offlineSupabaseWarningSuppressTimer = null;
    }
  }

  function startOfflineSupabaseWarningSuppressor() {
    stopOfflineSupabaseWarningSuppressor();
    suppressOfflineSupabaseWarningOnce();

    let ticks = 0;
    offlineSupabaseWarningSuppressTimer = setInterval(() => {
      ticks += 1;
      suppressOfflineSupabaseWarningOnce();

      if (ticks >= 120) {
        stopOfflineSupabaseWarningSuppressor();
      }
    }, 250);

    setTimeout(suppressOfflineSupabaseWarningOnce, 1000);
    setTimeout(suppressOfflineSupabaseWarningOnce, 3000);
    setTimeout(suppressOfflineSupabaseWarningOnce, 8000);
    setTimeout(suppressOfflineSupabaseWarningOnce, 15000);
  }

  function setOfflineUiState(active) {
    if (active) {
      ensureOfflineUiStyles();
      document.documentElement.setAttribute("data-csvb-sire-offline", "1");
      window.CSVB_SIRE_VIEWER_OFFLINE_ACTIVE = true;
      startOfflineSupabaseWarningSuppressor();
    } else {
      document.documentElement.removeAttribute("data-csvb-sire-offline");
      window.CSVB_SIRE_VIEWER_OFFLINE_ACTIVE = false;
      stopOfflineSupabaseWarningSuppressor();
    }
  }

  function clearOfflineData() {
    offlineMode = false;
    offlinePackage = null;
    offlineModeReason = "";
    offlinePgnoByQuestionId = {};
    offlineEeByQuestionId = {};
    offlineReferencesByQuestionId = {};
    setOfflineUiState(false);
  }

  function offlineSourceSuffix() {
    return offlineMode ? " from offline package" : "";
  }

  function offlineDbHelper() {
    return window.CSVB_OFFLINE_DB || null;
  }

  async function readOfflinePackage() {
    const offlineDb = offlineDbHelper();

    if (!offlineDb?.get || !offlineDb?.STORES?.PACKAGES) {
      throw new Error("Offline DB helper is not loaded.");
    }

    return await offlineDb.get(offlineDb.STORES.PACKAGES, OFFLINE_PACKAGE_ID);
  }

  function normalizeOfflineRows(pkg) {
    const packageRows = Array.isArray(pkg?.rows) ? pkg.rows : [];

    return packageRows
      .filter(row => s(row?.source_type).trim() === "SIRE")
      .filter(row => {
        const status = s(row?.status).trim().toLowerCase();
        return !status || status === "active";
      });
  }

  function normalizePgnoItem(x) {
    if (typeof x === "string") return { text: s(x), remarks: "" };

    return {
      text: s(x?.text ?? x?.pgno_text ?? ""),
      remarks: s(x?.remarks ?? "")
    };
  }

  function normalizeEeItem(x) {
    if (typeof x === "string") {
      return { text: s(x), esms_references: "", esms_forms: "", remarks: "" };
    }

    return {
      text: s(x?.text ?? x?.evidence_text ?? x?.Evidence ?? ""),
      esms_references: s(x?.esms_references ?? x?.["eSMS Reference(s)"] ?? x?.ch ?? ""),
      esms_forms: s(x?.esms_forms ?? x?.["eSMS Form(s)"] ?? x?.form ?? ""),
      remarks: s(x?.remarks ?? "")
    };
  }

  function applyOfflinePackage(pkg, reason) {
    const packageRows = normalizeOfflineRows(pkg);

    if (!packageRows.length) {
      throw new Error("Offline package exists but contains no active SIRE question rows.");
    }

    offlineMode = true;
    offlinePackage = pkg;
    offlineModeReason = reason || "offline package";
    offlinePgnoByQuestionId = pkg.pgno_by_question_id || {};
    offlineEeByQuestionId = pkg.ee_by_question_id || {};
    offlineReferencesByQuestionId = pkg.references_by_question_id || {};

    rows = packageRows.map(row => {
      const copy = { ...row, payload: { ...(row?.payload || {}) } };
      const qid = s(copy.id);

      if (qid) {
        if (!offlinePgnoByQuestionId[qid] && Array.isArray(copy.payload.__offline_pgno)) {
          offlinePgnoByQuestionId[qid] = copy.payload.__offline_pgno;
        }

        if (!offlineEeByQuestionId[qid] && Array.isArray(copy.payload.__offline_ee)) {
          offlineEeByQuestionId[qid] = copy.payload.__offline_ee;
        }

        if (!offlineReferencesByQuestionId[qid] && copy.payload.__offline_references) {
          offlineReferencesByQuestionId[qid] = copy.payload.__offline_references;
        }
      }

      return copy;
    });

    setOfflineUiState(true);
    return rows;
  }

  async function tryActivateOfflineMode(options = {}) {
    const allowOnlineFallback = options.allowOnlineFallback !== false;
    const req = offlineRequestStatus();

    if (!req.requested) {
      clearOfflineData();
      return false;
    }

    try {
      const pkg = await readOfflinePackage();

      if (!pkg || !Array.isArray(pkg.rows) || !pkg.rows.length) {
        clearOfflineData();

        const message =
          "No local SIRE Questions Viewer offline package is downloaded on this device. " +
          "Open the Viewer online and use Offline Package > Download Package first.";

        if (!allowOnlineFallback || navigator.onLine === false) {
          throw new Error(message);
        }

        console.warn(message);
        return false;
      }

      applyOfflinePackage(pkg, req.reason);
      return true;
    } catch (error) {
      clearOfflineData();

      if (!allowOnlineFallback || navigator.onLine === false) {
        throw error;
      }

      console.warn("Offline package could not be activated; falling back to online DB:", error);
      return false;
    }
  }

  function isNetworkFetchFailure(error) {
    const msg = s(error?.message || error).toLowerCase();

    return msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("network error") ||
      msg.includes("load failed") ||
      msg.includes("fetch failed") ||
      msg.includes("internet disconnected") ||
      msg.includes("supabase js not available") ||
      navigator.onLine === false;
  }

  async function bootOfflinePackageAfterOnlineFailure(error) {
    const req = offlineRequestStatus();
    const networkLike = isNetworkFetchFailure(error);

    if (!req.requested && !networkLike) return false;

    try {
      const pkg = await readOfflinePackage();

      if (!pkg || !Array.isArray(pkg.rows) || !pkg.rows.length) {
        return false;
      }

      applyOfflinePackage(pkg, "online/network load failed; local package fallback");

      txt("userBadge", "Offline package • SIRE_QUESTIONS_VIEWER");

      ["loginBtn", "switchUserBtn", "logoutBtn"].forEach((id) => {
        const el = $(id);
        if (el) el.style.display = "none";
      });

      txt("modeLine", "Role: offline package • Mode: Read-only offline • Module: SIRE_QUESTIONS_VIEWER");

      msg(
        "okBox",
        "Offline package mode active. Online/auth/database loading failed, so the Viewer loaded the local read-only package."
      );
      msg("warnBox", "");

      await loadQuestions();
      exposeViewerApi();
      return true;
    } catch (offlineError) {
      console.warn("Offline fallback after online/network failure failed:", offlineError);
      return false;
    }
  }

  function loadOfflinePgno(questionId) {
    const key = s(questionId);
    const items = offlinePgnoByQuestionId[key] || [];
    return (Array.isArray(items) ? items : [])
      .map(normalizePgnoItem)
      .filter(x => x.text.trim());
  }

  function loadOfflineEe(questionId) {
    const key = s(questionId);
    const items = offlineEeByQuestionId[key] || [];
    return (Array.isArray(items) ? items : [])
      .map(normalizeEeItem)
      .filter(x => x.text.trim());
  }

  function loadOfflineReferences(questionId) {
    const key = s(questionId);
    return offlineReferencesByQuestionId[key] || {};
  }

  const FACETS = [
    ["version", "Version"],
    ["questionType", "Question Type"],
    ["vesselType", "Vessel Type"],
    ["responseType", "Response Type"],
    ["companyRank", "Company Rank Allocation"],
    ["chapter", "SIRE 2.0 Chapter"]
  ];

  let sb = null;
  let rows = [];
  let selected = null;
  let offlineMode = false;
  let offlinePackage = null;
  let offlineModeReason = "";
  let offlinePgnoByQuestionId = {};
  let offlineEeByQuestionId = {};
  let offlineReferencesByQuestionId = {};
  const chosen = Object.fromEntries(FACETS.map(([k]) => [k, new Set()]));

  // Stage 1 Viewer search index: PGNO + Expected Evidence child rows.
  // Stage 2 Viewer search index: Applicable Publications + Industry Guidance reference rows.
  // Both are built in the background so the Viewer opens immediately.
  let childSearchIndex = new Map();
  let childSearchBuildToken = 0;
  let childSearchIndexed = 0;
  let childSearchTotal = 0;
  let childSearchErrors = 0;

  let referenceSearchIndex = new Map();
  let referenceSearchBuildToken = 0;
  let referenceSearchIndexed = 0;
  let referenceSearchTotal = 0;
  let referenceSearchErrors = 0;

  function facetValues(row, key) {
    const p = row?.payload || {};
    if (key === "version") return [s(row?.version).trim()].filter(Boolean);
    if (key === "questionType") return [pget(p, ["Question Type", "question_type", "questionType"]).trim()].filter(Boolean);
    if (key === "vesselType") return vesselTokens(row);
    if (key === "responseType") return responseTypes(p);
    if (key === "companyRank") return rankTokens(row);
    if (key === "chapter") return [chapter(row)].filter(Boolean);
    return [];
  }

  function rowMatchesFacets(row, skip = "") {
    for (const [key] of FACETS) {
      if (key === skip) continue;
      const set = chosen[key];
      if (!set || !set.size) continue;
      const values = facetValues(row, key);
      if (!values.some(v => set.has(v))) return false;
    }
    return true;
  }

  function childIndexStatusText() {
    if (!childSearchTotal) return "";
    if (childSearchIndexed < childSearchTotal) {
      return ` • EE/PGNO index ${childSearchIndexed}/${childSearchTotal}`;
    }
    if (childSearchErrors > 0) {
      return ` • EE/PGNO index complete (${childSearchErrors} fallback/error)`;
    }
    return " • EE/PGNO index complete";
  }

  function referenceIndexStatusText() {
    if (!referenceSearchTotal) return "";
    if (referenceSearchIndexed < referenceSearchTotal) {
      return ` • References index ${referenceSearchIndexed}/${referenceSearchTotal}`;
    }
    if (referenceSearchErrors > 0) {
      return ` • References index complete (${referenceSearchErrors} fallback/error)`;
    }
    return " • References index complete";
  }

  function indexStatusText() {
    return `${childIndexStatusText()}${referenceIndexStatusText()}`;
  }

  function childIndexTextFromEe(items) {
    return (items || []).map((it, i) => [
      `Expected Evidence ${i + 1}`,
      it.text,
      it.esms_references,
      it.esms_forms,
      it.remarks
    ].map(s).join(" ")).join(" ");
  }

  function childIndexTextFromPgno(row, items) {
    return (items || []).map((it, i) => [
      pgnoCode(row, i),
      it.text,
      it.remarks
    ].map(s).join(" ")).join(" ");
  }

  function referenceIndexTextFromRow(refRow) {
    const publications = normalizeArray(refRow?.applicable_publications);
    const guidance = normalizeArray(refRow?.industry_guidance);

    const pubText = publications.map((p, i) => [
      `Applicable Publication ${i + 1}`,
      p?.display_name,
      p?.raw_publication_text,
      flattenText(p)
    ].map(s).join(" ")).join(" ");

    const guidanceText = guidance.map((g, i) => [
      `Industry Guidance ${i + 1}`,
      g?.guidance_title,
      g?.guidance_section,
      g?.guidance_subsection,
      g?.guidance_content,
      flattenText(g)
    ].map(s).join(" ")).join(" ");

    return [pubText, guidanceText].join(" ");
  }

  function seedChildSearchIndexFromPayload() {
    childSearchIndex = new Map();
    rows.forEach((row) => {
      const fallbackText = [
        childIndexTextFromEe(eeFallback(row)),
        childIndexTextFromPgno(row, pgnoFallback(row))
      ].join(" ").toLowerCase();
      childSearchIndex.set(rowId(row), fallbackText);
    });
  }

  function seedReferenceSearchIndex() {
    referenceSearchIndex = new Map();
    rows.forEach((row) => referenceSearchIndex.set(rowId(row), ""));
  }

  function updateIndexStatusLine() {
    txt("loadedLine", `Loaded ${rows.length} active SIRE 2.0 questions${offlineSourceSuffix()}${indexStatusText()}`);
    txt("loadHint", `Loaded ${rows.length} active SIRE 2.0 question(s)${offlineSourceSuffix()}.${indexStatusText()}`);
  }

  async function buildChildSearchIndex() {
    const token = ++childSearchBuildToken;
    childSearchIndexed = 0;
    childSearchTotal = rows.length;
    childSearchErrors = 0;

    if (!rows.length) return;

    updateIndexStatusLine();

    let next = 0;
    const workers = Math.min(4, rows.length);

    async function worker() {
      while (token === childSearchBuildToken && next < rows.length) {
        const row = rows[next++];
        const id = rowId(row);

        try {
          let pgno = [];
          let ee = [];

          if (row.id) {
            const results = await Promise.allSettled([
              loadPgno(row.id),
              loadEe(row.id)
            ]);

            pgno = results[0].status === "fulfilled" ? results[0].value : pgnoFallback(row);
            ee = results[1].status === "fulfilled" ? results[1].value : eeFallback(row);

            if (results.some((r) => r.status === "rejected")) childSearchErrors += 1;
          } else {
            pgno = pgnoFallback(row);
            ee = eeFallback(row);
          }

          const text = [
            childIndexTextFromEe(ee),
            childIndexTextFromPgno(row, pgno)
          ].join(" ").toLowerCase();

          childSearchIndex.set(id, text);
        } catch (_) {
          childSearchErrors += 1;
          const fallbackText = [
            childIndexTextFromEe(eeFallback(row)),
            childIndexTextFromPgno(row, pgnoFallback(row))
          ].join(" ").toLowerCase();
          childSearchIndex.set(id, fallbackText);
        } finally {
          childSearchIndexed += 1;

          if (childSearchIndexed % 20 === 0 || childSearchIndexed === childSearchTotal) {
            updateIndexStatusLine();
            if (s($("searchInput")?.value).trim()) renderList();
          }
        }
      }
    }

    await Promise.all(Array.from({ length: workers }, worker));

    if (token !== childSearchBuildToken) return;

    updateIndexStatusLine();
    renderList();
  }

  async function buildReferenceSearchIndex() {
    const token = ++referenceSearchBuildToken;
    referenceSearchIndexed = 0;
    referenceSearchTotal = rows.length;
    referenceSearchErrors = 0;

    if (!rows.length) return;

    updateIndexStatusLine();

    let next = 0;
    const workers = Math.min(3, rows.length);

    async function worker() {
      while (token === referenceSearchBuildToken && next < rows.length) {
        const row = rows[next++];
        const id = rowId(row);

        try {
          if (!row.id) {
            referenceSearchIndex.set(id, "");
          } else if (offlineMode) {
            const refRow = loadOfflineReferences(row.id);
            const text = referenceIndexTextFromRow(refRow).toLowerCase();
            referenceSearchIndex.set(id, text);
          } else {
            const { data, error } = await sb.rpc("csvb_sire_question_references_for_question", {
              p_question_id: row.id
            });

            if (error) throw error;

            const refRow = Array.isArray(data) ? (data[0] || {}) : (data || {});
            const text = referenceIndexTextFromRow(refRow).toLowerCase();
            referenceSearchIndex.set(id, text);
          }
        } catch (_) {
          referenceSearchErrors += 1;
          referenceSearchIndex.set(id, "");
        } finally {
          referenceSearchIndexed += 1;

          if (referenceSearchIndexed % 20 === 0 || referenceSearchIndexed === referenceSearchTotal) {
            updateIndexStatusLine();
            if (s($("searchInput")?.value).trim()) renderList();
          }
        }
      }
    }

    await Promise.all(Array.from({ length: workers }, worker));

    if (token !== referenceSearchBuildToken) return;

    updateIndexStatusLine();
    renderList();
  }

  function haystack(row) {
    const p = row?.payload || {};
    const parts = [
      qno(row),
      s(row?.version),
      Array.isArray(row?.tags) ? row.tags.join(" ") : s(row?.tags),
      pget(p, ["short_text", "Short Text", "ShortText", "shortText"]),
      pget(p, ["question", "Question"]),
      pget(p, ["inspection_guidance", "Inspection Guidance", "InspectionGuidance", "guidance"]),
      pget(p, ["suggested_inspector_actions", "Suggested Inspector Actions", "SuggestedInspectorActions", "actions"]),
      pget(p, ["Question Type", "question_type", "questionType"]),
      pget(p, ["Vessel Type", "vessel_type", "vesselType"]),
      pget(p, ["Company Rank Allocation", "Company_Rank_Allocation", "company_rank_allocation", "companyRankAllocation"]),
      pget(p, ["TMSA3 Reference", "TMSA3", "tmsa3_reference", "tmsa3Reference"]),
      pget(p, ["TMSA4 Reference", "TMSA4", "tmsa4_reference", "tmsa4Reference"]),
      responseTypes(p).join(" "),
      childSearchIndex.get(rowId(row)) || "",
      referenceSearchIndex.get(rowId(row)) || ""
    ];
    try { parts.push(JSON.stringify(p)); } catch {}
    return parts.join(" ").toLowerCase();
  }

  function searchOk(row) {
    const term = s($("searchInput")?.value).trim().toLowerCase();
    return !term || haystack(row).includes(term);
  }

  function filteredRows() {
    return rows
      .filter(row => searchOk(row) && rowMatchesFacets(row))
      .sort((a, b) => {
        const ka = qkey(a), kb = qkey(b);
        for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
        return ka[3].localeCompare(kb[3]);
      });
  }

  function designationClass(row) {
    const qt = pget(row?.payload || {}, ["Question Type", "question_type", "questionType"]).toLowerCase();
    if (qt.includes("core")) return " q-core";
    if (qt.includes("rotational 1") || qt.includes("rotational i") || qt.includes("r1")) return " q-rot1";
    if (qt.includes("rotational 2") || qt.includes("rotational ii") || qt.includes("r2")) return " q-rot2";
    return "";
  }

  function renderFacets() {
    for (const [key] of FACETS) {
      const summary = $("facetSummary_" + key);
      if (summary) {
        const arr = Array.from(chosen[key] || []);
        summary.textContent = arr.length ? arr.slice(0,2).join(", ") + (arr.length > 2 ? ` +${arr.length - 2}` : "") : "";
      }

      const host = $("facetOptions_" + key);
      if (!host) continue;
      host.innerHTML = "";

      const counts = new Map();
      for (const row of rows) {
        if (!searchOk(row) || !rowMatchesFacets(row, key)) continue;
        for (const v of facetValues(row, key)) counts.set(v, (counts.get(v) || 0) + 1);
      }

      const values = Array.from(counts.entries()).sort((a,b) => key === "chapter" ? Number(a[0]) - Number(b[0]) : a[0].localeCompare(b[0]));
      const allCount = values.reduce((t, x) => t + x[1], 0);
      const all = document.createElement("div");
      all.className = "facetOpt facetOptAll";
      all.innerHTML = `<label><input type="checkbox" ${chosen[key].size ? "" : "checked"}><span><b>Select All</b></span></label><span class="facetCount">${allCount}</span>`;
      all.querySelector("input").addEventListener("change", () => { chosen[key].clear(); renderList(); });
      host.appendChild(all);

      if (!values.length) {
        const div = document.createElement("div");
        div.className = "muted small";
        div.textContent = "No options";
        host.appendChild(div);
        continue;
      }

      for (const [value, count] of values) {
        const div = document.createElement("div");
        div.className = "facetOpt";
        div.innerHTML = `<label><input type="checkbox" ${chosen[key].has(value) ? "checked" : ""}><span>${esc(value)}</span></label><span class="facetCount">${count}</span>`;
        div.querySelector("input").addEventListener("change", (ev) => {
          if (ev.target.checked) chosen[key].add(value);
          else chosen[key].delete(value);
          renderList();
        });
        host.appendChild(div);
      }
    }
  }

  function renderList() {
    const list = $("qList");
    if (!list) return;
    const data = filteredRows();
    list.innerHTML = data.map(row => {
      const p = row.payload || {};
      const shortText = pget(p, ["short_text", "Short Text", "ShortText", "shortText"]);
      const question = pget(p, ["question", "Question"]);
      const sub = ($("showFullQuestionToggle")?.checked ? question || shortText : shortText || question);
      const active = selected && selected.id === row.id ? " active" : "";
      return `<div class="qitem${designationClass(row)}${active}" data-qid="${esc(row.id)}"><div class="qno">${esc(qno(row))}</div><div class="qsub">${esc(sub)}</div></div>`;
    }).join("");

    list.querySelectorAll(".qitem").forEach(el => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-qid");
        const row = rows.find(x => String(x.id) === id);
        if (row) selectRow(row);
      });
    });

    txt("countLine", `${data.length} questions`);
    txt("loadedLine", `Loaded ${rows.length} active SIRE 2.0 questions${offlineSourceSuffix()}${indexStatusText()}`);
    renderFacets();
  }

  async function loadPgno(questionId) {
    if (offlineMode) return loadOfflinePgno(questionId);

    const { data, error } = await sb.rpc("csvb_pgno_master_for_question_for_me", { p_question_id: questionId });
    if (error) throw error;
    return (data || []).map(x => ({ text: s(x.pgno_text), remarks: s(x.remarks) })).filter(x => x.text.trim());
  }

  async function loadEe(questionId) {
    if (offlineMode) return loadOfflineEe(questionId);

    const { data, error } = await sb.rpc("csvb_expected_evidence_for_question_for_me", { p_question_id: questionId });
    if (error) throw error;
    return (data || []).map(x => ({
      text: s(x.evidence_text),
      esms_references: s(x.esms_references),
      esms_forms: s(x.esms_forms),
      remarks: s(x.remarks)
    })).filter(x => x.text.trim());
  }

  function pgnoFallback(row) {
    const p = row?.payload || {};
    const raw = p.potential_grounds_for_negative_observations ?? p["Potential Grounds for Negative Observations"] ?? p["Potential grounds for negative observations"] ?? p.PGNO;
    if (Array.isArray(raw)) return raw.map(x => ({ text: s(x), remarks: "" })).filter(x => x.text.trim());
    if (typeof raw === "string" && raw.trim()) return bulletSplit(raw).map(x => ({ text: x, remarks: "" }));
    return [];
  }

  function eeFallback(row) {
    const p = row?.payload || {};
    const raw = p.expected_evidence ?? p["Expected Evidence"] ?? p.ExpEv_Bullets ?? p["ExpEv_Bullets"];
    if (Array.isArray(raw)) {
      return raw.map(x => typeof x === "object"
        ? { text: s(x.text ?? x.evidence_text ?? x.Evidence), esms_references: s(x.ch ?? x.esms_references ?? x["eSMS Reference(s)"]), esms_forms: s(x.form ?? x.esms_forms ?? x["eSMS Form(s)"]), remarks: s(x.remarks) }
        : { text: s(x), esms_references: "", esms_forms: "", remarks: "" }
      ).filter(x => x.text.trim());
    }
    if (typeof raw === "string" && raw.trim()) return bulletSplit(raw).map(x => ({ text: x, esms_references: "", esms_forms: "", remarks: "" }));
    return [];
  }

  function renderEe(items) {
    txt("vEeCount", `${items.length} item(s)`);
    const host = $("vEeList");
    if (!host) return;
    if (!items.length) {
      host.innerHTML = `<div class="muted">No Expected Evidence recorded for this question.</div>`;
      return;
    }
    host.innerHTML = items.map((it, i) => `
      <div class="masterRow">
        <div class="masterHdr"><div class="masterCode">${i + 1}.</div></div>
        <div class="masterBody" style="margin-top:6px; white-space:pre-wrap;">${esc(it.text)}</div>
        ${(it.esms_references || it.esms_forms || it.remarks) ? `<div style="height:8px;"></div>
          ${it.esms_references ? `<div class="masterTiny"><b>eSMS Reference(s):</b> ${esc(it.esms_references)}</div>` : ""}
          ${it.esms_forms ? `<div class="masterTiny"><b>eSMS Form(s):</b> ${esc(it.esms_forms)}</div>` : ""}
          ${it.remarks ? `<div class="masterTiny"><b>Remarks:</b> ${esc(it.remarks)}</div>` : ""}` : ""}
      </div>`).join("");
  }

  function renderPgno(items) {
    txt("vPgnoCount", `${items.length} PGNO(s)`);
    const host = $("vPgnoList");
    if (!host) return;
    if (!items.length) {
      host.innerHTML = `<div class="muted">No PGNOs recorded for this question.</div>`;
      return;
    }
    host.innerHTML = items.map((it, i) => `
      <div class="masterRow">
        <div class="masterHdr"><div class="masterCode">${esc(pgnoCode(selected, i))}</div></div>
        <div class="masterBody" style="margin-top:6px; white-space:pre-wrap;">${esc(it.text)}</div>
        ${it.remarks ? `<div class="masterBody" style="margin-top:8px;"><b>Remarks:</b> ${esc(it.remarks)}</div>` : ""}
      </div>`).join("");
  }

  async function selectRow(row) {
    selected = JSON.parse(JSON.stringify(row));
    msg("warnBox", "");

    let pgno = [];
    let ee = [];
    try { pgno = selected.id ? await loadPgno(selected.id) : []; } catch (e) { pgno = pgnoFallback(selected); msg("warnBox", "Warning: PGNO DB rows could not be loaded. Payload fallback is shown.\n\n" + s(e?.message || e)); }
    try { ee = selected.id ? await loadEe(selected.id) : []; } catch (e) { ee = eeFallback(selected); msg("warnBox", (s($("warnBox")?.textContent) ? $("warnBox").textContent + "\n\n---\n\n" : "") + "Warning: Expected Evidence DB rows could not be loaded. Payload fallback is shown.\n\n" + s(e?.message || e)); }
    if (!pgno.length) pgno = pgnoFallback(selected);
    if (!ee.length) ee = eeFallback(selected);

    const p = selected.payload || {};
    txt("vhdrNumber", qno(selected));
    txt("vhdrId", selected.id ? `DB id: ${selected.id}` : "");
    txt("vShortText", pget(p, ["short_text", "Short Text", "ShortText", "shortText"]));
    txt("vQuestion", pget(p, ["question", "Question"]));
    txt("vGuidance", pget(p, ["inspection_guidance", "Inspection Guidance", "InspectionGuidance", "guidance"]));
    txt("vActions", pget(p, ["suggested_inspector_actions", "Suggested Inspector Actions", "SuggestedInspectorActions", "actions"]));
    txt("vAttrQuestionType", pget(p, ["Question Type", "question_type", "questionType"]));
    txt("vAttrVesselType", pget(p, ["Vessel Type", "vessel_type", "vesselType"]));
    txt("vAttrRoviq", pget(p, ["ROVIQ List", "ROVIQ", "roviq_list", "roviqList"]));
    txt("vAttrCompanyRank", pget(p, ["Company Rank Allocation", "Company_Rank_Allocation", "company_rank_allocation", "companyRankAllocation"]));
    txt("vAttrTmsa3", pget(p, ["TMSA3 Reference", "TMSA3", "tmsa3_reference", "tmsa3Reference"]));
    txt("vAttrTmsa4", pget(p, ["TMSA4 Reference", "TMSA4", "tmsa4_reference", "tmsa4Reference"]));
    txt("vAttrResponseType", responseTypes(p).join(", "));
    txt("vTags", Array.isArray(selected.tags) ? selected.tags.join(", ") : s(selected.tags));
    txt("vVersion", s(selected.version));
    txt("vSourcePill", `source: ${selected.source_type || "SIRE"}`);
    txt("vStatusPill", `status: ${selected.status || "active"}`);

    const raw = $("vRaw");
    if (raw) { try { raw.textContent = JSON.stringify(p, null, 2); } catch { raw.textContent = ""; } }

    renderEe(ee);
    renderPgno(pgno);

    if ($("emptyState")) $("emptyState").style.display = "none";
    if ($("viewPanel")) $("viewPanel").style.display = "block";
    document.querySelectorAll("#viewPanel details.coll").forEach(d => { if (d.id !== "vCollAttrs") d.open = true; });
    const attrs = $("vCollAttrs");
    if (attrs) attrs.open = false;

    renderList();
  }

  async function loadQuestions() {
    msg("warnBox", "");
    msg("okBox", "");
    txt("loadHint", "Loading active SIRE 2.0 questions…");

    try {
      const offlineReq = offlineRequestStatus();

      if (offlineReq.requested || offlineMode) {
        let offlineReady = false;

        try {
          offlineReady = offlineMode || await tryActivateOfflineMode({
            allowOnlineFallback: navigator.onLine !== false
          });
        } catch (offlineError) {
          if (navigator.onLine === false) {
            throw new Error("Offline package mode failed: " + s(offlineError?.message || offlineError));
          }

          msg(
            "warnBox",
            "Offline package could not be used. Falling back to online database.\n\n" +
            s(offlineError?.message || offlineError)
          );
        }

        if (offlineReady) {
          childSearchBuildToken += 1;
          referenceSearchBuildToken += 1;
          childSearchIndexed = 0;
          childSearchTotal = rows.length;
          childSearchErrors = 0;
          referenceSearchIndexed = 0;
          referenceSearchTotal = rows.length;
          referenceSearchErrors = 0;
          seedChildSearchIndexFromPayload();
          seedReferenceSearchIndex();

          txt(
            "loadHint",
            `Loaded ${rows.length} active SIRE 2.0 question(s) from local offline package. Building search indexes…`
          );

          txt(
            "modeLine",
            `Role: offline package • Mode: Read-only offline • Module: SIRE_QUESTIONS_VIEWER`
          );

          msg(
            "okBox",
            `Offline package mode active. Loaded ${rows.length} SIRE 2.0 question(s) from this device.`
          );

          renderList();

          if (rows.length) {
            await selectRow(
              rows.slice().sort((a,b) =>
                qkey(a)[0] - qkey(b)[0] ||
                qkey(a)[1] - qkey(b)[1] ||
                qkey(a)[2] - qkey(b)[2]
              )[0]
            );
          } else {
            selected = null;
            if ($("emptyState")) $("emptyState").style.display = "block";
            if ($("viewPanel")) $("viewPanel").style.display = "none";
          }

          buildChildSearchIndex().catch((e) => {
            childSearchErrors += 1;
            txt("loadHint", `Loaded ${rows.length} active SIRE 2.0 question(s) from offline package. EE/PGNO search index warning: ${s(e?.message || e)}`);
          });

          buildReferenceSearchIndex().catch((e) => {
            referenceSearchErrors += 1;
            txt("loadHint", `Loaded ${rows.length} active SIRE 2.0 question(s) from offline package. Reference search index warning: ${s(e?.message || e)}`);
          });

          return;
        }
      }

      clearOfflineData();

      const { data, error } = await sb.rpc("csvb_questions_master_for_me");
      if (error) throw error;

      rows = (data || [])
        .filter(row => s(row.source_type).trim() === "SIRE")
        .filter(row => {
          const status = s(row.status).trim().toLowerCase();
          return !status || status === "active";
        });

      childSearchBuildToken += 1;
      referenceSearchBuildToken += 1;
      childSearchIndexed = 0;
      childSearchTotal = rows.length;
      childSearchErrors = 0;
      referenceSearchIndexed = 0;
      referenceSearchTotal = rows.length;
      referenceSearchErrors = 0;
      seedChildSearchIndexFromPayload();
      seedReferenceSearchIndex();

      txt("loadHint", `Loaded ${rows.length} active SIRE 2.0 question(s). Building search indexes…`);
      renderList();

      if (rows.length) await selectRow(rows.slice().sort((a,b) => qkey(a)[0] - qkey(b)[0] || qkey(a)[1] - qkey(b)[1] || qkey(a)[2] - qkey(b)[2])[0]);
      else {
        selected = null;
        if ($("emptyState")) $("emptyState").style.display = "block";
        if ($("viewPanel")) $("viewPanel").style.display = "none";
      }

      buildChildSearchIndex().catch((e) => {
        childSearchErrors += 1;
        txt("loadHint", `Loaded ${rows.length} active SIRE 2.0 question(s). EE/PGNO search index warning: ${s(e?.message || e)}`);
      });

      buildReferenceSearchIndex().catch((e) => {
        referenceSearchErrors += 1;
        txt("loadHint", `Loaded ${rows.length} active SIRE 2.0 question(s). Reference search index warning: ${s(e?.message || e)}`);
      });
    } catch (e) {
      const recoveredOffline = await bootOfflinePackageAfterOnlineFailure(e);
      if (recoveredOffline) return;

      txt("loadHint", "");
      msg("warnBox", "Failed to load SIRE 2.0 questions from DB:\n\n" + s(e?.message || e));
    }
  }

  function wireUi() {
    $("reloadBtn")?.addEventListener("click", loadQuestions);
    $("searchInput")?.addEventListener("input", renderList);
    $("showFullQuestionToggle")?.addEventListener("change", () => {
      txt("showFullQuestionState", $("showFullQuestionToggle").checked ? "ON (Question)" : "OFF (Short Text)");
      renderList();
    });
    txt("showFullQuestionState", $("showFullQuestionToggle")?.checked ? "ON (Question)" : "OFF (Short Text)");

    $("btnToggleAdvancedView")?.addEventListener("click", () => {
      const el = $("viewAdvanced");
      if (el) el.style.display = el.style.display === "block" ? "none" : "block";
    });
  }

  function exposeViewerApi() {
    window.CSVB_SIRE_QUESTIONS_VIEWER = {
      build: BUILD,
      reload: loadQuestions,
      getRows: () => rows.slice(),
      getSelected: () => selected ? JSON.parse(JSON.stringify(selected)) : null,
      isOfflineMode: () => offlineMode === true,
      getOfflinePackageInfo: () => offlinePackage ? {
        package_id: offlinePackage.package_id || OFFLINE_PACKAGE_ID,
        package_version: offlinePackage.package_version || "",
        downloaded_at: offlinePackage.downloaded_at || null,
        question_count: offlinePackage.question_count || rows.length,
        error_count: offlinePackage.error_count || 0,
        reason: offlineModeReason || ""
      } : null,
      getChildSearchIndexStatus: () => ({
        indexed: childSearchIndexed,
        total: childSearchTotal,
        errors: childSearchErrors
      }),
      getReferenceSearchIndexStatus: () => ({
        indexed: referenceSearchIndexed,
        total: referenceSearchTotal,
        errors: referenceSearchErrors
      })
    };
  }

  async function boot() {
    try {
      const offlineReq = offlineRequestStatus();

      if (offlineReq.requested) {
        try {
          const offlineReady = await tryActivateOfflineMode({
            allowOnlineFallback: navigator.onLine !== false
          });

          if (offlineReady) {
            txt("userBadge", "Offline package • SIRE_QUESTIONS_VIEWER");

            ["loginBtn", "switchUserBtn", "logoutBtn"].forEach((id) => {
              const el = $(id);
              if (el) el.style.display = "none";
            });

            txt("modeLine", `Role: offline package • Mode: Read-only offline • Module: SIRE_QUESTIONS_VIEWER`);

            wireUi();
            document.querySelectorAll(".facet").forEach(d => { try { d.open = false; } catch {} });
            await loadQuestions();
            exposeViewerApi();
            return;
          }
        } catch (offlineError) {
          setOfflineUiState(true);
          txt("userBadge", "Offline package unavailable");
          txt("modeLine", `Role: — • Mode: Offline package unavailable • Module: SIRE_QUESTIONS_VIEWER`);
          wireUi();
          msg(
            "warnBox",
            "Offline Viewer could not start.\\n\\n" +
            s(offlineError?.message || offlineError)
          );
          exposeViewerApi();
          return;
        }
      }

      if (!window.supabase) throw new Error("Supabase JS not available.");
      if (!window.AUTH) throw new Error("AUTH helper not loaded.");

      sb = window.AUTH.ensureSupabase();
      const me = await window.AUTH.setupAuthButtons({
        badgeId: "userBadge",
        loginBtnId: "loginBtn",
        logoutBtnId: "logoutBtn",
        switchBtnId: "switchUserBtn",
        loginPath: "./login.html"
      });

      if (!me?.session?.user) return;

      const role = me.profile?.role || "—";
      txt("modeLine", `Role: ${role} • Mode: Read-only • Module: SIRE_QUESTIONS_VIEWER`);

      wireUi();
      document.querySelectorAll(".facet").forEach(d => { try { d.open = false; } catch {} });
      await loadQuestions();
      exposeViewerApi();
    } catch (e) {
      const recoveredOffline = await bootOfflinePackageAfterOnlineFailure(e);
      if (recoveredOffline) return;

      msg("warnBox", "Boot failed:\n\n" + s(e?.message || e));
    }
  }

  boot();
})();
