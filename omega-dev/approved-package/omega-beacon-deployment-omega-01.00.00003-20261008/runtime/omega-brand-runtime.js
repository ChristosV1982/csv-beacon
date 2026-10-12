/*
 * Omega Beacon deployment runtime profile
 *
 * This file belongs to the Omega deployment package.
 * It is NOT part of the shared C.S.V. Beacon core application.
 *
 * The shared application must remain fully operational if this
 * deployment-specific override is absent.
 */

(function () {
  "use strict";

  window.CSVB_BRAND_OVERRIDE = Object.freeze({
    key: "omega-beacon",

    productName: "Omega Beacon",
    productNameUpper: "OMEGA BEACON",

    subtitle: "Marine Assurance & Compliance Platform",

    assets: Object.freeze({
      icon: "./assets/omega/icons/icon.png",
      logo: "./assets/omega/logo-full.png",
      logoFull: "./assets/omega/logo-full.png",
      logoHeader: "./assets/omega/logo-header.png",
      favicon: "./assets/omega/icons/favicon.ico",
      pwa192: "./assets/omega/icons/pwa-192.png",
      pwa512: "./assets/omega/icons/pwa-512.png"
    }),

    colors: Object.freeze({
      primaryNavy: "#001840",
      primaryOrange: "#F86000"
    }),

    pwa: Object.freeze({
      name: "Omega Beacon",
      shortName: "Omega Beacon"
    }),

    support: Object.freeze({
      email: "support@omegabeacon.app",
      systemSenderName: "Omega Beacon",
      systemSenderEmail: "noreply@omegabeacon.app"
    }),

    deployment: Object.freeze({
      environment: "production",
      primaryDomain: "omegabeacon.app"
    }),

    metadata: Object.freeze({
      profileType: "deployment-override",
      deploymentBrand: "Omega Beacon",
      packageVersion: "01.00.00003"
    })
  });
})();
