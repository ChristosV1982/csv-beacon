// C.S.V. BEACON - Post-Inspection Stats Dashboard Layout v03
// Display-only helper. Reorganizes existing statistics into dashboard groups with cleaner navigation.
// It does not change stored data, calculations, filters, drilldowns, exports, auth, Supabase, device or offline logic.
(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-DASHBOARD-LAYOUT-V05-FORCE-LEFT-HEADERS-20260630";
  window.CSVB_POST_STATS_DASHBOARD_LAYOUT_BUILD = BUILD;

  const GROUPS = [
    { id: "comparison", title: "Independent Comparison Charts", sub: "Flexible cross-checking between years, quarters, months, observation families and metrics.", open: true, items: [{ type: "id", value: "csvbStatsComparePanelV01" }] },
    { id: "fleet", title: "Fleet / Vessel Performance", sub: "Vessel-level performance, selected-scope averages and vessel observation bars.", open: true, items: [{ type: "tbody", value: "byVesselTbody" }, { type: "tbody", value: "avgFleetTbody" }] },
    { id: "question", title: "Question / Chapter Performance", sub: "Recurring questions and SIRE chapter distribution for the current filtered scope.", open: false, items: [{ type: "tbody", value: "topQnsTbody" }, { type: "id", value: "csvbStatsChapterSharePanelV01" }] },
    { id: "cause", title: "Cause / Category Analysis", sub: "Designation, SOC, NOC and composition visuals for root-cause style analysis.", open: false, items: [{ type: "tbody", value: "byCategoryTbody" }, { type: "tbody", value: "topSocTbody" }, { type: "tbody", value: "topNocTbody" }, { type: "id", value: "csvbStatsCompositionPanelV01" }] },
    { id: "party", title: "Inspection Party Analysis", sub: "OCIMF / inspecting company, inspector and inspector-company statistics with selectable metrics.", open: false, items: [{ type: "tbody", value: "byOcimfTbody" }, { type: "tbody", value: "byInspectorTbody" }, { type: "tbody", value: "byInspectorCompanyTbody" }] },
    { id: "trend", title: "Trend Analysis", sub: "Monthly trend table and related trend visuals for timeline review.", open: false, items: [{ type: "tbody", value: "monthlyTbody" }] },
    { id: "pgno", title: "PGNO Analytics", sub: "Assigned PGNO review. Missing-PGNO visuals remain hidden for now.", open: false, items: [{ type: "tbody", value: "pgnoTableTbody" }] }
  ];

  function injectStyle() {
    if (document.getElementById("csvbStatsDashboardLayoutV03Style")) return;
    const style = document.createElement("style");
    style.id = "csvbStatsDashboardLayoutV03Style";
    style.textContent = `
      #csvbStatsDashboardLayoutV03{margin:12px 0 0;display:flex;flex-direction:column;gap:10px;}
      .csvb-dashboard-toolbar{border:1px solid #d5deef;border-radius:16px;background:linear-gradient(180deg,#fff,#f7fbff);box-shadow:0 4px 18px rgba(18,44,87,.10);padding:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;color:#1a4170;}
      .csvb-dashboard-toolbar-title{font-size:1.02rem;font-weight:950;line-height:1.25;}.csvb-dashboard-toolbar-sub{font-size:.82rem;font-weight:850;color:#48628e;line-height:1.3;margin-top:2px;}.csvb-dashboard-actions{display:flex;gap:8px;flex-wrap:wrap;}
      .csvb-dashboard-btn{border:1px solid #bcd6ee;background:#eef7ff;color:#07345f;border-radius:999px;padding:7px 12px;font-weight:950;cursor:pointer;}.csvb-dashboard-btn:hover{background:#dff0ff;}
      .csvb-dashboard-group{border:1px solid #d5deef;border-radius:16px;background:#fff;box-shadow:0 4px 18px rgba(18,44,87,.10);overflow:hidden;}
      .csvb-dashboard-group-head{width:100%;display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;justify-content:stretch!important;gap:12px;border:0;background:linear-gradient(180deg,#fff,#f4f8ff);color:#06305c;padding:11px 13px;cursor:pointer;text-align:left!important;}
      .csvb-dashboard-group-head>span:first-child{display:block!important;min-width:0!important;width:100%!important;text-align:left!important;justify-self:stretch!important;}
      .csvb-dashboard-group-title{display:block!important;text-align:left!important;font-size:1.08rem;font-weight:950;line-height:1.22;}
      .csvb-dashboard-group-sub{display:block!important;text-align:left!important;font-size:.84rem;font-weight:850;color:#48628e;line-height:1.32;margin-top:3px;}
      .csvb-dashboard-group-icon{font-size:1rem;font-weight:950;background:#eaf5ff;border:1px solid #bfe0f5;border-radius:999px;padding:4px 10px;min-width:36px;text-align:center;justify-self:end!important;}
      .csvb-dashboard-group-body{display:flex;flex-direction:column;gap:10px;padding:10px;}.csvb-dashboard-group-body[hidden]{display:none!important;}
      .csvb-dashboard-group-body>.panel,.csvb-dashboard-group-body>#csvbStatsComparePanelV01,.csvb-dashboard-group-body>#csvbStatsChapterSharePanelV01,.csvb-dashboard-group-body>#csvbStatsCompositionPanelV01{margin:0!important;width:100%!important;}
      .csvb-dashboard-group-body .csvb-stat-section-header{margin-top:0!important;}
      .csvb-dashboard-empty{padding:10px;color:#55708f;font-weight:850;}
      @media(max-width:760px){.csvb-dashboard-toolbar{align-items:flex-start;}.csvb-dashboard-actions{width:100%;}.csvb-dashboard-btn{flex:1 1 auto;}}
    `;
    document.head.appendChild(style);
  }

  function itemNode(item) {
    if (item.type === "id") return document.getElementById(item.value);
    if (item.type === "tbody") return document.getElementById(item.value)?.closest(".panel") || null;
    return null;
  }

  function ensureRoot(firstNode) {
    let root = document.getElementById("csvbStatsDashboardLayoutV03");
    if (root) return root;

    root = document.createElement("div");
    root.id = "csvbStatsDashboardLayoutV03";
    root.innerHTML = `
      <div class="csvb-dashboard-toolbar">
        <div>
          <div class="csvb-dashboard-toolbar-title">Post-Inspection Statistics Dashboard</div>
          <div class="csvb-dashboard-toolbar-sub">Grouped views for management overview, cross-checking, performance review and detailed analysis.</div>
        </div>
        <div class="csvb-dashboard-actions">
          <button class="csvb-dashboard-btn" type="button" data-csvb-open-all="1">Open all</button>
          <button class="csvb-dashboard-btn" type="button" data-csvb-close-all="1">Collapse all</button>
          <button class="csvb-dashboard-btn" type="button" data-csvb-recommended="1">Recommended view</button>
        </div>
      </div>
    `;

    const anchor = firstNode || document.querySelector(".panel") || document.querySelector("main") || document.body.lastElementChild;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(root, anchor);
    else document.body.appendChild(root);

    root.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("button");
      if (!btn) return;
      if (btn.matches("[data-csvb-open-all]")) setAll(true);
      if (btn.matches("[data-csvb-close-all]")) setAll(false);
      if (btn.matches("[data-csvb-recommended]")) setRecommended();
    });

    return root;
  }

  function ensureGroup(root, group) {
    let box = document.getElementById(`csvbDashboardGroup_${group.id}`);
    if (box) return box;
    box = document.createElement("section");
    box.className = "csvb-dashboard-group";
    box.id = `csvbDashboardGroup_${group.id}`;
    box.innerHTML = `
      <button class="csvb-dashboard-group-head" type="button">
        <span><span class="csvb-dashboard-group-title"></span><div class="csvb-dashboard-group-sub"></div></span>
        <span class="csvb-dashboard-group-icon"></span>
      </button>
      <div class="csvb-dashboard-group-body"></div>
    `;
    box.querySelector(".csvb-dashboard-group-title").textContent = group.title;
    box.querySelector(".csvb-dashboard-group-sub").textContent = group.sub;
    const body = box.querySelector(".csvb-dashboard-group-body");
    body.hidden = !group.open;
    box.querySelector(".csvb-dashboard-group-icon").textContent = group.open ? "−" : "+";
    box.querySelector(".csvb-dashboard-group-head").addEventListener("click", () => toggleGroup(box));
    root.appendChild(box);
    forceHeaderAlignment();
    return box;
  }

  function toggleGroup(box, forceOpen = null) {
    const body = box.querySelector(".csvb-dashboard-group-body");
    const icon = box.querySelector(".csvb-dashboard-group-icon");
    if (!body) return;
    const open = forceOpen === null ? body.hidden : !!forceOpen;
    body.hidden = !open;
    if (icon) icon.textContent = open ? "−" : "+";
  }

  function setAll(open) {
    document.querySelectorAll(".csvb-dashboard-group").forEach((box) => toggleGroup(box, open));
  }

  function setRecommended() {
    document.querySelectorAll(".csvb-dashboard-group").forEach((box) => {
      const id = String(box.id || "").replace("csvbDashboardGroup_", "");
      toggleGroup(box, id === "comparison" || id === "fleet");
    });
  }


  function forceHeaderAlignment() {
    document.querySelectorAll(".csvb-dashboard-group-head").forEach((head) => {
      head.style.setProperty("display", "grid", "important");
      head.style.setProperty("grid-template-columns", "minmax(0, 1fr) auto", "important");
      head.style.setProperty("align-items", "center", "important");
      head.style.setProperty("justify-content", "stretch", "important");
      head.style.setProperty("text-align", "left", "important");

      const textWrap = head.querySelector("span:first-child");
      if (textWrap) {
        textWrap.style.setProperty("display", "block", "important");
        textWrap.style.setProperty("width", "100%", "important");
        textWrap.style.setProperty("min-width", "0", "important");
        textWrap.style.setProperty("justify-self", "start", "important");
        textWrap.style.setProperty("text-align", "left", "important");
      }

      const title = head.querySelector(".csvb-dashboard-group-title");
      if (title) {
        title.style.setProperty("display", "block", "important");
        title.style.setProperty("text-align", "left", "important");
        title.style.setProperty("margin-left", "0", "important");
      }

      const sub = head.querySelector(".csvb-dashboard-group-sub");
      if (sub) {
        sub.style.setProperty("display", "block", "important");
        sub.style.setProperty("text-align", "left", "important");
        sub.style.setProperty("margin-left", "0", "important");
      }

      const icon = head.querySelector(".csvb-dashboard-group-icon");
      if (icon) {
        icon.style.setProperty("justify-self", "end", "important");
      }
    });
  }

  function moveItems() {
    const nodes = GROUPS.flatMap((g) => g.items.map(itemNode)).filter(Boolean);
    const root = ensureRoot(nodes[0]);
    let moved = 0;

    GROUPS.forEach((group) => {
      const box = ensureGroup(root, group);
      const body = box.querySelector(".csvb-dashboard-group-body");
      group.items.forEach((item) => {
        const node = itemNode(item);
        if (!node || !body || node === box || body.contains(node)) return;
        body.appendChild(node);
        moved += 1;
      });
      if (body && !body.children.length && !body.querySelector(".csvb-dashboard-empty")) {
        const empty = document.createElement("div");
        empty.className = "csvb-dashboard-empty";
        empty.textContent = "No content available yet for this section.";
        body.appendChild(empty);
      }
    });

    return moved;
  }

  let applying = false;
  function apply() {
    if (applying) return;
    applying = true;
    injectStyle();
    moveItems();
    forceHeaderAlignment();
    applying = false;
  }

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    window.setTimeout(() => { pending = false; apply(); }, 160);
  }

  function start() {
    apply();
    window.setTimeout(apply, 700);
    window.setTimeout(apply, 1800);
    window.addEventListener("csvb:post-stats-snapshot", schedule);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once:true });
  else start();
})();
