# LPG Mechanical Works Tracker

A private project tracker for LPG mechanical installation, built with React, TypeScript, Vinext, Cloudflare Workers, and D1 storage.

## Features

- Projects, floors and areas, activity progress, inspections, and corrective actions.
- Grouped activities: activity type → floor → individual flat, plus a full register.
- Bulk creation with duplicate protection and bulk updates in batches of up to 100.
- Quantity or manual percentage tracking, project averages, overdue work, and blocked work.
- ChatGPT sign-in with owner-scoped server reads and writes.
- Responsive English interface with keyboard controls.

This repository contains application source and database migrations. It does not contain live project records, database exports, production credentials, or the original Sites deployment identity.

## Run locally

Install Node.js 22.13 or later, then run:

```sh
npm run install:ci
npm run dev
```

Open the local URL printed by the server (normally `http://127.0.0.1:5173`). The local development sign-in uses a simulated user and a separate local database. The Vite integration applies the included migrations for local development.

## Checks

```sh
npx tsc --noEmit
node scripts/test-model.mjs
npm run build
```

With the local development server running, run:

```sh
node scripts/test-api.mjs
node scripts/test-bulk.mjs
```

The API tests use disposable local records. Run them only against the local server. `--keep` on the bulk test retains its local fixtures for manual browser checks; the default removes fixtures after testing.

## Main source

| Location | Purpose |
| --- | --- |
| `app/tracker.tsx` | Dashboard, projects, inspection register, individual editors |
| `app/activity-workspace.tsx` | Grouped activities and bulk entry forms |
| `app/activity-tools.ts` | Grouping, generation, bulk validation and retry queue |
| `app/model.ts` | Record types, validation and progress calculations |
| `app/api/records/route.ts` | Authenticated individual record operations |
| `app/api/activities/bulk/route.ts` | Authenticated bulk activity operations |
| `db/` and `drizzle/` | D1 schema and migrations |

## Working with Claude, DeepSeek, or another coding tool

Clone or open this repository in your coding tool and describe the change you need. Start with [the developer handoff](docs/DEVELOPER_HANDOFF.md). All authored source files, dependency locks, and migrations needed for local development are included.

## Deployment

The existing application is hosted privately through Sites. Publishing this source repository does not publish project records or change access to that application. GitHub changes do not automatically deploy to Sites.

The public `.openai/hosting.json` retains the `DB` storage binding but omits the original `project_id`. To update the existing deployment, its owner must use the original private Sites checkout and supported Sites publication workflow. For a new deployment, register a new Sites project and use its returned identity. Other hosting platforms require their own authentication and D1 configuration; authenticated identity headers must come from a trusted gateway.

See [the retained Sites starter guide](docs/SITES_STARTER.md) for runtime details and third-party notices in `vendor/` and `scripts/vite/`.
