(() => {
  "use strict";

  // ====== helpers ======
  function $(id) { return document.getElementById(id); }
  function safeStr(v) { return v === null || v === undefined ? "" : String(v); }

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

  // DB constraint:
  // - SIRE number_base must be xx.yy.zz (1–2 digits each)
  // - COMPANY_CUSTOM/SPARE number_base must be xx.yy.zzz (last part 3 digits)
  function buildNumberBase(sourceType, xx, yy, zz) {
    const a = Number(xx);
    const b = Number(yy);
    const c = Number(zz);

    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return "";

    const isSire = sourceType === "SIRE";
    const p2 = (n) => String(n).padStart(2, "0");

    if (isSire) {
      // zz must be 0..99 in 2-digit form (DB allows 1-2 digits, we store padded 2)
      return `${p2(a)}.${p2(b)}.${p2(c)}`;
    }

    // Custom/spare: force 3 digits for last segment
    const p3 = (n) => String(n).padStart(3, "0");
    return `${p2(a)}.${p2(b)}.${p3(c)}`;
  }

  function computeNumberFull(numberBase, suffix) {
    const nb = safeStr(numberBase).trim();
    const sx = safeStr(suffix).trim();
    if (!nb) return "";
    return sx ? `${nb}-${sx}` : nb;
  }

  function parseNumberBase(nb) {
    const s = safeStr(nb).trim();
    const m = s.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return { xx:"", yy:"", zz:"" };
    return { xx: String(Number(m[1])), yy: String(Number(m[2])), zz: String(Number(m[3])) };
  }

  // Preserve arrays for these fields:
  // If current DB value is array -> textarea lines -> array on save.
  // If current DB value is string -> save string.
  function toMultiline(v) {
    if (Array.isArray(v)) return v.map(x => safeStr(x)).join("\n");
    if (typeof v === "string") return v;
    if (v === null || v === undefined) return "";
    // For unexpected objects: show JSON but do not auto-overwrite unless user edits raw JSON
    try { return JSON.stringify(v, null, 2); } catch { return ""; }
  }

  function applyTextAreaPreservingType(obj, key, textValue) {
    const current = obj[key];
    if (Array.isArray(current)) {
      obj[key] = safeStr(textValue)
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
      return;
    }
    // default to string
    obj[key] = safeStr(textValue);
  }

  // Sort correctly by chapter/section/item numerically (NOT text sort)
  function numberKey(row) {
    const nb = safeStr(row.number_base).trim();
    const m = nb.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return [9999, 9999, 999999, nb];
    const a = Number(m[1]);
    const b = Number(m[2]);
    const c = Number(m[3]);
    return [a, b, c, nb];
  }

  // ====== state ======
  let sb = null;
  let me = null;

  let allRows = [];
  let selected = null; // cloned copy
  let mode = "VIEW";   // VIEW | EDIT

  // ====== UI mode ======
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
  }

  // ====== view fill ======
  function fillViewPanel(r) {
    const nb = safeStr(r.number_base);
    const nfull = r.number_full || computeNumberFull(nb, r.number_suffix);

    setText("vhdrNumber", nfull || "—");
    setText("vhdrId", r.id ? `DB id: ${r.id}` : "");

    const p = r.payload || {};
    setText("vShortText", safeStr(p.short_text ?? p.ShortText ?? p.shortText ?? p["Short Text"]));
    setText("vQuestion", safeStr(p.question ?? p.Question ?? p["Question"]));
    setText("vGuidance", safeStr(p.inspection_guidance ?? p.guidance ?? p.InspectionGuidance ?? p["Inspection Guidance"]));
    setText("vActions", safeStr(p.suggested_inspector_actions ?? p.actions ?? p.SuggestedInspectorActions ?? p["Suggested Inspector Actions"]));

    // show multiline nicely even if array
    const ev = p.expected_evidence ?? p.evidence ?? p.ExpectedEvidence ?? p["Expected Evidence"];
    const ng = p.potential_grounds_for_negative_observations ?? p.neg_obs ?? p.NegativeObservations ?? p["Potential Grounds for Negative Observations"];

    setText("vEvidence", toMultiline(ev));
    setText("vNegObs", toMultiline(ng));

    setText("vTags", Array.isArray(r.tags) ? r.tags.join(", ") : safeStr(r.tags || ""));
    setText("vVersion", safeStr(r.version || ""));

    const rawEl = $("vRaw");
    if (rawEl) {
      try { rawEl.textContent = JSON.stringify(p, null, 2); }
      catch { rawEl.textContent = ""; }
    }

    setPillsFromSelected();
  }

  // ====== edit fill ======
  function fillEditPanel(r) {
    $("dbSourceType").value = r.source_type || "SIRE";
    $("dbStatus").value = r.status || "active";
    $("dbNumberSuffix").value = safeStr(r.number_suffix);
    $("dbTags").value = Array.isArray(r.tags) ? r.tags.join(", ") : safeStr(r.tags || "");

    // version hidden by default (advanced)
    $("dbVersion").value = safeStr(r.version || "");
    $("dbChangeReason").value = safeStr(r.change_reason || "");

    // numbering fields
    const parts = parseNumberBase(r.number_base);
    $("numChapter").value = parts.xx;
    $("numSection").value = parts.yy;
    $("numItem").value = parts.zz;

    // header
    setText("hdrId", r.id ? `DB id: ${r.id}` : "Not saved yet");
    setText("hdrNumber", computeNumberFull(r.number_base, r.number_suffix) || "—");

    // payload fields
    const p = r.payload || {};
    $("pShortText").value = safeStr(p.short_text ?? p.ShortText ?? p.shortText ?? p["Short Text"]);
    $("pQuestion").value = safeStr(p.question ?? p.Question ?? p["Question"]);
    $("pGuidance").value = safeStr(p.inspection_guidance ?? p.guidance ?? p.InspectionGuidance ?? p["Inspection Guidance"]);
    $("pActions").value = safeStr(p.suggested_inspector_actions ?? p.actions ?? p.SuggestedInspectorActions ?? p["Suggested Inspector Actions"]);

    // expected evidence / neg obs preserve arrays if they exist
    const evKey = "expected_evidence";
    const ngKey = "potential_grounds_for_negative_observations";

    // Make sure the canonical keys exist in selected.payload if possible, without destroying originals:
    // If the existing data is stored in alt keys, we just display them.
    const ev = p.expected_evidence ?? p.evidence ?? p.ExpectedEvidence ?? p["Expected Evidence"];
    const ng = p.potential_grounds_for_negative_observations ?? p.neg_obs ?? p.NegativeObservations ?? p["Potential Grounds for Negative Observations"];

    $("pEvidence").value = toMultiline(ev);
    $("pNegObs").value = toMultiline(ng);

    // raw json advanced
    try { $("pRaw").value = JSON.stringify(p, null, 2); }
    catch { $("pRaw").value = ""; }

    setPillsFromSelected();
  }

  function refreshHeaderFromNumberInputs() {
    if (!selected) return;
    const src = $("dbSourceType").value;
    const xx = $("numChapter").value;
    const yy = $("numSection").value;
    const zz = $("numItem").value;

    const nb = buildNumberBase(src, xx, yy, zz);
    const sx = safeStr($("dbNumberSuffix").value).trim();
    setText("hdrNumber", computeNumberFull(nb, sx) || "—");
  }

  // ====== list ======
  function passesSearch(r, term) {
    if (!term) return true;
    const t = term.toLowerCase();

    const n = safeStr(r.number_full || computeNumberFull(r.number_base, r.number_suffix)).toLowerCase();
    const p = r.payload || {};
    const st = safeStr(p.short_text || p.ShortText || p.shortText || p["Short Text"]).toLowerCase();
    const qu = safeStr(p.question || p.Question || p["Question"]).toLowerCase();

    return n.includes(t) || st.includes(t) || qu.includes(t);
  }

  function renderList() {
    const list = $("qList");
    list.innerHTML = "";

    const term = safeStr($("searchInput").value).trim();
    const filtered = allRows.filter(r => passesSearch(r, term));

    // correct chapter sequence sort
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

    for (const r of filtered) {
      const div = document.createElement("div");
      div.className = "qitem" + (selected && !selected.__isNew && selected.id === r.id ? " active" : "");

      const nfull = r.number_full || computeNumberFull(r.number_base, r.number_suffix);
      const p = r.payload || {};
      const sub =
        safeStr(p.short_text || p.ShortText || p.shortText || p["Short Text"]) ||
        safeStr(p.question || p.Question || p["Question"]);

      div.innerHTML = `<div class="qno">${safeStr(nfull)}</div><div class="qsub">${safeStr(sub)}</div>`;
      div.onclick = () => selectRow(r);
      list.appendChild(div);
    }
  }

  // ====== DB load ======
  async function loadQuestions() {
    showWarn("");
    showOk("");
    setText("loadHint", "Loading…");

    try {
      const status = safeStr($("statusFilter").value || "");
      const version = safeStr($("versionFilter").value).trim();
      const src = safeStr($("sourceFilter").value || "");

      let q = sb
        .from("questions_master")
        .select("id, number_base, number_suffix, number_full, source_type, is_custom, status, version, tags, payload, change_reason, updated_at, created_at")
        .order("created_at", { ascending: true }); // we sort client-side anyway

      if (status) q = q.eq("status", status);
      if (version) q = q.eq("version", version);
      if (src && src !== "ALL") q = q.eq("source_type", src);

      const { data, error } = await q;
      if (error) throw error;

      allRows = data || [];
      setText("loadHint", `Loaded ${allRows.length}`);
      renderList();

      if (allRows.length) selectRow(allRows[0]);
      else {
        selected = null;
        setMode("VIEW");
      }
    } catch (e) {
      setText("loadHint", "");
      showWarn("Failed to load questions from DB:\n\n" + (e?.message || String(e)));
    }
  }

  // ====== select ======
  function selectRow(row) {
    selected = JSON.parse(JSON.stringify(row));
    selected.__isNew = false;

    // DEFAULT panel mode = VIEW (per your instruction)
    fillViewPanel(selected);
    fillEditPanel(selected);
    setMode("VIEW");
    renderList();
  }

  // ====== new question ======
  function newQuestion() {
    showWarn("");
    showOk("");
    setText("saveStatus", "");

    const versionFromFilter = safeStr($("versionFilter").value).trim();

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
        expected_evidence: [], // start as array to avoid “one text” problem
        potential_grounds_for_negative_observations: [], // start as array
      },
    };

    fillViewPanel(selected);
    fillEditPanel(selected);

    // Go to EDIT only for new question
    setMode("EDIT");
    setPillsFromSelected();
    refreshHeaderFromNumberInputs();
  }

  // ====== save ======
  async function saveSelected() {
    if (!selected) return;

    showWarn("");
    showOk("");
    setText("saveStatus", "Saving…");

    try {
      const src = $("dbSourceType").value;
      const status = safeStr($("dbStatus").value || "active");

      // version hidden, but still stored (advanced-only edit)
      const version = safeStr($("dbVersion").value).trim() || safeStr(selected.version || "SIRE_2_0_QL");

      const xx = $("numChapter").value;
      const yy = $("numSection").value;
      const zz = $("numItem").value;

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

      const number_suffix = safeStr($("dbNumberSuffix").value).trim();

      // tags
      const tagsCsv = safeStr($("dbTags").value).trim();
      const tags = tagsCsv ? tagsCsv.split(",").map(s => s.trim()).filter(Boolean) : [];

      // payload
      let payload = {};
      const raw = safeStr($("pRaw").value).trim();
      if (raw) {
        try { payload = JSON.parse(raw); }
        catch { payload = selected.payload || {}; }
      } else {
        payload = selected.payload || {};
      }

      // Apply form fields
      payload.short_text = safeStr($("pShortText").value);
      payload.question = safeStr($("pQuestion").value);
      payload.inspection_guidance = safeStr($("pGuidance").value);
      payload.suggested_inspector_actions = safeStr($("pActions").value);

      // Preserve arrays if currently arrays on the object
      if (payload.expected_evidence === undefined && selected.payload?.expected_evidence !== undefined) {
        payload.expected_evidence = selected.payload.expected_evidence;
      }
      if (payload.potential_grounds_for_negative_observations === undefined && selected.payload?.potential_grounds_for_negative_observations !== undefined) {
        payload.potential_grounds_for_negative_observations = selected.payload.potential_grounds_for_negative_observations;
      }

      // If they are arrays -> split lines into array, else store string
      applyTextAreaPreservingType(payload, "expected_evidence", $("pEvidence").value);
      applyTextAreaPreservingType(payload, "potential_grounds_for_negative_observations", $("pNegObs").value);

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
        change_reason: safeStr($("dbChangeReason").value).trim() || null,
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

  // ====== advanced toggle ======
  function toggleAdvanced(which) {
    const el = $(which);
    if (!el) return;
    el.style.display = (el.style.display === "block") ? "none" : "block";
  }

  // ====== wiring ======
  function wireUI() {
    $("reloadBtn").onclick = () => loadQuestions();
    $("sourceFilter").onchange = () => renderList();
    $("statusFilter").onchange = () => loadQuestions();
    $("versionFilter").oninput = () => renderList();
    $("searchInput").oninput = () => renderList();
    $("newQuestionBtn").onclick = () => newQuestion();

    $("btnEdit").onclick = () => {
      // Confirm edit mode (per your instruction)
      const ok = confirm("Enter edit mode for this question?");
      if (!ok) return;
      setMode("EDIT");
    };

    $("btnView").onclick = () => setMode("VIEW");
    $("btnReset").onclick = () => {
      if (!selected) return;
      if (selected.__isNew) newQuestion();
      else {
        const r = allRows.find(x => x.id === selected.id);
        if (r) selectRow(r);
      }
    };
    $("btnSave").onclick = () => saveSelected();

    $("dbSourceType").onchange = () => {
      // For SIRE: suffix should be blank (DB style)
      const st = $("dbSourceType").value;
      if (st === "SIRE") $("dbNumberSuffix").value = "";
      if (st !== "SIRE" && !safeStr($("dbNumberSuffix").value).trim()) $("dbNumberSuffix").value = "C";
      refreshHeaderFromNumberInputs();
    };

    $("dbNumberSuffix").oninput = () => refreshHeaderFromNumberInputs();
    $("numChapter").oninput = () => refreshHeaderFromNumberInputs();
    $("numSection").oninput = () => refreshHeaderFromNumberInputs();
    $("numItem").oninput = () => refreshHeaderFromNumberInputs();

    $("btnToggleAdvancedView").onclick = () => toggleAdvanced("viewAdvanced");
    $("btnToggleAdvancedEdit").onclick = () => toggleAdvanced("editAdvanced");
  }

  // ====== boot ======
  async function boot() {
    showWarn("");
    showOk("");

    try {
      // This error is exactly what you saw: Supabase library not loaded
      if (!window.supabase) {
        showWarn("Boot failed:\n\nSupabase JS not available\n\nFix: ensure the Supabase CDN script is included BEFORE auth.js and q-questions-editor.js.");
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
