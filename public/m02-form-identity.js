(function () {
  "use strict";

  // Authoritative controlled Company form identity supplied by the user.
  // Future print/PDF/export footers must reuse this configuration/reference.
  // This is separate from software builds, SIRE library versions and report dates.
  const identity = {
    code: "M02",
    name: "Ship Inspection Report",
    version: "09",
    revisionDate: "23.06.2026"
  };
  window.CSVB_M02_FORM_IDENTITY = Object.freeze({
    ...identity,
    reference: `${identity.code} · ${identity.name} · Version ${identity.version} · ${identity.revisionDate}`
  });
  document.querySelectorAll("[data-m02-form-reference]").forEach((footer) => {
    footer.textContent = window.CSVB_M02_FORM_IDENTITY.reference;
  });
})();
