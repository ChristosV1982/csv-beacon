// public/q-questions-editor.js
(() => {
  "use strict";

  // This module provides:
  //   window.loadPhotosForSelected(questionId)
  //   window.uploadSelectedPhotos(questionId)
  //
  // It relies on:
  //   window.AUTH.ensureSupabase()
  //   window.PHOTO_BUCKET (optional, default "question-photos")
  //   window.CAN_MANAGE_PHOTOS (boolean)
  //   window.showPhotoWarn(msg) / window.setPhotoStatus(msg) (optional)

  const sb = window.AUTH?.ensureSupabase?.();
  if (!sb) {
    console.error("q-questions-editor.js: AUTH.ensureSupabase() not available.");
    return;
  }

  const BUCKET = window.PHOTO_BUCKET || "question-photos";

  function $(id) { return document.getElementById(id); }

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

  function showWarn(msg) {
    if (typeof window.showPhotoWarn === "function") return window.showPhotoWarn(msg);
    const el = $("photoWarn");
    if (!el) return;
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  }

  function setStatus(msg) {
    if (typeof window.setPhotoStatus === "function") return window.setPhotoStatus(msg);
    const el = $("photoStatus");
    if (!el) return;
    el.textContent = msg || "";
  }

  function storagePathFor(questionId, file) {
    const safe = sanitizeFileName(file?.name || "image.jpg");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    return `questions/${questionId}/${ts}_${safe}`;
  }

  async function loadPhotos(questionId) {
    showWarn("");

    const grid = $("photoGrid");
    const cntLine = $("photoCountLine");

    if (!grid || !cntLine) return;

    grid.innerHTML = "";
    cntLine.textContent = "";

    if (!questionId) {
      cntLine.textContent = "Select a saved question to view photos.";
      setStatus("");
      return;
    }

    setStatus("Loading photos…");

    try {
      const { data, error } = await sb
        .from("question_photos")
        .select("id, file_path, file_name, mime_type, size_bytes, caption, created_at")
        .eq("question_id", questionId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = data || [];
      if (!rows.length) {
        cntLine.textContent = "No photos attached to this question yet.";
        setStatus("");
        return;
      }

      for (const r of rows) {
        const publicUrl = sb.storage.from(BUCKET).getPublicUrl(r.file_path).data?.publicUrl || "";

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
            <div class="small"><b>Path:</b> ${safeStr(r.file_path)}</div>
            <div class="photoBtns">
              ${publicUrl ? `<a class="btn light" href="${publicUrl}" target="_blank" rel="noopener">Open</a>` : ""}
              <button class="btn danger" type="button" data-photo-id="${r.id}" data-path="${r.file_path}">Delete</button>
            </div>
          </div>
        `;

        const delBtn = card.querySelector("button[data-photo-id]");
        if (delBtn) {
          if (!window.CAN_MANAGE_PHOTOS) {
            delBtn.disabled = true;
            delBtn.title = "Not allowed (admins only).";
            delBtn.classList.remove("danger");
            delBtn.classList.add("light");
          } else {
            delBtn.onclick = async () => deletePhotoRowAndFile(questionId, delBtn.dataset.photoId, delBtn.dataset.path);
          }
        }

        grid.appendChild(card);
      }

      cntLine.textContent = `${rows.length} photo(s) attached to this question.`;
      setStatus("");
    } catch (e) {
      setStatus("");
      showWarn("Failed to load photos:\n\n" + (e?.message || String(e)));
    }
  }

  async function uploadPhotos(questionId) {
    showWarn("");

    if (!questionId) {
      showWarn("Save/select the question first, then upload photos.");
      return;
    }
    if (!window.CAN_MANAGE_PHOTOS) {
      showWarn("Upload not allowed for your role (admins only).");
      return;
    }

    const input = $("photoFile");
    const files = input?.files ? Array.from(input.files) : [];

    if (!files.length) {
      showWarn("Please choose one or more image files first.");
      return;
    }

    const MAX_MB = 10;
    for (const f of files) {
      if (f.size > MAX_MB * 1024 * 1024) {
        showWarn(`File too large: ${f.name}\nMax allowed: ${MAX_MB}MB.`);
        return;
      }
    }

    setStatus(`Uploading ${files.length} file(s)…`);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatus(`Uploading ${i + 1}/${files.length}: ${file.name}`);

        const path = storagePathFor(questionId, file);

        // 1) storage upload
        const up = await sb.storage.from(BUCKET).upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
        if (up.error) throw up.error;

        // 2) DB insert (file_name is NOT NULL)
        const ins = await sb.from("question_photos").insert({
          question_id: questionId,
          file_path: path,
          file_name: sanitizeFileName(file.name),
          mime_type: file.type || null,
          size_bytes: typeof file.size === "number" ? file.size : null,
          caption: "",
        });
        if (ins.error) throw ins.error;
      }

      setStatus("Upload completed.");
      if (input) input.value = "";
      await loadPhotos(questionId);
    } catch (e) {
      setStatus("");
      showWarn("Upload failed:\n\n" + (e?.message || String(e)));
    }
  }

  async function deletePhotoRowAndFile(questionId, photoId, filePath) {
    if (!window.CAN_MANAGE_PHOTOS) return;
    if (!confirm("Delete this photo?\n\nThis removes it from Storage and DB.")) return;

    try {
      setStatus("Deleting…");

      const rm = await sb.storage.from(BUCKET).remove([filePath]);
      if (rm.error) throw rm.error;

      const del = await sb.from("question_photos").delete().eq("id", photoId);
      if (del.error) throw del.error;

      setStatus("");
      await loadPhotos(questionId);
    } catch (e) {
      setStatus("");
      showWarn("Delete failed:\n\n" + (e?.message || String(e)));
    }
  }

  // Export API expected by the HTML
  window.loadPhotosForSelected = loadPhotos;
  window.uploadSelectedPhotos = uploadPhotos;
})();
