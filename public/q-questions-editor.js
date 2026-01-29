(() => {
  "use strict";

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
  // - SIRE number_base: xx.yy.zz (2 digits each)
  // - Custom/Spare: xx.yy.zzz (last part 3 digits)
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

  function parseNumberBase(nb) {
    const s = safeStr(nb).trim();
    const m = s.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return { xx:"", yy:"", zz:"" };
    return { xx: String(Number(m[1])), yy: String(Number(m[2])), zz: String(Number(m[3])) };
  }

  function numberKey(row) {
    const nb = safeStr(row.number_base).trim();
    const m = nb.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return [9999, 9999, 999999, nb];
    return [Number(m[1]), Number(m[2]), Number(m[3]), nb];
  }

  // Escape for view HTML
  function escapeHtml(s) {
    return safeStr(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ===== PGNO helpers =====
  function pgnoCode(numberBase, seq1based) {
    const nb = safeStr(numberBase).trim();
    const s2 = String(seq1based).padStart(2, "0");
    return nb ? `${nb}.${s2}` : `?.?.?.${s2}`;
  }

  function ensurePgnoStateFromPayloadIfEmpty() {
    if (!selected) return;
    if (Array.isArray(selected.pgno_items) && selected.pgno_items.length) return;

    const p = selected.payload || {};
    const old = p.potential_grounds_for_negative_observations;

    if (Array.isArray(old)) {
      selected.pgno_items = old.map(t => ({ text: safeStr(t), remarks: "" }));
      return;
    }
    if (typeof old === "string" && old.trim()) {
      const lines = old.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      selected.pgno_items = lines.map(t => ({ text: t, remarks: "" }));
      return;
    }

    selected.pgno_items = [];
  }

  // ===== Expected Evidence helpers =====
  function normalizeBulletsFromTextBlob(blob) {
    const s = safeStr(blob).trim();
    if (!s) return [];
    // If bullet symbols at start of lines exist -> split at those bullets
    const hasBulletStart = /(^|\n)\s*[•·●▪◦]/m.test(s);
    if (hasBulletStart) {
      const marked = s.replace(/(^|\n)\s*[•·●▪◦]\s*/gm, "$1§§§");
      return marked
        .split("§§§")
        .map(x => x.trim())
        .filter(Boolean);
    }
    // fallback: one per line
    return s
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean);
  }

  function ensureEvidenceStateFromPayloadIfEmpty() {
    if (!selected) return;
    if (Array.isArray(selected.evidence_items) && selected.evidence_items.length) return;

    const p = selected.payload || {};

    // Best: ExpEv_Bullets (objects)
    const evBul = p.ExpEv_Bullets;
    if (Array.isArray(evBul) && evBul.length) {
      selected.evidence_items = evBul
        .map(o => ({
          text: safeStr(o?.text).trim(),
          esms_references: safeStr(o?.ch).trim(),
          esms_forms: safeStr(o?.form).trim(),
          remarks: safeStr(o?.remarks).trim(),
        }))
        .filter(x => x.text);
      return;
    }

    // Next: expected_evidence (array of strings)
    const evArr = p.expected_evidence;
    if (Array.isArray(evArr) && evArr.length) {
      selected.evidence_items = evArr
        .map(t => ({ text: safeStr(t).trim(), esms_references: "", esms_forms: "", remarks: "" }))
        .filter(x => x.text);
      return;
    }

    // Next: "Expected Evidence" (string blob)
    const evBlob = p["Expected Evidence"];
    if (typeof evBlob === "string" && evBlob.trim()) {
      const lines = normalizeBulletsFromTextBlob(evBlob);
      selected.evidence_items = lines.map(t => ({ text: t, esms_references: "", esms_forms: "", remarks: "" }));
      return;
    }

    selected.evidence_items = [];
  }

  // ====== state ======
  let sb = null;
  let me = null;

  let allRows = [];
  let selected = null; // cloned copy
  let mode = "VIEW";   // VIEW | EDIT

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

  // ===== Expected Evidence renderers =====
  function renderEvidenceView() {
    const host = $("vEvList");
    if (!host) return;

    ensureEvidenceStateFromPayloadIfEmpty();

    const items = selected?.evidence_items || [];
    setText("vEvCount", `${items.length} item(s)`);

    if (!items.length) {
      host.innerHTML = `<div class="muted">No Expected Evidence recorded for this question.</div>`;
      return;
    }

    host.innerHTML = items.map((it, i) => {
      const t = safeStr(it.text);
      const ch = safeStr(it.esms_references);
      const form = safeStr(it.esms_forms);
      const rem = safeStr(it.remarks);

      return `
        <div class="evRow">
          <div class="evHdr">
            <div class="evNo">• ${i + 1}</div>
          </div>

          <div class="evTiny" style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(t)}</div>

          <div class="evTiny" style="margin-top:8px;">
            ${ch ? `<div><b>eSMS Reference(s):</b> ${escapeHtml(ch)}</div>` : ``}
            ${form ? `<div><b>eSMS Form(s):</b> ${escapeHtml(form)}</div>` : ``}
            ${rem ? `<div><b>Remarks:</b> ${escapeHtml(rem)}</div>` : ``}
          </div>
        </div>
      `;
    }).join("");
  }

  function renderEvidenceEditor() {
    const host = $("evEditorList");
    if (!host) return;

    ensureEvidenceStateFromPayloadIfEmpty();

    const items = selected.evidence_items || [];
    setText("evCountLine", `${items.length} item(s)`);

    host.innerHTML = "";

    items.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "evRow";

      row.innerHTML = `
        <div class="evHdr">
          <div>
            <div class="evNo">• ${idx + 1}</div>
            <div class="evTiny">Seq: ${idx + 1}</div>
          </div>
          <div>
            <button class="btn" type="button" data-evdel="${idx}">Delete</button>
          </div>
        </div>

        <div class="evGrid">
          <div class="full">
            <label>Expected Evidence text</label>
            <textarea data-evtext="${idx}"></textarea>
          </div>
          <div>
            <label>eSMS Reference(s)</label>
            <textarea data-evch="${idx}" placeholder="e.g. Ch. 7.3 / 7.5 ..."></textarea>
          </div>
          <div>
            <label>eSMS Form(s)</label>
            <textarea data-evform="${idx}" placeholder="e.g. CBO 04, IG-01 ..."></textarea>
          </div>
          <div class="full">
            <label>Remarks</label>
            <textarea data-evrem="${idx}" placeholder="Optional remarks"></textarea>
          </div>
        </div>
      `;

      host.appendChild(row);

      const taText = row.querySelector(`textarea[data-evtext="${idx}"]`);
      const taCh   = row.querySelector(`textarea[data-evch="${idx}"]`);
      const taForm = row.querySelector(`textarea[data-evform="${idx}"]`);
      const taRem  = row.querySelector(`textarea[data-evrem="${idx}"]`);

      if (taText) taText.value = safeStr(it.text);
      if (taCh) taCh.value = safeStr(it.esms_references);
      if (taForm) taForm.value = safeStr(it.esms_forms);
      if (taRem) taRem.value = safeStr(it.remarks);

      if (taText) taText.addEventListener("input", () => { selected.evidence_items[idx].text = taText.value; });
      if (taCh)   taCh.addEventListener("input", () => { selected.evidence_items[idx].esms_references = taCh.value; });
      if (taForm) taForm.addEventListener("input", () => { selected.evidence_items[idx].esms_forms = taForm.value; });
      if (taRem)  taRem.addEventListener("input", () => { selected.evidence_items[idx].remarks = taRem.value; });

      const delBtn = row.querySelector(`button[data-evdel="${idx}"]`);
      if (delBtn) {
        delBtn.addEventListener("click", () => {
          selected.evidence_items.splice(idx, 1);
          renderEvidenceEditor();
        });
      }
    });
  }

  function addEvidenceRow() {
    if (!selected) return;
    ensureEvidenceStateFromPayloadIfEmpty();
    selected.evidence_items.push({ text: "", esms_references: "", esms_forms: "", remarks: "" });
    renderEvidenceEditor();
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

    const nb = safeStr(selected.number_base).trim();
    host.innerHTML = items.map((it, i) => {
      const code = pgnoCode(nb, i + 1);
      const t = safeStr(it.text);
      const r = safeStr(it.remarks);
      return `
        <div class="pgnoRow">
          <div class="pgnoHdr">
            <div class="pgnoCode">${code}</div>
          </div>
          <div class="pgnoTiny" style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(t)}</div>
          ${r ? `<div class="pgnoTiny" style="margin-top:8px;"><b>Remarks:</b> ${escapeHtml(r)}</div>` : ``}
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

    const nb = previewNumberBaseForHeader(); // use current inputs if user is editing the number
    host.innerHTML = "";

    items.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "pgnoRow";

      const code = pgnoCode(nb, idx + 1);

      row.innerHTML = `
        <div class="pgnoHdr">
          <div>
            <div class="pgnoCode">${code}</div>
            <div class="pgnoTiny">Seq: ${idx + 1}</div>
          </div>
          <div>
            <button class="btn" type="button" data-del="${idx}">Delete</button>
          </div>
        </div>

        <div class="pgnoGrid">
          <div class="full">
            <label>PGNO text</label>
            <textarea data-text="${idx}"></textarea>
          </div>
          <div class="full">
            <label>Remarks (per PGNO)</label>
            <textarea data-remarks="${idx}" placeholder="Optional remarks for this PGNO"></textarea>
          </div>
        </div>
      `;

      host.appendChild(row);

      const taText = row.querySelector(`textarea[data-text="${idx}"]`);
      const taRem = row.querySelector(`textarea[data-remarks="${idx}"]`);
      if (taText) taText.value = safeStr(it.text);
      if (taRem) taRem.value = safeStr(it.remarks);

      if (taText) {
        taText.addEventListener("input", () => {
          selected.pgno_items[idx].text = taText.value;
        });
      }
      if (taRem) {
        taRem.addEventListener("input", () => {
          selected.pgno_items[idx].remarks = taRem.value;
        });
      }

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

    setText("vTags", Array.isArray(r.tags) ? r.tags.join(", ") : safeStr(r.tags || ""));
    setText("vVersion", safeStr(r.version || ""));

    const rawEl = $("vRaw");
    if (rawEl) {
      try { rawEl.textContent = JSON.stringify(p, null, 2); }
      catch { rawEl.textContent = ""; }
    }

    setPillsFromSelected();
    renderEvidenceView();
    renderPgnoView();
  }

  function fillEditPanel(r) {
    $("dbSourceType").value = r.source_type || "SIRE";
    $("dbStatus").value = r.status || "active";
    $("dbNumberSuffix").value = safeStr(r.number_suffix);
    $("dbTags").value = Array.isArray(r.tags) ? r.tags.join(", ") : safeStr(r.tags || "");

    $("dbVersion").value = safeStr(r.version || "");
    $("dbChangeReason").value = safeStr(r.change_reason || "");

    const parts = parseNumberBase(r.number_base);
    $("numChapter").value = parts.xx;
    $("numSection").value = parts.yy;
    $("numItem").value = parts.zz;

    setText("hdrId", r.id ? `DB id: ${r.id}` : "Not saved yet");
    setText("hdrNumber", computeNumberFull(r.number_base, r.number_suffix) || "—");

    const p = r.payload || {};
    $("pShortText").value = safeStr(p.short_text ?? p.ShortText ?? p.shortText ?? p["Short Text"]);
    $("pQuestion").value = safeStr(p.question ?? p.Question ?? p["Question"]);
    $("pGuidance").value = safeStr(p.inspection_guidance ?? p.guidance ?? p.InspectionGuidance ?? p["Inspection Guidance"]);
    $("pActions").value = safeStr(p.suggested_inspector_actions ?? p.actions ?? p.SuggestedInspectorActions ?? p["Suggested Inspector Actions"]);

    try { $("pRaw").value = JSON.stringify(p, null, 2); }
    catch { $("pRaw").value = ""; }

    setPillsFromSelected();
    renderEvidenceEditor();
    renderPgnoEditor();
  }

  function previewNumberBaseForHeader() {
    // In EDIT mode, use inputs to preview codes live
    const src = $("dbSourceType")?.value || (selected?.source_type || "SIRE");
    const xx = $("numChapter")?.value;
    const yy = $("numSection")?.value;
    const zz = $("numItem")?.value;

    const nb = buildNumberBase(src, xx, yy, zz);
    return nb || safeStr(selected?.number_base).trim();
  }

  function refreshHeaderFromNumberInputs() {
    if (!selected) return;

    const nb = previewNumberBaseForHeader();
    const sx = safeStr($("dbNumberSuffix").value).trim();
    setText("hdrNumber", computeNumberFull(nb, sx) || "—");

    // PGNO codes depend on number_base -> re-render editor list to update code labels
    renderPgnoEditor();
  }

  // ===== list =====
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

      div.innerHTML = `<div class="qno">${safeStr(nfull)}</div><div class="qsub">${escapeHtml(sub)}</div>`;
      div.onclick = () => selectRow(r);
      list.appendChild(div);
    }
  }

  // ===== DB load =====
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
        .order("created_at", { ascending: true });

      if (status) q = q.eq("status", status);
      if (version) q = q.eq("version", version);
      if (src && src !== "ALL") q = q.eq("source_type", src);

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

  async function savePgnoToDb(questionId, numberBase, items) {
    const clean = (items || [])
      .map(x => ({ text: safeStr(x.text).trim(), remarks: safeStr(x.remarks).trim() }))
      .filter(x => x.text.length > 0);

    const { error: delErr } = await sb.from("pgno_master").delete().eq("question_id", questionId);
    if (delErr) throw delErr;

    if (!clean.length) return;

    const rows = clean.map((x, i) => ({
      question_id: questionId,
      seq: i + 1,
      pgno_code: pgnoCode(numberBase, i + 1),
      pgno_text: x.text,
      remarks: x.remarks,
      created_by: me?.user?.id || null,
      updated_by: me?.user?.id || null,
    }));

    const { error: insErr } = await sb.from("pgno_master").insert(rows);
    if (insErr) throw insErr;
  }

  // ===== Expected Evidence DB operations =====
  async function loadEvidenceFromDb(questionId) {
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

  async function saveEvidenceToDb(questionId, items) {
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
    selected.evidence_items = [];

    // Load PGNO + Expected Evidence from DB
    try {
      if (selected.id) {
        const [pg, ev] = await Promise.all([
          loadPgnoFromDb(selected.id),
          loadEvidenceFromDb(selected.id),
        ]);
        selected.pgno_items = pg || [];
        selected.evidence_items = ev || [];
      }
    } catch (e) {
      // Do not crash editor; fallback to payload
      selected.pgno_items = [];
      selected.evidence_items = [];

      showWarn(
        "Warning: could not load PGNO / Expected Evidence rows from DB.\n" +
        "Fallback to payload data.\n\n" +
        "Error: " + String(e?.message || e)
      );
    }

    fillViewPanel(selected);
    fillEditPanel(selected);
    setMode("VIEW");
    renderList();
  }

  // ===== new question =====
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
        expected_evidence: [],
        ExpEv_Bullets: [],
        potential_grounds_for_negative_observations: [],
      },
      pgno_items: [],
      evidence_items: [],
    };

    fillViewPanel(selected);
    fillEditPanel(selected);
    setMode("EDIT");
    setPillsFromSelected();
    refreshHeaderFromNumberInputs();
  }

  // ===== save =====
  async function saveSelected() {
    if (!selected) return;

    showWarn("");
    showOk("");
    setText("saveStatus", "Saving…");

    try {
      const src = $("dbSourceType").value;
      const status = safeStr($("dbStatus").value || "active");
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

      const tagsCsv = safeStr($("dbTags").value).trim();
      const tags = tagsCsv ? tagsCsv.split(",").map(s => s.trim()).filter(Boolean) : [];

      let payload = {};
      const raw = safeStr($("pRaw").value).trim();
      if (raw) {
        try { payload = JSON.parse(raw); }
        catch { payload = selected.payload || {}; }
      } else {
        payload = selected.payload || {};
      }

      payload.short_text = safeStr($("pShortText").value);
      payload.question = safeStr($("pQuestion").value);
      payload.inspection_guidance = safeStr($("pGuidance").value);
      payload.suggested_inspector_actions = safeStr($("pActions").value);

      // Expected Evidence compatibility fields (payload)
      ensureEvidenceStateFromPayloadIfEmpty();
      const evClean = (selected.evidence_items || [])
        .map(x => ({
          text: safeStr(x.text).trim(),
          esms_references: safeStr(x.esms_references).trim(),
          esms_forms: safeStr(x.esms_forms).trim(),
          remarks: safeStr(x.remarks).trim(),
        }))
        .filter(x => x.text);

      payload.expected_evidence = evClean.map(x => x.text);

      payload.ExpEv_Bullets = evClean.map(x => ({
        text: x.text,
        ch: x.esms_references || "",
        form: x.esms_forms || "",
        remarks: x.remarks || "",
      }));

      // PGNO compatibility field (payload)
      ensurePgnoStateFromPayloadIfEmpty();
      const pgnoTexts = (selected.pgno_items || [])
        .map(x => safeStr(x.text).trim())
        .filter(Boolean);

      payload.potential_grounds_for_negative_observations = pgnoTexts;

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

        // Save DB rows AFTER question exists
        try {
          await saveEvidenceToDb(data.id, selected.evidence_items || []);
        } catch (e) {
          showWarn(
            "Question saved, but Expected Evidence rows could not be saved.\n" +
            "Check expected_evidence_master table + RLS.\n\n" +
            "Error: " + String(e?.message || e)
          );
        }

        try {
          await savePgnoToDb(data.id, number_base, selected.pgno_items || []);
        } catch (e) {
          showWarn(
            "Question saved, but PGNO rows could not be saved.\n" +
            "Check pgno_master table + RLS.\n\n" +
            "Error: " + String(e?.message || e)
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

        // Save Expected Evidence rows
        try {
          await saveEvidenceToDb(selected.id, selected.evidence_items || []);
        } catch (e) {
          showWarn(
            "Question saved, but Expected Evidence rows could not be saved.\n" +
            "Check expected_evidence_master table + RLS.\n\n" +
            "Error: " + String(e?.message || e)
          );
        }

        // Save PGNO rows
        try {
          await savePgnoToDb(selected.id, number_base, selected.pgno_items || []);
        } catch (e) {
          showWarn(
            "Question saved, but PGNO rows could not be saved.\n" +
            "Check pgno_master table + RLS.\n\n" +
            "Error: " + String(e?.message || e)
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
    $("reloadBtn").onclick = () => loadQuestions();
    $("statusFilter").onchange = () => loadQuestions();
    $("sourceFilter").onchange = () => loadQuestions();

    let vTimer = null;
    $("versionFilter").oninput = () => {
      if (vTimer) clearTimeout(vTimer);
      vTimer = setTimeout(() => loadQuestions(), 450);
    };

    $("searchInput").oninput = () => renderList();

    $("newQuestionBtn").onclick = () => newQuestion();

    $("btnEdit").onclick = () => {
      const ok = confirm("Enter edit mode for this question?");
      if (!ok) return;
      setMode("EDIT");
    };

    $("btnView").onclick = () => setMode("VIEW");

    $("btnReset").onclick = async () => {
      if (!selected) return;
      if (selected.__isNew) newQuestion();
      else {
        const r = allRows.find(x => x.id === selected.id);
        if (r) await selectRow(r);
      }
    };

    $("btnSave").onclick = () => saveSelected();

    $("dbSourceType").onchange = () => {
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

    $("btnAddPgno").onclick = () => addPgnoRow();
    $("btnAddEv").onclick = () => addEvidenceRow();
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
