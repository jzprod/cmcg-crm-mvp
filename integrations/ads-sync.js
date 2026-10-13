// Meta Marketing API: daily ad-level insights into the CRM's ad tables, replacing
// the CSV import for the synced ad account without double-counting old CSV rows.
const ACTIONS = {
  messages: ["onsite_conversion.messaging_conversation_started_7d"],
  messagesReplied: ["onsite_conversion.messaging_first_reply"],
  leads: ["lead", "onsite_conversion.lead_grouped", "leadgen_grouped"],
};
const actionValue = (actions, types) => (actions || []).filter((item) => types.includes(item.action_type)).reduce((sum, item) => sum + Number(item.value || 0), 0);
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const dayMs = 86400000;
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * dayMs).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs) + 1;

function adsConfig(env = process.env) {
  const account = String(env.META_AD_ACCOUNT_ID || "").trim().replace(/^act_/, "");
  return { account, token: String(env.META_ACCESS_TOKEN || "").trim(), version: String(env.META_API_VERSION || "v21.0").trim() };
}

async function graphGet(path, params, config, fetchImpl = fetch) {
  const query = new URLSearchParams({ ...params, access_token: config.token });
  const response = await fetchImpl(`https://graph.facebook.com/${config.version}/${path}?${query}`, { signal: AbortSignal.timeout(30000) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error) {
    const error = new Error(json.error?.message || `HTTP ${response.status}`);
    error.code = json.error?.code;
    throw error;
  }
  return json;
}

// Pull account info + daily ad insights for [from, to] (account timezone dates).
async function fetchInsights(config, from, to, fetchImpl = fetch) {
  const account = await graphGet(`act_${config.account}`, { fields: "id,name,currency,timezone_name" }, config, fetchImpl);
  const rows = [];
  let after = "";
  for (let page = 0; page < 50; page += 1) {
    const json = await graphGet(`act_${config.account}/insights`, {
      level: "ad",
      time_increment: "1",
      time_range: JSON.stringify({ since: from, until: to }),
      fields: "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,objective,spend,impressions,reach,frequency,clicks,inline_link_clicks,actions,date_start,date_stop",
      limit: "500",
      ...(after ? { after } : {}),
    }, config, fetchImpl);
    rows.push(...(json.data || []));
    after = json.paging?.cursors?.after && json.paging?.next ? json.paging.cursors.after : "";
    if (!after) break;
  }
  return { account, rows };
}

// Write insights into state. helpers: getOrCreateByExternalId, makeCode, newId, matchAgent, cleanText.
function applyInsights(state, { account, rows }, { from, to }, helpers) {
  const syncedAt = new Date().toISOString();
  const accountResult = helpers.getOrCreateByExternalId(state.adAccounts, "metaAccountId", String(account.id || "").replace(/^act_/, ""), "acc", {});
  Object.assign(accountResult.item, { name: account.name || accountResult.item.name || "Meta ad account", currency: account.currency || "", timezone: account.timezone_name || "", updatedAt: syncedAt });
  const accountId = accountResult.item.id;
  // CSV rows of this account inside the window are replaced by API rows; a CSV row
  // that straddles the window keeps only its share outside it.
  const kept = [];
  let replaced = 0;
  state.dailyLogs.forEach((log) => {
    if (log.source !== "meta_csv" || log.accountId !== accountId) { kept.push(log); return; }
    const start = log.reportingStart || log.date;
    const end = log.reportingEnd || log.date || start;
    if (!start || end < from || start > to) { kept.push(log); return; }
    const total = daysBetween(start, end);
    if (start < from) {
      const share = daysBetween(start, addDays(from, -1)) / total;
      kept.push({ ...log, reportingEnd: addDays(from, -1), spend: num(log.spend) * share, messages: Math.round(num(log.messages) * share), results: Math.round(num(log.results) * share), impressions: Math.round(num(log.impressions) * share), trimmedBy: "meta_api" });
    }
    if (end > to) {
      const share = daysBetween(addDays(to, 1), end) / total;
      kept.push({ ...log, id: `${log.id}-after`, date: addDays(to, 1), reportingStart: addDays(to, 1), spend: num(log.spend) * share, messages: Math.round(num(log.messages) * share), results: Math.round(num(log.results) * share), impressions: Math.round(num(log.impressions) * share), trimmedBy: "meta_api" });
    }
    replaced += 1;
  });
  state.dailyLogs = kept;
  let written = 0;
  rows.forEach((row) => {
    if (!row.ad_id || !row.date_start) return;
    const campaign = helpers.getOrCreateByExternalId(state.campaigns, "metaCampaignId", String(row.campaign_id), "cmp", {}).item;
    Object.assign(campaign, { accountId, name: row.campaign_name || campaign.name, objective: row.objective || campaign.objective || "", updatedAt: syncedAt, lastSeenAt: syncedAt });
    const adSet = helpers.getOrCreateByExternalId(state.adSets, "metaAdSetId", String(row.adset_id), "ads", {}).item;
    Object.assign(adSet, { campaignId: campaign.id, name: row.adset_name || adSet.name, objective: row.objective || adSet.objective || "", updatedAt: syncedAt, lastSeenAt: syncedAt });
    if (!adSet.agentId && helpers.matchAgent) Object.assign(adSet, helpers.matchAgent(state, row.adset_name, row.campaign_name));
    const adResult = helpers.getOrCreateByExternalId(state.creatives, "metaAdId", String(row.ad_id), "crt", { code: "" });
    if (adResult.created) { adResult.item.code = helpers.makeCode(state); state.usedCreativeCodes.push(adResult.item.code); }
    Object.assign(adResult.item, { adSetId: adSet.id, name: row.ad_name || adResult.item.name, updatedAt: syncedAt, lastSeenAt: syncedAt });
    const day = row.date_start;
    let log = state.dailyLogs.find((item) => item.source === "meta_api" && item.creativeId === adResult.item.id && item.date === day);
    if (!log) { log = { id: helpers.newId("log"), source: "meta_api", creativeId: adResult.item.id, createdAt: syncedAt }; state.dailyLogs.push(log); }
    Object.assign(log, {
      date: day, reportingStart: day, reportingEnd: row.date_stop || day,
      adSetId: adSet.id, campaignId: campaign.id, accountId,
      spend: num(row.spend), currency: account.currency || "",
      messages: actionValue(row.actions, ACTIONS.messages),
      messagesReplied: actionValue(row.actions, ACTIONS.messagesReplied),
      results: actionValue(row.actions, ACTIONS.leads) || actionValue(row.actions, ACTIONS.messages),
      leads: actionValue(row.actions, ACTIONS.leads),
      impressions: num(row.impressions), reach: num(row.reach), frequency: num(row.frequency),
      clicksAll: num(row.clicks), linkClicks: num(row.inline_link_clicks),
      updatedAt: syncedAt,
    });
    written += 1;
  });
  if (account.currency) state.settings.currency = account.currency;
  return { written, replaced, accountId, timezone: account.timezone_name || "", currency: account.currency || "" };
}

module.exports = { adsConfig, fetchInsights, applyInsights, graphGet, ACTIONS, addDays };
