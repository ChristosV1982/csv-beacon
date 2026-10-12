function printFullQuestion(q) {
  let html = `
  <div id="printSingleView" style="font-family:Segoe UI, Arial,sans-serif;max-width:900px;margin-left:0;">
    <h1 style="text-align:left;font-size:1.38em;margin-bottom:8px;margin-left:0;">
      ${q['No.'] ? "Question " + padQuestionNumber(q['No.']) : ""}
    </h1>
    ${q['Short Text'] ? `<div style="text-align:left; font-size:1.18em; color:#1d3463; margin-bottom:5px; margin-left:0;"><b>Subject:</b> ${q['Short Text']}</div>` : ""}
    ${q['Question'] ? `<div style="margin:14px 0 12px 0; max-width:850px; color:#233; font-size:1.07em; text-align:left; border-bottom:1px solid #e0e6ef; padding-bottom:7px; margin-left:0;"><b>Question Text:</b> ${q['Question']}</div>` : ""}
      <table class="meta-info-table" style="width:99%;border-collapse:collapse;margin:16px 0 20px 0;">
        <tr>
          <td class="meta-label">Question Type:</td>
          <td class="meta-value">${q["Question Type"] || ""}</td>
          <td class="meta-label">Question Response Type:</td>
          <td class="meta-value">${getCombinedResponseType(q) || ""}</td>
        </tr>
        <tr>
          <td class="meta-label">Vessel Type:</td>
          <td class="meta-value">${q["Vessel Type"] || ""}</td>
          <td class="meta-label">ROVIQ List:</td>
          <td class="meta-value">${q["ROVIQ List"] || ""}</td>
        </tr>
        <tr>
          <td class="meta-label">Company Rank Allocation:</td>
          <td class="meta-value">${q["SPIS Rank Allocation"] || ""}</td>
          <td class="meta-label">TMSA3 Reference:</td>
          <td class="meta-value">${q["TMSA3 Reference"] || q["TMSA 3 Reference"] || ""}</td>
        </tr>
        <tr>
          <td class="meta-label">TMSA4 Reference:</td>
          <td class="meta-value">${q["TMSA4 Reference"] || q["TMSA 4 Reference"] || ""}</td>
          <td class="meta-label"></td><td></td>
        </tr>
      </table>
  `;

  function addSection(title, content) {
    html += `<div style="margin-top:20px;">
      <div class="print-section-header">${title}</div>
      <div style="background:#fafbff; border-radius:0 0 7px 7px; padding:10px 16px 10px 16px; font-size:1.04em; margin-bottom:6px;">
        ${content || "<span style='color:#aaa;'>-</span>"}
      </div>
    </div>`;
  }

  // --- Inspection Guidance with support for images ---
  let igContent = nl2br(Array.isArray(q["Inspection Guidance"]) ? q["Inspection Guidance"].join('\n') : q["Inspection Guidance"]);
  let igImagesHtml = "";
  if (Array.isArray(q.InspectionGuidanceImages)) {
    igImagesHtml = q.InspectionGuidanceImages.map(img =>
      `<div style="margin:10px 0;">
        <img src="${img}" alt="Inspection Photo" style="width:100%;max-width:1000px;height:auto;margin:10px 0; border-radius:10px; box-shadow:0 2px 8px #2222; border:1.5px solid #a6caef;">
      </div>`
    ).join('');
  }
  addSection("Inspection Guidance", igImagesHtml + igContent);

  // --- Suggested Inspector Actions
  addSection("Suggested Inspector Actions", nl2br(Array.isArray(q["Suggested Inspector Actions"]) ? q["Suggested Inspector Actions"].join('\n') : q["Suggested Inspector Actions"]));

  // --- Expected Evidence (bullets)
  if (Array.isArray(q.ExpEv_Bullets) && q.ExpEv_Bullets.length) {
    let bullets = q.ExpEv_Bullets.map(ev => {
      return `<li style="margin-bottom:7px;">
        ${ev.text || ""}
        <br><b>eSMS Form:</b> ${ev.form || "-"}<br>
        <b>eSMS Ch. Ref:</b> ${ev.ch || "-"}<br>
        <b>Remarks:</b> ${ev.remarks || "-"}
      </li>`;
    }).join('');
    addSection("Expected Evidence", `<ul style="margin:7px 0 10px 25px;">${bullets}</ul>`);
  } else {
    addSection("Expected Evidence", q["Expected Evidence"]);
  }

  // --- PGNOs as form style (more compact)
  let pgnoBullets = [];
  if (Array.isArray(q.NegObs_Bullets)) {
    pgnoBullets = q.NegObs_Bullets;
  } else if (q["Potential Grounds for Negative Observations"]) {
    pgnoBullets = q["Potential Grounds for Negative Observations"]
      .split(/\n?•/g)
      .map(s => s.trim())
      .filter(Boolean);
  }
  if (pgnoBullets.length > 0) {
    let answersArr = (typeof questionAnswers !== "undefined" && questionAnswers[getQNo(q)]) ? questionAnswers[getQNo(q)] : [];
    let pgnoHTML = "";
    pgnoBullets.forEach((b, idx) => {
      let a = (answersArr[idx]) || {};
      pgnoHTML += `
        <div style="margin:7px 0 8px 0; padding:5px 6px 6px 6px; background:#f9fbfe; border-left:2px solid #c3dafe; border-radius:5px;">
          <div style="font-size:1em; margin-bottom:3px;">
            <b>${fullPGNO(q['No.'], idx)}</b> ${b}
          </div>
          <div style="font-size:0.97em; margin-bottom:2px;">
            <b>Answer:</b> ${a.answer || ""} &nbsp; <b>Comment:</b> ${a.comment || ""}
          </div>
          <div style="display:flex; gap:7px;">
            <div style="flex:1;">
              <div style="font-weight:bold; margin-bottom:1px;">Remarks 1:</div>
              <div style="border:1px solid #c7d3e8; border-radius:3px; min-height:22px; padding:4px 6px; background:#fff;">${(a.remarks && a.remarks[0]) ? a.remarks[0] : ""}</div>
            </div>
            <div style="flex:1;">
              <div style="font-weight:bold; margin-bottom:1px;">Remarks 2:</div>
              <div style="border:1px solid #c7d3e8; border-radius:3px; min-height:22px; padding:4px 6px; background:#fff;">${(a.remarks && a.remarks[1]) ? a.remarks[1] : ""}</div>
            </div>
          </div>
        </div>
      `;
    });
    addSection("Potential Grounds for Negative Observations", pgnoHTML);
  } else {
    addSection("Potential Grounds for Negative Observations", q["Potential Grounds for Negative Observations"]);
  }

  html += `</div>`;

  let win = window.open('', '', 'width=900,height=1100');
  win.document.write('<html><head><title>Print Question</title>');
  win.document.write(`
    <style>
      body { 
        font-family: Segoe UI, Arial, sans-serif; 
        background:#fff; 
        font-size:0.90em; 
      }
      #printSingleView { margin: 0 auto; }
      h1 { font-size:1.09em; margin-bottom:4px; }
      .meta-info-table { width: 99%; border-collapse: collapse; margin-bottom: 14px; font-size:0.97em;}
      .meta-info-table td, .meta-info-table th {
        border: 1px solid #c7d3e8;
        padding: 7px 9px;
        font-size: 0.97em;
      }
      .meta-info-table td.meta-label {
        font-weight: bold;
        color: #1a3261;
        background: #eaf1fb;
        width: 19%;
        white-space: nowrap;
      }
      .meta-info-table td.meta-value {
        color: #23292f;
        background: #f7fbff;
        font-size: 1em;
        min-width: 80px;
      }
      .print-section-header {
        font-size: 1.01em;
        font-weight: bold;
        margin-top: 18px;
        margin-bottom: 8px;
        color: #143169;
        border-bottom: 1.1px solid #d4e1f9;
        padding-bottom: 3px;
        break-after: avoid-page;
        page-break-after: avoid;
      }
      ul { margin: 9px 0 8px 24px; }
      li { margin-bottom: 4px; }
      .pgno-block {
        margin:6px 0 8px 0; 
        padding:5px 7px 7px 7px; 
        background:#f9fbfe; 
        border-left:2px solid #c3dafe; 
        border-radius:5px;
        font-size:0.94em;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      @media print {
        html, body { background: #fff !important; }
        #printSingleView { box-shadow:none; }
        div, .pgno-block { page-break-inside: avoid; break-inside: avoid; }
        h1 { font-size:1em; }
        @page { size: A4 portrait; margin: 5mm; }
        .print-section-header {
          page-break-after: avoid;
          break-after: avoid-page;
          color: #000;
          margin-top: 14px;
          margin-bottom: 7px;
          font-size: 1.01em;
          background: #f6f6fd;
        }
        .meta-info-table td, .meta-info-table th {
          border: 1px solid #c7d3e8;
        }
      }
    </style>
  `);
  win.document.write('</head><body>');
  win.document.write(html);
  win.document.write('</body></html>');
  win.document.close();
  setTimeout(() => { win.print(); win.close(); }, 350);
}

function renderPrintQuestionHTML(q) {
  let html = `
    <h1 style="text-align:left;font-size:1.11em;margin-bottom:6px;">
      ${q['No.'] ? "Question " + padQuestionNumber(q['No.']) : ""}
    </h1>
    ${q['Short Text'] ? `<div style="text-align:left; font-size:1.08em; color:#1d3463; margin-bottom:4px;"><b>Subject:</b> ${q['Short Text']}</div>` : ""}
    ${q['Question'] ? `<div style="margin:10px 0 9px 0; max-width:850px; color:#233; font-size:1.01em; text-align:left; border-bottom:1px solid #e0e6ef; padding-bottom:5px;"><b>Question Text:</b> ${q['Question']}</div>` : ""}
    <table class="meta-info-table" style="width:99%;border-collapse:collapse;margin:13px auto 15px auto;">
      <tr>
        <td class="meta-label">Question Type:</td>
        <td class="meta-value">${q["Question Type"] || ""}</td>
        <td class="meta-label">Question Response Type:</td>
        <td class="meta-value">${getCombinedResponseType(q) || ""}</td>
      </tr>
      <tr>
        <td class="meta-label">Vessel Type:</td>
        <td class="meta-value">${q["Vessel Type"] || ""}</td>
        <td class="meta-label">ROVIQ List:</td>
        <td class="meta-value">${q["ROVIQ List"] || ""}</td>
      </tr>
      <tr>
        <td class="meta-label">Company Rank Allocation:</td>
        <td class="meta-value">${q["SPIS Rank Allocation"] || ""}</td>
        <td class="meta-label">TMSA3 Reference:</td>
        <td class="meta-value">${q["TMSA3 Reference"] || q["TMSA 3 Reference"] || ""}</td>
      </tr>
      <tr>
        <td class="meta-label">TMSA4 Reference:</td>
        <td class="meta-value">${q["TMSA4 Reference"] || q["TMSA 4 Reference"] || ""}</td>
        <td class="meta-label"></td><td></td>
      </tr>
    </table>
  `;

  // Helper for line breaks:
  const safeNl2br = (str) => {
    if (typeof str !== 'string') {
      if (str == null) return '';
      if (Array.isArray(str)) return str.join('<br>');
      str = String(str);
    }
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/\n/g, "<br>");
  };

  // INSPECTION GUIDANCE SECTION (with images)
  html += `<div style="margin-top:14px;">`;
  html += `<div class="print-section-header">Inspection Guidance</div>`;
  if (Array.isArray(q.InspectionGuidanceImages)) {
    q.InspectionGuidanceImages.forEach(img => {
      html += `<div style="margin:12px 0;">
        <img src="${img}" alt="Inspection Photo" style="width:100%;max-width:1000px;height:auto;margin:10px 0; border-radius:10px; box-shadow:0 2px 8px #2222; border:1.5px solid #a6caef;">
      </div>`;
    });
  }
  html += `<div style="background:#fafbff; border-radius:0 0 7px 7px; padding:10px 14px 10px 14px; font-size:0.98em; margin-bottom:3px;">
      ${safeNl2br(q["Inspection Guidance"]) || "<span style='color:#aaa;'>-</span>"}
    </div>
  </div>`;

  // SUGGESTED INSPECTOR ACTIONS SECTION
  html += `<div style="margin-top:14px;">
    <div class="print-section-header">Suggested Inspector Actions</div>
    <div style="background:#fafbff; border-radius:0 0 7px 7px; padding:10px 14px 10px 14px; font-size:0.98em; margin-bottom:3px;">
      ${safeNl2br(q["Suggested Inspector Actions"]) || "<span style='color:#aaa;'>-</span>"}
    </div>
  </div>`;

  // EXPECTED EVIDENCE
  if (Array.isArray(q.ExpEv_Bullets) && q.ExpEv_Bullets.length) {
    let bullets = q.ExpEv_Bullets.map(ev => {
      return `<li style="margin-bottom:5px;">
        ${ev.text || ""}
        <br><b>eSMS Form:</b> ${ev.form || "-"}<br>
        <b>eSMS Ch. Ref:</b> ${ev.ch || "-"}<br>
        <b>Remarks:</b> ${ev.remarks || "-"}
      </li>`;
    }).join('');
    html += `<div style="margin-top:14px;">
      <div class="print-section-header">Expected Evidence</div>
      <div style="background:#fafbff; border-radius:0 0 7px 7px; padding:10px 14px 10px 14px; font-size:0.98em; margin-bottom:3px;">
        <ul style="margin:7px 0 7px 24px;">${bullets}</ul>
      </div>
    </div>`;
  } else {
    html += `<div style="margin-top:14px;">
      <div class="print-section-header">Expected Evidence</div>
      <div style="background:#fafbff; border-radius:0 0 7px 7px; padding:10px 14px 10px 14px; font-size:0.98em; margin-bottom:3px;">
        ${safeNl2br(q["Expected Evidence"]) || "<span style='color:#aaa;'>-</span>"}
      </div>
    </div>`;
  }

  // PGNOs
  let pgnoBullets = [];
  if (Array.isArray(q.NegObs_Bullets)) {
    pgnoBullets = q.NegObs_Bullets;
  } else if (q["Potential Grounds for Negative Observations"]) {
    pgnoBullets = q["Potential Grounds for Negative Observations"]
      .split(/\n?•/g)
      .map(s => s.trim())
      .filter(Boolean);
  }
  if (pgnoBullets.length > 0) {
    let answersArr = (typeof questionAnswers !== "undefined" && questionAnswers[getQNo(q)]) ? questionAnswers[getQNo(q)] : [];
    let pgnoHTML = "";
    pgnoBullets.forEach((b, idx) => {
      let a = (answersArr[idx]) || {};
      pgnoHTML += `
        <div style="margin:10px 0 10px 0; padding:6px 8px 8px 8px; background:#f9fbfe; border-left:2px solid #c3dafe; border-radius:6px;">
          <div style="font-size:1em; margin-bottom:4px;">
            <b>${fullPGNO(q['No.'], idx)}</b> ${b}
          </div>
          <div style="font-size:0.98em; margin-bottom:4px;">
            <b>Answer:</b> ${a.answer || ""} &nbsp;&nbsp; <b>Comment:</b> ${a.comment || ""}
          </div>
          <div style="display:flex; gap:10px;">
            <div style="flex:1;">
              <div style="font-weight:bold; margin-bottom:2px;">Remarks 1:</div>
              <div style="border:1px solid #c7d3e8; border-radius:4px; min-height:22px; padding:4px 6px; background:#fff;">${(a.remarks && a.remarks[0]) ? a.remarks[0] : ""}</div>
            </div>
            <div style="flex:1;">
              <div style="font-weight:bold; margin-bottom:2px;">Remarks 2:</div>
              <div style="border:1px solid #c7d3e8; border-radius:4px; min-height:22px; padding:4px 6px; background:#fff;">${(a.remarks && a.remarks[1]) ? a.remarks[1] : ""}</div>
            </div>
          </div>
        </div>
      `;
    });
    html += `<div style="margin-top:14px;">
      <div class="print-section-header">Potential Grounds for Negative Observations</div>
      <div style="background:#fafbff; border-radius:0 0 7px 7px; padding:10px 14px 10px 14px; font-size:0.98em; margin-bottom:3px;">
        ${pgnoHTML}
      </div>
    </div>`;
  } else {
    html += `<div style="margin-top:14px;">
      <div class="print-section-header">Potential Grounds for Negative Observations</div>
      <div style="background:#fafbff; border-radius:0 0 7px 7px; padding:10px 14px 10px 14px; font-size:0.98em; margin-bottom:3px;">
        ${safeNl2br(q["Potential Grounds for Negative Observations"]) || "<span style='color:#aaa;'>-</span>"}
      </div>
    </div>`;
  }

  return html;
}
