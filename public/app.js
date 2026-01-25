// app.js

// --- GLOBALS ---

let questionsData = [];
let filteredQuestions = [];
let selectedIdx = -1;
let filters = {};
let allColumns = [];
let filterColumns = ["Question Response Type"];
let responseTypeChecks = { hardware: true, human: true, process: true, photo: true };
let vesselTypeChecks = { chemical: true, lng: true, lpg: true, oil: true };
let questionTypeChecks = {};
let adminMode = false;
let questionAnswers = {};
let spisRankChecks = {};
let chapterFilter = {};

// --- CHAPTER NAMES (GLOBAL) ---
const chapterNames = {
  "2": "Certification and Documentation",
  "3": "Crew Management",
  "4": "Navigation and Communications",
  "5": "Safety Management",
  "6": "Pollution Prevention",
  "7": "Maritime Security",
  "8": "Cargo and Ballast Systems",
  "9": "Mooring and Anchoring",
  "10": "Machinery Spaces",
  "11": "General Appearance and Condition - Photograph Comparison",
  "12": "Ice Operations"
};

// --- USER MANAGEMENT ---
let users = [
  { username: "CSV", password: "sireadmin2025", role: "user" },
  { username: "CSV", password: "adminsire2025", role: "superuser" },
  { username: "PEA", password: "PEASire2025", role: "Manager Review" },
  { username: "Superintendent", password: "Hello2025!!!", role: "Admin / Editor" }
];
let loggedIn = false;
let currentUserRole = "user";
let currentUsername = "";


// --- MODE SELECTOR ---
let currentMode = "study";

function confirmMode() {
  const sel = document.getElementById('modeSelect');
  if (!sel.value) {
    sel.style.border = '2px solid red';
    sel.focus();
    return;
  }
  currentMode = sel.value;
  document.getElementById('modeSelectorScreen').style.display = 'none';

  if (currentMode === "study") {
    loggedIn = true;
    currentUserRole = userObj.role || "user";
    currentUsername = userObj.username || "";

    document.getElementById('adminBarControls').style.display = 'none';
    document.getElementById('loginPanel').style.display = 'none';
    document.getElementById('userManagementPanel').style.display = 'none';
  } else {
    loggedIn = false;
    document.getElementById('loginPanel').style.display = 'flex';
    document.getElementById('userManagementPanel').style.display = 'none';
  }
}

// --- Collapsible state for details panel ---
if (typeof window.collapsibleState === 'undefined') window.collapsibleState = {};

// --- Search navigation globals ---
let searchMatches = [];
let currentMatchIdx = -1;

function nl2br(str) {
  if (typeof str !== 'string') {
    if (str == null) return '';
    if (Array.isArray(str)) return str.join('<br>');
    str = String(str);
  }
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br>");
}

// --- UTILITY FUNCTIONS ---

function getQNo(q) { return q['No.'] || q['No']; }

function padQuestionNumber(qn) {
  if (!qn) return "";
  let parts = qn.toString().split('.');
  while (parts.length < 3) { parts.push('0'); }
  parts = parts.slice(0,3).map(x => x.padStart(2, '0'));
  return parts.join('.');
}

function getCombinedResponseType(q) {
  let types = [];
  if (q["Hardware Response Type"] && !["false", "none", ""].includes(String(q["Hardware Response Type"]).trim().toLowerCase())) types.push("Hardware");
  if (q["Human Response Type"] && !["false", "none", ""].includes(String(q["Human Response Type"]).trim().toLowerCase())) types.push("Human");
  if (q["Process Response Type"] && !["false", "none", ""].includes(String(q["Process Response Type"]).trim().toLowerCase())) types.push("Process");
  return types.length ? types.join(", ") : "";
}

function getVesselTypes(q) { return (q["Vessel Type"] || "").split(",").map(v => v.trim()).filter(v => v); }

function fullPGNO(qNo, idx) {
  if (!qNo) return "";
  let parts = qNo.toString().split('.');
  while (parts.length < 3) { parts.push('0'); }
  parts = parts.slice(0,3).map(x => x.padStart(2, '0'));
  return parts.join('.') + '.' + String(idx+1).padStart(2,'0');
}

function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }



function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Highlight on a *safe* (HTML-escaped) string to avoid breaking the DOM if edited text contains '<', '&', etc.
function highlightTextSafe(str, term) {
  const safe = escapeHtml(str);
  return highlightText(safe, term);
}
function highlightText(str, term) {
  if (!term || !str) return str || "";
  try {
    return str.replace(
      new RegExp("(" + escapeRegExp(term) + ")", "gi"),
      '<mark class="attr-search">$1</mark>'
    );
  } catch {
    return str;
  }
}

// Render multiline text (supports paragraphs and line breaks) while preserving safe highlighting.
function renderMultilineHighlighted(str, term) {
  const raw = (str === null || str === undefined) ? "" : String(str);

  // Split paragraphs on blank lines (two or more newlines).
  const paragraphs = raw.split(/\n{2,}/);

  return paragraphs.map(p => {
    const highlighted = highlightTextSafe(p, term);
    // Within a paragraph, keep single newlines as explicit line breaks.
    return `<p class="pgno-paragraph" style="margin:6px 0; white-space: pre-wrap;">${highlighted}</p>`;
  }).join("");
}


// --- FILTER SETUP ---

function setupFilters() {
  let search = document.getElementById('mainSearchInput');
  let prevBtn = document.getElementById('prevResultBtn');
  let nextBtn = document.getElementById('nextResultBtn');
  search.oninput = e => { filters['search'] = e.target.value; applyFilters(); };
  prevBtn.onclick = goToPrevResult;
  nextBtn.onclick = goToNextResult;
}


// --- ROLE-BASED EDIT PERMISSIONS ---
function canEditPgnoRemarks() {
  // Admin edit mode can always edit.
  if (typeof adminMode !== "undefined" && adminMode) return true;
  // Require login for operational remark edits.
  if (typeof loggedIn === "undefined" || !loggedIn) return false;
  // Keep Study mode read-only.
  if (typeof currentMode !== "undefined" && currentMode === "study") return false;
  const allowedRoles = ["superuser", "Admin / Editor", "Manager Review"];
  return allowedRoles.includes(typeof currentUserRole !== "undefined" ? currentUserRole : "user");
}

function setupVesselCheckboxFilters() {
  document.getElementById('chemicalCheck').onchange = function() { vesselTypeChecks.chemical = this.checked; applyFilters(); };
  document.getElementById('lngCheck').onchange = function() { vesselTypeChecks.lng = this.checked; applyFilters(); };
  document.getElementById('lpgCheck').onchange = function() { vesselTypeChecks.lpg = this.checked; applyFilters(); };
  document.getElementById('oilCheck').onchange = function() { vesselTypeChecks.oil = this.checked; applyFilters(); };
}

function setupQTypeCheckboxFilters() {
  const qtypeDiv = document.getElementById('qtypeChecks');
  qtypeDiv.innerHTML = '';
  let qtypes = Array.from(new Set(questionsData.map(q => q["Question Type"]).filter(v => v && v !== "")));
  qtypes.forEach(type => { questionTypeChecks[type] = true; });
  if (!qtypes.length) return;
  const label = document.createElement('label');
  label.textContent = "Question Type:";
  qtypeDiv.appendChild(label);
  qtypes.forEach(type => {
    const id = "qtype_" + type.replace(/\W/g, "_");
    const cb = document.createElement('input');
    cb.type = "checkbox";
    cb.id = id;
    cb.checked = true;
    cb.onchange = function() { questionTypeChecks[type] = this.checked; applyFilters(); };
    qtypeDiv.appendChild(cb);
    const cbLabel = document.createElement('label');
    cbLabel.setAttribute('for', id);
    cbLabel.textContent = type;
    qtypeDiv.appendChild(cbLabel);
  });
}

function setupSPISCheckboxFilters() {
  const spisDiv = document.getElementById('spisChecks');
  spisDiv.innerHTML = '';
  let spisRanks = Array.from(new Set(questionsData.map(q => q["Company Rank Allocation"]).filter(v => v && v !== "")));
  let flatRanks = [];
  spisRanks.forEach(val => {
    val.split(/[,;]/).map(s => s.trim()).forEach(rank => { if (rank && !flatRanks.includes(rank)) flatRanks.push(rank); });
  });
  spisRankChecks = spisRankChecks || {};
  flatRanks.forEach(rank => { if (!(rank in spisRankChecks)) spisRankChecks[rank] = true; });
  if (!flatRanks.length) return;
  const label = document.createElement('label');
  label.textContent = "Company Rank Allocation:";
  spisDiv.appendChild(label);
  flatRanks.forEach(rank => {
    const id = "spisRank_" + rank.replace(/\W/g, "_");
    const cb = document.createElement('input');
    cb.type = "checkbox";
    cb.id = id;
    cb.checked = spisRankChecks[rank];
    cb.onchange = function() { spisRankChecks[rank] = this.checked; applyFilters(); };
    spisDiv.appendChild(cb);
    const cbLabel = document.createElement('label');
    cbLabel.setAttribute('for', id);
    cbLabel.textContent = rank;
    spisDiv.appendChild(cbLabel);
  });
}

// --- CHAPTER FILTER SETUP ---
function setupChapterCheckboxFilters() {
  const div = document.getElementById('chapterChecks');
  div.innerHTML = '';
  div.innerHTML += `<label style="color:#fff;display:block;">
    <input type="checkbox" id="allChaptersCheck" checked>All Chapters</label>`;
  Object.keys(chapterNames).forEach(chap => {
    const id = "chapterCheck_" + chap;
    div.innerHTML += `<label style="color:#fff;display:block;">
      <input type="checkbox" id="${id}" checked>
      <b>${chap}</b> <span style="font-weight:500;">${chapterNames[chap]}</span>
    </label>`;
    chapterFilter[chap] = true;
  });
  // Add event listeners after HTML is set
  Object.keys(chapterNames).forEach(chap => {
    document.getElementById("chapterCheck_" + chap).onchange = function() {
      chapterFilter[chap] = this.checked;
      if (!this.checked) document.getElementById('allChaptersCheck').checked = false;
      applyFilters();
    };
  });
  document.getElementById('allChaptersCheck').onchange = function() {
    const check = this.checked;
    Object.keys(chapterNames).forEach(chap => {
      document.getElementById("chapterCheck_" + chap).checked = check;
      chapterFilter[chap] = check;
    });
    applyFilters();
  };
}
function toggleChapterFilter() {
  const box = document.getElementById('chapterFilterBox');
  box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
  document.getElementById('chapterFilterLabel').textContent =
    'Chapters ' + (box.style.display === 'block' ? '▲' : '▼');
}

// --- FILTERED DATA ---

function getVisibleQuestions() {
  let questions = filteredQuestions.filter(q =>
    getQNo(q) && q['Question'] &&
    q['Question'].trim().toLowerCase() !== "question"
  );
  const useHardware = responseTypeChecks.hardware;
  const useHuman = responseTypeChecks.human;
  const useProcess = responseTypeChecks.process;
  const usePhoto = responseTypeChecks.photo;
  questions = (!useHardware && !useHuman && !useProcess && !usePhoto) ? questions :
    questions.filter(q => {
      let isPhotoQ = (q["Photo Response"] || "").toString().trim().toLowerCase() === "y";
      let allNone = (!q["Hardware Response Type"] || String(q["Hardware Response Type"]).trim().toLowerCase() === "none") &&
                    (!q["Human Response Type"]   || String(q["Human Response Type"]).trim().toLowerCase() === "none") &&
                    (!q["Process Response Type"] || String(q["Process Response Type"]).trim().toLowerCase() === "none");
      if (usePhoto && isPhotoQ && allNone) return true;
      let match = false;
      if (useHardware && q["Hardware Response Type"] && !["false", "none", ""].includes(String(q["Hardware Response Type"]).trim().toLowerCase())) match = true;
      if (useHuman && q["Human Response Type"] && !["false", "none", ""].includes(String(q["Human Response Type"]).trim().toLowerCase())) match = true;
      if (useProcess && q["Process Response Type"] && !["false", "none", ""].includes(String(q["Process Response Type"]).trim().toLowerCase())) match = true;
      return match;
    });
  const useChemical = vesselTypeChecks.chemical;
  const useLNG = vesselTypeChecks.lng;
  const useLPG = vesselTypeChecks.lpg;
  const useOil = vesselTypeChecks.oil;
  questions = (!useChemical && !useLNG && !useLPG && !useOil) ? questions :
    questions.filter(q => {
      const vessels = getVesselTypes(q);
      let match = false;
      if (useChemical && vessels.includes("Chemical")) match = true;
      if (useLNG && vessels.includes("LNG")) match = true;
      if (useLPG && vessels.includes("LPG")) match = true;
      if (useOil && vessels.includes("Oil")) match = true;
      return match;
    });
  let enabledTypes = Object.keys(questionTypeChecks).filter(type => questionTypeChecks[type]);
  questions = (!enabledTypes.length) ? questions :
    questions.filter(q => !q["Question Type"] || enabledTypes.includes(q["Question Type"]));
  if (spisRankChecks) {
    let active = Object.keys(spisRankChecks).filter(r => spisRankChecks[r]);
    if (active.length && active.length < Object.keys(spisRankChecks).length) {
      questions = questions.filter(q => {
        let cell = q["Company Rank Allocation"] || "";
        let cellRanks = cell.split(/[,;]/).map(s => s.trim());
        return cellRanks.some(r => active.includes(r));
      });
    }
  }
  if (chapterFilter && Object.values(chapterFilter).some(v => !v)) {
    questions = questions.filter(q => chapterFilter[String(q.Chap)]);
  }
  return questions;
}

// --- FILTER LOGIC ---

function applyFilters() {
  console.log('applyFilters called. filters:', filters);
  filteredQuestions = questionsData.filter(q => {
    let match = true;
    for (let key in filters) {
      if (key === "search" && filters[key]) {
        let searchText = filters[key].toLowerCase();
        let found = false;
        // Loop through EVERY property in the question object
        for (let prop in q) {
          let val = q[prop];
          if (typeof val === 'string' && val.toLowerCase().includes(searchText)) {
            found = true;
            break;
          }
          if (Array.isArray(val)) {
            for (let item of val) {
              if (typeof item === 'string' && item.toLowerCase().includes(searchText)) {
                found = true;
                break;
              }
              if (typeof item === 'object' && item !== null) {
                for (let subProp in item) {
                  if (
                    typeof item[subProp] === 'string' &&
                    item[subProp].toLowerCase().includes(searchText)
                  ) {
                    found = true;
                    break;
                  }
                }
                if (found) break;
              }
            }
          }
          if (found) break;
        }
        if (!found) return false;
      }
    }
    return match;
  });

  updateSearchMatches && updateSearchMatches();

  // FIX: Select first question after filter if needed
  if (filteredQuestions.length === 0) {
    selectedIdx = -1;
  } else if (selectedIdx < 0 || selectedIdx >= filteredQuestions.length) {
    selectedIdx = 0;
  }

  renderQuestionsList && renderQuestionsList();
  renderDetailsPanel && renderDetailsPanel();
  renderCounter && renderCounter();
  updateResultIndicator && updateResultIndicator();
}

function renderCounter() {
  const visibleQuestions = getVisibleQuestions();
  document.getElementById('question-counter').textContent =
    'No of selected Questions: ' + visibleQuestions.length;
}

// --- RENDER LISTS AND PANEL ---

function renderQuestionsList() {
  const list = document.getElementById('questions-list');
  list.innerHTML = '';
  let visibleQuestions = getVisibleQuestions();

  if (!visibleQuestions.length) {
    list.innerHTML = '<div style="color:#888; font-size:1.1em;">No questions found.</div>';
    renderCounter();
    return;
  }

  visibleQuestions.forEach((q, i) => {
    const div = document.createElement('div');
    div.className = 'qitem' + (selectedIdx === i ? ' selected' : '');
    let extraClass = '';
    if (q['Question Type'] === 'Core') extraClass = ' core-q';
    else if (q['Question Type'] === 'Rotational 1') extraClass = ' rot1-q';
    else if (q['Question Type'] === 'Rotational 2') extraClass = ' rot2-q';
    div.className += extraClass;
    div.innerHTML = `<span>${padQuestionNumber(getQNo(q))}</span>: <span>${q['Question']}</span>`;
    div.onclick = () => { selectedIdx = i; renderQuestionsList(); renderDetailsPanel(); };
    // Add a data attribute to help us find the selected node later
    div.setAttribute('data-q-idx', i);
    list.appendChild(div);
  });

  // --- AUTO-SCROLL SELECTED INTO VIEW (AFTER RENDER) ---
  setTimeout(() => {
    if (selectedIdx >= 0) {
      const selectedNode = list.querySelector(`.qitem.selected`);
      if (selectedNode) {
        selectedNode.scrollIntoView({
          block: "center",   // Or use "nearest" for less movement
          behavior: "smooth"
        });
      }
    }
  }, 0);

  renderCounter();
}

function setupResponseTypeCheckboxFilters() {
  const div = document.getElementById('responseTypeChecks');
  div.innerHTML = '';
  const types = [
    { key: 'hardware', label: 'Hardware' },
    { key: 'human', label: 'Human' },
    { key: 'process', label: 'Process' },
    { key: 'photo', label: 'Photo' }
  ];
  types.forEach(type => {
    const id = "responseType_" + type.key;
    div.innerHTML += `<label style="color:#fff;display:block;">
      <input type="checkbox" id="${id}" ${responseTypeChecks[type.key] ? 'checked' : ''}>
      ${type.label}
    </label>`;
  });
  types.forEach(type => {
    const id = "responseType_" + type.key;
    document.getElementById(id).onchange = function() {
      responseTypeChecks[type.key] = this.checked;
      applyFilters();
    };
  });
}

function setupVesselCheckboxFilters() {
  const div = document.getElementById('vesselTypeChecks');
  div.innerHTML = '';
  const types = [
    { id: 'chemicalCheck', label: 'Chemical', key: 'chemical' },
    { id: 'lngCheck', label: 'LNG', key: 'lng' },
    { id: 'lpgCheck', label: 'LPG', key: 'lpg' },
    { id: 'oilCheck', label: 'Oil', key: 'oil' }
  ];
  types.forEach(type => {
    div.innerHTML += `<label style="color:#fff;display:block;">
      <input type="checkbox" id="${type.id}" ${vesselTypeChecks[type.key] ? 'checked' : ''}>
      ${type.label}
    </label>`;
  });
  types.forEach(type => {
    document.getElementById(type.id).onchange = function() {
      vesselTypeChecks[type.key] = this.checked;
      applyFilters();
    };
  });
}

function setupQTypeCheckboxFilters() {
  const div = document.getElementById('qtypeChecks');
  div.innerHTML = '';
  let qtypes = Array.from(new Set(questionsData.map(q => q["Question Type"]).filter(v => v && v !== "")));
  qtypes.forEach(type => { if (questionTypeChecks[type] === undefined) questionTypeChecks[type] = true; });
  qtypes.forEach(type => {
    const id = "qtype_" + type.replace(/\W/g, "_");
    div.innerHTML += `<label style="color:#fff;display:block;">
      <input type="checkbox" id="${id}" ${questionTypeChecks[type] ? 'checked' : ''}>${type}
    </label>`;
  });
  qtypes.forEach(type => {
    const id = "qtype_" + type.replace(/\W/g, "_");
    document.getElementById(id).onchange = function() {
      questionTypeChecks[type] = this.checked;
      applyFilters();
    };
  });
}

function setupSPISCheckboxFilters() {
  const div = document.getElementById('spisChecks');
  div.innerHTML = '';
  let spisRanks = Array.from(new Set(questionsData.map(q => q["Company Rank Allocation"]).filter(v => v && v !== "")));
  let flatRanks = [];
  spisRanks.forEach(val => {
    val.split(/[,;]/).map(s => s.trim()).forEach(rank => { if (rank && !flatRanks.includes(rank)) flatRanks.push(rank); });
  });
  flatRanks.forEach(rank => { if (!(rank in spisRankChecks)) spisRankChecks[rank] = true; });
  flatRanks.forEach(rank => {
    const id = "spisRank_" + rank.replace(/\W/g, "_");
    div.innerHTML += `<label style="color:#fff;display:block;">
      <input type="checkbox" id="${id}" ${spisRankChecks[rank] ? 'checked' : ''}>${rank}
    </label>`;
  });
  flatRanks.forEach(rank => {
    const id = "spisRank_" + rank.replace(/\W/g, "_");
    document.getElementById(id).onchange = function() {
      spisRankChecks[rank] = this.checked;
      applyFilters();
    };
  });
}

// --- FULL ADVANCED renderDetailsPanel() ---
function renderDetailsPanel() {
  const panel = document.getElementById('details-panel');
  let visibleQuestions = getVisibleQuestions();
  if (selectedIdx === -1 || !visibleQuestions.length || !visibleQuestions[selectedIdx]) {
    panel.innerHTML = '<div style="color:#aaa; font-size: 1.1em;">Select a question to view details.</div>';
    return;
  }
  const q = visibleQuestions[selectedIdx];
  const qNo = getQNo(q);
  const qNoStr = String(qNo);
  const searchText = (filters['search'] || '').trim().toLowerCase();
  let html = `<div>
    <span style="float:right;">
      <button class="print-dropdown-btn" id="singlePrintBtn" style="margin-right:3px; font-size:0.96em; padding: 5px 12px;">
        🖨️ Print
      </button>
    </span>
  </div>`;
  let chapStr = q.Chap ? `<span style="margin-left:32px; font-weight:bold; font-size:1.13em; color:#1756a0;">
    ${chapterNames[String(q.Chap)] || ""}</span>` : '';
  html += `<h2 style="margin-top:0; margin-bottom:5px; display:flex; align-items:center;">
    <span>Question ${qNo ? padQuestionNumber(qNo) : ''}</span>
    ${chapStr}
  </h2>`;
  if (q["Short Text"]) {
    html += `<div style="font-size:1.13em; font-weight:500; color:#344b6a; margin-bottom:8px;">
      <b>Subject:</b> ${highlightText(q["Short Text"], searchText)}
    </div>`;
  }
  if (q["Question"]) {
    html += `<div class="question-main-text"><b>Question Text:</b><div style="margin-top:4px; white-space: pre-wrap; display:block;">${highlightTextSafe(q["Question"] || "", searchText)}</div></div>`;
  }
  // Meta Info Table
  html += `<div class="table-scroll-x">
    <div class="meta-info-table" style="margin-bottom:16px;">
      <table style="border-collapse:collapse; width:100%;">
        <tbody>
          <tr>
            <td class="meta-label"><b>Question Type:</b></td>
            <td class="meta-value">
              ${adminMode
                ? `<input type="text" id="editQType_${selectedIdx}" value="${q["Question Type"] || ""}" style="width:97%;padding:4px;">`
                : highlightText(q["Question Type"] || "", searchText)}
            </td>
            <td class="meta-label"><b>Question Response Type:</b></td>
            <td class="meta-value">
              ${adminMode
                ? `<input type="text" id="editQRespType_${selectedIdx}" value="${getCombinedResponseType(q) || ""}" style="width:97%;padding:4px;" readonly>`
                : highlightText(getCombinedResponseType(q) || "", searchText)}
            </td>
          </tr>
          <tr>
            <td class="meta-label"><b>Vessel Type:</b></td>
            <td class="meta-value">
              ${adminMode
                ? `<input type="text" id="editVesselType_${selectedIdx}" value="${q["Vessel Type"] || ""}" style="width:97%;padding:4px;">`
                : highlightText(q["Vessel Type"] || "", searchText)}
            </td>
            <td class="meta-label"><b>ROVIQ List:</b></td>
            <td class="meta-value">
              ${adminMode
                ? `<input type="text" id="editROVIQ_${selectedIdx}" value="${q["ROVIQ List"] || ""}" style="width:97%;padding:4px;">`
                : highlightText(q["ROVIQ List"] || "", searchText)}
            </td>
          </tr>
          <tr>
            <td class="meta-label"><b>Company Rank Allocation:</b></td>
            <td class="meta-value">
              ${adminMode
                ? `<input type="text" id="editCompanyRank_${selectedIdx}" value="${q["Company Rank Allocation"] || ""}" style="width:97%;padding:4px;">`
                : highlightText(q["Company Rank Allocation"] || "", searchText)}
            </td>
            <td class="meta-label"><b>TMSA3 Reference:</b></td>
            <td class="meta-value">
              ${adminMode
                ? `<input type="text" id="editTMSA3_${selectedIdx}" value="${q["TMSA3 Reference"] || q["TMSA 3 Reference"] || ""}" style="width:97%;padding:4px;">`
                : highlightText(q["TMSA3 Reference"] || q["TMSA 3 Reference"] || "", searchText)}
            </td>
          </tr>
          <tr>
            <td class="meta-label"><b>TMSA4 Reference:</b></td>
            <td class="meta-value">
              ${adminMode
                ? `<input type="text" id="editTMSA4_${selectedIdx}" value="${q["TMSA4 Reference"] || q["TMSA 4 Reference"] || ""}" style="width:97%;padding:4px;">`
                : highlightText(q["TMSA4 Reference"] || q["TMSA 4 Reference"] || "", searchText)}
            </td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`;
  // Main collapsible sections
  const mainSections = [
    "Inspection Guidance",
    "Suggested Inspector Actions",
    "Expected Evidence",
    "Potential Grounds for Negative Observations"
  ];
        mainSections.forEach(key => {
          let cid = key.replace(/\s/g, '') + '_' + selectedIdx;
          let sectionExpanded = true;
          if (key === "Inspection Guidance" || key === "Suggested Inspector Actions") {
            let content = q[key] || "";
            let imageHtml = "";
            if (key === "Inspection Guidance") {
              if (Array.isArray(q.InspectionGuidanceImages)) {
                imageHtml = q.InspectionGuidanceImages.map(img =>
                  `<div style="margin:10px 0;">
                    <img src="${img}" alt="Inspection Photo" style="width:100%;max-width:1000px;height:auto;margin:10px 0; border-radius:10px; box-shadow:0 2px 8px #2222; border:1.5px solid #a6caef;" loading="lazy">
                  </div>`
                ).join('');
              } else if (q.image_inspection_guidance) {
                // fallback to old single image support if needed
                imageHtml = `<div style="margin:10px 0;">
                  <img src="${q.image_inspection_guidance}" alt="Inspection Photo" style="width:100%;max-width:1000px;height:auto;margin:10px 0; border-radius:10px; box-shadow:0 2px 8px #2222; border:1.5px solid #a6caef;" loading="lazy">
                </div>`;
              }
            }
            let highlightedContent = content;
            if (searchText && typeof content === "string" && content.toLowerCase().includes(searchText)) {
              sectionExpanded = true;
              highlightedContent = highlightTextSafe(content, searchText);
            }
            html += `
              <div>
                <div class="collapsible-label${window.collapsibleState[cid] || sectionExpanded ? '' : ' collapsed'}" id="colLabel_${cid}" onclick="toggleCollapse('${cid}')">
                  ${key}
                </div>
                <div class="collapsible-content${window.collapsibleState[cid] || sectionExpanded ? ' open' : ''}" id="colContent_${cid}">
                  ${imageHtml}
                  ${adminMode
                    ? `<textarea class="ems-edit-input" id="blockEdit_${key.replace(/\s/g, '')}_${selectedIdx}" rows="8" style="width:98%;">${Array.isArray(content) ? content.join('\n\n') : content}</textarea>`
                    : (Array.isArray(content)
                      ? content.map(p => `<p style="margin:8px 0; white-space: pre-wrap;">${highlightTextSafe(p, searchText)}</p>`).join('')
                      : `<span class="attr-val" style="display:block;margin-left:2px; white-space: pre-wrap;">${highlightedContent}</span>`
                    )
                  }
                </div>
              </div>`;
          }
    else if (key === "Expected Evidence") {
      if (!Array.isArray(q.ExpEv_Bullets)) {
        let bullets = (q[key] || "").split(/\n?•/g).map(t => t.trim()).filter(Boolean);
        q.ExpEv_Bullets = bullets.map(b => ({
          text: b,
          form: q["eSMS Form(s)"] || "",
          ch: q["eSMS Ch. References"] || "",
          remarks: q["Observation Remarks"] || ""
        }));
      }
      let bulletHtml = "";
      q.ExpEv_Bullets.forEach((bullet, idx) => {
        let mainText = bullet.text || "";
        let hit = searchText && (
          mainText.toLowerCase().includes(searchText)
          || (bullet.form && bullet.form.toLowerCase().includes(searchText))
          || (bullet.ch && bullet.ch.toLowerCase().includes(searchText))
          || (bullet.remarks && bullet.remarks.toLowerCase().includes(searchText))
        );
        if (hit) sectionExpanded = true;
        mainText = highlightText(mainText, searchText);
        let form = highlightTextSafe((bullet.form || ""), searchText);
        let ch = highlightTextSafe((bullet.ch || ""), searchText);
        let remarks = highlightTextSafe((bullet.remarks || ""), searchText);
        bulletHtml += `
        <div style="margin:10px 0 10px 0;padding:8px 10px 8px 10px;border-left:3px solid #b2d5ff;background:#f8fbff;border-radius:6px;">
          ${adminMode
            ? `<textarea class="ems-edit-input" id="expEvBullet_${selectedIdx}_${idx}" rows="2" style="width:99%;margin-bottom:2px;">${bullet.text}</textarea>`
            : `<div style="margin-bottom:6px; white-space: pre-wrap;">• ${highlightTextSafe(mainText, searchText)}</div>`
          }
          ${bullet.image ? `<div style="margin:10px 0;">
  <img src="${bullet.image}" alt="Evidence Photo" style="width:100%; height:auto; max-width:1000px; margin:10px 0; border-radius:10px;" loading="lazy">
</div>` : ""}
          <div style="font-size:0.96em;margin-left:14px;line-height:1.6;">
            ${adminMode
              ? `<b>eSMS Form:</b> <input type="text" class="ems-edit-input" id="expEvForm_${selectedIdx}_${idx}" value="${bullet.form || ""}" style="width:97%"><br>
                 <b>eSMS Ch. Reference:</b> <input type="text" class="ems-edit-input" id="expEvCh_${selectedIdx}_${idx}" value="${bullet.ch || ""}" style="width:97%"><br>
                 <b>Remarks:</b> <input type="text" class="ems-edit-input" id="expEvRem_${selectedIdx}_${idx}" value="${bullet.remarks || ""}" style="width:97%">`
              : `<b>eSMS Form:</b> <span class="attr-val" style="white-space: pre-wrap;">${form || "-"}</span><br>
                 <b>eSMS Ch. Reference:</b> <span class="attr-val" style="white-space: pre-wrap;">${ch || "-"}</span><br>
                 <b>Remarks:</b> <span class="attr-val" style="white-space: pre-wrap;">${remarks || "-"}</span>`
            }
          </div>
        </div>`;
      });
      html += `
        <div>
          <div class="collapsible-label${window.collapsibleState[cid] || sectionExpanded ? '' : ' collapsed'}" id="colLabel_${cid}" onclick="toggleCollapse('${cid}')">${key}</div>
          <div class="collapsible-content${window.collapsibleState[cid] || sectionExpanded ? ' open' : ''}" id="colContent_${cid}">
            ${bulletHtml}
            ${adminMode ? `<button type="button" id="addExpEvBulletBtn" style="margin:14px 0 0 0;display:block;padding:7px 20px;border-radius:5px;border:none;background:#235ea4;color:#fff;font-weight:bold;cursor:pointer;">+ Add Bullet</button>` : ""}
          </div>
        </div>`;
    }
    else if (key === "Potential Grounds for Negative Observations") {
      let bullets = Array.isArray(q.NegObs_Bullets)
        ? q.NegObs_Bullets
        : (q[key] || "").split(/\n?•/g).map(t => t.trim()).filter(Boolean);

      // In Admin Mode, convert the legacy text field into an editable bullets array (once)
      if (adminMode && !Array.isArray(q.NegObs_Bullets)) {
        q.NegObs_Bullets = bullets.slice();
      }
      bullets = Array.isArray(q.NegObs_Bullets) ? q.NegObs_Bullets : bullets;

      const defaultNegObsRemarks = (i) => {
        const lib = (q.NegObs_Remarks_PerBullet && Array.isArray(q.NegObs_Remarks_PerBullet) && q.NegObs_Remarks_PerBullet[i])
          ? q.NegObs_Remarks_PerBullet[i]
          : ["", ""];
        return [lib[0] || "", lib[1] || ""];
      };

      if (!questionAnswers[qNo]) {
        questionAnswers[qNo] = bullets.map((_, i) => {
          const def = defaultNegObsRemarks(i);
          return { answer: "", comment: "", remarks: [def[0], def[1]] };
        });
      }

      if (questionAnswers[qNo].length !== bullets.length) {
        questionAnswers[qNo].length = bullets.length;
      }

      // Ensure each PGNO answer slot exists and carries default remarks (from library) if empty.
      for (let i = 0; i < bullets.length; ++i) {
        const def = defaultNegObsRemarks(i);
        questionAnswers[qNo][i] = questionAnswers[qNo][i] || { answer: "", comment: "", remarks: [def[0], def[1]] };
        if (!Array.isArray(questionAnswers[qNo][i].remarks)) questionAnswers[qNo][i].remarks = [def[0], def[1]];
        if ((questionAnswers[qNo][i].remarks[0] || "") === "") questionAnswers[qNo][i].remarks[0] = def[0];
        if ((questionAnswers[qNo][i].remarks[1] || "") === "") questionAnswers[qNo][i].remarks[1] = def[1];
      }

      if (!q.NegObs_Remarks_PerBullet || !Array.isArray(q.NegObs_Remarks_PerBullet)) {
        q.NegObs_Remarks_PerBullet = [];
      }
      if (q.NegObs_Remarks_PerBullet.length !== bullets.length) {
        q.NegObs_Remarks_PerBullet.length = bullets.length;
        for (let i = 0; i < bullets.length; ++i) {
          q.NegObs_Remarks_PerBullet[i] = q.NegObs_Remarks_PerBullet[i] || ["", ""];
        }
      }

      let pgnoHtml = "";
      bullets.forEach((b, idx) => {
        const rawBullet = (b || "");
        const bulletDisplay = adminMode ? escapeHtml(rawBullet).replace(/\n/g, "<br>") : renderMultilineHighlighted(rawBullet, searchText);
        const hit = searchText && rawBullet.toLowerCase().includes(searchText);
        if (hit) sectionExpanded = true;
        pgnoHtml += `<div class="pgno-block" style="margin:7px 0 0 0; padding:7px 7px 5px 7px; background:#f6f8fb; border-left:3px solid #c3dafe; border-radius:5px;">
          <div style="display:flex; gap:10px; align-items:flex-start;">
            <div style="flex:1;">
              <span style="font-size:1em;">
                <b>${fullPGNO(qNo, idx)}</b> ${bulletDisplay}
              </span>
              ${adminMode ? `<textarea class="ems-edit-input" id="negObsBullet_${selectedIdx}_${idx}" rows="2" style="width:99%; margin-top:6px;">${escapeHtml(rawBullet)}</textarea>` : ""}
            </div>
            ${adminMode ? `<button type="button" id="delNegObsBullet_${selectedIdx}_${idx}" style="border:none; background:#e6eefc; border-radius:6px; padding:6px 10px; cursor:pointer;">Delete</button>` : ""}
          </div>`;
                const _canEditPgnoRem = canEditPgnoRemarks();
        const _pgnoRO = _canEditPgnoRem ? "" : "readonly";
        const _pgnoROStyle = _canEditPgnoRem ? "" : "background:#f5f6fa;";
        if (currentMode !== "study") {
          pgnoHtml += `
            <div style="display:flex; align-items:center; gap:8px; margin-top:4px; flex-wrap:wrap;">
              <select id="pgnoAnswer_${selectedIdx}_${idx}" style="font-size:0.98em; padding:2px 6px; border-radius:4px; border:1px solid #c9d6ee;">
                <option value="">Select</option>
                <option>Yes</option>
                <option>No</option>
                <option>Not Applicable</option>
                <option>Not Seen</option>
              </select>
              <input type="text" id="pgnoComment_${selectedIdx}_${idx}" value="${escapeHtml(questionAnswers[qNo] && questionAnswers[qNo][idx] ? (questionAnswers[qNo][idx].comment || "") : "")}" style="flex:1; min-width:220px; padding:2px 6px; border-radius:4px; border:1px solid #c9d6ee; font-size:0.99em;" placeholder="Comment">
            </div>
          `;
        }

        // Remarks are visible when they have content (for non-edit roles); editable roles always see them.
        const canEditRemarks = canEditPgnoRemarks();
        const roAttr = canEditRemarks ? "" : " readonly";
        const remA = (questionAnswers[qNo] && questionAnswers[qNo][idx] && Array.isArray(questionAnswers[qNo][idx].remarks) ? (questionAnswers[qNo][idx].remarks[0] || "") : "") || "";
        const remB = (questionAnswers[qNo] && questionAnswers[qNo][idx] && Array.isArray(questionAnswers[qNo][idx].remarks) ? (questionAnswers[qNo][idx].remarks[1] || "") : "") || "";

        const hasRemA = (remA || "").trim() !== "";
        const hasRemB = (remB || "").trim() !== "";
        const showRemA = canEditRemarks || hasRemA;
        const showRemB = canEditRemarks || hasRemB;

        if (showRemA || showRemB) {
          pgnoHtml += `
            <div class="remarks-row" style="margin-top:5px;">
              ${showRemA ? `
                <div class="remarks-block">
                  <label style="font-weight:bold;display:block;margin-bottom:3px;">Remarks 1:</label>
                  <textarea class="ems-edit-input" id="negObsRem_${selectedIdx}_${idx}_1"${roAttr}>${escapeHtml(remA)}</textarea>
                </div>
              ` : ""}

              ${showRemB ? `
                <div class="remarks-block">
                  <label style="font-weight:bold;display:block;margin-bottom:3px;">Remarks 2:</label>
                  <textarea class="ems-edit-input" id="negObsRem_${selectedIdx}_${idx}_2"${roAttr}>${escapeHtml(remB)}</textarea>
                </div>
              ` : ""}
            </div>
          `;
        }

        pgnoHtml += `</div>`;
      });
      html += `
      <div>
        <div class="collapsible-label${window.collapsibleState[cid] || sectionExpanded ? '' : ' collapsed'}" id="colLabel_${cid}" onclick="toggleCollapse('${cid}')">
          ${key}
        </div>
        <div class="collapsible-content${window.collapsibleState[cid] || sectionExpanded ? ' open' : ''}" id="colContent_${cid}" style="padding-bottom:0;">
          ${pgnoHtml}
          ${adminMode ? `<button type="button" id="addNegObsBulletBtnMaster" style="margin:12px 0 6px 0;display:block;padding:7px 20px;border-radius:5px;border:none;background:#235ea4;color:#fff;font-weight:bold;cursor:pointer;">+ Add Bullet</button>` : ""}
          ${currentMode !== "study" ? `
            <div style="margin:16px 0 3px 0;">
              <button type="button" id="savePGNOAnswersBtn" class="submit-btn" style="width:220px;">Save</button>
              <span id="savePGNOStatus" style="margin-left:16px; color:#287418; font-weight:600;"></span>
            </div>
          ` : ""}
        </div>
      </div>`;
    }
  });
  panel.innerHTML = html;

  if (adminMode) {
    const qType = document.getElementById(`editQType_${selectedIdx}`);
    if (qType) qType.onchange = (e) => { q["Question Type"] = e.target.value; };
    const vesselType = document.getElementById(`editVesselType_${selectedIdx}`);
    if (vesselType) vesselType.onchange = (e) => { q["Vessel Type"] = e.target.value; };
    const roviq = document.getElementById(`editROVIQ_${selectedIdx}`);
    if (roviq) roviq.onchange = (e) => { q["ROVIQ List"] = e.target.value; };
    const rankInput = document.getElementById(`editCompanyRank_${selectedIdx}`);
    if (rankInput) rankInput.onchange = (e) => { q["Company Rank Allocation"] = e.target.value; };
    const tmsa3 = document.getElementById(`editTMSA3_${selectedIdx}`);
    if (tmsa3) tmsa3.onchange = (e) => { 
      q["TMSA3 Reference"] = e.target.value;
      q["TMSA 3 Reference"] = e.target.value;
    };
    const tmsa4 = document.getElementById(`editTMSA4_${selectedIdx}`);
    if (tmsa4) tmsa4.onchange = (e) => { 
      q["TMSA4 Reference"] = e.target.value;
      q["TMSA 4 Reference"] = e.target.value;
    };
  }
  if (adminMode) {
    const rankInput = document.getElementById(`editCompanyRank_${selectedIdx}`);
    if (rankInput) {
      rankInput.onchange = (e) => {
        q["Company Rank Allocation"] = e.target.value;
      };
    }
  }
  setTimeout(() => {
    const printBtn = document.getElementById('singlePrintBtn');
    if (printBtn) {
      printBtn.onclick = () => {
        let currentQ = getVisibleQuestions()[selectedIdx];
        printFullQuestion(currentQ);
      };
    }
  }, 0);
  if (questionAnswers[qNoStr]) {
    questionAnswers[qNoStr].forEach((ac, idx) => {
      const sel = document.getElementById(`pgnoAnswer_${selectedIdx}_${idx}`);
      const inp = document.getElementById(`pgnoComment_${selectedIdx}_${idx}`);
      const rem1 = document.getElementById(`negObsRem_${selectedIdx}_${idx}_1`);
      const rem2 = document.getElementById(`negObsRem_${selectedIdx}_${idx}_2`);
      if (sel) sel.value = ac.answer || "";
      if (inp) inp.value = ac.comment || "";
      if (rem1) rem1.value = (ac.remarks && ac.remarks[0]) || "";
      if (rem2) rem2.value = (ac.remarks && ac.remarks[1]) || "";
    });

  // Live update of PGNO remarks for allowed roles (read-only for others).
  if (!adminMode && canEditPgnoRemarks() && questionAnswers[qNoStr]) {
    questionAnswers[qNoStr].forEach((ac, idx) => {
      const rem1 = document.getElementById(`negObsRem_${selectedIdx}_${idx}_1`);
      const rem2 = document.getElementById(`negObsRem_${selectedIdx}_${idx}_2`);
      if (rem1) rem1.onchange = (e) => { ac.remarks = ac.remarks || ["",""]; ac.remarks[0] = e.target.value; };
      if (rem2) rem2.onchange = (e) => { ac.remarks = ac.remarks || ["",""]; ac.remarks[1] = e.target.value; };
    });
  }

  }
  const saveBtn = document.getElementById("savePGNOAnswersBtn");
  if (saveBtn) {
    saveBtn.onclick = function() {
      if (!questionAnswers[qNoStr]) return;
      questionAnswers[qNoStr].forEach((ac, idx) => {
        const sel = document.getElementById(`pgnoAnswer_${selectedIdx}_${idx}`);
        const inp = document.getElementById(`pgnoComment_${selectedIdx}_${idx}`);
        const rem1 = document.getElementById(`negObsRem_${selectedIdx}_${idx}_1`);
        const rem2 = document.getElementById(`negObsRem_${selectedIdx}_${idx}_2`);
        ac.answer = sel ? sel.value : "";
        ac.comment = inp ? inp.value : "";
        ac.remarks = [rem1 ? rem1.value : "", rem2 ? rem2.value : ""];
      });
      document.getElementById("savePGNOStatus").textContent = "Saved!";
      setTimeout(() => { document.getElementById("savePGNOStatus").textContent = ""; }, 1500);
    }
  }
  if (adminMode && q.NegObs_Bullets && q.NegObs_Remarks_PerBullet) {
    const addBtnMaster = document.getElementById("addNegObsBulletBtnMaster");
    if (addBtnMaster) {
      addBtnMaster.onclick = function() {
        q.NegObs_Bullets.push("");
        q.NegObs_Remarks_PerBullet.push(["", ""]);
        questionAnswers[qNo].push({ answer: "", comment: "", remarks: ["", ""] });
        updateNegObs(q);
        renderDetailsPanel();
      };
    }

    q.NegObs_Bullets.forEach((b, idx) => {
      const bulletInput = document.getElementById(`negObsBullet_${selectedIdx}_${idx}`);
      if (bulletInput) {
        bulletInput.onchange = (e) => {
          q.NegObs_Bullets[idx] = e.target.value;
          updateNegObs(q);
        };
      }

      const delBtn = document.getElementById(`delNegObsBullet_${selectedIdx}_${idx}`);
      if (delBtn) {
        delBtn.onclick = () => {
          if (!confirm("Delete this PGNO bullet?")) return;
          q.NegObs_Bullets.splice(idx, 1);
          q.NegObs_Remarks_PerBullet.splice(idx, 1);
          if (questionAnswers[qNo]) questionAnswers[qNo].splice(idx, 1);
          updateNegObs(q);
          renderDetailsPanel();
        };
      }

      [1,2].forEach(num => {
        const negInput = document.getElementById(`negObsRem_${selectedIdx}_${idx}_${num}`);
        if (negInput) {
          negInput.onchange = (e) => { q.NegObs_Remarks_PerBullet[idx][num-1] = e.target.value; if (questionAnswers[qNo] && questionAnswers[qNo][idx] && Array.isArray(questionAnswers[qNo][idx].remarks)) { questionAnswers[qNo][idx].remarks[num-1] = e.target.value; } };
        }
      });
    });
  }
  if (adminMode && q.ExpEv_Bullets) {
    q.ExpEv_Bullets.forEach((bullet, idx) => {
      const bulletInput = document.getElementById(`expEvBullet_${selectedIdx}_${idx}`);
      const formInput   = document.getElementById(`expEvForm_${selectedIdx}_${idx}`);
      const chInput     = document.getElementById(`expEvCh_${selectedIdx}_${idx}`);
      const remInput    = document.getElementById(`expEvRem_${selectedIdx}_${idx}`);
      if (bulletInput)  bulletInput.onchange = (e) => { bullet.text = e.target.value; updateExpectedEvidence(q); };
      if (formInput)    formInput.onchange   = (e) => { bullet.form = e.target.value; };
      if (chInput)      chInput.onchange     = (e) => { bullet.ch = e.target.value; };
      if (remInput)     remInput.onchange    = (e) => { bullet.remarks = e.target.value; };
    });
    const addBtn = document.getElementById("addExpEvBulletBtn");
    if (addBtn) {
      addBtn.onclick = function() {
        q.ExpEv_Bullets.push({text:"",form:"",ch:"",remarks:""});
        updateExpectedEvidence(q);
        renderDetailsPanel();
      };
    }
  }
  if (adminMode) {
    ["Inspection Guidance", "Suggested Inspector Actions"].forEach(field => {
      const area = document.getElementById(`blockEdit_${field.replace(/\s/g, '')}_${selectedIdx}`);
      if (area) {
        area.onchange = (e) => { q[field] = e.target.value; };
      }
    });
  }
  function updateExpectedEvidence(qobj) {
    qobj["Expected Evidence"] = qobj.ExpEv_Bullets.map(b => b.text && b.text.trim() ? "• " + b.text.trim() : "").filter(Boolean).join("\n");
  }

function updateNegObs(qobj) {
  if (!Array.isArray(qobj.NegObs_Bullets)) return;
  qobj["Potential Grounds for Negative Observations"] = qobj.NegObs_Bullets
    .map(t => (t || "").trim())
    .filter(Boolean)
    .map(t => "• " + t)
    .join("\n");
}

} // END renderDetailsPanel

// --- DATA LOAD & INIT ---
// Fetch data at page load, but don't render filters until mode is selected
  window.QUESTIONS_SOURCE.loadQuestions()
  .then(resp => resp.json())
  .then(data => {
    questionsData = data;

    const inspectionImages = {
      "11.1.1": "Images/11.01.01_O.LUNA_Location 01.jpg",
      "11.1.2": "Images/11.01.02_O.LUNA_Location 02.jpg",
      "11.1.3": "Images/11.01.03_O.LUNA_Location 03.jpg",
      "11.1.4": "Images/11.01.04_O.LUNA_Location 04.jpg",
      "11.1.5": "Images/11.01.05_O.LUNA_Location 05.jpg",
      "11.1.6": "Images/11.01.06_O.LUNA_Location 06.jpg",
      "11.1.7": "Images/11.01.07_O.LUNA_Location No. 07.jpeg",
      "11.1.8": "Images/11.01.08_O.LUNA_Location No. 08.jpeg",
      "11.1.9": "Images/11.01.09_O.LUNA_Location No. 09.jpeg",
      "11.1.10": "Images/11.01.10_O.LUNA_Location No. 10.jpeg",
      "11.1.11": "Images/11.01.11_O.LUNA_Location No. 11.jpeg",
      "11.1.12": "Images/11.01.12_O.LUNA_Location No. 12.jpeg",
      "11.1.13": "Images/11.01.13_O.LUNA_Location No. 13.jpeg",
      "11.1.14": "Images/11.01.14_O.LUNA_Location No. 14.jpeg",
      "11.1.15": "Images/11.01.15_O.LUNA_Location No. 15.jpeg",
      "11.1.16": "Images/11.01.16_O.LUNA_Location No. 16.jpeg",
      "11.1.17": "Images/11.01.17_O.LUNA_Location No. 17.jpeg",
      "11.1.18": "Images/11.01.18_O.LUNA_Location No. 18.jpeg",
      "11.1.19": "Images/11.01.19_O.LUNA_Location No. 19.jpeg",
      "11.1.20": "Images/11.01.20_O.LUNA_Location No. 20.jpeg",
      "11.1.21": "Images/11.01.21_O.LUNA_Location No. 21.jpeg",
      "11.1.22": "Images/11.01.22_O.LUNA_Location No. 22.jpeg",
      "11.1.23": "Images/11.01.23_O.LUNA_Location No. 23.JPG",
      "11.1.24": "Images/11.01.24_O.LUNA_Location No. 24.JPG",
      "11.1.25": "Images/11.01.25_O.LUNA_Location No. 25.JPG",
      "11.1.26": "Images/11.01.26_O.LUNA_Location No. 26.JPG",
      "11.1.27": "Images/11.01.27_O.LUNA_Location No. 27.JPG",
      "11.1.28": "Images/11.01.28_O.LUNA_Location No. 28.JPG",
      "11.1.29": "Images/11.01.29_O.LUNA_Location No. 29.JPG",
      "11.1.30": "Images/11.01.30_O.LUNA_Location No. 30.JPG",
      "11.1.31": "Images/11.01.31_O.LUNA_Location No. 31.JPG",
      "11.1.32": "Images/11.01.32_O.LUNA_Location No. 32.jpeg",
      "11.1.33": "Images/11.01.33_O.LUNA_Location No. 33.JPG",
      "11.1.40": "Images/11.01.40_O.LUNA_Location No. 40.jpeg",
      "11.1.41": "Images/11.01.41_O.LUNA_Location No. 41.jpeg",
      "11.1.42": "Images/11.01.42_O.LUNA_Location No. 42.jpeg"
    };

    // Always assign an array to InspectionGuidanceImages (even if only 1)
    questionsData.forEach(q => {
      const qNo = String(q["No."] || q["No"]).split('.').slice(0,3).join('.');
      if (inspectionImages[qNo]) {
        q.InspectionGuidanceImages = [inspectionImages[qNo]];
      }
    });

    document.getElementById('modeSelectorScreen').style.display = 'flex';
  }); // <--- Only this closes the fetch .then


// Then, in your confirmMode function:
function confirmMode() {
  const sel = document.getElementById('modeSelect');
  if (!sel.value) {
    sel.style.border = '2px solid red';
    sel.focus();
    return;
  }
  currentMode = sel.value;
  document.getElementById('modeSelectorScreen').style.display = 'none';

  if (currentMode === "study") {
    loggedIn = true;
    document.getElementById('adminBarControls').style.display = 'none';
    document.getElementById('loginPanel').style.display = 'none';
    document.getElementById('userManagementPanel').style.display = 'none';
  } else {
    loggedIn = false;
    document.getElementById('loginPanel').style.display = 'flex';
    document.getElementById('userManagementPanel').style.display = 'none';
  }

  // --- ADD THIS BLOCK ---
  document.getElementById('filters').style.display = '';
  setupResponseTypeCheckboxFilters && setupResponseTypeCheckboxFilters();
  setupVesselCheckboxFilters && setupVesselCheckboxFilters();
  setupQTypeCheckboxFilters && setupQTypeCheckboxFilters();
  setupSPISCheckboxFilters && setupSPISCheckboxFilters();
  setupChapterCheckboxFilters && setupChapterCheckboxFilters();
  applyFilters && applyFilters();
}

// --- EVENT SETUP ---
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('toggleAdminBtn').onclick = function() {
    if (!adminMode) {
      const pw = prompt("Enter admin password:");
      if (pw !== "sireadmin2025") {
        alert("Incorrect password.");
        return;
      }
    }
    adminMode = !adminMode;
    this.textContent = adminMode ? "Disable Editing" : "Enable Editing";
    document.getElementById('downloadJsonBtn').style.display = adminMode ? "" : "none";
    document.getElementById('adminStatus').textContent = adminMode ? "Admin Mode Enabled" : "";
    renderDetailsPanel();
  };
  document.getElementById('downloadJsonBtn').onclick = function() { downloadJson(); };
  document.getElementById('exportAnswersBtn').onclick = function() {
    const blob = new Blob([JSON.stringify(questionAnswers, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sire_answers_export.json";
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); }, 600);
    document.getElementById('importExportStatus').textContent = "Exported!";
    setTimeout(() => { document.getElementById('importExportStatus').textContent = ""; }, 1800);
  };
  document.getElementById('printAllBtn').onclick = printAllFilteredQuestions;
  document.getElementById('importAnswersBtn').onclick = function() {
    document.getElementById('importAnswersInput').click();
  };
  document.getElementById('importAnswersInput').onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
      try {
        const obj = JSON.parse(event.target.result);
        if (typeof obj === "object") {
          questionAnswers = obj;
          renderDetailsPanel();
          document.getElementById('importExportStatus').textContent = "Imported!";
          setTimeout(() => { document.getElementById('importExportStatus').textContent = ""; }, 1800);
        }
      } catch (err) {
        alert("Invalid file format.");
      }
    };
    reader.readAsText(file);
    this.value = '';
  };
});

// --- DOWNLOAD JSON FUNCTION ---
function downloadJson() {
  const dataStr = JSON.stringify(questionsData, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sire_questions_all_columns_named_EDITED.json";
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); }, 500);
}

// --- COLLAPSE HANDLING FOR PANEL ---
function toggleCollapse(cid) {
  window.collapsibleState = window.collapsibleState || {};
  window.collapsibleState[cid] = !window.collapsibleState[cid];
  renderDetailsPanel();
}

function toggleFilterDropdown(type) {
  // Hide all other dropdowns
  ['responseType','vesselType','qtype','spis','chapter'].forEach(key => {
    if (key !== type) document.getElementById(key + 'Dropdown').style.display = 'none';
  });
  // Toggle current
  const box = document.getElementById(type + 'Dropdown');
  box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
  // Change label arrow ▼/▲ (optional)
  document.getElementById(type + 'Label').textContent =
    document.getElementById(type + 'Label').textContent.replace('▲','').replace('▼','').trim() +
    (box.style.display === 'block' ? ' ▲' : ' ▼');
}

// --- SEARCH MATCHES (for navigation/highlight) ---
function updateSearchMatches() {
  searchMatches = [];
  currentMatchIdx = -1;
  const searchText = filters['search'];
  if (!searchText || searchText.trim() === "") return;
  const questions = getVisibleQuestions();
  questions.forEach((q, idx) => {
    const fieldsToSearch = [
      'No.', 'No',
      'Question',
      'Inspection Guidance',
      'Suggested Inspector Actions',
      'Expected Evidence',
      'Potential Grounds for Negative Observations'
    ];
    fieldsToSearch.forEach(field => {
      let val = q[field];
      if (Array.isArray(val)) {
        val.forEach((bullet, bIdx) => {
          let text = (typeof bullet === 'object' && bullet.text) ? bullet.text : String(bullet);
          let valueLower = (text || "").toLowerCase();
          let pos = valueLower.indexOf(searchText);
          while (pos !== -1) {
            searchMatches.push({ qIndex: idx, field, bulletIdx: bIdx, start: pos, end: pos + searchText.length });
            pos = valueLower.indexOf(searchText, pos + 1);
          }
        });
      } else if (typeof val === 'string' || typeof val === 'number') {
        let valueLower = String(val).toLowerCase();
        let pos = valueLower.indexOf(searchText);
        while (pos !== -1) {
          searchMatches.push({ qIndex: idx, field, bulletIdx: undefined, start: pos, end: pos + searchText.length });
          pos = valueLower.indexOf(searchText, pos + 1);
        }
      }
    });
  });
  if (searchMatches.length > 0) currentMatchIdx = 0;
}

function updateResultIndicator() {
  const indicator = document.getElementById('resultIndicator');
  if (!indicator) return;
  if (!searchMatches.length) {
    indicator.textContent = "No results";
  } else if (currentMatchIdx >= 0 && currentMatchIdx < searchMatches.length) {
    indicator.textContent = "Result " + (currentMatchIdx + 1) + " of " + searchMatches.length;
  } else {
    indicator.textContent = "Results: " + searchMatches.length;
  }
}

function goToNextResult() {
  if (!searchMatches.length) return;
  currentMatchIdx = (currentMatchIdx + 1) % searchMatches.length;
  selectCurrentMatch();
}

function goToPrevResult() {
  if (!searchMatches.length) return;
  currentMatchIdx = (currentMatchIdx - 1 + searchMatches.length) % searchMatches.length;
  selectCurrentMatch();
}

function selectCurrentMatch() {
  if (!searchMatches.length) return;
  let match = searchMatches[currentMatchIdx];
  selectedIdx = match.qIndex;
  renderQuestionsList();
  renderDetailsPanel();
  updateResultIndicator();
  setTimeout(() => {
    let el = document.getElementById('details-panel');
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
}

document.getElementById('loginBtn').onclick = function() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const errorDiv = document.getElementById('loginError');
  errorDiv.textContent = "";
  let userObj = users.find(u => u.username === username && u.password === password);
  if (userObj) {
    loggedIn = true;
    document.getElementById('loginPanel').style.display = 'none';
    if (currentMode === "superuser" && userObj.role === "superuser") {
      showUserList();
    } else {
      document.getElementById('userManagementPanel').style.display = 'none';
    }
    document.getElementById('adminBarControls').style.display = '';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
  } else {
    errorDiv.textContent = "Incorrect username or password.";
  }
};

function showUserList() {
  const userListDiv = document.getElementById('userList');
  userListDiv.innerHTML = users.map((u, idx) =>
    `<div style="margin-bottom:6px;">${u.username} &mdash; ${u.role || "user"}
      <button onclick="removeUser(${idx})" style="margin-left:12px; background:#f44; color:#fff; border:none; border-radius:4px; padding:2px 8px;">Remove</button>
    </div>`
  ).join('');
}

function addUser() {
  const user = document.getElementById('newUsername').value.trim();
  const pass = document.getElementById('newPassword').value.trim();
  if (user && pass) {
    users.push({ username: user, password: pass, role: "user" });
    showUserList();
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
  }
}

function removeUser(idx) {
  users.splice(idx, 1);
  showUserList();
}

document.getElementById('modeSwitchBtn').onclick = function() {
  document.getElementById('loginPanel').style.display = 'none';
  document.getElementById('userManagementPanel').style.display = 'none';
  document.getElementById('modeSelectorScreen').style.display = 'flex';
  document.getElementById('modeSelect').selectedIndex = 0;
};

window.onload = function() {
  setupFilters();

  // Show/Hide User Management panel
  var btn = document.getElementById('showUserManagementBtn');
  var panel = document.getElementById('userManagementPanel');
  if (btn && panel) {
    btn.onclick = function() {
      if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'block';
      } else {
        panel.style.display = 'none';
      }
    };
  }
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js')
    .then(function(registration) {
      console.log('ServiceWorker registration successful:', registration);
    })
    .catch(function(error) {
      console.log('ServiceWorker registration failed:', error);
    });
}

function printAllFilteredQuestions() {
  const visibleQuestions = getVisibleQuestions();
  if (!visibleQuestions.length) {
    alert("No questions to print.");
    return;
  }

  let html = `<div id="printAllView" style="font-family:Segoe UI, Arial,sans-serif;max-width:1100px;margin:auto;">`;

  visibleQuestions.forEach((q, idx) => {
    html += `
      <div class="print-question-block" style="page-break-before: ${idx > 0 ? 'always' : 'auto'};">
        ${renderPrintQuestionHTML(q)}
      </div>
    `;
  });

  html += `</div>`;

  let win = window.open('', '', 'width=1100,height=900');
  win.document.write('<html><head><title>Print Questions</title>');
  win.document.write(`
    <style>
      body { font-family: Segoe UI, Arial,sans-serif; background:#fff; font-size:0.98em;}
      #printAllView { margin: 0 auto; }
      .meta-info-table { width: 99%; border-collapse: collapse; margin-bottom: 20px; }
      .meta-info-table td, .meta-info-table th {
        border: 1px solid #c7d3e8;
        padding: 8px 10px;
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
        min-width: 120px;
      }
      .meta-info-table {
        box-shadow: 0 2px 8px rgba(28,80,180,0.08);
        border-radius: 8px;
        overflow: hidden;
      }
      .print-section-header {
        font-size: 1.09em;
        font-weight: bold;
        margin-top: 16px;
        margin-bottom: 8px;
        color: #143169;
        border-bottom: 1.2px solid #d4e1f9;
        padding-bottom: 2px;
      }
      ul { margin: 12px 0 12px 28px; }
      li { margin-bottom: 6px; }
      .print-question-block { margin-bottom: 36px; }
      @media print {
        #printAllView { box-shadow:none; }
        .print-question-block { page-break-before: always; }
        div { page-break-inside:avoid; }
        h1, h2 { font-size:1.04em;}
        @page { size: A4 portrait; margin: 5mm; }
        .print-section-header {
          page-break-after: avoid;
          color: #000;
          margin-top: 12px;
          margin-bottom: 6px;
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

// End of app.js
