(function () {
  "use strict";

  function applyOmegaLogin() {
    if (!window.CSVB_BRAND) {
      console.error("Omega Login: CSVB_BRAND helper unavailable.");
      return;
    }

    const brand = window.CSVB_BRAND.getBrand();

    if (!brand || brand.key !== "omega-beacon") {
      console.error("Omega Login: Omega brand profile not resolved.");
      return;
    }

    const orange = brand.colors.primaryOrange || "#F86000";

    document.documentElement.style.setProperty(
      "--brand-navy",
      brand.colors.primaryNavy || "#001840"
    );

    document.documentElement.style.setProperty(
      "--brand-navy-dark",
      "#000D24"
    );

    document.documentElement.style.setProperty(
      "--brand-gold",
      orange
    );

    document.documentElement.style.setProperty(
      "--btn-primary-bg",
      orange
    );

    document.documentElement.style.setProperty(
      "--btn-primary-bg-hover",
      "#D95100"
    );

    document.title = brand.productName + " | Login";

    const hero = document.querySelector(".csvb-login-brand-hero");

    if (hero) {
      hero.setAttribute("aria-label", brand.productNameUpper);

      /*
       * Omega-specific lockup dimensions.
       * Inline !important values deliberately override the legacy
       * C.S.V. login design-system sizing without modifying core CSS.
       */
      hero.style.setProperty(
        "grid-template-columns",
        "185px minmax(0, 1fr)",
        "important"
      );

      hero.style.setProperty(
        "column-gap",
        "20px",
        "important"
      );
    }

    const heroIcon = document.querySelector(".csvb-login-brand-icon");

    if (heroIcon) {
      heroIcon.src = "./assets/omega/icons/login-emblem.png";
      heroIcon.alt = brand.productName + " emblem";

      heroIcon.style.setProperty("width", "185px", "important");
      heroIcon.style.setProperty("max-width", "185px", "important");
      heroIcon.style.setProperty("height", "auto", "important");
      heroIcon.style.setProperty("flex", "0 0 185px", "important");
    }

    const brandMain = document.querySelector(".csvb-login-brand-main");

    if (brandMain) {
      brandMain.textContent = brand.productNameUpper;
    }

    const brandSubline =
      document.querySelector(".csvb-login-brand-subline");

    if (brandSubline) {
      brandSubline.textContent = brand.subtitle;
    }

    const title = document.querySelector(".title");

    if (title) {
      title.textContent = brand.productName + " Login";
    }

    const subtitle = document.querySelector(".subtitle");

    if (subtitle) {
      subtitle.innerHTML =
        'Marine Assurance &amp; Compliance Platform<br/>' +
        'Users login with <b>Username + Password</b>.<br/>' +
        '<div class="build" id="buildTag">' +
        'Omega Beacon 01.00.00003 | Core 01.00.00002' +
        '</div>';
    }

    const hint = document.querySelector(".hint");

    if (hint) {
      hint.innerHTML =
        'Need assistance? ' +
        '<a href="mailto:support@omegabeacon.app">' +
        'support@omegabeacon.app' +
        '</a>';
    }

    const favicon =
      document.querySelector('link[rel="icon"]') ||
      document.createElement("link");

    favicon.rel = "icon";
    favicon.href = "./assets/omega/icons/favicon.ico";

    if (!favicon.parentNode) {
      document.head.appendChild(favicon);
    }

    document.body.classList.add("omega-login-active");
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      applyOmegaLogin
    );
  } else {
    applyOmegaLogin();
  }
})();
