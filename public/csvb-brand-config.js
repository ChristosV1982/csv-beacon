/*
 * C.S.V. BEACON
 * Branding foundation - default profile
 *
 * IMPORTANT:
 * - This file defines the existing C.S.V. BEACON identity only.
 * - It is intentionally backwards-compatible.
 * - It does not activate Omega Beacon.
 * - Existing application pages do not consume this file yet.
 * - Technical identifiers using csvb_* remain unchanged.
 */

(function () {
  "use strict";

  const DEFAULT_BRAND = Object.freeze({
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
      profileType: "default",
      deploymentBrand: "C.S.V. Beacon"
    })
  });

  /*
   * Expose the default profile without changing any existing application
   * variables, storage keys, authentication logic, permissions or UI.
   */
  window.CSVB_BRAND_DEFAULT = DEFAULT_BRAND;
})();
