// public/csvb-sire-editor-facet-clear-shim.js
// C.S.V. BEACON — SIRE Questions Editor legacy facet-clear shim
// Purpose: q-questions-editor.js still binds legacy facetClear_* ids.
// The current UI uses Select All/no selection instead. These hidden buttons
// avoid harmless "HTML out of sync" console warnings without changing UI.

(() => {
  "use strict";

  const BUILD = "SIRE-EDITOR-FACET-CLEAR-SHIM-20260520_1";
  window.CSVB_SIRE_EDITOR_FACET_CLEAR_SHIM_BUILD = BUILD;

  const IDS = [
    "facetClear_questionType",
    "facetClear_vesselType",
    "facetClear_responseType",
    "facetClear_companyRank",
    "facetClear_chapter"
  ];

  function ensure() {
    let host = document.getElementById("csvbSireEditorFacetClearShimHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "csvbSireEditorFacetClearShimHost";
      host.style.display = "none";
      host.setAttribute("aria-hidden", "true");
      document.body.appendChild(host);
    }

    IDS.forEach((id) => {
      if (document.getElementById(id)) return;
      const btn = document.createElement("button");
      btn.id = id;
      btn.type = "button";
      btn.tabIndex = -1;
      btn.textContent = id;
      host.appendChild(btn);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensure, { once: true });
  } else {
    ensure();
  }
})();
