// public/q-questions-editor.js
(() => {
  "use strict";

  // ====== helpers ======
  const PHOTO_BUCKET = "question-photos";

  const SUFFIX_BY_SOURCE = {
    SIRE: "",
    COMPANY: "C",
    SPARE1: "A",
    SPARE2: "B",
  };

  function $(id) { return document.getElementById(id); }

  function showWarn(msg) {
    const w = $("warnBox");
    if (!w) return alert(msg);
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

  function safeStr(v) {
    return v === null || v === undefined ? "" : String(v);
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

  function normalizeNumberBase(v) {
    // Accept "xx.yy.zz" or "xx.yy.zzz"
    const s = safeStr(v).trim();
    if (!s) return "";
    // allow digits + dots only
    const cleaned = s.replace(/[^0-9.]/g, "");
    return cleaned;
  }

  function computeNumberFull(numberBase, suffix) {
    const nb = normalizeNumberBase(numberBase);
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
        // setupAuthButtons will redirect to login in your auth.js flow
        return;
      }

      setModeLine(`Role: ${me.profile?.role || "—"} • Mode: Admin • Module: QUESTIONS_EDITOR`);

      // Show editor card
      $("editorCard").style.display = "block";

      wireUI();

      // Hide import card if DB has questions
      await toggleImportPanel();

      // initial load
      await loadQuestions();

    } catch (e) {
      showWarn("Boot failed:\n\n" + (e?.message || String(e)));
    }
  }

  function wireUI() {
    $("reloadBtn").onclick = () => loadQuestions();
    $("sourceFilter").onchange = () => renderList();
    $("statusFilter").onchange = () => renderList();
    $("versionFilter").oninput = () => renderList();
    $("searchInput").oninput = () => renderList();

    $("newQuestionBtn").onclick = () => newQuestion();

    $("btnReset").onclick = () => {
      if (!selected) return;
      if (selected.__isNew) {
        newQuestion(); // reset new form
      } else {
        // reload the row from allRows snapshot
        const r = allRows.find(x => x.id === selected.id);
        if (r) selectRow(r);
      }
    };

    $("btnSave").onclick = () => saveSelected();

    // photos
    $("btnRefreshPhotos").onclick = () => loadPhotosForSelected();
    $("btnUploadPhotos").onclick = () => uploadSelectedPhotos();

    // react to source_type changes in editor
    $("dbSourceType").onchange = () => {
      const st = $("dbSourceType").value;
      const auto = SUFFIX_BY_SOURCE[st] ?? "";
      // only auto-fill suffix if user did not type something else
      if (!safeStr($("dbNumberSuffix").value).trim() || $("dbNumberSuffix").dataset.auto === "1") {
        $("dbNumberSuffix").value = auto;
        $("dbNumberSuffix").dataset.auto = "1";
      }
      refreshHeaderNumber();
    };

    $("dbNumberBase").oninput = () => refreshHeaderNumber();
    $("dbNumberSuffix").oninput = () => {
      $("dbNumberSuffix").dataset.auto = "0";
      refreshHeaderNumber();
    };
  }

  async function toggleImportPanel() {
    const importCard = $("importCard");
    if (!importCard) return;

    try {
      const { count, error } = await sb
        .from("questions_master")
        .select("id", { count: "exact", head: true });

      if (error) throw error;

      // show import only if empty AND super_admin
      const isSuperAdmin = me?.profile?.role === "super_admin";
      importCard.style.display = (isSuperAdmin && (count || 0) === 0) ? "block" : "none";
    } catch (e) {
      // If count fails, keep it hidden (safer than showing it)
      importCard.style.display = "none";
    }
  }

  // ====== DB load + list ======
  async function loadQuestions() {
    showWarn("");
    showOk("");
    $("loadHint").textContent = "Loading…";

    try {
      const status = $("statusFilter").value || "";
      const version = safeStr($("versionFilter").value).trim();
      const src = $("sourceFilter").value;

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
      $("loadHint").textContent = `Loaded ${allRows.length}`;
      renderList();

      // auto-select first
      if (allRows.length) selectRow(allRows[0]);
      else {
        selected = null;
        $("emptyState").style.display = "block";
        $("editPanel").style.display = "none";
      }

      await toggleImportPanel();
    } catch (e) {
      $("loadHint").textContent = "";
      showWarn("Failed to load questions from DB:\n\n" + (e?.message || String(e)));
    }
  }

  function passesSearch(r, term) {
    if (!term) return true;
    const t = term.toLowerCase();
    const n = safeStr(r.number_full || computeNumberFull(r.number_base, r.number_suffix)).toLowerCase();
    const p = r.payload || {};
    const st = safeStr(p.short_text || p.ShortText || p.shortText).toLowerCase();
    const qu = safeStr(p.question || p.Question).toLowerCase();
    return n.includes(t) || st.includes(t) || qu.includes(t);
  }

  function renderList() {
    const list = $("qList");
    list.innerHTML = "";

    const term = safeStr($("searchInput").value).trim();
    const filtered = allRows.filter(r => passesSearch(r, term));

    $("countLine").textContent = `${filtered.length} questions`;

    for (const r of filtered) {
      const div = document.createElement("div");
      div.className = "qitem" + (selected && !selected.__isNew && selected.id === r.id ? " active" : "");
      const nfull = r.number_full || computeNumberFull(r.number_base, r.number_suffix);
      const p = r.payload || {};
      const sub = safeStr(p.short_text || p.ShortText || p.shortText) || safeStr(p.question || p.Question);
      div.innerHTML = `<div class="qno">${nfull}</div><div class="qsub">${sub}</div>`;
      div.onclick = () => selectRow(r);
      list.appendChild(div);
    }
  }

  // ====== select / populate editor ======
  function setEditorVisible(on) {
    $("emptyState").style.display = on ? "none" : "block";
    $("editPanel").style.display = on ? "block" : "none";
  }

  function refreshHeaderNumber() {
    const nb = $("dbNumberBase").value;
    const sx = $("dbNumberSuffix").value;
    $("hdrNumber").textContent = computeNumberFull(nb, sx) || "—";
  }

  function fillPayloadFields(payload) {
    const p = payload || {};
    $("pShortText").value = safeStr(p.short_text ?? p.ShortText ?? p.shortText);
    $("pQuestion").value = safeStr(p.question ?? p.Question);
    $("pGuidance").value = safeStr(p.inspection_guidance ?? p.guidance ?? p.InspectionGuidance);
    $("pActions").value = safeStr(p.suggested_inspector_actions ?? p.actions ?? p.SuggestedInspectorActions);
    $("pEvidence").value = safeStr(p.expected_evidence ?? p.evidence ?? p.ExpectedEvidence);
    $("pNegObs").value = safeStr(p.potential_grounds_for_negative_observations ?? p.neg_obs ?? p.NegativeObservations);

    // raw json
    try { $("pRaw").value = JSON.stringify(p, null, 2); }
    catch (_) { $("pRaw").value = ""; }
  }

  function readPayloadFromFields() {
    // Base payload from raw JSON if valid, otherwise build minimal
    let p = {};
    const raw = safeStr($("pRaw").value).trim();
    if (raw) {
      try { p = JSON.parse(raw); }
      catch (_) { p = {}; }
    }

    // Force-update common fields from form
    p.short_text = $("pShortText").value;
    p.question = $("pQuestion").value;
    p.inspection_guidance = $("pGuidance").value;
    p.suggested_inspector_actions = $("pActions").value;
    p.expected_evidence = $("pEvidence").value;
    p.potential_grounds_for_negative_observations = $("pNegObs").value;

    return p;
  }

  function selectRow(r) {
    selected = JSON.parse(JSON.stringify(r)); // clone
    selected.__isNew = false;

    $("newBanner").style.display = "none";

    setEditorVisible(true);
    $("hdrId").textContent = `DB id: ${r.id}`;

    $("dbSourceType").value = r.source_type;
    $("dbStatus").value = r.status;
    $("dbVersion").value = r.version || "";
    $("dbTags").value = Array.isArray(r.tags) ? r.tags.join(", ") : safeStr(r.tags);

    $("dbNumberBase").value = safeStr(r.number_base);
    $("dbNumberSuffix").value = safeStr(r.number_suffix);
    $("dbNumberSuffix").dataset.auto = "0";

    refreshHeaderNumber();
    fillPayloadFields(r.payload || {});
    $("saveStatus").textContent = "";

    renderList();
    loadPhotosForSelected();
  }

  // ====== new question ======
  function newQuestion() {
    showWarn("");
    showOk("");

    selected = {
      __isNew: true,
      id: null,
      source_type: "COMPANY",
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

    setEditorVisible(true);
    $("newBanner").style.display = "inline-block";
    $("hdrId").textContent = "Not saved yet";

    $("dbSourceType").value = selected.source_type;
    $("dbStatus").value = selected.status;
    $("dbVersion").value = selected.version;
    $("dbTags").value = "";

    $("dbNumberBase").value = "";
    $("dbNumberSuffix").value = SUFFIX_BY_SOURCE[selected.source_type] || "";
    $("dbNumberSuffix").dataset.auto = "1";

    refreshHeaderNumber();
    fillPayloadFields(selected.payload);
    $("saveStatus").textContent = "";

    // clear photos panel
    $("photoGrid").innerHTML = "";
    $("photoCountLine").textContent = "Save the question first to attach photos.";
    $("photoStatus").textContent = "";
  }

  // ====== save ======
  async function saveSelected() {
    if (!selected) return;

    showWarn("");
    showOk("");
    $("saveStatus").textContent = "Saving…";

    try {
      const src = $("dbSourceType").value;
      const status = $("dbStatus").value;
      const version = safeStr($("dbVersion").value).trim() || "SIRE_2_0_QL";

      const nb = normalizeNumberBase($("dbNumberBase").value);
      if (!nb) {
        $("saveStatus").textContent = "";
        showWarn("number_base is required (e.g. 04.01.01 or 04.01.105).");
        return;
      }

      const sx = safeStr($("dbNumberSuffix").value).trim();
      const numberFull = computeNumberFull(nb, sx);

      // tags
      const tagsCsv = safeStr($("dbTags").value).trim();
      const tags = tagsCsv
        ? tagsCsv.split(",").map(s => s.trim()).filter(Boolean)
        : [];

      const payload = readPayloadFromFields();

      const row = {
        source_type: src,
        status,
        version,
        tags,
        number_base: nb,
        number_suffix: sx || "",     // your DB says NOT NULL; keep empty string for SIRE
        number_full: numberFull || null,
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
        $("saveStatus").textContent = "";

        // reload and select new row
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
        $("saveStatus").textContent = "";

        await loadQuestions();
        const updated = allRows.find(x => x.id === selected.id);
        if (updated) selectRow(updated);
      }
    } catch (e) {
      $("saveStatus").textContent = "";
      showWarn("Save failed:\n\n" + (e?.message || String(e)));
    }
  }

  // ====== photos ======
  function canManagePhotos() {
    // adjust if you want only super_admin/company_admin
    const role = me?.profile?.role || "";
    return role === "super_admin" || role === "company_admin";
  }

  function showPhotoWarn(msg) {
    const w = $("photoWarn");
    if (!w) return;
    w.textContent = msg || "";
    w.style.display = msg ? "block" : "none";
  }

  function setPhotoStatus(msg) {
    const el = $("photoStatus");
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

    const files = $("photoFile")?.files ? Array.from($("photoFile").files) : [];
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

        // 2) DB insert - CRITICAL: file_name NOT NULL
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
      $("photoFile").value = "";
      await loadPhotosForSelected();
    } catch (e) {
      setPhotoStatus("");
      showPhotoWarn("Upload failed:\n\n" + (e?.message || String(e)));
    }
  }

  async function loadPhotosForSelected() {
    showPhotoWarn("");

    const grid = $("photoGrid");
    const cntLine = $("photoCountLine");
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

      // delete from storage first
      const rm = await sb.storage.from(PHOTO_BUCKET).remove([filePath]);
      if (rm.error) throw rm.error;

      // delete row
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

  // start
  boot();
})();
