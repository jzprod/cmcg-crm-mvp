# CMCG CRM

Production-oriented attribution CRM for CMCG click-to-WhatsApp campaigns. It synchronizes a daily Meta Ads CSV with appointments, center visits, registrations, and sales-agent performance.

## What it does

- Imports the complete ad-level Meta Ads CSV and safely updates repeated reporting dates.
- Creates new accounts, campaigns, ad sets, and ads automatically using stable Meta IDs.
- Stores every imported column while hiding secondary metrics and IDs by default.
- Lets users reveal optional columns from the Performance screen.
- Assigns ad sets to independently created agents when the full agent name appears in the ad-set name, case-insensitively.
- Preserves separate split-test rows when an ad name is reused under another ad set, agent, campaign, or objective.
- Records three manual outcomes: booked appointment, showed without registering, and registered student.
- Attributes each outcome to the exact ad, or to an ad set, campaign, or agent when the ad is unknown.
- Counts registered students as visits while keeping “showed” exclusive to visitors who did not register.
- Compares ads, ad sets, campaigns, and agents using spend, messages, outcomes, cost per outcome, and a color-coded 0–100 quality score.
- Sorts every performance level by quality, spend, outcome totals, messages, or lowest cost per outcome.
- Assigns every imported ad a permanent case-insensitive 2–3 character tracking code.
- Downloads and restores full JSON backups.
- Uses Hostinger MySQL in production and automatically snapshots the previous database state before every write.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`. Local development uses `data/crm.json` and keeps the latest 20 automatic file backups under `data/backups/`. Both are ignored by Git.

Run regression tests:

```bash
npm test
```

## Production environment variables

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

See [HOSTINGER_DEPLOYMENT.md](HOSTINGER_DEPLOYMENT.md) for deployment, verification, and recovery steps.

## Daily workflow

1. Export the saved ad-level report from Meta Ads Manager for the reporting date.
2. Open **Import & data**, choose the CSV, and select **Import and sync**.
3. Add only the outcomes Meta cannot know: booked, showed without registration, or registered.
4. Use **Performance** to group and compare Ads, Ad sets, Campaigns, or Agents.

The quality score is relative to the rows in the selected view. It weights booked-appointment efficiency at 20%, showed-without-registration efficiency at 30%, and registration efficiency at 50%. Green is strong (70–100), amber needs attention (40–69), red is weak (0–39), and gray means there is not enough spend/outcome data for a comparison.

Repeated imports update the same ad/reporting-date rows instead of duplicating spend. Keep the Meta ID columns in the export even though they are hidden in the normal CRM view.

## Tracking message

Each creative receives a short code such as `A7`. The welcome message is:

```text
مرحبا، أريد معرفة تفاصيل التكوين في مركز CMCG. كود الإعلان: A7
```

Codes are normalized to uppercase, so lowercase and uppercase entries match the same creative. A used code is never assigned again.

## Privacy

Never commit `.env`, `data/crm.json`, database credentials, real phone numbers, leads, exports, or downloaded backups. JSON and CSV backups contain private CRM data and must be stored securely.
