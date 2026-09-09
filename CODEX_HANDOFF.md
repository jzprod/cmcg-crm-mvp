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
- A training stores structured fields: numeric `durationValue` + `durationUnit` (`months`/`years`, with derived `durationLabel`/`durationMonths`), `sessionsPerWeek`, `sessionHours`, three prices (`monthlyPrice` is the primary, plus `fullPrice` and cash/`discountedPrice`), and a `nidamShift` flag. Legacy `durationLabel`/`basePrice` migrate into these fields at load (schema v6). `basePrice` is kept aligned to `fullPrice` for back-compat.
- Payment plans map to training prices: `monthly` uses the monthly price, `paid_full`/`custom` default to the cash (discounted) price. A group `price`/`discountedPrice` overrides the training price when set.
- A group is a named container under a training (training + name + capacity + status only). Prices come from the training. A group owns `sessions: [{ day, timeStart, timeEnd }]` as its source of truth; legacy `days`/`timeStart`/`timeEnd` (and old alternate-shift fields) migrate into `sessions[]` on load, and `group.days`/`timeStart`/`timeEnd` are kept aligned to the sessions for back-compat readers. `attendanceMode` is derived from the training's `nidamShift`.
- `POST /api/groups/:id/sessions` replaces a group's session list (used by the planner). The group form no longer captures time/price; sessions are added on the weekly planner's "Séances du groupe" mode, which offers auto-distribution (training `sessionsPerWeek` × `sessionHours` onto teacher-available, non-conflicting slots) and click-to-add/remove per slot.
- One training can have multiple groups with different schedules. When registering a student the group `<select>` is grouped by training (`<optgroup>`) showing each group's schedule and free spots, so an agent can place a student into any group/session of the same training (cross-group drop-in). Full groups are disabled in the picker.
- Teacher availability is a global weekly grid in `state.availability`: `weekly` maps `"<day>|<start>|<end>"` to available/false (default available when absent), and `overrides` maps a specific date to per-slot exceptions that win over the weekly default. `POST /api/availability` toggles a weekly slot or a date override; `POST /api/availability/clear-override` drops a date's exceptions.
- The operations planner has two modes: "Planifier" (suggestions) and "Disponibilité prof". In availability mode the agent clicks weekly slots to toggle the teacher available/unavailable. In plan mode, slots where the teacher is unavailable render as blocked and cannot create a group.
- The operations UI includes a weekly planning assistant that shows Monday-Sunday, colors empty/conflicting/busy/blocked slots, drills into one day for exact hours, scores each slot by overlap with existing groups and teacher availability, and can create a suggested formation/group.
- The operations UI includes a `Charger planning image` action backed by `POST /api/operations/seed-screenshot-schedule`. It seeds the clearly readable Excel-photo records once: Comptabilité 3 mois, Comptabilité 5 mois, Comptabilité complet, RH, and the visible Tue-Sun 10:00-20:00 groups.
- Group capacity is derived from non-cancelled students in each group. Remaining student balance is derived from `student.totalDue - sum(payments.amount)`.
- Student payment agreements support `paid_full`, `monthly`, and `custom`. Paid-full is for cash/full-course deals, monthly can store installment amount/count/start/next due date, and custom stores exceptional split agreements plus notes and the exact next-payment date.
- Payment due status is computed from the remaining balance and `nextPaymentDate`; fully paid students clear the next date, while monthly payments advance by one month only after a payment is recorded.
- Student history is traceable through `events[]` entries keyed by `studentId` for registration, edits, and payments.
- A dedicated **Étudiants** sidebar tab (`#students` panel) gives students their own page: KPI cards (count / collected / remaining / overdue for the current filter), clickable training filter cards, and filters for group, status, payment state (paid / balance / overdue / due-soon / none) and a search box. It renders students as cards with a paid/total progress bar and due-status pill; clicking a card opens the same management view. The sales role can see this tab (alongside Groupes & paiements) and it is filtered to their own students by the server.
- Clicking a student opens a management view (the `studentDetailDialog`) with a paid/total progress bar, remaining balance, due-status pill, and quick actions: add payment, transfer to another group (same-training groups listed first, capacity-checked), change status, and edit details. Transfer and status use a partial `PATCH /api/students/:id` (which preserves the existing payment agreement when those fields are omitted); after any action the view refreshes in place instead of closing.
- If Basic Auth is not configured and sensitive student data exists, `/api/state` redacts groups, students, payments, and student events instead of exposing them.
- Arabic mode is client-side through the language selector. It sets `html dir="rtl"`, applies Arabic fonts, and translates static/dynamic UI copy, generated dialogs, placeholders, alerts, toasts, planner text, and common API errors using the local dictionary in `public/app.js`.
- Imported ad sets match active agents only when the complete agent name appears in the ad-set name, case-insensitively. Zero matches remain unassigned and multiple matches remain ambiguous.
- Agent names can be edited or deleted from the UI. Editing reruns ad-set matching. Deleting an agent clears the old links from ad sets and outcomes but does not delete imported ad data.
- Outcomes are limited to `booked`, `showed`, and `registered`, and can target an ad, ad set, campaign, or agent.
- Ad-level outcome entry must use the hierarchy Campaign -> Ad set -> Ad so duplicate ad names under different campaigns/ad sets remain separated.
- `showed` means visited without registering. Total visits equal `showed + registered`.
- The Overview trend graph shows one metric at a time on an exact-value Y axis (real numbers, not a 0-100 scale). A KPI card or the metric switch selects the metric; cost/registered is per-period, other metrics accumulate.
- Goals are persisted in `state.goals` (admin only). Types: `registered`, `revenue`, `cost_per_registered`, and `custom` (any Overview metric). Each has a numeric `target` and a `from`/`to` window. `POST/PATCH/DELETE /api/goals` manage them. The active goal drives the graph: it draws a 🎯 target line and, for count/revenue goals, an ideal straight pace line from (start,0) to (end,target); a banner and chips show current vs target, percent, and an ahead/behind-by-N status computed from elapsed-days pace (for cost goals: met when current ≤ target).
- Reporting defaults to Last 7 days. Date presets include Today, Yesterday, This week, This month, This year, Lifetime, and Custom; changing From/To manually switches to Custom.
- Agent ROI links the two sides: for the agent grouping in Performance, revenue is derived from `student.agentId` → that agent's students → their payments. `collected` (payments in the reporting window) gives ROI = collected/spend (multiple + net); `potential` (sum of the agent's active students' `totalDue`) gives potential ROI. Manual budget spend feeds this because `relationForLog` resolves a manual log's explicit `agentId`/`campaignId`/`adSetId`.
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
- `POST /api/programs` - creates a training with numeric duration (value + unit), sessions/week, session hours, three prices (monthly/full/discounted), and the nidam-shift flag.
- `PATCH /api/programs/:id` - updates a training and recomputes derived duration fields.
- `POST /api/availability` - toggles a teacher-availability slot; a `date` makes it a date-specific override, otherwise it sets the weekly default.
- `POST /api/availability/clear-override` - removes all date-specific overrides for one date, restoring the weekly default.
- `POST /api/groups/:id/sessions` - replaces a group's session list (`[{ day, timeStart, timeEnd }]`); normalizes days and de-duplicates.
- `POST /api/manual-budget` - adds spend without a CSV. Splits `amount` evenly across the `from`..`to` day range (one `source: "manual"` daily log per day, rounding remainder on the last day), attached to `level` = center/agent/campaign/adset (+ `targetId`). Manual logs carry `batchId` and are never touched by CSV imports (which only update `source: "meta_csv"` rows).
- `DELETE /api/daily-logs/:id` - removes a single manual log or a whole manual batch (matches `id` or `batchId`); only deletes `source: "manual"` logs.
- `POST /api/goals`, `PATCH /api/goals/:id`, `DELETE /api/goals/:id` - manage goals (type, target, from, to, optional metric/title).
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
