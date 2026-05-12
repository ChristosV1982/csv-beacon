/* public/csvb-checkbox-dropdown-filters.js */
/* C.S.V. BEACON – reusable checkbox dropdown filters */

(() => {
  "use strict";

  const BUILD = "CSVB-CHECKBOX-DROPDOWN-FILTERS-20260512-1";

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function closeAllExcept(active) {
    document.querySelectorAll(".csvb-checkdrop.open").forEach((drop) => {
      if (drop !== active) drop.classList.remove("open");
    });
  }

  function selectedOptions(select) {
    return Array.from(select.options || []).filter((o) => o.value && o.selected);
  }

  function dispatchChange(select) {
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function updateButton(select, button) {
    const selected = selectedOptions(select);
    const label = select.getAttribute("data-csvb-checkdrop-label") || "Filter";

    if (!selected.length) {
      button.textContent = `All ${label.toLowerCase()}`;
      button.title = button.textContent;
      return;
    }

    if (selected.length === 1) {
      button.textContent = selected[0].textContent.trim();
      button.title = button.textContent;
      return;
    }

    button.textContent = `${selected.length} ${label.toLowerCase()} selected`;
    button.title = selected.map((o) => o.textContent.trim()).join(", ");
  }

  function renderList(select, list, button, searchInput) {
    const q = String(searchInput?.value || "").trim().toLowerCase();
    const selected = new Set(selectedOptions(select).map((o) => o.value));

    const options = Array.from(select.options || [])
      .filter((option) => option.value)
      .filter((option) => {
        if (!q) return true;
        return option.textContent.toLowerCase().includes(q);
      });

    if (!options.length) {
      list.innerHTML = `<div class="csvb-checkdrop-empty">No matching values.</div>`;
      updateButton(select, button);
      return;
    }

    list.innerHTML = options.map((option) => {
      const checked = selected.has(option.value) ? " checked" : "";
      return `
        <label class="csvb-checkdrop-option">
          <input type="checkbox" value="${esc(option.value)}"${checked} />
          <span>${esc(option.textContent.trim())}</span>
        </label>
      `;
    }).join("");

    list.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const option = Array.from(select.options || []).find((o) => o.value === checkbox.value);
        if (option) option.selected = checkbox.checked;

        updateButton(select, button);
        dispatchChange(select);
      });
    });

    updateButton(select, button);
  }

  function enhanceSelect(select) {
    if (!select || select.getAttribute("data-csvb-checkdrop-enhanced") === "1") return;

    select.setAttribute("data-csvb-checkdrop-enhanced", "1");
    select.classList.add("csvb-checkdrop-source");
    select.style.display = "none";

    const wrapper = document.createElement("div");
    wrapper.className = "csvb-checkdrop";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "csvb-checkdrop-button";

    const panel = document.createElement("div");
    panel.className = "csvb-checkdrop-panel";

    const search = document.createElement("input");
    search.type = "search";
    search.className = "csvb-checkdrop-search";
    search.placeholder = "Search values...";

    const actions = document.createElement("div");
    actions.className = "csvb-checkdrop-actions";
    actions.innerHTML = `
      <button type="button" data-action="all">Select visible</button>
      <button type="button" data-action="none">Clear</button>
    `;

    const list = document.createElement("div");
    list.className = "csvb-checkdrop-list";

    panel.appendChild(search);
    panel.appendChild(actions);
    panel.appendChild(list);
    wrapper.appendChild(button);
    wrapper.appendChild(panel);

    select.insertAdjacentElement("afterend", wrapper);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const isOpen = wrapper.classList.contains("open");
      closeAllExcept(wrapper);
      wrapper.classList.toggle("open", !isOpen);

      if (!isOpen) {
        search.focus();
      }
    });

    panel.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    search.addEventListener("input", () => {
      renderList(select, list, button, search);
    });

    actions.querySelector("[data-action='all']").addEventListener("click", () => {
      const visibleValues = new Set(
        Array.from(list.querySelectorAll("input[type='checkbox']")).map((c) => c.value)
      );

      Array.from(select.options || []).forEach((option) => {
        if (option.value && visibleValues.has(option.value)) option.selected = true;
      });

      renderList(select, list, button, search);
      dispatchChange(select);
    });

    actions.querySelector("[data-action='none']").addEventListener("click", () => {
      Array.from(select.options || []).forEach((option) => {
        option.selected = false;
      });

      renderList(select, list, button, search);
      dispatchChange(select);
    });

    select.addEventListener("change", () => {
      renderList(select, list, button, search);
    });

    const observer = new MutationObserver(() => {
      renderList(select, list, button, search);
    });

    observer.observe(select, {
      childList: true,
      subtree: true
    });

    renderList(select, list, button, search);
  }

  function enhanceAll() {
    document
      .querySelectorAll("select[multiple][data-csvb-checkdrop]")
      .forEach(enhanceSelect);

    window.CSVB_CHECKBOX_DROPDOWN_FILTERS_BUILD = BUILD;
  }

  document.addEventListener("click", () => closeAllExcept(null));

  document.addEventListener("click", (event) => {
    if (event.target?.id === "clearFiltersBtn") {
      setTimeout(() => {
        document
          .querySelectorAll("select[multiple][data-csvb-checkdrop]")
          .forEach((select) => dispatchChange(select));
      }, 80);
    }
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceAll);
  } else {
    enhanceAll();
  }

  setTimeout(enhanceAll, 500);
  setTimeout(enhanceAll, 1500);
})();
