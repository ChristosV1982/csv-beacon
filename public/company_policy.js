// public/company_policy.js
// C.S.V. BEACON – Company Policy module shell
// v1: front-end structure only. No SQL/RLS/import/AI yet.

const POLICY_CHAPTERS = [
  { code: "0", title: "SPRINGFIELD MANAGEMENT SYSTEM MANUAL" },
  { code: "1", title: "GENERAL ISSUES" },
  { code: "2", title: "COMPANY'S POLICIES AND MANAGEMENT COMMITMENT" },
  { code: "3", title: "COMPANY AND SHIPBOARD ORGANIZATION, RESPONSIBILITIES AND AUTHORITIES" },
  { code: "4", title: "DPA" },
  { code: "5", title: "MASTER'S RESPONSIBILITY AND AUTHORITY" },
  { code: "6.1", title: "RESOURCES AND PERSONNEL (CREW)" },
  { code: "6.2", title: "RESOURCES AND PERSONNEL (SHORE)" },
  { code: "7.1", title: "GENERAL PROVISIONS FOR KEY SHIPBOARD OPERATIONS" },
  { code: "7.2", title: "NAVIGATION" },
  { code: "7.2a", title: "ECDIS PROCEDURES" },
  { code: "7.3", title: "MOORING & ANCHORING OPERATIONS" },
  { code: "7.4", title: "ENGINE ROOM OPERATIONS" },
  { code: "7.5", title: "CARGO AND BALLAST OPERATIONS (ANNEX I CARGOES)" },
  { code: "7.6", title: "ENVIRONMENTAL PROCEDURES" },
  { code: "7.7", title: "DRUG AND ALCOHOL (D&A) CONTROL" },
  { code: "7.8", title: "COMMUNICATIONS" },
  { code: "7.9", title: "PROCEDURES FOR SAFE WORK PERFORMANCE" },
  { code: "7.10", title: "HEALTH, HYGIENE AND MEDICAL ISSUES" },
  { code: "7.11", title: "FATIGUE" },
  { code: "8", title: "EMERGENCY PREPAREDNESS" },
  { code: "9", title: "REPORTING, ROOT CAUSE ANALYSIS AND INVESTIGATION OF NON-CONFORMITIES, INCIDENTS, AND NEAR-MISSES" },
  { code: "10", title: "MAINTENANCE OF THE SHIP AND EQUIPMENT" },
  { code: "11", title: "DOCUMENT/DATA CONTROL" },
  { code: "12", title: "VERIFICATION, REVIEW AND EVALUATION" },
  { code: "13", title: "MANAGEMENT OF CHANGE" },
  { code: "14", title: "RISK ASSESSMENT (RA) AND RISK MANAGEMENT (RM)" },
  { code: "15", title: "NEW ACQUISITIONS AND SHIPBUILDING PROJECTS" },
  { code: "16", title: "QUALITY MANAGEMENT" },
  { code: "17", title: "CONTRACTORS MANAGEMENT" },
  { code: "18", title: "PURCHASING" },
  { code: "19", title: "EXTERNAL SHIP SURVEYS AND INSPECTIONS" },
  { code: "20", title: "CYBER SECURITY" },
  { code: "21.1", title: "COMPANY GUIDE TO TRAVEL FOR SEAFARERS, CONTRACTORS AND COMPANY PERSONNEL" },
  { code: "21.4", title: "BUSINESS CONTINUITY PLAN" }
];

let selectedChapterCode = POLICY_CHAPTERS[0]?.code || "";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showWarn(message) {
  const el = document.getElementById("warnBox");
  if (!el) return;
  el.textContent = message || "";
  el.style.display = message ? "block" : "none";
}

function showOk(message) {
  const el = document.getElementById("okBox");
  if (!el) return;
  el.textContent = message || "";
  el.style.display = message ? "block" : "none";

  if (message) {
    window.setTimeout(() => {
      el.style.display = "none";
      el.textContent = "";
    }, 1800);
  }
}

function findChapter(code) {
  return POLICY_CHAPTERS.find((chapter) => chapter.code === code) || null;
}

function renderChapterList() {
  const list = document.getElementById("chapterList");
  if (!list) return;

  list.innerHTML = POLICY_CHAPTERS.map((chapter) => {
    const active = chapter.code === selectedChapterCode ? " active" : "";
    return `
      <button class="chapter-btn${active}" type="button" data-chapter-code="${escapeHtml(chapter.code)}">
        <span class="chapter-code">Chapter ${escapeHtml(chapter.code)}</span>
        ${escapeHtml(chapter.title)}
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-chapter-code]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectChapter(btn.getAttribute("data-chapter-code"));
    });
  });
}

function selectChapter(code) {
  const chapter = findChapter(code);
  if (!chapter) return;

  selectedChapterCode = chapter.code;
  renderChapterList();
  renderSelectedChapter();
}

function renderSelectedChapter() {
  const chapter = findChapter(selectedChapterCode);

  const titleEl = document.getElementById("chapterTitle");
  const metaEl = document.getElementById("chapterMeta");
  const contentEl = document.getElementById("chapterContent");

  if (!chapter) {
    if (titleEl) titleEl.textContent = "Select a chapter";
    if (metaEl) metaEl.textContent = "No chapter selected.";
    if (contentEl) contentEl.textContent = "Select a chapter from the left side.";
    return;
  }

  if (titleEl) {
    titleEl.textContent = `Chapter ${chapter.code} - ${chapter.title}`;
  }

  if (metaEl) {
    metaEl.textContent = "Policy structure placeholder. No controlled policy text has been inserted yet.";
  }

  if (contentEl) {
    contentEl.innerHTML = `
      <div>
        <strong>Chapter ${escapeHtml(chapter.code)} - ${escapeHtml(chapter.title)}</strong>
      </div>
      <br />
      <div>
        This chapter is currently created as a structural placeholder.
      </div>
      <br />
      <div>
        Later this area will contain the approved policy text, divided into sections, with revision control, approval workflow, exact search, AI source-based search, and change requests.
      </div>
    `;
  }
}

function setupTabs() {
  const tabButtons = document.querySelectorAll("[data-tab]");
  const panels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-tab");

      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      panels.forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== `tab-${target}`);
      });
    });
  });
}

function runSearch() {
  const input = document.getElementById("searchInput");
  const results = document.getElementById("searchResults");

  if (!input || !results) return;

  const query = String(input.value || "").trim().toLowerCase();

  if (!query) {
    results.innerHTML = `
      <div class="content-box">
        Type a chapter number or title to search the Policy Book structure.
      </div>
    `;
    return;
  }

  const matches = POLICY_CHAPTERS.filter((chapter) => {
    const haystack = `${chapter.code} ${chapter.title}`.toLowerCase();
    return haystack.includes(query);
  });

  if (!matches.length) {
    results.innerHTML = `
      <div class="content-box">
        No matching chapter found for: <strong>${escapeHtml(query)}</strong>
      </div>
    `;
    return;
  }

  results.innerHTML = matches.map((chapter) => `
    <div class="result-item" data-result-code="${escapeHtml(chapter.code)}">
      <div class="result-title">Chapter ${escapeHtml(chapter.code)} - ${escapeHtml(chapter.title)}</div>
      <div class="result-text">Click to open this chapter in the Policy Book tab.</div>
    </div>
  `).join("");

  results.querySelectorAll("[data-result-code]").forEach((item) => {
    item.addEventListener("click", () => {
      const code = item.getAttribute("data-result-code");
      selectChapter(code);

      const tabBtn = document.querySelector('[data-tab="policyBook"]');
      if (tabBtn) tabBtn.click();
    });
  });
}

function setupSearch() {
  const searchBtn = document.getElementById("searchBtn");
  const clearBtn = document.getElementById("clearSearchBtn");
  const input = document.getElementById("searchInput");

  if (searchBtn) searchBtn.addEventListener("click", runSearch);

  if (input) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runSearch();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (input) input.value = "";
      runSearch();
    });
  }

  runSearch();
}

function setupPlaceholderButtons() {
  const changeBtn = document.getElementById("submitChangeRequestBtn");
  const editBtn = document.getElementById("editDraftBtn");

  if (changeBtn) {
    changeBtn.addEventListener("click", () => {
      const chapter = findChapter(selectedChapterCode);
      const label = chapter ? `Chapter ${chapter.code} - ${chapter.title}` : "the selected chapter";
      showOk(`Change request workflow will be added later for ${label}.`);
    });
  }

  if (editBtn) {
    editBtn.addEventListener("click", () => {
      showOk("Draft editing will be added after the database/versioning phase.");
    });
  }
}

async function setupAuth() {
  if (!window.AUTH?.setupAuthButtons) {
    showWarn("AUTH helper not available. Login controls may not work.");
    return null;
  }

  const bundle = await AUTH.setupAuthButtons({
    badgeId: "userBadge",
    loginBtnId: "loginBtn",
    logoutBtnId: "logoutBtn",
    switchBtnId: "switchUserBtn"
  });

  if (!bundle?.session?.user) {
    showWarn("You are logged out. Login will be required before this module becomes rights-controlled.");
    return bundle;
  }

  showWarn("");
  return bundle;
}

async function init() {
  try {
    await setupAuth();
    setupTabs();
    renderChapterList();
    renderSelectedChapter();
    setupSearch();
    setupPlaceholderButtons();
  } catch (error) {
    showWarn(String(error?.message || error));
  }
}

document.addEventListener("DOMContentLoaded", init);