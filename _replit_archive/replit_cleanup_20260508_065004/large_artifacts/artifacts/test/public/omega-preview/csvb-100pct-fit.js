// public/csvb-100pct-fit.js
// C.S.V. BEACON — MC-10C 100% Browser Zoom Fit
// Visual-only.

(() => {
  "use strict";

  const BUILD = "MC10C-2026-04-30";

  function pageName() {
    const p = String(window.location.pathname || "");
    return p.split("/").pop() || "index.html";
  }

  function markPage() {
    window.CSVB_100PCT_FIT_BUILD = BUILD;
    document.documentElement.setAttribute("data-csvb-fit-build", BUILD);
    document.documentElement.setAttribute("data-csvb-page", pageName());
  }

  function wrapWideTables() {
    document.querySelectorAll("table").forEach((table) => {
      if (table.closest(".csvb-table-fit-wrap")) return;

      const wrapper = document.createElement("div");
      wrapper.className = "csvb-table-fit-wrap";
      wrapper.style.maxWidth = "100%";
      wrapper.style.overflowX = "auto";

      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  function removeInlineMinWidths() {
    document.querySelectorAll("[style]").forEach((el) => {
      const st = el.getAttribute("style") || "";

      if (/min-width\s*:\s*[0-9]{3,}/i.test(st)) {
        el.style.minWidth = "0";
      }

      if (/width\s*:\s*[0-9]{4,}/i.test(st)) {
        el.style.maxWidth = "100%";
      }
    });
  }

  function fit() {
    markPage();
    wrapWideTables();
    removeInlineMinWidths();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fit);
  } else {
    fit();
  }

  setTimeout(fit, 700);
  setTimeout(fit, 1800);
  setTimeout(fit, 3500);
})();
