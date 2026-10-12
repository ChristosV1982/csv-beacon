// public/company_policy_print_export.js
// C.S.V. BEACON – Company Policy Print / Export UI
// CP-9B: print/export selected item, selected item with children, or full published Policy Book.

(() => {
  "use strict";

  const BUILD = "CP9B-2026-05-07";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function showWarn(message) {
    const el = document.getElementById("warnBox");
    if (!el) {
      alert(message);
      return;
    }
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  function showOk(message) {
    const el = document.getElementById("okBox");
    if (!el) return;
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";

    if (message) {
      setTimeout(() => {
        el.style.display = "none";
        el.textContent = "";
      }, 2200);
    }
  }

  function sb() {
    if (!window.AUTH?.ensureSupabase) {
      throw new Error("AUTH helper is not available.");
    }
    return window.AUTH.ensureSupabase();
  }

  function selectedNodeId() {
    const active = document.querySelector("#chapterList .chapter-btn.active");
    return active?.getAttribute("data-node-id") || "";
  }

  function selectedNodeLabel() {
    return cleanText(document.getElementById("chapterTitle")?.textContent || "") || "Selected policy item";
  }

  function generatedByLabel() {
    const profile = window.CSVB_CONTEXT?.profile || {};
    return profile.username || window.CSVB_CONTEXT?.user?.email || "Unknown user";
  }

  function nowLabel() {
    return new Date().toLocaleString();
  }

  function fileDateStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  function scopeLabel(scope) {
    if (scope === "selected") return "Selected item only";
    if (scope === "selected_with_children") return "Selected item with sub-items";
    if (scope === "full_book") return "Complete Company Policy";
    return scope;
  }

  function safeFilename(value) {
    return String(value || "company_policy")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 140);
  }

  function contentHtml(row) {
    if (row.content_html) return String(row.content_html);

    if (row.content_text) {
      return escapeHtml(row.content_text).replaceAll("\n", "<br />");
    }

    return `<div class="no-content">No published policy text has been inserted for this item.</div>`;
  }

  function nodeHeadingTag(row) {
    const relativeDepth = Number(row.relative_depth || 0);

    if (relativeDepth <= 0) return "h1";
    if (relativeDepth === 1) return "h2";
    if (relativeDepth === 2) return "h3";
    return "h4";
  }

  function renderToc(rows) {
    if (!rows || rows.length <= 1) return "";

    const items = rows.map((row) => {
      const depth = Math.min(Number(row.relative_depth || 0), 6);
      const pad = depth * 18;
      const code = row.node_code ? `${row.node_code} ` : "";
      return `
        <div class="toc-row" style="padding-left:${pad}px;">
          <span class="toc-code">${escapeHtml(code)}</span>${escapeHtml(row.node_title || "")}
        </div>
      `;
    }).join("");

    return `
      <section class="toc">
        <h2>Contents</h2>
        ${items}
      </section>
    `;
  }

  function renderPolicyItem(row, scope) {
    const tag = nodeHeadingTag(row);
    const relativeDepth = Number(row.relative_depth || 0);
    const isTopLevel = relativeDepth === 0;
    const pageBreak = isTopLevel && Number(row.print_order || 0) > 1 && scope === "full_book"
      ? "page-break-before: always; break-before: page;"
      : "";

    const type = row.node_type || "Policy item";
    const code = row.node_code ? `${row.node_code} - ` : "";
    const title = row.node_title || "";
    const versionText = row.version_no
      ? `Published v${escapeHtml(row.version_no)}`
      : "No current published version";

    const publishedText = row.published_at
      ? `Published: ${escapeHtml(row.published_at)}`
      : "";

    const effectiveText = row.effective_from
      ? `Effective from: ${escapeHtml(row.effective_from)}`
      : "";

    return `
      <section class="policy-item level-${Math.min(relativeDepth, 6)}" style="${pageBreak}">
        <${tag} class="policy-heading">
          <span class="policy-type">${escapeHtml(type)}</span>
          <span class="policy-title">${escapeHtml(code + title)}</span>
        </${tag}>

        <div class="policy-meta">
          <span>${versionText}</span>
          ${publishedText ? `<span>${publishedText}</span>` : ""}
          ${effectiveText ? `<span>${effectiveText}</span>` : ""}
        </div>

        <div class="policy-content">
          ${contentHtml(row)}
        </div>
      </section>
    `;
  }

  function buildPrintableHtml(rows, scope) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const title = scope === "full_book"
      ? "Company Policy"
      : selectedNodeLabel();

    const filename = safeFilename(`CSV_BEACON_${title}_${fileDateStamp()}.html`);

    const body = safeRows.map((row) => renderPolicyItem(row, scope)).join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>C.S.V. BEACON - Company Policy Print</title>

  <style>
    :root {
      --navy: #062A5E;
      --blue: #1a4170;
      --border: #cbd8ea;
      --soft: #f7fbff;
      --text: #10233f;
      --muted: #4d6283;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #eef3f9;
      color: var(--text);
      font-family: Arial, "Segoe UI", sans-serif;
      font-size: 10.5pt;
      line-height: 1.42;
    }

    .print-toolbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: #062A5E;
      color: #fff;
      box-shadow: 0 4px 14px rgba(0,0,0,.18);
    }

    .print-toolbar-title {
      font-weight: 700;
      letter-spacing: .02em;
    }

    .print-toolbar-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .print-toolbar button {
      border: 1px solid rgba(255,255,255,.45);
      background: #fff;
      color: #062A5E;
      border-radius: 8px;
      padding: 7px 10px;
      font-weight: 700;
      cursor: pointer;
    }

    .page {
      max-width: 1000px;
      margin: 14px auto;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px 22px;
      box-shadow: 0 10px 30px rgba(3,27,63,.08);
    }

    .cover {
      border-bottom: 2px solid var(--border);
      padding-bottom: 12px;
      margin-bottom: 14px;
    }

    .brand {
      color: var(--navy);
      font-size: 18pt;
      font-weight: 800;
      letter-spacing: .03em;
      margin-bottom: 2px;
    }

    .subtitle {
      color: var(--muted);
      font-size: 10pt;
      margin-bottom: 10px;
    }

    .doc-title {
      color: var(--navy);
      font-size: 15pt;
      font-weight: 800;
      margin: 8px 0 3px 0;
    }

    .doc-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(220px, 1fr));
      gap: 5px 12px;
      color: var(--muted);
      font-size: 9.5pt;
    }

    .toc {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--soft);
      padding: 12px;
      margin: 14px 0 18px 0;
      page-break-after: always;
      break-after: page;
    }

    .toc h2 {
      margin: 0 0 8px 0;
      color: var(--navy);
      font-size: 12pt;
    }

    .toc-row {
      padding: 3px 0;
      border-bottom: 1px solid #e4edf9;
      font-size: 9.6pt;
    }

    .toc-code {
      font-weight: 700;
      color: var(--blue);
    }

    .policy-item {
      margin: 14px 0 18px 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .policy-heading {
      color: var(--navy);
      margin: 0 0 5px 0;
      line-height: 1.2;
      page-break-after: avoid;
      break-after: avoid;
    }

    h1.policy-heading {
      font-size: 15pt;
      border-bottom: 2px solid var(--border);
      padding-bottom: 5px;
      margin-top: 10px;
    }

    h2.policy-heading {
      font-size: 13pt;
      border-bottom: 1px solid var(--border);
      padding-bottom: 4px;
    }

    h3.policy-heading {
      font-size: 11.8pt;
    }

    h4.policy-heading {
      font-size: 11pt;
    }

    .policy-type {
      font-weight: 700;
      color: var(--blue);
      margin-right: 6px;
    }

    .policy-title {
      font-weight: 800;
    }

    .policy-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: 8.8pt;
      margin-bottom: 7px;
    }

    .policy-meta span {
      border: 1px solid var(--border);
      background: var(--soft);
      border-radius: 999px;
      padding: 3px 7px;
    }

    .policy-content {
      border: 1px solid #dbe6f6;
      background: #fff;
      border-radius: 10px;
      padding: 10px 12px;
      overflow-wrap: anywhere;
    }

    .policy-content p {
      margin: 0 0 8px 0;
    }

    .policy-content h1,
    .policy-content h2,
    .policy-content h3,
    .policy-content h4 {
      color: var(--navy);
      page-break-after: avoid;
      break-after: avoid;
    }

    .policy-content img {
      max-width: 100%;
      height: auto;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .policy-content table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .policy-content table,
    .policy-content th,
    .policy-content td {
      border: 1px solid #cbd8ea;
    }

    .policy-content th,
    .policy-content td {
      padding: 5px 6px;
      vertical-align: top;
    }

    .no-content {
      color: #6b7890;
      font-style: italic;
    }

    @media print {
      @page {
        size: A4 portrait;
        margin: 8mm;
      }

      html,
      body {
        background: #fff !important;
      }

      body {
        font-size: 9.5pt;
      }

      .print-toolbar {
        display: none !important;
      }

      .page {
        max-width: none;
        margin: 0;
        border: none;
        border-radius: 0;
        padding: 0;
        box-shadow: none;
      }

      .policy-item {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .policy-content {
        border-color: #cbd8ea;
      }
    }
  </style>
</head>

<body>
  <div class="print-toolbar">
    <div class="print-toolbar-title">C.S.V. BEACON – Company Policy Print / Export</div>
    <div class="print-toolbar-actions">
      <button type="button" onclick="window.print()">Print / Save as PDF</button>
      <button type="button" onclick="downloadHtml()">Download HTML</button>
      <button type="button" onclick="window.close()">Close</button>
    </div>
  </div>

  <main class="page">
    <section class="cover">
      <div class="brand">C.S.V. BEACON</div>
      <div class="subtitle">Marine Assurance & Compliance Platform</div>
      <div class="doc-title">${escapeHtml(title)}</div>
      <div class="doc-meta">
        <div><strong>Scope:</strong> ${escapeHtml(scopeLabel(scope))}</div>
        <div><strong>Generated:</strong> ${escapeHtml(nowLabel())}</div>
        <div><strong>Generated by:</strong> ${escapeHtml(generatedByLabel())}</div>
        <div><strong>Source:</strong> Current published Company Policy text only</div>
      </div>
    </section>

    ${renderToc(safeRows)}
    ${body || `<div class="no-content">No printable published policy content was returned.</div>`}
  </main>

  <script>
    function downloadHtml() {
      var clone = document.documentElement.cloneNode(true);
      var toolbar = clone.querySelector(".print-toolbar");
      if (toolbar) toolbar.remove();

      var html = "<!DOCTYPE html>\\n" + clone.outerHTML;
      var blob = new Blob([html], { type: "text/html;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = ${JSON.stringify(filename)};
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
        a.remove();
      }, 500);
    }
  </script>
</body>
</html>`;
  }

  async function loadPrintableContent(scope) {
    const nodeId = selectedNodeId();

    if ((scope === "selected" || scope === "selected_with_children") && !nodeId) {
      throw new Error("Select a policy item first.");
    }

    const { data, error } = await sb().rpc("csvb_company_policy_get_printable_content", {
      p_scope: scope,
      p_node_id: scope === "full_book" ? null : nodeId,
      p_book_key: "main_policy",
    });

    if (error) {
      throw new Error("Could not load printable policy content: " + error.message);
    }

    return data || [];
  }

  async function printScope(scope) {
    showWarn("");

    const menu = document.getElementById("policyPrintMenu");
    if (menu) menu.classList.add("hidden");

    showOk("Preparing printable policy content...");

    const rows = await loadPrintableContent(scope);

    if (!rows.length) {
      throw new Error("No printable published policy content was returned.");
    }

    const html = buildPrintableHtml(rows, scope);

    const win = window.open("", "_blank", "width=1100,height=900,noopener,noreferrer");

    if (!win) {
      throw new Error("The browser blocked the print/export window. Allow pop-ups for this site and try again.");
    }

    win.document.open();
    win.document.write(html);
    win.document.close();

    showOk("Printable policy opened. Use Print / Save as PDF in the print window.");
  }

  function injectStyles() {
    if (document.getElementById("csvb-policy-print-export-styles")) return;

    const style = document.createElement("style");
    style.id = "csvb-policy-print-export-styles";
    style.textContent = `
      .policy-print-wrap {
        position: relative;
        display: inline-flex;
      }

      .policy-print-menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: 1000;
        width: 300px;
        border: 1px solid #cbd8ea;
        background: #ffffff;
        border-radius: 12px;
        padding: 8px;
        box-shadow: 0 12px 28px rgba(3,27,63,.18);
      }

      .policy-print-menu.hidden {
        display: none;
      }

      .policy-print-menu-title {
        color: #1a4170;
        font-weight: 700;
        margin: 3px 4px 7px 4px;
        font-size: .9rem;
      }

      .policy-print-menu button {
        width: 100%;
        text-align: left;
        margin-bottom: 6px;
      }

      .policy-print-note {
        color: #4d6283;
        font-size: .82rem;
        line-height: 1.3;
        border-top: 1px solid #dbe6f6;
        padding: 7px 4px 2px 4px;
        margin-top: 2px;
      }
    `;

    document.head.appendChild(style);
  }

  function injectButton() {
    if (document.getElementById("policyPrintExportBtn")) return;

    const headerActions = document.querySelector(".viewer-header .row");
    if (!headerActions) return;

    const wrap = document.createElement("span");
    wrap.className = "policy-print-wrap";

    wrap.innerHTML = `
      <button id="policyPrintExportBtn" class="btn2" type="button">Print / Export</button>
      <div id="policyPrintMenu" class="policy-print-menu hidden">
        <div class="policy-print-menu-title">Print / Export published policy text</div>
        <button class="btn2" type="button" data-policy-print-scope="selected">
          Print selected item only
        </button>
        <button class="btn2" type="button" data-policy-print-scope="selected_with_children">
          Print selected item with sub-items
        </button>
        <button class="btn2" type="button" data-policy-print-scope="full_book">
          Print complete Policy Book
        </button>
        <div class="policy-print-note">
          The printable window can be printed or saved as PDF. Complete Policy Book export requires COMPANY_POLICY.export.
        </div>
      </div>
    `;

    headerActions.appendChild(wrap);

    const mainBtn = document.getElementById("policyPrintExportBtn");
    const menu = document.getElementById("policyPrintMenu");

    if (mainBtn && menu) {
      mainBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        menu.classList.toggle("hidden");
      });
    }

    document.querySelectorAll("[data-policy-print-scope]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const scope = btn.getAttribute("data-policy-print-scope") || "selected";
          await printScope(scope);
        } catch (error) {
          showWarn(String(error?.message || error));
        }
      });
    });

    document.addEventListener("click", (event) => {
      const container = document.querySelector(".policy-print-wrap");
      const menuEl = document.getElementById("policyPrintMenu");

      if (!container || !menuEl) return;
      if (container.contains(event.target)) return;

      menuEl.classList.add("hidden");
    });
  }

  function init() {
    injectStyles();
    injectButton();

    window.CSVB_POLICY_PRINT_EXPORT = {
      build: BUILD,
      printScope,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();