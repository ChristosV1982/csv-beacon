// Isolated Omega preview: do not register the copied application service worker.

(() => {
  "use strict";

  const previewScope = new URL("./", window.location.href);
  const status = {
    build: "OMEGA-VISUAL-PREVIEW-NO-SERVICE-WORKER",
    supported: "serviceWorker" in navigator,
    registered: false,
    controlled: !!navigator.serviceWorker?.controller,
    scope: previewScope.href,
    error: "",
  };

  window.CSVB_SW_STATUS = status;
  window.CSVB_SW_REGISTER = {
    BUILD: status.build,
    status,
    start: async () => {
      if (!navigator.serviceWorker?.getRegistrations) return status;
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations
        .filter((registration) => {
          const scope = new URL(registration.scope);
          return scope.origin === previewScope.origin && scope.pathname === previewScope.pathname;
        })
        .map((registration) => registration.unregister()));
      status.controlled = !!navigator.serviceWorker.controller;
      return status;
    },
  };

  window.CSVB_SW_REGISTER.start().catch((error) => {
    status.error = String(error?.message || error || "Preview service-worker cleanup failed.");
  });
})();
