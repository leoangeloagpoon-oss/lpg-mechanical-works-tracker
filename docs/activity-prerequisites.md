# Activity prerequisites

Prerequisites control readiness separately from recorded installation progress, work status, and inspection results. Activities without prerequisite links are Ready. Existing records are not automatically linked.

## Use

Open an activity and find **Prerequisites**. Search for an activity in the same project, then choose **Whole activity complete** or **Specific riser floor section installed**. Add each requirement and save the activity. Every listed requirement must be satisfied before saving 100% or Complete; partial progress remains allowed.

A whole activity requires 100% progress, Complete status, and resolved prerequisites of its own. A section checks only that section's installation record, even while the rest of its riser is unfinished. The 1st-floor section means 1st to 2nd floor.

For repeated work, select matching records, open **Bulk update**, and choose Append, Replace, Remove selected links, or Clear. Preview the resulting links, progress, status, and readiness before saving. Updates run in batches of up to 100; failed batches retain their remaining queue for retry. Append retries deduplicate links.

The dashboard and activity groups show waiting/review counts. Use the readiness filter or a dashboard count to find affected work. The register shows readiness beside the recorded work status, with missing links and sections available under **View missing prerequisites**.

Upstream corrections are allowed. If a completed activity loses a requirement, its recorded progress and status remain intact and its readiness becomes **Prerequisite changed — review needed**. Unrelated edits remain possible. Restore the prerequisite or reopen the activity below 100% before a new completion. Adding an unmet prerequisite to an already completed activity requires reopening first.

An activity referenced by another activity cannot be deleted until those links are removed. Confirmed whole-project deletion retains its existing cascading behavior.

## Data and safeguards

Optional activity JSON `prerequisites` entries use `{type:"activity", activityId}` or `{type:"riserSection", activityId, sectionStartLevel}`. Missing entries mean an empty list. Floor sections use the existing lower-level identifiers; no table migration is required.

Individual and bulk server endpoints validate ownership, project boundaries, self-links, duplicate links, circular dependencies, section validity, and completion against the proposed final state. Invalid batches save nothing. A project-scoped JSON revision/token serializes activity graph writes inside an atomic D1 batch, preventing concurrent saves from introducing cycles or completing against stale prerequisite state. Project metadata edits preserve this internal guard. Existing invalidated links remain visible for review after corrections.

Inspection acceptance remains separate from installation readiness. No apartment-to-riser assignments are inferred.

## Verification

With the local preview running, run:

```
node scripts/test-model.mjs
node scripts/test-api.mjs
node scripts/test-bulk.mjs
node scripts/test-risers.mjs
node scripts/test-prerequisites.mjs
node node_modules/typescript/bin/tsc --noEmit
```

The tests use disposable local projects and remove them afterward. Coverage includes partial work, all measurement modes, section/whole/transitive requirements, all bulk link actions, atomic rejection, duplicate retries, correction/review/reopening/resolution, deletion protection, concurrent-cycle rejection, and unauthorized or wrong-origin requests. Browser checks cover save messages, errors, readiness filters, bulk preview, and a 390-pixel mobile viewport. Existing repository-wide lint issues predate this feature; the new prerequisite modules and tests pass their lint checks.
