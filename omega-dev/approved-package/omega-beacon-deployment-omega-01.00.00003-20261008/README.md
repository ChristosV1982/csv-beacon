# Omega Beacon Deployment Package

This package contains Omega Beacon deployment-specific configuration and assets.

It is separate from the shared C.S.V. Beacon application codebase.

## Important rules

- Do not rename internal `csvb_*` or `CSVB_*` technical identifiers.
- Do not modify the shared application merely to store Omega-specific assets.
- Omega branding is activated only through an explicit deployment configuration.
- If Omega branding cannot be loaded, the shared application must remain operational using the C.S.V. Beacon fallback.
- Changes to this package are controlled release content.
- The package version format is `xx.yy.ddddd`.

## Current status

Approved branding package version `01.00.00003`.

The package is not yet connected to any application deployment and has not been released to Omega Beacon production.
