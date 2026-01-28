// public/q-questions-editor.js
(() => {
  "use strict";

  // ======================
  // Helpers
  // ======================
  function $(id) { return document.getElementById(id); }

  function safeStr(v) {
    return v === null || v === undefined ? "" : String(v);
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

  function setModeLine(txt) {
    const el = $("modeLine");
    if (el) el.textContent = txt || "";
  }

  function pad2(n) {
    const x = Number.isFinite(n) ? n : parseInt(String(n || "0"), 10) || 0;
    return String(x).padStart(2, "0");
  }

  function pad3(n) {
    const x = Number.isFinite(n) ? n : parseInt(String(n || "0"), 10) || 0;
    return String(x).padStart(3, "0");
  }

  function parseNumberBase(nb) {
    const s = safeStr(nb).trim();
    if (!s) return { xx: "", yy: "", zz: "" };

    const parts = s.split(".").filter(Boolean);
    const xx = parts[0] ?? "";
    const yy = parts[1] ?? "";
    const zz = parts[2] ?? "";
    return { xx, yy, zz };
  }

  // Numeric comparator for correct chapter ordering
  function numberBaseToTuple(nb) {
    const { xx, yy, zz } = parseNumberBase(nb);
    const a = parseInt(xx, 10); // chapter
    const b = parseInt(yy, 10); // section
    const c = parseInt(zz, 10); // item (2 or 3 digits)
    return [
      Number.isFinite(a) ? a : 999999,
      Number.isFinite(b) ? b : 999999,
      Number.isFinite(c) ? c : 999999,
    ];
  }

  function computeNumberBase({ xx, yy, item }, isSire) {
    const a = parseInt(safeStr(xx), 10);
    const b = parseInt(safeStr(yy), 10);
    const c = parseInt(safeStr(item), 10);

    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return "";

    // IMPORTANT:
    // - SIRE typically uses xx.yy.zz (2-digit item)
    // - Custom/spare often uses xx.yy.zzz (3-digit item) to satisfy DB constraints
    const left = `${pad2(a)}.${pad2(b)}.`;
    const right = isSire ? String(c).padStart(2, "0") : String(c).padStart(3, "0");
    return left + right;
  }

  function computeNumberFull(numberBase, suffix) {
    const nb = safeStr(numberBase).trim();
    const sx = safeStr(suffix).trim();
    if (!nb) return "";
    if (!sx) return nb;
    return `${nb}-${sx}`;
  }

  function payloadGet(p, keys) {
    for (const k of keys) {
      if (p && Object.prototype.hasOwnProperty.call(p, k)) return p[k];
    }
    return "";
  }

  function payloadSetCanonical(p, key, val) {
    if (!p || typeof p !== "object") p = {};
    p[key] = val;
    return p;
  }

  // ======================
  // State
  // ======================
  let sb = null;
  let me = null;

  let allRows = [];
  let selected = null; // cloned selected row
  let mode = "view";   // "view" | "edit"

  // ======================
  // Boot
  // ======================
  async function boot() {
    try {
      if (!window.AUTH) {
        showWarn("AUTH helper not loaded (auth.js).");
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

      setModeLine(`Role: ${me.profile?.role || "—"} • Mode: Admin • Module: QUESTIONS_EDITOR`);

      wireUI();
      await loadQuestions();
    } catch (e) {
      showWarn("Boot failed:\n\n" + (e?.message || String(e)));
    }
  }

  function wireUI() {
    $("reloadBtn").onclick = () => loadQuestions();
    $("newQuestionBtn").onclick = () => newQuestion();

    $("sourceFilter").onchange = () => renderList();
    $("statusFilter").onchange = () => renderList();
    $("versionFilter").oninput = () => renderList();
    $("searchInput").oninput = () => renderList();

    $("btnEdit").onclick = () => setMode("edit");
    $("btnView").onclick = () => setMode("view");
    $("btnSave").onclick = () => saveSelected();
    $("btnReset").onclick = () => resetSelected();

    // Numbering inputs: rebuild number_base + header
    for (const id of ["dbChapter", "dbSection", "dbItem", "dbSourceType", "dbNumberSuffix"]) {
      const el = $(id);
      if (!el) continue;
      el.oninput = () => refreshNumbering();
      el.onchange = () => refreshNumbering();
    }

    // Canonical payload textareas -> keep raw in sync only in edit mode
    for (const id of ["pShortText", "pQuestion", "pGuidance", "pActions", "pEvidence", "pNegObs"]) {
      const el = $(id);
      if (!el) continue;
      el.oninput = () => {
        if (mode === "edit") refreshRawPayloadPreview();
      };
    }
  }

  // ======================
  // Load + list
  // ======================
  async function loadQuestions() {
    showWarn("");
    showOk("");
    setText("loadHint", "Loading…");
    setText("loadedLine", "");

    try {
      const status = safeStr($("statusFilter").value).trim();
      const version = safeStr($("versionFilter").value).trim();
      const src = safeStr($("sourceFilter").value).trim();

      let q = sb
        .from("questions_master")
        .select("id, number_base, number_suffix, number_full, source_type, is_custom, status, version, tags, payload, updated_at, created_at")
        .order("number_base", { ascending: true }); // still fetched, but we will sort correctly client-side

      if (status) q = q.eq("status", status);
      if (version) q = q.eq("version", version);
      if (src && src !== "ALL") q = q.eq("source_type", src);

      const { data, error } = await q;
      if (error) throw error;

      allRows = (data || []);

      // FIX A: correct numeric ordering (xx,yy,zz/zzz) even though column is text
      allRows.sort((r1, r2) => {
        const t1 = numberBaseToTuple(r1.number_base);
        const t2 = numberBaseToTuple(r2.number_base);
        if (t1[0] !== t2[0]) return t1[0] - t2[0];
        if (t1[1] !== t2[1]) return t1[1] - t2[1];
        if (t1[2] !== t2[2]) return t1[2] - t2[2];
        // tie-breaker: suffix
        return safeStr(r1.number_suffix).localeCompare(safeStr(r2.number_suffix));
      });

      setText("loadHint", "");
      setText("loadedLine", `Loaded ${allRows.length}`);

      renderList();

      if (allRows.length) {
        selectRow(allRows[0]);
      } else {
        selected = null;
        $("editPanel").style.display = "none";
        $("emptyState").style.display = "block";
      }
    } catch (e) {
      setText("loadHint", "");
      showWarn("Failed to load questions from DB:\n\n" + (e?.message || String(e)));
    }
  }

  function passesSearch(r, term) {
    if (!term) return true;
    const t = term.toLowerCase();

    const n = safeStr(r.number_full || computeNumberFull(r.number_base, r.number_suffix)).toLowerCase();
    const p = r.payload || {};

    const st = safeStr(payloadGet(p, ["short_text", "ShortText", "shortText", "Short Text"])).toLowerCase();
    const qu = safeStr(payloadGet(p, ["question", "Question"])).toLowerCase();

    return n.includes(t) || st.includes(t) || qu.includes(t);
  }

  function renderList() {
    const list = $("qList");
    list.innerHTML = "";

    const term = safeStr($("searchInput").value).trim();
    const filtered = allRows.filter(r => passesSearch(r, term));

    setText("countLine", `${filtered.length} questions`);

    for (const r of filtered) {
      const div = document.createElement("div");
      div.className = "qitem" + (selected && !selected.__isNew && selected.id === r.id ? " active" : "");

      const nfull = r.number_full || computeNumberFull(r.number_base, r.number_suffix);

      const p = r.payload || {};
      const sub =
        safeStr(payloadGet(p, ["short_text", "ShortText", "shortText", "Short Text"])) ||
        safeStr(payloadGet(p, ["question", "Question"]));

      div.innerHTML = `
        <div class="qno">${nfull}</div>
        <div class="qsub">${escapeHtml(sub)}</div>
        <div class="qmeta">${escapeHtml(safeStr(r.source_type))} • ${escapeHtml(safeStr(r.status))}${r.version ? ` • ${escapeHtml(r.version)}` : ""}</div>
      `;

      div.onclick = () => selectRow(r);
      list.appendChild(div);
    }
  }

  function escapeHtml(s) {
    return safeStr(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ======================
  // Select / populate
  // ======================
  function selectRow(r) {
    selected = JSON.parse(JSON.stringify(r));
    selected.__isNew = false;

    $("emptyState").style.display = "none";
    $("editPanel").style.display = "block";

    $("newBanner").style.display = "none";

    setText("hdrId", `DB id: ${r.id}`);
    setMode("view"); // FIX B: default view-only

    // Source/status
    $("dbSourceType").value = safeStr(r.source_type);
    $("dbStatus").value = safeStr(r.status) || "active";

    // Advanced fields
    $("dbVersion").value = safeStr(r.version);
    $("dbTags").value = Array.isArray(r.tags) ? r.tags.join(", ") : safeStr(r.tags);

    // Number parts
    const nb = safeStr(r.number_base);
    const parts = parseNumberBase(nb);
    $("dbChapter").value = parts.xx ? String(parseInt(parts.xx, 10) || "") : "";
    $("dbSection").value = parts.yy ? String(parseInt(parts.yy, 10) || "") : "";
    $("dbItem").value = parts.zz ? String(parseInt(parts.zz, 10) || "") : "";

    $("dbNumberSuffix").value = safeStr(r.number_suffix);

    refreshNumbering(false); // do not overwrite parts, just recompute display
    fillPayloadFields(r.payload || {});
    refreshRawPayloadPreview();

    updateChips();
    renderList();
  }

  function fillPayloadFields(payload) {
    const p = payload || {};

    $("pShortText").value = safeStr(payloadGet(p, ["short_text", "ShortText", "shortText", "Short Text"]));
    $("pQuestion").value = safeStr(payloadGet(p, ["question", "Question"]));
    $("pGuidance").value = safeStr(payloadGet(p, ["inspection_guidance", "guidance", "InspectionGuidance", "Inspection Guidance"]));
    $("pActions").value = safeStr(payloadGet(p, ["suggested_inspector_actions", "actions", "SuggestedInspectorActions", "Suggested Inspector Actions"]));
    $("pEvidence").value = safeStr(payloadGet(p, ["expected_evidence", "evidence", "ExpectedEvidence", "Expected Evidence"]));
    $("pNegObs").value = safeStr(payloadGet(p, ["potential_grounds_for_negative_observations", "neg_obs", "NegativeObservations", "Potential Grounds for Negative Observations"]));
  }

  function readPayloadFromFields() {
    // Start from raw JSON (advanced), but do not require it
    let p = {};
    const raw = safeStr($("pRaw").value).trim();
    if (raw) {
      try { p = JSON.parse(raw); } catch { p = {}; }
    }

    p = payloadSetCanonical(p, "short_text", safeStr($("pShortText").value));
    p = payloadSetCanonical(p, "question", safeStr($("pQuestion").value));
    p = payloadSetCanonical(p, "inspection_guidance", safeStr($("pGuidance").value));
    p = payloadSetCanonical(p, "suggested_inspector_actions", safeStr($("pActions").value));
    p = payloadSetCanonical(p, "expected_evidence", safeStr($("pEvidence").value));
    p = payloadSetCanonical(p, "potential_grounds_for_negative_observations", safeStr($("pNegObs").value));

    return p;
  }

  function refreshRawPayloadPreview() {
    // keep raw JSON updated for visibility (advanced panel)
    const p = readPayloadFromFields();
    try { $("pRaw").value = JSON.stringify(p, null, 2); } catch { /* ignore */ }
  }

  // ======================
  // Mode (View/Edit)
  // ======================
  function setMode(next) {
    mode = next === "edit" ? "edit" : "view";

    $("btnEdit").style.display = (mode === "view") ? "inline-flex" : "none";
    $("btnView").style.display = (mode === "edit") ? "inline-flex" : "none";
    $("btnSave").style.display = (mode === "edit") ? "inline-flex" : "none";

    // Disable/enable inputs in view mode
    const editableIds = [
      "dbSourceType","dbStatus",
      "dbChapter","dbSection","dbItem","dbNumberSuffix",
      "pShortText","pQuestion","pGuidance","pActions","pEvidence","pNegObs",
      // advanced:
      "dbVersion","dbTags","pRaw",
    ];

    for (const id of editableIds) {
      const el = $(id);
      if (!el) continue;
      // allow advanced fields to remain read-only unless in edit mode
      el.disabled = (mode === "view");
      el.readOnly = (mode === "view") && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    }

    // Computed number_base is always readonly
    $("dbNumberBase").readOnly = true;

    updateChips();
  }

  function updateChips() {
    const src = safeStr($("dbSourceType").value || selected?.source_type);
    const st = safeStr($("dbStatus").value || selected?.status);
    const sx = safeStr($("dbNumberSuffix").value || selected?.number_suffix);

    $("chipSource").textContent = `source: ${src || "—"}`;
    $("chipStatus").textContent = `status: ${st || "—"}`;
    $("chipSuffix").textContent = `suffix: ${sx || "—"}`;
    $("chipMode").textContent = `mode: ${mode.toUpperCase()}`;
    $("hdrNumber").textContent = computeNumberFull(safeStr($("dbNumberBase").value), safeStr($("dbNumberSuffix").value)) || "—";
  }

  // ======================
  // New question
  // ======================
  function newQuestion() {
    showWarn("");
    showOk("");

    selected = {
      __isNew: true,
      id: null,
      source_type: "COMPANY_CUSTOM",
      is_custom: true,
      status: "active",
      version: safeStr($("versionFilter").value).trim() || "SIRE_2_0_QL",
      tags: [],
      number_base: "",
      number_suffix: "C",
      payload: {
        short_text: "",
        question: "",
        inspection_guidance: "",
        suggested_inspector_actions: "",
        expected_evidence: "",
        potential_grounds_for_negative_observations: "",
      },
    };

    $("emptyState").style.display = "none";
    $("editPanel").style.display = "block";
    $("newBanner").style.display = "inline-block";

    setText("hdrId", "Not saved yet");

    $("dbSourceType").value = selected.source_type;
    $("dbStatus").value = selected.status;

    // Advanced defaults
    $("dbVersion").value = selected.version;
    $("dbTags").value = "";

    // Empty number parts
    $("dbChapter").value = "";
    $("dbSection").value = "";
    $("dbItem").value = "";

    // suffix default for company custom
    $("dbNumberSuffix").value = "C";

    // clear payload fields
    fillPayloadFields(selected.payload);
    refreshNumbering(true);
    refreshRawPayloadPreview();

    // new question should open in EDIT mode
    setMode("edit");
    updateChips();
    renderList();
  }

  function resetSelected() {
    showWarn("");
    showOk("");
    setText("saveStatus", "");

    if (!selected) return;

    if (selected.__isNew) {
      newQuestion();
      return;
    }

    const r = allRows.find(x => x.id === selected.id);
    if (r) selectRow(r);
  }

  // ======================
  // Numbering logic
  // ======================
  function refreshNumbering(overwriteSelected = false) {
    const src = safeStr($("dbSourceType").value).trim();
    const isSire = (src === "SIRE");

    // Auto-rules for suffix:
    if (isSire) {
      // SIRE must be blank suffix
      if ($("dbNumberSuffix").value.trim() !== "") {
        $("dbNumberSuffix").value = "";
      }
    } else {
      // custom/spare must have suffix (C/A/B) – do not force, but default if empty
      if (!$("dbNumberSuffix").value.trim()) {
        $("dbNumberSuffix").value = (src === "SPARE1") ? "A" : (src === "SPARE2") ? "B" : "C";
      }
    }

    const nb = computeNumberBase({
      xx: $("dbChapter").value,
      yy: $("dbSection").value,
      item: $("dbItem").value,
    }, isSire);

    $("dbNumberBase").value = nb;

    if (overwriteSelected && selected) {
      selected.number_base = nb;
      selected.number_suffix = $("dbNumberSuffix").value.trim();
    }

    updateChips();
  }

  // ======================
  // Save
  // ======================
  async function saveSelected() {
    if (!selected) return;

    showWarn("");
    showOk("");
    setText("saveStatus", "Saving…");

    try {
      const src = safeStr($("dbSourceType").value).trim() || "COMPANY_CUSTOM";
      const status = safeStr($("dbStatus").value).trim() || "active";

      const isSire = (src === "SIRE");

      const nb = safeStr($("dbNumberBase").value).trim();
      const sx = safeStr($("dbNumberSuffix").value).trim();

      if (!nb) {
        setText("saveStatus", "");
        showWarn("Number is required. Fill Chapter/Section/Item.");
        return;
      }

      if (isSire && sx) {
        setText("saveStatus", "");
        showWarn("SIRE questions must have blank suffix.");
        return;
      }

      if (!isSire && !sx) {
        setText("saveStatus", "");
        showWarn("Company/Spare questions must have a suffix (C/A/B).");
        return;
      }

      // Advanced fields
      const version = safeStr($("dbVersion").value).trim() || "SIRE_2_0_QL";
      const tagsCsv = safeStr($("dbTags").value).trim();
      const tags = tagsCsv ? tagsCsv.split(",").map(s => s.trim()).filter(Boolean) : [];

      const payload = readPayloadFromFields();

      // IMPORTANT:
      // - Do NOT send number_full (generated in DB)
      // - Send is_custom to satisfy chk_questions_master_custom_source_match
      const row = {
        source_type: src,
        is_custom: !isSire,
        status,
        version,
        tags,
        number_base: nb,
        number_suffix: isSire ? "" : sx,
        payload,
        updated_by: me?.user?.id || null,
      };

      if (selected.__isNew) {
        row.created_by = me?.user?.id || null;

        const { data, error } = await sb
          .from("questions_master")
          .insert(row)
          .select("id, number_base, number_suffix, number_full, source_type, is_custom, status, version, tags, payload, updated_at, created_at")
          .single();

        if (error) throw error;

        showOk("Saved new question.");
        setText("saveStatus", "");

        await loadQuestions();
        const newRow = allRows.find(x => x.id === data.id);
        if (newRow) selectRow(newRow);

      } else {
        const { error } = await sb
          .from("questions_master")
          .update(row)
          .eq("id", selected.id);

        if (error) throw error;

        showOk("Saved changes.");
        setText("saveStatus", "");

        await loadQuestions();
        const updated = allRows.find(x => x.id === selected.id);
        if (updated) selectRow(updated);
      }

    } catch (e) {
      setText("saveStatus", "");
      showWarn("Save failed:\n\n" + (e?.message || String(e)));
    }
  }

  // ======================
  // Expose for debugging
  // ======================
  window.__QEDIT = { loadQuestions, newQuestion, saveSelected };

  boot();
})();
