// C.S.V. BEACON - Post Stats PGNO Analytics v01
// Safe helper file. Does not replace post_inspection_stats.js.
// Reads the main stats snapshot and enhances the existing PGNO section only.

(function () {
  "use strict";

  const BUILD = "POST-STATS-PGNO-ANALYTICS-V05-MODAL-WRAP-20260630";
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


  function injectPgnoHelperStyle() {
    if (document.getElementById("csvbPgnoAnalyticsV05Style")) return;

    const style = document.createElement("style");
    style.id = "csvbPgnoAnalyticsV05Style";
    style.textContent = `
      #csvbPgnoRecordsModal {
        width: 96vw !important;
        max-width: 96vw !important;
      }

      #csvbPgnoRecordsModal .csvb-pgno-modal-scroll {
        max-height: 70vh;
        overflow-y: auto;
        overflow-x: hidden;
      }

      #csvbPgnoRecordsModal table {
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
      }

      #csvbPgnoRecordsModal th,
      #csvbPgnoRecordsModal td {
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: normal;
        vertical-align: top;
        line-height: 1.35;
        padding: 7px 8px;
        border-bottom: 1px solid #dbe8f8;
      }

      #csvbPgnoRecordsModal th:nth-child(1),
      #csvbPgnoRecordsModal td:nth-child(1) { width: 9%; }

      #csvbPgnoRecordsModal th:nth-child(2),
      #csvbPgnoRecordsModal td:nth-child(2) { width: 7%; }

      #csvbPgnoRecordsModal th:nth-child(3),
      #csvbPgnoRecordsModal td:nth-child(3) { width: 6%; }

      #csvbPgnoRecordsModal th:nth-child(4),
      #csvbPgnoRecordsModal td:nth-child(4) { width: 7%; }

      #csvbPgnoRecordsModal th:nth-child(5),
      #csvbPgnoRecordsModal td:nth-child(5) { width: 8%; }

      #csvbPgnoRecordsModal th:nth-child(6),
      #csvbPgnoRecordsModal td:nth-child(6) { width: 13%; }

      #csvbPgnoRecordsModal th:nth-child(7),
      #csvbPgnoRecordsModal td:nth-child(7) { width: 15%; }

      #csvbPgnoRecordsModal th:nth-child(8),
      #csvbPgnoRecordsModal td:nth-child(8) { width: 35%; }

      #csvbPgnoRecordsModal .csvbPgnoObservationCell {
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: normal;
      }

      dialog#drillDialog {
        width: 96vw !important;
        max-width: 96vw !important;
      }

      dialog#drillDialog table {
        table-layout: fixed;
        width: 100%;
      }

      dialog#drillDialog th,
      dialog#drillDialog td {
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: normal;
        vertical-align: top;
        line-height: 1.32;
      }
    `;

    document.head.appendChild(style);
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


  function pgnoLabel(pg) {
    const no = String(pg?.pgno_no || pg?.idx || "").trim();
    const text = String(pg?.text || pg?.pgno_text || "").trim();
    if (no && text) return `${no} — ${text}`;
    return no || text || "Unspecified PGNO";
  }

  function expandPgnoRows(rows) {
    const out = [];

    for (const row of rows || []) {
      const arr = Array.isArray(row.pgno_selected) ? row.pgno_selected : [];

      for (const pg of arr) {
        out.push({
          ...row,
          csvb_pgno_label: pgnoLabel(pg),
          csvb_pgno_no: String(pg?.pgno_no || pg?.idx || "").trim(),
          csvb_pgno_text: String(pg?.text || pg?.pgno_text || "").trim(),
        });
      }
    }

    return out;
  }

  function reportKey(row) {
    return String(
      row?.record_source || "vetting_inspection"
    ) + "::" + String(
      row?.report_id || row?.source_report_id || row?.report_ref || row?.inspection_date || ""
    );
  }

  function groupTopPgno(expandedRows) {
    const map = new Map();

    for (const row of expandedRows || []) {
      const key = String(row.csvb_pgno_label || "Unspecified PGNO").trim();

      if (!map.has(key)) {
        map.set(key, {
          key,
          pgno_no: row.csvb_pgno_no || "",
          pgno_text: row.csvb_pgno_text || "",
          observations: 0,
          reportKeys: new Set(),
          rows: [],
          last_seen: "",
        });
      }

      const item = map.get(key);
      item.observations += 1;
      item.reportKeys.add(reportKey(row));
      item.rows.push(row);

      const d = String(row.inspection_date || "").slice(0, 10);
      if (d && (!item.last_seen || d > item.last_seen)) item.last_seen = d;
    }

    return [...map.values()]
      .map((item) => {
        const reports = item.reportKeys.size;
        return {
          ...item,
          reports,
          avg: reports ? item.observations / reports : 0,
        };
      })
      .sort((a, b) =>
        Number(b.observations || 0) - Number(a.observations || 0) ||
        String(a.key).localeCompare(String(b.key))
      );
  }

  function topLimitValue() {
    const raw = String(document.getElementById("csvbPgnoTopLimit")?.value || "10").trim();
    if (raw === "all") return Infinity;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 10;
  }

  function ensurePgnoModal() {
    let modal = document.getElementById("csvbPgnoRecordsModal");
    if (modal) return modal;

    modal = document.createElement("dialog");
    modal.id = "csvbPgnoRecordsModal";
    modal.style.maxWidth = "96vw";
    modal.style.width = "96vw";
    modal.style.border = "1px solid #cfe0f4";
    modal.style.borderRadius = "16px";
    modal.style.padding = "0";
    modal.innerHTML = `
      <div style="padding:14px 16px;border-bottom:1px solid #dbe8f8;display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div>
          <div style="font-weight:950;color:#082d57;font-size:1.05rem;" id="csvbPgnoModalTitle">PGNO records</div>
          <div style="font-weight:800;color:#55708f;font-size:.86rem;" id="csvbPgnoModalSub">Related observations</div>
        </div>
        <button class="btn btn-muted" type="button" id="csvbPgnoModalClose">Close</button>
      </div>
      <div class="csvb-pgno-modal-scroll" style="padding:12px 16px;">
        <table class="csvbPgnoRecordsTable" style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th>Vessel</th>
              <th>Date</th>
              <th>Question</th>
              <th>Type</th>
              <th>Category</th>
              <th>SOC</th>
              <th>NOC</th>
              <th>Observation</th>
            </tr>
          </thead>
          <tbody id="csvbPgnoModalTbody"></tbody>
        </table>
      </div>
    `;

    document.body.appendChild(modal);
    document.getElementById("csvbPgnoModalClose")?.addEventListener("click", () => modal.close());

    return modal;
  }

  function openPgnoRecords(title, rows) {
    const modal = ensurePgnoModal();
    const tbody = document.getElementById("csvbPgnoModalTbody");

    document.getElementById("csvbPgnoModalTitle").textContent = title || "PGNO records";
    document.getElementById("csvbPgnoModalSub").textContent = `${rows.length} related observation(s).`;

    tbody.innerHTML = rows.length ? rows.map((row) => `
      <tr>
        <td>${esc(row.vessel_name || "")}</td>
        <td>${esc(row.inspection_date || "")}</td>
        <td>${esc(row.question_no || "")}</td>
        <td>${esc(row.observation_type || "")}</td>
        <td>${esc(row.designation || "")}</td>
        <td>${esc(row.soc || "")}</td>
        <td>${esc(row.noc || "")}</td>
        <td class="csvbPgnoObservationCell">${esc(row.remarks || row.observation_text || "")}</td>
      </tr>
    `).join("") : `<tr><td colspan="8">No related records.</td></tr>`;

    modal.showModal();
  }

  function bindPgnoViewButtons(container, groupedRows) {
    container.querySelectorAll(".csvbPgnoViewBtn").forEach((btn) => {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";

      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-pgno-key") || "";
        const item = groupedRows.find((x) => x.key === key);
        openPgnoRecords(`PGNO: ${key}`, item?.rows || []);
      });
    });
  }


  function hideLegacyPgnoBarsPanel() {
    const byId = document.getElementById("csvbStatsPgnoBarsPanelV01");
    if (byId) {
      byId.style.display = "none";
      byId.setAttribute("data-csvb-hidden-by-pgno-helper", BUILD);
    }

    document.querySelectorAll(".csvb-stats-bars-panel,.csvb-bars-panel,.csvb-soc-noc-pgno-bars").forEach((panel) => {
      const text = String(panel.textContent || "");
      if (/PGNO\s+Analytics\s*-\s*Bars/i.test(text) || /Filtered PGNO bar chart/i.test(text)) {
        panel.style.display = "none";
        panel.setAttribute("data-csvb-hidden-by-pgno-helper", BUILD);
      }
    });

    document.querySelectorAll(".card,.chartBox,.panel").forEach((node) => {
      const text = String(node.textContent || "");
      if (/PGNO\s+Analytics\s*-\s*Bars/i.test(text) && /Filtered PGNO bar chart/i.test(text)) {
        node.style.display = "none";
        node.setAttribute("data-csvb-hidden-by-pgno-helper", BUILD);
      }
    });
  }


  function scheduleLegacyPgnoBarsHide() {
    hideLegacyPgnoBarsPanel();
    setTimeout(hideLegacyPgnoBarsPanel, 300);
    setTimeout(hideLegacyPgnoBarsPanel, 900);
    setTimeout(hideLegacyPgnoBarsPanel, 1800);

    if (!window.__csvbPgnoBarsHideObserver) {
      window.__csvbPgnoBarsHideObserver = new MutationObserver(() => {
        hideLegacyPgnoBarsPanel();
      });

      window.__csvbPgnoBarsHideObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  function renderTopPgnoVisual(assignedRows) {
    const box = document.getElementById("chartPgno");
    if (!box) return [];

    hideLegacyPgnoBarsPanel();

    const expanded = expandPgnoRows(assignedRows);
    const groupedAll = groupTopPgno(expanded);
    const limit = topLimitValue();
    const grouped = Number.isFinite(limit) ? groupedAll.slice(0, limit) : groupedAll;

    if (!grouped.length) {
      box.innerHTML = `<div class="mono">No assigned PGNOs for selected PGNO filters.</div>`;
      return groupedAll;
    }

    const max = Math.max(...grouped.map((x) => x.observations), 1);
    const showLabel = Number.isFinite(limit)
      ? `Showing Top ${Math.min(limit, groupedAll.length)} of ${groupedAll.length} PGNO(s).`
      : `Showing all ${groupedAll.length} PGNO(s).`;

    box.innerHTML = `
      <div style="display:grid;gap:8px;">
        <div class="statL" style="font-weight:950;color:#1a4170;">${esc(showLabel)}</div>

        <div style="display:grid;gap:8px;max-height:${grouped.length > 12 ? "520px" : "none"};overflow:auto;padding-right:4px;">
          ${grouped.map((item) => {
            const pct = Math.max(4, Math.round((item.observations / max) * 100));
            return `
              <div style="display:grid;grid-template-columns:minmax(190px,360px) 1fr 92px 60px;gap:8px;align-items:center;">
                <div title="${esc(item.key)}" style="font-weight:950;color:#1a4170;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${esc(item.key)}
                </div>
                <div style="height:13px;border-radius:999px;background:#e8f0fb;overflow:hidden;">
                  <div style="width:${pct}%;height:100%;border-radius:999px;background:#6d28d9;"></div>
                </div>
                <div class="mono" style="text-align:right;">${esc(item.observations)} / ${esc(item.reports)} / ${esc(item.avg.toFixed(2))}</div>
                <button class="btn btn-muted btn-small csvbPgnoViewBtn" type="button" data-pgno-key="${esc(item.key)}">View</button>
              </div>
            `;
          }).join("")}
        </div>

        <div class="statL">Top PGNO is Vetting-only and uses the PGNO helper filters. Values show observations / reports / average.</div>
      </div>
    `;

    bindPgnoViewButtons(box, groupedAll);
    return groupedAll;
  }

  function render() {
    const card = findPgnoCard();
    if (!card) return;

    injectPgnoHelperStyle();
    ensurePgnoControls(card);
    scheduleLegacyPgnoBarsHide();

    const snap = snapshot();
    if (!snap) return;

    const rows = filteredVettingRows(snap);
    const assigned = rows.filter((row) => Array.isArray(row.pgno_selected) && row.pgno_selected.length > 0);
    const missing = rows.filter((row) => !Array.isArray(row.pgno_selected) || row.pgno_selected.length === 0);
    const topPgno = renderTopPgnoVisual(assigned);

    const assignedKpi = document.getElementById("csvbPgnoAssignedKpi");
    const missingKpi = document.getElementById("csvbPgnoMissingKpi");
    const scopeKpi = document.getElementById("csvbPgnoScopeKpi");

    if (assignedKpi) assignedKpi.textContent = String(assigned.length);
    if (missingKpi) missingKpi.textContent = String(missing.length);
    if (scopeKpi) scopeKpi.textContent = topPgno[0]?.pgno_no || "Vetting";

    card.dataset.csvbPgnoHelperBuild = BUILD;
  }

  window.addEventListener("csvb:post-stats-snapshot", render);
  window.addEventListener("load", () => setTimeout(render, 300));
})();
