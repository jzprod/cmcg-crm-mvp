# CMCG CRM - Engineering Handoff

## Goal

Track CMCG click-to-WhatsApp advertising from Meta-reported spend and conversations to appointments, center visits, registrations, ad performance, and sales-agent quality.

## Architecture

- Node.js built-in HTTP server in `server.js`.
- Plain accessible HTML/CSS/JavaScript under `public/`.
- Shared browser/CommonJS scoring helper in `public/quality.js`.
- Storage adapter in `storage.js`.
- Hostinger MySQL/MariaDB via the official `mariadb` connector when `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` are configured.
- Local JSON fallback through `CRM_DATA_FILE` or `data/crm.json`.
- Basic HTTP authentication supports two roles: admin through `CRM_USER`/`CRM_PASSWORD`, and one restricted sales login through `CRM_SALES_USER`/`CRM_SALES_PASSWORD`/`CRM_SALES_AGENT`.
- Admin sees the full CRM. Sales sees only `/groups`, all programs/groups for planning, anonymized group occupancy, and students/payments assigned to the matching agent.
- Node built-in integration tests under `test/`.

The HTTP server calls `listen()` immediately for Hostinger compatibility, while storage initializes in the background. API requests receive a safe 503 JSON response until storage is ready; database errors are logged without exposing credentials to the browser.

The MySQL implementation stores the current normalized CRM state in `crm_state` and retains the latest 25 pre-write snapshots in `crm_state_backups`. The JSON fallback uses atomic writes and retains the latest 20 file backups.

## Important Invariants

- Production must report `storage.persistent === true` from `/api/health`.
- Meta entities are upserted by Account ID, Campaign ID, Ad Set ID, and Ad ID; names are mutable labels and never synchronization keys.
- One imported metric row exists per ad/reporting-start/reporting-end combination. Re-importing updates it.
- Imported spend uses Meta `Reporting starts`/`Reporting ends`; if those columns are missing, import falls back to report dates parsed from the filename.
- All source CSV columns are retained in `dailyLogs[].raw`, while secondary fields and identifiers remain hidden by default in the UI.
- Programs are also used as trainings in the school operations section. Groups reference programs, students reference groups, and payments reference students.
- Groups support `attendanceMode: "fixed"` or `attendanceMode: "flexible_shift"`. Flexible shift groups store `alternateDays`, `alternateTimeStart`, and `alternateTimeEnd` so one group can support morning/night attendance.
- The operations UI includes a weekly planning assistant that shows Monday-Sunday, colors empty/conflicting/busy slots, drills into one day for exact hours, scores each slot by overlap with existing groups, and can create a suggested formation/group.
- The operations UI includes a `Charger planning image` action backed by `POST /api/operations/seed-screenshot-schedule`. It seeds the clearly readable Excel-photo records once: Comptabilité 3 mois, Comptabilité 5 mois, Comptabilité complet, RH, and the visible Tue-Sun 10:00-20:00 groups.
- Group capacity is derived from non-cancelled students in each group. Remaining student balance is derived from `student.totalDue - sum(payments.amount)`.
- Student payment agreements support `paid_full`, `monthly`, and `custom`. Paid-full is for cash/full-course deals, monthly can store installment amount/count/start/next due date, and custom stores exceptional split agreements plus notes and the exact next-payment date.
- Payment due status is computed from the remaining balance and `nextPaymentDate`; fully paid students clear the next date, while monthly payments advance by one month only after a payment is recorded.
- Student history is traceable through `events[]` entries keyed by `studentId` for registration, edits, and payments.
- If Basic Auth is not configured and sensitive student data exists, `/api/state` redacts groups, students, payments, and student events instead of exposing them.
- Arabic mode is client-side through the language selector. It sets `html dir="rtl"`, applies Arabic fonts, and translates static/dynamic UI copy, generated dialogs, placeholders, alerts, toasts, planner text, and common API errors using the local dictionary in `public/app.js`.
- Imported ad sets match active agents only when the complete agent name appears in the ad-set name, case-insensitively. Zero matches remain unassigned and multiple matches remain ambiguous.
- Agent names can be edited or deleted from the UI. Editing reruns ad-set matching. Deleting an agent clears the old links from ad sets and outcomes but does not delete imported ad data.
- Outcomes are limited to `booked`, `showed`, and `registered`, and can target an ad, ad set, campaign, or agent.
- Ad-level outcome entry must use the hierarchy Campaign -> Ad set -> Ad so duplicate ad names under different campaigns/ad sets remain separated.
- `showed` means visited without registering. Total visits equal `showed + registered`.
- Reporting defaults to Last 7 days. Date presets include Today, Yesterday, This week, This month, This year, Lifetime, and Custom; changing From/To manually switches to Custom.
- Business quality is automatic and learns benchmarks from gathered Meta spend plus manual outcomes. It rewards low cost per registration, low cost per visit, low cost per booked appointment, strong outcome volume, and healthy close rate.
- Rows inside the closing window are Awaiting. Mature low-spend rows are Not enough. Weak is reserved for mature rows with enough spend/evidence.
- Agent closing quality is separate from business quality and uses show rate plus visit-to-registration close rate.
- Creative codes contain at least one letter and one number, use two characters until exhausted, then three, are case-insensitive, immutable, and never reused.
- Unknown creative codes cannot create leads.
- Lost leads require `lostReason`.
- Spend and messages cannot be negative.
- Only one manual daily log can exist per creative/date combination.
- User-controlled strings rendered into HTML must pass through `escapeHtml`.
- CSV cells beginning with spreadsheet formula characters must be neutralized.
- `data/crm.json`, `data/backups/`, exports, `.env`, and credentials must remain uncommitted.

## API

- `GET /api/health` - backend, persistence status, update time, and record counts.
- `GET /api/backup` - authenticated full JSON download.
- `POST /api/restore` - validates and restores a full JSON backup; the storage layer snapshots current data first.
- `POST /api/meta-import` - validates and synchronizes an ad-level Meta Ads CSV.
- `POST /api/settings/scoring` - saves optional timing/rate assumptions used by the automatic score.
- `POST /api/reset-data` - resets CRM records to a clean empty state while preserving centre/currency settings.
- `POST /api/programs` - creates a training, including optional duration and default prices.
- `PATCH /api/programs/:id` - updates a training.
- `POST /api/groups` - creates a scheduled training group with days, time, capacity, pricing, and optional nidam-shift alternate timing.
- `PATCH /api/groups/:id` - updates a group without allowing capacity below current enrollment.
- `POST /api/students` - registers a student into a group with a flexible payment agreement and can record an initial payment.
- `PATCH /api/students/:id` - edits student/group/payment agreement/status fields and records a timeline event.
- `POST /api/students/:id/payments` - records a payment, updates the next due date when needed, and records a timeline event.
- `POST /api/operations/seed-screenshot-schedule` - creates readable trainings/groups extracted from the provided Excel screenshot without duplicating on repeat clicks.
- `PATCH /api/agents/:id` - renames or updates an agent and reruns automatic imported ad-set matching.
- `DELETE /api/agents/:id` - deletes an agent and clears related agent links without deleting imported advertising data.
- `POST /api/outcomes` - records a manually attributed appointment, non-registering visit, or registration.
- `DELETE /api/outcomes/:id` - removes an incorrectly entered outcome.

## Verification

```bash
npm test
node --check server.js
node --check storage.js
node --check public/app.js
node --check public/quality.js
```

## Current UI Workflow

- **Overview** - date-windowed spend, messages, booked appointments, visits, registrations, quality-ranked ads, agent results, and a large multi-metric trend graph controlled by the KPI cards. Cost per registration is inverted visually so upward movement means lower cost.
- **Performance** - group by ad, ad set, campaign, or agent; filter, sort by business quality/spend/outcomes/costs/rates, and reveal optional Meta columns.
- **Outcomes** - add and audit the three manual outcome types; ad attribution is chosen by Campaign -> Ad set -> Ad.
- **Groupes & paiements** - secure `/groups` area for French/Arabic school operations, weekly calendar planning, day/hour drill-down, screenshot schedule seeding, fixed or nidam-shift groups, capacity preview, training/timing/payment/search filters, student registration with paid-full/monthly/custom agreements, payment recording, due-payment alerts, and student timelines.
- **Agents** - create, rename, or delete independent agents, review automatic ad-set matching, and see agent closing quality.
- **Import & data** - upload reports, audit import history, download backups, restore, and reset old data before a clean start.

## Next Expansion Candidates

- Owner, manager, and sales-agent sessions instead of one Basic Auth account.
- Direct Meta Marketing API synchronization and WhatsApp Cloud API webhooks.
- Person-level lead lifecycle so a booked appointment, show-up, and registration can be linked to one student record.
- Normalized MySQL tables and migrations when reporting volume requires SQL analytics.
- Receipt uploads and automated WhatsApp/SMS reminders for upcoming or overdue payments.
