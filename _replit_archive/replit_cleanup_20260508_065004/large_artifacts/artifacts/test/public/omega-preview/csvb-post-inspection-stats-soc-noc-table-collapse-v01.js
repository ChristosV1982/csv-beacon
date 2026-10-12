// C.S.V. BEACON - Post-Inspection Stats SOC/NOC Table Collapse v01
// Display-only helper. Collapses the large Top SOC and Top NOC tables by default.
// The related bar charts remain visible. No stored data, calculations, filters, drilldowns, exports, auth, Supabase, device or offline logic is changed.
(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-SOC-NOC-TABLE-COLLAPSE-V01-20260601";
  window.CSVB_POST_STATS_SOC_NOC_TABLE_COLLAPSE_BUILD = BUILD;

  const TARGETS = [
    { id: "topSocTbody", label: "Top SOC table" },
    { id: "topNocTbody", label: "Top NOC table" },
  ];

  function injectStyle() {
    if (document.getElementById("csvbSocNocTableCollapseV01Style")) return;
    const style = document.createElement("style");
    style.id = "csvbSocNocTableCollapseV01Style";
    style.textContent = `
      .csvb-soc-noc-table-toggle{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        width:100%;
        margin:8px 0 8px;
        padding:8px 10px;
        border:1px solid #cbd7ee;
        border-radius:12px;
        background:linear-gradient(180deg,#ffffff,#f6f9ff);
        color:#1a4170;
        font-weight:950;
        cursor:pointer;
        text-align:left;
      }
      .csvb-soc-noc-table-toggle span:first-child{
        display:flex;
        flex-direction:column;
        gap:2px;
      }
      .csvb-soc-noc-table-title{
        font-size:.95rem;
        font-weight:950;
      }
      .csvb-soc-noc-table-sub{
        color:#48628e;
        font-size:.78rem;
        font-weight:850;
      }
      .csvb-soc-noc-table-icon{
        min-width:34px;
        padding:3px 9px;
        border:1px solid #bfe0f5;
        border-radius:999px;
        background:#eaf5ff;
        text-align:center;
        font-size:1rem;
      }
      .csvb-soc-noc-table-wrap[hidden]{
        display:none!important;
      }
    `;
    document.head.appendChild(style);
  }

  function rowCount(tbody) {
    return Array.from(tbody?.querySelectorAll("tr") || [])
      .filter((tr) => !/^no\s+/i.test(String(tr.textContent || "").trim()))
      .length;
  }

  function collapseTable(target) {
    const tbody = document.getElementById(target.id);
    const table = tbody?.closest("table");
    if (!tbody || !table || table.dataset.csvbSocNocTableCollapseV01 === "1") return;

    const wrapper = document.createElement("div");
    wrapper.className = "csvb-soc-noc-table-wrap";
    wrapper.hidden = true;
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "csvb-soc-noc-table-toggle";
    button.innerHTML = `
      <span>
        <span class="csvb-soc-noc-table-title"></span>
        <span class="csvb-soc-noc-table-sub"></span>
      </span>
      <span class="csvb-soc-noc-table-icon">+</span>
    `;

    const updateText = () => {
      const rows = rowCount(tbody);
      button.querySelector(".csvb-soc-noc-table-title").textContent = wrapper.hidden ? `Show ${target.label}` : `Hide ${target.label}`;
      button.querySelector(".csvb-soc-noc-table-sub").textContent = rows ? `${rows} table row(s). Chart remains visible below.` : "No table rows for current filters.";
      button.querySelector(".csvb-soc-noc-table-icon").textContent = wrapper.hidden ? "+" : "−";
    };

    button.addEventListener("click", () => {
      wrapper.hidden = !wrapper.hidden;
      updateText();
    });

    wrapper.parentNode.insertBefore(button, wrapper);
    table.dataset.csvbSocNocTableCollapseV01 = "1";
    updateText();

    new MutationObserver(updateText).observe(tbody, { childList: true, subtree: true, characterData: true });
  }

  function apply() {
    injectStyle();
    TARGETS.forEach(collapseTable);
  }

  function start() {
    apply();
    window.setTimeout(apply, 700);
    window.setTimeout(apply, 1600);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
