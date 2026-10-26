---
name: Fleet Vetting Experience boundaries
description: Limited fleet awareness, separate prevention workflows, and immutable target-specific vessel response/evidence boundaries.
---

SIRE 2.0 – Fleet Vetting Experience permits authorized vessel users to read their company's fleet-wide historical negative findings, not just their own vessel's findings. This is a deliberately limited awareness projection, not permission to open another vessel's full Post-Inspection report.

**Why:** The user explicitly requested fleet lessons for vessel/office awareness while prohibiting disclosure of report references, ranks/PIFs/SOC/NOC, responses, officer names, workflow and other Post-Inspection metadata in the observation cards.

**How to apply:** Keep the historical projection limited to Vessel, Inspection Date, Oil Major, Category/Designation and full Observation text. Company selection is not authorization. Preserve other modules' existing own-vessel access boundaries.

Display each physical finding once, regardless of the company Per finding / Per PIF policy. Multiple findings on the same question remain separate; several PIFs attached to one Human finding never duplicate the displayed row.

**Why:** The user explicitly separated awareness recurrence counts from weighted/effective observation counting.

**How to apply:** Reuse the existing question library and live observation references, not copied library/findings tables. Keep module-wide history filters when navigating between questions. Future Office/Vessel actions and evidence must be separate from the original inspection/OCIMF responses.

Office prevention instructions are a separate company-scoped awareness workflow, never OCIMF Preventative Action, manual subcomments, imported comment rounds or Post-Inspection workflow data.

**Why:** The user explicitly requires a separate prevention layer and future per-vessel responses, without modifying inspection records.

**How to apply:** Future vessel responses/evidence attach to stable action-target identities. “All company vessels” resolves active vessels at issue time; issued targets remain fixed. Issued office instruction/due-date edits retain the original issue timestamp and are revisioned/audited.

Vessel-facing awareness payloads must not expose the underlying Post-Inspection observation UUIDs or the full fleet target list.

**Why:** Limited fleet awareness is not permission to navigate into other vessels' full inspection records; identifiers must not become an unintended route into those records.

**How to apply:** Return only targeted Issued action content to vessels. Drafts, untargeted actions and office editing remain server-enforced restrictions. Preserve source snapshots and block destructive replacement while an action references a finding.

Vessel responses belong to a specific vessel target, not just the source finding. Submitted text and its evidence are immutable; a return permits a new response version. Office return/review messages stay separate. Parent Draft/Issued status is independent from target workflow status.

**Why:** The user requires chronological, auditable submissions without rewriting the original inspection or previous responses.

**How to apply:** Preserve prior submissions and files when adding revisions. Apply the five-file maximum and 10 MB **combined** limit per submission, not per file. Keep evidence private and downloads short-lived; onboard/disembarkation restrictions remain authoritative.

Office may delete clean Draft or pristine pending Issued actions, including unsubmitted drafts/files. The initial issue event alone does not prohibit deletion; any submitted response, review/return/close history, or progressed target does. Vessels may delete only their own current unsubmitted draft, including a new draft after Return, without changing earlier submissions.

**Why:** The user explicitly requested safe deletion without archival/cancellation of historical submitted actions or loss of audit history.

**How to apply:** Keep deletion server-authorized and confirmed. Storage is outside the database transaction: freeze the scope, clean temporary objects, then finalize relational deletion atomically. A failed cleanup must remain resumable, not re-enable mutations or delete submitted history.

Validate evidence authorization through the real Storage API as well as SQL tests.

**Why:** Storage performs preliminary and completed-upload authorization with different metadata shapes; SQL-only object fixtures did not exercise that preliminary path.

**How to apply:** Retain real authenticated upload/download and concurrent-quota tests when changing evidence policies; never bypass final actual-size validation to make an upload preflight pass.
