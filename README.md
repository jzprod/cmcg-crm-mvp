# CMCG CRM MVP

Manual attribution CRM for CMCG click-to-WhatsApp campaigns.

This first version is built around the method you chose:

- One campaign per training.
- One ad set per sales agent or test.
- One WhatsApp number per sales agent/ad set.
- One unique tracking code inside the WhatsApp welcome message.
- Manual daily entry for spend and received messages.
- Manual lead stage updates for booked date, show-up, no-show, registered, and lost.

## Run locally

```bash
npm start
```

Open `http://localhost:3000`.

## Hostinger deployment

1. Create a Node.js app in Hostinger.
2. Upload this project or deploy it from GitHub.
3. Set the start file to `server.js`.
4. Set the start command to `npm start`.
5. Add environment variables:

```bash
CRM_USER=your_admin_user
CRM_PASSWORD=your_strong_password
```

The app stores data in `data/crm.json` by default. Back up this file regularly.

## How to track an ad

1. Create a training, for example `HR`.
2. Create the sales agent with their WhatsApp number.
3. Create the campaign for that training.
4. Create the agent ad set under that campaign.
5. Create the creative. The CRM generates a code like `CMCG-HR-VIDEO-8A3F`.
6. Paste this Arabic welcome message into the ad flow:

```text
مرحبا، أريد معرفة تفاصيل التكوين في مركز CMCG. كود الإعلان: CMCG-HR-VIDEO-8A3F
```

7. When a new WhatsApp conversation arrives, enter the lead manually using that code.
8. Every day, enter spend and messages for each creative.

## Core metrics

- Cost per lead = spend / leads.
- Cost per booked date = spend / booked appointments.
- Cost per show-up = spend / attended appointments.
- Cost per registered student = spend / registrations.
- Efficiency = registrations per 1000 MAD. This makes better cost performance move upward visually.

## Next build phase

The natural next step is replacing the JSON file with MySQL while keeping the same interface. After that, we can add Meta Ads import, WhatsApp Cloud API capture, and agent permissions.
