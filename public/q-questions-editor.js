// public/q-questions-editor.js
(() => {
  "use strict";

  const PHOTO_BUCKET = "question-photos";

  // Auto suffix defaults when creating new records
  const SUFFIX_BY_SOURCE = {
    SIRE: "",
    COMPANY: "C",
    SPARE1: "A",
    SPARE2: "B",
  };

  function $(id){ return document.getElementById(id); }
  function safeStr(v){ return (v===null || v===undefined) ? "" : String(v); }

  function setText(id, txt){ const el=$(id); if(el) el.textContent = txt ?? ""; }
  function setHtml(id, html){ const el=$(id); if(el) el.innerHTML = html ?? ""; }
  function setShow(id, on){ const el=$(id); if(el) el.style.display = on ? "" : "none"; }
  function setVal(id, v){ const el=$(id); if(el) el.value = v ?? ""; }

  function showWarn(msg){
    const el = $("warnBox");
    if (!el) return;
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  }
  function showOk(msg){
    const el = $("okBox");
    if (!el) return;
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  }

  function escapeHtml(s){
    return safeStr(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#39;");
  }

  // Payload getters
  function pGet(p, key){
    if (!p || typeof p !== "object") return "";
    // Canonical snake_case keys used by our editor
    const map = {
      "Short Text": ["short_text", "ShortText", "shortText", "Short Text"],
      "Question": ["question", "Question"],
      "Inspection Guidance": ["inspection_guidance", "guidance", "InspectionGuidance", "Inspection Guidance"],
      "Suggested Inspector Actions": ["suggested_inspector_actions", "actions", "SuggestedInspectorActions", "Suggested Inspector Actions"],
    };
    const candidates = map[key] || [key];
    for (const k of candidates){
      if (p[k] !== undefined && p[k] !== null) return safeStr(p[k]);
    }
    return "";
  }

  function formatFull(row){
    const nf = safeStr(row?.number_full).trim();
    if (nf) return nf;
    const nb = safeStr(row?.number_base).trim();
    if (!nb) return "";
    const sfx = safeStr(row?.number_suffix).trim();
    return sfx ? `${nb}-${sfx}` : nb;
  }

  // State
  let sb = null;
  let bundle = null;
  let role = "";
  let canEdit = false;
  let canManagePhotos = false;

  let allRows = [];
  let filteredRows = [];
  let selectedRow = null;     // from DB (or temp for new)
  let originalRow = null;     // snapshot for reset
  let isEditMode = false;

  // -------- Evidence/PGNO read-only (view) --------
  async function fetchEvidence(questionId){
    const { data, error } = await sb
      .from("question_evidence_items")
      .select("id, question_id, evidence_text, esms_forms, esms_refs, remarks, sort_order")
      .eq("question_id", questionId)
      .order("sort_order", { ascending:true });
    if (error) throw error;
    return data || [];
  }

  async function fetchPgno(questionId){
    const { data, error } = await sb
      .from("question_pgno")
      .select("id, question_id, pgno_no, pgno_text, sort_order")
      .eq("question_id", questionId)
      .order("sort_order", { ascending:true });
    if (error) throw error;
    return data || [];
  }

  function renderEvidenceViewer(items){
    if (!items || !items.length){
      setHtml("vEvidence", `<div class="muted">No evidence items stored yet.</div>`);
      return;
    }
    setHtml("vEvidence", items.map((it, idx) => {
      const ef = safeStr(it.esms_forms);
      const er = safeStr(it.esms_refs);
      const rm = safeStr(it.remarks);
      return `
        <div style="margin-bottom:10px; padding-bottom:10px; border-bottom:1px dashed #d8e6fb;">
          <div><b>Item ${idx+1}</b></div>
          <div style="white-space:pre-wrap; margin-top:6px;">${escapeHtml(it.evidence_text)}</div>
          ${ef ? `<div class="muted" style="margin-top:6px;"><b>eSMS Form(s):</b> ${escapeHtml(ef)}</div>` : ""}
          ${er ? `<div class="muted" style="margin-top:4px;"><b>eSMS Reference(s):</b> ${escapeHtml(er)}</div>` : ""}
          ${rm ? `<div class="muted" style="margin-top:4px;"><b>Remarks:</b> ${escapeHtml(rm)}</div>` : ""}
        </div>
      `;
    }).join(""));
  }

  function renderPgnoViewer(items){
    if (!items || !items.length){
      setHtml("vPgno", `<div class="muted">No PGNO items stored yet.</div>`);
      return;
    }
    setHtml("vPgno", items.map((it) => {
      return `
        <div style="margin-bottom:10px; padding-bottom:10px; border-bottom:1px dashed #d8e6fb;">
          <div><b>${escapeHtml(it.pgno_no)}</b></div>
          <div style="white-space:pre-wrap; margin-top:6px;">${escapeHtml(it.pgno_text)}</div>
        </div>
      `;
    }).join(""));
  }

  // -------- List filters --------
  function applyLocalFilters(){
    const term = safeStr($("searchInput")?.value).toLowerCase().trim();
    const status = safeStr($("statusFilter")?.value).trim();
    const version = safeStr($("versionFilter")?.value).trim();
    const source = safeStr($("sourceFilter")?.value).trim();

    filteredRows = allRows.filter(r => {
      if (status && safeStr(r.status) !== status) return false;
      if (version && safeStr(r.version) !== version) return false;
      if (source && source !== "ALL" && safeStr(r.source_type) !== source) return false;

      if (!term) return true;

      const p = r.payload || {};
      const hay = [
        formatFull(r),
        safeStr(r.number_base),
        safeStr(r.source_type),
        safeStr(r.version),
        pGet(p, "Short Text"),
        pGet(p, "Question"),
      ].join(" ").toLowerCase();

      return hay.includes(term);
    });

    filteredRows.sort((a,b) => formatFull(a).localeCompare(formatFull(b), "en", { numeric:true }));
    renderList();
    setText("countLine", `${filteredRows.length} questions`);
  }

  function renderList(){
    const list = $("qList");
    if (!list) return;

    list.innerHTML = "";

    if (!filteredRows.length){
      list.innerHTML = `<div class="muted" style="padding:12px;">No questions match the filters.</div>`;
      return;
    }

    for (const r of filteredRows){
      const div = document.createElement("div");
      div.className = "qitem" + (selectedRow && selectedRow.id === r.id ? " active" : "");

      const p = r.payload || {};
      const no = formatFull(r) || "(no number)";
      const shortT = pGet(p, "Short Text") || "(no short text)";
      const meta = `${safeStr(r.source_type)} • ${safeStr(r.status)} • ${safeStr(r.version)}`;

      div.innerHTML = `
        <div class="qno">${escapeHtml(no)}</div>
        <div class="qsub">${escapeHtml(shortT)}</div>
        <div class="qmeta">${escapeHtml(meta)}</div>
      `;

      div.onclick = () => selectRow(r.id);
      list.appendChild(div);
    }
  }

  // -------- View/Edit mode rendering --------
  function setEditMode(on){
    isEditMode = !!on;

    setShow("viewMode", !isEditMode);
    setShow("editMode", isEditMode);

    setShow("btnSave", isEditMode);
    setShow("btnReset", isEditMode);

    // Edit button toggles label
    if ($("btnEdit")) $("btnEdit").textContent = isEditMode ? "View" : "Edit";

    // Disable all edit controls if cannot edit
    const disable = !canEdit;
    const ids = ["eSourceType","eStatus","eVersion","eTags","eNumberBase","eNumberSuffix","eShortText","eQuestion","eGuidance","eActions","eRawPayload"];
    for (const id of ids){
      const el = $(id);
      if (el) el.disabled = disable;
    }
    if ($("btnSave")) $("btnSave").disabled = !canEdit;
    if ($("btnReset")) $("btnReset").disabled = !canEdit;
  }

  function fillViewFromRow(r){
    const p = r.payload || {};
    setText("hdrNumber", formatFull(r));
    setText("hdrId", r.__isNew ? "Not saved yet" : `DB id: ${r.id}`);

    setText("pillSource", `source: ${safeStr(r.source_type)}`);
    setText("pillStatus", `status: ${safeStr(r.status)}`);
    setText("pillVersion", `version: ${safeStr(r.version)}`);
    setText("pillSuffix", `suffix: ${safeStr(r.number_suffix) || "(none)"}`);

    setText("vShortText", pGet(p, "Short Text"));
    setText("vQuestion", pGet(p, "Question"));
    setText("vGuidance", pGet(p, "Inspection Guidance"));
    setText("vActions", pGet(p, "Suggested Inspector Actions"));
  }

  function fillEditFromRow(r){
    const p = r.payload || {};
    setVal("eSourceType", safeStr(r.source_type) || "COMPANY");
    setVal("eStatus", safeStr(r.status) || "active");
    setVal("eVersion", safeStr(r.version) || "SIRE_2_0_QL");
    setVal("eTags", Array.isArray(r.tags) ? r.tags.join(", ") : safeStr(r.tags));
    setVal("eNumberBase", safeStr(r.number_base));
    setVal("eNumberSuffix", safeStr(r.number_suffix));

    // canonical keys
    setVal("eShortText", pGet(p, "Short Text"));
    setVal("eQuestion", pGet(p, "Question"));
    setVal("eGuidance", pGet(p, "Inspection Guidance"));
    setVal("eActions", pGet(p, "Suggested Inspector Actions"));

    // Raw payload
    try{
      setVal("eRawPayload", JSON.stringify(p, null, 2));
    }catch(_e){
      setVal("eRawPayload", "{}");
    }
  }

  function buildPayloadFromEdit(){
    // Start from raw payload JSON
    const raw = safeStr($("eRawPayload")?.value).trim();
    let p = {};
    if (raw){
      try{
        p = JSON.parse(raw);
      }catch(e){
        throw new Error("Raw Payload JSON is invalid. Fix it before saving.");
      }
    }

    // Force canonical keys from form (do not delete other keys)
    p.short_text = safeStr($("eShortText")?.value);
    p.question = safeStr($("eQuestion")?.value);
    p.inspection_guidance = safeStr($("eGuidance")?.value);
    p.suggested_inspector_actions = safeStr($("eActions")?.value);

    return p;
  }

  // -------- Select row --------
  async function selectRow(id){
    showWarn(""); showOk("");

    const r = filteredRows.find(x => x.id === id) || allRows.find(x => x.id === id);
    if (!r) return;

    selectedRow = JSON.parse(JSON.stringify(r));
    selectedRow.__isNew = false;

    originalRow = JSON.parse(JSON.stringify(selectedRow));

    setShow("emptyState", false);
    setShow("panel", true);

    fillViewFromRow(selectedRow);
    fillEditFromRow(selectedRow);

    // Default to view mode
    setEditMode(false);

    // Evidence + PGNO (read-only view)
    try{
      const ev = await fetchEvidence(selectedRow.id);
      renderEvidenceViewer(ev);
    }catch(e){
      setHtml("vEvidence", `<div class="muted">Evidence items could not be loaded.</div>`);
      showWarn("Evidence load failed:\n\n" + String(e?.message || e));
    }

    try{
      const pg = await fetchPgno(selectedRow.id);
      renderPgnoViewer(pg);
    }catch(e){
      setHtml("vPgno", `<div class="muted">PGNO items could not be loaded.</div>`);
      showWarn("PGNO load failed:\n\n" + String(e?.message || e));
    }

    await loadPhotosForSelected();
    renderList();
  }

  // -------- New question --------
  function newQuestion(){
    showWarn(""); showOk("");

    const versionFromFilter = safeStr($("versionFilter")?.value).trim();

    selectedRow = {
      __isNew: true,
      id: null,
      source_type: "COMPANY",
      status: "active",
      version: versionFromFilter || "SIRE_2_0_QL",
      tags: [],
      number_base: "",
      number_suffix: SUFFIX_BY_SOURCE.COMPANY,
      payload: {
        short_text: "",
        question: "",
        inspection_guidance: "",
        suggested_inspector_actions: "",
      },
    };

    originalRow = JSON.parse(JSON.stringify(selectedRow));

    setShow("emptyState", false);
    setShow("panel", true);

    fillViewFromRow(selectedRow);
    fillEditFromRow(selectedRow);

    // Clear evidence/pgno displays (new question has no id yet)
    setHtml("vEvidence", `<div class="muted">Save the question first to manage evidence items.</div>`);
    setHtml("vPgno", `<div class="muted">Save the question first to manage PGNO items.</div>`);

    // Clear photos panel
    const grid = $("photoGrid");
    if (grid) grid.innerHTML = "";
    setText("photoCountLine", "Save the question first to attach photos.");
    setPhotoStatus("");

    // Jump to edit mode automatically
    setEditMode(true);

    // Auto-suffix behavior on new question when source changes
    $("eSourceType")?.addEventListener("change", () => {
      if (!selectedRow?.__isNew) return;
      const st = safeStr($("eSourceType")?.value);
      const auto = SUFFIX_BY_SOURCE[st] ?? "";
      setVal("eNumberSuffix", auto);
    }, { once:false });
  }

  // -------- Save / Reset --------
  async function saveSelected(){
    if (!selectedRow) return;
    if (!canEdit){
      showWarn("You do not have permission to edit/save questions.");
      return;
    }

    showWarn(""); showOk("");

    try{
      const source_type = safeStr($("eSourceType")?.value).trim() || "COMPANY";
      const status = safeStr($("eStatus")?.value).trim() || "active";
      const version = safeStr($("eVersion")?.value).trim() || "SIRE_2_0_QL";
      const number_base = safeStr($("eNumberBase")?.value).trim();
      const number_suffix = safeStr($("eNumberSuffix")?.value).trim();

      if (!number_base){
        throw new Error("Number Base is required (e.g. 10.01.01).");
      }

      const tagsCsv = safeStr($("eTags")?.value).trim();
      const tags = tagsCsv ? tagsCsv.split(",").map(s => s.trim()).filter(Boolean) : [];

      const payload = buildPayloadFromEdit();

      const row = {
        source_type,
        status,
        version,
        tags,
        number_base,
        number_suffix,
        payload,
        updated_by: bundle?.session?.user?.id || null,
      };

      if (selectedRow.__isNew){
        row.created_by = bundle?.session?.user?.id || null;

        // IMPORTANT: do not send number_full (DB generates it)
        const { data, error } = await sb
          .from("questions_master")
          .insert(row)
          .select("id, source_type, number_full, number_base, number_suffix, status, version, tags, payload")
          .single();

        if (error) throw error;

        showOk("Saved new question.");
        await loadQuestionsFromDb();

        // Select saved row
        const saved = allRows.find(x => x.id === data.id);
        if (saved) await selectRow(saved.id);

      } else {
        const { error } = await sb
          .from("questions_master")
          .update(row)
          .eq("id", selectedRow.id);

        if (error) throw error;

        showOk("Saved changes.");
        await loadQuestionsFromDb();

        // Re-select
        const updated = allRows.find(x => x.id === selectedRow.id);
        if (updated) await selectRow(updated.id);
      }

      setEditMode(false);
    }catch(e){
      showWarn("Save failed:\n\n" + String(e?.message || e));
    }
  }

  function resetSelected(){
    if (!canEdit) return;
    if (!originalRow) return;

    selectedRow = JSON.parse(JSON.stringify(originalRow));
    fillViewFromRow(selectedRow);
    fillEditFromRow(selectedRow);
    showOk("Edits reverted (not saved).");
  }

  // -------- DB load --------
  async function loadQuestionsFromDb(){
    showWarn(""); showOk("");
    setText("loadHint", "Loading…");

    const status = safeStr($("statusFilter")?.value).trim();
    const version = safeStr($("versionFilter")?.value).trim();
    const source = safeStr($("sourceFilter")?.value).trim();

    try{
      let q = sb
        .from("questions_master")
        .select("id, source_type, number_full, number_base, number_suffix, status, version, tags, payload")
        .order("number_base", { ascending:true });

      if (status) q = q.eq("status", status);
      if (version) q = q.eq("version", version);
      if (source && source !== "ALL") q = q.eq("source_type", source);

      const { data, error } = await q;
      if (error) throw error;

      allRows = data || [];
      setText("loadHint", `Loaded ${allRows.length}`);
      applyLocalFilters();

      if (allRows.length){
        await selectRow(allRows[0].id);
      }else{
        selectedRow = null;
        originalRow = null;
        setShow("panel", false);
        setShow("emptyState", true);
      }
    }catch(e){
      setText("loadHint", "");
      showWarn("Failed to load questions from DB:\n\n" + String(e?.message || e));
    }
  }

  // -------- Photos --------
  function sanitizeFileName(name){
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

  function setPhotoStatus(msg){ const el=$("photoStatus"); if(el) el.textContent = msg || ""; }
  function showPhotoWarn(msg){
    const el = $("photoWarn");
    if (!el) return;
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  }

  function storagePathFor(questionId, file){
    const safe = sanitizeFileName(file?.name || "image.jpg");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    return `questions/${questionId}/${ts}_${safe}`;
  }

  async function uploadSelectedPhotos(){
    showPhotoWarn("");

    if (!selectedRow?.id){
      showPhotoWarn("Save the question first, then upload photos.");
      return;
    }
    if (!canManagePhotos){
      showPhotoWarn("Upload not allowed for your role (admins only).");
      return;
    }

    const fileEl = $("photoFile");
    const files = fileEl?.files ? Array.from(fileEl.files) : [];
    if (!files.length){
      showPhotoWarn("Please choose one or more image files first.");
      return;
    }

    const MAX_MB = 10;
    for (const f of files){
      if (f.size > MAX_MB * 1024 * 1024){
        showPhotoWarn(`File too large: ${f.name}\nMax allowed: ${MAX_MB}MB.`);
        return;
      }
    }

    setPhotoStatus(`Uploading ${files.length} file(s)…`);

    try{
      for (let i=0;i<files.length;i++){
        const file = files[i];
        setPhotoStatus(`Uploading ${i+1}/${files.length}: ${file.name}`);

        const path = storagePathFor(selectedRow.id, file);

        const up = await sb.storage.from(PHOTO_BUCKET).upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
        if (up.error) throw up.error;

        const ins = await sb.from("question_photos").insert({
          question_id: selectedRow.id,
          file_path: path,
          file_name: sanitizeFileName(file.name),
          mime_type: file.type || null,
          size_bytes: typeof file.size === "number" ? file.size : null,
          caption: "",
          uploaded_by: bundle?.session?.user?.id || null,
        });
        if (ins.error) throw ins.error;
      }

      setPhotoStatus("Upload completed.");
      if (fileEl) fileEl.value = "";
      await loadPhotosForSelected();
    }catch(e){
      setPhotoStatus("");
      showPhotoWarn("Upload failed:\n\n" + String(e?.message || e));
    }
  }

  async function loadPhotosForSelected(){
    showPhotoWarn("");

    const grid = $("photoGrid");
    const cntLine = $("photoCountLine");
    if (!grid || !cntLine) return;

    grid.innerHTML = "";
    cntLine.textContent = "";

    if (!selectedRow?.id){
      cntLine.textContent = "Save the question first to attach photos.";
      setPhotoStatus("");
      return;
    }

    setPhotoStatus("Loading photos…");

    try{
      const { data, error } = await sb
        .from("question_photos")
        .select("id, file_path, file_name, mime_type, size_bytes, caption, created_at")
        .eq("question_id", selectedRow.id)
        .order("created_at", { ascending:false });

      if (error) throw error;

      const rows = data || [];
      if (!rows.length){
        cntLine.textContent = "No photos attached to this question yet.";
        setPhotoStatus("");
        return;
      }

      for (const r of rows){
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
            <div class="small"><b>File:</b> ${escapeHtml(niceName)} ${niceSize ? `(${escapeHtml(niceSize)})` : ""}</div>
            <div class="small"><b>Uploaded:</b> ${escapeHtml(new Date(r.created_at).toLocaleString())}</div>
            <div class="small"><b>Path:</b> ${escapeHtml(r.file_path)}</div>
            <div class="photoBtns">
              ${publicUrl ? `<a class="btn light" href="${publicUrl}" target="_blank" rel="noopener">Open</a>` : ""}
              <button class="btn danger" type="button" data-photo-id="${r.id}" data-path="${r.file_path}">Delete</button>
            </div>
          </div>
        `;

        const delBtn = card.querySelector("button[data-photo-id]");
        if (delBtn){
          if (!canManagePhotos){
            delBtn.disabled = true;
            delBtn.title = "Not allowed (admins only).";
            delBtn.classList.remove("danger");
            delBtn.classList.add("light");
          }else{
            delBtn.onclick = async () => deletePhotoRowAndFile(delBtn.dataset.photoId, delBtn.dataset.path);
          }
        }

        grid.appendChild(card);
      }

      cntLine.textContent = `${rows.length} photo(s) attached to this question.`;
      setPhotoStatus("");
    }catch(e){
      setPhotoStatus("");
      showPhotoWarn("Failed to load photos:\n\n" + String(e?.message || e));
    }
  }

  async function deletePhotoRowAndFile(photoId, filePath){
    if (!confirm("Delete this photo?\n\nThis removes it from Storage and DB.")) return;

    try{
      setPhotoStatus("Deleting…");

      const rm = await sb.storage.from(PHOTO_BUCKET).remove([filePath]);
      if (rm.error) throw rm.error;

      const del = await sb.from("question_photos").delete().eq("id", photoId);
      if (del.error) throw del.error;

      setPhotoStatus("");
      await loadPhotosForSelected();
      showOk("Photo deleted.");
    }catch(e){
      setPhotoStatus("");
      showPhotoWarn("Delete failed:\n\n" + String(e?.message || e));
    }
  }

  // -------- Boot --------
  async function boot(){
    try{
      if (!window.AUTH){
        showWarn("AUTH helper not loaded (auth.js).");
        return;
      }
      sb = window.AUTH.ensureSupabase();

      $("backBtn")?.addEventListener("click", () => { location.href = "./q-dashboard.html"; });

      bundle = await window.AUTH.setupAuthButtons({
        badgeId: "userBadge",
        loginBtnId: "loginBtn",
        logoutBtnId: "logoutBtn",
        switchBtnId: "switchUserBtn"
      });

      if (!bundle?.session?.user){
        showWarn("You are logged out. Please Login.");
        setText("modeLine", "Access denied (not logged in).");
        return;
      }

      role = safeStr(bundle?.profile?.role);
      const R = window.AUTH.ROLES;

      const isSuper = role === R.SUPER_ADMIN;
      const isCompanyAdmin = role === R.COMPANY_ADMIN;
      const isCompanySup = role === R.COMPANY_SUPERINTENDENT;

      if (!(isSuper || isCompanyAdmin || isCompanySup)){
        showWarn("You do not have permission to access Questions Editor.");
        setText("modeLine", `Access denied for role: ${role || "(unknown)"}`);
        return;
      }

      canEdit = isSuper || isCompanyAdmin;
      canManagePhotos = isSuper || isCompanyAdmin;

      let modeLabel = canEdit ? "Admin" : "View";
      setText("modeLine", `Role: ${role} • Mode: ${modeLabel} • Module: QUESTIONS_EDITOR`);
      setShow("editorCard", true);

      // UI wiring
      $("reloadBtn")?.addEventListener("click", loadQuestionsFromDb);
      $("newQuestionBtn")?.addEventListener("click", () => {
        if (!canEdit){
          showWarn("You do not have permission to add new questions.");
          return;
        }
        newQuestion();
      });

      $("searchInput")?.addEventListener("input", applyLocalFilters);

      $("statusFilter")?.addEventListener("change", loadQuestionsFromDb);
      $("versionFilter")?.addEventListener("change", loadQuestionsFromDb);
      $("sourceFilter")?.addEventListener("change", loadQuestionsFromDb);

      $("btnEdit")?.addEventListener("click", () => {
        if (!canEdit){
          showWarn("You do not have permission to edit questions.");
          return;
        }
        setEditMode(!isEditMode);
      });

      $("btnSave")?.addEventListener("click", saveSelected);
      $("btnReset")?.addEventListener("click", resetSelected);

      $("btnRefreshPhotos")?.addEventListener("click", loadPhotosForSelected);
      $("btnUploadPhotos")?.addEventListener("click", uploadSelectedPhotos);

      // enforce permissions on edit button and add new button
      if ($("btnEdit")) $("btnEdit").disabled = !canEdit;
      if ($("newQuestionBtn")) $("newQuestionBtn").disabled = !canEdit;

      // enforce permissions on upload controls
      if ($("photoFile")) $("photoFile").disabled = !canManagePhotos;
      if ($("btnUploadPhotos")) $("btnUploadPhotos").disabled = !canManagePhotos;
      if (!canManagePhotos){
        setPhotoStatus("Upload/Delete: admins only. Viewing enabled.");
      }

      await loadQuestionsFromDb();
    }catch(e){
      showWarn("Boot failed:\n\n" + String(e?.message || e));
    }
  }

  boot();
})();
