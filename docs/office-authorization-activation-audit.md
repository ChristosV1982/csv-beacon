# Office authorization activation audit

## Current state

The candidate decision engine and audited configuration/override RPCs are staged.
**Live enforcement is not activated.** No users are reassigned or unlocked.
The existing effective-permissions RPC, module guard and legacy authorization
remain authoritative until the backend coverage below is complete.

Do not flip `csvb_office_authorization_state.enforcement_enabled` merely because
the candidate resolver tests pass. Those tests validate permission resolution,
not end-to-end enforcement.

## Confirmed activation blockers

- `is_admin_user()` and `is_admin_role()` still recognize the legacy Company
  Admin/Superintendent security classes without consulting the assigned profile.
- `mai_has_permission()` has an Office branch based on `app_role_permissions`.
- `pla_current_user_can()` allows the legacy Office roles before normal
  per-action permission resolution.
- Hundreds of public SECURITY DEFINER RPCs have vessel-only guards and private
  implementations. An Office profile check must cover their ordinary read/write
  entry points without changing protected administration or vessel behavior.
- Public views and table/storage policies must be audited together. A route
  guard or restrictive browser-table policy alone cannot constrain owner-executed
  views, SECURITY DEFINER RPCs or service-role Edge Functions.
- Hosted `import-post-inspection-pdf`, `suggest-post-inspection-mscat`,
  `backfill-post-inspection-mscat-ai` and `backfill-audit-observations-mscat-ai`
  use privileged backend access following legacy role checks. Gate the caller's
  module/action before privileged work and preserve each deployed implementation.
- Viewer AI/search endpoints and protected administration endpoints also need
  explicit classification; do not infer authorization from endpoint names.
- Rights Matrix profile editing, named-user override/diagnostic UI, directory
  enforcement labels and creation/activation logic still require integration.

## Safe next implementation sequence

1. Use an explicit, reviewed endpoint/module/action inventory, including shared
   data readers. Do not classify unknown RPCs as reads or rely on naming regexes.
2. Add Office decisions at backend entry points, retaining the existing company,
   permitted-vessel, ownership and hard-system checks.
3. Gate privileged Edge operations and Storage access. Verify denied writes with
   actual authenticated REST calls, not only candidate-decision queries.
4. Wire the existing effective-permission RPC and frontend actions to the same
   result; integrate profile/override management and diagnostic source labels.
5. Run all requested role, scope, direct-route, export and backend-write tests.
6. Activate prepared profiles and enforcement atomically only after coverage
   passes. Do not automatically reassign users or unban locked accounts.
