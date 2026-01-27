// public/q-questions-editor.js
(() => {
  "use strict";

  // ====== helpers ======
  const PHOTO_BUCKET = "question-photos";

  // Map source_type -> suffix letter
  const SUFFIX_BY_SOURCE = {
    SIRE: "",
    COMPANY: "C",
    SPARE1: "A",
    SPARE2: "B",
  };

  // Some projects renamed buttons/ids over time.
  // This helper tries multiple ids and returns the first element found.
  function $any(...ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  // Original convenience
  function $(id) { return document.getElementById(id); }

  function safeStr(v) {
    return v === null || v === undefined ? "" : String(v);
  }

  function showWarn(msg) {
    const w = $any("warnBox");
    if (!w) return msg ? alert(msg) : undefined;
    w.textContent = msg || "";
    w.style.display = msg ? "block" : "none";
  }

  function showOk(msg) {
    const w = $any("okBox");
    if (!w) return;
    w.textContent = msg || "";
    w.style.display = msg ? "block" : "none";
  }

  function setModeLine(txt) {
    const el = $any("modeLine");
    if (el) el.textContent = txt || "";
  }

  function setText(idOrEl, txt) {
    const el = typeof idOrEl === "string" ? $(idOrEl) : idOrEl;
    if (el) el.textContent = txt || "";
  }

  function setValue(idOrEl, val) {
    const el = typeof idOrEl === "string" ? $(idOrEl) : idOrEl;
    if (!el) return;
    el.value = val ?? "";
  }

  function setDisplay(idOrEl, on) {
    const el = typeof idOrEl === "string" ? $(idOrEl) : idOrEl;
    if (!el) return;
    el.style.display = on ? "block" : "none";
  }

  function sanitizeFileName(name) {
    const n = safeStr(name).trim();
    if (!n) return "file";
    return (
      n.replaceAll("\\", "_")
       .replaceAll("/", "_")
       .replaceAll("..", "_")
       .replace(/[^\w.\-() ]+/g, "_")
       .trim() || "file"
    );
  }

  // ===== numbering =====
  function pad2(n) { return String(n).padStart(2, "0"); }

  // Normalize base to digits+dots, allow xx.yy.zz or xx.yy.zzz.
  function normalizeNumberBase(v) {
    const s = safeStr(v).trim();
    if (!s) return "";
    const cleaned = s.replace(/[^0-9.]/g, "");
    return cleaned;
  }

  // Display formatting: enforce xx.yy.zz (and allow zzz)
  function formatNumberBaseForDisplay(nb) {
    const s = normalizeNumberBase(nb);
    if (!s) return "";
    const parts = s.split(".").filter(Boolean);
    const a = parts[0] ?? "";
    const b = parts[1] ?? "";
    const c = parts[2] ?? "";
    if (!a || !b || !c) return s;

    const aa = pad2(parseInt(a, 10) || 0);
    const bb = pad2(parseInt(b, 10) || 0);

    // keep 2 digits for SIRE-ish, allow 3 if already 3+
    const cNum = parseInt(c, 10);
    const cWidth = (c.length >= 3 || cNum >= 100) ? 3 : 2;
    const cc = String(cNum || 0).padStart(cWidth, "0");

    return `${aa}.${bb}.${cc}`;
  }

  function computeNumberFull(numberBase, suffix) {
    const nb = formatNumberBaseForDisplay(numberBase); // display-normalized
    const sx = safeStr(suffix).trim();
    if (!nb) return "";
    if (!sx) return nb;
    return `${nb}-${sx}`;
  }

  // ====== state ======
  let sb = null;
  let me = null;

  // List loaded from DB
  let allRows = [];
  // Currently selected row (can be "new")
  let selected = null;

  // ====== boot ======
  async function boot() {
    try {
      if (!window.AUTH) {
        showWarn("AUTH helper not loaded (auth.js).");
        return;
      }
      sb = window.AUTH.ensureSupabase();

      // Must be logged in
      me = await window.AUTH.setupAuthButtons({
        badgeId: "userBadge",
        loginBtnId: "loginBtn",
        logoutBtnId: "logoutBtn",
        switchBtnId: "switchUserBtn",
        loginPath: "./login.html",
      });

      if (!me?.session?.user) {
        return; // auth helper will handle login redirect flow
      }

      setModeLine(`Role: ${me.profile?.role || "—"} • Mode: Admin • Module: QUESTIONS_EDITOR`);

      // Show editor card (if present)
      const editorCard = $any("editorCard");
      if (editorCard) editorCard.style.display = "block";

      wireUI();

      await toggleImportPanel();

      await loadQuestions();
    } catch (e) {
      showWarn("Boot failed:\n\n" + (e?.message || String(e)));
    }
  }

  function wireUI() {
    // IMPORTANT: make all wiring null-safe
    const reloadBtn = $any("reloadBtn");
    if (reloadBtn) reloadBtn.onclick = () => loadQuestions();

    const sourceFilter = $any("sourceFilter");
    if (sourceFilter) sourceFilter.onchange = () => renderList();

    const statusFilter = $any("statusFilter");
    if (statusFilter) statusFilter.onchange = () => renderList();

    const versionFilter = $any("versionFilter");
    if (versionFilter) versionFilter.oninput = () => renderList();

    const searchInput = $any("searchInput");
    if (searchInput) searchInput.oninput = () => renderList();

    // NEW QUESTION button id changed in some versions:
    const newBtn = $any("newQuestionBtn", "newBtn");
    if (newBtn) newBtn.onclick = () => newQuestion();

    const btnReset = $any("btnReset");
    if (btnReset) {
      btnReset.onclick = () => {
        if (!selected) return;
        if (selected.__isNew) {
          newQuestion();
        } else {
          const r = allRows.find(x => x.id === selected.id);
          if (r) selectRow(r);
        }
      };
    }

    const btnSave = $any("btnSave");
    if (btnSave) btnSave.onclick = () => saveSelected();

    // photos
    const btnRefreshPhotos = $any("btnRefreshPhotos");
    if (btnRefreshPhotos) btnRefreshPhotos.onclick = () => loadPhotosForSelected();

    const btnUploadPhotos = $any("btnUploadPhotos");
    if (btnUploadPhotos) btnUploadPhotos.onclick = () => uploadSelectedPhotos();

    // source type change: in some HTML versions dbSourceType is a <select>, in others a <span>
    const dbSourceType = $any("dbSourceType");
    if (dbSourceType && dbSourceType.tagName === "SELECT") {
      dbSourceType.onchange = () => {
        const st = dbSourceType.value;
        const auto = SUFFIX_BY_SOURCE[st] ?? "";
        const sfxEl = $any("dbNumberSuffix");
        if (!sfxEl) return;

        if (!safeStr(sfxEl.value).trim() || sfxEl.dataset.auto === "1") {
          sfxEl.value = auto;
          sfxEl.dataset.auto = "1";
        }
        refreshHeaderNumber();
      };
    }

    const dbNumberBase = $any("dbNumberBase");
    if (dbNumberBase) dbNumberBase.oninput = () => refreshHeaderNumber();

    const dbNumberSuffix = $any("dbNumberSuffix");
    if (dbNumberSuffix) {
      dbNumberSuffix.oninput = () => {
        dbNumberSuffix.dataset.auto = "0";
        refreshHeaderNumber();
      };
    }
  }

  async function toggleImportPanel() {
    const importCard = $any("importCard");
    if (!importCard) return;

    try {
      const { count, error } = await sb
        .from("questions_master")
        .select("id", { count: "exact", head: true });

      if (error) throw error;

      const isSuperAdmin = me?.profile?.role === "super_admin";
      importCard.style.display = (isSuperAdmin && (count || 0) === 0) ? "block" : "none";
    } catch (_e) {
      importCard.style.display = "none";
    }
  }

  // ====== DB load + list ======
  async function loadQuestions() {
    showWarn("");
    showOk("");
    setText("loadHint", "Loading…");

    try {
      const status = safeStr($any("statusFilter")?.value || "");
      const version = safeStr($any("versionFilter")?.value).trim();
      const src = safeStr($any("sourceFilter")?.value || "");

      let q = sb
        .from("questions_master")
        .select("id, number_base, number_suffix, number_full, source_type, status, version, tags, payload, updated_at, created_at")
        .order("number_base", { ascending: true });

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
        setEditorVisible(false);
      }

      await toggleImportPanel();
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
    const st = safeStr(p.short_text || p.ShortText || p.shortText || p["Short Text"]).toLowerCase();
    const qu = safeStr(p.question || p.Question || p["Question"]).toLowerCase();
    return n.includes(t) || st.includes(t) || qu.includes(t);
  }

  function renderList() {
    const list = $any("qList");
    if (!list) return;

    list.innerHTML = "";

    const term = safeStr($any("searchInput")?.value).trim();
    const filtered = allRows.filter(r => passesSearch(r, term));

    const countLine = $any("countLine");
    if (countLine) countLine.textContent = `${filtered.length} questions`;

    for (const r of filtered) {
      const div = document.createElement("div");
      div.className = "qitem" + (selected && !selected.__isNew && selected.id === r.id ? " active" : "");

      const nfullRaw = r.number_full || computeNumberFull(r.number_base, r.number_suffix);
      // ensure padded display even if DB stored 2.1.1
      const nfullDisplay = (() => {
        const sx = safeStr(r.number_suffix).trim();
        return computeNumberFull(r.number_base, sx);
      })();

      const p = r.payload || {};
      const sub =
        safeStr(p.short_text || p.ShortText || p.shortText || p["Short Text"]) ||
        safeStr(p.question || p.Question || p["Question"]);

      div.innerHTML = `<div class="qno">${nfullDisplay || safeStr(nfullRaw)}</div><div class="qsub">${sub}</div>`;
      div.onclick = () => selectRow(r);
      list.appendChild(div);
    }
  }

  // ====== select / populate editor ======
  function setEditorVisible(on) {
    const emptyState = $any("emptyState");
    const editPanel = $any("editPanel");
    if (emptyState) emptyState.style.display = on ? "none" : "block";
    if (editPanel) editPanel.style.display = on ? "block" : "none";
  }

  function refreshHeaderNumber() {
    const nbEl = $any("dbNumberBase");
    const sxEl = $any("dbNumberSuffix");

    const nb = nbEl ? nbEl.value : "";
    const sx = sxEl ? sxEl.value : "";

    const hdr = $any("hdrNumber");
    if (hdr) hdr.textContent = computeNumberFull(nb, sx) || "—";
  }

  function fillPayloadFields(payload) {
    const p = payload || {};
    setValue("pShortText", safeStr(p.short_text ?? p.ShortText ?? p.shortText ?? p["Short Text"]));
    setValue("pQuestion", safeStr(p.question ?? p.Question ?? p["Question"]));
    setValue("pGuidance", safeStr(p.inspection_guidance ?? p.guidance ?? p.InspectionGuidance ?? p["Inspection Guidance"]));
    setValue("pActions", safeStr(p.suggested_inspector_actions ?? p.actions ?? p.SuggestedInspectorActions ?? p["Suggested Inspector Actions"]));
    setValue("pEvidence", safeStr(p.expected_evidence ?? p.evidence ?? p.ExpectedEvidence ?? p["Expected Evidence"]));
    setValue("pNegObs", safeStr(p.potential_grounds_for_negative_observations ?? p.neg_obs ?? p.NegativeObservations ?? p["Potential Grounds for Negative Observations"]));

    const rawEl = $any("pRaw");
    if (rawEl) {
      try { rawEl.value = JSON.stringify(p, null, 2); }
      catch (_e) { rawEl.value = ""; }
    }
  }

  function readPayloadFromFields() {
    let p = {};
    const rawEl = $any("pRaw");
    const raw = safeStr(rawEl?.value).trim();
    if (raw) {
      try { p = JSON.parse(raw); }
      catch (_e) { p = {}; }
    }

    // Force-update common fields from form
    const st = $any("pShortText");
    const qu = $any("pQuestion");
    const gd = $any("pGuidance");
    const ac = $any("pActions");
    const ev = $any("pEvidence");
    const ng = $any("pNegObs");

    // Keep your canonical keys (snake_case) but do not delete existing keys in raw JSON.
    p.short_text = st ? st.value : (p.short_text ?? "");
    p.question = qu ? qu.value : (p.question ?? "");
    p.inspection_guidance = gd ? gd.value : (p.inspection_guidance ?? "");
    p.suggested_inspector_actions = ac ? ac.value : (p.suggested_inspector_actions ?? "");
    p.expected_evidence = ev ? ev.value : (p.expected_evidence ?? "");
    p.potential_grounds_for_negative_observations = ng ? ng.value : (p.potential_grounds_for_negative_observations ?? "");

    return p;
  }

  function selectRow(r) {
    selected = JSON.parse(JSON.stringify(r));
    selected.__isNew = false;

    const newBanner = $any("newBanner");
    if (newBanner) newBanner.style.display = "none";

    setEditorVisible(true);

    setText("hdrId", `DB id: ${r.id}`);

    // Depending on HTML: dbSourceType might be select or pill/span
    const dbSourceType = $any("dbSourceType");
    if (dbSourceType) {
      if (dbSourceType.tagName === "SELECT") dbSourceType.value = r.source_type;
      else dbSourceType.textContent = r.source_type;
    }

    setValue("dbStatus", r.status);
    setValue("dbVersion", r.version || "");
    setValue("dbTags", Array.isArray(r.tags) ? r.tags.join(", ") : safeStr(r.tags));

    // Some HTML versions use inputs for number_base/suffix; others use pills/spans.
    const nbEl = $any("dbNumberBase");
    if (nbEl) {
      if (nbEl.tagName === "INPUT" || nbEl.tagName === "TEXTAREA") nbEl.value = safeStr(r.number_base);
      else nbEl.textContent = formatNumberBaseForDisplay(r.number_base);
    }

    const sxEl = $any("dbNumberSuffix");
    if (sxEl) {
      if (sxEl.tagName === "INPUT" || sxEl.tagName === "TEXTAREA" || sxEl.tagName === "SELECT") sxEl.value = safeStr(r.number_suffix);
      else sxEl.textContent = safeStr(r.number_suffix);
      sxEl.dataset.auto = "0";
    }

    // Header number
    const hdr = $any("hdrNumber");
    if (hdr) hdr.textContent = computeNumberFull(r.number_base, r.number_suffix) || "—";

    fillPayloadFields(r.payload || {});
    setText("saveStatus", "");

    renderList();
    loadPhotosForSelected();
  }

  // ====== new question ======
  function newQuestion() {
    showWarn("");
    showOk("");

    const versionFromFilter = safeStr($any("versionFilter")?.value).trim();

    selected = {
      __isNew: true,
      id: null,
      source_type: "COMPANY",
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
        expected_evidence: "",
        potential_grounds_for_negative_observations: "",
      },
    };

    setEditorVisible(true);

    const newBanner = $any("newBanner");
    if (newBanner) newBanner.style.display = "inline-block";

    setText("hdrId", "Not saved yet");

    const dbSourceType = $any("dbSourceType");
    if (dbSourceType) {
      if (dbSourceType.tagName === "SELECT") dbSourceType.value = selected.source_type;
      else dbSourceType.textContent = selected.source_type;
    }

    setValue("dbStatus", selected.status);
    setValue("dbVersion", selected.version);
    setValue("dbTags", "");

    const nbEl = $any("dbNumberBase");
    if (nbEl) {
      if (nbEl.tagName === "INPUT" || nbEl.tagName === "TEXTAREA") nbEl.value = "";
      else nbEl.textContent = "";
    }

    const sxEl = $any("dbNumberSuffix");
    if (sxEl) {
      const auto = SUFFIX_BY_SOURCE[selected.source_type] || "";
      if (sxEl.tagName === "INPUT" || sxEl.tagName === "TEXTAREA" || sxEl.tagName === "SELECT") sxEl.value = auto;
      else sxEl.textContent = auto;
      sxEl.dataset.auto = "1";
    }

    refreshHeaderNumber();
    fillPayloadFields(selected.payload);
    setText("saveStatus", "");

    // clear photos panel
    const grid = $any("photoGrid");
    if (grid) grid.innerHTML = "";
    setText("photoCountLine", "Save the question first to attach photos.");
    setText("photoStatus", "");
  }

  // ====== save ======
  async function saveSelected() {
    if (!selected) return;

    showWarn("");
    showOk("");
    setText("saveStatus", "Saving…");

    try {
      const srcEl = $any("dbSourceType");
      const src =
        srcEl
          ? (srcEl.tagName === "SELECT" ? srcEl.value : safeStr(srcEl.textContent).trim())
          : "COMPANY";

      const status = safeStr($any("dbStatus")?.value || "active");
      const version = safeStr($any("dbVersion")?.value).trim() || "SIRE_2_0_QL";

      // number_base / suffix can be input or span
      const nbEl = $any("dbNumberBase");
      const rawNb = nbEl
        ? (nbEl.tagName === "INPUT" || nbEl.tagName === "TEXTAREA" ? nbEl.value : nbEl.textContent)
        : "";
      const nb = normalizeNumberBase(rawNb);

      if (!nb) {
        setText("saveStatus", "");
        showWarn("number_base is required (e.g. 04.01.01 or 04.01.105).");
        return;
      }

      const sxEl = $any("dbNumberSuffix");
      const sx =
        sxEl
          ? (sxEl.tagName === "INPUT" || sxEl.tagName === "TEXTAREA" || sxEl.tagName === "SELECT"
              ? sxEl.value
              : sxEl.textContent)
          : "";

      // tags
      const tagsCsv = safeStr($any("dbTags")?.value).trim();
      const tags = tagsCsv
        ? tagsCsv.split(",").map(s => s.trim()).filter(Boolean)
        : [];

      const payload = readPayloadFromFields();

      // IMPORTANT FIX:
      // DO NOT send number_full. Your DB likely generates it (GENERATED ALWAYS / trigger).
      // Sending it causes: "cannot insert a non-DEFAULT value into column number_full"
      const row = {
        source_type: src,
        status,
        version,
        tags,
        number_base: nb,
        number_suffix: safeStr(sx).trim(),  // keep empty string for SIRE if needed
        payload,
        updated_by: me?.user?.id || null,
      };

      if (selected.__isNew) {
        row.created_by = me?.user?.id || null;

        const { data, error } = await sb
          .from("questions_master")
          .insert(row)
          .select("id, number_base, number_suffix, number_full, source_type, status, version, tags, payload, updated_at, created_at")
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

  // ====== photos ======
  function canManagePhotos() {
    const role = me?.profile?.role || "";
    return role === "super_admin" || role === "company_admin";
  }

  function showPhotoWarn(msg) {
    const w = $any("photoWarn");
    if (!w) return;
    w.textContent = msg || "";
    w.style.display = msg ? "block" : "none";
  }

  function setPhotoStatus(msg) {
    const el = $any("photoStatus");
    if (el) el.textContent = msg || "";
  }

  function storagePathFor(questionId, file) {
    const safe = sanitizeFileName(file?.name || "image.jpg");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    return `questions/${questionId}/${ts}_${safe}`;
  }

  async function uploadSelectedPhotos() {
    showPhotoWarn("");

    if (!selected || selected.__isNew || !selected.id) {
      showPhotoWarn("Save the question first, then upload photos.");
      return;
    }
    if (!canManagePhotos()) {
      showPhotoWarn("Upload not allowed for your role (admins only).");
      return;
    }

    const fileEl = $any("photoFile");
    const files = fileEl?.files ? Array.from(fileEl.files) : [];
    if (!files.length) {
      showPhotoWarn("Please choose one or more image files first.");
      return;
    }

    const MAX_MB = 10;
    for (const f of files) {
      if (f.size > MAX_MB * 1024 * 1024) {
        showPhotoWarn(`File too large: ${f.name}\nMax allowed: ${MAX_MB}MB.`);
        return;
      }
    }

    setPhotoStatus(`Uploading ${files.length} file(s)…`);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setPhotoStatus(`Uploading ${i + 1}/${files.length}: ${file.name}`);

        const path = storagePathFor(selected.id, file);

        // 1) storage upload
        const up = await sb.storage.from(PHOTO_BUCKET).upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
        if (up.error) throw up.error;

        // 2) DB insert - file_name NOT NULL
        const ins = await sb.from("question_photos").insert({
          question_id: selected.id,
          file_path: path,
          file_name: sanitizeFileName(file.name),
          mime_type: file.type || null,
          size_bytes: typeof file.size === "number" ? file.size : null,
          caption: "",
          uploaded_by: me?.user?.id || null,
        });
        if (ins.error) throw ins.error;
      }

      setPhotoStatus("Upload completed.");
      if (fileEl) fileEl.value = "";
      await loadPhotosForSelected();
    } catch (e) {
      setPhotoStatus("");
      showPhotoWarn("Upload failed:\n\n" + (e?.message || String(e)));
    }
  }

  async function loadPhotosForSelected() {
    showPhotoWarn("");

    const grid = $any("photoGrid");
    const cntLine = $any("photoCountLine");
    if (!grid || !cntLine) return;

    grid.innerHTML = "";
    cntLine.textContent = "";

    if (!selected || selected.__isNew || !selected.id) {
      cntLine.textContent = "Save the question first to attach photos.";
      setPhotoStatus("");
      return;
    }

    setPhotoStatus("Loading photos…");

    try {
      const { data, error } = await sb
        .from("question_photos")
        .select("id, file_path, file_name, mime_type, size_bytes, caption, created_at")
        .eq("question_id", selected.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = data || [];
      if (!rows.length) {
        cntLine.textContent = "No photos attached to this question yet.";
        setPhotoStatus("");
        return;
      }

      for (const r of rows) {
        const publicUrl = sb.storage.from(PHOTO_BUCKET).getPublicUrl(r.file_path).data?.publicUrl || "";

        const card = document.createElement("div");
        card.className = "photoCard";

        const niceName = safeStr(r.file_name) || "(unnamed)";
        const niceSize =
          typeof r.size_bytes === "number" && r.size_bytes >= 0
            ? `${Math.round(r.size_bytes / 1024)} KB`
            : "";

        card.innerHTML = `
          <div class="photoThumb">
            ${publicUrl ? `<img src="${publicUrl}" alt="photo"/>` : `<div class="muted">No preview</div>`}
          </div>
          <div class="photoMeta">
            <div class="small"><b>File:</b> ${niceName} ${niceSize ? `(${niceSize})` : ""}</div>
            <div class="small"><b>Uploaded:</b> ${new Date(r.created_at).toLocaleString()}</div>
            <div class="small"><b>Path:</b> ${r.file_path}</div>
            <div class="photoBtns">
              <a class="btn light" href="${publicUrl}" target="_blank" rel="noopener">Open</a>
              <button class="btn danger" type="button" data-photo-id="${r.id}" data-path="${r.file_path}">Delete</button>
            </div>
          </div>
        `;

        const delBtn = card.querySelector("button[data-photo-id]");
        if (delBtn) {
          if (!canManagePhotos()) {
            delBtn.disabled = true;
            delBtn.title = "Not allowed (admins only).";
            delBtn.classList.remove("danger");
            delBtn.classList.add("light");
          } else {
            delBtn.onclick = async () => deletePhotoRowAndFile(delBtn.dataset.photoId, delBtn.dataset.path);
          }
        }

        grid.appendChild(card);
      }

      cntLine.textContent = `${rows.length} photo(s) attached to this question.`;
      setPhotoStatus("");
    } catch (e) {
      setPhotoStatus("");
      showPhotoWarn("Failed to load photos:\n\n" + (e?.message || String(e)));
    }
  }

  async function deletePhotoRowAndFile(photoId, filePath) {
    if (!confirm("Delete this photo?\n\nThis removes it from Storage and DB.")) return;

    try {
      setPhotoStatus("Deleting…");

      const rm = await sb.storage.from(PHOTO_BUCKET).remove([filePath]);
      if (rm.error) throw rm.error;

      const del = await sb.from("question_photos").delete().eq("id", photoId);
      if (del.error) throw del.error;

      setPhotoStatus("");
      await loadPhotosForSelected();
      showOk("Photo deleted.");
    } catch (e) {
      setPhotoStatus("");
      showPhotoWarn("Delete failed:\n\n" + (e?.message || String(e)));
    }
  }

  // expose for debugging if needed
  window.__QEDIT = { loadQuestions, newQuestion };

  boot();
})();
