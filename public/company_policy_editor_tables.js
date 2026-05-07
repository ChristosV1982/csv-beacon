// public/company_policy_editor_tables.js
// C.S.V. BEACON – Company Policy advanced editor tables
// CP-10D: insert and edit policy tables inside the Company Policy rich-text editor.

(() => {
  "use strict";

  const BUILD = "CP10D-2026-05-07";

  let savedRange = null;
  let activeCell = null;
  let activeTable = null;

  function showWarn(message) {
    const el = document.getElementById("warnBox");
    if (!el) {
      alert(message);
      return;
    }

    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  function showOk(message) {
    const el = document.getElementById("okBox");
    if (!el) return;

    el.textContent = message || "";
    el.style.display = message ? "block" : "none";

    if (message) {
      setTimeout(() => {
        el.style.display = "none";
        el.textContent = "";
      }, 2200);
    }
  }

  function editorEl() {
    return document.getElementById("policyEditor");
  }

  function saveSelection() {
    const editor = editorEl();
    const sel = window.getSelection();

    if (!editor || !sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);

    if (editor.contains(range.commonAncestorContainer)) {
      savedRange = range.cloneRange();
    }
  }

  function restoreSelection() {
    const editor = editorEl();
    if (!editor) return;

    editor.focus();

    if (!savedRange) return;

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  function clearActiveTableSelection() {
    if (activeCell) {
      activeCell.classList.remove("policy-table-cell-active");
    }

    if (activeTable) {
      activeTable.classList.remove("policy-table-active");
    }

    activeCell = null;
    activeTable = null;
  }

  function setActiveCell(cell) {
    clearActiveTableSelection();

    if (!cell) return;

    activeCell = cell;
    activeTable = cell.closest("table.policy-table");

    activeCell.classList.add("policy-table-cell-active");

    if (activeTable) {
      activeTable.classList.add("policy-table-active");
    }
  }

  function requireActiveCell() {
    if (!activeCell || !activeTable) {
      throw new Error("Click inside a policy table cell first.");
    }

    return {
      cell: activeCell,
      table: activeTable,
      row: activeCell.closest("tr"),
      cellIndex: activeCell.cellIndex,
    };
  }

  function createCell(tagName, text) {
    const cell = document.createElement(tagName);
    cell.innerHTML = text || "<br>";
    return cell;
  }

  function createPolicyTable(columnCount) {
    const cols = Math.max(1, Math.min(Number(columnCount || 2), 8));

    const table = document.createElement("table");
    table.className = "policy-table";
    table.setAttribute("data-policy-table", "1");

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    for (let i = 0; i < cols; i += 1) {
      headRow.appendChild(createCell("th", `Header ${i + 1}`));
    }

    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    for (let r = 0; r < 2; r += 1) {
      const row = document.createElement("tr");

      for (let c = 0; c < cols; c += 1) {
        row.appendChild(createCell("td", "<br>"));
      }

      tbody.appendChild(row);
    }

    table.appendChild(tbody);

    return table;
  }

  function insertNodeAtCursor(node) {
    const editor = editorEl();

    if (!editor) {
      throw new Error("Policy editor not found.");
    }

    restoreSelection();

    const sel = window.getSelection();

    if (!sel || sel.rangeCount === 0) {
      editor.appendChild(node);
      editor.appendChild(document.createElement("p")).innerHTML = "<br>";
      return;
    }

    const range = sel.getRangeAt(0);
    range.deleteContents();

    range.insertNode(node);

    const spacer = document.createElement("p");
    spacer.innerHTML = "<br>";
    node.after(spacer);

    range.setStartAfter(spacer);
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertTable(columnCount) {
    const table = createPolicyTable(columnCount);
    insertNodeAtCursor(table);

    const firstBodyCell = table.querySelector("tbody td");
    if (firstBodyCell) {
      setActiveCell(firstBodyCell);
      firstBodyCell.focus?.();
    }

    showOk(`${columnCount}-column table inserted.`);
  }

  function rowCellCount(row) {
    return Array.from(row?.children || []).filter((el) => {
      return el.tagName === "TD" || el.tagName === "TH";
    }).length;
  }

  function maxColumnCount(table) {
    const rows = Array.from(table.querySelectorAll("tr"));
    return rows.reduce((max, row) => Math.max(max, rowCellCount(row)), 0);
  }

  function addRowBelow() {
    const { cell, table, row } = requireActiveCell();

    const colCount = Math.max(maxColumnCount(table), rowCellCount(row), 1);
    const newRow = document.createElement("tr");

    for (let i = 0; i < colCount; i += 1) {
      newRow.appendChild(createCell("td", "<br>"));
    }

    const isHeaderRow = row.parentElement?.tagName === "THEAD";

    if (isHeaderRow) {
      let tbody = table.querySelector("tbody");

      if (!tbody) {
        tbody = document.createElement("tbody");
        table.appendChild(tbody);
      }

      tbody.insertBefore(newRow, tbody.firstChild);
    } else {
      row.after(newRow);
    }

    const index = Math.min(cell.cellIndex, newRow.children.length - 1);
    setActiveCell(newRow.children[index]);

    showOk("Table row added.");
  }

  function addColumnRight() {
    const { table, cellIndex } = requireActiveCell();

    const rows = Array.from(table.querySelectorAll("tr"));

    rows.forEach((row) => {
      const isHead = row.parentElement?.tagName === "THEAD";
      const newCell = createCell(isHead ? "th" : "td", isHead ? "Header" : "<br>");

      const reference = row.children[cellIndex + 1];

      if (reference) {
        row.insertBefore(newCell, reference);
      } else {
        row.appendChild(newCell);
      }
    });

    const activeRow = activeCell.closest("tr");
    const nextCell = activeRow?.children[cellIndex + 1];

    if (nextCell) setActiveCell(nextCell);

    showOk("Table column added.");
  }

  function deleteRow() {
    const { table, row } = requireActiveCell();

    const confirmed = window.confirm("Delete the selected table row?");
    if (!confirmed) return;

    const nextCandidate =
      row.nextElementSibling?.querySelector("td,th") ||
      row.previousElementSibling?.querySelector("td,th") ||
      table.querySelector("tbody td, tbody th, thead th, thead td");

    row.remove();

    if (!table.querySelector("tr")) {
      table.remove();
      clearActiveTableSelection();
      showOk("Table removed.");
      return;
    }

    if (nextCandidate && document.body.contains(nextCandidate)) {
      setActiveCell(nextCandidate);
    } else {
      clearActiveTableSelection();
    }

    showOk("Table row deleted.");
  }

  function deleteColumn() {
    const { table, cellIndex } = requireActiveCell();

    const confirmed = window.confirm("Delete the selected table column?");
    if (!confirmed) return;

    const rows = Array.from(table.querySelectorAll("tr"));

    rows.forEach((row) => {
      if (row.children[cellIndex]) {
        row.children[cellIndex].remove();
      }
    });

    const remainingCells = table.querySelectorAll("td,th");

    if (!remainingCells.length) {
      table.remove();
      clearActiveTableSelection();
      showOk("Table removed.");
      return;
    }

    setActiveCell(remainingCells[0]);
    showOk("Table column deleted.");
  }

  function deleteTable() {
    const { table } = requireActiveCell();

    const confirmed = window.confirm("Delete the selected table?");
    if (!confirmed) return;

    table.remove();
    clearActiveTableSelection();

    showOk("Table deleted.");
  }

  function toggleHeaderRow() {
    const { table } = requireActiveCell();

    const existingHead = table.querySelector("thead");
    let tbody = table.querySelector("tbody");

    if (!tbody) {
      tbody = document.createElement("tbody");
      table.appendChild(tbody);
    }

    if (existingHead) {
      const headRows = Array.from(existingHead.querySelectorAll("tr"));

      headRows.reverse().forEach((headRow) => {
        const newRow = document.createElement("tr");

        Array.from(headRow.children).forEach((cell) => {
          const td = document.createElement("td");
          td.innerHTML = cell.innerHTML || "<br>";
          newRow.appendChild(td);
        });

        tbody.insertBefore(newRow, tbody.firstChild);
      });

      existingHead.remove();

      const firstCell = table.querySelector("tbody td");
      if (firstCell) setActiveCell(firstCell);

      showOk("Header row converted to normal row.");
      return;
    }

    const firstBodyRow = tbody.querySelector("tr");

    if (!firstBodyRow) {
      throw new Error("No table row exists to convert to a header row.");
    }

    const thead = document.createElement("thead");
    const newHeadRow = document.createElement("tr");

    Array.from(firstBodyRow.children).forEach((cell) => {
      const th = document.createElement("th");
      th.innerHTML = cell.innerHTML || "<br>";
      newHeadRow.appendChild(th);
    });

    firstBodyRow.remove();
    thead.appendChild(newHeadRow);
    table.insertBefore(thead, table.firstChild);

    const firstCell = table.querySelector("thead th");
    if (firstCell) setActiveCell(firstCell);

    showOk("First row converted to header row.");
  }

  function injectStyles() {
    if (document.getElementById("csvb-policy-editor-table-styles")) return;

    const style = document.createElement("style");
    style.id = "csvb-policy-editor-table-styles";
    style.textContent = `
      .policy-table {
        width: 100%;
        border-collapse: collapse;
        margin: 12px 0;
        background: #fff;
        border: 1px solid #cbd8ea;
      }

      .policy-table th,
      .policy-table td {
        border: 1px solid #cbd8ea;
        padding: 7px 8px;
        min-width: 90px;
        vertical-align: top;
      }

      .policy-table th {
        background: #eaf1fb;
        color: #1a4170;
        font-weight: 700;
      }

      .policy-table td {
        background: #fff;
        color: #10233f;
        font-weight: 400;
      }

      .policy-table-active {
        outline: 2px solid #2f78c4;
        outline-offset: 2px;
      }

      .policy-table-cell-active {
        outline: 3px solid #2f78c4 !important;
        outline-offset: -3px !important;
        background: #f7fbff !important;
      }

      .policy-editor-table-separator {
        width: 1px;
        height: 26px;
        background: #cbd8ea;
        margin: 0 2px;
      }

      @media print {
        .policy-table {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .policy-table th,
        .policy-table td {
          border: 1px solid #9fb2cc;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function makeButton(label, title, handler) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tool-btn";
    btn.textContent = label;
    btn.title = title || label;

    btn.addEventListener("click", async () => {
      try {
        showWarn("");
        await handler();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });

    return btn;
  }

  function injectToolbarButtons() {
    const toolbar = document.querySelector(".editor-toolbar");

    if (!toolbar || document.getElementById("policyInsertTable2Btn")) return;

    const sep = document.createElement("span");
    sep.className = "policy-editor-table-separator";

    const table2 = makeButton("Table 2", "Insert 2-column policy table", () => insertTable(2));
    table2.id = "policyInsertTable2Btn";

    const table3 = makeButton("Table 3", "Insert 3-column policy table", () => insertTable(3));
    const table4 = makeButton("Table 4", "Insert 4-column policy table", () => insertTable(4));

    const addRow = makeButton("Row +", "Add row below selected table cell", addRowBelow);
    const addCol = makeButton("Col +", "Add column right of selected table cell", addColumnRight);

    const delRow = makeButton("Del Row", "Delete selected table row", deleteRow);
    const delCol = makeButton("Del Col", "Delete selected table column", deleteColumn);
    const delTable = makeButton("Del Table", "Delete selected table", deleteTable);

    const header = makeButton("Header Row", "Toggle table header row", toggleHeaderRow);

    [
      sep,
      table2,
      table3,
      table4,
      addRow,
      addCol,
      delRow,
      delCol,
      delTable,
      header,
    ].forEach((el) => toolbar.appendChild(el));
  }

  function wireEditorSelection() {
    const editor = editorEl();

    if (!editor || editor.getAttribute("data-policy-tables-wired") === "1") return;

    editor.setAttribute("data-policy-tables-wired", "1");

    editor.addEventListener("mouseup", saveSelection);
    editor.addEventListener("keyup", saveSelection);
    editor.addEventListener("focus", saveSelection);

    editor.addEventListener("click", (event) => {
      const cell = event.target.closest?.("td,th");
      const table = cell?.closest?.("table.policy-table");

      if (cell && table && editor.contains(table)) {
        setActiveCell(cell);
        return;
      }

      if (!event.target.closest?.("table.policy-table")) {
        clearActiveTableSelection();
      }
    });
  }

  function normalizeExistingTables(root = document) {
    const editor = root.querySelector?.("#policyEditor") || document.getElementById("policyEditor");

    if (!editor) return;

    editor.querySelectorAll("table").forEach((table) => {
      if (!table.classList.contains("policy-table")) {
        table.classList.add("policy-table");
      }

      table.setAttribute("data-policy-table", "1");
    });
  }

  function init() {
    injectStyles();
    injectToolbarButtons();
    wireEditorSelection();
    normalizeExistingTables();

    const observer = new MutationObserver(() => {
      injectToolbarButtons();
      wireEditorSelection();
      normalizeExistingTables();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.CSVB_POLICY_EDITOR_TABLES = {
      build: BUILD,
      insertTable,
      addRowBelow,
      addColumnRight,
      deleteRow,
      deleteColumn,
      deleteTable,
      toggleHeaderRow,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();