const OBS_DETAIL_BUILD = "post_inspection_observation_detail_v1_page_split_2026-04-07";
const HUMAN_POSITIVE_FIXED_NOC = "Exceeded normal expectation.";

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

function selectedPgnoText(pgno_selected) {
  const arr = Array.isArray(pgno_selected) ? pgno_selected : [];
  if (!arr.length) return "";
  return arr.map((x) => String(x?.text || "").trim()).filter(Boolean).join(" • ");
}

function draftKey(itemId) {
  return `pi_response_draft_${itemId}`;
}

const state = {
  me: null,
  supabase: null,
  report: null,
  item: null,
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
  el("pgnoField").value = selectedPgnoText(item.pgno_selected) || "";
}

function loadDraft() {
  const item = state.item;
  if (!item) return;

  try {
    const raw = localStorage.getItem(draftKey(item.id));
    if (!raw) return;
    const d = JSON.parse(raw);

    el("immediateCause").value = d.immediateCause || "";
    el("immediateCauseComments").value = d.immediateCauseComments || "";
    el("rootCause").value = d.rootCause || "";
    el("rootCauseComments").value = d.rootCauseComments || "";
    el("correctiveAction").value = d.correctiveAction || "";
    el("correctiveActionComments").value = d.correctiveActionComments || "";
    el("preventativeAction").value = d.preventativeAction || "";
    el("preventativeActionComments").value = d.preventativeActionComments || "";
  } catch (e) {
    console.warn("draft load failed", e);
  }
}

function saveDraft() {
  const item = state.item;
  if (!item) return;

  const d = {
    immediateCause: el("immediateCause").value || "",
    immediateCauseComments: el("immediateCauseComments").value || "",
    rootCause: el("rootCause").value || "",
    rootCauseComments: el("rootCauseComments").value || "",
    correctiveAction: el("correctiveAction").value || "",
    correctiveActionComments: el("correctiveActionComments").value || "",
    preventativeAction: el("preventativeAction").value || "",
    preventativeActionComments: el("preventativeActionComments").value || "",
    saved_at: new Date().toISOString(),
  };

  localStorage.setItem(draftKey(item.id), JSON.stringify(d));
  alert("Draft saved locally in this browser.");
}

function clearDraft() {
  const item = state.item;
  if (!item) return;

  const ok = confirm("Clear local draft for this observation?");
  if (!ok) return;

  localStorage.removeItem(draftKey(item.id));

  el("immediateCause").value = "";
  el("immediateCauseComments").value = "";
  el("rootCause").value = "";
  el("rootCauseComments").value = "";
  el("correctiveAction").value = "";
  el("correctiveActionComments").value = "";
  el("preventativeAction").value = "";
  el("preventativeActionComments").value = "";
}

async function init() {
  el("buildPill").textContent = `build: ${OBS_DETAIL_BUILD}`;

  const ok = await waitForAuth(5000);
  if (!ok) throw new Error("AUTH not loaded.");

  state.supabase = window.AUTH.ensureSupabase();
  const R = window.AUTH.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN]);
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  const reportId = getUrlParam("report_id");
  const itemId = getUrlParam("item_id");

  if (!reportId || !itemId) {
    throw new Error("Missing report_id or item_id in URL.");
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

  renderObservation();
  loadDraft();

  el("saveDraftBtn").addEventListener("click", saveDraft);
  el("reloadDraftBtn").addEventListener("click", loadDraft);
  el("clearDraftBtn").addEventListener("click", clearDraft);
}

(async () => {
  try {
    await init();
  } catch (e) {
    console.error(e);
    alert("Observation detail page failed to load: " + (e?.message || String(e)));
  }
})();