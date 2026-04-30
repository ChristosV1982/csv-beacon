// MC-10D5R2
// Safe Post-Inspection Stats repair.
// Only controls #vesselDrop open/close. Does not hide any parent containers.

(() => {
  "use strict";

  const BUILD = "MC10D5R2-2026-04-30";

  function mark() {
    window.CSVB_POST_STATS_SAFE_REPAIR_BUILD = BUILD;
    document.documentElement.setAttribute("data-csvb-poststats-safe-repair", BUILD);
  }

  function closeVesselDrop() {
    const drop = document.getElementById("vesselDrop");
    if (drop) drop.classList.remove("open");
  }

  function wireVesselDropClose() {
    const drop = document.getElementById("vesselDrop");
    if (!drop || drop.dataset.csvbSafeCloseBound === "1") return;

    drop.dataset.csvbSafeCloseBound = "1";

    // ensure closed after the module has rendered the checkbox list
    closeVesselDrop();

    document.addEventListener("click", (event) => {
      const d = document.getElementById("vesselDrop");
      if (!d) return;

      if (!d.contains(event.target)) {
        d.classList.remove("open");
      }
    }, true);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeVesselDrop();
    });
  }

  function run() {
    mark();
    wireVesselDropClose();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  setTimeout(run, 600);
  setTimeout(closeVesselDrop, 900);
})();
