function el(id) { return document.getElementById(id); }

function setStatus(txt) {
  el("statusPill").textContent = txt || "";
}

function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoAddMonths(iso, deltaMonths) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setMonth(d.getMonth() + deltaMonths);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function quarterKey(isoDate) {
  const m = String(isoDate || "").match(/^(\d{4})-(\d{2})-/);
  if (!m) return "";
  const y = m[1];
  const month = Number(m[2]);
  const q = Math.floor((month - 1) / 3) + 1;
  return `${y}-Q${q}`;
}

function monthKey(isoDate) {
  const m = String(isoDate || "").match(/^(\d{4})-(\d{2})-/);
  if (!m) return "";
  return `${m[1]}-${m[2]}`;
}

function pgnoMissing(pgno_selected) {
  const arr = Array.isArray(pgno_selected) ? pgno_selected : [];
  return arr.length === 0;
}

async function loadAllReports(supabase, fromDate, toDate) {
  const { data, error } = await supabase.rpc("csvb_post_inspection_reports_for_me");

  if (error) throw error;

  return (data || []).filter((r) => {
    const d = String(r.inspection_date || "").slice(0, 10);
    if (!d) return false;
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  });
}

async function loadAllObservationsForReports(supabase, reportIds) {
  if (!reportIds.length) return [];

  // chunk IN queries to avoid limits
  const chunks = [];
  const size = 500;
  for (let i = 0; i < reportIds.length; i += size) chunks.push(reportIds.slice(i, i + size));

  const all = [];
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from("csvb_counted_post_inspection_legacy")
      .select("report_id, observation_type, designation, pgno_selected, retained_pifs, human_pif_count, effective_observation_count, human_counting_mode, policy_revision")
      .in("report_id", chunk);

    if (error) throw error;
    all.push(...(data || []));
  }
  return all;
}

function computeKPIs(reports, observations, groupBy, categoryFilter) {
  const reportById = new Map(reports.map(r => [r.id, r]));
  const periodMap = new Map();

  const inspectionsSetByPeriod = new Map(); // period -> Set(report_id)

  const addPeriod = (period) => {
    if (!periodMap.has(period)) {
      periodMap.set(period, {
        period,
        inspections: 0,
        items: 0,
        neg: 0,
        negMissingPgno: 0,
        pos: 0,
        lae: 0,
      });
      inspectionsSetByPeriod.set(period, new Set());
    }
    return periodMap.get(period);
  };

  // headline
  let inspectionsTotal = reports.length;
  let itemsTotal = 0, neg = 0, pos = 0, lae = 0, negMissingPgno = 0;
  let human = 0, process = 0, hardware = 0, photo = 0;

  for (const ob of observations) {
    const rep = reportById.get(ob.report_id);
    if (!rep) continue;

    const designation = String(ob.designation || "").trim();
    if (categoryFilter && designation !== categoryFilter) continue;

    const period = groupBy === "quarter" ? quarterKey(rep.inspection_date) : monthKey(rep.inspection_date);
    if (!period) continue;

    const row = addPeriod(period);
    const set = inspectionsSetByPeriod.get(period);
    set.add(ob.report_id);

    const weight = window.CSVB_OBSERVATION_COUNTS.weight(ob);
    itemsTotal += weight;
    row.items += weight;

    const ot = String(ob.observation_type || "");
    if (ot === "negative_observation") {
      neg += weight; row.neg += weight;
      if (pgnoMissing(ob.pgno_selected)) { negMissingPgno += weight; row.negMissingPgno += weight; }
    } else if (ot === "positive_observation") {
      pos += weight; row.pos += weight;
    } else {
      lae += weight; row.lae += weight;
    }

    if (designation === "Human") human += weight;
    if (designation === "Process") process += weight;
    if (designation === "Hardware") hardware += weight;
    if (designation === "Photo") photo += weight;
  }

  // inspections per period = distinct report_ids in that period
  for (const [period, set] of inspectionsSetByPeriod.entries()) {
    const row = periodMap.get(period);
    row.inspections = set.size;
  }

  const periodRows = Array.from(periodMap.values()).sort((a,b) => String(a.period).localeCompare(String(b.period)));

  return {
    headline: {
      inspectionsTotal,
      itemsTotal,
      neg, pos, lae, negMissingPgno,
      human, process, hardware, photo
    },
    periodRows
  };
}

function renderHeadline(h) {
  el("kpiInspections").textContent = String(h.inspectionsTotal);
  el("kpiItems").textContent = String(h.itemsTotal);
  el("kpiNeg").textContent = String(h.neg);
  el("kpiNegMiss").textContent = String(h.negMissingPgno);
  el("kpiPos").textContent = String(h.pos);
  el("kpiLae").textContent = String(h.lae);
  el("kpiHuman").textContent = String(h.human);
  el("kpiProcess").textContent = String(h.process);
}

function renderTable(rows) {
  const body = el("tblBody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="muted">No data for the selected range/filters.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(r => `
    <tr>
      <td>${r.period}</td>
      <td>${r.inspections}</td>
      <td>${r.items}</td>
      <td>${r.neg}</td>
      <td>${r.negMissingPgno}</td>
      <td>${r.pos}</td>
      <td>${r.lae}</td>
    </tr>
  `).join("");
}

function exportCSV(headline, rows, observations = []) {
  const lines = [];
  lines.push(["Section","Metric","Value"].join(","));
  lines.push(["Headline","Inspections",headline.inspectionsTotal].join(","));
  lines.push(["Headline","Total Items",headline.itemsTotal].join(","));
  lines.push(["Headline","Negative",headline.neg].join(","));
  lines.push(["Headline","Neg Missing PGNO",headline.negMissingPgno].join(","));
  lines.push(["Headline","Positive",headline.pos].join(","));
  lines.push(["Headline","Largely",headline.lae].join(","));
  lines.push(["Headline","Human",headline.human].join(","));
  lines.push(["Headline","Process",headline.process].join(","));
  lines.push(["Headline","Hardware",headline.hardware].join(","));
  lines.push(["Headline","Photo",headline.photo].join(","));

  lines.push("");
  lines.push(["Period","Inspections","Total Items","Negative","Neg Missing PGNO","Positive","Largely"].join(","));
  for (const r of rows) {
    lines.push([r.period,r.inspections,r.items,r.neg,r.negMissingPgno,r.pos,r.lae].join(","));
  }

  lines.push("", "Finding records (legacy KPI source; never duplicated)");
  lines.push(["report_id","observation_type","designation","retained_pifs","human_pif_count","effective_observation_count","human_counting_mode","policy_revision"].join(","));
  for (const item of observations) {
    lines.push([item.report_id,item.observation_type,item.designation,
      (item.retained_pifs || []).join(" | "),item.human_pif_count || 0,
      window.CSVB_OBSERVATION_COUNTS.weight(item),item.human_counting_mode || "per_finding",
      item.policy_revision || 0].map(value=>`"${String(value ?? "").replaceAll('"','""')}"`).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `post_inspection_kpis_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function init() {
  // auth
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (window.AUTH && typeof window.AUTH.requireAuth === "function") break;
    await new Promise(r => setTimeout(r, 50));
  }
  if (!window.AUTH) throw new Error("AUTH not loaded.");

  const sb = window.AUTH.ensureSupabase();
  const R = window.AUTH.ROLES;
  const me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN, R.COMPANY_SUPERINTENDENT].filter(Boolean));
  if (!me) return;

  window.AUTH.fillUserBadge(me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);
  el("dashboardBtn").addEventListener("click", () => window.location.href = "dashboard.html");
  el("postInspBtn").addEventListener("click", () => window.location.href = "post_inspection.html");

  el("buildPill").textContent = "build: post_inspection_kpis_v1_2026-03-01";

  // defaults: last 6 months
  const to = isoToday();
  const from = isoAddMonths(to, -6);
  el("fromDate").value = from;
  el("toDate").value = to;

  async function refresh() {
    const fromDate = String(el("fromDate").value || "").trim();
    const toDate = String(el("toDate").value || "").trim();
    const groupBy = String(el("groupBy").value || "month");
    const categoryFilter = String(el("categoryFilter").value || "").trim();

    if (!fromDate || !toDate) {
      alert("Please set From date and To date.");
      return;
    }

    setStatus("Loading…");
    try {
      const reports = await loadAllReports(sb, fromDate, toDate);
      const reportIds = reports.map(r => r.id);
      const observations = await loadAllObservationsForReports(sb, reportIds);

      const { headline, periodRows } = computeKPIs(reports, observations, groupBy, categoryFilter);
      renderHeadline(headline);
      renderTable(periodRows);

      // store for export
      window.__KPI_EXPORT__ = { headline, periodRows,
        observations: observations.filter(item => !categoryFilter || item.designation === categoryFilter) };
      setStatus("Loaded");
    } catch (e) {
      console.error(e);
      setStatus("Error");
      alert("KPI load failed: " + (e?.message || String(e)));
    }
  }

  el("refreshBtn").addEventListener("click", refresh);
  el("exportCsvBtn").addEventListener("click", () => {
    const x = window.__KPI_EXPORT__;
    if (!x) { alert("Nothing to export yet. Click Refresh first."); return; }
    exportCSV(x.headline, x.periodRows, x.observations);
  });

  await refresh();
}

(async () => {
  try {
    await init();
  } catch (e) {
    console.error(e);
    alert("KPI Dashboard failed to load: " + (e?.message || String(e)));
  }
})();