// public/q-questions-editor.js
(() => {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function safeStr(v) { return v === null || v === undefined ? "" : String(v); }

  // Null-safe event binder (robust: uses addEventListener so handlers cannot be overwritten)
  function onClick(id, fn) {
    const el = $(id);
    if (!el) {
      console.warn(`[q-questions-editor] Missing element #${id} (HTML out of sync).`);
      return false;
    }
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      fn(ev);
    });
    return true;
  }
  function onChange(id, fn) {
    const el = $(id);
    if (!el) {
      console.warn(`[q-questions-editor] Missing element #${id} (HTML out of sync).`);
      return false;
    }
    el.addEventListener("change", fn);
    return true;
  }
  function onInput(id, fn) {
    const el = $(id);
    if (!el) {
      console.warn(`[q-questions-editor] Missing element #${id} (HTML out of sync).`);
      return false;
    }
    el.addEventListener("input", fn);
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

    syncDeactivateButtonUI();
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

    syncDeactivateButtonUI();
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
  }

  // ===== DB load =====
  async function loadQuestions() {
    showWarn("");
    showOk("");
    setText("loadHint", "Loading…");

    try {
      const status = safeStr($("statusFilter")?.value || "");
      const version = safeStr($("versionFilter")?.value).trim();
      const src = safeStr($("sourceFilter")?.value || "");

      let q = sb
        .from("questions_master")
        .select("id, number_base, number_suffix, number_full, source_type, is_custom, status, version, tags, payload, change_reason, updated_at, created_at")
        .order("created_at", { ascending: true });

      // IMPORTANT: allow ALL
      if (status && status !== "ALL") q = q.eq("status", status);

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

    const versionFromFilter = safeStr($("versionFilter")?.value).trim();

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
    setPillsFromSelected();
    refreshHeaderFromNumberInputs();
    syncDeactivateButtonUI();
  }

  // ===== deactivate (TOGGLE) =====
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

      // Auto-switch filter so the user can immediately see the question after toggle
      const sf = $("statusFilter");
      if (sf) {
        if (next === "inactive") sf.value = "inactive";
        if (next === "active") sf.value = "active";
      }

      selected.status = next;
      setPillsFromSelected();
      syncDeactivateButtonUI();

      showOk(`${next === "inactive" ? "Deactivated" : "Activated"} ${qno}.`);
      await loadQuestions();

      const still = allRows.find(r => r.id === selected.id);
      if (still) await selectRow(still);
      else {
        selected = null;
        setMode("VIEW");
      }
    } catch (e) {
      showWarn(`${next === "inactive" ? "Deactivate" : "Activate"} failed:\n\n" + (e?.message || String(e)));
    }
  }

  // ===== delete =====
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
      const { error: e1 } = await sb.from("pgno_master").delete().eq("question_id", selected.id);
      if (e1) throw e1;

      const { error: e2 } = await sb.from("expected_evidence_master").delete().eq("question_id", selected.id);
      if (e2) throw e2;

      const { error: e3 } = await sb.from("questions_master").delete().eq("id", selected.id);
      if (e3) throw e3;

      showOk(`Deleted ${qno}.`);
      selected = null;
      await loadQuestions();
      setMode("VIEW");
    } catch (e) {
      // Make the failure reason obvious (RLS is the common cause)
      const msg = (e?.message || String(e));
      const low = msg.toLowerCase();

      let extra = "";
      if (
        low.includes("row-level security") ||
        low.includes("rls") ||
        low.includes("permission denied") ||
        low.includes("not allowed")
      ) {
        extra =
          "\n\nDELETE is being blocked by Supabase RLS/policies.\n" +
          "To make DELETE actually work, you must add DELETE policies for:\n" +
          "- questions_master\n" +
          "- pgno_master\n" +
          "- expected_evidence_master";
      }

      showWarn("Delete failed:\n\n" + msg + extra);
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
    onChange("statusFilter", () => loadQuestions());
    onChange("sourceFilter", () => loadQuestions());

    let vTimer = null;
    onInput("versionFilter", () => {
      if (vTimer) clearTimeout(vTimer);
      vTimer = setTimeout(() => loadQuestions(), 450);
    });

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

    onChange("dbSourceType", () => {
      const st = $("dbSourceType")?.value;
      if (st === "SIRE") $("dbNumberSuffix").value = "";
      if (st !== "SIRE" && !safeStr($("dbNumberSuffix")?.value).trim()) $("dbNumberSuffix").value = "C";
      refreshHeaderFromNumberInputs();
    });

    onChange("dbStatus", () => {
      // This dropdown is saved with Save button, but we keep UI consistent
      // with the real DB status shown on the toggle button.
      // (Do not change selected.status here.)
      syncDeactivateButtonUI();
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
