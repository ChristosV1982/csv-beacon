console.log("[Post-Inspection] JS loaded clean test");

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("importPdfBtn");
  const fileInput = document.getElementById("importPdfFile");

  if (!btn || !fileInput) {
    console.error("Import PDF elements not found in DOM");
    return;
  }

  btn.addEventListener("click", () => {
    console.log("Import PDF button clicked");
    fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    console.log("Selected file:", f.name);
  });
});
