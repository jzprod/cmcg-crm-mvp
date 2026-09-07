# CMCG CRM

Production-oriented attribution CRM for CMCG click-to-WhatsApp campaigns. It synchronizes a daily Meta Ads CSV with appointments, center visits, registrations, and sales-agent performance.

## What it does

- Imports the complete ad-level Meta Ads CSV and safely updates repeated reporting dates.
- Assigns spend to the actual report date from Meta's reporting columns, or from the filename when those columns are missing.
- Creates new accounts, campaigns, ad sets, and ads automatically using stable Meta IDs.
- Stores every imported column while hiding secondary metrics and IDs by default.
- Lets users reveal optional columns from the Performance screen.
- Assigns ad sets to independently created agents when the full agent name appears in the ad-set name, case-insensitively.
- Lets users rename or delete agents; renames immediately rematch imported ad sets.
- Preserves separate split-test rows when an ad name is reused under another ad set, agent, campaign, or objective.
- Records three manual outcomes: booked appointment, showed without registering, and registered student.
- Attributes each outcome to the exact ad through a Campaign -> Ad set -> Ad picker, or to an ad set, campaign, or agent when the ad is unknown.
- Counts registered students as visits while keeping "showed" exclusive to visitors who did not register.
- Defaults reporting to the last 7 days, with Today, Yesterday, This week, This month, This year, Lifetime, and Custom date ranges.
- Adds a large Overview trend graph controlled by the KPI cards, including an inverted cost-per-registration line where up means cheaper.
- Adds a secure **Groupes & paiements** operations section at `/groups` for trainings, scheduled class groups, capacity, student registrations, installments, and remaining balances.
- Includes a planning assistant that suggests low-conflict training schedules and can create a formation/group from the suggested plan.
- Supports **nidam shift** groups where the same group can have a main morning/evening slot plus an alternate shift slot.
- Keeps every student traceable with registration, edits, and payment timeline events.
- Compares ads, ad sets, campaigns, and agents using spend, messages, outcomes, cost per visit, cost per registration, lag-aware business quality, and confidence.
- Learns scoring benchmarks automatically from gathered Meta spend and manual outcomes, so no manual Performance scoring setup is required.
- Separates business quality from agent closing quality so ads and sales follow-up can be judged fairly.
- Sorts every performance level by quality, spend, outcome totals, messages, rates, or lowest cost per outcome.
- Assigns every imported ad a permanent case-insensitive 2-3 character tracking code.
- Downloads and restores full JSON backups.
- Provides a confirmed clean-start reset for removing old imports, spend, ads, outcomes, leads, and used creative codes.
- Uses Hostinger MySQL in production and automatically snapshots the previous database state before every write.

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000`. Local development uses `data/crm.json` and keeps the latest 20 automatic file backups under `data/backups/`. Both are ignored by Git.

Run regression tests:

```bash
npm test
```

## Production Environment Variables

```text
CRM_USER=your_private_admin_username
CRM_PASSWORD=your_long_unique_password
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_hostinger_database_user
DB_PASSWORD=your_hostinger_database_password
DB_NAME=your_hostinger_database_name
```

When all database variables are present, the app creates its MySQL tables automatically. The **Data & backup** screen must show **MySQL database** before real CRM data is entered.

Student, group, and payment tools are intentionally locked unless `CRM_USER` and `CRM_PASSWORD` are configured. On Hostinger, set both values before using `/groups` or entering student names/phone numbers.

See [HOSTINGER_DEPLOYMENT.md](HOSTINGER_DEPLOYMENT.md) for deployment, verification, and recovery steps.

## Daily Workflow

1. Export the saved ad-level report from Meta Ads Manager for the reporting date.
2. Open **Import & data**, choose the CSV, and select **Import and sync**.
3. Use the reporting period picker. The CRM opens on **Last 7 days** by default, but you can switch to Today, Yesterday, This week, This month, This year, Lifetime, or Custom.
4. Click Overview KPI cards to add or remove metrics from the trend graph. Cost per registration is inverted in the graph, so a rising line means the cost is improving.
5. Add only the outcomes Meta cannot know: booked, showed without registration, or registered.
6. When assigning an outcome to an ad, choose **Campaign -> Ad set -> Ad** so duplicate ad names stay separated.
7. Use **Performance** to group and compare Ads, Ad sets, Campaigns, or Agents.
8. Open `/groups` or use **Groupes & paiements** to create trainings, let the assistant suggest a planning slot, schedule fixed or nidam-shift groups, register students, record installment payments, and watch group capacity.

Business quality learns from gathered data. It rewards low cost per registered student, low cost per total visit, low cost per booked appointment, strong outcome volume, and healthy visit-to-registration close rate. Rows stay **Awaiting** inside the closing window, tiny mature spends stay **Not enough**, and a row only turns **Weak** after enough time and spend have passed to judge it fairly.

To start over with real production data, open **Import & data**, download a backup if needed, then use **Reset CRM data**. This clears advertising data plus trainings, groups, students, and payments.

Repeated imports update the same ad/reporting-date rows instead of duplicating spend. Keep the Meta ID columns in the export even though they are hidden in the normal CRM view.

## Tracking Message

Each creative receives a short code such as `A7`. Codes are normalized to uppercase, so lowercase and uppercase entries match the same creative. A used code is never assigned again.

## Privacy

Never commit `.env`, `data/crm.json`, database credentials, real phone numbers, leads, exports, or downloaded backups. JSON and CSV backups contain private CRM data and must be stored securely.
