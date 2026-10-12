// public/csvb-toast-messages.js
// C.S.V. BEACON – Workspace toast messages
// Reusable across modules.

(() => {
  "use strict";

  const BUILD = "CSVB-TOAST-20260511-1";

  function ensureToast() {
    let host = document.getElementById("csvbToastHost");

    if (host) return host;

    const style = document.createElement("style");
    style.id = "csvbToastStyles";
    style.textContent = `
      #csvbToastHost {
        position: fixed;
        left: 50%;
        top: 55%;
        transform: translate(-50%, -50%);
        z-index: 999999;
        width: min(720px, calc(100vw - 32px));
        pointer-events: none;
        display: none;
      }

      .csvb-toast {
        pointer-events: auto;
        border-radius: 16px;
        padding: 14px 16px;
        box-shadow: 0 18px 50px rgba(0, 0, 0, .22);
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: .95rem;
        line-height: 1.4;
        font-weight: 700;
        border: 1px solid rgba(255,255,255,.55);
      }

      .csvb-toast-ok {
        background: #ecfff2;
        color: #11612b;
        border-color: #bce9c9;
      }

      .csvb-toast-warn {
        background: #fff2f2;
        color: #9b1c1c;
        border-color: #f2bcbc;
      }

      .csvb-toast-info {
        background: #eef6ff;
        color: #062a5e;
        border-color: #bcd7f3;
      }

      .csvb-toast-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }

      .csvb-toast-close {
        border: 0;
        background: transparent;
        color: inherit;
        font-weight: 900;
        cursor: pointer;
        font-size: 1.1rem;
        line-height: 1;
      }
    `;

    document.head.appendChild(style);

    host = document.createElement("div");
    host.id = "csvbToastHost";
    document.body.appendChild(host);

    return host;
  }

  function show(type, message, timeoutMs = 4500) {
    const host = ensureToast();

    const cleanType = type === "ok" || type === "warn" || type === "info" ? type : "info";

    host.innerHTML = `
      <div class="csvb-toast csvb-toast-${cleanType}">
        <div class="csvb-toast-head">
          <div>${escapeHtml(message || "")}</div>
          <button class="csvb-toast-close" type="button" aria-label="Close">×</button>
        </div>
      </div>
    `;

    host.style.display = message ? "block" : "none";

    host.querySelector(".csvb-toast-close")?.addEventListener("click", () => {
      host.style.display = "none";
      host.innerHTML = "";
    });

    if (timeoutMs > 0) {
      window.clearTimeout(host._csvbTimer);
      host._csvbTimer = window.setTimeout(() => {
        host.style.display = "none";
        host.innerHTML = "";
      }, timeoutMs);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function observeLegacyBoxes() {
    const map = [
      ["okBox", "ok"],
      ["warnBox", "warn"]
    ];

    map.forEach(([id, type]) => {
      const box = document.getElementById(id);
      if (!box) return;

      const observer = new MutationObserver(() => {
        const msg = (box.textContent || "").trim();
        if (msg) {
          show(type, msg);
          box.style.display = "none";
        }
      });

      observer.observe(box, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["style", "class"]
      });

      const existing = (box.textContent || "").trim();
      if (existing) {
        show(type, existing);
        box.style.display = "none";
      }
    });
  }

  function init() {
    window.CSVBToast = {
      build: BUILD,
      show
    };

    ensureToast();
    observeLegacyBoxes();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();