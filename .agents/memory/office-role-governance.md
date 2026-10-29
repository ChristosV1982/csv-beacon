---
name: Office role catalogue governance
description: Office identity is separate from authoritative Access Profile permissions; preserve protected roles, tenancy, legacy fallback and Auth identities.
---

Office Role identifies an organizational position; an assigned Access Profile controls ordinary Office authorization. Personal Deny precedes personal Allow, then the assigned profile. Legacy fallback is allowed only when no Access Profile is assigned.

The user-first Rights Matrix must default to audited personal overrides, never silently changing a shared Access Profile or an account's role/profile assignment. Shared-profile editing is a separate advanced operation with affected-user warning.

**Why:** The user requested simple named-user controls after legacy-role and Access Profile displays produced conflicting expectations. Simplifying the UI must not silently change other users' rights.

**How to apply:** Display saved backend decisions separately from unsaved proposals, re-read diagnostics after writes, and never call a denied or unverified result a successful grant. Preserve protected system constraints and unmigrated/Vessel/Inspector behavior. Baseline differences are a separate policy decision, not an automatic synchronization.

Office Role defaults must not be implemented by merely relabeling a shared Access Profile editor. Role-specific saving must use isolated defaults, preserve personal exceptions and explain every affected user. Never silently change another role through a shared baseline.

**Why:** The user approved controlled role-default enforcement only with preservation of existing effective access, company/vessel boundaries and protected system behavior.

**How to apply:** Separate role defaults, individual exceptions and company availability. Keep technical compatibility editors advanced; require confirmation for role-wide changes. Abort bootstrap on custom/inconsistent assignments instead of silently converting them. Explain explicit custom assignments separately from following role defaults.

**Why:** The user required genuinely enforced view-only profiles without recreating accounts or allowing legacy Company Admin/Superintendent shortcuts to broaden assigned-profile access.

**How to apply:** Preserve legacy security classes, Auth identity, company/vessel scope and audited manual assignment. Fail closed for an inactive assigned profile; never fall back to its broader security class. Show actual backend enforcement state, not a hard-coded pending/enforced label. New catalogue entries remain unassignable until explicitly enabled.

The current Super Admin, Company Admin, Vessel and Inspector categories are protected system roles. Company Superintendent is a protected legacy operational role under review, not an unused role available for deletion.

**Why:** Existing users and backend checks depend on the current role identities.

**How to apply:** Preserve stable codes and existing behavior until an explicitly approved migration replaces those dependencies.

Organizational role identity is separate from reusable Access Profiles. Fleet Manager, DPA, General Manager and Technical Director must not be classified as Superintendent roles merely because permissions may be shared. Marine Coordinator remains a distinct Company Administration category.

**Why:** The user explicitly requires organizational identity to survive shared initial permissions.

**How to apply:** Keep classifications separate from profile bindings in future resolver and Rights Matrix work.

Demo User is a normal organizational demonstration/training identity, not Demo Mode. Manual identity/profile assignment must not introduce a demonstration bypass or infer edit/admin rights.

**Why:** The user explicitly distinguished Demo User from Demo Mode and required conservative defaults.

**How to apply:** Implement future assignment through ordinary account/permission enforcement, not a mode switch.

Prepared access-profile baselines must remain inactive until the backend's ordinary Office module paths use the same permission decision, including legacy role-only helpers. Manual identity/profile storage is permitted with clear legacy-access warnings; a front-end-only resolver is not sufficient for authorization.

**Why:** Legacy Office role shortcuts can grant writes outside the Rights Matrix; mapping a new identity onto an old security role before those checks are aligned would let a view-only profile act with broader privileges.

**How to apply:** Require direct-route, authenticated API/Storage/Edge write-denial and compatibility verification before enabling a resolver in another environment. Preserve legacy behavior only for unmigrated Office users, and preserve Super Admin, Vessel rank and Inspector semantics.

Authorization coverage must use reviewed module/action contracts, not RPC-name heuristics. A reader-looking endpoint can create draft or derived records, and a SECURITY DEFINER or service-role path can bypass browser table policies.

**Why:** A generic endpoint-name classifier can accidentally authorize a write as a View operation, defeating the agreed view-only profiles.

**How to apply:** Verify actual backend effects and scope before admitting an endpoint. Unknown operations must fail closed; candidate decision-engine tests alone are not evidence of end-to-end enforcement.

When one endpoint serves multiple modules, its permission gate must reuse the business handler's exact discriminator normalization and field precedence.

**Why:** A RightShip alias can select RISQ even without containing the string “RISQ”; independent substring matching at the permission boundary can authorize the wrong module.

**How to apply:** Reuse the canonical normalizer and test aliases and conflicting selector fields, not only the usual module labels.

The approved initial configuration for Marine Superintendent, Marine Superintendent - Port Captain, Technical Superintendent, Technical Superintendent - Port Engineer, HSQE Superintendent, DPA, Technical Manager and General Manager is a shared view-only profile, not the broader legacy Superintendent baseline. It includes the original nine modules plus the subsequently approved M02 Office View default.

**Why:** The user explicitly restricted these eight organizational roles to View only for SIRE Questions Viewer, Fleet Vetting Experience, Vetting Inspection Planner, Post-Inspection Entry, Post-Inspection Stats, Inspector Intelligence, Mooring & Anchoring, Port Call Intelligence and Portable Lifting. Other modules/actions remain denied unless separately granted later.

**How to apply:** Keep identities distinct and respect later explicit overrides. Technical Manager is a separate Management role; never rename or replace Technical Director. Preparing the mapping does not authorize activation or automatic user reassignment.

Demo User also shares this same approved view-only profile (original nine modules plus M02), while remaining a distinct Demo / Training identity. This replaces the earlier two-module initial Demo proposal as its default mapping.

**Why:** The user explicitly extended the prepared profile to Demo User, denying Edit, Export, Admin, destructive/configuration rights and unlisted modules by default.

**How to apply:** Do not restore the narrower original Demo mapping. Demo shares the same enforced profile and ordinary override rules as the approved view-only Office roles; it never receives an authorization bypass.

The user later approved M02 View by default for all Office users, including Demo and unmigrated legacy users; see [M02 scope](m02-company-form-scope.md). This does not authorize broad M02 Edit/Export/Admin or changes to other modules.

## Account activation is separate from permission activation

Never activate a new view-only account through a broader legacy security class while profile enforcement is unavailable. Once enforcement is active, new accounts may use their ordinary configured active/reset flow. Activating a resolver must not automatically unlock, unban or reassign existing accounts.

**Why:** A prepared role/profile label is not authorization. Activating a new Demo or View-only Office account through Superintendent permissions would contradict the agreed restrictions.

**How to apply:** Use authoritative enforcement readiness during creation. If unavailable, show the locked/prepared outcome and require confirmation. Existing account-status changes remain an explicit, separate administration decision.

Legacy role defaults may contain multiple rows for the same permission when Position is NULL. Audit duplicates before copying a baseline; identical defaults may be deduplicated for the copy, but conflicting grants must not be combined into a broader grant.

**Why:** Nullable-position uniqueness allowed duplicate legacy defaults; a direct baseline UPSERT failed because the same permission was inserted twice.

**How to apply:** Check for conflicting default rows before rebuilding reusable profiles. Preserve audited permission meaning rather than treating every legacy row as a distinct grant.
