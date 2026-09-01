# CMCG CRM MVP - Codex Handoff

## Project Goal

Build a simple but expandable CRM for CMCG in Tangier to track Facebook/Instagram click-to-WhatsApp ads from ad spend to booked appointments, show-ups, registrations, and cost per registered student.

This is for a training center with multiple courses such as HR, beauty, social media marketing, accounting, and a one-year comprehensive accounting and management course. Course names must stay dynamic, not hardcoded.

## Current Attribution Method

The first MVP uses the manual tracking-code method:

- Each training has its own campaign.
- Inside a campaign, ad sets can represent agents, tests, objectives, or main audiences.
- Each sales agent can have their own WhatsApp number.
- Each creative gets a unique tracking code.
- The code is pasted into the WhatsApp welcome message.
- When the sales agent receives a lead, the code is entered manually into the CRM.
- Daily ad spend and message counts are entered manually.

Do not build round-robin lead distribution for now. The user's chosen method is one WhatsApp number per agent/ad set.

## Business Metrics

The CRM must make it easy to see:

- Cost per lead.
- Cost per booked date.
- Cost per show-up.
- Cost per registered student.
- Number of registrations by center, training, campaign, ad set, creative, and agent.
- Agent conversion quality.
- Creative/objective performance.

Important display rule:

- When costs improve by going down, the visual success indicator should go up.
- The current MVP uses an efficiency score: registrations per 1000 MAD.

## Current MVP Stack

This first version is intentionally simple:

- Node.js built-in HTTP server.
- No external npm packages.
- Frontend in plain HTML/CSS/JS.
- JSON file storage in `data/crm.json`.
- Basic HTTP auth using environment variables.

This was chosen because the user wants to host it on Hostinger Business and work on it locally with Codex. It avoids database setup during the first test.

## Run Locally

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## Environment Variables

For public hosting, set:

```bash
CRM_USER=your_admin_user
CRM_PASSWORD=your_strong_password
```

Optional:

```bash
PORT=3000
CRM_DATA_FILE=/absolute/path/to/crm.json
```

## Current App Structure

```text
server.js
public/index.html
public/styles.css
public/app.js
data/.gitkeep
README.md
CODEX_HANDOFF.md
package.json
```

## Current Features

- Create trainings/programs.
- Create sales agents and store their WhatsApp numbers.
- Create campaigns under trainings.
- Create ad sets under campaigns and assign each ad set to one sales agent.
- Create creatives with generated or custom tracking codes.
- Copy Arabic welcome message containing the code.
- Manually add leads by creative/code.
- Update lead stages.
- Enter daily spend and message counts.
- Dashboard with KPI cards and creative scorecard.
- Advanced toggle for agent quality score.

## Lead Stages

Current stages:

- `new`
- `contacted`
- `qualified`
- `booked`
- `showed`
- `no_show`
- `registered`
- `lost`

Keep appointment, show-up, no-show, registration, revenue, and lost reason as separate trackable outcomes in future versions.

## Important Privacy Rule

The repository is public, so never commit:

- `data/crm.json`
- real leads
- phone numbers
- passwords
- API keys
- access tokens
- Meta credentials
- WhatsApp credentials

The `.gitignore` already excludes `data/crm.json` and `.env`.

## Suggested Next Build Steps

1. Add edit/delete actions for trainings, agents, campaigns, ad sets, creatives, daily logs, and leads.
2. Add CSV export for dashboard, leads, and daily logs.
3. Add MySQL storage for Hostinger production.
4. Add user roles: owner/admin, sales manager, agent.
5. Add agent-specific filtered view.
6. Add lost reason required when a lead is marked lost.
7. Add appointment calendar view.
8. Add registration revenue and payment status.
9. Add Meta Ads import later.
10. Add WhatsApp Cloud API webhooks later only if the center decides to automate capture.

## Hostinger Notes

For Hostinger Business:

- Use Node.js application hosting if available.
- Start file: `server.js`.
- Start command: `npm start`.
- Use environment variables for CRM login.
- Back up `data/crm.json` regularly until MySQL is added.

If Hostinger Node.js support is limited, convert the backend to PHP + MySQL later. Keep the same frontend and data model.

## User Preference

The user wants speed and practicality. Do not over-engineer the first version. Keep the interface simple, mobile-friendly, and focused on decisions:

- Which ad/creative is bringing registrations?
- Which agent is converting?
- What is the real cost per booked date, show-up, and registration?
- What should be killed, scaled, or tested next?
