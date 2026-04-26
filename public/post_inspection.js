const POST_INSPECTION_INDEX_BUILD =
  "post_inspection_index_v2_sort_by_inspection_date_desc_2026-04-26";

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
  storedFilters: {},
  storedDateYears: new Set(),
  storedDateMonths: new Set(),
  openFilterCol: null,
};

async function loadReportsFromDb() {
  const selectA =
    "id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, examined_questions, examined_count, created_at, updated_at";
  const selectB =
    "id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, created_at, updated_at";

  let rows = [];
  try {
    const { data, error } = await state.supabase
      .from("post_inspection_reports")
      .select(selectA)
      .order("inspection_date", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    rows = data || [];
  } catch {
    const { data, error } = await state.supabase
      .from("post_inspection_reports")
      .select(selectB)
      .order("inspection_date", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    rows = data || [];
  }

  const vesselIds = [...new Set(rows.map((r) => r.vessel_id).filter(Boolean))];
  if (!vesselIds.length) return rows.map((r) => ({ ...r, vessel_name: "" }));

  const { data: vessels } = await state.supabase.from("vessels").select("id, name").in("id", vesselIds);
  const map = new Map((vessels || []).map((v) => [v.id, v.name]));
  return rows.map((r) => ({ ...r, vessel_name: map.get(r.vessel_id) || "" }));
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

function renderStoredTable() {
  const body = el("storedTableBody");
  const rows = (state.reports || []).filter(reportPassesStoredFilters);

  el("storedCount").textContent = `${rows.length} inspection(s)`;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="muted">No inspections found.</td></tr>`;
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
      </tr>
    `)
    .join("");

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
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN]);
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