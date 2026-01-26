// public/q-questions-editor.js
// Purpose: Fix Question Photos upload by ensuring DB insert includes NOT NULL fields (file_name).
// This file is designed to be loaded AFTER the big inline <script> in q-questions-editor.html,
// so it can override the existing functions in that page without rewriting the 1224-line file.

(function () {
  // Basic guards (do not crash the page if loaded too early)
  if (!window.AUTH || typeof window.AUTH.ensureSupabase !== "function") {
    console.error("[q-questions-editor.js] AUTH.ensureSupabase not found. Ensure auth.js loads first.");
    return;
  }

  // Reuse the same client pattern
  const sb = window.AUTH.ensureSupabase();

  // Use the same bucket constant if defined, else fallback
  const PHOTO_BUCKET = window.PHOTO_BUCKET || "question-photos";

  function safeStr(v) {
    return v === null || v === undefined ? "" : String(v);
  }

  function sanitizeFileName(name) {
    // Ensure file_name is NEVER null/empty for DB NOT NULL constraint.
    // Also prevents path tricks.
    const n = safeStr(name).trim();
    if (!n) return "file";
    return n
      .replaceAll("\\", "_")
      .replaceAll("/", "_")
      .replaceAll("..", "_")
      .replace(/[^\w.\-() ]+/g, "_")
      .trim() || "file";
  }

  function getSelectedQuestionId() {
    // Your page uses global 'selected' object in inline script
    // selected.id is the question_id (uuid) in questions_master.
    if (window.selected && window.selected.id) return String(window.selected.id);
    return "";
  }

  function getPhotoInputFiles() {
    const input = document.getElementById("photoFile");
    return input?.files ? Array.from(input.files) : [];
  }

  function clearPhotoInput() {
    const input = document.getElementById("photoFile");
    if (input) input.value = "";
  }

  // We will reuse your existing UI helpers if present
  function showPhotoWarn(msg) {
    if (typeof window.showPhotoWarn === "function") return window.showPhotoWarn(msg);
    const w = document.getElementById("photoWarn");
    if (!w) return alert(msg);
    w.textContent = msg || "";
    w.style.display = msg ? "block" : "none";
  }

  function setPhotoStatus(msg) {
    if (typeof window.setPhotoStatus === "function") return window.setPhotoStatus(msg);
    const el = document.getElementById("photoStatus");
    if (el) el.textContent = msg || "";
  }

  function canManagePhotos() {
    // Your inline script sets CAN_MANAGE_PHOTOS
    return !!window.CAN_MANAGE_PHOTOS;
  }

  // --- Override #1: uploadSelectedPhotos (FIX) ---
  async function uploadSelectedPhotos_FIXED() {
    showPhotoWarn("");

    const questionId = getSelectedQuestionId();
    if (!questionId) {
      showPhotoWarn("Select a question first.");
      return;
    }
    if (!canManagePhotos()) {
      showPhotoWarn("Upload not allowed for your role (admins only).");
      return;
    }

    const files = getPhotoInputFiles();
    if (!files.length) {
      showPhotoWarn("Please choose one or more image files first.");
      return;
    }

    // Optional client-side limit (same as your current logic)
    const MAX_MB = 10;
    for (const f of files) {
      if (f.size > MAX_MB * 1024 * 1024) {
        showPhotoWarn(`File too large: ${f.name}\nMax allowed (client-side): ${MAX_MB}MB.`);
        return;
      }
    }

    // Use your existing storagePathFor if it exists, otherwise fallback
    const storagePathFor =
      typeof window.storagePathFor === "function"
        ? window.storagePathFor
        : (qid, file) => {
            const safe = sanitizeFileName(file?.name || "image.jpg");
            const ts = new Date().toISOString().replace(/[:.]/g, "-");
            return `questions/${qid}/${ts}_${safe}`;
          };

    setPhotoStatus(`Uploading ${files.length} file(s)…`);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setPhotoStatus(`Uploading ${i + 1}/${files.length}: ${file.name}`);

        const path = storagePathFor(questionId, file);

        // 1) Storage upload
        const up = await sb.storage.from(PHOTO_BUCKET).upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
        if (up.error) throw up.error;

        // 2) DB insert (CRITICAL FIX: include file_name, mime_type, size_bytes)
        const fileName = sanitizeFileName(file.name);

        const ins = await sb.from("question_photos").insert({
          question_id: questionId,
          file_path: path,
          file_name: fileName,               // <-- FIX for NOT NULL
          mime_type: file.type || null,
          size_bytes: typeof file.size === "number" ? file.size : null,
          caption: "",
        });
        if (ins.error) throw ins.error;
      }

      setPhotoStatus("Upload completed.");
      clearPhotoInput();

      // Refresh using your loader if present
      if (typeof window.loadPhotosForSelected === "function") {
        await window.loadPhotosForSelected();
      } else {
        setPhotoStatus("");
      }
    } catch (e) {
      setPhotoStatus("");
      showPhotoWarn("Upload failed:\n\n" + String(e?.message || e));
    }
  }

  // --- Override #2 (optional but recommended): loadPhotosForSelected to show file_name ---
  async function loadPhotosForSelected_FIXED() {
    // If your original function does not fail, you can keep it.
    // This version selects extra columns and shows file_name more nicely.

    if (typeof window.showPhotoWarn === "function") window.showPhotoWarn("");
    else showPhotoWarn("");

    const grid = document.getElementById("photoGrid");
    const cntLine = document.getElementById("photoCountLine");
    if (!grid || !cntLine) return;

    grid.innerHTML = "";
    cntLine.textContent = "";

    const questionId = getSelectedQuestionId();
    if (!questionId) {
      cntLine.textContent = "No question selected.";
      return;
    }

    setPhotoStatus("Loading photos…");

    try {
      const { data, error } = await sb
        .from("question_photos")
        .select("id, question_id, file_path, file_name, mime_type, size_bytes, caption, created_at")
        .eq("question_id", questionId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = data || [];
      if (!rows.length) {
        cntLine.textContent = "No photos attached to this question yet.";
        setPhotoStatus("");
        return;
      }

      for (const r of rows) {
        const publicUrl =
          sb.storage.from(PHOTO_BUCKET).getPublicUrl(r.file_path).data?.publicUrl || "";

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
              <button class="btn danger" type="button" data-del-photo="1" data-photo-id="${r.id}" data-path="${r.file_path}">
                Delete
              </button>
            </div>
          </div>
        `;

        const delBtn = card.querySelector("button[data-del-photo]");
        if (delBtn) {
          if (!canManagePhotos()) {
            delBtn.disabled = true;
            delBtn.title = "Not allowed (admins only).";
            delBtn.classList.remove("danger");
            delBtn.classList.add("light");
          } else {
            delBtn.onclick = async () => {
              if (!confirm("Delete this photo?\n\nThis removes it from Storage and DB.")) return;

              // Reuse your existing delete function if defined
              if (typeof window.deletePhotoRowAndFile === "function") {
                await window.deletePhotoRowAndFile(
                  delBtn.getAttribute("data-photo-id"),
                  delBtn.getAttribute("data-path")
                );
              } else {
                showPhotoWarn("deletePhotoRowAndFile() is not available in the page.");
              }
            };
          }
        }

        grid.appendChild(card);
      }

      cntLine.textContent = `${rows.length} photo(s) attached to this question.`;
      setPhotoStatus("");
    } catch (e) {
      setPhotoStatus("");
      showPhotoWarn("Failed to load photos:\n\n" + String(e?.message || e));
    }
  }

  // --- Apply overrides ---
  window.uploadSelectedPhotos = uploadSelectedPhotos_FIXED;
  window.loadPhotosForSelected = loadPhotosForSelected_FIXED;

  console.log("[q-questions-editor.js] Photo module overrides loaded (file_name NOT NULL fix applied).");
})();
