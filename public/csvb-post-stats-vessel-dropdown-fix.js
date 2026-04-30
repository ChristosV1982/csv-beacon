// MC-10D5-S2A
// Exact vessel dropdown close behavior only.
// No stats logic. No chart logic. No broad DOM detection.

(() => {
  "use strict";

  const BUILD = "MC10D5-S2A-2026-04-30";

  function mark() {
    window.CSVB_POST_STATS_VESSEL_DROPDOWN_FIX_BUILD = BUILD;
    document.documentElement.setAttribute("data-csvb-page", "post_inspection_stats.html");
  }

  function closeVesselDrop() {
    const drop = document.getElementById("vesselDrop");
    if (drop) drop.classList.remove("open");
  }

  function wire() {
    mark();

    const drop = document.getElementById("vesselDrop");
    const btn = document.getElementById("vesselDropBtn");

    if (!drop || !btn || drop.dataset.csvbExactVesselFix === "1") return;

    drop.dataset.csvbExactVesselFix = "1";

    // Force closed after the original page script finishes rendering.
    closeVesselDrop();
    setTimeout(closeVesselDrop, 300);
    setTimeout(closeVesselDrop, 900);

    // Keep original button logic, but ensure outside click closes it.
    document.addEventListener("click", (event) => {
      const freshDrop = document.getElementById("vesselDrop");
      if (!freshDrop) return;

      if (!freshDrop.contains(event.target)) {
        freshDrop.classList.remove("open");
      }
    }, true);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeVesselDrop();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
