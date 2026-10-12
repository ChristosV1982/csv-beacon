# Omega Beacon development instance

This is a separate Replit workflow for the approved Omega Beacon development
profile (`01.00.00003`). It serves the existing `public/` application as a
read-only source and applies Omega-only response overlays; it does not copy or
edit active C.S.V. Beacon files. Authentication and data access use the same
application client configuration as the current C.S.V. development instance.

The uploaded approved package is preserved under `approved-package/`. Its
runtime expects branding assets at `/assets/omega/...`, which this server maps
directly to the package. No service-role credential is used by this server.
Service-worker registration and service-worker requests are disabled for this
instance.

Run with `node omega-dev/server.js` on port 5000. Open `/login.html` for the
Omega login and `/q-dashboard.html` for the normal authenticated application
shell.
