(() => {
  "use strict";

  // ====== DB enum values (MUST match your Supabase types) ======
  const SOURCE = {
    SIRE: "SIRE",
    COMPANY_CUSTOM: "COMPANY_CUSTOM",
    SPARE_X: "SPARE_X",
    SPARE_Z: "SPARE_Z",
  };

  // Suffix suggestions per source
  const SUFFIX_BY_SOURCE = {
    [SOURCE.SIRE]: "",
    [SOURCE.COMPANY_CUSTOM]: "C",
    [SOURCE.SPARE_X]: "A",
    [SOURCE.SPARE_Z]: "B",
  };

  function $(id) { return document.getElementById(id); }

  function safeStr(v) {
    return v === null || v === undefined ? "" : String(v);
  }

  function showWarn(msg) {
    const w = $("warnBox");
    if (!w) return msg ? alert(msg) : undefined;
    w.textContent = msg || "";
    w.style.display = msg ? "block" : "none";
  }

  function showOk(msg) {
    const w = $("okBox");
    if (!w) return;
    w.textContent = msg || "";
    w.style.display = msg ? "block" : "none";
  }

  function setModeLine(txt) {
    const el = $("modeLine");
    if (el) el.textContent = txt || "";
  }

  function setText(id, txt) {
    const el = $(id);
    if (el) el.textContent = txt || "";
  }

  function setValue(id, val) {
    const el = $(id);
    if (!el) return;
    el.value = val ?? "";
  }

  // ===== numbering helpers =====
  function pad2(n) { return String(n).padStart(2, "0"); }

  function buildNumberBaseFromParts(ch, sec, item) {
    const a = Number(ch);
    const b = Number(sec);
    const c = Number(item);

    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return "";

    const aa = pad2(a);
    const bb = pad2(b);

    // item: 2 digits unless >=100 (or user typed 3+ digits)
    const cWidth = (String(item).trim().length >= 3 || c >= 100) ? 3 : 2;
    const cc = String(c).padStart(cWidth, "0");

    return `${aa}.${bb}.${cc}`;
  }

  function parseNumberBaseParts(nb) {
    // Accept "2.1.1" or "02.01.01" or "04.01.105"
    const s = safeStr(nb).trim();
    const parts = s.split(".").filter(Boolean);
    const ch = parts[0] ? parseInt(parts[0], 10) : NaN;
    const sec = parts[1] ? parseInt(parts[1], 10) : NaN;
    const item = parts[2] ? parseInt(parts[2], 10) : NaN;
    return { ch, sec, item };
  }

  function computeNumberFull(numberBase, suffix) {
    const nb = safeStr(numberBase).trim();
    const sx = safeStr(suffix).trim();
    if (!nb) return "";
    return sx ? `${nb}-${sx}` : nb;
  }

  function displayNumberFull(row) {
    // Ensure display padded based on numeric parts
    const { ch, sec, item } = parseNumberBaseParts(row.number_base);
    const base = (Number.isFinite(ch) && Number.isFinite(sec) && Number.isFinite(item))
      ? buildNumberBaseFromParts(ch, sec, item)
      : safeStr(row.number_base);

    return computeNumberFull(base, row.number_suffix);
  }

  // Client-side numeric sort (fixes 10… coming before 2…)
  function sortRowsByNumber(rows) {
    rows.sort((r1, r2) => {
      const a = parseNumberBaseParts(r1.number_base);
      const b = parseNumberBaseParts(r2.number_base);

      const ax = Number.isFinite(a.ch) ? a.ch : 999999;
      const bx = Number.isFinite(b.ch) ? b.ch : 999999;
      if (ax !== bx) return ax - bx;

      const ay = Number.isFinite(a.sec) ? a.sec : 999999;
      const by = Number.isFinite(b.sec) ? b.sec : 999999;
      if (ay !== by) return ay - by;

      const az = Number.isFinite(a.item) ? a.item : 999999;
      const bz = Number.isFinite(b.item) ? b.item : 999999;
      if (az !== bz) return az - bz;

      // suffix: SIRE blank first, then A/B/C…
      const as = safeStr(r1.number_suffix).trim();
      const bs = safeStr(r2.number_suffix).trim();
      return as.localeCompare(bs);
    });
    return rows;
  }

  // ===== state =====
  let sb = null;
  let me = null;

  let allRows = [];
  let selected = null;

  let isEditMode = false;
  let advOpen = false;

  // ====== UI mode controls ======
  function setEditMode(on) {
    isEditMode = !!on;

    const btnEdit = $("btnEdit");
    const btnView = $("btnView");
    const btnSave = $("btnSave");
    const btnReset = $("btnReset");

    if (btnEdit) btnEdit.style.display = isEditMode ? "none" : "inline-block";
    if (btnView) btnView.style.display = isEditMode ? "inline-block" : "none";
    if (btnSave) btnSave.style.display = isEditMode ? "inline-block" : "none";
    if (btnReset) btnReset.style.display = isEditMode ? "inline-block" : "none";

    setText("pillMode", `mode: ${isEditMode ? "EDIT" : "VIEW"}`);

    // Disable/enable inputs
    const ids = [
      "dbSourceType","dbStatus",
      "numChapter","numSection","numItem","dbNumberSuffix",
      "dbVersion","dbTags",
      "pShortText","pQuestion","pGuidance","pActions","pEvidence","pNegObs","pRaw"
    ];
    for (const id of ids) {
      const el = $(id);
      if (!el) continue;

      // Advanced fields should stay disabled in VIEW; in EDIT enabled only if adv open (for version/tags/raw)
      if (id === "dbVersion" || id === "dbTags" || id === "pRaw") {
        el.disabled = !isEditMode || !advOpen;
        continue;
      }

      el.disabled = !isEditMode;
    }
  }

  function setAdvanced(on) {
    advOpen = !!on;
    const panel = $("advPanel");
    if (panel) panel.style.display = advOpen ? "block" : "none";

    // Only enable advanced inputs when in edit mode
    for (const id of ["dbVersion","dbTags","pRaw"]) {
      const el = $(id);
      if (el) el.disabled = !isEditMode || !advOpen;
    }
  }

  // ====== boot ======
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
      setAdvanced(false);
      setEditMode(false);

      await loadQuestions();
    } catch (e) {
      showWarn("Boot failed:\n\n" + (e?.message || String(e)));
    }
  }

  function wireUI() {
    const reloadBtn = $("reloadBtn");
    if (reloadBtn) reloadBtn.onclick = () => loadQuestions();

    const sourceFilter = $("sourceFilter");
    if (sourceFilter) sourceFilter.onchange = () => renderList();

    const statusFilter = $("statusFilter");
    if (statusFilter) statusFilter.onchange = () => loadQuestions(); // status affects query

    const versionFilter = $("versionFilter");
    if (versionFilter) versionFilter.oninput = () => renderList();

    const searchInput = $("searchInput");
    if (searchInput) searchInput.oninput = () => renderList();

    const newBtn = $("newQuestionBtn");
    if (newBtn) newBtn.onclick = () => newQuestion();

    const btnEdit = $("btnEdit");
    if (btnEdit) {
      btnEdit.onclick = () => {
        if (!selected) return;
        const ok = confirm("Enter EDIT mode for this question?");
        if (!ok) return;
        setEditMode(true);
      };
    }

    const btnView = $("btnView");
    if (btnView) {
      btnView.onclick = () => {
        setEditMode(false);
        // revert changes by re-selecting current DB row
        if (selected && !selected.__isNew) {
          const r = allRows.find(x => x.id === selected.id);
          if (r) selectRow(r);
        }
      };
    }

    const btnReset = $("btnReset");
    if (btnReset) {
      btnReset.onclick = () => {
        if (!selected) return;
        if (selected.__isNew) newQuestion();
        else {
          const r = allRows.find(x => x.id === selected.id);
          if (r) selectRow(r);
        }
      };
    }

    const btnSave = $("btnSave");
    if (btnSave) btnSave.onclick = () => saveSelected();

    const btnAdvanced = $("btnAdvanced");
    if (btnAdvanced) btnAdvanced.onclick = () => setAdvanced(!advOpen);

    // Auto-suffix behavior when creating new
    const dbSourceType = $("dbSourceType");
    if (dbSourceType) {
      dbSourceType.onchange = () => {
        if (!selected) return;
        const st = dbSourceType.value;
        const auto = SUFFIX_BY_SOURCE[st] ?? "";
        const sfxEl = $("dbNumberSuffix");
        if (!sfxEl) return;

        if (selected.__isNew) {
          sfxEl.value = auto;
        }
        refreshHeaderPills();
      };
    }

    // Update header number when parts change (even in view; harmless)
    for (const id of ["numChapter","numSection","numItem","dbNumberSuffix"]) {
      const el = $(id);
      if (el) el.oninput = () => refreshHeaderNumber();
    }
  }

  // ====== DB load ======
  async function loadQuestions() {
    showWarn("");
    showOk("");

    setText("loadHint", "Loading…");

    try {
      const status = safeStr($("statusFilter")?.value || "active");
      const version = safeStr($("versionFilter")?.value || "").trim();
      const src = safeStr($("sourceFilter")?.value || "ALL");

      let q = sb
        .from("questions_master")
        .select("id, number_base, number_suffix, number_full, source_type, is_custom, status, version, tags, payload, updated_at, created_at")
        .eq("status", status);

      if (version) q = q.eq("version", version);
      if (src && src !== "ALL") q = q.eq("source_type", src);

      const { data, error } = await q;
      if (error) throw error;

      allRows = sortRowsByNumber(data || []);

      setText("loadedLine", `Loaded ${allRows.length}`);
      setText("loadHint", "");

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

  // ====== list rendering ======
  function passesSearch(r, term) {
    if (!term) return true;
    const t = term.toLowerCase();

    const n = safeStr(displayNumberFull(r)).toLowerCase();
    const p = r.payload || {};

    const st =
      safeStr(p.short_text ?? p.ShortText ?? p.shortText ?? p["Short Text"]).toLowerCase();
    const qu =
      safeStr(p.question ?? p.Question ?? p["Question"]).toLowerCase();

    return n.includes(t) || st.includes(t) || qu.includes(t);
  }

  function renderList() {
    const list = $("qList");
    if (!list) return;

    list.innerHTML = "";

    const term = safeStr($("searchInput")?.value).trim();
    const filtered = allRows.filter(r => passesSearch(r, term));

    setText("countLine", `${filtered.length} questions`);

    for (const r of filtered) {
      const div = document.createElement("div");
      div.className = "qitem" + (selected && !selected.__isNew && selected.id === r.id ? " active" : "");

      const p = r.payload || {};
      const sub =
        safeStr(p.short_text ?? p.ShortText ?? p.shortText ?? p["Short Text"]) ||
        safeStr(p.question ?? p.Question ?? p["Question"]);

      div.innerHTML = `<div class="qno">${displayNumberFull(r)}</div><div class="qsub">${safeStr(sub)}</div>`;
      div.onclick = () => selectRow(r);
      list.appendChild(div);
    }
  }

  // ====== editor fill ======
  function refreshHeaderNumber() {
    if (!selected) return;

    const ch = safeStr($("numChapter")?.value).trim();
    const sec = safeStr($("numSection")?.value).trim();
    const item = safeStr($("numItem")?.value).trim();

    const base = buildNumberBaseFromParts(ch, sec, item);
    const sx = safeStr($("dbNumberSuffix")?.value).trim();

    setText("hdrNumber", computeNumberFull(base || "—", sx));
    refreshHeaderPills();
  }

  function refreshHeaderPills() {
    const src = safeStr($("dbSourceType")?.value || selected?.source_type || "—");
    const st = safeStr($("dbStatus")?.value || selected?.status || "—");
    const sx = safeStr($("dbNumberSuffix")?.value || selected?.number_suffix || "");

    setText("pillSource", `source: ${src || "—"}`);
    setText("pillStatus", `status: ${st || "—"}`);
    setText("pillSuffix", `suffix: ${sx || "—"}`);
  }

  function fillPayloadFields(payload) {
    const p = payload || {};
    setValue("pShortText", safeStr(p.short_text ?? p.ShortText ?? p.shortText ?? p["Short Text"]));
    setValue("pQuestion", safeStr(p.question ?? p.Question ?? p["Question"]));
    setValue("pGuidance", safeStr(p.inspection_guidance ?? p.guidance ?? p.InspectionGuidance ?? p["Inspection Guidance"]));
    setValue("pActions", safeStr(p.suggested_inspector_actions ?? p.actions ?? p.SuggestedInspectorActions ?? p["Suggested Inspector Actions"]));
    setValue("pEvidence", safeStr(p.expected_evidence ?? p.evidence ?? p.ExpectedEvidence ?? p["Expected Evidence"]));
    setValue("pNegObs", safeStr(p.potential_grounds_for_negative_observations ?? p.neg_obs ?? p.NegativeObservations ?? p["Potential Grounds for Negative Observations"]));

    // Raw JSON stays in advanced, but we still keep it updated
    const rawEl = $("pRaw");
    if (rawEl) {
      try { rawEl.value = JSON.stringify(p, null, 2); }
      catch { rawEl.value = ""; }
    }
  }

  function readPayloadFromFields() {
    let p = {};
    const raw = safeStr($("pRaw")?.value).trim();
    if (raw) {
      try { p = JSON.parse(raw); } catch { p = {}; }
    }

    // canonical snake_case keys
    p.short_text = $("pShortText")?.value ?? (p.short_text ?? "");
    p.question = $("pQuestion")?.value ?? (p.question ?? "");
    p.inspection_guidance = $("pGuidance")?.value ?? (p.inspection_guidance ?? "");
    p.suggested_inspector_actions = $("pActions")?.value ?? (p.suggested_inspector_actions ?? "");
    p.expected_evidence = $("pEvidence")?.value ?? (p.expected_evidence ?? "");
    p.potential_grounds_for_negative_observations = $("pNegObs")?.value ?? (p.potential_grounds_for_negative_observations ?? "");

    return p;
  }

  function selectRow(r) {
    selected = JSON.parse(JSON.stringify(r));
    selected.__isNew = false;

    // show panel
    $("emptyState").style.display = "none";
    $("editPanel").style.display = "block";

    setText("newBanner", "");
    $("newBanner").style.display = "none";

    setText("hdrId", `DB id: ${r.id}`);

    // Default = VIEW mode when selecting
    setEditMode(false);

    // Fill basic
    setValue("dbSourceType", r.source_type);
    setValue("dbStatus", r.status);

    // Split number parts
    const { ch, sec, item } = parseNumberBaseParts(r.number_base);
    setValue("numChapter", Number.isFinite(ch) ? ch : "");
    setValue("numSection", Number.isFinite(sec) ? sec : "");
    setValue("numItem", Number.isFinite(item) ? item : "");

    setValue("dbNumberSuffix", safeStr(r.number_suffix));

    // Advanced fields (hidden by default)
    setValue("dbVersion", safeStr(r.version));
    setValue("dbTags", Array.isArray(r.tags) ? r.tags.join(", ") : safeStr(r.tags));

    fillPayloadFields(r.payload || {});
    refreshHeaderNumber();

    setText("saveStatus", "");
    renderList();
  }

  // ====== New question ======
  function newQuestion() {
    showWarn("");
    showOk("");

    const versionFromFilter = safeStr($("versionFilter")?.value).trim();

    selected = {
      __isNew: true,
      id: null,
      source_type: SOURCE.COMPANY_CUSTOM,
      is_custom: true,
      status: "active",
      version: versionFromFilter || "SIRE_2_0_QL",
      tags: [],
      number_base: "",
      number_suffix: SUFFIX_BY_SOURCE[SOURCE.COMPANY_CUSTOM] || "C",
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

    // Start in EDIT mode for a new question
    setAdvanced(false);
    setEditMode(true);

    setValue("dbSourceType", selected.source_type);
    setValue("dbStatus", selected.status);

    setValue("numChapter", "");
    setValue("numSection", "");
    setValue("numItem", "");

    setValue("dbNumberSuffix", selected.number_suffix);

    // advanced hidden but pre-filled
    setValue("dbVersion", selected.version);
    setValue("dbTags", "");

    fillPayloadFields(selected.payload);
    refreshHeaderNumber();

    setText("saveStatus", "");
  }

  // ====== Save ======
  async function saveSelected() {
    if (!selected) return;

    showWarn("");
    showOk("");
    setText("saveStatus", "Saving…");

    try {
      const src = safeStr($("dbSourceType")?.value).trim();
      const status = safeStr($("dbStatus")?.value).trim() || "active";

      const ch = safeStr($("numChapter")?.value).trim();
      const sec = safeStr($("numSection")?.value).trim();
      const item = safeStr($("numItem")?.value).trim();

      const number_base = buildNumberBaseFromParts(ch, sec, item);
      if (!number_base) {
        setText("saveStatus", "");
        showWarn("Numbering is required. Fill Chapter (xx), Section (yy), Item (zz/zzz).");
        return;
      }

      const number_suffix = safeStr($("dbNumberSuffix")?.value).trim();

      // DB constraint requires correct is_custom + source_type match
      const is_custom = (src !== SOURCE.SIRE);

      // Version + tags are only editable in Advanced mode,
      // but still read from fields (they are disabled when not advanced).
      const version = safeStr($("dbVersion")?.value).trim() || "SIRE_2_0_QL";

      const tagsCsv = safeStr($("dbTags")?.value).trim();
      const tags = tagsCsv ? tagsCsv.split(",").map(s => s.trim()).filter(Boolean) : [];

      const payload = readPayloadFromFields();

      const row = {
        source_type: src,
        is_custom,
        status,
        version,
        tags,
        number_base,
        number_suffix: number_suffix, // NOT NULL in DB; blank is allowed for SIRE
        payload,
        updated_by: me?.session?.user?.id || null,
      };

      if (selected.__isNew) {
        row.created_by = me?.session?.user?.id || null;

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
        setEditMode(false);

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
        setEditMode(false);
      }
    } catch (e) {
      setText("saveStatus", "");
      showWarn("Save failed:\n\n" + (e?.message || String(e)));
    }
  }

  // expose for debugging
  window.__QEDIT = { loadQuestions, newQuestion };

  boot();
})();
