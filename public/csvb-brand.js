/*
 * C.S.V. BEACON
 * Safe branding accessor foundation
 *
 * IMPORTANT:
 * - This helper is currently inactive unless explicitly loaded and used.
 * - It must never prevent C.S.V. BEACON from operating.
 * - If no valid branding override exists, the current C.S.V. BEACON
 *   identity is returned.
 */

(function () {
  "use strict";

  const HARD_FALLBACK = Object.freeze({
    key: "csv-beacon",

    productName: "C.S.V. Beacon",
    productNameUpper: "C.S.V. BEACON",

    subtitle: "Marine Assurance & Compliance Platform",

    assets: Object.freeze({
      icon: "./assets/csv-beacon-icon.png",
      logo: "./assets/csv-beacon-logo.png",
      logoFull: "./assets/csv-beacon-logo-full.png",
      favicon: "./favicon.ico"
    }),

    pwa: Object.freeze({
      name: "C.S.V. BEACON",
      shortName: "C.S.V. BEACON"
    }),

    support: Object.freeze({
      email: ""
    }),

    metadata: Object.freeze({
      profileType: "fallback",
      deploymentBrand: "C.S.V. Beacon"
    })
  });

  function isPlainObject(value) {
    return !!value &&
      typeof value === "object" &&
      !Array.isArray(value);
  }

  function getDefaultBrand() {
    if (isPlainObject(window.CSVB_BRAND_DEFAULT)) {
      return window.CSVB_BRAND_DEFAULT;
    }

    return HARD_FALLBACK;
  }

  function getBrand() {
    /*
     * Step 1 deliberately returns only the existing C.S.V. BEACON
     * default/fallback profile.
     *
     * Deployment-specific overrides will be introduced only in a later,
     * separately verified step.
     */
    return getDefaultBrand();
  }

  function get(path, fallbackValue) {
    const parts = String(path || "")
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);

    let current = getBrand();

    for (const part of parts) {
      if (!isPlainObject(current) && typeof current !== "object") {
        return fallbackValue;
      }

      if (current == null ||
          !Object.prototype.hasOwnProperty.call(current, part)) {
        return fallbackValue;
      }

      current = current[part];
    }

    return current === undefined ? fallbackValue : current;
  }

  window.CSVB_BRAND = Object.freeze({
    getBrand,
    get,
    getDefaultBrand
  });
})();
