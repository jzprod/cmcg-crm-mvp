# CMCG CRM

Production-oriented attribution CRM for CMCG click-to-WhatsApp campaigns. It connects ad spend and WhatsApp conversations to appointments, show-ups, registrations, revenue, creatives, trainings, and sales-agent performance.

## What it does

- Creates dynamic trainings, sales agents, campaigns, ad sets, and creatives.
- Assigns every creative a permanent case-insensitive 2–3 character tracking code.
- Tracks leads through new, contacted, qualified, booked, showed, no-show, registered, and lost stages.
- Requires a reason when a lead is marked lost.
- Records daily spend and messages once per creative and date.
- Calculates CPL, booking cost, show-up cost, registration cost, and registrations per 1000 MAD.
- Shows conversion funnels, upcoming appointments, creative performance, and agent quality.
- Exports dashboard, lead, and spend data to CSV.
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

## Tracking message

Each creative receives a short code such as `A7`. The welcome message is:

```text
مرحبا، أريد معرفة تفاصيل التكوين في مركز CMCG. كود الإعلان: A7
```

Codes are normalized to uppercase, so lowercase and uppercase entries match the same creative. A used code is never assigned again.

## Privacy

Never commit `.env`, `data/crm.json`, database credentials, real phone numbers, leads, exports, or downloaded backups. JSON and CSV backups contain private CRM data and must be stored securely.
