const PLANNER_BUILD = "vetting_inspection_planner_v5_2026-10-14";
const PLANNER_MODULE_CODE = "VETTING_INSPECTION_PLANNER";
const DEFAULT_INTERVAL_MONTHS = 6;

const plannerState = {
  supabase: null,
  user: null,
  vessels: [],
  drafts: new Map(),
  canEdit: false,
  saving: new Set(),
};

const plannerEl = (id) => document.getElementById(id);

function plannerEsc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showPlannerMessage(message = "", kind = "") {
  const box = plannerEl("plannerMessage");
  if (!box) return;
  box.textContent = message;
  box.className = `planner-message${message ? ` ${kind || "error"}` : ""}`;
}

function dateOnly(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function displayDate(value) {
  const iso = dateOnly(value);
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function addCalendarMonths(value, count) {
  const iso = dateOnly(value);
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  const targetMonthIndex = year * 12 + (month - 1) + Number(count || 0);
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function addCalendarDays(value, count) {
  const iso = dateOnly(value);
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + count);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysBetween(fromDate, toDate) {
  const from = dateOnly(fromDate);
  const to = dateOnly(toDate);
  if (!from || !to) return null;
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000);
}

function normalizedStatus(row, dueDate, lastInspectionDate, hasHistory) {
  if (!hasHistory) return { key: "none", label: "No inspection history" };
  if (dueDate) {
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const daysToDue = daysBetween(todayIso, dueDate);
    const remaining = `${daysToDue} day${daysToDue === 1 ? "" : "s"} remaining`;
    if (daysToDue < 0) {
      const overdueDays = Math.abs(daysToDue);
      return {
        key: "overdue",
        label: `OVERDUE • ${overdueDays} day${overdueDays === 1 ? "" : "s"}`,
        daysToDue,
      };
    }
    if (daysToDue <= 15) {
      const label = daysToDue === 0
        ? "Due today • 0 days remaining"
        : `Due soon • ${remaining}`;
      return { key: "warning", label, daysToDue };
    }

    const greenThrough = lastInspectionDate ? addCalendarMonths(lastInspectionDate, 2) : "";
    const warningBegins = addCalendarDays(dueDate, -15);
    if (!greenThrough || todayIso < greenThrough) {
      return { key: "within", label: `Within interval • ${remaining}`, daysToDue };
    }

    if (todayIso < warningBegins) {
      const transitionDays = daysBetween(greenThrough, warningBegins);
      const elapsedDays = daysBetween(greenThrough, todayIso);
      const progress = transitionDays > 0
        ? Math.max(0, Math.min(1, elapsedDays / transitionDays))
        : 1;
      const hue = Math.round(120 * (1 - progress));
      const label = daysToDue <= 30
        ? `Due soon • ${remaining}`
        : `Approaching due • ${remaining}`;
      return {
        key: "approaching",
        label,
        daysToDue,
        style: `--planner-status-hue:${hue}`,
      };
    }

    return { key: "warning", label: `Due soon • ${remaining}`, daysToDue };
  }
  const supplied = String(
    row?.decision_status ?? row?.status ?? row?.due_status ?? row?.decision ?? ""
  ).trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (/overdue|past_due/.test(supplied)) return { key: "overdue", label: "OVERDUE • days unavailable" };
  if (/due_soon|due_within|soon|amber|warning/.test(supplied)) return { key: "warning", label: "Due soon • days unavailable" };
  if (/within|current|green|not_due/.test(supplied)) return { key: "within", label: "Within interval • days unavailable" };
  return { key: "none", label: "No inspection history" };
}

function firstValue(object, keys, fallback = "") {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function asBoolean(value, fallback = true) {
  if (value === true || value === false) return value;
  if (value === 1 || value === 0) return Boolean(value);
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "t", "1", "yes", "included", "active"].includes(normalized)) return true;
    if (["false", "f", "0", "no", "hidden", "excluded", "inactive"].includes(normalized)) return false;
  }
  return fallback;
}

function parseSuggestion(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function suggestionFromRow(row) {
  const nested = parseSuggestion(firstValue(row, [
    "suggestion",
    "suggestion_details",
    "suggestion_data",
    "oil_major_suggestion",
    "oil_major_recommendation",
    "next_oil_major_suggestion",
    "recommendation",
  ], {}));
  const get = (keys) => firstValue(row, keys, firstValue(nested, keys, ""));
  const major = String(get([
    "suggested_major",
    "suggested_major_name",
    "suggested_oil_major",
    "suggested_oil_major_name",
    "suggested_next_oil_major",
    "suggested_next_inspecting_company",
    "suggested_inspecting_company",
    "suggested_inspecting_oil_major",
    "suggested_company",
    "recommended_oil_major",
  ])).trim();
  const vesselAverage = get([
    "vessel_last_5_average_negative_observations",
    "vessel_last_5_avg_negative_observations",
    "vessel_last5_average_negative_observations",
    "vessel_last5_avg_negative_observations",
    "vessel_last_5_avg",
    "vessel_last5_avg",
    "last_5_average_negative_observations",
    "last_5_avg_negative_observations",
    "average_negative_observations_last_5",
    "avg_negative_observations_last_5",
    "vessel_avg_negative_last_5",
    "vessel_avg_negative_observations_last_5",
    "vessel_average_negative_observations",
  ]);
  const majorAverage = get([
    "suggested_major_average_negative_observations",
    "suggested_major_avg_negative_observations",
    "suggested_major_avg",
    "suggested_major_avg_negative_per_inspection",
    "suggested_oil_major_average_negative_observations",
    "suggested_oil_major_avg_negative_observations",
    "suggested_company_average_negative_observations",
    "suggested_company_avg_negative_observations",
    "suggested_company_avg_negative_per_inspection",
  ]);
  const explanation = String(get([
    "suggestion_explanation",
    "suggested_major_explanation",
    "recommendation_explanation",
    "suggestion_reason",
    "explanation",
    "reason",
  ])).trim();
  return {
    major,
    vesselAverage: vesselAverage === "" ? null : Number(vesselAverage),
    majorAverage: majorAverage === "" ? null : Number(majorAverage),
    explanation,
  };
}

function displayAverage(value) {
  const number = Number(value);
  return value === null || value === "" || !Number.isFinite(number)
    ? "—"
    : number.toFixed(2);
}

function normalizeRemarks(value) {
  let source = value;
  if (typeof source === "string") {
    const text = source.trim();
    if (!text) return [];
    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        source = JSON.parse(text);
      } catch (_) {
        return [{ id: null, text: source }];
      }
    } else {
      return [{ id: null, text: source }];
    }
  }
  if (!Array.isArray(source) && source && typeof source === "object") {
    source = source.remarks || source.items || source.rows || [source];
  }
  if (!Array.isArray(source)) return [];
  return source.map((item) => {
    if (typeof item === "string") return { id: null, text: item };
    return {
      id: firstValue(item, ["remark_id", "id", "vessel_remark_id"], null),
      text: String(firstValue(item, ["remark_text", "text", "remark", "content", "value"], "")),
    };
  });
}

function vesselDraft(row) {
  let draft = plannerState.drafts.get(row.vessel_id);
  if (!draft) {
    draft = {
      alternative01: row.planned_oil_major_alternative_01 || "",
      alternative02: row.planned_oil_major_alternative_02 || "",
      remarks: (row.remarks || []).map((remark) => ({ ...remark })),
    };
    plannerState.drafts.set(row.vessel_id, draft);
  }
  return draft;
}

function normalizeHistory(records) {
  const source = Array.isArray(records) ? records : [];
  const normalized = source
    .map((item) => ({
      inspection_date: firstValue(item, ["inspection_date", "date"]),
      port_name: firstValue(item, ["port_name", "port"]),
      inspecting_company: firstValue(item, [
        "ocimf_inspecting_company",
        "inspecting_company",
        "inspecting_oil_major",
        "inspecting_company_name",
        "oil_major",
        "company_name",
      ]),
      report_ref: firstValue(item, ["report_ref", "report_reference"]),
      negative_observations_count: Number(firstValue(item, [
        "negative_observations_count",
        "negative_observation_count",
        "negative_count",
        "negative_observations",
      ], 0)) || 0,
    }))
    .filter((item) => dateOnly(item.inspection_date))
    .sort((a, b) => dateOnly(b.inspection_date).localeCompare(dateOnly(a.inspection_date)));
  const seen = new Set();
  return normalized.filter((item) => {
    const key = `${item.report_ref || ""}|${dateOnly(item.inspection_date)}|${item.port_name || ""}|${item.inspecting_company || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function normalizePlannerData(data) {
  const object = !Array.isArray(data) && data && typeof data === "object" ? data : {};
  const vesselRows = Array.isArray(data)
    ? data
    : (object.vessels || object.rows || object.plans || object.items || []);
  const extras = {
    history: object.history || object.inspections || object.inspection_history || [],
  };
  const grouped = new Map();

  for (const source of Array.isArray(vesselRows) ? vesselRows : []) {
    const vesselId = String(firstValue(source, ["vessel_id", "id"], ""));
    if (!vesselId) continue;
    let row = grouped.get(vesselId);
    if (!row) {
      row = {
        ...source,
        vessel_id: vesselId,
        vessel_name: firstValue(source, ["vessel_name", "name"], "Unnamed vessel"),
        history: [],
      };
      grouped.set(vesselId, row);
    }
    const nested = firstValue(source, [
      "last_5_inspections",
      "last_five_inspections",
      "last_5_reports",
      "inspections_last_5",
      "inspection_history",
      "history",
      "inspections",
    ], []);
    if (Array.isArray(nested)) row.history.push(...nested);

    // The RPC may return a flat row per inspection instead of nested history.
    if (dateOnly(source.inspection_date || source.last_inspection_date) && (
      source.report_ref || source.report_reference || source.port_name
    )) {
      row.history.push({
        inspection_date: source.inspection_date || source.last_inspection_date,
        port_name: source.port_name,
        ocimf_inspecting_company: source.ocimf_inspecting_company || source.inspecting_company || source.oil_major,
        report_ref: source.report_ref || source.report_reference,
        negative_observations_count: firstValue(source, [
          "negative_observations_count",
          "negative_observation_count",
          "negative_count",
          "negative_observations",
        ], 0),
      });
    }
  }

  for (const historyRow of extras.history) {
    const vesselId = String(historyRow?.vessel_id || "");
    const row = grouped.get(vesselId);
    if (row) row.history.push(historyRow);
  }

  return [...grouped.values()]
    // `active` is ambiguous in v2 and may mean planner inclusion. Only exclude
    // explicit global-vessel inactive flags so hidden planner rows remain restorable.
    .filter((row) => row.is_active !== false && row.vessel_is_active !== false && row.is_vessel_active !== false)
    .map((row) => {
      const history = normalizeHistory(row.history);
      const lastInspectionDate = dateOnly(firstValue(
        row,
        ["last_inspection_date"],
        history[0]?.inspection_date || ""
      ));
      const overrideRaw = firstValue(row, [
        "interval_override_months",
        "interval_months_override",
        "override_interval_months",
        "vessel_interval_override_months",
        "inspection_interval_override_months",
      ], "");
      const override = overrideRaw === "" ? null : Number(overrideRaw);
      const effective = Number(firstValue(row, [
        "effective_interval_months",
        "interval_months",
      ], override || DEFAULT_INTERVAL_MONTHS)) || DEFAULT_INTERVAL_MONTHS;
      const dueDate = dateOnly(firstValue(
        row,
        ["next_due_date", "due_date"],
        lastInspectionDate ? addCalendarMonths(lastInspectionDate, effective) : ""
      ));
      const includeValue = firstValue(row, [
        "include_in_planner",
        "is_included_in_planner",
        "planner_included",
        "include_vessel_in_planner",
        "is_planner_included",
        "planner_enabled",
      ], true);
      const status = normalizedStatus(row, dueDate, lastInspectionDate, Boolean(lastInspectionDate || history.length));
      return {
        ...row,
        vessel_id: String(row.vessel_id),
        vessel_name: String(row.vessel_name || "Unnamed vessel"),
        history,
        last_inspection_date: lastInspectionDate,
        interval_override_months: Number.isFinite(override) ? override : null,
        effective_interval_months: effective,
        next_due_date: dueDate,
        status,
        include_in_planner: asBoolean(includeValue, true),
        planned_next_oil_major: String(firstValue(row, [
          "planned_next_oil_major",
          "planned_next_inspecting_company",
          "planned_inspecting_oil_major",
          "planned_inspecting_company",
          "planned_oil_major",
          "next_oil_major",
        ])),
        planned_oil_major_alternative_01: String(firstValue(row, [
          "planned_oil_major_alternative_01",
          "planned_oil_major_alt_01",
          "planned_next_oil_major_alternative_01",
          "planned_next_oil_major_alt_01",
          "alternative_01_oil_major",
          "alternative_oil_major_01",
        ])),
        planned_oil_major_alternative_02: String(firstValue(row, [
          "planned_oil_major_alternative_02",
          "planned_oil_major_alt_02",
          "planned_next_oil_major_alternative_02",
          "planned_next_oil_major_alt_02",
          "alternative_02_oil_major",
          "alternative_oil_major_02",
        ])),
        remarks: normalizeRemarks(firstValue(row, ["remarks", "vessel_remarks"], "")),
        suggestion: suggestionFromRow(row),
      };
    })
    .sort((a, b) => a.vessel_name.localeCompare(b.vessel_name));
}

function renderHistory(history) {
  if (!history.length) {
    return `<div class="history-empty">No stored vetting inspections for this vessel.</div>`;
  }
  return `
    <div class="history-wrap">
      <table class="history-table">
        <thead><tr>
          <th>Date</th><th>Port</th><th>Inspecting oil major / company</th><th>Report reference</th><th>Negative observations</th>
        </tr></thead>
        <tbody>${history.map((item) => `
          <tr>
            <td>${plannerEsc(displayDate(item.inspection_date))}</td>
            <td>${plannerEsc(item.port_name || "—")}</td>
            <td>${plannerEsc(item.inspecting_company || "—")}</td>
            <td>${plannerEsc(item.report_ref || "—")}</td>
            <td>${plannerEsc(item.negative_observations_count)}</td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderVesselCard(row) {
  const disabled = !plannerState.canEdit || plannerState.saving.has(row.vessel_id);
  const overrideValue = row.interval_override_months == null ? "" : String(row.interval_override_months);
  const includeChecked = row.include_in_planner === true ? "checked" : "";
  const suggestion = row.suggestion || {};
  const draft = vesselDraft(row);
  const lastInspection = row.history[0] || null;
  const lastInspectionDate = row.last_inspection_date || lastInspection?.inspection_date || "";
  const lastOilMajor = lastInspection?.inspecting_company ||
    firstValue(row, ["last_inspecting_oil_major", "last_inspecting_company", "last_oil_major"], "—");
  const lastNegativeCount = lastInspection
    ? lastInspection.negative_observations_count
    : firstValue(row, [
      "last_inspection_negative_observations_count",
      "last_negative_observations_count",
      "last_inspection_negative_count",
    ], "—");
  const intervalOptions = [
    `<option value="" ${overrideValue === "" ? "selected" : ""}>Default — 6 months</option>`,
    ...[1, 2, 3, 4, 5, 6].map((month) =>
      `<option value="${month}" ${overrideValue === String(month) ? "selected" : ""}>${month} month${month === 1 ? "" : "s"}</option>`
    ),
  ].join("");
  const remarksMarkup = draft.remarks.length
    ? `<div class="remarks-list">${draft.remarks.map((remark, index) => `
        <div class="remark-row">
          <div class="remark-number">Remark #${String(index + 1).padStart(2, "0")}</div>
          <textarea class="remark-text" data-vessel-remark-text data-vessel-id="${plannerEsc(row.vessel_id)}" data-remark-index="${index}" maxlength="4000" aria-label="Remark ${String(index + 1).padStart(2, "0")}" ${disabled ? "disabled" : ""}>${plannerEsc(remark.text)}</textarea>
          <button class="planner-btn remark-remove" type="button" data-remove-remark="${plannerEsc(row.vessel_id)}" data-remark-index="${index}" ${disabled ? "disabled" : ""}>Remove</button>
        </div>`).join("")}</div>`
    : `<div class="remarks-empty">No vessel remarks added yet.</div>`;
  const status = row.status;
  return `
    <tr class="vessel-card" data-vessel-id="${plannerEsc(row.vessel_id)}" data-vessel-name="${plannerEsc(row.vessel_name.toLowerCase())}" data-status="${plannerEsc(status.key)}" data-included="${row.include_in_planner ? "true" : "false"}">
      <td class="planner-vessel-card-cell" colspan="6">
      <details class="planner-card-details">
        <summary class="planner-card-summary" title="Show or hide details for ${plannerEsc(row.vessel_name)}">
          <span class="planner-summary-cell planner-summary-vessel">${plannerEsc(row.vessel_name)}</span>
          <span class="planner-summary-cell planner-summary-date">${plannerEsc(displayDate(lastInspectionDate))}</span>
          <span class="planner-summary-cell planner-summary-major">${plannerEsc(lastOilMajor || "—")}</span>
          <span class="planner-summary-cell planner-summary-negative">${plannerEsc(lastNegativeCount)}</span>
          <span class="planner-summary-cell planner-summary-status">
            <span class="vessel-status status-${plannerEsc(status.key)}" ${status.style ? `style="${plannerEsc(status.style)}"` : ""}>${plannerEsc(status.label)}</span>
          </span>
          <span class="planner-summary-cell planner-expand-affordance" title="Show or hide vessel details">
            <span class="planner-expand-chevron" aria-hidden="true"></span>
            <span class="planner-sr-only">Show or hide details for ${plannerEsc(row.vessel_name)}</span>
          </span>
        </summary>
        <div class="planner-card-expanded">
          <div class="vessel-card-head">
            <div class="vessel-card-toggles">
              <label class="planner-switch" for="include-${plannerEsc(row.vessel_id)}">
                <input id="include-${plannerEsc(row.vessel_id)}" type="checkbox" data-include-vessel="${plannerEsc(row.vessel_id)}" ${includeChecked} ${disabled ? "disabled" : ""} />
                <span class="planner-switch-track" aria-hidden="true"></span>
                <span>Include in planner</span>
              </label>
              ${row.include_in_planner ? "" : `<span class="planner-hidden-label">Hidden from planner</span>`}
            </div>
          </div>
          <div class="vessel-summary">
            <div><div class="summary-label">Effective interval</div><div class="summary-value">${row.last_inspection_date ? `${plannerEsc(row.effective_interval_months)} months` : "—"}</div></div>
            <div><div class="summary-label">Next due date</div><div class="summary-value">${plannerEsc(displayDate(row.next_due_date))}</div></div>
          </div>
          <section class="planner-section">
            <h3 class="section-title">Last 5 vetting inspections</h3>
            ${renderHistory(row.history)}
          </section>
          <section class="planner-section">
            <h3 class="section-title">Next inspection plan</h3>
            <div class="plan-fields">
              <div class="planner-field">
                <label for="interval-${plannerEsc(row.vessel_id)}">Interval override</label>
                <select id="interval-${plannerEsc(row.vessel_id)}" data-plan-field="interval" ${disabled ? "disabled" : ""}>${intervalOptions}</select>
                <div class="field-hint">Choose Default to use the six-month interval.</div>
              </div>
              <div class="oil-major-fields">
                <div class="planner-field">
                  <label for="major-${plannerEsc(row.vessel_id)}">Planned next oil major</label>
                  <input id="major-${plannerEsc(row.vessel_id)}" data-plan-field="major" maxlength="200" value="${plannerEsc(row.planned_next_oil_major)}" ${disabled ? "disabled" : ""} />
                </div>
                <div class="planner-field">
                  <label for="major-alt-01-${plannerEsc(row.vessel_id)}">Alternative 01</label>
                  <input id="major-alt-01-${plannerEsc(row.vessel_id)}" data-alternative-field="alternative01" data-vessel-id="${plannerEsc(row.vessel_id)}" maxlength="200" value="${plannerEsc(draft.alternative01)}" ${disabled ? "disabled" : ""} />
                </div>
                <div class="planner-field">
                  <label for="major-alt-02-${plannerEsc(row.vessel_id)}">Alternative 02</label>
                  <input id="major-alt-02-${plannerEsc(row.vessel_id)}" data-alternative-field="alternative02" data-vessel-id="${plannerEsc(row.vessel_id)}" maxlength="200" value="${plannerEsc(draft.alternative02)}" ${disabled ? "disabled" : ""} />
                </div>
              </div>
              <button class="planner-btn primary" type="button" data-save-vessel="${plannerEsc(row.vessel_id)}" ${disabled ? "disabled" : ""}>${plannerState.saving.has(row.vessel_id) ? "Saving…" : "Save"}</button>
            </div>
            <div class="planner-draft-note">Save stores the primary major, interval, and planner inclusion. Alternative majors and vessel remarks are editable drafts only and are not saved by the current backend contract.</div>
            <div class="planner-suggestion">
              <div class="suggestion-copy">
                <span class="suggestion-title">Backend suggestion</span>
                <strong class="suggestion-major">${plannerEsc(suggestion.major || "No suggested major available")}</strong>
                <div class="suggestion-metrics">
                  <span>Vessel last-5 average: <strong>${plannerEsc(displayAverage(suggestion.vesselAverage))}</strong></span>
                  <span>Suggested-major average: <strong>${plannerEsc(displayAverage(suggestion.majorAverage))}</strong></span>
                </div>
                <p>${plannerEsc(suggestion.explanation || "No explanation was returned by the planner service.")}</p>
              </div>
              <button class="planner-btn" type="button" data-use-suggestion="${plannerEsc(row.vessel_id)}" ${disabled || !suggestion.major ? "disabled" : ""}>Use suggestion</button>
            </div>
            <div class="planner-remarks">
              <div class="remarks-header">
                <div><h4 class="remarks-title">Vessel remarks</h4></div>
                <button class="planner-btn" type="button" data-add-remark="${plannerEsc(row.vessel_id)}" ${disabled ? "disabled" : ""}>Add Remark</button>
              </div>
              ${remarksMarkup}
            </div>
            ${plannerState.canEdit ? "" : `<div class="planner-readonly-note">You have view access only. An authorized editor can update these planning fields.</div>`}
          </section>
        </div>
      </details>
      </td>
    </tr>
  `;
}

function applyFilters() {
  const search = String(plannerEl("vesselSearch")?.value || "").trim().toLowerCase();
  const status = plannerEl("statusFilter")?.value || "";
  const showHidden = plannerEl("showHiddenVessels")?.checked === true;
  let visible = 0;
  const hiddenCount = plannerState.vessels.filter((vessel) => !vessel.include_in_planner).length;
  document.querySelectorAll(".vessel-card").forEach((card) => {
    const included = card.dataset.included !== "false";
    const match = (showHidden || included) &&
      card.dataset.vesselName.includes(search) &&
      (!status || card.dataset.status === status);
    card.hidden = !match;
    if (match) visible += 1;
  });
  const statusEl = plannerEl("plannerStatus");
  if (statusEl && plannerState.vessels.length) {
    const hiddenNote = hiddenCount && !showHidden
      ? ` ${hiddenCount} hidden; turn on “Show hidden vessels” to view them.`
      : "";
    statusEl.textContent = `${visible} of ${plannerState.vessels.length} active vessel(s) shown.${hiddenNote}`;
  }
  const empty = plannerEl("plannerNoResults");
  if (empty) empty.hidden = visible > 0;
}

function renderPlanner() {
  const host = plannerEl("vesselCards");
  if (!host) return;
  const cards = plannerState.vessels.map(renderVesselCard).join("");
  host.innerHTML = cards
    ? `<div class="planner-vessel-table-wrap">
        <table class="planner-vessel-table" aria-label="Vetting inspection planner vessels">
          <colgroup><col /><col /><col /><col /><col /><col /></colgroup>
          <thead><tr>
            <th scope="col">Vessel</th>
            <th scope="col">Last Inspection Date</th>
            <th scope="col">Last Inspecting Oil Major</th>
            <th scope="col">Last Inspection Negative Observations</th>
            <th scope="col">Status / Expiry</th>
            <th scope="col"><span class="planner-sr-only">Vessel details</span></th>
          </tr></thead>
          <tbody>
            ${cards}
            <tr id="plannerNoResults" class="planner-no-results" hidden><td colspan="6">No vessels match these filters.</td></tr>
          </tbody>
        </table>
      </div>`
    : `<div class="planner-panel planner-empty">No accessible active vessels were returned for this account.</div>`;
  applyFilters();
  host.querySelectorAll("[data-save-vessel]").forEach((button) => {
    button.addEventListener("click", () => saveVesselPlan(button.dataset.saveVessel));
  });
  host.querySelectorAll("[data-include-vessel]").forEach((input) => {
    input.addEventListener("change", () =>
      saveVesselPlan(input.dataset.includeVessel, { includeInPlanner: input.checked })
    );
  });
  host.querySelectorAll("[data-alternative-field]").forEach((input) => {
    input.addEventListener("input", () => {
      const row = plannerState.vessels.find((vessel) => vessel.vessel_id === input.dataset.vesselId);
      if (!row) return;
      vesselDraft(row)[input.dataset.alternativeField] = input.value;
    });
  });
  host.querySelectorAll("[data-vessel-remark-text]").forEach((input) => {
    input.addEventListener("input", () => {
      const row = plannerState.vessels.find((vessel) => vessel.vessel_id === input.dataset.vesselId);
      const index = Number(input.dataset.remarkIndex);
      const remark = row && vesselDraft(row).remarks[index];
      if (remark) remark.text = input.value;
    });
  });
  host.querySelectorAll("[data-add-remark]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = plannerState.vessels.find((vessel) => vessel.vessel_id === button.dataset.addRemark);
      if (!row || !plannerState.canEdit || plannerState.saving.has(row.vessel_id)) return;
      vesselDraft(row).remarks.push({ id: null, text: "" });
      renderPlanner();
      const card = host.querySelector(`.vessel-card[data-vessel-id="${CSS.escape(row.vessel_id)}"]`);
      const inputs = card?.querySelectorAll("[data-vessel-remark-text]");
      inputs?.[inputs.length - 1]?.focus();
    });
  });
  host.querySelectorAll("[data-remove-remark]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = plannerState.vessels.find((vessel) => vessel.vessel_id === button.dataset.removeRemark);
      const index = Number(button.dataset.remarkIndex);
      if (!row || !plannerState.canEdit || plannerState.saving.has(row.vessel_id)) return;
      const remarks = vesselDraft(row).remarks;
      if (!Number.isInteger(index) || index < 0 || index >= remarks.length) return;
      remarks.splice(index, 1);
      renderPlanner();
      showPlannerMessage("Remark removed from this page draft. It has not been deleted from the saved plan.", "success");
    });
  });
  host.querySelectorAll("[data-use-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = plannerState.vessels.find((vessel) => vessel.vessel_id === button.dataset.useSuggestion);
      if (!row?.suggestion?.major) return;
      const majorInput = plannerEl(`major-${row.vessel_id}`);
      if (!majorInput || majorInput.disabled) return;
      majorInput.value = row.suggestion.major;
      majorInput.focus();
      showPlannerMessage("Suggestion copied to Planned next oil major. Save the vessel plan to store it.", "success");
    });
  });
}

async function waitForModuleGuard() {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const guard = window.CSVB_MODULE_GUARD;
    if (guard?.page === "vetting-inspection-planner.html") {
      if (guard.allowed === true) return guard;
      if (guard.allowed === false) throw new Error("You do not have permission to open the Vetting Inspection Planner.");
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error("The module access check did not finish. Reload this page and try again.");
}

async function loadPlanner() {
  showPlannerMessage("");
  plannerEl("plannerStatus").textContent = "Loading accessible active vessels and inspection history…";
  const { data, error } = await plannerState.supabase.rpc("csvb_vetting_inspection_planner_for_me_v2");
  if (error) throw new Error(error.message || "Could not load the inspection plan.");
  plannerState.vessels = normalizePlannerData(data);
  renderPlanner();
  plannerEl("plannerStatus").textContent = `${plannerState.vessels.length} active vessel(s) loaded.`;
  return plannerState.vessels;
}

async function saveVesselPlan(vesselId, { includeInPlanner } = {}) {
  const row = plannerState.vessels.find((vessel) => vessel.vessel_id === String(vesselId));
  if (!row || !plannerState.canEdit || plannerState.saving.has(row.vessel_id)) return;

  const intervalValue = plannerEl(`interval-${row.vessel_id}`)?.value ?? "";
  const intervalOverride = intervalValue === "" ? null : Number(intervalValue);
  if (intervalOverride !== null && (!Number.isInteger(intervalOverride) || intervalOverride < 1 || intervalOverride > 6)) {
    showPlannerMessage("The interval override must be between 1 and 6 months.");
    return;
  }

  const major = String(plannerEl(`major-${row.vessel_id}`)?.value || "").trim();
  const includeInput = plannerEl(`include-${row.vessel_id}`);
  const include = typeof includeInPlanner === "boolean"
    ? includeInPlanner
    : (includeInput?.checked ?? row.include_in_planner);
  const saveButton = document.querySelector(`[data-save-vessel="${CSS.escape(row.vessel_id)}"]`);
  plannerState.saving.add(row.vessel_id);
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
  }
  if (includeInput) includeInput.disabled = true;
  showPlannerMessage("");

  try {
    const { data, error } = await plannerState.supabase.rpc("csvb_vetting_inspection_plan_save_v2", {
      p_vessel_id: row.vessel_id,
      p_interval_months_override: intervalOverride,
      p_planned_oil_major: major || null,
      p_include_in_planner: include,
    });
    if (error) throw error;
    if (data === false || data?.success === false) {
      throw new Error(data?.message || "The planning settings were not saved.");
    }
    const refreshed = await loadPlanner();
    const savedRow = refreshed.find((vessel) => vessel.vessel_id === row.vessel_id);
    const intervalPersisted = intervalOverride === null
      ? savedRow?.interval_override_months === null
      : savedRow?.interval_override_months === intervalOverride ||
        savedRow?.effective_interval_months === intervalOverride;
    if (!savedRow || savedRow.include_in_planner !== include || !intervalPersisted) {
      throw new Error("The server did not return the saved planner visibility or interval value after reload.");
    }
    showPlannerMessage(`Saved the primary major, interval, and planner inclusion for ${row.vessel_name}. Alternative majors and remarks remain page drafts and were not saved.`, "success");
  } catch (error) {
    showPlannerMessage(`Could not save planning settings for ${row.vessel_name}: ${error?.message || String(error)}`);
  } finally {
    plannerState.saving.delete(row.vessel_id);
    if (includeInput) includeInput.disabled = false;
    renderPlanner();
  }
}

async function initPlanner() {
  if (!window.AUTH?.getSessionUserProfile || !window.AUTH?.ensureSupabase) {
    throw new Error("Authentication is unavailable. Reload the application.");
  }
  const bundle = await window.AUTH.getSessionUserProfile();
  if (!bundle?.session?.user) {
    window.location.href = "./login.html";
    return;
  }
  plannerState.user = bundle.profile || {};
  plannerState.supabase = window.AUTH.ensureSupabase();
  window.AUTH.fillUserBadge?.(bundle, "userBadge");
  plannerEl("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  await waitForModuleGuard();
  const platform = ["super_admin", "platform_owner"].includes(plannerState.user.role);
  const simulatingCompany = platform && Boolean(
    localStorage.getItem("csvb_superuser_company_view_id")
  );
  const { data: permissionRows, error: permissionError } =
    await plannerState.supabase.rpc("csvb_my_effective_app_permissions");
  if (permissionError) throw new Error("Could not verify planner edit permission: " + permissionError.message);
  plannerState.canEdit = window.CSVB_READ_ONLY_ACCESS !== true &&
    ((platform && !simulatingCompany) ||
      (permissionRows || []).some((permission) =>
        permission.module_code === PLANNER_MODULE_CODE &&
        permission.permission_action === "edit" &&
        permission.is_granted === true
      ));

  plannerEl("refreshPlannerBtn").addEventListener("click", () =>
    loadPlanner().catch((error) => showPlannerMessage(error?.message || String(error)))
  );
  plannerEl("vesselSearch").addEventListener("input", applyFilters);
  plannerEl("statusFilter").addEventListener("change", applyFilters);
  plannerEl("showHiddenVessels").addEventListener("change", applyFilters);
  plannerEl("clearFiltersBtn").addEventListener("click", () => {
    plannerEl("vesselSearch").value = "";
    plannerEl("statusFilter").value = "";
    plannerEl("showHiddenVessels").checked = false;
    applyFilters();
  });
  await loadPlanner();
}

initPlanner().catch((error) => {
  console.error("Vetting Inspection Planner failed:", error);
  plannerEl("plannerStatus").textContent = "The planner could not be loaded.";
  showPlannerMessage(error?.message || String(error));
});
