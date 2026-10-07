/*
 * C.S.V. BEACON
 * Safe branding accessor foundation
 *
 * IMPORTANT:
 * - C.S.V. BEACON remains the default and hard fallback identity.
 * - Deployment-specific branding is optional.
 * - If an override is absent or invalid, C.S.V. BEACON must continue
 *   operating normally.
 * - Technical identifiers using csvb_* / CSVB_* remain unchanged.
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

    colors: Object.freeze({}),

    pwa: Object.freeze({
      name: "C.S.V. BEACON",
      shortName: "C.S.V. BEACON"
    }),

    support: Object.freeze({
      email: ""
    }),

    deployment: Object.freeze({}),

    metadata: Object.freeze({
      profileType: "fallback",
      deploymentBrand: "C.S.V. Beacon"
    })
  });

  const TOP_LEVEL_OVERRIDE_KEYS = Object.freeze([
    "key",
    "productName",
    "productNameUpper",
    "subtitle",
    "assets",
    "colors",
    "pwa",
    "support",
    "deployment",
    "metadata"
  ]);

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function shallowCopyPlainObject(value) {
    if (!isPlainObject(value)) {
      return {};
    }

    return { ...value };
  }

  function cloneBrandProfile(profile) {
    const source = isPlainObject(profile) ? profile : HARD_FALLBACK;

    return {
      key: source.key,
      productName: source.productName,
      productNameUpper: source.productNameUpper,
      subtitle: source.subtitle,

      assets: shallowCopyPlainObject(source.assets),
      colors: shallowCopyPlainObject(source.colors),
      pwa: shallowCopyPlainObject(source.pwa),
      support: shallowCopyPlainObject(source.support),
      deployment: shallowCopyPlainObject(source.deployment),
      metadata: shallowCopyPlainObject(source.metadata)
    };
  }

  function deepFreezeBrand(profile) {
    const copy = cloneBrandProfile(profile);

    Object.freeze(copy.assets);
    Object.freeze(copy.colors);
    Object.freeze(copy.pwa);
    Object.freeze(copy.support);
    Object.freeze(copy.deployment);
    Object.freeze(copy.metadata);

    return Object.freeze(copy);
  }

  function getDefaultBrand() {
    if (isPlainObject(window.CSVB_BRAND_DEFAULT)) {
      return window.CSVB_BRAND_DEFAULT;
    }

    return HARD_FALLBACK;
  }

  function isValidOverride(value) {
    if (!isPlainObject(value)) {
      return false;
    }

    /*
     * Require a non-empty brand key so random global objects cannot
     * accidentally become deployment branding.
     */
    if (typeof value.key !== "string" || !value.key.trim()) {
      return false;
    }

    return true;
  }

  function mergeNestedObject(baseValue, overrideValue) {
    const base = shallowCopyPlainObject(baseValue);

    if (!isPlainObject(overrideValue)) {
      return base;
    }

    return {
      ...base,
      ...overrideValue
    };
  }

  function mergeBrand(defaultBrand, override) {
    const base = cloneBrandProfile(defaultBrand);

    if (!isValidOverride(override)) {
      return deepFreezeBrand(base);
    }

    for (const key of TOP_LEVEL_OVERRIDE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(override, key)) {
        continue;
      }

      switch (key) {
        case "assets":
        case "colors":
        case "pwa":
        case "support":
        case "deployment":
        case "metadata":
          base[key] = mergeNestedObject(base[key], override[key]);
          break;

        case "key":
        case "productName":
        case "productNameUpper":
        case "subtitle":
          if (typeof override[key] === "string" && override[key].trim()) {
            base[key] = override[key];
          }
          break;

        default:
          break;
      }
    }

    return deepFreezeBrand(base);
  }

  function getBrand() {
    const defaultBrand = getDefaultBrand();

    if (!isValidOverride(window.CSVB_BRAND_OVERRIDE)) {
      return deepFreezeBrand(defaultBrand);
    }

    return mergeBrand(
      defaultBrand,
      window.CSVB_BRAND_OVERRIDE
    );
  }

  function get(path, fallbackValue) {
    const parts = String(path || "")
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);

    let current = getBrand();

    for (const part of parts) {
      if (current == null ||
          (typeof current !== "object" &&
           typeof current !== "function")) {
        return fallbackValue;
      }

      if (!Object.prototype.hasOwnProperty.call(current, part)) {
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
