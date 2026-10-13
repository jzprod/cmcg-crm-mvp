# CMCG CRM · Meta integrations (Conversions API, Marketing API, WhatsApp Cloud API)

Everything described here is **built and switched OFF**. Nothing talks to Meta, and
nothing touches Wiam's or Souad's WhatsApp numbers, until (1) the credentials are in
Hostinger and (2) you switch each part on in **Admin → Integrations**.

---

## 1. What was added

| Part | Files | What it does |
|---|---|---|
| Integration storage | `integrations/store.js`, `storage.js` | 4 new MySQL tables (below). The existing `crm_state` data is not modified. Without MySQL (local), a `data/integrations.json` file is used. |
| Conversions API | `integrations/capi.js`, `integrations/index.js` | Builds and sends **RDV** and **Registered (paid)** events from the CRM pipeline, through a MySQL queue with stable ids, retries and a test mode. |
| Marketing API sync | `integrations/ads-sync.js` | Pulls daily ad-level spend/impressions/reach/clicks/conversations/leads for the ad account, every N hours, and replaces the CSV import for synced days without double counting. |
| WhatsApp webhook | `integrations/whatsapp.js`, `leads.js` (`upsertWhatsappLead`, `recordWhatsappEcho`) | `GET/POST /api/webhooks/whatsapp`: verification, `X-Hub-Signature-256` check, lead creation/update by phone, click-to-WhatsApp referral capture (`source_id`, `ctwa_clid`, headline, body), agent assignment by receiving number, duplicate protection. |
| Admin page | `public/integrations-ui.js`, `public/index.html`, `public/styles.css` | **Integrations** tab: credentials checklist, switches, queue counters, event log, sync history, number → agent mapping, attribution coverage, cost & revenue reports. |
| Agent app | `public/leads-ui.js` | Unchanged workflow. Leads that came from an API-confirmed ad show a small **📣 إعلان** tag. |
| Server | `server.js` | Routes, background jobs (queue every 30 s, ad sync check every 10 min), settings normalisation, secrets kept out of every state response. |
| Tests | `test/integrations.test.js` | Event building, delivery/retry/pause, queue de-duplication across restarts, webhook verification/signature/referral/dedupe/agent mapping, ads sync without double counting. |

### Database migrations (created automatically at start, `CREATE TABLE IF NOT EXISTS`)

```sql
int_wa_messages  (message_id PK, phone_number_id, from_phone, lead_id, kind, has_referral, received_at)
int_capi_events  (id PK = event_id:mode, event_id, mode, lead_id, stage, channel, payload, status,
                  attempts, next_attempt_at, last_error, response, created_at, updated_at)
int_sync_runs    (id, kind, started_at, finished_at, status, rows_count, message)
int_log          (id, at, kind, level, message)            -- last 2000 rows kept
```
Retention: message metadata 180 days, sent/cancelled events 400 days. Message **text is not stored** in these tables (only the first message is kept on the lead card as "أول رسالة").

---

## 2. How events are sent to Meta

| Lead | Trigger | Event | `action_source` | Identifiers |
|---|---|---|---|---|
| Instant Form (has Meta `lead_id`) | RDV / Registered | CRM stage name (default `RDV`, `Registered`) | `system_generated` | `lead_id` + hashed phone/name, `custom_data.event_source = crm`, `lead_event_source = CMCG CRM` (**Conversion Leads**) |
| WhatsApp with `ctwa_clid` (from the webhook) | RDV / Registered | `Schedule` / `Purchase` | `business_messaging`, `messaging_channel: whatsapp` | `ctwa_clid` + `whatsapp_business_account_id` |
| WhatsApp without click id (manual / older leads) | RDV | `Schedule` | `phone_call` (RDVs are booked by phone) | SHA-256 phone, first/last name, country `ma`, external id |
| same | Registered | `Purchase` | `physical_store` (payment at the centre) | same |

* Paid events carry the CRM value (Settings → revenue per student, default 3000) in **MAD**.
* `event_id` = `cmcg-<lead>-<stage>`: the same student/stage is never reported twice.
* RDV follows the CRM rule: an RDV cancelled **before** its time is never sent (and is removed from the queue if still waiting); a no-show stays an RDV.
* Demo/test leads (🧪, "test", "تجريبي") are never sent.
* Meta only accepts recent events: 7 days (62 days for `physical_store`); older ones are skipped.
* **Test mode** (default) sends only with `META_TEST_EVENT_CODE` → they appear in Events Manager → *Test events* and never in reporting. Switching to **Live** asks for confirmation; test rows are kept separately and live rows are sent fresh.
* Errors: network/5xx/rate limits → retry after 1, 5, 30, 120, 720 min (6 attempts). Token expired (190) or permission errors → the queue **pauses** and shows the reason; fix it then press **Retry failed**.
* A successfully received event is **not** a guarantee that Meta attributes it to a given ad. The reports page labels **CRM-attributed** numbers; Meta's own attribution is in Ads Manager → Columns → Conversions.

> Event names and stage names can be changed in Admin → Integrations → Event names. For Conversion Leads, the stage names must match the lead stages you configure in Events Manager. Check Meta's current Conversions API documentation for the event names and `action_source` values accepted for your dataset before switching to Live.

---

## 3. Webhook callback URL

```
https://yellowgreen-jay-834668.hostingersite.com/api/webhooks/whatsapp
```
(Use your custom domain instead if you add one. Shown with a Copy button in Admin → Integrations.)

---

## 4. Environment variables (Hostinger → Node.js app → Environment variables)

| Key | Needed for | Value |
|---|---|---|
| `META_ACCESS_TOKEN` | Marketing API + Conversions API | **System user** token (Business Settings → Users → System users → Generate token) |
| `META_CAPI_TOKEN` | optional | Separate Conversions API token from Events Manager (overrides the one above for CAPI) |
| `META_DATASET_ID` | Conversions API | Events Manager → your dataset → Settings → Dataset ID |
| `META_TEST_EVENT_CODE` | Conversions API test mode | Events Manager → dataset → Test events → code (e.g. `TEST12345`) |
| `META_AD_ACCOUNT_ID` | Ad spend sync | Ad account ID, with or without `act_` |
| `META_API_VERSION` | optional | Graph API version, default `v21.0` |
| `META_APP_SECRET` | WhatsApp webhook | Meta Developers → your app → Settings → Basic → App secret |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp webhook | Any long random text you choose (also typed in the webhook settings) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Click-to-WhatsApp events | WhatsApp Manager → Account ID (WABA ID) |

Never put these in GitHub or in the CRM. After adding them: **restart the app**.

---

## 5. Meta permissions

System user (assigned to the ad account, the dataset, the Page and the WhatsApp account):
* `ads_read` (spend sync) · `ads_management` (lookups) · `business_management`
* Dataset: "Manage" / send events access
* WhatsApp: `whatsapp_business_messaging`, `whatsapp_business_management`
* Instant Forms / Conversion Leads: `leads_retrieval`, `pages_show_list`, `pages_read_engagement` on the Page

---

## 6. Setup order (safest first)

### Step A: Conversions API (no WhatsApp change)
1. Events Manager → **Connect data** → create a dataset (or use your existing pixel/dataset). Copy the **Dataset ID**.
2. Generate a system user token with access to the dataset → `META_ACCESS_TOKEN`.
3. Events Manager → Test events → copy the test code → `META_TEST_EVENT_CODE`.
4. For Instant Forms: Events Manager → the dataset → **CRM / Conversion Leads** setup → connect your Page/forms and create the lead stages **RDV** and **Registered** (same names as in the CRM).
5. Restart the app → Admin → Integrations → switch **Send events** on (mode **Test**).
6. Mark a real RDV in the CRM → within 30 s it appears in Events Manager → Test events, and in the CRM event log as `sent · test`.
7. When the test looks right: switch the mode to **Live**. Events start from the day shown in "Send events from" (you can set an earlier date to back-fill the last 7 days / 62 days for payments).

### Step B: Ad spend sync
1. Add `META_AD_ACCOUNT_ID` (the token needs `ads_read`). Restart.
2. Admin → Integrations → **Sync now** (optionally with a from/to range) → check the numbers against Ads Manager.
3. Switch **Automatic sync** on (every 3 h by default; each run re-reads the last 3 days).
4. Keep the CSV import as a fallback: days already synced are skipped by the CSV import.

Timezone: Meta reports days in the ad account timezone (shown in the sync history). CRM RDV/registration dates are in Morocco time. Keep the ad account on `Africa/Casablanca` to avoid a one-day shift around midnight.

### Step C: WhatsApp Cloud API (only after approval)
1. Meta Developers → your app (Business type) → add **WhatsApp**. Note the WABA ID and app secret.
2. App → WhatsApp → **Configuration** → Webhook: callback URL above, verify token = `WHATSAPP_VERIFY_TOKEN`. Subscribe to **messages** (and **smb_message_echoes** if you use coexistence).
3. Test with Meta's **test number** first: send a message to it, check that a lead appears in the CRM.
4. Admin → Integrations → map each **Phone number ID** to its agent, then switch **Create leads from incoming messages** on.

---

## 7. Connecting Wiam's and Souad's numbers safely

**Do not register their numbers on the standard Cloud API**: the normal registration removes the number from the WhatsApp Business app, and their current chats/history stop working on the phone.

The supported way to keep the app is **WhatsApp Business App coexistence** ("onboard WhatsApp Business app users"):
* Done through **Embedded Signup** by a Meta **Tech Provider / Solution Partner**, or by your own app if it is set up as a Tech Provider (business verification required).
* The agent scans a QR code from **WhatsApp Business app → Settings → Linked accounts/devices** during Embedded Signup; the app keeps working, and messages are mirrored to the API (echoes) with optional history sync.
* Eligibility depends on country, app version and how long the number has been active in the app. **Check in your Meta account that Moroccan numbers are eligible before planning on it.** Some features (e.g. groups, view-once, live location) are not mirrored.
* Pricing: replying within the 24-hour customer-service window is free; conversations that start from a click-to-WhatsApp ad get a free entry-point window (72 h). Template (marketing/utility) messages are charged per Meta's current pricing for Morocco.

If coexistence is not available: use a **new dedicated number** for the ads on the Cloud API and keep the agents' personal business numbers as they are.

Approval checklist before connecting a real number: written OK from you, a backup of the agent's chats, the test number working end-to-end, the number → agent mapping set.

---

## 8. Testing & deployment checklist

- [ ] `npm test` passes (includes `test/integrations.test.js`)
- [ ] Deploy (push to `main`) → Hostinger redeploys; new tables are created on start
- [ ] Admin → Integrations shows the credentials checklist (no values)
- [ ] CAPI in **Test**: one RDV → visible in Events Manager → Test events
- [ ] CAPI event log shows `sent · test`; a forced error shows in the log and retries
- [ ] Ads: **Sync now** for yesterday → spend matches Ads Manager
- [ ] Webhook: GET verification succeeds in Meta Developers; a test-number message creates one lead; sending it twice does not duplicate
- [ ] Switch CAPI to **Live** only after the above

## 9. Rollback

* Instant: switch everything off in Admin → Integrations (queue stops, webhook ignores messages, sync stops).
* Full: set `CRM_INTEGRATIONS=0` in Hostinger and restart (no background job runs; the webhook still answers Meta but processes nothing).
* Code: revert the integration commits; the 4 `int_*` tables can stay (unused) or be dropped. `crm_state` was never changed by these features except new optional fields on leads (`ctwaClid`, `acquisition`, `attributionSource`, `referrals`, `lastInboundAt`).

## 10. Remaining manual steps

1. Create the dataset and Conversion Leads stages in Events Manager.
2. Create the system user, assign assets, generate the token.
3. Add the environment variables in Hostinger and restart.
4. Decide on WhatsApp: coexistence eligibility check (Tech Provider / Embedded Signup) or a new dedicated number.
5. Configure the webhook in Meta Developers and map phone number IDs to agents.
6. Run the checklist above, then switch the Conversions API to Live.
