# CMCG CRM — Engineering Handoff

## Goal

Track CMCG click-to-WhatsApp advertising from spend to conversations, appointments, show-ups, registrations, revenue, creative performance, and sales-agent quality. Trainings remain dynamic and must never be hardcoded.

## Architecture

- Node.js built-in HTTP server in `server.js`.
- Plain accessible HTML/CSS/JavaScript under `public/`.
- Storage adapter in `storage.js`.
- MySQL via `mysql2` when `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` are configured.
- Local JSON fallback through `CRM_DATA_FILE` or `data/crm.json`.
- Basic HTTP authentication through `CRM_USER` and `CRM_PASSWORD`.
- Node built-in integration tests under `test/`.

The HTTP server calls `listen()` immediately for Hostinger compatibility, while storage initializes in the background. API requests receive a safe 503 JSON response until storage is ready; database errors are logged without exposing credentials to the browser.

The MySQL implementation stores the current normalized CRM state in `crm_state` and retains the latest 25 pre-write snapshots in `crm_state_backups`. The JSON fallback uses atomic writes and retains the latest 20 file backups.

## Important invariants

- Production must report `storage.persistent === true` from `/api/health`.
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

## Verification

```bash
npm test
node --check server.js
node --check storage.js
node --check public/app.js
```

## Next expansion candidates

- Owner, manager, and sales-agent sessions instead of one Basic Auth account.
- Normalized MySQL tables and migrations when reporting volume requires SQL analytics.
- Edit/archive workflows for setup entities with dependency-aware audit history.
- Meta Ads import and WhatsApp Cloud API webhooks.
- Payment schedules and registration balance tracking.
