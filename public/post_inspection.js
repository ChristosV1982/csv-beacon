const POST_INSPECTION_INDEX_BUILD =
  "post_inspection_index_v16_compact_entry_risk_panel_2026-05-21";

const RISK_INCLUDE_LAE_KEY = "csvb_post_entry_include_largely_ae_risk";
const RISK_PROFILE_SELECTION_KEY = "csvb_post_entry_visible_risk_profile_ids";

function el(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseDateParts(anyDate) {
  const s = String(anyDate || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { year: m[1], month: m[2], day: m[3], iso: s };

  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return { year: m[3], month: m[2], day: m[1], iso: `${m[3]}-${m[2]}-${m[1]}` };

  return { year: "", month: "", day: "", iso: "" };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForAuth(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (window.AUTH && window.AUTH.ensureSupabase) return true;
    await sleep(50);
  }
  return false;
}

async function safeNavigate(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  for (const url of list) {
    try {
      const r = await fetch(url, { method: "GET", cache: "no-store" });
      if (r && r.ok) {
        window.location.href = url;
        return;
      }
    } catch {}
  }
  alert(
    "Navigation failed.\n\nNone of these pages were found:\n" +
      list.map((x) => `- ${x}`).join("\n"),
  );
}

const state = {
  me: null,
  supabase: null,
  reports: [],
  riskScoresByReport: new Map(),
  riskProfiles: [],
  selectedRiskProfileIds: [],
  includeLargelyInEntryRisk: localStorage.getItem(RISK_INCLUDE_LAE_KEY) === "1",
  riskAverages: {
    ytdAverage: null,
    ytdTotal: 0,
    ytdCount: 0,
    last12Average: null,
    last12Total: 0,
    last12Count: 0,
    basisAverage: null,
    unscoredCount: 0,
  },
  storedFilters: {},
  storedDateYears: new Set(),
  storedDateMonths: new Set(),
  openFilterCol: null,
};

async function loadReportsFromDb() {
  const { data, error } = await state.supabase.rpc("csvb_post_inspection_reports_for_me");

  if (error) throw error;

  return (data || []).map((r) => ({
    ...r,
    vessel_name: r.vessel_name || "",
    company_name: r.company_name || ""
  }));
}

function uniqueValuesForCol(col) {
  const vals = (state.reports || [])
    .map((r) => r?.[col] ?? "")
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const uniq = [...new Set(vals)];
  uniq.sort((a, b) => a.localeCompare(b));
  return uniq;
}

function uniqueYearsForDate() {
  const yrs = [];
  for (const r of state.reports || []) {
    const p = parseDateParts(r?.inspection_date);
    if (p.year) yrs.push(p.year);
  }
  return [...new Set(yrs)].sort((a, b) => a.localeCompare(b));
}

function uniqueMonthsForDate() {
  const mos = [];
  for (const r of state.reports || []) {
    const p = parseDateParts(r?.inspection_date);
    if (p.month) mos.push(p.month);
  }
  return [...new Set(mos)].sort((a, b) => a.localeCompare(b));
}

function reportPassesStoredFilters(r) {
  const p = parseDateParts(r?.inspection_date);
  if (state.storedDateYears.size > 0) {
    if (!p.year || !state.storedDateYears.has(p.year)) return false;
  }
  if (state.storedDateMonths.size > 0) {
    if (!p.month || !state.storedDateMonths.has(p.month)) return false;
  }

  for (const col of Object.keys(state.storedFilters)) {
    if (col === "inspection_date") continue;
    const set = state.storedFilters[col];
    if (!(set instanceof Set) || set.size === 0) continue;
    const v = String(r?.[col] ?? "").trim();
    if (!v) return false;
    if (!set.has(v)) return false;
  }
  return true;
}


function canonicalQno(qno) {
  const parts = String(qno || "").trim().split(".").filter(Boolean);
  if (!parts.length) return "";
  return parts.map((p) => String(Number((p.replace(/^0+/, "") || "0")))).join(".");
}

function normDesignation(d) {
  const s = String(d || "").trim().toLowerCase();
  if (s === "human") return "Human";
  if (s === "process") return "Process";
  if (s === "hardware") return "Hardware";
  if (s === "photo" || s === "photograph") return "Photo";
  return String(d || "").trim();
}

const STORED_KPI_HUMAN_PIF_OPTIONS = [
  "1. Recognition of safety criticality of the task or associated steps",
  "2. Custom and practice surrounding use of procedures",
  "3. Procedures accessible, helpful, understood and accurate for task",
  "4. Team dynamics, communications and coordination with others",
  "5. Evidence of stress, workload, fatigue, time constraints",
  "6. Factors such as morale, motivation, nervousness",
  "7. Workplace ergonomics incl. signage, tools, layout, space, noise, light, heat, etc.",
  "8. Human-Machine Interface (E.g.: Controls, Alarms, etc.)",
  "9. Opportunity to learn or practice",
  "10. Not Identified",
];

function normalizeStoredKpiHumanPifText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function storedKpiKind(item) {
  const k = String(item?.obs_type || "").trim().toLowerCase();
  if (k === "negative" || k === "positive" || k === "largely") return k;

  const ot = String(item?.observation_type || "").trim().toLowerCase();
  if (ot === "negative_observation") return "negative";
  if (ot === "positive_observation") return "positive";
  if (ot === "note_improvement") return "largely";
  return "";
}

function storedKpiHumanSoc(item) {
  const rank = String(item?.positive_rank || "").trim();
  if (rank) return rank;

  const sx = String(item?.source_excerpt || "").trim();
  const m = sx.match(/^Human\s+(.+?):/i);
  if (m) return String(m[1] || "").trim();

  return "";
}

function storedKpiHumanPifs(item) {
  const candidates = [];
  const cc = String(item?.classification_coding || "").trim();
  const noc = String(item?.nature_of_concern || "").trim();

  if (cc) candidates.push(...cc.split("|").map((x) => x.trim()).filter(Boolean));
  if (noc) candidates.push(...noc.split("|").map((x) => x.trim()).filter(Boolean));

  const set = new Set(candidates.map(normalizeStoredKpiHumanPifText));

  return STORED_KPI_HUMAN_PIF_OPTIONS.filter((opt) => set.has(normalizeStoredKpiHumanPifText(opt)));
}

function storedKpiSoc(item) {
  const d = normDesignation(item?.designation);
  if (d === "Human") return storedKpiHumanSoc(item);
  return String(item?.classification_coding || "").trim();
}

function storedKpiNoc(item) {
  const d = normDesignation(item?.designation);
  if (d === "Human") return storedKpiHumanPifs(item).join(" | ");
  return String(item?.nature_of_concern || "").trim();
}

function storedKpiUniqueCountMap(items, getter) {
  const map = new Map();
  for (const it of items || []) {
    const val = String(getter(it) || "").trim();
    if (!val) continue;
    map.set(val, (map.get(val) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function storedKpiTopLines(items, getter, limit = 20) {
  const pairs = storedKpiUniqueCountMap(items, getter).slice(0, limit);
  if (!pairs.length) return "—";
  return pairs.map(([k, v]) => `${v} × ${k}`).join("\n");
}

function storedKpiSetValue(id, value) {
  const node = el(id);
  if (node) node.value = String(value ?? "");
}

async function loadStoredKpiReportHeader(reportId) {
  let fallback = (state.reports || []).find((r) => String(r.id) === String(reportId)) || null;

  try {
    const { data, error } = await state.supabase.rpc("csvb_post_inspection_report_by_id_for_me", {
      p_report_id: reportId
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    return row || fallback;
  } catch (e) {
    console.warn("Stored KPI report header RPC unavailable; using list row fallback.", e);
    return fallback;
  }
}

async function loadStoredKpiItems(reportId) {
  const { data, error } = await state.supabase
    .from("post_inspection_observation_items")
    .select("id, report_id, question_no, question_base, observation_type, obs_type, designation, positive_rank, classification_coding, nature_of_concern, observation_text, remarks, source_excerpt, pgno_selected")
    .eq("report_id", reportId);

  if (error) throw error;

  return (data || []).map((row) => ({
    ...row,
    qno: canonicalQno(row.question_no || row.question_base || ""),
    kind: storedKpiKind(row),
    designation: normDesignation(row.designation),
  }));
}

function storedKpiExaminedCount(report, items) {
  const direct = Number(report?.examined_count || 0);
  if (direct > 0) return direct;

  const arr = Array.isArray(report?.examined_questions) ? report.examined_questions : [];
  if (arr.length) return arr.length;

  const uniqueQ = new Set((items || []).map((x) => x.qno).filter(Boolean));
  return uniqueQ.size;
}

function renderStoredKpiDialog(report, items) {
  const byKind = {
    positive: items.filter((x) => x.kind === "positive"),
    largely: items.filter((x) => x.kind === "largely"),
    negative: items.filter((x) => x.kind === "negative"),
  };

  const title = String(report?.report_ref || "").trim() || "Inspection";
  const vessel = String(report?.vessel_name || "").trim() || "—";
  const date = String(report?.inspection_date || "").trim() || "—";
  const company = String(report?.ocimf_inspecting_company || "").trim() || "—";

  el("storedKpiTitle").textContent = `Single Inspection KPIs — ${title}`;
  el("storedKpiSubtitle").textContent = `${vessel} • ${date} • ${company}`;

  storedKpiSetValue("storedKpiQuestionsExamined", storedKpiExaminedCount(report, items));
  storedKpiSetValue("storedKpiTotal", items.length);
  storedKpiSetValue("storedKpiNeg", byKind.negative.length);
  storedKpiSetValue("storedKpiPos", byKind.positive.length);
  storedKpiSetValue("storedKpiLae", byKind.largely.length);

  storedKpiSetValue("storedKpiQuestionsPositive", storedKpiTopLines(byKind.positive, (x) => x.qno));
  storedKpiSetValue("storedKpiQuestionsLargely", storedKpiTopLines(byKind.largely, (x) => x.qno));
  storedKpiSetValue("storedKpiQuestionsNegative", storedKpiTopLines(byKind.negative, (x) => x.qno));

  storedKpiSetValue("storedKpiCategoriesPositive", storedKpiTopLines(byKind.positive, (x) => normDesignation(x.designation)));
  storedKpiSetValue("storedKpiCategoriesLargely", storedKpiTopLines(byKind.largely, (x) => normDesignation(x.designation)));
  storedKpiSetValue("storedKpiCategoriesNegative", storedKpiTopLines(byKind.negative, (x) => normDesignation(x.designation)));

  storedKpiSetValue("storedKpiSocPositive", storedKpiTopLines(byKind.positive, (x) => storedKpiSoc(x)));
  storedKpiSetValue("storedKpiSocLargely", storedKpiTopLines(byKind.largely, (x) => storedKpiSoc(x)));
  storedKpiSetValue("storedKpiSocNegative", storedKpiTopLines(byKind.negative, (x) => storedKpiSoc(x)));

  storedKpiSetValue("storedKpiNocPositive", storedKpiTopLines(byKind.positive, (x) => storedKpiNoc(x)));
  storedKpiSetValue("storedKpiNocLargely", storedKpiTopLines(byKind.largely, (x) => storedKpiNoc(x)));
  storedKpiSetValue("storedKpiNocNegative", storedKpiTopLines(byKind.negative, (x) => storedKpiNoc(x)));

  const openBtn = el("storedKpiOpenInspectionBtn");
  if (openBtn) {
    openBtn.onclick = () => {
      if (!report?.id) return;
      window.location.href = `./post_inspection_detail.html?report_id=${encodeURIComponent(report.id)}`;
    };
  }

  el("storedKpiDialog").showModal();
}

async function openStoredInspectionKpis(reportId) {
  const report = await loadStoredKpiReportHeader(reportId);
  if (!report) throw new Error("Report not found or access denied.");

  const items = await loadStoredKpiItems(reportId);
  renderStoredKpiDialog(report, items);
}



function fmtRiskScore(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

function riskScoresForReport(reportId) {
  const v = state.riskScoresByReport instanceof Map
    ? state.riskScoresByReport.get(String(reportId))
    : null;

  const arr = Array.isArray(v) ? v : (v ? [v] : []);
  const selected = selectedRiskProfileSet();

  if (!selected.size) return arr.slice(0, 3);

  return arr
    .filter((r) => selected.has(String(r.profile_id)))
    .sort((a, b) => {
      const aIdx = (state.selectedRiskProfileIds || []).indexOf(String(a.profile_id));
      const bIdx = (state.selectedRiskProfileIds || []).indexOf(String(b.profile_id));
      return aIdx - bIdx;
    })
    .slice(0, 3);
}

function riskScoreForReport(reportId) {
  return riskScoresForReport(reportId)[0] || null;
}

function riskMiniGaugeHtml(reportId) {
  const risks = riskScoresForReport(reportId);

  if (!risks.length) {
    return '<div class="csvb-risk-mini no-risk"><span class="csvb-risk-mini-label">Risk</span><span class="csvb-risk-mini-value">—</span></div>';
  }

  return '<div class="csvb-risk-mini-stack">' + risks.map((r) => {
    const rawScore = riskScoreNumber(r);
    const score = fmtRiskScore(rawScore);
    const profile = String(r.profile_name || "Risk").trim();

    const profileKey = String(r.profile_id || r.profile_code || r.profile_name || "risk");
    const avg = state.riskAveragesByProfile?.get(profileKey)?.basisAverage ?? state.riskAverages?.basisAverage;

    const ratio = Number.isFinite(rawScore) && Number.isFinite(Number(avg)) && Number(avg) > 0
      ? rawScore / Number(avg)
      : null;

    const title =
      profile +
      " / " +
      String(r.version_label || "") +
      " | Score: " +
      score +
      " | Average basis: " +
      fmtAvgRisk(avg) +
      (ratio == null ? "" : " | Ratio: " + ratio.toFixed(1) + "x") +
      " | Eligible: " +
      String(r.eligible_risk_observations ?? "—") +
      " | Max: " +
      fmtRiskScore(r.max_observation_risk);

    return (
      '<div class="csvb-risk-mini" style="' + esc(riskColourStyle(rawScore, avg)) + '" title="' + esc(title) + '">' +
        '<span class="csvb-risk-mini-label">' + esc(profile) + '</span>' +
        '<span class="csvb-risk-mini-value">' + esc(score) + '</span>' +
        '<span class="csvb-risk-mini-ratio">' + esc(rawScore == null ? "Refresh needed" : (ratio == null ? "avg —" : ratio.toFixed(1) + "× avg")) + '</span>' +
      '</div>'
    );
  }).join("") + '</div>';
}

async function loadCurrentRiskScoresForStoredReports() {
  state.riskScoresByReport = new Map();

  state.includeLargelyInEntryRisk = localStorage.getItem(RISK_INCLUDE_LAE_KEY) === "1";

  const { data, error } = await state.supabase.rpc("csvb_post_inspection_all_profile_risk_scores_for_me_adjusted", {
    p_include_largely_as_expected: !!state.includeLargelyInEntryRisk,
  });

  if (error) {
    console.warn("All-profile adjusted risk scores failed to load.", error);
    return;
  }

  for (const row of data || []) {
    if (!row?.report_id) continue;

    const key = String(row.report_id);
    const arr = state.riskScoresByReport.get(key) || [];
    arr.push(row);
    state.riskScoresByReport.set(key, arr);
  }
}




function loadSelectedRiskProfileIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(RISK_PROFILE_SELECTION_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(String).filter(Boolean).slice(0, 3) : [];
  } catch {
    return [];
  }
}

function saveSelectedRiskProfileIds(ids) {
  const clean = [...new Set((ids || []).map(String).filter(Boolean))].slice(0, 3);
  localStorage.setItem(RISK_PROFILE_SELECTION_KEY, JSON.stringify(clean));
  state.selectedRiskProfileIds = clean;
}

function defaultRiskProfileIds() {
  const profiles = state.riskProfiles || [];

  const preselected = profiles
    .filter((p) => p.show_in_post_inspection === true)
    .sort((a, b) =>
      Number(a.post_inspection_display_order || 999) - Number(b.post_inspection_display_order || 999) ||
      String(a.profile_name || "").localeCompare(String(b.profile_name || ""))
    )
    .map((p) => String(p.profile_id))
    .slice(0, 3);

  if (preselected.length) return preselected;

  return profiles
    .slice()
    .sort((a, b) =>
      (a.is_default === b.is_default ? 0 : a.is_default ? -1 : 1) ||
      String(a.profile_name || "").localeCompare(String(b.profile_name || ""))
    )
    .map((p) => String(p.profile_id))
    .slice(0, 3);
}

async function loadSelectableRiskProfiles() {
  const { data, error } = await state.supabase.rpc("csvb_post_inspection_selectable_risk_profiles_for_me");
  if (error) {
    console.warn("Selectable risk profiles failed to load", error);
    state.riskProfiles = [];
    state.selectedRiskProfileIds = [];
    return;
  }

  state.riskProfiles = data || [];

  const saved = loadSelectedRiskProfileIds();
  const existing = new Set(state.riskProfiles.map((p) => String(p.profile_id)));
  let selected = saved.filter((id) => existing.has(String(id))).slice(0, 3);

  if (!selected.length) {
    selected = defaultRiskProfileIds();
  }

  saveSelectedRiskProfileIds(selected);
}

function selectedRiskProfileSet() {
  return new Set((state.selectedRiskProfileIds || []).map(String).slice(0, 3));
}

function selectedRiskProfileLabel() {
  const selected = selectedRiskProfileSet();
  const labels = (state.riskProfiles || [])
    .filter((p) => selected.has(String(p.profile_id)))
    .map((p) => p.profile_name);

  return labels.length ? labels.join(", ") : "None selected";
}

function riskProfileSelectorHtml() {
  const selected = selectedRiskProfileSet();

  const items = (state.riskProfiles || []).map((p) => {
    const checked = selected.has(String(p.profile_id)) ? "checked" : "";
    return `
      <label class="csvb-risk-profile-option">
        <input type="checkbox" class="csvb-risk-profile-check" value="${esc(p.profile_id)}" ${checked} />
        <span>${esc(p.profile_name)}</span>
      </label>
    `;
  }).join("");

  return `
    <div class="csvb-risk-profile-dropdown" id="riskProfileDrop">
      <button type="button" class="csvb-risk-profile-drop-btn" id="riskProfileDropBtn">
        ${esc(selectedRiskProfileLabel())}
      </button>
      <div class="csvb-risk-profile-drop-panel" id="riskProfileDropPanel">
        <div class="muted" style="font-size:.72rem;margin-bottom:6px;">Select maximum three profiles for operational display.</div>
        ${items || '<div class="muted">No active risk profiles.</div>'}
      </div>
    </div>
  `;
}

function bindRiskProfileSelector() {
  const drop = el("riskProfileDrop");
  const btn = el("riskProfileDropBtn");
  if (!drop || !btn) return;

  btn.onclick = (e) => {
    e.stopPropagation();
    drop.classList.toggle("open");
  };

  drop.onclick = (e) => e.stopPropagation();

  drop.querySelectorAll(".csvb-risk-profile-check").forEach((chk) => {
    chk.onchange = async () => {
      const checked = [...drop.querySelectorAll(".csvb-risk-profile-check:checked")].map((x) => x.value);

      if (checked.length > 3) {
        chk.checked = false;
        alert("Only three Risk Rating Profiles can be displayed at the same time.");
        return;
      }

      saveSelectedRiskProfileIds(checked);

      computeRiskAverages();
      renderRiskAveragePanel();
      renderStoredTable();
    };
  });

  document.addEventListener("click", () => {
    drop.classList.remove("open");
  }, { once: true });
}

function parseInspectionDateForRisk(value) {
  const s = String(value || "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  return null;
}

function riskScoreNumber(row) {
  if (!row || row.inspection_risk_score == null || row.inspection_risk_score === "") return null;
  const n = Number(row.inspection_risk_score);
  return Number.isFinite(n) ? n : null;
}

function computeRiskAverages() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const last12Start = new Date(now);
  last12Start.setMonth(last12Start.getMonth() - 12);

  const selected = selectedRiskProfileSet();
  const byProfile = new Map();

  for (const report of state.reports || []) {
    const allRisks = state.riskScoresByReport instanceof Map
      ? (state.riskScoresByReport.get(String(report.id)) || [])
      : [];

    const risks = (Array.isArray(allRisks) ? allRisks : [allRisks])
      .filter((r) => r && (!selected.size || selected.has(String(r.profile_id))))
      .slice(0, 3);

    const date = parseInspectionDateForRisk(report.inspection_date);

    for (const risk of risks) {
      const score = riskScoreNumber(risk);
      if (score == null) continue;

      const profileKey = String(risk.profile_id || risk.profile_code || risk.profile_name || "risk");
      if (!byProfile.has(profileKey)) byProfile.set(profileKey, []);
      byProfile.get(profileKey).push({ report, risk, score, date });
    }
  }

  function sum(arr) {
    return arr.reduce((acc, x) => acc + (Number(x.score) || 0), 0);
  }

  function avg(arr) {
    return arr.length ? sum(arr) / arr.length : null;
  }

  function calcSet(scored) {
    const ytd = scored.filter((x) => x.date && x.date.getFullYear() === currentYear);
    const last12 = scored.filter((x) => x.date && x.date >= last12Start && x.date <= now);

    return {
      ytdAverage: avg(ytd),
      ytdTotal: sum(ytd),
      ytdCount: ytd.length,

      last12Average: avg(last12),
      last12Total: sum(last12),
      last12Count: last12.length,

      allTimeAverage: avg(scored),
      allTimeTotal: sum(scored),
      allTimeCount: scored.length,

      basisAverage: avg(last12) ?? avg(ytd) ?? avg(scored),
    };
  }

  state.riskAveragesByProfile = new Map();
  for (const [profileKey, arr] of byProfile.entries()) {
    state.riskAveragesByProfile.set(profileKey, calcSet(arr));
  }

  const firstProfileId = (state.selectedRiskProfileIds || [])[0];
  const first = firstProfileId ? state.riskAveragesByProfile.get(String(firstProfileId)) : null;

  state.riskAverages = first || {
    ytdAverage: null,
    ytdTotal: 0,
    ytdCount: 0,
    last12Average: null,
    last12Total: 0,
    last12Count: 0,
    allTimeAverage: null,
    allTimeTotal: 0,
    allTimeCount: 0,
    basisAverage: null,
  };

  return state.riskAverages;
}

function fmtAvgRisk(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

function riskColourStyle(score) {
  const avg = Number(state.riskAverages?.basisAverage);

  if (!Number.isFinite(score) || !Number.isFinite(avg) || avg <= 0) {
    return "--csvb-risk-bg:#f8fbff;--csvb-risk-border:#d6e4f5;--csvb-risk-text:#5e6f86;";
  }

  /*
    Relative colour scale:
    0.00 × avg      = green
    1.00 × avg      = yellow
    2.00 × avg+     = red
  */
  const ratio = Math.max(0, Math.min(2, score / avg));
  const hue = Math.round(120 - (ratio / 2) * 120);

  return [
    `--csvb-risk-bg:hsl(${hue} 95% 84%)`,
    `--csvb-risk-border:hsl(${hue} 78% 42%)`,
    `--csvb-risk-text:#031b3f`
  ].join(";") + ";";
}

function ensureRiskAveragePanel() {
  let panel = el("riskAveragePanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "riskAveragePanel";
  panel.className = "csvb-risk-average-panel";

  const storedCount = el("storedCount");
  const anchor = storedCount?.parentElement || document.querySelector(".card");
  if (anchor && anchor.parentElement) {
    anchor.parentElement.insertBefore(panel, anchor.nextSibling);
  } else {
    document.body.prepend(panel);
  }

  return panel;
}

async function refreshAllRisksForStoredReports() {
  const ok = confirm(
    "Refresh Risk for all accessible stored inspections?\n\n" +
    "This will calculate current risk snapshots for all active Risk Rating Profiles.\n\n" +
    "The Largely A.E. display switch is separate and is not changed by this action."
  );

  if (!ok) return;

  const btn = el("refreshAllRisksBtn");
  const oldText = btn ? btn.textContent : "";

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Refreshing…";
    }

    const { data, error } = await state.supabase.rpc("csvb_refresh_all_post_inspection_risks_for_me");

    if (error) throw error;

    await loadCurrentRiskScoresForStoredReports();
    computeRiskAverages();
    renderRiskAveragePanel();
    renderStoredTable();

    const failed = Number(data?.failed || 0);
    const success = Number(data?.success || 0);
    const total = Number(data?.total_reports || 0);

    if (failed > 0) {
      alert(
        "Risk refresh completed with errors.\n\n" +
        "Total reports: " + total + "\n" +
        "Succeeded: " + success + "\n" +
        "Failed: " + failed + "\n\n" +
        "Check console/logs for details."
      );
      console.warn("Risk refresh errors:", data?.errors || []);
    } else {
      alert(
        "Risk refresh completed.\n\n" +
        "Reports refreshed: " + success + "\n" +
        "Active profiles were recalculated for each report."
      );
    }
  } catch (err) {
    console.error(err);
    alert("Refresh all risks failed: " + (err?.message || String(err)));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText || "Refresh All Risks";
    }
  }
}

function selectedProfileAverageBoxesHtml() {
  const selected = selectedRiskProfileSet();
  const currentYear = new Date().getFullYear();

  const profiles = (state.riskProfiles || [])
    .filter((p) => selected.has(String(p.profile_id)))
    .slice(0, 3);

  if (!profiles.length) {
    return `
      <div class="csvb-risk-average-box csvb-profile-average-box">
        <span>No Risk Profile Selected</span>
        <strong>—</strong>
        <div class="csvb-profile-average-lines">
          <div>Select up to three profiles.</div>
        </div>
      </div>
    `;
  }

  return profiles.map((p) => {
    const key = String(p.profile_id);
    const a = state.riskAveragesByProfile?.get(key) || {};
    const main = a.last12Average ?? a.ytdAverage ?? a.allTimeAverage;

    return `
      <div class="csvb-risk-average-box csvb-profile-average-box">
        <span>${esc(p.profile_name)}</span>
        <strong>${fmtAvgRisk(main)}</strong>
        <div class="csvb-profile-average-lines">
          <div><b>12M:</b> ${fmtAvgRisk(a.last12Average)}</div>
          <div><b>${currentYear}:</b> ${fmtAvgRisk(a.ytdAverage)}</div>
          <div><b>All Time:</b> ${fmtAvgRisk(a.allTimeAverage)}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderRiskAveragePanel() {
  const panel = ensureRiskAveragePanel();
  const checked = !!state.includeLargelyInEntryRisk;

  panel.innerHTML = `
    <div class="csvb-risk-average-title">Risk / Inspection Average</div>
    <div class="csvb-risk-average-grid csvb-risk-average-grid-operational">
      ${selectedProfileAverageBoxesHtml()}

      <div class="csvb-risk-average-box csvb-risk-profile-select-box">
        <span>Risk Profiles Displayed</span>
        ${riskProfileSelectorHtml()}
        <em>Maximum three profiles. Applies to all Post-Inspection pages.</em>
      </div>

      <div class="csvb-risk-average-box csvb-risk-lae-switch-box">
        <span>Largely A.E. Display</span>
        <label class="csvb-risk-switch">
          <input id="includeLargelyRiskSwitch" type="checkbox" ${checked ? "checked" : ""} />
          <b>Include at 50%</b>
        </label>
        <em>Display recalculation only. Does not store new snapshots.</em>
      </div>

      <div class="csvb-risk-average-box csvb-risk-bulk-refresh-box">
        <span>Bulk Risk Refresh</span>
        <button class="btn muted csvb-refresh-all-risk-btn" id="refreshAllRisksBtn" type="button">Refresh All Risks</button>
        <em>Stores current snapshots for all active profiles and inspections.</em>
      </div>
    </div>
  `;

  bindRiskProfileSelector();

  const sw = el("includeLargelyRiskSwitch");
  if (sw) {
    sw.onchange = async () => {
      localStorage.setItem(RISK_INCLUDE_LAE_KEY, sw.checked ? "1" : "0");
      state.includeLargelyInEntryRisk = sw.checked;

      await loadCurrentRiskScoresForStoredReports();
      computeRiskAverages();
      renderRiskAveragePanel();
      renderStoredTable();
    };
  }

  const btn = el("refreshAllRisksBtn");
  if (btn) {
    btn.onclick = refreshAllRisksForStoredReports;
  }
}

function renderStoredTable() {
  const body = el("storedTableBody");
  const rows = (state.reports || []).filter(reportPassesStoredFilters);

  renderRiskAveragePanel();

  el("storedCount").textContent = `${rows.length} inspection(s)`;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="9" class="muted">No inspections found.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map((r) => `
      <tr class="stored-row" data-id="${esc(r.id)}">
        <td class="vessel-bold" title="${esc(r.vessel_name || "")}">${esc(r.vessel_name || "—")}</td>
        <td>${esc(r.inspection_date || "—")}</td>
        <td title="${esc(r.report_ref || "")}">${esc(r.report_ref || "—")}</td>
        <td title="${esc(r.title || "")}">${esc(r.title || "—")}</td>
        <td title="${esc(r.ocimf_inspecting_company || "")}">${esc(r.ocimf_inspecting_company || "—")}</td>
        <td title="${esc(r.inspector_name || "")}">${esc(r.inspector_name || "—")}</td>
        <td title="${esc(r.inspector_company || "")}">${esc(r.inspector_company || "—")}</td>
        <td>${riskMiniGaugeHtml(r.id)}</td>
        <td>
          <button class="btn muted stored-kpi-btn" type="button" data-kpi-id="${esc(r.id)}" title="Quick KPI view for this inspection.">KPIs</button>
        </td>
      </tr>
    `)
    .join("");

  body.querySelectorAll(".stored-kpi-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const reportId = btn.getAttribute("data-kpi-id");
      if (!reportId) return;

      try {
        btn.disabled = true;
        btn.textContent = "Loading…";
        await openStoredInspectionKpis(reportId);
      } catch (err) {
        console.error(err);
        alert("KPI quick view failed: " + (err?.message || String(err)));
      } finally {
        btn.disabled = false;
        btn.textContent = "KPIs";
      }
    });
  });

  body.querySelectorAll("tr.stored-row").forEach((tr) => {
    tr.addEventListener("click", () => {
      const id = tr.getAttribute("data-id");
      if (!id) return;
      window.location.href = `./post_inspection_detail.html?report_id=${encodeURIComponent(id)}`;
    });
  });
}

function closeStoredFilterDialog() {
  try {
    el("storedFilterDialog").close();
  } catch {}
  state.openFilterCol = null;
}

function renderStoredDateFilterUI() {
  const wrap = el("storedFilterList");
  const years = uniqueYearsForDate();
  const months = uniqueMonthsForDate();

  const monthName = (mm) => {
    const map = {
      "01":"Jan","02":"Feb","03":"Mar","04":"Apr","05":"May","06":"Jun",
      "07":"Jul","08":"Aug","09":"Sep","10":"Oct","11":"Nov","12":"Dec"
    };
    return map[mm] || mm;
  };

  const yearHtml = years.length
    ? years.map((y) => `
      <label class="chk-row">
        <input type="checkbox" class="storedDateYearChk" data-year="${esc(y)}" ${state.storedDateYears.has(y) ? "checked" : ""}/>
        <span>${esc(y)}</span>
      </label>
    `).join("")
    : `<div class="muted" style="padding:8px;">No years.</div>`;

  const monthHtml = months.length
    ? months.map((m) => `
      <label class="chk-row">
        <input type="checkbox" class="storedDateMonthChk" data-month="${esc(m)}" ${state.storedDateMonths.has(m) ? "checked" : ""}/>
        <span>${esc(m)} — ${esc(monthName(m))}</span>
      </label>
    `).join("")
    : `<div class="muted" style="padding:8px;">No months.</div>`;

  wrap.innerHTML = `
    <div class="date-filter-grid">
      <div class="date-filter-card">
        <h4>Year</h4>
        <div class="chk-list">${yearHtml}</div>
      </div>
      <div class="date-filter-card">
        <h4>Month</h4>
        <div class="chk-list">${monthHtml}</div>
      </div>
    </div>
  `;

  wrap.querySelectorAll(".storedDateYearChk").forEach((chk) => {
    chk.addEventListener("change", () => {
      const y = chk.getAttribute("data-year");
      if (!y) return;
      if (chk.checked) state.storedDateYears.add(y);
      else state.storedDateYears.delete(y);
    });
  });

  wrap.querySelectorAll(".storedDateMonthChk").forEach((chk) => {
    const m = chk.getAttribute("data-month");
    chk.addEventListener("change", () => {
      if (!m) return;
      if (chk.checked) state.storedDateMonths.add(m);
      else state.storedDateMonths.delete(m);
    });
  });
}

function renderStoredFilterList(values, selectedSet, searchTerm) {
  const box = el("storedFilterList");
  box.className = "chk-list";

  const term = String(searchTerm || "").trim().toLowerCase();
  const filtered = !term ? values : values.filter((v) => String(v).toLowerCase().includes(term));

  if (!filtered.length) {
    box.innerHTML = `<div class="muted" style="padding:8px;">No values.</div>`;
    return;
  }

  box.innerHTML = filtered.map((v) => `
    <label class="chk-row">
      <input type="checkbox" class="storedFilterChk" data-val="${esc(v)}" ${selectedSet.has(v) ? "checked" : ""}/>
      <span>${esc(v)}</span>
    </label>
  `).join("");

  box.querySelectorAll(".storedFilterChk").forEach((chk) => {
    chk.addEventListener("change", () => {
      const v = chk.getAttribute("data-val");
      if (!v) return;
      if (chk.checked) selectedSet.add(v);
      else selectedSet.delete(v);
    });
  });
}

function openStoredFilterForCol(col) {
  if (state.openFilterCol === col && el("storedFilterDialog").open) {
    closeStoredFilterDialog();
    return;
  }

  state.openFilterCol = col;

  const titleMap = {
    vessel_name: "Vessel",
    inspection_date: "Date (Year + Month)",
    title: "Title",
    ocimf_inspecting_company: "OCIMF Inspecting Company",
    inspector_name: "Inspector Name",
    inspector_company: "Inspector’s Company",
  };

  el("storedFilterTitle").textContent = titleMap[col] || "Filters";

  if (col === "inspection_date") {
    el("storedFilterSub").textContent = "Tick Year and/or Month. Leave both empty = no filtering.";
    el("storedFilterSearch").style.display = "none";
    renderStoredDateFilterUI();
  } else {
    el("storedFilterSub").textContent = "Select values to include. Leave empty = no filtering.";
    el("storedFilterSearch").style.display = "block";
    el("storedFilterSearch").value = "";
    const values = uniqueValuesForCol(col);
    const set = state.storedFilters[col] instanceof Set ? state.storedFilters[col] : new Set();
    state.storedFilters[col] = set;
    renderStoredFilterList(values, set, "");
  }

  el("storedFilterDialog").showModal();
}

async function init() {
  el("buildPill").textContent = `build: ${POST_INSPECTION_INDEX_BUILD}`;

  const ok = await waitForAuth(5000);
  if (!ok) throw new Error("AUTH not loaded.");

  state.supabase = window.AUTH.ensureSupabase();

  const R = window.AUTH.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN, R.COMPANY_SUPERINTENDENT].filter(Boolean));
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  el("dashboardBtn").addEventListener("click", async () => {
    await safeNavigate(["./q-dashboard.html", "./dashboard.html", "./su-admin.html", "./index.html", "./"]);
  });

  el("modeSelectBtn").addEventListener("click", async () => {
    await safeNavigate(["./mode_selection.html", "./mode-selection.html", "./index.html", "./"]);
  });

  el("newReportBtn").addEventListener("click", () => {
    window.location.href = "./post_inspection_detail.html";
  });

  el("clearStoredFiltersBtn").addEventListener("click", () => {
    state.storedFilters = {};
    state.storedDateYears = new Set();
    state.storedDateMonths = new Set();
    renderStoredTable();
  });

  document.querySelectorAll(".filter-btn[data-filter-col]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const col = btn.getAttribute("data-filter-col");
      if (!col) return;
      openStoredFilterForCol(col);
    });
  });

  el("storedFilterSearch").addEventListener("input", () => {
    const col = state.openFilterCol;
    if (!col || col === "inspection_date") return;
    const values = uniqueValuesForCol(col);
    const set = state.storedFilters[col] instanceof Set ? state.storedFilters[col] : new Set();
    renderStoredFilterList(values, set, el("storedFilterSearch").value);
    state.storedFilters[col] = set;
  });

  el("storedFilterClearBtn").addEventListener("click", () => {
    const col = state.openFilterCol;
    if (!col) return;
    if (col === "inspection_date") {
      state.storedDateYears = new Set();
      state.storedDateMonths = new Set();
      renderStoredDateFilterUI();
      return;
    }
    state.storedFilters[col] = new Set();
    renderStoredFilterList(uniqueValuesForCol(col), state.storedFilters[col], el("storedFilterSearch").value);
  });

  el("storedFilterApplyBtn").addEventListener("click", () => {
    closeStoredFilterDialog();
    renderStoredTable();
  });

  state.reports = await loadReportsFromDb();

  /*
    Risk display must never block the stored inspection list.
    If Risk/Largely A.E. recalculation fails, show inspections anyway.
  */
  try {
    await loadSelectableRiskProfiles();
    await loadCurrentRiskScoresForStoredReports();
    computeRiskAverages();
    renderRiskAveragePanel();
  } catch (riskErr) {
    console.warn("Risk average display failed; stored inspection list will still load.", riskErr);
    state.riskScoresByReport = new Map();
    state.riskAverages = {
      ytdAverage: null,
      ytdTotal: 0,
      ytdCount: 0,
      last12Average: null,
      last12Total: 0,
      last12Count: 0,
      basisAverage: null,
      unscoredCount: 0,
    };
  }

  renderStoredTable();
}

(async () => {
  try {
    await init();
  } catch (e) {
    console.error(e);
    alert("Post-Inspection index failed to load: " + (e?.message || String(e)));
  }
})();