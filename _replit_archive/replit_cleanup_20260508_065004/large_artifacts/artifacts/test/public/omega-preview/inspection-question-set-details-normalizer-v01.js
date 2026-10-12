// public/inspection-question-set-details-normalizer-v01.js
// C.S.V. BEACON - Assurance Question Set Details Normalizer v01
// Removes raw source JSON from the UI and normalizes question details into closed-by-default sections.

(() => {
  "use strict";

  const BUILD = "ASSURANCE-QS-DETAILS-NORMALIZER-V01-20260602";

  const s = (v) => v === null || v === undefined ? "" : String(v);
  const esc = (v) => s(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function textify(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(textify).filter(Boolean).join("\n");
    if (typeof value === "object") {
      try { return JSON.stringify(value, null, 2); } catch { return String(value); }
    }
    return String(value);
  }

  function normalKey(key) {
    return s(key).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function addValue(target, label, value) {
    const out = textify(value).trim();
    if (!out) return;
    const normalized = out.replace(/\s+/g, " ").trim();
    const duplicate = target.some(x =>
      x.label === label &&
      x.value.replace(/\s+/g, " ").trim() === normalized
    );
    if (!duplicate) target.push({ label, value: out });
  }

  function parseRawJson(detailsNode) {
    const rawNodes = Array.from(detailsNode.querySelectorAll(".q-detail-raw pre, .csvb-picker-raw pre"));
    const parsed = [];

    for (const pre of rawNodes) {
      const txt = s(pre.textContent).trim();
      if (!txt) continue;
      try {
        parsed.push(JSON.parse(txt));
      } catch {
        // Raw block exists but is not valid JSON. We still remove it from UI.
      }
    }

    return parsed;
  }

  function walkObject(obj, visitor, path = []) {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      obj.forEach((value, index) => walkObject(value, visitor, path.concat(String(index))));
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      const nextPath = path.concat(key);
      visitor(key, value, nextPath);
      if (value && typeof value === "object") walkObject(value, visitor, nextPath);
    }
  }

  function collectFromRaw(rawObjects) {
    const groups = {
      expected: [],
      pgno: [],
      guidance: [],
      references: [],
      attributes: []
    };

    for (const obj of rawObjects) {
      walkObject(obj, (key, value, path) => {
        if (value && typeof value === "object") return;

        const nk = normalKey(key);
        const pathLabel = path.filter(Boolean).join(" / ");
        const label = pathLabel || key;

        if (
          nk.includes("pgno") ||
          (nk.includes("potential") && nk.includes("negative")) ||
          (nk.includes("ground") && nk.includes("negative")) ||
          nk.includes("negativeobservation")
        ) {
          addValue(groups.pgno, label, value);
          return;
        }

        if (nk.includes("expected") && nk.includes("evidence")) {
          addValue(groups.expected, label, value);
          return;
        }

        if (
          nk.includes("guidance") ||
          nk.includes("guidetoinspection") ||
          nk.includes("suggestedinspectoraction") ||
          nk.includes("inspectoraction")
        ) {
          addValue(groups.guidance, label, value);
          return;
        }

        if (
          nk.includes("esms") ||
          nk.includes("smsref") ||
          nk.includes("reference") ||
          nk.includes("form") ||
          nk.includes("remark") ||
          nk.includes("tmsa")
        ) {
          addValue(groups.references, label, value);
          return;
        }

        if (
          nk.includes("questiontype") ||
          nk.includes("questionorigin") ||
          nk.includes("responsetype") ||
          nk.includes("answertype") ||
          nk.includes("answeroption") ||
          nk.includes("vesseltype") ||
          nk.includes("rankallocation") ||
          nk.includes("roviq") ||
          nk.includes("risq") ||
          nk === "chapter" ||
          nk === "section" ||
          nk.includes("section")
        ) {
          addValue(groups.attributes, label, value);
        }
      });
    }

    return groups;
  }

  function collectExistingFields(detailsNode) {
    const groups = {
      expected: [],
      pgno: [],
      guidance: [],
      references: [],
      attributes: []
    };

    const fields = Array.from(detailsNode.querySelectorAll(
      ".q-detail-field, .csvb-picker-detail-field"
    ));

    for (const field of fields) {
      const labelNode = field.querySelector(".q-detail-label, .csvb-picker-detail-label");
      const valueNode = field.querySelector(".q-detail-value, .csvb-picker-detail-value");

      const label = s(labelNode?.textContent).trim();
      const value = s(valueNode?.textContent).trim();

      if (!label || !value) continue;

      const l = label.toLowerCase();

      if (l.includes("pgno") || l.includes("negative observation")) {
        addValue(groups.pgno, label, value);
      } else if (l.includes("expected")) {
        addValue(groups.expected, label, value);
      } else if (l.includes("guidance") || l.includes("suggested")) {
        addValue(groups.guidance, label, value);
      } else if (
        l.includes("reference") ||
        l.includes("form") ||
        l.includes("remark") ||
        l.includes("esms") ||
        l.includes("tmsa")
      ) {
        addValue(groups.references, label, value);
      } else {
        addValue(groups.attributes, label, value);
      }
    }

    return groups;
  }

  function mergeGroups(a, b) {
    const out = {
      expected: [],
      pgno: [],
      guidance: [],
      references: [],
      attributes: []
    };

    for (const key of Object.keys(out)) {
      for (const item of [...(a[key] || []), ...(b[key] || [])]) {
        addValue(out[key], item.label, item.value);
      }
    }

    return out;
  }

  function renderItems(items) {
    if (!items.length) {
      return `<div class="csvb-detail-empty">No stored details found for this section.</div>`;
    }

    return items.map(item => `
      <div class="csvb-detail-field">
        <div class="csvb-detail-label">${esc(item.label)}</div>
        <div class="csvb-detail-value">${esc(item.value)}</div>
      </div>
    `).join("");
  }

  function renderSection(title, items, extraClass = "") {
    return `
      <details class="csvb-detail-toggle ${extraClass}">
        <summary>${esc(title)}</summary>
        <div class="csvb-detail-body">
          ${renderItems(items)}
        </div>
      </details>
    `;
  }

  function normalizeDetailsNode(detailsNode) {
    if (!detailsNode || detailsNode.dataset.csvbNormalized === "1") return;

    detailsNode.removeAttribute("open");

    const rawObjects = parseRawJson(detailsNode);
    const fromRaw = collectFromRaw(rawObjects);
    const fromExisting = collectExistingFields(detailsNode);
    const groups = mergeGroups(fromExisting, fromRaw);

    detailsNode.querySelectorAll(".q-detail-raw, .csvb-picker-raw").forEach(n => n.remove());

    const summaryText = detailsNode.matches(".csvb-picker-more")
      ? "More question information"
      : "More question information";

    const bodyClass = detailsNode.matches(".csvb-picker-more")
      ? "csvb-picker-more-body"
      : "q-detail-body";

    detailsNode.innerHTML = `
      <summary>${esc(summaryText)}</summary>
      <div class="${bodyClass}">
        <div class="csvb-detail-section-stack">
          ${renderSection("Expected Evidence", groups.expected)}
          ${renderSection("PGNOs / Potential Grounds for Negative Observation", groups.pgno, "csvb-detail-pgno")}
          ${renderSection("Inspection Guidance / Suggested Inspector Actions", groups.guidance)}
          ${renderSection("eSMS / Company References, Forms & Remarks", groups.references)}
          ${renderSection("Question Attributes / Response Setup", groups.attributes)}
        </div>
      </div>
    `;

    detailsNode.removeAttribute("open");
    detailsNode.querySelectorAll("details").forEach(d => d.removeAttribute("open"));
    detailsNode.dataset.csvbNormalized = "1";
  }

  function removeRawTextFallback() {
    document.querySelectorAll(".q-detail-raw, .csvb-picker-raw").forEach(n => n.remove());

    Array.from(document.querySelectorAll("summary")).forEach(summary => {
      if (s(summary.textContent).trim().toLowerCase() === "raw source details") {
        const parent = summary.closest("details");
        if (parent) parent.remove();
      }
    });
  }

  function normalizeAll() {
    injectStyle();

    document
      .querySelectorAll(".q-detail-toggle, .csvb-picker-more")
      .forEach(normalizeDetailsNode);

    document
      .querySelectorAll(".q-detail-toggle, .csvb-picker-more, .csvb-detail-toggle")
      .forEach(d => d.removeAttribute("open"));

    removeRawTextFallback();

    window.CSVB_INSPECTION_QS_DETAILS_NORMALIZER = {
      build: BUILD,
      loaded: true,
      rawVisible: document.body.innerText.includes("Raw source details"),
      detailBlocks: document.querySelectorAll(".q-detail-toggle, .csvb-picker-more, .csvb-detail-toggle").length,
      openDetails: document.querySelectorAll(".q-detail-toggle[open], .csvb-picker-more[open], .csvb-detail-toggle[open]").length
    };
  }

  function injectStyle() {
    if (document.getElementById("csvbQuestionDetailsNormalizerStyle")) return;

    const style = document.createElement("style");
    style.id = "csvbQuestionDetailsNormalizerStyle";
    style.textContent = `
      .csvb-detail-section-stack{
        display:grid;
        grid-template-columns:1fr;
        gap:7px;
      }

      .csvb-detail-toggle{
        border:1px solid #d5deef;
        border-radius:10px;
        background:#f7fbff;
        overflow:hidden;
      }

      .csvb-detail-toggle > summary{
        cursor:pointer;
        padding:7px 9px;
        font-weight:650;
        color:#06305c;
      }

      .csvb-detail-toggle[open] > summary{
        border-bottom:1px solid #d5deef;
      }

      .csvb-detail-body{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:8px;
        padding:8px 9px;
        background:#fff;
      }

      .csvb-detail-field{
        border:1px solid #e1eaf7;
        border-radius:9px;
        background:#fbfdff;
        padding:7px;
      }

      .csvb-detail-label{
        font-size:.76rem;
        font-weight:700;
        color:#48628e;
        margin-bottom:3px;
      }

      .csvb-detail-value{
        font-size:.84rem;
        color:#173a68;
        line-height:1.35;
        white-space:pre-wrap;
      }

      .csvb-detail-empty{
        border:1px dashed #d5deef;
        border-radius:9px;
        background:#fbfdff;
        color:#48628e;
        padding:7px;
        font-size:.84rem;
      }

      @media(max-width:900px){
        .csvb-detail-body{
          grid-template-columns:1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  let scheduled = false;

  function scheduleNormalize() {
    if (scheduled) return;
    scheduled = true;

    window.requestAnimationFrame(() => {
      scheduled = false;
      normalizeAll();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleNormalize, { once: true });
  } else {
    scheduleNormalize();
  }

  const observer = new MutationObserver(scheduleNormalize);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
