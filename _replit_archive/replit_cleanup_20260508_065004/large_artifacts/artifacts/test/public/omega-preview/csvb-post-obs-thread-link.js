// public/csvb-post-obs-thread-link.js
// C.S.V. BEACON — Create Thread link from Post-Inspection Observation Detail.
// Separate file. Does not change existing observation logic.

(() => {
  "use strict";

  const BUILD = "T9-POST-OBS-THREAD-LINK-2026-05-05";

  function el(id) {
    return document.getElementById(id);
  }

  function value(id) {
    const x = el(id);
    return String(x?.value || x?.textContent || "").trim();
  }

  function extractQuestionNo() {
    const label = value("obsQuestionLabel");
    const direct = label.match(/\b\d{1,2}\.\d{1,2}\.\d{1,2}\b/);
    if (direct) return direct[0];

    const url = new URLSearchParams(window.location.search);
    return url.get("question_no") || "";
  }

  function selectedPgnoText() {
    const area = el("pgnoSelectorArea");
    if (!area) return "";

    const checked = Array.from(area.querySelectorAll("input:checked, option:checked"))
      .map((x) => {
        const row = x.closest("label, .pgno, .pgno-row, div");
        return String(row?.innerText || x.value || "").trim();
      })
      .filter(Boolean);

    if (checked.length) return checked.join("\n");

    return "";
  }

  function buildInitialMessage() {
    const qno = extractQuestionNo();
    const questionText = value("questionFullField");
    const obsText = value("supportingCommentField");
    const soc = value("socField");
    const noc = value("nocField");
    const type = value("obsTypeBadge");
    const category = value("obsCategoryLabel");
    const pgno = selectedPgnoText();

    return [
      "Thread opened from Post-Inspection Observation Detail.",
      "",
      type ? `Observation type: ${type}` : "",
      category ? `Category: ${category}` : "",
      qno ? `Question: ${qno}` : "",
      questionText ? `Question text:\n${questionText}` : "",
      soc ? `SOC:\n${soc}` : "",
      noc ? `NOC:\n${noc}` : "",
      obsText ? `Observation / supporting comment:\n${obsText}` : "",
      pgno ? `Selected PGNO:\n${pgno}` : ""
    ].filter(Boolean).join("\n");
  }

  function createThreadUrl() {
    const qno = extractQuestionNo();
    const questionText = value("questionFullField");
    const obsText = value("supportingCommentField");
    const pgno = selectedPgnoText();

    const title = qno
      ? `Post-inspection observation — Q ${qno}`
      : "Post-inspection observation thread";

    const params = new URLSearchParams({
      source: "post_inspection_observation",
      question_no: qno,
      question_text: questionText,
      pgno_text: pgno,
      observation_text: obsText,
      title,
      initial_message: buildInitialMessage()
    });

    const current = new URLSearchParams(window.location.search);
    for (const [k, v] of current.entries()) {
      if (!params.has("origin_" + k)) params.set("origin_" + k, v);
    }

    return "./threads.html?" + params.toString();
  }

  function addButton() {
    if (el("createObservationThreadBtn")) return;

    const saveRow = document.querySelector(".save-row");
    if (!saveRow) return;

    const btn = document.createElement("button");
    btn.className = "btn btn-muted";
    btn.type = "button";
    btn.id = "createObservationThreadBtn";
    btn.textContent = "Create Thread";
    btn.setAttribute("data-csvb-help", "Open Threads and prefill this post-inspection observation as a discussion thread.");
    btn.setAttribute("title", "Open Threads and prefill this post-inspection observation as a discussion thread.");

    btn.addEventListener("click", () => {
      window.location.href = createThreadUrl();
    });

    saveRow.appendChild(btn);
  }

  function init() {
    window.CSVB_POST_OBS_THREAD_LINK_BUILD = BUILD;
    addButton();
    setTimeout(addButton, 800);
    setTimeout(addButton, 1800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
