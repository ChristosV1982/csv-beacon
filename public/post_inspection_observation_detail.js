import { loadLockedLibraryJson } from "./question_library_loader.js";

const OBS_DETAIL_BUILD = "post_inspection_observation_detail_v26_lae_percent_detail_fix_2026-05-22";







function csvbLargelyAeDisplayFactor() {
  const raw = localStorage.getItem("csvb_post_entry_largely_ae_percent");
  const n = Number(raw == null || raw === "" ? 50 : raw);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(100, n)) / 100;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* CSVB_OBS_DETAIL_ROWCLASS_HOTFIX_V22_START */

function csvbObsCompatKind(row = null) {
  return String(
    (typeof state !== "undefined" && state?.item?.obs_type) ||
    (typeof state !== "undefined" && state?.item?.kind) ||
    row?.finding_type ||
    ""
  ).trim().toLowerCase();
}

function csvbObservationRowClass(row = null) {
  const k = csvbObsCompatKind(row);
  if (k === "negative") return "csvb-obs-risk-row-neg";
  if (k === "largely") return "csvb-obs-risk-row-lae";
  if (k === "positive") return "csvb-obs-risk-row-pos";
  return "csvb-obs-risk-row-neutral";
}

/* CSVB_OBS_DETAIL_ROWCLASS_HOTFIX_V22_END */

const CSVB_RISK_PROFILE_SELECTION_KEY = "csvb_post_entry_visible_risk_profile_ids";

function csvbSelectedRiskProfileIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(CSVB_RISK_PROFILE_SELECTION_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(String).filter(Boolean).slice(0, 3) : [];
  } catch {
    return [];
  }
}

function csvbFilterSelectedRiskRows(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  const ids = csvbSelectedRiskProfileIds();

  if (!ids.length) return arr.slice(0, 3);

  const selected = new Set(ids);

  return arr
    .filter((r) => selected.has(String(r.profile_id)))
    .sort((a, b) => ids.indexOf(String(a.profile_id)) - ids.indexOf(String(b.profile_id)))
    .slice(0, 3);
}

function csvbRiskNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function csvbRiskText(value) {
  const n = csvbRiskNumber(value);
  return n == null ? "—" : n.toFixed(1);
}

const HUMAN_POSITIVE_FIXED_NOC = "Exceeded normal expectation.";
const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

const DEFAULT_WORKFLOW_SETTINGS = {
  coordinator_roles: ["super_admin", "company_admin", "company_superintendent"],
  responsible_roles: ["super_admin", "company_admin", "company_superintendent", "vessel"],
  verifier_roles: ["super_admin", "company_admin", "company_superintendent"],
};

function el(id) {
  return document.getElementById(id);
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

function canonicalQno(qno) {
  const parts = String(qno || "").trim().split(".").filter(Boolean);
  if (!parts.length) return "";
  return parts.map((p) => String(Number((p.replace(/^0+/, "") || "0")))).join(".");
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return "";
}

function getQno(q) {
  return String(pick(q, ["No.", "No", "question_no", "QuestionNo", "Question ID"])).trim();
}

function normDesignation(d) {
  const s = String(d || "").trim().toLowerCase();
  if (s === "human") return "Human";
  if (s === "process") return "Process";
  if (s === "hardware") return "Hardware";
  if (s === "photo") return "Photo";
  return String(d || "").trim();
}

function obsRowTypeLabel(kind) {
  if (kind === "negative") return `<span class="obs-badge neg">Negative</span>`;
  if (kind === "positive") return `<span class="obs-badge pos">Positive</span>`;
  return `<span class="obs-badge lae">Largely</span>`;
}

function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function setSaveStatus(text) {
  el("saveStatus").textContent = text || "Not saved";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseIsoDateOnly(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function diffDaysFromToday(dateIso) {
  const target = parseIsoDateOnly(dateIso);
  if (!target) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const ms = today.getTime() - target.getTime();
  return Math.floor(ms / 86400000);
}

function isClosedStatus(status) {
  return String(status || "").trim().toLowerCase() === "closed";
}

function getWorkflowStatusSnapshot() {
  const status = el("responseStatus") ? String(el("responseStatus").value || "") : String(state.item?.response_status || "");
  const targetDate = el("targetDate") ? String(el("targetDate").value || "") : String(state.item?.target_date || "");

  const overdueDays = diffDaysFromToday(targetDate);
  const isOverdue = !isClosedStatus(status) && overdueDays != null && overdueDays > 0;

  return {
    status: status || "Open",
    targetDate,
    overdueDays,
    isOverdue,
  };
}

function ensureWorkflowBadgeArea() {
  let area = el("workflowBadgeArea");
  if (area) return area;

  area = document.createElement("div");
  area.id = "workflowBadgeArea";
  area.style.marginTop = "10px";
  area.style.display = "flex";
  area.style.flexWrap = "wrap";
  area.style.gap = "8px";
  area.style.alignItems = "center";

  const anchor =
    el("obsCategoryLabel") ||
    el("obsQuestionLabel") ||
    el("obsTypeBadge");

  if (anchor && anchor.parentElement) {
    anchor.parentElement.appendChild(area);
  } else {
    document.body.prepend(area);
  }

  return area;
}

function pillHtml(text, bg, fg = "#111827", border = "#d1d5db") {
  return `
    <span style="
      display:inline-flex;
      align-items:center;
      gap:6px;
      border:1px solid ${border};
      background:${bg};
      color:${fg};
      border-radius:999px;
      padding:4px 10px;
      font-size:12px;
      font-weight:700;
      line-height:1.2;
      white-space:nowrap;
    ">${text}</span>
  `;
}

function renderWorkflowBadges() {
  const area = ensureWorkflowBadgeArea();
  const snap = getWorkflowStatusSnapshot();

  let overdueHtml = "";
  if (snap.isOverdue) {
    overdueHtml = pillHtml(`OVERDUE ${snap.overdueDays} DAY${snap.overdueDays === 1 ? "" : "S"}`, "#fee2e2", "#991b1b", "#fecaca");
  } else if (isClosedStatus(snap.status)) {
    overdueHtml = pillHtml("NOT OVERDUE — CLOSED", "#dcfce7", "#166534", "#bbf7d0");
  } else if (snap.targetDate) {
    overdueHtml = pillHtml("NOT OVERDUE", "#e0f2fe", "#075985", "#bae6fd");
  } else {
    overdueHtml = pillHtml("NO TARGET DATE", "#f3f4f6", "#374151", "#d1d5db");
  }

  area.innerHTML = `
    ${pillHtml(`STATUS: ${snap.status || "Open"}`, "#f8fafc", "#111827", "#cbd5e1")}
    ${overdueHtml}
  `;
}

function normalizeRoleList(value, fallback) {
  if (Array.isArray(value)) return value.map((x) => String(x || "").trim()).filter(Boolean);
  return fallback;
}

async function loadWorkflowSettings() {
  const settings = { ...DEFAULT_WORKFLOW_SETTINGS };

  try {
    const { data, error } = await state.supabase
      .from("post_inspection_workflow_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["coordinator_roles", "responsible_roles", "verifier_roles"]);

    if (error) {
      console.warn("Workflow settings unavailable. Using defaults.", error);
      return settings;
    }

    for (const row of data || []) {
      if (!row?.setting_key) continue;
      settings[row.setting_key] = normalizeRoleList(
        row.setting_value,
        settings[row.setting_key] || []
      );
    }

    return settings;
  } catch (e) {
    console.warn("Workflow settings load failed. Using defaults.", e);
    return settings;
  }
}

const HUMAN_PIF_OPTIONS = [
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

function isHumanPositive(item) {
  return normDesignation(item?.designation) === "Human" &&
         String(item?.obs_type || "").trim().toLowerCase() === "positive";
}

function humanSocFromItem(item) {
  const direct = String(item?.positive_rank || "").trim();
  if (direct) return direct;

  const sx = String(item?.source_excerpt || "").trim();
  const m = sx.match(/^Human\s+(.+?):/i);
  if (m) return String(m[1] || "").trim();

  return "";
}

function normalizeHumanPifText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function humanPifsFromItem(item) {
  const candidates = [];
  const cc = String(item?.classification_coding || "").trim();
  const noc = String(item?.nature_of_concern || "").trim();

  if (cc) candidates.push(...cc.split("|").map((x) => x.trim()).filter(Boolean));
  if (noc) candidates.push(...noc.split("|").map((x) => x.trim()).filter(Boolean));

  const candidateSet = new Set(candidates.map(normalizeHumanPifText));

  return HUMAN_PIF_OPTIONS.filter((opt) => candidateSet.has(normalizeHumanPifText(opt)));
}

function socDisplay(item) {
  const d = normDesignation(item?.designation);
  if (d === "Human") return humanSocFromItem(item);
  return String(item?.classification_coding || "").trim();
}

function nocDisplay(item) {
  const d = normDesignation(item?.designation);

  if (d === "Human") {
    /*
      Human NOC = PIF(s), including positive Human observations.
      "Exceeded normal expectation." is the response result, not the NOC.
    */
    return humanPifsFromItem(item).join(" | ");
  }

  return String(item?.nature_of_concern || "").trim();
}

function supportingCommentDisplay(item) {
  return String(item?.observation_text || item?.remarks || "").trim();
}

function itemNeedsPgno(item) {
  return item?.obs_type === "negative" || item?.obs_type === "largely";
}

const state = {
  me: null,
  supabase: null,
  report: null,
  item: null,
  observationRisks: [],
  users: [],
  workflowSettings: { ...DEFAULT_WORKFLOW_SETTINGS },
  lib: [],
  libByNo: new Map(),
  libCanonToExact: new Map(),
};

async function loadReportById(reportId) {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .select("*")
    .eq("id", reportId)
    .single();
  if (error) throw error;
  return data;
}

async function loadUsers() {
  const { data, error } = await state.supabase
    .from("profiles")
    .select("id, username, role")
    .order("username", { ascending: true });

  if (error) throw error;
  return data || [];
}

function userAllowedForRoles(user, allowedRoles) {
  const role = String(user?.role || "").trim();
  return allowedRoles.includes(role);
}

function renderUserSelect(selectId, selectedValue, allowedRoles) {
  const sel = el(selectId);
  sel.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "— Select user —";
  sel.appendChild(empty);

  const roleList = Array.isArray(allowedRoles) && allowedRoles.length
    ? allowedRoles
    : ["super_admin", "company_admin", "company_superintendent", "vessel"];

  for (const u of state.users || []) {
    if (!userAllowedForRoles(u, roleList)) continue;

    const o = document.createElement("option");
    o.value = u.id;
    o.textContent = `${u.username || "Unnamed"}${u.role ? ` (${u.role})` : ""}`;
    sel.appendChild(o);
  }

  sel.value = selectedValue || "";
}

async function loadObservationItem(reportId, itemId) {
  if (!String(itemId).startsWith("legacy-")) {
    const { data, error } = await state.supabase
      .from("post_inspection_observation_items")
      .select("*")
      .eq("id", itemId)
      .eq("report_id", reportId)
      .single();
    if (!error && data) return data;
  }

  const { data, error } = await state.supabase
    .from("post_inspection_observations")
    .select("*")
    .eq("report_id", reportId);
  if (error) throw error;

  const rows = (data || []).map((row, idx) => ({
    id: `legacy-${reportId}-${row.question_no}-${idx}`,
    ...row,
    question_no: canonicalQno(row.question_no || row.question_base || ""),
    question_base: canonicalQno(row.question_base || row.question_no || ""),
    obs_type: row.obs_type ||
      (row.observation_type === "negative_observation" ? "negative" :
       row.observation_type === "positive_observation" ? "positive" : "largely"),
  }));

  return rows.find((x) => String(x.id) === String(itemId)) || null;
}


async function loadSelectedObservationRisks() {
  state.observationRisks = [];

  const item = state.item;
  if (!item || !item.id || String(item.id).startsWith("legacy-")) {
    renderObservationRisk();
    return [];
  }

  const { data, error } = await state.supabase.rpc("csvb_pi_obs_risks_for_item", {
    p_observation_item_id: item.id,
  });

  if (error) {
    console.warn("Observation risk scores failed to load", error);
    renderObservationRisk();
    return [];
  }

  state.observationRisks = csvbFilterSelectedRiskRows(data || []);
  renderObservationRisk();
  return state.observationRisks;
}

function ensureObservationRiskCard() {
  let card = document.getElementById("observationRiskCard");
  if (card) return card;

  card = document.createElement("div");
  card.className = "pi-card csvb-risk-card";
  card.id = "observationRiskCard";
  card.innerHTML = `
    <h2>Risk Evaluation</h2>
    <div class="muted" id="observationRiskProfileLine">No stored observation risk score yet.</div>

    <div class="csvb-observation-risk-grid">
      <div class="csvb-risk-dial">
        <div class="csvb-risk-dial-label">Observation Risk Score</div>
        <div class="csvb-risk-dial-value" id="observationRiskScoreVal">—</div>
        <div class="csvb-risk-dial-sub" id="observationRiskIncludedVal">—</div>
      </div>
      <div class="csvb-risk-metric"><label>Finding type factor</label><div id="observationFindingFactorVal">—</div></div>
      <div class="csvb-risk-metric"><label>Question type weight</label><div id="observationQuestionWeightVal">—</div></div>
      <div class="csvb-risk-metric"><label>NOC score</label><div id="observationNocScoreVal">—</div></div>
      <div class="csvb-risk-metric"><label>Vessel age factor</label><div id="observationAgeFactorVal">—</div></div>
      <div class="csvb-risk-metric"><label>Repetition factor</label><div id="observationRepetitionFactorVal">—</div></div>
    </div>

    <div id="observationRiskProfilesArea" class="csvb-observation-risk-profile-list"></div>
  `;

  const pgno = document.querySelector("#pgnoSelectorArea")?.closest(".pi-card");
  if (pgno && pgno.parentElement) {
    pgno.parentElement.insertBefore(card, pgno);
  } else {
    document.querySelector("main")?.prepend(card);
  }

  return card;
}


function csvbObservationKind(row = null) {
  return String(
    state.item?.obs_type ||
    state.item?.kind ||
    row?.finding_type ||
    ""
  ).trim().toLowerCase();
}

function csvbDisplayedObservationRisk(row) {
  const kind = csvbObservationKind(row);

  if (kind === "positive") return null;

  /*
    Largely A.E. display risk is shown locally at 50%.
    It is not included in the inspection risk total unless the Entry page switch is used.
  */
  if (kind === "largely") {
    const qWeight = csvbRiskNumber(row?.question_type_weight);
    const nocScore = csvbRiskNumber(row?.noc_score);
    const ageFactor = csvbRiskNumber(row?.vessel_age_factor);
    const repFactor = csvbRiskNumber(row?.repetition_factor);

    if (
      qWeight != null &&
      nocScore != null &&
      ageFactor != null &&
      repFactor != null
    ) {
      return csvbLargelyAeDisplayFactor() * qWeight * nocScore * ageFactor * repFactor;
    }
  }

  return csvbRiskNumber(row?.observation_risk_score);
}

function csvbObservationRiskTileClass(row = null) {
  const kind = csvbObservationKind(row);

  if (kind === "negative") return "csvb-observation-risk-profile-tile-neg";
  if (kind === "largely") return "csvb-observation-risk-profile-tile-lae";
  if (kind === "positive") return "csvb-observation-risk-profile-tile-pos";

  return "csvb-observation-risk-profile-tile-neutral";
}

function csvbObservationFactorStripHtml(row) {
  if (!row) return "";

  return `
    <div class="csvb-observation-factor-strip">
      <span><b>Finding:</b> ${esc(csvbRiskText(row.finding_type_factor))}</span>
      <span><b>Q Weight:</b> ${esc(csvbRiskText(row.question_type_weight))}</span>
      <span><b>NOC:</b> ${esc(csvbRiskText(row.noc_score))}</span>
      <span><b>Age:</b> ${esc(csvbRiskText(row.vessel_age_factor))}</span>
      <span><b>Repeat:</b> ${esc(csvbRiskText(row.repetition_factor))}</span>
    </div>
  `;
}

function renderObservationRisk() {
  const card = document.getElementById("observationRiskCard");
  if (!card) return;

  const risks = Array.isArray(state.observationRisks) ? state.observationRisks : [];

  let line = document.getElementById("observationRiskProfileLine");
  let area = document.getElementById("observationRiskProfilesArea");

  if (!line) {
    line = document.createElement("div");
    line.className = "muted";
    line.id = "observationRiskProfileLine";
    card.appendChild(line);
  }

  if (!area) {
    area = document.createElement("div");
    area.id = "observationRiskProfilesArea";
    area.className = "csvb-observation-risk-profile-list";
    card.appendChild(area);
  }

  let refreshBtn = document.getElementById("csvbObservationRiskMiniRefresh");
  if (!refreshBtn) {
    const bar = document.createElement("div");
    bar.className = "csvb-observation-risk-action-bar";
    bar.innerHTML = `
      <button type="button" id="csvbObservationRiskMiniRefresh" class="csvb-observation-risk-mini-refresh" title="Refresh">↻</button>
    `;
    card.insertBefore(bar, card.firstChild);
    refreshBtn = document.getElementById("csvbObservationRiskMiniRefresh");
  }

  refreshBtn.onclick = async () => {
    refreshBtn.disabled = true;
    try {
      
    } finally {
      refreshBtn.disabled = false;
    }
  };

  const grid = card.querySelector(".csvb-observation-risk-grid");
  if (grid) grid.style.display = "none";

  if (!risks.length) {
    line.textContent = "No selected observation risk profile snapshot found. Use Bulk Risk Refresh if needed.";
    area.innerHTML = `
      <div class="csvb-obs-risk-empty">No stored observation risk score yet.</div>
    `;
    return;
  }

  const calculated = risks[0]?.calculated_at
    ? String(risks[0].calculated_at).replace("T", " ").slice(0, 19)
    : "—";

  line.textContent = `Selected risk profiles: ${risks.length} • Current snapshot • ${calculated}`;

  const header = `
    <div class="csvb-obs-risk-table-head">
      <div>Risk Profile</div>
      <div>Observation Risk Score</div>
      <div>Finding type factor</div>
      <div>Question type weight</div>
      <div>NOC score</div>
      <div>Vessel age factor</div>
      <div>Repetition factor</div>
    </div>
  `;

  const rows = risks.map((r) => {
    const kind = csvbObservationKind(r);
    const rowClass = csvbObservationRowClass(r);
    const displayRisk = csvbDisplayedObservationRisk(r);
    const scoreText = kind === "positive" ? "N/A" : csvbRiskText(displayRisk);

    return `
      <div class="csvb-obs-risk-table-row ${rowClass}">
        <div class="csvb-obs-risk-profile-name">${esc(r.profile_name || "Risk Profile")}</div>
        <div>${esc(scoreText)}</div>
        <div>${esc(csvbRiskText(r.finding_type_factor))}</div>
        <div>${esc(csvbRiskText(r.question_type_weight))}</div>
        <div>${esc(csvbRiskText(r.noc_score))}</div>
        <div>${esc(csvbRiskText(r.vessel_age_factor))}</div>
        <div>${esc(csvbRiskText(r.repetition_factor))}</div>
      </div>
    `;
  }).join("");

  area.innerHTML = `
    <div class="csvb-obs-risk-table-wrap">
      ${header}
      ${rows}
    </div>
  `;
}

function renderObservation() {
  const item = state.item;
  if (!item) return;

  el("obsTypeBadge").innerHTML = obsRowTypeLabel(String(item.obs_type || "").trim());
  el("obsQuestionLabel").textContent = `Question ${canonicalQno(item.question_no || item.question_base || "")}`;
  el("obsCategoryLabel").textContent = normDesignation(item.designation) || "—";

  el("socField").value = socDisplay(item) || "";
  el("nocField").value = nocDisplay(item) || "";
  el("questionFullField").value = String(item.question_full || "").trim() || "";
  el("supportingCommentField").value = supportingCommentDisplay(item) || "";

  renderWorkflowBadges();
}

function setToggleOpen(wrapId, open) {
  const wrap = el(wrapId);
  if (!wrap) return;
  wrap.classList.toggle("open", !!open);
}

function openSubcommentsIfDataExists() {
  const pairs = [
    ["immediateCauseSubWrap", "immediateCauseComments"],
    ["rootCauseSubWrap", "rootCauseComments"],
    ["correctiveActionSubWrap", "correctiveActionComments"],
    ["preventativeActionSubWrap", "preventativeActionComments"],
  ];

  for (const [wrapId, fieldId] of pairs) {
    const hasData = String(el(fieldId)?.value || "").trim().length > 0;
    setToggleOpen(wrapId, hasData);
  }
}

function getClosedMetaText(item) {
  const closedById = String(item?.closed_by_user_id || "").trim();
  const closedAt = String(item?.closed_at || "").trim();

  const user = (state.users || []).find((u) => String(u.id) === closedById);
  const username = user?.username || "";

  if (!username && !closedAt) return "";

  if (username && closedAt) return `${username} / ${closedAt}`;
  if (username) return username;
  return closedAt;
}

function loadResponseFields() {
  const item = state.item;
  if (!item) return;

  el("responseStatus").value = String(item.response_status || "Open");

  renderUserSelect(
    "responsiblePerson",
    item.responsible_person_id || "",
    state.workflowSettings.responsible_roles
  );

  renderUserSelect(
    "verifierPerson",
    item.verifier_person_id || "",
    state.workflowSettings.verifier_roles
  );

  el("targetDate").value = String(item.target_date || "");
  el("closeOutDate").value = String(item.close_out_date || "");
  el("closedMeta").value = getClosedMetaText(item);

  el("immediateCause").value = String(item.immediate_cause || "");
  el("immediateCauseComments").value = String(item.immediate_cause_subcomments || "");
  el("rootCause").value = String(item.root_cause || "");
  el("rootCauseComments").value = String(item.root_cause_subcomments || "");
  el("correctiveAction").value = String(item.corrective_action || "");
  el("correctiveActionComments").value = String(item.corrective_action_subcomments || "");
  el("preventativeAction").value = String(item.preventative_action || "");
  el("preventativeActionComments").value = String(item.preventative_action_subcomments || "");

  openSubcommentsIfDataExists();
  renderWorkflowBadges();
}

function getPgnoBullets(questionObj) {
  const bullets = Array.isArray(questionObj?.NegObs_Bullets) ? questionObj.NegObs_Bullets : null;
  if (bullets && bullets.length) {
    return bullets.map((t) => String(t || "").trim()).filter(Boolean);
  }

  const pgTxt = String(questionObj?.["Potential Grounds for Negative Observations"] || "").trim();
  if (!pgTxt) return [];

  const rawLines = pgTxt
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const merged = [];
  let current = "";

  function startsNewPgno(line) {
    return (
      /^[-•*]\s+/.test(line) ||
      /^\d+[\).]\s+/.test(line) ||
      /^PGNO\s*\d+/i.test(line)
    );
  }

  function cleanPgnoLine(line) {
    return String(line || "")
      .replace(/^[-•*]\s+/, "")
      .replace(/^\d+[\).]\s+/, "")
      .replace(/^PGNO\s*\d+\s*[:.)-]?\s*/i, "")
      .trim();
  }

  for (const line of rawLines) {
    const cleaned = cleanPgnoLine(line);
    if (!cleaned) continue;

    if (!current) {
      current = cleaned;
      continue;
    }

    if (startsNewPgno(line)) {
      merged.push(current.trim());
      current = cleaned;
    } else {
      current = `${current} ${cleaned}`.trim();
    }
  }

  if (current) merged.push(current.trim());

  return merged.filter((s) => s.length > 6);
}

function findQuestionFromLibrary(qnoCanon) {
  const exact = state.libCanonToExact.get(qnoCanon) || qnoCanon;
  return state.libByNo.get(exact) || null;
}

function buildPgnoOptions(questionObj, item) {
  const exactQno = getQno(questionObj) || canonicalQno(item.question_no || item.question_base || "");
  const bullets = getPgnoBullets(questionObj);

  return bullets.map((text, idx) => ({
    pgno_no: `${exactQno}.${String(idx + 1).padStart(2, "0")}`,
    text: String(text || "").trim(),
  }));
}

function renderPgnoSelector() {
  const item = state.item;
  const area = el("pgnoSelectorArea");
  if (!item) {
    area.innerHTML = `<div class="muted">No observation loaded.</div>`;
    return;
  }

  if (!itemNeedsPgno(item)) {
    area.innerHTML = `<div class="muted">PGNO selection is not required for Positive observations.</div>`;
    return;
  }

  const qnoCanon = canonicalQno(item.question_no || item.question_base || "");
  const questionObj = findQuestionFromLibrary(qnoCanon);

  if (!questionObj) {
    area.innerHTML = `<div class="muted">Question not found in locked library. PGNO options unavailable.</div>`;
    return;
  }

  const options = buildPgnoOptions(questionObj, item);
  if (!options.length) {
    area.innerHTML = `<div class="muted">No PGNO bullets found for this question in the library.</div>`;
    return;
  }

  const selected = Array.isArray(item.pgno_selected) ? item.pgno_selected : [];
  const selectedKeys = new Set(
    selected.map((x) => {
      const no = String(x?.pgno_no || "").trim();
      const text = String(x?.text || "").trim();
      return no ? `${no}||${text}` : text;
    })
  );

  area.innerHTML = `
    <div class="pgno-list">
      ${options.map((opt) => {
        const key = `${opt.pgno_no}||${opt.text}`;
        const checked =
          selectedKeys.has(key) ||
          selectedKeys.has(opt.text)
            ? "checked"
            : "";
        return `
          <label class="pgno-row">
            <input
              type="checkbox"
              class="pgnoChk"
              data-pgno-no="${opt.pgno_no}"
              data-text="${opt.text.replaceAll('"', "&quot;")}"
              ${checked}
            />
            <div class="pgno-meta">
              <div class="pgno-no">${opt.pgno_no}</div>
              <div class="pgno-text">${opt.text}</div>
            </div>
          </label>
        `;
      }).join("")}
    </div>
  `;
}

function collectSelectedPgno() {
  const rows = [];
  document.querySelectorAll(".pgnoChk").forEach((chk) => {
    if (!chk.checked) return;
    const pgno_no = String(chk.getAttribute("data-pgno-no") || "").trim();
    const text = String(chk.getAttribute("data-text") || "").trim();
    if (!text) return;
    rows.push({
      pgno_no: pgno_no || null,
      text,
    });
  });
  return rows;
}

async function saveResponseFields() {
  const item = state.item;
  if (!item) return;

  if (String(item.id).startsWith("legacy-")) {
    alert("This item comes from the legacy table and cannot store response fields there. Re-import it into the new multi-item table first.");
    return;
  }

  setSaveStatus("Saving…");

  const newStatus = String(el("responseStatus").value || "Open");
  let closeOutDate = String(el("closeOutDate").value || "").trim() || null;
  let closedByUserId = item.closed_by_user_id || null;
  let closedAt = item.closed_at || null;

  if (newStatus === "Closed") {
    if (!closeOutDate) closeOutDate = todayIsoDate();
    if (!closedAt) {
      closedAt = new Date().toISOString();
      closedByUserId = state.me?.id || null;
    }
  } else {
    closedAt = null;
    closedByUserId = null;
    closeOutDate = null;
  }

  const payload = {
    response_status: newStatus,
    responsible_person_id: String(el("responsiblePerson").value || "").trim() || null,
    verifier_person_id: String(el("verifierPerson").value || "").trim() || null,
    target_date: String(el("targetDate").value || "").trim() || null,
    close_out_date: closeOutDate,
    closed_by_user_id: closedByUserId,
    closed_at: closedAt,

    immediate_cause: String(el("immediateCause").value || "").trim() || null,
    immediate_cause_subcomments: String(el("immediateCauseComments").value || "").trim() || null,
    root_cause: String(el("rootCause").value || "").trim() || null,
    root_cause_subcomments: String(el("rootCauseComments").value || "").trim() || null,
    corrective_action: String(el("correctiveAction").value || "").trim() || null,
    corrective_action_subcomments: String(el("correctiveActionComments").value || "").trim() || null,
    preventative_action: String(el("preventativeAction").value || "").trim() || null,
    preventative_action_subcomments: String(el("preventativeActionComments").value || "").trim() || null,

    pgno_selected: collectSelectedPgno(),
  };

  const { data, error } = await state.supabase
    .from("post_inspection_observation_items")
    .update(payload)
    .eq("id", item.id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    setSaveStatus("Error");
    alert("Save failed: " + (error.message || String(error)));
    return;
  }

  state.item = data;
  renderObservation();
  renderPgnoSelector();
  loadResponseFields();
  setSaveStatus("Saved");
}

async function reloadItemFromDb() {
  const reportId = getUrlParam("report_id");
  const itemId = getUrlParam("item_id");
  if (!reportId || !itemId) return;

  state.item = await loadObservationItem(reportId, itemId);
  renderObservation();
  renderPgnoSelector();
  loadResponseFields();
  
  setSaveStatus("Loaded");
}

function forceCollapseResponseTracking() {
  const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4"));
  const h = headings.find((x) => /^\s*Response Tracking\s*$/i.test(x.textContent || ""));
  if (!h) return;

  const card = h.closest(".pi-card") || h.parentElement;
  if (!card || card.dataset.csvbResponseCollapseReady === "1") return;

  card.dataset.csvbResponseCollapseReady = "1";
  card.classList.add("csvb-response-collapsed-card");

  const body = document.createElement("div");
  body.className = "csvb-response-collapse-body";

  const children = Array.from(card.children).filter((child) => child !== h);
  children.forEach((child) => body.appendChild(child));

  const header = document.createElement("div");
  header.className = "csvb-response-collapse-header";

  const title = document.createElement("h2");
  title.textContent = "Response Tracking";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "csvbResponseTrackingToggle";
  btn.className = "csvb-mini-toggle-btn";
  btn.textContent = "▸";
  btn.title = "Expand / collapse Response Tracking";
  btn.setAttribute("aria-expanded", "false");

  header.appendChild(title);
  header.appendChild(btn);

  card.innerHTML = "";
  card.appendChild(header);
  card.appendChild(body);

  body.style.display = "none";

  btn.onclick = () => {
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", expanded ? "false" : "true");
    btn.textContent = expanded ? "▸" : "▾";
    body.style.display = expanded ? "none" : "";
  };
}

async function init() {
  el("buildPill").textContent = `build: ${OBS_DETAIL_BUILD}`;

  const ok = await waitForAuth(5000);
  if (!ok) throw new Error("AUTH not loaded.");

  state.supabase = window.AUTH.ensureSupabase();
  const R = window.AUTH.ROLES;

  const allowedPageRoles = [
    R.SUPER_ADMIN,
    R.COMPANY_ADMIN,
    R.COMPANY_SUPERINTENDENT,
  ].filter(Boolean);

  state.me = await window.AUTH.requireAuth(allowedPageRoles);
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  const reportId = getUrlParam("report_id");
  const itemId = getUrlParam("item_id");

  if (!reportId || !itemId) {
    throw new Error("Missing report_id or item_id in URL.");
  }

  state.workflowSettings = await loadWorkflowSettings();
  state.users = await loadUsers();

  state.lib = await loadLockedLibraryJson(LOCKED_LIBRARY_JSON);
  for (const q of state.lib) {
    const qno = getQno(q);
    if (!qno) continue;
    state.libByNo.set(qno, q);
    const canon = canonicalQno(qno);
    if (canon && !state.libCanonToExact.has(canon)) {
      state.libCanonToExact.set(canon, qno);
    }
  }

  state.report = await loadReportById(reportId);
  state.item = await loadObservationItem(reportId, itemId);

  if (!state.item) throw new Error("Observation item not found.");

  el("backToInspectionBtn").addEventListener("click", () => {
    window.location.href = `./post_inspection_detail.html?report_id=${encodeURIComponent(reportId)}`;
  });

  el("backToListBtn").addEventListener("click", () => {
    window.location.href = "./post_inspection.html";
  });

  document.querySelectorAll(".toggle-subcomment-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-target");
      const wrap = el(target);
      if (!wrap) return;
      wrap.classList.toggle("open");
    });
  });

  renderObservation();
  renderPgnoSelector();
  loadResponseFields();
  await loadSelectedObservationRisks();
  forceCollapseResponseTracking();
  setSaveStatus("Loaded");

  el("responseStatus").addEventListener("change", renderWorkflowBadges);
  el("targetDate").addEventListener("change", renderWorkflowBadges);

  el("saveResponseBtn").addEventListener("click", saveResponseFields);
  el("reloadResponseBtn").addEventListener("click", reloadItemFromDb);
}

(async () => {
  try {
    await init();
  } catch (e) {
    console.error(e);
    alert("Observation detail page failed to load: " + (e?.message || String(e)));
  }
})();


/* CSVB_OBS_DETAIL_FORCE_RENDER_V21_START */
(function csvbObsDetailForceRenderV21() {
  const PROFILE_KEY = "csvb_post_entry_visible_risk_profile_ids";
  let running = false;
  let renderedForItem = "";

  function q(id) {
    return document.getElementById(id);
  }

  function escLocal(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function selectedProfileIds() {
    try {
      const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || "[]");
      return Array.isArray(raw) ? raw.map(String).filter(Boolean).slice(0, 3) : [];
    } catch {
      return [];
    }
  }

  function filterSelected(rows) {
    const arr = Array.isArray(rows) ? rows : [];
    const ids = selectedProfileIds();

    if (!ids.length) return arr.slice(0, 3);

    const selected = new Set(ids);
    return arr
      .filter((r) => selected.has(String(r.profile_id)))
      .sort((a, b) => ids.indexOf(String(a.profile_id)) - ids.indexOf(String(b.profile_id)))
      .slice(0, 3);
  }

  function num(value) {
    if (value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function txt(value) {
    const n = num(value);
    return n == null ? "—" : n.toFixed(1);
  }

  function kind(row) {
    return String(
      state?.item?.obs_type ||
      state?.item?.kind ||
      row?.finding_type ||
      ""
    ).trim().toLowerCase();
  }

  function displayedRisk(row) {
    const k = kind(row);

    if (k === "positive") return null;

    if (k === "largely") {
      const qWeight = num(row?.question_type_weight);
      const nocScore = num(row?.noc_score);
      const ageFactor = num(row?.vessel_age_factor);
      const repFactor = num(row?.repetition_factor);

      if (qWeight != null && nocScore != null && ageFactor != null && repFactor != null) {
        return csvbLargelyAeDisplayFactor() * qWeight * nocScore * ageFactor * repFactor;
      }
    }

    return num(row?.observation_risk_score);
  }

  function rowClass(row) {
    const k = kind(row);
    if (k === "negative") return "csvb-obs-risk-row-neg";
    if (k === "largely") return "csvb-obs-risk-row-lae";
    if (k === "positive") return "csvb-obs-risk-row-pos";
    return "csvb-obs-risk-row-neutral";
  }

  function ensureRiskCard() {
    let card = q("observationRiskCard");

    if (!card) {
      card = document.createElement("div");
      card.className = "pi-card csvb-risk-card";
      card.id = "observationRiskCard";
      card.innerHTML = '<h2>Risk Evaluation</h2>';

      const pgnoCard = q("pgnoSelectorArea")?.closest(".pi-card");
      if (pgnoCard?.parentElement) {
        pgnoCard.parentElement.insertBefore(card, pgnoCard);
      } else {
        document.querySelector("main")?.prepend(card);
      }
    }

    let title = card.querySelector("h2");
    if (!title) {
      title = document.createElement("h2");
      title.textContent = "Risk Evaluation";
      card.prepend(title);
    }

    let bar = q("csvbObservationRiskActionBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "csvbObservationRiskActionBar";
      bar.className = "csvb-observation-risk-action-bar";
      bar.innerHTML = '<button type="button" id="csvbObservationRiskMiniRefresh" class="csvb-observation-risk-mini-refresh" title="Refresh">↻</button>';
      title.insertAdjacentElement("afterend", bar);
    }

    let line = q("observationRiskProfileLine");
    if (!line) {
      line = document.createElement("div");
      line.id = "observationRiskProfileLine";
      line.className = "muted";
      bar.insertAdjacentElement("afterend", line);
    }

    let area = q("observationRiskProfilesArea");
    if (!area) {
      area = document.createElement("div");
      area.id = "observationRiskProfilesArea";
      area.className = "csvb-observation-risk-profile-list";
      line.insertAdjacentElement("afterend", area);
    }

    const legacyGrid = card.querySelector(".csvb-observation-risk-grid");
    if (legacyGrid) legacyGrid.style.display = "none";

    return { card, line, area };
  }

  async function fetchRows() {
    if (!state?.supabase || !state?.item?.id || String(state.item.id).startsWith("legacy-")) {
      return [];
    }

    const { data, error } = await state.supabase.rpc("csvb_pi_obs_risks_for_item", {
      p_observation_item_id: state.item.id,
    });

    if (error) {
      console.warn("Observation risk RPC failed", error);
      return { error };
    }

    return filterSelected(data || []);
  }

  function renderRows(rowsOrError) {
    const { line, area } = ensureRiskCard();

    if (rowsOrError && rowsOrError.error) {
      line.textContent = "Observation risk calculation failed.";
      area.innerHTML = '<div class="csvb-obs-risk-empty">' + escLocal(rowsOrError.error.message || "RPC error") + '</div>';
      return;
    }

    const rows = Array.isArray(rowsOrError) ? rowsOrError : [];

    const calculated = rows[0]?.calculated_at
      ? String(rows[0].calculated_at).replace("T", " ").slice(0, 19)
      : "—";

    line.textContent = "Selected risk profiles: " + rows.length + " • Current snapshot • " + calculated;

    if (!rows.length) {
      area.innerHTML = '<div class="csvb-obs-risk-empty">No stored observation risk score yet. Use Bulk Risk Refresh if needed.</div>';
      return;
    }

    const header =
      '<div class="csvb-obs-risk-table-head">' +
        '<div>Risk Profile</div>' +
        '<div>Observation Risk Score</div>' +
        '<div>Finding type factor</div>' +
        '<div>Question type weight</div>' +
        '<div>NOC score</div>' +
        '<div>Vessel age factor</div>' +
        '<div>Repetition factor</div>' +
      '</div>';

    const body = rows.map((r) => {
      const k = kind(r);
      const scoreText = k === "positive" ? "N/A" : txt(displayedRisk(r));

      return (
        '<div class="csvb-obs-risk-table-row ' + rowClass(r) + '">' +
          '<div class="csvb-obs-risk-profile-name">' + escLocal(r.profile_name || "Risk Profile") + '</div>' +
          '<div>' + escLocal(scoreText) + '</div>' +
          '<div>' + escLocal(txt(r.finding_type_factor)) + '</div>' +
          '<div>' + escLocal(txt(r.question_type_weight)) + '</div>' +
          '<div>' + escLocal(txt(r.noc_score)) + '</div>' +
          '<div>' + escLocal(txt(r.vessel_age_factor)) + '</div>' +
          '<div>' + escLocal(txt(r.repetition_factor)) + '</div>' +
        '</div>'
      );
    }).join("");

    area.innerHTML =
      '<div class="csvb-obs-risk-table-wrap">' +
        header +
        body +
      '</div>';
  }

  async function refreshRiskRows() {
    if (running) return;
    running = true;

    try {
      ensureRiskCard();

      const btn = q("csvbObservationRiskMiniRefresh");
      if (btn) btn.disabled = true;

      const rows = await fetchRows();
      renderRows(rows);
      renderedForItem = String(state?.item?.id || "");
    } finally {
      const btn = q("csvbObservationRiskMiniRefresh");
      if (btn) btn.disabled = false;
      running = false;
    }
  }

  function collapseResponseTracking() {
    const cards = Array.from(document.querySelectorAll(".pi-card"));
    const card = cards.find((c) => {
      const h = c.querySelector("h2");
      return /^\s*Response Tracking\s*$/i.test(h?.textContent || "");
    });

    if (!card || card.dataset.csvbResponseCollapsed === "1") return;

    const h = card.querySelector("h2");
    if (!h) return;

    card.dataset.csvbResponseCollapsed = "1";

    const body = document.createElement("div");
    body.className = "csvb-response-collapse-body";

    let node = h.nextSibling;
    while (node) {
      const next = node.nextSibling;
      body.appendChild(node);
      node = next;
    }

    const header = document.createElement("div");
    header.className = "csvb-response-collapse-header";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "csvbResponseTrackingToggle";
    btn.className = "csvb-mini-toggle-btn";
    btn.textContent = "▸";
    btn.title = "Expand / collapse Response Tracking";
    btn.setAttribute("aria-expanded", "false");

    card.insertBefore(header, h);
    header.appendChild(h);
    header.appendChild(btn);
    card.appendChild(body);

    body.style.display = "none";

    btn.onclick = () => {
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", expanded ? "false" : "true");
      btn.textContent = expanded ? "▸" : "▾";
      body.style.display = expanded ? "none" : "";
    };
  }

  function bindRefresh() {
    const btn = q("csvbObservationRiskMiniRefresh");
    if (btn && btn.dataset.csvbBound !== "1") {
      btn.dataset.csvbBound = "1";
      btn.onclick = refreshRiskRows;
    }
  }

  async function tick() {
    collapseResponseTracking();
    ensureRiskCard();
    bindRefresh();

    const currentId = String(state?.item?.id || "");
    if (currentId && currentId !== renderedForItem && state?.supabase) {
      await refreshRiskRows();
    }
  }

  const timer = setInterval(tick, 500);
  setTimeout(() => clearInterval(timer), 30000);

  document.addEventListener("DOMContentLoaded", tick);
  window.addEventListener("load", tick);
})();
 /* CSVB_OBS_DETAIL_FORCE_RENDER_V21_END */

