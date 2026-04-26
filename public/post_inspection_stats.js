// public/post_inspection_stats.js
// Fleet/vessel stats via RPC functions.
// Current observation model: post_inspection_observation_items.obs_type = negative | positive | largely

import { loadLockedLibraryJson } from "./question_library_loader.js";

const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

const OBS_TYPES = [
  { value: "", label: "All types" },
  { value: "negative", label: "Negative" },
  { value: "positive", label: "Positive" },
  { value: "largely", label: "Largely as expected" },
];

function el(id) { return document.getElementById(id); }

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ymd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const state = {
  me: null,
  supabase: null,
  vessels: [],
  libByNo: new Map(),
  labelMap: new Map(),
};

function setStatus(text) {
  el("statusPill").textContent = text || "Ready";
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

function getChap(q) {
  return String(pick(q, ["Chap", "chapter", "Chapter"])).trim();
}

function getSection(q) {
  return String(pick(q, ["Section Name", "Sect", "section", "Section"])).trim();
}

function getShort(q) {
  return String(pick(q, ["Short Text", "short_text", "ShortText"])).trim();
}

function pgnoExportText(pgnoSelected) {
  const arr = Array.isArray(pgnoSelected) ? pgnoSelected : [];
  if (!arr.length) return "";

  return arr
    .map((x) => {
      const no = String(x?.pgno_no || x?.idx || "").trim();
      const text = String(x?.text || "").trim();
      if (no && text) return `${no} — ${text}`;
      if (no) return no;
      return text;
    })
    .filter(Boolean)
    .join("; ");
}

async function loadVessels() {
  const { data, error } = await state.supabase
    .from("vessels")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

function renderVesselFilter() {
  const sel = el("vesselFilter");
  sel.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "All vessels";
  sel.appendChild(optAll);

  for (const v of state.vessels) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.name;
    sel.appendChild(o);
  }
}

function renderTypeFilter() {
  const sel = el("typeFilter");
  sel.innerHTML = "";

  for (const t of OBS_TYPES) {
    const o = document.createElement("option");
    o.value = t.value;
    o.textContent = t.label;
    sel.appendChild(o);
  }
}

function getFilters() {
  const vessel_id = el("vesselFilter").value || null;
  const p_from = el("dateFrom").value || null;
  const p_to = el("dateTo").value || null;
  const p_observation_type = el("typeFilter").value || null;

  return { vessel_id, p_from, p_to, p_observation_type };
}

async function applyFilters() {
  setStatus("Loading…");

  const { vessel_id, p_from, p_to, p_observation_type } = getFilters();

  const { data: sum, error: sumErr } = await state.supabase
    .rpc("post_insp_stats_summary", {
      p_vessel_id: vessel_id,
      p_from,
      p_to,
      p_observation_type,
    });

  if (sumErr) throw sumErr;

  const s = Array.isArray(sum) ? sum[0] : sum;
  el("sumReports").textContent = String(s?.report_count ?? 0);
  el("sumObs").textContent = String(s?.observation_count ?? 0);
  el("sumMissing").textContent = String(s?.missing_pgno_count ?? 0);
  el("sumDistinct").textContent = String(s?.distinct_questions ?? 0);

  const { data: byV, error: byVErr } = await state.supabase
    .rpc("post_insp_stats_by_vessel", {
      p_from,
      p_to,
      p_observation_type,
    });

  if (byVErr) throw byVErr;

  const vb = el("byVesselTbody");
  vb.innerHTML = "";

  for (const r of byV || []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(r.vessel_name || "")}</td>
      <td>${esc(r.report_count)}</td>
      <td>${esc(r.observation_count)}</td>
      <td>${esc(r.missing_pgno_count)}</td>
      <td>${esc(r.last_inspection_date || "")}</td>
    `;
    vb.appendChild(tr);
  }

  if (!(byV || []).length) {
    vb.innerHTML = `<tr><td colspan="5" class="mono">No data for current date/type filters.</td></tr>`;
  }

  const { data: byT, error: byTErr } = await state.supabase
    .rpc("post_insp_stats_by_type", {
      p_vessel_id: vessel_id,
      p_from,
      p_to,
    });

  if (byTErr) throw byTErr;

  const tb = el("byTypeTbody");
  tb.innerHTML = "";

  for (const r of byT || []) {
    const label = state.labelMap.get(r.observation_type) || r.observation_type;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(label)}</td>
      <td>${esc(r.report_count)}</td>
      <td>${esc(r.observation_count)}</td>
      <td>${esc(r.missing_pgno_count)}</td>
      <td>${esc(r.last_seen || "")}</td>
    `;
    tb.appendChild(tr);
  }

  if (!(byT || []).length) {
    tb.innerHTML = `<tr><td colspan="5" class="mono">No data for current vessel/date filters.</td></tr>`;
  }

  const { data: topQ, error: topQErr } = await state.supabase
    .rpc("post_insp_stats_top_questions", {
      p_vessel_id: vessel_id,
      p_from,
      p_to,
      p_observation_type,
      p_limit: 50,
    });

  if (topQErr) throw topQErr;

  const qb = el("topQnsTbody");
  qb.innerHTML = "";

  for (const r of topQ || []) {
    const meta = state.libByNo.get(r.question_no) || null;
    const ch = meta ? getChap(meta) : "";
    const sec = meta ? getSection(meta) : "";
    const sh = meta ? getShort(meta) : "";
    const label = state.labelMap.get(r.observation_type) || r.observation_type;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${esc(r.question_no)}</td>
      <td>${esc(ch)}</td>
      <td>${esc(sec)}</td>
      <td>${esc(sh)}</td>
      <td>${esc(label)}</td>
      <td>${esc(r.observation_count)}</td>
      <td>${esc(r.report_count)}</td>
      <td>${esc(r.last_seen || "")}</td>
    `;
    qb.appendChild(tr);
  }

  if (!(topQ || []).length) {
    qb.innerHTML = `<tr><td colspan="8" class="mono">No data for current filters.</td></tr>`;
  }

  setStatus("Ready");
}

async function exportFilteredCsv() {
  setStatus("Exporting…");

  const { vessel_id, p_from, p_to, p_observation_type } = getFilters();

  const { data, error } = await state.supabase
    .rpc("post_insp_export_observations", {
      p_vessel_id: vessel_id,
      p_from,
      p_to,
      p_observation_type,
    });

  if (error) throw error;

  const rows = data || [];

  const header = [
    "vessel_name",
    "inspection_date",
    "report_ref",
    "title",
    "question_no",
    "observation_type",
    "designation",
    "soc",
    "noc",
    "pgno_selected",
    "pgno_count",
    "remarks",
    "updated_at",
  ];

  const csv = [header.join(",")];

  for (const r of rows) {
    const label = state.labelMap.get(r.observation_type) || r.observation_type;
    const pgTxt = pgnoExportText(r.pgno_selected);
    const pgCount = Number(r.pgno_count || 0);

    const line = [
      r.vessel_name || "",
      r.inspection_date || "",
      r.report_ref || "",
      r.title || "",
      r.question_no || "",
      label || "",
      r.designation || "",
      r.soc || "",
      r.noc || "",
      pgTxt,
      String(pgCount),
      r.remarks || "",
      r.updated_at || "",
    ].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",");

    csv.push(line);
  }

  const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");

  const safeV = (vessel_id ? (state.vessels.find(v => v.id === vessel_id)?.name || "vessel") : "fleet")
    .replace(/[^a-z0-9]+/gi, "_");
  const safeFrom = (p_from || "from").replace(/[^0-9-]+/g, "_");
  const safeTo = (p_to || "to").replace(/[^0-9-]+/g, "_");

  a.download = `post_inspection_export_${safeV}_${safeFrom}_${safeTo}.csv`;
  a.href = URL.createObjectURL(blob);

  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);

  setStatus("Ready");
}

async function init() {
  const R = window.AUTH?.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN]);
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  state.supabase = window.__supabaseClient;
  if (!state.supabase) {
    throw new Error("Supabase client missing. Ensure supabase-js CDN and auth.js are loaded.");
  }

  state.labelMap = new Map(
    OBS_TYPES.filter((x) => x.value).map((x) => [x.value, x.label])
  );

  state.vessels = await loadVessels();
  renderVesselFilter();
  renderTypeFilter();

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 365);

  el("dateFrom").value = ymd(from);
  el("dateTo").value = ymd(to);

  const lib = await loadLockedLibraryJson(LOCKED_LIBRARY_JSON);
  for (const q of lib) {
    const qno = getQno(q);
    if (qno) state.libByNo.set(qno, q);
  }

  el("applyBtn").addEventListener("click", async () => {
    try {
      await applyFilters();
    } catch (e) {
      console.error(e);
      alert("Apply filters failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("exportCsvBtn").addEventListener("click", async () => {
    try {
      await exportFilteredCsv();
    } catch (e) {
      console.error(e);
      alert("Export failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  await applyFilters();
}

(async () => {
  try {
    await init();
  } catch (e) {
    console.error(e);
    alert("Stats page failed to load: " + (e?.message || String(e)));
    setStatus("Error");
  }
})();