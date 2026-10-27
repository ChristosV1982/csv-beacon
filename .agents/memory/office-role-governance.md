---
name: Office role catalogue governance
description: Manual Office identity assignment is separate from pending access-profile enforcement; protected security identities remain unchanged.
---

Office role identity and prepared Access Profile references may now be assigned manually to existing Office accounts by Super Admin. This does not itself activate Access Profile permission enforcement.

**Why:** The user explicitly requested assignment to existing users without recreating Auth accounts. The broader authorization resolver/backend migration is still incomplete.

**How to apply:** Preserve legacy security roles, Auth identity, company/vessel context and audited manual assignment. Keep an explicit access-enforcement-pending warning and confirmation in the editor; never imply that storing a view-only profile has already restricted effective access. New arbitrary catalogue entries remain unassignable until explicitly enabled.

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

**How to apply:** Verify both direct-route visibility and backend RPC/write denial before activating Office/Demo profile enforcement. Preserve the current legacy resolver for all users until that activation; storing role/profile references alone must not be mistaken for effective-access enforcement.

The approved initial configuration for Marine Superintendent, Marine Superintendent - Port Captain, Technical Superintendent, Technical Superintendent - Port Engineer, HSQE Superintendent, DPA, Technical Manager and General Manager is a shared nine-module view-only profile, not the broader legacy Superintendent baseline.

**Why:** The user explicitly restricted these eight organizational roles to View only for SIRE Questions Viewer, Fleet Vetting Experience, Vetting Inspection Planner, Post-Inspection Entry, Post-Inspection Stats, Inspector Intelligence, Mooring & Anchoring, Port Call Intelligence and Portable Lifting. Other modules/actions remain denied unless separately granted later.

**How to apply:** Keep identities distinct and respect later explicit overrides. Technical Manager is a separate Management role; never rename or replace Technical Director. Preparing the mapping does not authorize activation or automatic user reassignment.

Demo User also shares this same approved nine-module view-only profile, while remaining a distinct Demo / Training identity. This replaces the earlier two-module initial Demo proposal as its default mapping.

**Why:** The user explicitly extended the prepared profile to Demo User, denying Edit, Export, Admin, destructive/configuration rights and unlisted modules by default.

**How to apply:** Do not restore the narrower original Demo mapping when operationalizing assignment. Keep the shared profile inactive until the same backend enforcement checks required for Office users pass.
