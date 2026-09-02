# CMCG CRM — Engineering Handoff

## Goal

Track CMCG click-to-WhatsApp advertising from Meta-reported spend and conversations to appointments, center visits, registrations, ad performance, and sales-agent quality.

## Architecture

- Node.js built-in HTTP server in `server.js`.
- Plain accessible HTML/CSS/JavaScript under `public/`.
- Storage adapter in `storage.js`.
- Hostinger MySQL/MariaDB via the official `mariadb` connector when `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` are configured.
- Local JSON fallback through `CRM_DATA_FILE` or `data/crm.json`.
- Basic HTTP authentication through `CRM_USER` and `CRM_PASSWORD`.
- Node built-in integration tests under `test/`.

The HTTP server calls `listen()` immediately for Hostinger compatibility, while storage initializes in the background. API requests receive a safe 503 JSON response until storage is ready; database errors are logged without exposing credentials to the browser.

The MySQL implementation stores the current normalized CRM state in `crm_state` and retains the latest 25 pre-write snapshots in `crm_state_backups`. The JSON fallback uses atomic writes and retains the latest 20 file backups.

## Important invariants

- Production must report `storage.persistent === true` from `/api/health`.
- Meta entities are upserted by Account ID, Campaign ID, Ad Set ID, and Ad ID; names are mutable labels and never synchronization keys.
- One imported metric row exists per ad/reporting-start/reporting-end combination. Re-importing updates it.
- All source CSV columns are retained in `dailyLogs[].raw`, while secondary fields and identifiers remain hidden by default in the UI.
- Imported ad sets match active agents only when the complete agent name appears in the ad-set name, case-insensitively. Zero matches remain unassigned and multiple matches remain ambiguous.
- Outcomes are limited to `booked`, `showed`, and `registered`, and can target an ad, ad set, campaign, or agent.
- `showed` means visited without registering. Total visits equal `showed + registered`.
- Creative codes contain at least one letter and one number, use two characters until exhausted, then three, are case-insensitive, immutable, and never reused.
- Unknown creative codes cannot create leads.
- Lost leads require `lostReason`.
- Spend and messages cannot be negative.
- Only one daily log can exist per creative/date combination.
- User-controlled strings rendered into HTML must pass through `escapeHtml`.
- CSV cells beginning with spreadsheet formula characters must be neutralized.
- `data/crm.json`, `data/backups/`, exports, `.env`, and credentials must remain uncommitted.

## API additions

- `GET /api/health` — backend, persistence status, update time, and record counts.
- `GET /api/backup` — authenticated full JSON download.
- `POST /api/restore` — validates and restores a full JSON backup; the storage layer snapshots current data first.
- `POST /api/meta-import` — validates and synchronizes an ad-level Meta Ads CSV.
- `POST /api/outcomes` — records a manually attributed appointment, non-registering visit, or registration.
- `DELETE /api/outcomes/:id` — removes an incorrectly entered outcome.

## Verification

```bash
npm test
node --check server.js
node --check storage.js
node --check public/app.js
```

## Current UI workflow

- **Overview** — all-time spend, messages, booked appointments, visits, registrations, top ads, and agent results.
- **Performance** — group by ad, ad set, campaign, or agent; filter and reveal optional Meta columns.
- **Outcomes** — add and audit the three manual outcome types.
- **Agents** — create independent agents and review automatic ad-set matching.
- **Import & data** — upload reports, audit import history, download backups, and restore.

## Next expansion candidates

- Owner, manager, and sales-agent sessions instead of one Basic Auth account.
- Normalized MySQL tables and migrations when reporting volume requires SQL analytics.
- Edit/archive workflows for setup entities with dependency-aware audit history.
- Direct Meta Marketing API synchronization and WhatsApp Cloud API webhooks.
- Payment schedules and registration balance tracking.
