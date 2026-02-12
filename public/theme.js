(function () {
  const STORAGE_KEY = "tekmerion.theme"; // system | light | dark

  function applyTheme(mode) {
    const root = document.documentElement;

    if (mode === "dark") {
      root.setAttribute("data-theme", "dark");
      return;
    }
    if (mode === "light") {
      root.removeAttribute("data-theme");
      return;
    }

    // system
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    if (prefersDark) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
  }

  // Apply saved preference on load
  const saved = localStorage.getItem(STORAGE_KEY) || "system";
  applyTheme(saved);

  // Wire dropdown if present
  const select = document.getElementById("themeSelect");
  if (select) {
    select.value = saved;
    select.addEventListener("change", () => {
      const mode = select.value;
      localStorage.setItem(STORAGE_KEY, mode);
      applyTheme(mode);
    });
  }

  // If user chose system, react to OS theme changes
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", () => {
      const current = localStorage.getItem(STORAGE_KEY) || "system";
      if (current === "system") applyTheme("system");
    });
  }
})();
