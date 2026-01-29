// public/q-questions-editor.js
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

  // Normalize number_base for DISPLAY so it ALWAYS appears as:
  // SIRE => xx.yy.zz (2/2/2)
  // Non-SIRE => xx.yy.zzz (2/2/3)
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

    // Always compute display from NORMALIZED base so list/view/edit are consistent
    const nbNorm = normalizeNumberBaseRow(row);
    const computed = computeNumberFull(nbNorm, sx);

    // Keep legacy stored number_full ONLY as fallback (some DB rows may have it)
    let nf = safeStr(row?.number_full).trim();
    // fix legacy “02.01.01-” cases when suffix is blank
    if (nf && nf.endsWith("-") && !sx) nf = nf.slice(0, -1);

    return computed || nf || "—";
  }

  function parseNumberBase(nb) {
    const s = safeStr(nb).trim();
    const m = s.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return { xx:"", yy:"", zz:"" };
    // Use numeric strings in inputs (no padding) - ok for editing
    return { xx: String(Number(m[1])), yy: String(Number(m[2])), zz: String(Number(m[3])) };
  }

  function numberKey(row) {
    // Sort using numeric parts from normalized base so order is stable
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
      const clean = line.replace(/^•\s*/, "").replace(/^-\s*/, "").replace(/^–\s*/, "").replace(/^—\s*/, "").trim();
      if (!clean) continue;

      if (!out.length) {
        out.push(clean);
        continue;
      }

      if (isBulletStart(line)) {
        out.push(clean);
      } else {
        // continuation of previous bullet
        out[out.length - 1] = (out[out.length - 1] + " " + clean).trim();
      }
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

  // ===== fallback builders from payload =====
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

    let raw = p.expected_evidence;
    if (raw === undefined) raw = p["Expected Evidence"];
    if (raw === undefined) raw = p.ExpEv_Bullets;

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
            <label>Expected Evidence text</label>
            <textarea data-ee-text="${idx}"></textarea>
          </div>

          <div class="full">
            <label>eSMS Reference(s)</label>
            <textarea data-ee-ch="${idx}" placeholder="Optional (e.g. eSMS Ch. 7.3, 7.5 etc.)"></textarea>
          </div>

          <div class="full">
            <label>eSMS Form(s)</label>
            <textarea data-ee-form="${idx}" placeholder="Optional (e.g. CBO-04, IG-01 etc.)"></textarea>
          </div>

          <div class="full">
            <label>Remarks</label>
            <textarea data-ee-remarks="${idx}" placeholder="Optional remarks for this Expected Evidence item"></textarea>
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

  // ===== view/edit fill =====
  function fillViewPanel(r) {
    setText("vhdrNumber", displayNumber(r));
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

    renderEeView();
    renderPgnoView();
  }

  function fillEditPanel(r) {
    $("dbSourceType").value = r.source_type || "SIRE";
    $("dbStatus").value = r.status || "active";
    $("dbNumberSuffix").value = safeStr(r.number_suffix);
    $("dbTags").value = Array.isArray(r.tags) ? r.tags.join(", ") : safeStr(r.tags || "");

    $("dbVersion").value = safeStr(r.version || "");
    $("dbChangeReason").value = safeStr(r.change_reason || "");

    const parts = parseNumberBase(normalizeNumberBaseRow(r));
    $("numChapter").value = parts.xx;
    $("numSection").value = parts.yy;
    $("numItem").value = parts.zz;

    setText("hdrId", r.id ? `DB id: ${r.id}` : "Not saved yet");
    setText("hdrNumber", displayNumber(r));

    const p = r.payload || {};
    $("pShortText").value = safeStr(p.short_text ?? p.ShortText ?? p.shortText ?? p["Short Text"]);
    $("pQuestion").value = safeStr(p.question ?? p.Question ?? p["Question"]);
    $("pGuidance").value = safeStr(p.inspection_guidance ?? p.guidance ?? p.InspectionGuidance ?? p["Inspection Guidance"]);
    $("pActions").value = safeStr(p.suggested_inspector_actions ?? p.actions ?? p.SuggestedInspectorActions ?? p["Suggested Inspector Actions"]);

    try { $("pRaw").value = JSON.stringify(p, null, 2); }
    catch { $("pRaw").value = ""; }

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
    const sx = safeStr($("dbNumberSuffix").value).trim();
    const tmp = { ...selected, number_base: nb, number_suffix: sx, number_full: "" };

    setText("hdrNumber", displayNumber(tmp));
    renderPgnoEditor(); // codes depend on number_base
  }

  // ===== list =====
  function passesSearch(r, term) {
    if (!term) return true;
    const t = term.toLowerCase();

    const n = displayNumber(r).toLowerCase();
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

      const p = r.payload || {};

      // ✅ Change requested:
      // Prefer FULL Question text in the list, fallback to Short Text only if Question is empty.
      const fullQuestion =
        safeStr(p.question || p.Question || p["Question"]).trim();

      const shortText =
        safeStr(p.short_text || p.ShortText || p.shortText || p["Short Text"]).trim();

      const sub = fullQuestion || shortText || "—";

      div.innerHTML = `
        <div class="qno">${escapeHtml(displayNumber(r))}</div>
        <div class="qsub">${escapeHtml(sub)}</div>
      `;
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
      pgno_code: pgnoCode(numberBase, i + 1, "SIRE"), // numberBase already built padded at save-time
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

    // Load PGNO rows
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

    // Load Expected Evidence rows
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
        potential_grounds_for_negative_observations: [],
      },
      pgno_items: [],
      ee_items: [],
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

      // Compatibility payload: store texts-only arrays
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

        try { await savePgnoToDb(data.id, number_base, selected.pgno_items || []); }
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

        try { await savePgnoToDb(selected.id, number_base, selected.pgno_items || []); }
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
    $("btnAddEe").onclick = () => addEeRow();
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
