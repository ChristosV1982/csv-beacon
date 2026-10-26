const MODES = [
  {
    value: "per_finding",
    label: "Per finding",
    description: "Count each Human finding once, regardless of how many PIFs are attached.",
  },
  {
    value: "per_pif",
    label: "Per PIF",
    description: "Count each distinct retained PIF attached to a Human finding.",
  },
];

const stylesheetUrl = new URL("./csvb-human-counting-panel.css", import.meta.url).href;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function unwrapResult(result) {
  const payload = result?.data;
  return Array.isArray(payload) ? payload[0] ?? null : payload ?? null;
}

function errorMessage(error, fallback) {
  return error?.message || error?.details || fallback;
}

export async function mountHumanCountingPanel({ supabase, host, onSaved, initialCompanyId = null } = {}) {
  if (!supabase?.rpc || !host?.appendChild) {
    throw new TypeError("mountHumanCountingPanel requires a Supabase client and a host element.");
  }

  let stylesheet = document.querySelector(`link[data-csvb-human-counting-style="${stylesheetUrl}"]`);
  if (!stylesheet) {
    stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = stylesheetUrl;
    stylesheet.dataset.csvbHumanCountingStyle = stylesheetUrl;
    document.head.appendChild(stylesheet);
  }

  const root = node("section", "csvb-human-counting");
  root.setAttribute("aria-labelledby", "csvb-human-counting-title");
  const heading = node("h2", "csvb-human-counting__title", "Human observation counting");
  heading.id = "csvb-human-counting-title";
  root.appendChild(heading);
  root.appendChild(node(
    "p",
    "csvb-human-counting__explanation",
    "Per finding counts each Human finding once. Per PIF counts each distinct retained PIF attached to that Human finding. Stored finding records are never duplicated.",
  ));

  const companyRow = node("div", "csvb-human-counting__company-row");
  const companyLabel = node("label", "csvb-human-counting__label", "Company");
  const companySelect = node("select", "csvb-human-counting__select");
  companySelect.id = `csvb-human-counting-company-${Math.random().toString(36).slice(2, 9)}`;
  companyLabel.htmlFor = companySelect.id;
  companyRow.append(companyLabel, companySelect);
  root.appendChild(companyRow);

  const companyInfo = node("div", "csvb-human-counting__company-info");
  const companyName = node("strong", "csvb-human-counting__company-name", "Company not selected");
  const revision = node("span", "csvb-human-counting__revision", "Revision —");
  companyInfo.append(companyName, revision);
  root.appendChild(companyInfo);

  const fieldset = node("fieldset", "csvb-human-counting__choices");
  const legend = node("legend", "csvb-human-counting__legend", "Counting policy");
  fieldset.appendChild(legend);
  const radioInputs = new Map();
  for (const mode of MODES) {
    const label = node("label", "csvb-human-counting__choice");
    const input = node("input");
    input.type = "radio";
    input.name = "csvb-human-counting-mode";
    input.value = mode.value;
    input.disabled = true;
    const copy = node("span", "csvb-human-counting__choice-copy");
    copy.append(node("span", "csvb-human-counting__choice-title", mode.label));
    copy.append(node("span", "csvb-human-counting__choice-description", mode.description));
    label.append(input, copy);
    fieldset.appendChild(label);
    radioInputs.set(mode.value, input);
  }
  root.appendChild(fieldset);

  const status = node("div", "csvb-human-counting__status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  root.appendChild(status);

  const actions = node("div", "csvb-human-counting__actions");
  const retryButton = node("button", "csvb-human-counting__button csvb-human-counting__button--quiet", "Retry");
  retryButton.type = "button";
  retryButton.hidden = true;
  const saveButton = node("button", "csvb-human-counting__button csvb-human-counting__button--primary", "Save");
  saveButton.type = "button";
  saveButton.disabled = true;
  actions.append(retryButton, saveButton);
  root.appendChild(actions);
  host.appendChild(root);

  let policy = null;
  let draftMode = null;
  let availableCompanies = [];
  let selectedCompanyId = null;
  let loading = false;
  let saving = false;
  let hasSelectedCompany = false;
  let disposed = false;

  function setStatus(message, kind = "info", showRetry = false) {
    status.textContent = message;
    status.className = `csvb-human-counting__status csvb-human-counting__status--${kind}`;
    status.hidden = !message;
    retryButton.hidden = !showRetry;
  }

  function refreshControls() {
    const companies = availableCompanies;
    const requiresSelection = companies.length > 0 && selectedCompanyId == null;
    companyRow.hidden = companies.length === 0;
    companySelect.disabled = loading || saving;
    for (const [mode, input] of radioInputs) {
      input.disabled = loading || saving || !policy?.can_edit || policy?.company_id == null;
      input.checked = draftMode === mode;
    }
    const validMode = MODES.some((mode) => mode.value === policy?.human_counting_mode);
    saveButton.disabled = loading || saving || !policy?.can_edit ||
      policy?.company_id == null || !validMode ||
      [...radioInputs.values()].every((input) => !input.checked || input.value === policy?.human_counting_mode);
    saveButton.textContent = saving ? "Saving…" : "Save";
    if (requiresSelection) {
      companyName.textContent = "Company not selected";
      revision.textContent = "Revision —";
      setStatus("Select a company to load its Human counting policy.", "info");
      for (const input of radioInputs.values()) {
        input.checked = false;
        input.disabled = true;
      }
      saveButton.disabled = true;
    }
  }

  function populateCompanies(companies, selectedId) {
    while (companySelect.firstChild) companySelect.removeChild(companySelect.firstChild);
    const placeholder = node("option", "", "Select a company");
    placeholder.value = "";
    companySelect.appendChild(placeholder);
    for (const company of companies) {
      if (!company || company.id == null) continue;
      const option = node("option", "", String(company.name ?? "Unnamed company"));
      option.value = String(company.id);
      companySelect.appendChild(option);
    }
    companySelect.value = selectedId == null ? "" : String(selectedId);
  }

  function displayPolicy(nextPolicy, companies = nextPolicy?.companies) {
    draftMode = nextPolicy?.human_counting_mode ?? null;
    policy = nextPolicy;
    if (Array.isArray(companies)) {
      availableCompanies = companies;
      populateCompanies(availableCompanies, nextPolicy?.company_id ?? selectedCompanyId);
    }
    selectedCompanyId = nextPolicy?.company_id ?? selectedCompanyId;
    hasSelectedCompany = nextPolicy?.company_id != null;
    companyName.textContent = nextPolicy?.company_name == null
      ? "Company not selected"
      : String(nextPolicy.company_name);
    revision.textContent = nextPolicy?.policy_revision == null
      ? "Revision unavailable"
      : `Revision ${String(nextPolicy.policy_revision)}`;
    const knownMode = MODES.some((mode) => mode.value === nextPolicy?.human_counting_mode);
    if (!hasSelectedCompany) {
      setStatus("Select a company to load its Human counting policy.", "info");
    } else if (!knownMode) {
      setStatus("The server returned an unrecognized counting policy. No default has been applied.", "error");
    } else if (nextPolicy?.can_edit !== true) {
      setStatus("This policy is read-only for your account.", "info");
    } else {
      setStatus("");
    }
    refreshControls();
  }

  async function readPolicy(companyId) {
    if (disposed || loading || saving) return;
    loading = true;
    retryButton.hidden = true;
    setStatus("Loading Human counting policy…", "info");
    refreshControls();
    try {
      const { data, error } = await supabase.rpc("csvb_human_counting_policy_for_me", {
        p_company_id: companyId ?? null,
      });
      if (error) throw error;
      const result = unwrapResult({ data });
      if (!result || typeof result !== "object") {
        throw new Error("The policy service returned no usable policy.");
      }
      if (companyId != null && result.company_id == null) {
        throw new Error("The policy service did not return the selected company policy.");
      }
      displayPolicy(result);
    } catch (error) {
      policy = null;
      hasSelectedCompany = false;
      companyName.textContent = "Policy unavailable";
      revision.textContent = "Revision —";
      for (const input of radioInputs.values()) {
        input.checked = false;
        input.disabled = true;
      }
      saveButton.disabled = true;
      setStatus(errorMessage(error, "Unable to load the Human counting policy."), "error", true);
    } finally {
      loading = false;
      refreshControls();
    }
  }

  function onCompanyChange() {
    const value = companySelect.value;
    selectedCompanyId = value || null;
    hasSelectedCompany = false;
    policy = null;
    if (!value) {
      companyName.textContent = "Company not selected";
      revision.textContent = "Revision —";
      setStatus("Select a company to load its Human counting policy.", "info");
      refreshControls();
      return;
    }
    void readPolicy(value);
  }

  function onModeChange() {
    if (policy?.can_edit !== true) return;
    draftMode = [...radioInputs.values()].find(input => input.checked)?.value ?? null;
    setStatus(draftMode === policy.human_counting_mode
      ? "This mode is already saved. Choose a different mode to enable Save." : "");
    refreshControls();
  }

  async function onSave() {
    if (
      saving || loading || policy?.can_edit !== true || policy.company_id == null ||
      policy.policy_revision == null
    ) return;
    const selectedMode = [...radioInputs.values()].find((input) => input.checked)?.value;
    if (!MODES.some((mode) => mode.value === selectedMode) || selectedMode === policy.human_counting_mode) return;
    saving = true;
    setStatus("Saving Human counting policy…", "info");
    refreshControls();
    try {
      const { data, error } = await supabase.rpc("csvb_human_counting_policy_save", {
        p_company_id: policy.company_id,
        p_mode: selectedMode,
        p_expected_revision: policy.policy_revision,
      });
      if (error) throw error;
      const saved = unwrapResult({ data });
      if (!saved || typeof saved !== "object" || saved.company_id == null) {
        throw new Error("The policy service did not confirm the saved policy.");
      }
      displayPolicy(saved);
      setStatus("Human counting policy saved. Existing risk snapshots are unchanged; use Refresh Risk to recalculate.", "success");
      if (typeof onSaved === "function") {
        try {
          await onSaved(saved);
        } catch (callbackError) {
          setStatus(`Policy saved, but the refresh callback failed: ${errorMessage(callbackError, "unknown error")}`, "error");
        }
      }
    } catch (error) {
      setStatus(errorMessage(error, "Unable to save the Human counting policy."), "error");
    } finally {
      saving = false;
      refreshControls();
    }
  }

  companySelect.addEventListener("change", onCompanyChange);
  retryButton.addEventListener("click", () => void readPolicy(selectedCompanyId));
  saveButton.addEventListener("click", () => void onSave());
  for (const input of radioInputs.values()) input.addEventListener("change", onModeChange);

  await readPolicy(null);
  const inheritedCompanyId = String(initialCompanyId || "").trim();
  // Only the server-provided list establishes eligible company choices. An
  // own-company response has no list, so stale simulation values are ignored.
  if (inheritedCompanyId && availableCompanies.length) {
    const inherited = availableCompanies.find(company => String(company.id) === inheritedCompanyId);
    if (inherited) await readPolicy(inherited.id);
    else setStatus("The dashboard company is not in the available company list. Select a company below.", "info");
  }

  return {
    element: root,
    destroy() {
      disposed = true;
      companySelect.removeEventListener("change", onCompanyChange);
      retryButton.replaceWith(retryButton.cloneNode(true));
      saveButton.replaceWith(saveButton.cloneNode(true));
      for (const input of radioInputs.values()) input.removeEventListener("change", onModeChange);
      root.remove();
    },
  };
}
