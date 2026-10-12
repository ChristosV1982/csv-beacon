// public/inspection-question-sets-standards-v01.js
// C.S.V. BEACON — Inspection & Assurance Question Sets standards/mobile polish v01.
// Display-only page polish. No database writes, no auth changes, no calculation changes.
(() => {
  "use strict";

  const BUILD = "INSPECTION-QUESTION-SETS-STANDARDS-V01-20260601";
  window.CSVB_INSPECTION_QS_STANDARDS_BUILD = BUILD;

  function ensureMeta(name, content) {
    if (document.querySelector(`meta[name="${name}"]`)) return;
    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = content;
    document.head.appendChild(meta);
  }

  function ensureLink(rel, href) {
    if (document.querySelector(`link[rel="${rel}"]`)) return;
    const link = document.createElement("link");
    link.rel = rel;
    link.href = href;
    document.head.appendChild(link);
  }

  function injectMobileReady() {
    ensureMeta("theme-color", "#062b55");
    ensureMeta("apple-mobile-web-app-capable", "yes");
    ensureMeta("apple-mobile-web-app-status-bar-style", "black-translucent");
    ensureMeta("apple-mobile-web-app-title", "C.S.V. BEACON");
    ensureMeta("mobile-web-app-capable", "yes");
    ensureLink("apple-touch-icon", "./assets/csv-beacon-icon.png");
    ensureLink("manifest", "./manifest.json");
  }

  function injectStyle() {
    if (document.getElementById("csvbInspectionQsStandardsV01Style")) return;
    const style = document.createElement("style");
    style.id = "csvbInspectionQsStandardsV01Style";
    style.textContent = `
      body{
        padding:10px!important;
        background:#eef4fb!important;
        color:#06305c!important;
        -webkit-text-size-adjust:100%;
        touch-action:manipulation;
      }
      .wrap{
        width:min(1920px, calc(100vw - 20px))!important;
        max-width:none!important;
        margin:0 auto!important;
      }
      .topbar{
        min-height:58px!important;
        padding:8px 12px!important;
        border-radius:14px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:space-between!important;
      }
      .csvb-assurance-brand{
        display:flex;
        align-items:center;
        gap:10px;
        min-width:0;
      }
      .csvb-assurance-logo{
        width:42px;
        height:42px;
        object-fit:contain;
        flex:0 0 auto;
      }
      .csvb-assurance-title-block{min-width:0;}
      .title{
        font-size:1.08rem!important;
        font-weight:850!important;
        line-height:1.18!important;
        letter-spacing:.01em!important;
      }
      .sub{
        font-size:.83rem!important;
        font-weight:650!important;
        line-height:1.25!important;
      }
      .top-actions{gap:6px!important;}
      .build{font-size:.74rem!important;font-weight:750!important;padding:3px 8px!important;}
      .btn{
        min-height:38px!important;
        padding:7px 11px!important;
        border-radius:9px!important;
        font-weight:800!important;
        font-size:.9rem!important;
      }
      .grid{
        grid-template-columns:minmax(330px,390px) minmax(0,1fr)!important;
        gap:10px!important;
        margin-top:10px!important;
      }
      .card{
        padding:10px!important;
        border-radius:14px!important;
        box-shadow:0 3px 14px rgba(18,44,87,.10)!important;
      }
      .card h2{
        font-size:1rem!important;
        font-weight:850!important;
        margin-bottom:6px!important;
      }
      .note{
        padding:8px!important;
        margin:6px 0!important;
        font-size:.88rem!important;
        font-weight:650!important;
        line-height:1.28!important;
      }
      label{
        margin:8px 0 4px!important;
        font-size:.86rem!important;
        font-weight:800!important;
      }
      input,select,textarea{
        min-height:38px!important;
        padding:7px 9px!important;
        border-radius:9px!important;
        font-size:.93rem!important;
      }
      textarea{min-height:68px!important;}
      .row{gap:8px!important;}
      .actions{gap:6px!important;margin-top:8px!important;}
      .toolbar{gap:8px!important;margin-bottom:8px!important;}
      .toolbar .left,.toolbar .right{gap:6px!important;}
      .tableWrap{border-radius:10px!important;max-width:100%!important;}
      table{min-width:980px!important;}
      th,td{padding:7px 8px!important;}
      th{font-weight:850!important;}
      td{font-weight:650!important;}
      .small{font-weight:650!important;font-size:.82rem!important;}
      .pill{font-weight:800!important;font-size:.74rem!important;padding:2px 8px!important;}
      @media(max-width:900px){
        body{padding:6px!important;}
        .wrap{width:calc(100vw - 12px)!important;}
        .topbar{align-items:flex-start!important;}
        .top-actions{width:100%!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;}
        .top-actions .build{grid-column:1/-1;justify-self:start;}
        .grid{grid-template-columns:1fr!important;}
        .card{padding:9px!important;}
        .toolbar{align-items:flex-start!important;}
        .toolbar .right{width:100%!important;display:grid!important;grid-template-columns:1fr auto!important;}
        #searchInput{min-width:0!important;width:100%!important;}
      }
      @media(max-width:520px){
        .top-actions{grid-template-columns:1fr!important;}
        .row{grid-template-columns:1fr!important;}
        .toolbar .right{grid-template-columns:1fr!important;}
        .btn{width:100%!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function injectBrandLogo() {
    const topbar = document.querySelector(".topbar");
    const title = document.querySelector(".topbar .title");
    if (!topbar || !title || document.querySelector(".csvb-assurance-brand")) return;

    const titleParent = title.parentElement;
    if (!titleParent) return;

    const brand = document.createElement("div");
    brand.className = "csvb-assurance-brand";
    brand.innerHTML = `
      <img class="csvb-assurance-logo" src="./assets/csv-beacon-icon.png" alt="C.S.V. BEACON logo" />
      <div class="csvb-assurance-title-block"></div>
    `;
    const block = brand.querySelector(".csvb-assurance-title-block");
    while (titleParent.firstChild) block.appendChild(titleParent.firstChild);
    titleParent.appendChild(brand);
  }

  function start() {
    injectMobileReady();
    injectStyle();
    injectBrandLogo();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
