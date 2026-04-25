import { loadLockedLibraryJson } from "./question_library_loader.js";

const OBS_DETAIL_BUILD = "post_inspection_observation_detail_v4_overdue_and_configurable_roles_2026-04-25";
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

function humanPifsFromItem(item) {
  if (isHumanPositive(item)) return [];
  const candidates = [];
  const cc = String(item?.classification_coding || "").trim();
  const noc = String(item?.nature_of_concern || "").trim();
  if (cc) candidates.push(...cc.split("|").map((x) => x.trim()).filter(Boolean));
  if (noc) candidates.push(...noc.split("|").map((x) => x.trim()).filter(Boolean));
  return HUMAN_PIF_OPTIONS.filter((opt) => candidates.includes(opt));
}

function socDisplay(item) {
  const d = normDesignation(item?.designation);
  if (d === "Human") return humanSocFromItem(item);
  return String(item?.classification_coding || "").trim();
}

function nocDisplay(item) {
  const d = normDesignation(item?.designation);
  if (d === "Human") {
    if (isHumanPositive(item)) return HUMAN_POSITIVE_FIXED_NOC;
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

  return pgTxt
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length > 6);
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