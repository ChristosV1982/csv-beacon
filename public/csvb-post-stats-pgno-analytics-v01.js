// C.S.V. BEACON - Post Stats PGNO Analytics v01
// Safe helper file. Does not replace post_inspection_stats.js.
// Reads the main stats snapshot and enhances the existing PGNO section only.

(function () {
  "use strict";

  const BUILD = "POST-STATS-PGNO-ANALYTICS-V01-20260630";
  window.CSVB_POST_STATS_PGNO_ANALYTICS_BUILD = BUILD;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function q(selector, root = document) {
    return root.querySelector(selector);
  }

  function findPgnoCard() {
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,.sectionTitle"));
    const heading = headings.find((node) => String(node.textContent || "").trim() === "PGNO Analytics");
    return heading ? heading.closest(".card") : null;
  }

  function snapshot() {
    if (typeof window.CSVB_POST_STATS_GET_SNAPSHOT === "function") {
      return window.CSVB_POST_STATS_GET_SNAPSHOT();
    }
    return window.CSVB_POST_STATS_SNAPSHOT || null;
  }

  function normaliseType(value) {
    const s = String(value || "").trim().toLowerCase();
    if (s.includes("largely")) return "largely";
    if (s.includes("positive")) return "positive";
    return "negative";
  }

  function currentDateRange() {
    return {
      from: String(document.getElementById("dateFrom")?.value || "").slice(0, 10),
      to: String(document.getElementById("dateTo")?.value || "").slice(0, 10),
    };
  }

  function inDateRange(row, from, to) {
    const d = String(row?.inspection_date || "").slice(0, 10);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  function ensurePgnoControls(card) {
    if (!card || q("#csvbPgnoAnalyticsV01Controls", card)) return;

    const host = document.createElement("div");
    host.id = "csvbPgnoAnalyticsV01Controls";
    host.style.marginTop = "12px";
    host.innerHTML = `
      <div class="row" style="align-items:end;">
        <div class="field-small">
          <label for="csvbPgnoGrouping">PGNO trend grouping</label>
          <select id="csvbPgnoGrouping">
            <option value="month" selected>Monthly</option>
            <option value="quarter">Quarterly</option>
            <option value="year">Annual</option>
          </select>
        </div>

        <div class="field-small">
          <label for="csvbPgnoTopLimit">PGNO items shown</label>
          <select id="csvbPgnoTopLimit">
            <option value="10" selected>Top 10</option>
            <option value="25">Top 25</option>
            <option value="50">Top 50</option>
            <option value="all">All loaded</option>
          </select>
        </div>

        <div class="field" style="min-width:360px; flex:1;">
          <label>PGNO observation types</label>
          <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:center; min-height:36px;">
            <label class="checkRow" style="margin:0;"><input id="csvbPgnoTypeNegative" type="checkbox" checked /> Negative</label>
            <label class="checkRow" style="margin:0;"><input id="csvbPgnoTypeLargely" type="checkbox" /> Largely as expected</label>
          </div>
        </div>

        <div class="field-small">
          <label>&nbsp;</label>
          <button class="btn btn-muted" id="csvbPgnoRefreshBtn" type="button">Refresh PGNO</button>
        </div>
      </div>

      <div class="statGrid" style="margin-top:12px;">
        <div class="stat">
          <div class="statN" id="csvbPgnoAssignedKpi">0</div>
          <div class="statL">Assigned PGNO observations</div>
          <div class="statSub">Vetting observations with at least one PGNO tick.</div>
        </div>
        <div class="stat">
          <div class="statN" id="csvbPgnoMissingKpi">0</div>
          <div class="statL">Missing PGNO observations</div>
          <div class="statSub">Selected Vetting observations without PGNO tick.</div>
        </div>
        <div class="stat">
          <div class="statN" id="csvbPgnoScopeKpi">Vetting</div>
          <div class="statL">PGNO scope</div>
          <div class="statSub">PGNO analytics are Vetting-only.</div>
        </div>
      </div>
    `;

    const firstChartGrid = q(".chartGrid", card);
    if (firstChartGrid) card.insertBefore(host, firstChartGrid);
    else card.appendChild(host);

    ["csvbPgnoGrouping", "csvbPgnoTopLimit", "csvbPgnoTypeNegative", "csvbPgnoTypeLargely"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", render);
    });
    document.getElementById("csvbPgnoRefreshBtn")?.addEventListener("click", render);
  }

  function selectedPgnoTypes() {
    const out = [];
    if (document.getElementById("csvbPgnoTypeNegative")?.checked) out.push("negative");
    if (document.getElementById("csvbPgnoTypeLargely")?.checked) out.push("largely");
    return out.length ? out : ["negative"];
  }

  function filteredVettingRows(snap) {
    const rows = Array.isArray(snap?.postRows) ? snap.postRows : [];
    const { from, to } = currentDateRange();
    const types = new Set(selectedPgnoTypes());

    return rows.filter((row) => {
      if (!inDateRange(row, from, to)) return false;
      if (!types.has(normaliseType(row.observation_type))) return false;
      return true;
    });
  }

  function render() {
    const card = findPgnoCard();
    if (!card) return;

    ensurePgnoControls(card);

    const snap = snapshot();
    if (!snap) return;

    const rows = filteredVettingRows(snap);
    const assigned = rows.filter((row) => Array.isArray(row.pgno_selected) && row.pgno_selected.length > 0);
    const missing = rows.filter((row) => !Array.isArray(row.pgno_selected) || row.pgno_selected.length === 0);

    const assignedKpi = document.getElementById("csvbPgnoAssignedKpi");
    const missingKpi = document.getElementById("csvbPgnoMissingKpi");

    if (assignedKpi) assignedKpi.textContent = String(assigned.length);
    if (missingKpi) missingKpi.textContent = String(missing.length);

    card.dataset.csvbPgnoHelperBuild = BUILD;
  }

  window.addEventListener("csvb:post-stats-snapshot", render);
  window.addEventListener("load", () => setTimeout(render, 300));
})();
