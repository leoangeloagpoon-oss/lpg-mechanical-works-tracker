# Developer handoff

## Application structure

This is a Vinext app with a Cloudflare Worker entry point and a D1 binding named `DB`. Records are stored as validated JSON in four tables: projects, activities, inspections, and actions. Owner and relationship columns are stored separately for authorization and links. Schema migrations live in `drizzle/`.

The production authentication layer supplies the signed-in identity through trusted request headers. `app/chatgpt-auth.ts` reads that identity. Every data endpoint checks ownership. Mutation endpoints also require the same request origin. Development sign-in is simulated on loopback and is excluded from production.

## Activity grouping and progress

- Flat activity names use `Floor 01 — Flat 01 — Inlet piping`; grouping derives the task and flat label without replacing record IDs.
- Names matching `Riser R01 — …` appear under Riser installation. Other names remain their own groups.
- Filters apply before grouping and selection; changing filters clears selection.
- Project progress is the equal-weight average of activity progress. Quantity progress uses completed/planned; manual progress uses its percentage.
- Inspection outcomes are separate from installation progress. Preserve earlier inspections when recording reinspections.
- The bulk add form prefills the specified floor counts when a project is named `G+16+Roof`: floor 1 has 19 flats, floors 2–10 have 22, floors 11–16 have 7, and floor 17 has 4. These are editable defaults, not live records.

## Bulk saves

`POST /api/activities/bulk` accepts one project and one of two operations:

- `create`: up to 100 `{name, area}` entries. The server supplies manual progress defaults and skips existing matches by owner, project, normalized activity name, and area.
- `update`: up to 100 IDs plus a patch containing percentage, status, responsible person, planned start, or planned finish. Every ID must belong to the current owner and selected project.

Each request validates before its database batch. The browser saves larger selections in batches, keeps the failed batch pending, and retries remaining work. Updates use absolute values. Creation checks duplicates in the insertion transaction so an uncertain request can be retried safely.

## Suggested change workflow

1. Install dependencies and run the local development server.
2. Use local records to reproduce the requested behavior.
3. Preserve record IDs, inspection relationships, ownership checks, and quantity/date validation.
4. Run type checks, relevant model/API tests, and a production build.
5. Check affected screens at desktop and phone sizes, then publish source changes to GitHub.
6. Hand tested changes to the owner for publication through Sites. This repository is not configured to deploy automatically.

The public snapshot has a fresh history and no original Sites project identity, credentials, database contents, local caches, or generated deployment bundle.

## Riser floor tracking

Activities may use `mode: 'floor'` and optional `riser` metadata containing `startLevel`, `endLevel`, and `installedSections`. Levels 1–17 are floors; level 18 is the roof above the 17th floor. An installed section is identified by its lower level, so sections `[1, 2]` describe installation from the 1st to the 3rd floor.

Progress is the number of unique installed sections divided by the number of planned sections. Every section has equal weight, and percentages are displayed to one decimal place. A null installed-section list means that the installed range has not been recorded; planned-route metadata can be attached without replacing existing manual progress.

The bulk update patch supports `riserRoute: {startLevel, endLevel}` and `floorRange: {from, to, installed}`. Installed ranges are added as a set, and correction ranges remove only the specified sections. Repeated requests are idempotent. Every range must fit every selected riser's route; invalid mixed-route requests fail before any updates. Route shortening cannot silently discard installed sections. Existing nonzero progress without floor details must be reconciled in the individual editor before bulk conversion.

`node scripts/test-risers.mjs` exercises calculations, unknown ranges, separate installation ranges, corrections, persistence, stable IDs, inspection links, access controls, and mixed-route validation using disposable local records.