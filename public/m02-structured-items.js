(function () {
  "use strict";
  const KEY = "m02_structured_items";
  const configs = {
    1: { key: "meetings", title: "Meeting details", add: "Add meeting", fields: [["meeting_date", "Meeting Date", "date"], ["details", "Meeting details / discussion topics", "textarea"]] },
    2: { key: "drills", title: "Drill records", add: "Add drill", fields: [["drill_type", "Drill Type"], ["drill_date", "Drill Date", "date"], ["remarks", "Remarks / Comments", "textarea"]] },
    24: { key: "near_misses", title: "Near-miss records", add: "Add near miss", fields: [["reference", "Near Miss Reference / Number"], ["description", "Near Miss Title / Description"], ["date", "Date", "date"], ["remarks", "Remarks / Comments", "textarea"]] }
  };
  let hooks, data, original, supported = true, touched = false, present = false;
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const editable = () => supported && hooks.state.canEdit && !hooks.state.saving;
  function load(details = {}) {
    present = Object.prototype.hasOwnProperty.call(details, KEY);
    original = present ? clone(details[KEY]) : null;
    supported = !present || (object(original) && original.schema_version === 1 &&
      (!original.company_items || object(original.company_items)) && (!original.critical_items || object(original.critical_items)));
    data = supported && present ? clone(original) : { schema_version: 1 };
    data.company_items ||= {}; data.critical_items ||= {};
    touched = false;
  }
  function item(no) {
    if (!object(data.company_items[no])) data.company_items[no] = {};
    return data.company_items[no];
  }
  function rowsFor(no) {
    const config = configs[no], owner = item(no);
    if (!Array.isArray(owner[config.key])) owner[config.key] = [];
    if (!owner[config.key].length) owner[config.key].push({ id: crypto.randomUUID() });
    owner[config.key].forEach((row) => { if (object(row) && !row.id) row.id = crypto.randomUUID(); });
    return owner[config.key];
  }
  function field(key, text, type = "text", value = "") {
    const label = document.createElement("label"); label.className = "m02-field";
    label.append(document.createTextNode(text));
    const input = document.createElement(type === "textarea" ? "textarea" : "input");
    if (type === "textarea") { input.rows = 2; input.maxLength = 50000; }
    else { input.type = type; if (type === "text") input.maxLength = 1000; }
    input.value = value == null ? "" : String(value);
    input.dataset.m02SupportField = key; input.disabled = !editable();
    label.append(input); return label;
  }
  function button(text, className = "m02-button m02-button-outline") {
    const result = document.createElement("button");
    result.type = "button"; result.className = className; result.textContent = text; result.disabled = !editable();
    return result;
  }
  function renderRows(host, no) {
    host.replaceChildren();
    const config = configs[no];
    rowsFor(no).filter(object).forEach((row, index) => {
      const wrapper = document.createElement("div"); wrapper.className = "m02-repeat-item m02-support-row";
      wrapper.dataset.m02SupportRow = row.id; wrapper.dataset.m02CompanyItem = String(no);
      const fields = document.createElement("div"); fields.className = "m02-support-fields";
      config.fields.forEach(([key, text, type]) => fields.append(field(key, text, type, row[key])));
      const remove = button("×", "m02-remove-row");
      remove.setAttribute("aria-label", `Remove ${config.title.toLowerCase()} entry ${index + 1}`);
      remove.addEventListener("click", () => {
        if (!editable()) return;
        item(no)[config.key] = rowsFor(no).filter((entry) => entry.id !== row.id);
        touched = true; hooks.markDirty(); renderRows(host, no);
      });
      wrapper.append(fields, remove); host.append(wrapper);
    });
  }
  function mountCompany(card, no) {
    if (!configs[no] && no !== 16) return;
    const section = document.createElement("section"); section.className = "m02-item-support";
    section.dataset.m02CompanyItem = String(no);
    if (!supported) {
      section.textContent = "Supporting details use a different format and are preserved unchanged.";
      card.append(section); return;
    }
    if (no === 16) {
      const blocks = document.createElement("div"); blocks.className = "m02-orb-blocks";
      [["orb_part_i", "ORB Part I"], ["orb_part_ii", "ORB Part II"]].forEach(([key, title]) => {
        const owner = item(no); if (!object(owner[key])) owner[key] = {};
        const block = document.createElement("div"); block.className = "m02-orb-block"; block.dataset.m02OrbPart = key;
        const heading = document.createElement("h4"); heading.textContent = title;
        const fields = document.createElement("div"); fields.className = "m02-support-fields";
        [["from_period", "From Date / Period"], ["to_period", "To Date / Period"], ["findings", "Findings / Comments", "textarea"]].forEach(([name, text, type]) => {
          const label = field(name, text, type, owner[key][name]);
          if (name !== "findings") label.querySelector("input").placeholder = name === "from_period" ? "e.g. Mar. 2025" : "e.g. Nov. 2025";
          fields.append(label);
        });
        block.append(heading, fields); blocks.append(block);
      });
      section.append(blocks);
    } else {
      const config = configs[no], head = document.createElement("div"); head.className = "m02-support-head";
      const title = document.createElement("h4"); title.textContent = config.title;
      const add = button(config.add); add.dataset.m02AddSupporting = String(no);
      const rows = document.createElement("div");
      add.addEventListener("click", () => {
        if (!editable()) return;
        rowsFor(no).push({ id: crypto.randomUUID() }); touched = true; hooks.markDirty(); renderRows(rows, no);
        rows.lastElementChild?.querySelector("input,textarea")?.focus();
      });
      head.append(title, add); section.append(head, rows); renderRows(rows, no);
    }
    card.append(section);
  }
  function mountCritical() {
    if (!supported) return;
    document.querySelectorAll("[data-critical-item]").forEach((card) => {
      const no = card.dataset.criticalItem;
      const date = field("date_tested", "Date Tested", "date", data.critical_items[no]?.date_tested);
      date.querySelector("input").dataset.m02CriticalDate = no;
      card.querySelector(".m02-appendix-grid").firstElementChild.after(date);
    });
  }
  function changed(event) {
    if (!editable()) return;
    const input = event.target.closest("[data-m02-support-field]"); if (!input) return;
    const name = input.dataset.m02SupportField;
    if (input.dataset.m02CriticalDate) {
      const no = input.dataset.m02CriticalDate;
      if (!object(data.critical_items[no])) data.critical_items[no] = {};
      data.critical_items[no].date_tested = input.value;
    } else {
      const section = input.closest("[data-m02-company-item]");
      if (!section) return;
      const no = Number(section.dataset.m02CompanyItem), part = input.closest("[data-m02-orb-part]");
      if (no === 16 && part) item(no)[part.dataset.m02OrbPart][name] = input.value;
      else if (configs[no]) {
        const id = input.closest("[data-m02-support-row]").dataset.m02SupportRow;
        const row = rowsFor(no).find((entry) => entry.id === id);
        if (row) row[name] = input.value;
      } else return;
    }
    touched = true; hooks.markDirty();
  }
  function detailsPatch() {
    if (!supported || (!present && !touched)) return {};
    const saved = clone(data);
    // Do not store the single empty helper row shown in a newly opened item.
    Object.entries(configs).forEach(([no, config]) => {
      const owner = saved.company_items[no];
      if (Array.isArray(owner?.[config.key])) owner[config.key] = owner[config.key].filter((row) =>
        object(row) && Object.entries(row).some(([key, value]) => key !== "id" && value != null && value !== ""));
    });
    return { [KEY]: saved };
  }
  function init(value) {
    hooks = value; load();
    const form = document.getElementById("reportForm");
    form.addEventListener("input", changed); form.addEventListener("change", changed);
  }
  window.CSVB_M02_STRUCTURED_ITEMS = { init, load, mountCompany, mountCritical, detailsPatch, key: KEY };
})();
