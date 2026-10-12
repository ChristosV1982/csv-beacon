# Omega dashboard preview review

## Outcome

Authenticated dashboard testing is blocked until a non-production test account
and isolated data source are confirmed. The preview's authentication and
branding configuration identify its backend environment as production. No
credentials were used, no login was attempted, no authenticated requests or
dashboard actions were made, and no production data was changed.

## Static branding review

- The dashboard references the approved Omega header logo asset.
- The approved brand colors are navy `#001840` and orange `#F86000`.
- The header markup contains the logo and no subtitle.
- The desktop Omega logo rule specifies a compact 210 x 38 pixel image box.
- Desktop and mobile screenshots could not be captured in an authenticated
  session because safe data isolation is not established.

## Regression found

At viewport widths of 560 pixels or less, the shared mobile stylesheet applies
`width: 34px` and `height: 34px` with `!important` to `.csvb-brand-logo`.
That overrides the Omega-specific wide logo dimensions. Since the approved
header asset is a horizontal wordmark, it will be scaled to fit a square box,
making the logo/wordmark much smaller than intended on narrow mobile screens.
This was identified from the CSS cascade; it was not visually exercised.

## Behavior and navigation review

Source inspection shows the dashboard retains its existing page links and
role/module visibility branches. Authenticated module visibility and controls
were not exercised: doing so would require authentication and production-backed
authorization/module queries. Treat their runtime behavior as unverified until
the preview has a confirmed non-production account and data source.
