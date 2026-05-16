// public/q-sire-questions-viewer.js
// C.S.V. BEACON — SIRE 2.0 Questions Viewer
// Read-only page script. It does not call save/delete/import/replace RPCs.

(() => {
  "use strict";

  const BUILD = "SIRE-QUESTIONS-VIEWER-20260516_2";
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
  const chosen = Object.fromEntries(FACETS.map(([k]) => [k, new Set()]));

  // Stage 1 Viewer search index: PGNO + Expected Evidence child rows.
  // Built in the background so the Viewer opens immediately.
  let childSearchIndex = new Map();
  let childSearchBuildToken = 0;
  let childSearchIndexed = 0;
  let childSearchTotal = 0;
  let childSearchErrors = 0;

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
      return ` • EE/PGNO search index ${childSearchIndexed}/${childSearchTotal}`;
    }
    if (childSearchErrors > 0) {
      return ` • EE/PGNO search index complete (${childSearchErrors} fallback/error)`;
    }
    return " • EE/PGNO search index complete";
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

  async function buildChildSearchIndex() {
    const token = ++childSearchBuildToken;
    childSearchIndexed = 0;
    childSearchTotal = rows.length;
    childSearchErrors = 0;

    if (!rows.length) return;

    txt("loadHint", `Loaded ${rows.length} active SIRE 2.0 question(s). Building EE/PGNO search index…`);

    let next = 0;
    const workers = Math.min(6, rows.length);

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
            txt("loadedLine", `Loaded ${rows.length} active SIRE 2.0 questions${childIndexStatusText()}`);
            txt("loadHint", `Loaded ${rows.length} active SIRE 2.0 question(s).${childIndexStatusText()}`);

            if (s($("searchInput")?.value).trim()) {
              renderList();
            }
          }
        }
      }
    }

    await Promise.all(Array.from({ length: workers }, worker));

    if (token !== childSearchBuildToken) return;

    txt("loadedLine", `Loaded ${rows.length} active SIRE 2.0 questions${childIndexStatusText()}`);
    txt("loadHint", `Loaded ${rows.length} active SIRE 2.0 question(s).${childIndexStatusText()}`);
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
      childSearchIndex.get(rowId(row)) || ""
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
    txt("loadedLine", `Loaded ${rows.length} active SIRE 2.0 questions${childIndexStatusText()}`);
    renderFacets();
  }

  async function loadPgno(questionId) {
    const { data, error } = await sb.rpc("csvb_pgno_master_for_question_for_me", { p_question_id: questionId });
    if (error) throw error;
    return (data || []).map(x => ({ text: s(x.pgno_text), remarks: s(x.remarks) })).filter(x => x.text.trim());
  }

  async function loadEe(questionId) {
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
      const { data, error } = await sb.rpc("csvb_questions_master_for_me");
      if (error) throw error;

      rows = (data || [])
        .filter(row => s(row.source_type).trim() === "SIRE")
        .filter(row => {
          const status = s(row.status).trim().toLowerCase();
          return !status || status === "active";
        });

      childSearchBuildToken += 1;
      childSearchIndexed = 0;
      childSearchTotal = rows.length;
      childSearchErrors = 0;
      seedChildSearchIndexFromPayload();

      txt("loadHint", `Loaded ${rows.length} active SIRE 2.0 question(s). Building EE/PGNO search index…`);
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
    } catch (e) {
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

  async function boot() {
    try {
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

      window.CSVB_SIRE_QUESTIONS_VIEWER = {
        build: BUILD,
        reload: loadQuestions,
        getRows: () => rows.slice(),
        getSelected: () => selected ? JSON.parse(JSON.stringify(selected)) : null,
        getChildSearchIndexStatus: () => ({
          indexed: childSearchIndexed,
          total: childSearchTotal,
          errors: childSearchErrors
        })
      };
    } catch (e) {
      msg("warnBox", "Boot failed:\n\n" + s(e?.message || e));
    }
  }

  boot();
})();
