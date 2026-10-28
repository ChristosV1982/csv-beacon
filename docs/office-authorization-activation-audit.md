# Office authorization activation audit

## Live development/testing state

Enforcement is **enabled** in the verified development/testing Supabase project.
Eight existing Office assignments report `Enforced`. No existing user was
reassigned, activated, unlocked or unbanned. The Replit app was not published.

Assigned Office profiles use: hard system/company/vessel constraints → personal
Deny → personal Allow → Access Profile. Unassigned Office accounts retain the
legacy resolver. Super Admin, Vessel and Inspector retain their existing paths.

## Enforcement boundaries

- The effective-permission RPC feeds existing dashboard filtering and route guards.
- The PostgREST pre-request hook checks reviewed endpoint/module/action contracts.
  Unknown endpoints fail closed for migrated Office users. Contracts can also
  reuse literal module/action pairs from already-audited public wrappers; names
  and volatility are not used to guess whether an RPC writes.
- Existing restrictive table/view predicates and new restrictive private-storage
  policies use the same Office decision. Existing tenancy restrictions remain.
- Mooring and Portable Lifting permission probes now return authoritative results.
- Seven hosted Edge Functions have a caller-JWT permission gate before privileged
  work. Deployment preserved each hosted implementation and `verify_jwt` setting.
  The deployment helper patches the hosted source rather than shipping unrelated
  local parser changes.
- Legacy role-family identity helpers remain for compatibility and hard security
  checks, but cannot authorize an assigned Office user past these API boundaries.

## Administration/UI

Rights Matrix now offers `Configure` contexts:

1. Role / Rank defaults (existing workspace unchanged).
2. Access Profile: audited profile permission editing.
3. User overrides / Diagnostics: Allow, Deny, Inherited and resolved source.

Users directory reports real enforcement state and flags custom overrides.
Office creation readiness uses the live resolver state, not the existence of a
legacy baseline. Previously locked accounts are deliberately not unlocked.
The nine-module view-only profile contains exactly nine View grants and no
Edit, Export, Admin or Review grants. Company Administrator Access mirrors
current Company Admin role defaults, with global Office scope clipped to company.

## Verification

Before activation, isolated owner-controlled verification subjects exercised
the real JWT/REST boundary without changing existing users' permissions.

- 46 checks passed, including authenticated reader calls; denied writes through
  RPCs, direct table inserts and privileged Edge Functions; storage rejection;
  personal Allow/Deny isolation; company/vessel escape rejection; and cleanup.
- Rollback-only compatibility tests preserved effective permission results for
  legacy Company Admin/Superintendent, Super Admin, Vessel and Inspector.
- Company Administrator profile grants/scopes matched current role defaults.
- Profile save, diagnostic output and audit insertion were tested in rollback.
- 12 authenticated Preview checks passed with no Supabase API errors: six
  Inspection-area modules, three Marine-area modules, all nine view pages,
  hidden editing/CSV/PDF controls, and denied direct editor navigation.
- After activation, directory metadata reported eight enforced assignments.
  Creation options reported live enforcement and no prepared-profile login lock.
- A post-activation Auth fixture with no test-subject membership was enforced;
  a direct report insert and a valid-PDF private-storage upload were denied.
- Viewer AI authorization reuses its business discriminator. RISQ/RightShip
  aliases and conflicting selector fields cannot select an ungranted module.
- All disposable verification accounts and test-subject rows were removed.
- Existing profile rows, vessel rows and legacy role-permission rows were
  byte-for-byte unchanged. Account/profile counts remained 15; vessels remained 20.

## Limits and maintenance

This is not a claim that every historical RPC was manually exercised. Unreviewed
APIs remain denied rather than falling back to a legacy role shortcut. Add a
reviewed contract when admitting a new endpoint.

Application CSV/PDF controls are permission-gated. View access cannot prevent a
user from manually copying or browser-printing information they are allowed to see.
Shared analytics readers remain readers even where historical RPC names include
`export`; their datasets are also required to render the authorized analytics.

Frontend additions are available in Preview but are not published. Backend
activation is in development/testing only. The normal unauthenticated screenshot
shows the sign-in page; signed-in checks used disposable real Auth accounts.

The live regression script is restricted to this development project; use
`--active` to verify an already-activated environment. Existing users are never
reassigned by the test harness.
