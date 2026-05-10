// public/csvb-platform-areas-admin.js
// C.S.V. BEACON – Superuser Platform Areas Admin
// PA-6C: manage dashboard platform areas and module mappings from Superuser Administration.

(() => {
  "use strict";

  const BUILD = "PA6C-2026-05-10";

  const MODULE_CARD_CATALOG = [
    { key: "company_policy", label: "Company Policy" },

    { key: "library", label: "Read-Only Library" },
    { key: "company", label: "Company Builder" },
    { key: "assignments", label: "Self-Assessment Assignments" },
    { key: "tasks", label: "My Self-Assessment Tasks" },
    { key: "vessel", label: "Vessel View – My Questionnaires" },
    { key: "post", label: "Post-Inspection Entry" },
    { key: "poststats", label: "Post-Inspection Stats" },
    { key: "compare", label: "Pre/Post Compare" },
    { key: "inspector_intelligence", label: "Inspector Intelligence" },
    { key: "reports", label: "Reports" },
    { key: "inspector", label: "Inspector / Third-Party" },
    { key: "qeditor", label: "Questions Editor" },
    { key: "threads", label: "Threads" },

    { key: "audit_observations", label: "Audit Observations" },

    { key: "suadmin", label: "Superuser Administration" },
  ];

  const state = {
    areas: [],
    modulesByAreaId: new Map(),
    selectedAreaId: "",
    loaded: false,
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cleanKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
  }

  function sb() {
    if (!window.AUTH?.ensureSupabase) {
      throw new Error("AUTH helper is not available.");
    }
    return window.AUTH.ensureSupabase();
  }

  function showAdminWarn(message) {
    if (typeof window.showWarn === "function") {
      window.showWarn(message);
      return;
    }

    const el = document.getElementById("warnBox");
    if (!el) {
      alert(message);
      return;
    }

    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  function showAdminOk(message) {
    if (typeof window.showOk === "function") {
      window.showOk(message);
      return;
    }

    const el = document.getElementById("okBox");
    if (!el) return;

    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  function clearAdminMessages() {
    const warn = document.getElementById("warnBox");
    const ok = document.getElementById("okBox");

    if (warn) {
      warn.textContent = "";
      warn.style.display = "none";
    }

    if (ok) {
      ok.textContent = "";
      ok.style.display = "none";
    }
  }

  function injectStyles() {
    if (document.getElementById("csvb-platform-areas-admin-styles")) return;

    const style = document.createElement("style");
    style.id = "csvb-platform-areas-admin-styles";
    style.textContent = `
      .paAdminLayout {
        display: grid;
        grid-template-columns: minmax(360px, .9fr) minmax(520px, 1.4fr);
        gap: 12px;
        align-items: start;
      }

      @media(max-width: 1100px) {
        .paAdminLayout {
          grid-template-columns: 1fr;
        }
      }

      .paAreaRow {
        cursor: pointer;
      }

      .paAreaRow:hover {
        background: #f7fbff;
      }

      .paAreaRow.active {
        outline: 2px solid #1a4170;
        outline-offset: -2px;
        background: #eef6ff;
      }

      .paAreaTitle {
        color: #062A5E;
        font-weight: 950;
      }

      .paAreaMeta {
        color: #4d6283;
        font-size: .86rem;
        font-weight: 700;
        margin-top: 3px;
      }

      .paModuleGrid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
        gap: 8px;
      }

      .paModuleOption {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        border: 1px solid #dbe6f6;
        background: #f9fbfe;
        border-radius: 10px;
        padding: 8px;
      }

      .paModuleOption input {
        width: auto;
        margin-top: 3px;
      }

      .paModuleKey {
        color: #4d6283;
        font-size: .78rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","Courier New", monospace;
      }

      .paSmallNote {
        color: #4d6283;
        font-size: .84rem;
        line-height: 1.35;
        font-weight: 700;
      }

      .paAdminPill {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid #cbd8ea;
        background: #f7fbff;
        color: #1a4170;
        font-weight: 900;
        font-size: .78rem;
      }
    `;

    document.head.appendChild(style);
  }

  function injectTabAndPanel() {
    if (document.getElementById("paAdminTab")) return;

    injectStyles();

    const tabs = document.querySelector(".tabs");
    const wrap = document.querySelector(".wrap");

    if (!tabs || !wrap) {
      console.warn("Platform Areas admin injection skipped: tabs/wrap not found.");
      return;
    }

    const tab = document.createElement("button");
    tab.className = "tab";
    tab.type = "button";
    tab.id = "paAdminTab";
    tab.setAttribute("data-tab", "platform_areas");
    tab.textContent = "Platform Areas";

    tabs.appendChild(tab);

    const panel = document.createElement("div");
    panel.className = "card";
    panel.id = "tab-platform-areas";
    panel.style.display = "none";
    panel.innerHTML = `
      <div class="row">
        <div>
          <div style="font-weight:950;font-size:1.05rem;">Platform Areas</div>
          <div class="muted" style="margin-top:6px;">
            Manage the major Dashboard areas and assign existing dashboard modules to each area.
          </div>
        </div>
        <div class="right actions">
          <button class="btn2 btnSmall" type="button" id="paRefreshBtn">Refresh</button>
          <button class="btn2 btnSmall" type="button" id="paNewBtn">New area</button>
          <button class="btn btnSmall" type="button" id="paSaveBtn">Save area</button>
        </div>
      </div>

      <div style="height:12px;"></div>

      <div class="paAdminLayout">
        <div class="card" style="box-shadow:none;">
          <div class="row">
            <div style="font-weight:950;">Platform area list</div>
            <div class="right">
              <span class="paAdminPill" id="paAreaCount">0 areas</span>
            </div>
          </div>

          <div style="height:10px;"></div>

          <input id="paSearch" placeholder="Search area key / title…" />

          <div style="height:10px;"></div>

          <div style="overflow:auto; max-height:620px;">
            <table>
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Modules</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="paAreasBody">
                <tr><td colspan="3" class="muted small">Loading…</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="box-shadow:none;">
          <div class="row">
            <div>
              <div id="paFormTitle" style="font-weight:950;">Create / Edit platform area</div>
              <div class="muted small">
                Area key uses lowercase letters, numbers and underscores only.
              </div>
            </div>
          </div>

          <input type="hidden" id="paAreaId" />

          <div style="height:12px;"></div>

          <div class="grid2">
            <div class="field">
              <label>Area key</label>
              <input id="paAreaKey" placeholder="e.g. marine_applications_vessel_interaction" />
            </div>

            <div class="field">
              <label>Title</label>
              <input id="paTitle" placeholder="e.g. Marine Applications & Vessel Interaction" />
            </div>
          </div>

          <div style="height:10px;"></div>

          <div class="grid2">
            <div class="field">
              <label>Icon</label>
              <input id="paIcon" placeholder="e.g. ⚓" />
            </div>

            <div class="field">
              <label>Sort order</label>
              <input id="paSortOrder" type="number" step="10" placeholder="e.g. 30" />
            </div>
          </div>

          <div style="height:10px;"></div>

          <div class="field">
            <label>Description</label>
            <textarea id="paDescription" placeholder="Short description shown on Dashboard area card"></textarea>
          </div>

          <div style="height:10px;"></div>

          <div class="field">
            <label>Placeholder text</label>
            <textarea id="paPlaceholder" placeholder="Shown when no modules are available in this area"></textarea>
          </div>

          <div style="height:10px;"></div>

          <div class="row">
            <label class="inline" style="gap:8px;font-weight:900;">
              <input id="paDefaultSelected" type="checkbox" style="width:auto;" />
              Default selected area
            </label>

            <label class="inline" style="gap:8px;font-weight:900;">
              <input id="paIsActive" type="checkbox" style="width:auto;" checked />
              Active
            </label>
          </div>

          <div style="height:14px;"></div>

          <div class="card" style="box-shadow:none;">
            <div style="font-weight:950;">Assigned dashboard modules</div>
            <div class="paSmallNote" style="margin-top:6px;">
              These are the existing Dashboard module card keys. Rights Matrix and company module enablement still control whether the user actually sees each module.
            </div>

            <div style="height:10px;"></div>

            <div id="paModuleChecks" class="paModuleGrid"></div>

            <div style="height:10px;"></div>

            <div class="field">
              <label>Additional module keys</label>
              <textarea id="paExtraModules" placeholder="Optional. Comma-separated module card keys not listed above."></textarea>
              <div class="paSmallNote">
                Use this only after a new Dashboard module card exists.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const anchor = document.getElementById("tab-users") || document.querySelector(".wrap > .card:last-child");
    if (anchor) {
      anchor.parentElement.insertBefore(panel, anchor);
    } else {
      wrap.appendChild(panel);
    }

    wireEvents();
  }

  function hideKnownPanels() {
    [
      "tab-companies",
      "tab-users",
      "tab-vessels",
      "tab-rights",
      "tab-platform-areas",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
  }

  function activatePlatformAreasTab() {
    document.querySelectorAll(".tab").forEach((btn) => btn.classList.remove("active"));

    const tab = document.getElementById("paAdminTab");
    const panel = document.getElementById("tab-platform-areas");

    if (tab) tab.classList.add("active");

    hideKnownPanels();

    if (panel) panel.style.display = "";

    loadPlatformAreaAdmin()
      .catch((error) => showAdminWarn(String(error?.message || error)));
  }

  function wireEvents() {
    document.getElementById("paAdminTab")?.addEventListener("click", activatePlatformAreasTab);

    document.querySelectorAll(".tab:not(#paAdminTab)").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = document.getElementById("tab-platform-areas");
        if (panel) panel.style.display = "none";
      });
    });

    document.getElementById("paRefreshBtn")?.addEventListener("click", async () => {
      try {
        clearAdminMessages();
        await reloadPlatformAreaAdmin();
        showAdminOk("Platform areas refreshed.");
      } catch (error) {
        showAdminWarn(String(error?.message || error));
      }
    });

    document.getElementById("paNewBtn")?.addEventListener("click", () => {
      clearAdminMessages();
      clearForm();
    });

    document.getElementById("paSaveBtn")?.addEventListener("click", async () => {
      try {
        clearAdminMessages();
        await saveCurrentArea();
        showAdminOk("Platform area saved.");
      } catch (error) {
        showAdminWarn(String(error?.message || error));
      }
    });

    document.getElementById("paSearch")?.addEventListener("input", renderAreaList);
  }

  function renderModuleChecks(selectedKeys = []) {
    const box = document.getElementById("paModuleChecks");
    if (!box) return;

    const selected = new Set(selectedKeys);

    box.innerHTML = MODULE_CARD_CATALOG.map((m) => {
      const checked = selected.has(m.key) ? "checked" : "";

      return `
        <label class="paModuleOption">
          <input class="paModuleCheck" type="checkbox" value="${esc(m.key)}" ${checked} />
          <span>
            <span style="font-weight:950;color:#062A5E;">${esc(m.label)}</span><br />
            <span class="paModuleKey">${esc(m.key)}</span>
          </span>
        </label>
      `;
    }).join("");
  }

  function clearForm() {
    state.selectedAreaId = "";

    const values = {
      paAreaId: "",
      paAreaKey: "",
      paTitle: "",
      paIcon: "",
      paSortOrder: "100",
      paDescription: "",
      paPlaceholder: "",
      paExtraModules: "",
    };

    Object.entries(values).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    });

    const active = document.getElementById("paIsActive");
    if (active) active.checked = true;

    const def = document.getElementById("paDefaultSelected");
    if (def) def.checked = false;

    renderModuleChecks([]);

    const title = document.getElementById("paFormTitle");
    if (title) title.textContent = "Create platform area";

    document.querySelectorAll(".paAreaRow").forEach((row) => row.classList.remove("active"));
  }

  async function loadPlatformAreaAdmin() {
    if (state.loaded) return;
    await reloadPlatformAreaAdmin();
  }

  async function reloadPlatformAreaAdmin() {
    const { data: areas, error: areaError } = await sb()
      .from("dashboard_platform_areas")
      .select("id,area_key,title,icon,description,placeholder,sort_order,default_selected,is_active")
      .order("sort_order", { ascending: true })
      .order("area_key", { ascending: true });

    if (areaError) {
      throw new Error("Could not load platform areas: " + areaError.message);
    }

    const { data: modules, error: modError } = await sb()
      .from("dashboard_platform_area_modules")
      .select("area_id,module_card_key,sort_order,is_active")
      .order("sort_order", { ascending: true })
      .order("module_card_key", { ascending: true });

    if (modError) {
      throw new Error("Could not load platform area module mappings: " + modError.message);
    }

    state.areas = Array.isArray(areas) ? areas : [];
    state.modulesByAreaId = new Map();

    (modules || []).forEach((m) => {
      if (m.is_active === false) return;

      const list = state.modulesByAreaId.get(m.area_id) || [];
      list.push(m.module_card_key);
      state.modulesByAreaId.set(m.area_id, list);
    });

    state.loaded = true;

    renderAreaList();

    if (state.selectedAreaId) {
      const found = state.areas.find((a) => String(a.id) === String(state.selectedAreaId));
      if (found) {
        selectArea(found.id);
        return;
      }
    }

    if (state.areas[0]) {
      selectArea(state.areas[0].id);
    } else {
      clearForm();
    }
  }

  function renderAreaList() {
    const tbody = document.getElementById("paAreasBody");
    const count = document.getElementById("paAreaCount");
    if (!tbody) return;

    const q = (document.getElementById("paSearch")?.value || "").trim().toLowerCase();

    const rows = state.areas.filter((a) => {
      if (!q) return true;

      const hay = [
        a.area_key,
        a.title,
        a.description,
        a.placeholder,
      ].filter(Boolean).join(" ").toLowerCase();

      return hay.includes(q);
    });

    if (count) {
      count.textContent = state.areas.length === 1 ? "1 area" : `${state.areas.length} areas`;
    }

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="muted small">No platform areas found.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((a) => {
      const modules = state.modulesByAreaId.get(a.id) || [];
      const activePill = a.is_active === false
        ? '<span class="pill bad">Inactive</span>'
        : '<span class="pill ok">Active</span>';

      const def = a.default_selected
        ? '<span class="paAdminPill">Default</span>'
        : "";

      return `
        <tr class="paAreaRow ${String(a.id) === String(state.selectedAreaId) ? "active" : ""}" data-pa-area-id="${esc(a.id)}">
          <td>
            <div class="paAreaTitle">${esc(a.icon || "")} ${esc(a.title || "")}</div>
            <div class="paAreaMeta">${esc(a.area_key || "")}</div>
            <div style="margin-top:4px;">${def}</div>
          </td>
          <td>${modules.length}</td>
          <td>${activePill}</td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-pa-area-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-pa-area-id");
        selectArea(id);
      });
    });
  }

  function selectArea(id) {
    const area = state.areas.find((a) => String(a.id) === String(id));
    if (!area) return;

    state.selectedAreaId = area.id;

    const fields = {
      paAreaId: area.id || "",
      paAreaKey: area.area_key || "",
      paTitle: area.title || "",
      paIcon: area.icon || "",
      paSortOrder: area.sort_order ?? 100,
      paDescription: area.description || "",
      paPlaceholder: area.placeholder || "",
    };

    Object.entries(fields).forEach(([fieldId, value]) => {
      const el = document.getElementById(fieldId);
      if (el) el.value = value;
    });

    const active = document.getElementById("paIsActive");
    if (active) active.checked = area.is_active !== false;

    const def = document.getElementById("paDefaultSelected");
    if (def) def.checked = area.default_selected === true;

    const modules = state.modulesByAreaId.get(area.id) || [];
    renderModuleChecks(modules);

    const known = new Set(MODULE_CARD_CATALOG.map((m) => m.key));
    const extras = modules.filter((m) => !known.has(m));

    const extraBox = document.getElementById("paExtraModules");
    if (extraBox) extraBox.value = extras.join(", ");

    const title = document.getElementById("paFormTitle");
    if (title) title.textContent = `Edit platform area: ${area.title || area.area_key}`;

    renderAreaList();
  }

  function collectSelectedModules() {
    const checked = Array.from(document.querySelectorAll(".paModuleCheck:checked"))
      .map((el) => String(el.value || "").trim())
      .filter(Boolean);

    const extrasRaw = document.getElementById("paExtraModules")?.value || "";
    const extras = extrasRaw
      .split(",")
      .map((x) => cleanKey(x))
      .filter(Boolean);

    return Array.from(new Set([...checked, ...extras]));
  }

  function collectForm() {
    const areaKey = cleanKey(document.getElementById("paAreaKey")?.value || "");
    const title = (document.getElementById("paTitle")?.value || "").trim();

    if (!areaKey) {
      throw new Error("Area key is required.");
    }

    if (!title) {
      throw new Error("Title is required.");
    }

    return {
      areaKey,
      title,
      icon: (document.getElementById("paIcon")?.value || "").trim(),
      sortOrder: Number(document.getElementById("paSortOrder")?.value || 100),
      description: (document.getElementById("paDescription")?.value || "").trim(),
      placeholder: (document.getElementById("paPlaceholder")?.value || "").trim(),
      defaultSelected: document.getElementById("paDefaultSelected")?.checked === true,
      isActive: document.getElementById("paIsActive")?.checked !== false,
      modules: collectSelectedModules(),
    };
  }

  async function saveCurrentArea() {
    const form = collectForm();

    const upsert = await sb().rpc("csvb_dashboard_upsert_platform_area", {
      p_area_key: form.areaKey,
      p_title: form.title,
      p_icon: form.icon || null,
      p_description: form.description || null,
      p_placeholder: form.placeholder || null,
      p_sort_order: form.sortOrder,
      p_default_selected: form.defaultSelected,
      p_is_active: form.isActive,
    });

    if (upsert.error) {
      throw new Error("Could not save platform area: " + upsert.error.message);
    }

    const setModules = await sb().rpc("csvb_dashboard_set_platform_area_modules", {
      p_area_key: form.areaKey,
      p_module_cards: form.modules,
    });

    if (setModules.error) {
      throw new Error("Platform area saved, but module assignment failed: " + setModules.error.message);
    }

    state.loaded = false;
    await reloadPlatformAreaAdmin();

    const saved = state.areas.find((a) => a.area_key === form.areaKey);
    if (saved) selectArea(saved.id);
  }

  function init() {
    injectTabAndPanel();

    window.CSVB_PLATFORM_AREAS_ADMIN = {
      build: BUILD,
      reload: reloadPlatformAreaAdmin,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();