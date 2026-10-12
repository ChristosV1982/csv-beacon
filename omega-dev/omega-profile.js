(function () {
  "use strict";

  const productPattern = /C\.S\.V\.?\s+BEACON/gi;

  function replaceBrand(value) {
    return String(value || "").replace(productPattern, (match) =>
      match === match.toUpperCase() ? "OMEGA BEACON" : "Omega Beacon"
    );
  }

  function applyOmegaProfile(root) {
    if (!root) return;

    if (document.title) {
      document.title = replaceBrand(document.title);
    }

    root.querySelectorAll?.(
      ".csvb-brand-title, .csvb-login-brand-main"
    ).forEach((element) => {
      element.textContent = "OMEGA BEACON";
    });

    root.querySelectorAll?.(".csvb-brand-subtitle").forEach((element) => {
      element.hidden = true;
    });

    root.querySelectorAll?.("[alt], [aria-label], [title]").forEach((element) => {
      for (const attribute of ["alt", "aria-label", "title"]) {
        const value = element.getAttribute(attribute);
        if (value && productPattern.test(value)) {
          productPattern.lastIndex = 0;
          element.setAttribute(attribute, replaceBrand(value));
        }
        productPattern.lastIndex = 0;
      }
    });

    root.querySelectorAll?.('a[href^="mailto:"]').forEach((link) => {
      if (/support|csv/i.test(link.getAttribute("href") || "")) {
        link.href = "mailto:support@omegabeacon.app";
        if (/support|@/i.test(link.textContent || "")) {
          link.textContent = "support@omegabeacon.app";
        }
      }
    });
  }

  function disableServiceWorkers() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      )
      .catch(() => {});
  }

  function start() {
    applyOmegaProfile(document);
    disableServiceWorkers();

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData" && record.target.parentElement) {
          const parent = record.target.parentElement;
          if (!["SCRIPT", "STYLE", "TEXTAREA"].includes(parent.tagName)) {
            const updated = replaceBrand(record.target.nodeValue);
            if (updated !== record.target.nodeValue) {
              record.target.nodeValue = updated;
            }
          }
        }

        record.addedNodes?.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            applyOmegaProfile(node);
          } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            const parent = node.parentElement;
            if (!["SCRIPT", "STYLE", "TEXTAREA"].includes(parent.tagName)) {
              node.nodeValue = replaceBrand(node.nodeValue);
            }
          }
        });
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
