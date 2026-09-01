# Hostinger production setup

## 1. Try to recover the missing records

Before restoring or redeploying anything, open Hostinger **Website Dashboard → Backups → Restore and download → Files backups**. Choose a backup from before the redeploy and download it.

Inside the archive, look under the old Node.js application for:

```text
data/crm.json
```

Keep that file private. Do not restore the entire website over the current deployment. After MySQL is active, use **Data & backup → Choose JSON backup** inside the CRM to import this file safely.

## 2. Create the production database

In Hostinger hPanel, open **Databases → MySQL Databases → Create Database**. Save the database name, database username, password, and host. The host is usually `localhost`.

## 3. Add environment variables

Open the Node.js website’s **Environment variables** screen and add each key separately:

| Key | Value |
|---|---|
| `CRM_USER` | Your private CRM username |
| `CRM_PASSWORD` | A long, unique password |
| `DB_HOST` | Usually `localhost` |
| `DB_PORT` | `3306` |
| `DB_USER` | The exact MySQL username from Hostinger |
| `DB_PASSWORD` | The MySQL password |
| `DB_NAME` | The exact MySQL database name |

Do not add quotes around values and never commit these values to GitHub.

## 4. Restart and verify

Restart the Node.js app from its Hostinger dashboard. If necessary, use **Deployments → Redeploy → Save and redeploy**.

Open the CRM and select **Data & backup**. Confirm all of the following:

- Current storage says **MySQL database**.
- The yellow deployment-storage warning is gone.
- The login prompt appears in a private browser window.
- Creating a temporary training keeps it after a restart.
- Download backup produces a JSON file.

Do not enter real leads while the screen says **Local JSON file**.

## 5. Restore recovered data

After MySQL is verified:

1. Open **Data & backup**.
2. Click **Choose JSON backup**.
3. Select the recovered `crm.json`.
4. Review the record count.
5. Confirm **Restore backup**.
6. Check trainings, agents, creatives, leads, and spend logs.
7. Download a fresh backup immediately.

The restore operation saves the currently active state before replacing it.
