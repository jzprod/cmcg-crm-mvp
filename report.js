// Detailed data extractor: one period-scoped report covering ads (campaign, ad
// set, ad), agents, outcomes, students and payments, with derived rates,
// break-even verdicts, previous-period comparison and rule-based decisions.
// Aggregation mirrors the browser's performanceRows() so numbers match the UI.
const CmcgQuality = require("./public/quality.js");
const CmcgProfit = require("./public/profit.js");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BASE_KEYS = ["spend", "impressions", "reach", "clicksAll", "linkClicks", "landingPageViews", "messages", "messagesReplied", "results"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PRESETS = ["today", "yesterday", "last7", "last14", "last30", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisYear", "lifetime", "custom"];

function round(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function ratio(part, whole) {
  return Number(whole) > 0 ? Number(part || 0) / Number(whole) : null;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

function daysBetween(from, to) {
  return Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000);
}

function todayIn(timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return dateKey(new Date());
  }
}

// Resolve a preset (or explicit from/to) into an inclusive date range.
function resolvePeriod({ preset = "", from = "", to = "", today } = {}) {
  const now = DATE_RE.test(today || "") ? today : dateKey(new Date());
  const weekday = new Date(`${now}T00:00:00Z`).getUTCDay() || 7; // Monday = 1
  const monthStart = `${now.slice(0, 8)}01`;
  const key = PRESETS.includes(preset) ? preset : (DATE_RE.test(from) || DATE_RE.test(to) ? "custom" : "last7");
  let range;
  if (key === "today") range = { from: now, to: now };
  else if (key === "yesterday") range = { from: shiftDays(now, -1), to: shiftDays(now, -1) };
  else if (key === "last14") range = { from: shiftDays(now, -13), to: now };
  else if (key === "last30") range = { from: shiftDays(now, -29), to: now };
  else if (key === "thisWeek") range = { from: shiftDays(now, 1 - weekday), to: now };
  else if (key === "lastWeek") range = { from: shiftDays(now, 1 - weekday - 7), to: shiftDays(now, -weekday) };
  else if (key === "thisMonth") range = { from: monthStart, to: now };
  else if (key === "lastMonth") {
    const lastMonthEnd = shiftDays(monthStart, -1);
    range = { from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd };
  } else if (key === "thisYear") range = { from: `${now.slice(0, 4)}-01-01`, to: now };
  else if (key === "lifetime") range = { from: "", to: "" };
  else if (key === "custom") {
    const start = DATE_RE.test(from) ? from : "";
    const end = DATE_RE.test(to) ? to : (start ? now : "");
    range = start && end && start > end ? { from: end, to: start } : { from: start, to: end };
  } else range = { from: shiftDays(now, -6), to: now };
  return { preset: key, today: now, ...range };
}

function overlaps(start, end, range) {
  return (!range.from || (end || start) >= range.from) && (!range.to || start <= range.to);
}

function inRange(value, range) {
  const date = String(value || "").slice(0, 10);
  if (!date) return false;
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}

function createIndex(state) {
  const map = (items) => new Map((items || []).map((item) => [item.id, item]));
  return {
    accounts: map(state.adAccounts),
    campaigns: map(state.campaigns),
    adSets: map(state.adSets),
    ads: map(state.creatives),
    agents: map(state.agents),
    programs: map(state.programs),
    groups: map(state.groups),
    students: map(state.students),
  };
}

function relationForAd(index, ad) {
  const adSet = index.adSets.get(ad?.adSetId) || null;
  const campaign = index.campaigns.get(adSet?.campaignId) || null;
  return { ad: ad || null, adSet, campaign, agent: index.agents.get(adSet?.agentId) || null };
}

function relationForLog(index, log) {
  if (log && !log.creativeId && (log.agentId || log.campaignId || log.adSetId)) {
    const adSet = index.adSets.get(log.adSetId) || null;
    const campaign = index.campaigns.get(log.campaignId || adSet?.campaignId) || null;
    return { ad: null, adSet, campaign, agent: index.agents.get(log.agentId || adSet?.agentId) || null };
  }
  return relationForAd(index, index.ads.get(log.creativeId));
}

function relationForOutcome(index, outcome) {
  const ad = index.ads.get(outcome.creativeId) || null;
  const adSet = index.adSets.get(outcome.adSetId || ad?.adSetId) || null;
  const campaign = index.campaigns.get(outcome.campaignId || adSet?.campaignId) || null;
  return { ad, adSet, campaign, agent: index.agents.get(outcome.agentId || adSet?.agentId) || null };
}

function logDay(log) {
  return String(log.reportingEnd || log.date || log.reportingStart || "").slice(0, 10);
}

function outcomeDay(outcome) {
  return String(outcome.sourceDate || outcome.date || "").slice(0, 10);
}

function emptyMetrics() {
  const metrics = { booked: 0, showed: 0, registered: 0, visits: 0, firstActivityDate: "", lastActivityDate: "" };
  BASE_KEYS.forEach((key) => { metrics[key] = 0; });
  return metrics;
}

function touchDate(target, value) {
  const date = String(value || "").slice(0, 10);
  if (!date) return;
  if (!target.firstActivityDate || date < target.firstActivityDate) target.firstActivityDate = date;
  if (!target.lastActivityDate || date > target.lastActivityDate) target.lastActivityDate = date;
}

function addLog(target, log) {
  BASE_KEYS.forEach((key) => { target[key] += Number(log[key] || 0); });
  touchDate(target, log.reportingStart || log.date);
  touchDate(target, log.reportingEnd || log.date);
}

function addOutcome(target, outcome, recentSince = "") {
  if (!["booked", "showed", "registered"].includes(outcome.type)) return;
  target[outcome.type] += 1;
  if (recentSince && String(outcome.date || "") >= recentSince) {
    if (outcome.type === "booked") target.recentBooked = (target.recentBooked || 0) + 1;
    if (outcome.type === "registered") target.recentRegistered = (target.recentRegistered || 0) + 1;
  }
  if (outcome.type === "showed" || outcome.type === "registered") target.visits += 1;
  touchDate(target, outcome.sourceDate || outcome.date);
  touchDate(target, outcome.date);
}

// Derived rates and costs for any metric bundle.
function derive(m, breakEven, rev = { perStudent: 0, rate: 1 }) {
  const revenue = m.registered * rev.perStudent;
  const spendLocal = m.spend * rev.rate;
  const costPer = (count) => (Number(count) > 0 && m.spend > 0 ? m.spend / count : null);
  return {
    cpm: m.impressions > 0 ? (m.spend / m.impressions) * 1000 : null,
    ctrLink: ratio(m.linkClicks, m.impressions),
    ctrAll: ratio(m.clicksAll, m.impressions),
    cpcLink: costPer(m.linkClicks),
    frequency: m.reach > 0 ? m.impressions / m.reach : null,
    costPerMessage: costPer(m.messages),
    replyRate: ratio(m.messagesReplied, m.messages),
    messageToBookedRate: ratio(m.booked, m.messages),
    messageToRegisteredRate: ratio(m.registered, m.messages),
    showRate: ratio(m.visits, m.booked),
    closeRate: ratio(m.registered, m.visits),
    bookedToRegisteredRate: ratio(m.registered, m.booked),
    costPerBooked: costPer(m.booked),
    costPerVisit: costPer(m.visits),
    costPerShowed: costPer(m.showed),
    costPerRegistered: costPer(m.registered),
    margin: m.registered * breakEven - m.spend,
    estimatedRevenue: revenue,
    profitAfterAds: revenue - spendLocal,
    roas: spendLocal > 0 ? revenue / spendLocal : null,
  };
}

function verdictOf(spend, results, limit) {
  const v = CmcgProfit.verdict(spend, results, limit);
  return {
    key: v.key,
    label: v.label,
    action: v.action,
    rank: v.rank,
    costVsBreakEven: round(v.ratio, 3),
    breakEven: round(v.breakEven),
    note: v.note || "",
    lowData: Boolean(v.lowData),
  };
}

function change(current, previous) {
  if (current === null || previous === null || current === undefined || previous === undefined) return null;
  if (!previous) return current ? null : 0;
  return (current - previous) / previous;
}

function roundObject(object) {
  const out = {};
  Object.entries(object).forEach(([key, value]) => {
    if (typeof value === "number") {
      const isRate = /Rate$|^ctr|share|change|Vs/i.test(key);
      out[key] = round(value, isRate ? 4 : 2);
    } else out[key] = value;
  });
  return out;
}

function buildDailySeries(range, rowsByDay) {
  if (!range.from || !range.to) return [...rowsByDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const days = [];
  for (let day = range.from; day <= range.to && days.length < 1100; day = shiftDays(day, 1)) {
    days.push(rowsByDay.get(day) || { date: day, ...emptyMetrics() });
  }
  return days;
}

// Aggregate one period: total, per level, per day, per entity per day.
function aggregate(state, index, range, recentSince = "") {
  const logs = state.dailyLogs.filter((log) => {
    const start = log.reportingStart || log.date || "";
    const end = log.reportingEnd || log.date || start;
    return start && overlaps(start, end, range);
  });
  const outcomes = state.outcomes.filter((outcome) => {
    const start = outcome.sourceDate || outcome.date;
    return start && overlaps(start, outcome.date, range);
  });
  const total = emptyMetrics();
  const levels = { campaign: new Map(), adSet: new Map(), ad: new Map(), agent: new Map() };
  const daily = new Map();
  const entityDaily = { campaign: new Map(), adSet: new Map(), ad: new Map(), agent: new Map() };
  const ensure = (map, key, extra = {}) => {
    if (!map.has(key)) map.set(key, { ...emptyMetrics(), ...extra });
    return map.get(key);
  };
  const dayRow = (map, key, day) => {
    if (!map.has(key)) map.set(key, new Map());
    return ensure(map.get(key), day, { date: day });
  };
  const keysFor = (relation) => ({
    campaign: relation.campaign?.id || "",
    adSet: relation.adSet?.id || "",
    ad: relation.ad?.id || "",
    agent: relation.agent?.id || "__unassigned",
  });

  logs.forEach((log) => {
    const keys = keysFor(relationForLog(index, log));
    const day = logDay(log);
    addLog(total, log);
    if (day) addLog(ensure(daily, day, { date: day }), log);
    Object.entries(keys).forEach(([level, key]) => {
      if (!key) return;
      addLog(ensure(levels[level], key), log);
      if (day) addLog(dayRow(entityDaily[level], key, day), log);
    });
  });

  outcomes.forEach((outcome) => {
    const keys = keysFor(relationForOutcome(index, outcome));
    const day = outcomeDay(outcome);
    addOutcome(total, outcome);
    if (day) addOutcome(ensure(daily, day, { date: day }), outcome);
    // Same inclusion rules as performanceRows(): an outcome counts at a level
    // only when it was attributed at (or below) that level.
    const eligible = {
      ad: outcome.assignmentLevel === "ad",
      adSet: Boolean(outcome.adSetId),
      campaign: Boolean(outcome.campaignId),
      agent: Boolean(outcome.agentId),
    };
    Object.entries(keys).forEach(([level, key]) => {
      if (!key || !eligible[level]) return;
      addOutcome(ensure(levels[level], key), outcome, recentSince);
      if (day) addOutcome(dayRow(entityDaily[level], key, day), outcome);
    });
  });

  return { logs, outcomes, total, levels, daily, entityDaily };
}

function latestLogFor(logs, predicate) {
  let latest = null;
  logs.forEach((log) => {
    if (!predicate(log)) return;
    if (!latest || logDay(log) > logDay(latest)) latest = log;
  });
  return latest;
}

function studentPaid(paymentsByStudent, studentId) {
  return (paymentsByStudent.get(studentId) || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

function dueState(student, remaining, paid, today) {
  if (remaining <= 0) return "paid";
  if (student.status === "cancelled") return "cancelled";
  const next = DATE_RE.test(student.nextPaymentDate || "") ? student.nextPaymentDate : "";
  if (next) {
    const dueIn = daysBetween(today, next);
    if (dueIn < 0) return "overdue";
    if (dueIn === 0) return "due_today";
    if (dueIn <= 7) return "due_soon";
    return "scheduled";
  }
  return paid > 0 ? "balance_no_date" : "no_payment_yet";
}

function buildReport(state, options = {}) {
  const period = resolvePeriod(options);
  const breakEven = Number(state.settings?.profit?.breakEvenCostPerRegistered) || 60;
  const dataStartDate = state.settings?.profit?.dataStartDate || "";
  const currency = state.settings?.currency || "MAD";
  const profitSettings = state.settings?.profit || {};
  const rev = {
    perStudent: Number(profitSettings.revenuePerRegistered) >= 0 && profitSettings.revenuePerRegistered !== undefined ? Number(profitSettings.revenuePerRegistered) : 3000,
    label: profitSettings.revenueCurrency || "DH",
    rate: Number(profitSettings.exchangeRate) > 0 ? Number(profitSettings.exchangeRate) : 10,
  };
  const includePersonal = Boolean(options.includePersonal);
  const includeStudents = options.includeStudents !== false;
  const respectDataStart = options.respectDataStart !== false && Boolean(dataStartDate);
  const index = createIndex(state);

  // Ad range: the requested period, clamped to the data start date like the Ads Manager.
  const adRange = { from: period.from, to: period.to || period.today };
  if (respectDataStart && (!adRange.from || adRange.from < dataStartDate)) adRange.from = dataStartDate;
  if (!adRange.from) {
    const firstLog = state.dailyLogs.map((log) => log.reportingStart || log.date).filter(Boolean).sort()[0];
    const firstOutcome = state.outcomes.map((o) => o.sourceDate || o.date).filter(Boolean).sort()[0];
    adRange.from = [firstLog, firstOutcome].filter(Boolean).sort()[0] || adRange.to;
  }
  const emptyAdRange = adRange.from > adRange.to;
  const dayCount = emptyAdRange ? 0 : daysBetween(adRange.from, adRange.to) + 1;
  const previousRange = dayCount > 0
    ? { from: shiftDays(adRange.from, -dayCount), to: shiftDays(adRange.from, -1) }
    : { from: "", to: "" };
  const previousUsable = dayCount > 0 && (!respectDataStart || previousRange.to >= dataStartDate);
  if (previousUsable && respectDataStart && previousRange.from < dataStartDate) previousRange.from = dataStartDate;

  const recentSince = shiftDays(period.today, -CmcgQuality.RDV_LAG_DAYS);
  const current = emptyAdRange ? aggregate({ dailyLogs: [], outcomes: [] }, index, adRange) : aggregate(state, index, adRange, recentSince);
  const previous = previousUsable ? aggregate(state, index, previousRange) : null;
  const lifetime = aggregate(state, index, respectDataStart ? { from: dataStartDate, to: "" } : { from: "", to: "" });
  const derivedTargets = CmcgProfit.derivedBreakEvens(lifetime.total, breakEven);

  // ---------- Summary ----------
  const summaryMetrics = { ...current.total, ...derive(current.total, breakEven, rev) };
  const previousMetrics = previous ? { ...previous.total, ...derive(previous.total, breakEven, rev) } : null;
  const comparisonKeys = ["spend", "impressions", "linkClicks", "messages", "booked", "showed", "registered", "visits", "costPerMessage", "costPerBooked", "costPerVisit", "costPerRegistered", "showRate", "closeRate", "messageToRegisteredRate", "margin"];
  const comparison = {};
  if (previousMetrics) {
    comparisonKeys.forEach((key) => {
      comparison[key] = { current: round(summaryMetrics[key], 4), previous: round(previousMetrics[key], 4), change: round(change(summaryMetrics[key], previousMetrics[key]), 4) };
    });
  }

  // ---------- Entity rows ----------
  const allLogsInPeriod = current.logs;
  function entityRow(level, key, metrics) {
    let info = {};
    if (level === "campaign") {
      const campaign = index.campaigns.get(key);
      const account = index.accounts.get(campaign?.accountId);
      const adSets = (state.adSets || []).filter((adSet) => adSet.campaignId === key);
      info = {
        id: key,
        metaId: campaign?.metaCampaignId || "",
        name: campaign?.name || "Unknown campaign",
        account: account?.name || "",
        objective: campaign?.objective || "",
        deliveryStatus: campaign?.deliveryStatus || "",
        agent: index.agents.get(campaign?.agentId)?.name || "",
        adSetCount: adSets.length,
        adCount: (state.creatives || []).filter((ad) => adSets.some((adSet) => adSet.id === ad.adSetId)).length,
      };
    } else if (level === "adSet") {
      const adSet = index.adSets.get(key);
      const campaign = index.campaigns.get(adSet?.campaignId);
      info = {
        id: key,
        metaId: adSet?.metaAdSetId || "",
        name: adSet?.name || "Unknown ad set",
        campaign: campaign?.name || "",
        campaignId: campaign?.id || "",
        objective: adSet?.objective || campaign?.objective || "",
        deliveryStatus: adSet?.deliveryStatus || "",
        agent: index.agents.get(adSet?.agentId)?.name || "",
        agentMatch: adSet?.agentMatchStatus || (adSet?.agentId ? "matched" : "unassigned"),
        agentMatchHint: adSet?.agentMatchHint || "",
        adCount: (state.creatives || []).filter((ad) => ad.adSetId === key).length,
      };
    } else if (level === "ad") {
      const ad = index.ads.get(key);
      const relation = relationForAd(index, ad);
      const latest = latestLogFor(allLogsInPeriod, (log) => log.creativeId === key);
      info = {
        id: key,
        metaId: ad?.metaAdId || "",
        code: ad?.code || "",
        name: ad?.name || "Unknown ad",
        adSet: relation.adSet?.name || "",
        adSetId: relation.adSet?.id || "",
        campaign: relation.campaign?.name || "",
        campaignId: relation.campaign?.id || "",
        objective: relation.adSet?.objective || relation.campaign?.objective || "",
        deliveryStatus: ad?.deliveryStatus || "",
        agent: relation.agent?.name || "",
        qualityRanking: latest?.qualityRanking || "",
        engagementRanking: latest?.engagementRanking || "",
        conversionRanking: latest?.conversionRanking || "",
        resultType: latest?.resultType || "",
      };
    }
    return { level, ...info, ...metrics };
  }

  function levelRows(level) {
    const map = current.levels[level];
    const rows = [...map.entries()].map(([key, metrics]) => entityRow(level, key, metrics));
    const scored = CmcgQuality.scoreRows(rows, state.settings || {}, new Date(`${period.today}T12:00:00Z`));
    return scored.map((row) => {
      const prev = previous?.levels[level].get(row.id);
      const derived = derive(row, breakEven, rev);
      const prevDerived = prev ? derive(prev, breakEven, rev) : null;
      const daily = buildDailySeries(adRange, current.entityDaily[level].get(row.id) || new Map());
      const trend = CmcgProfit.halfTrend(daily, "registered");
      const base = {};
      ["level", "id", "metaId", "code", "name", "account", "campaign", "campaignId", "adSet", "adSetId", "objective", "deliveryStatus", "agent", "agentMatch", "agentMatchHint", "adSetCount", "adCount", "qualityRanking", "engagementRanking", "conversionRanking", "resultType"]
        .forEach((key) => { if (row[key] !== undefined) base[key] = row[key]; });
      return {
        ...base,
        firstActivityDate: row.firstActivityDate,
        lastActivityDate: row.lastActivityDate,
        ...roundObject(Object.fromEntries([...BASE_KEYS, "booked", "showed", "registered", "visits"].map((key) => [key, row[key]]))),
        ...roundObject(derived),
        shareOfSpend: round(ratio(row.spend, current.total.spend), 4),
        shareOfRegistered: round(ratio(row.registered, current.total.registered), 4),
        verdict: verdictOf(row.spend, row.registered, breakEven),
        bookedVerdict: derivedTargets.booked ? verdictOf(row.spend, row.booked, derivedTargets.booked) : null,
        messageVerdict: derivedTargets.message ? verdictOf(row.spend, row.messages, derivedTargets.message) : null,
        quality: {
          score: row.qualityScore,
          status: row.qualityStatus?.label || "",
          confidence: row.qualityConfidence?.label || "",
          ageDays: row.ageDays,
          reason: row.qualityStatus?.reason || "",
          pendingRdv: row.pendingBooked || 0,
          projectedRegistered: round(row.projectedRegistered, 2),
        },
        previous: prev ? {
          spend: round(prev.spend),
          messages: prev.messages,
          booked: prev.booked,
          registered: prev.registered,
          costPerRegistered: round(prevDerived.costPerRegistered),
          costPerBooked: round(prevDerived.costPerBooked),
          costPerMessage: round(prevDerived.costPerMessage),
          spendChange: round(change(row.spend, prev.spend), 4),
          registeredChange: round(change(row.registered, prev.registered), 4),
          costPerRegisteredChange: round(change(derived.costPerRegistered, prevDerived.costPerRegistered), 4),
        } : null,
        trendInPeriod: trend ? {
          direction: trend.direction,
          good: trend.good,
          costBefore: round(trend.costBefore),
          costAfter: round(trend.costAfter),
          change: round(trend.change, 4),
          note: trend.note || "",
        } : null,
        daily: daily.map((day) => ({
          date: day.date,
          spend: round(day.spend),
          impressions: day.impressions,
          linkClicks: day.linkClicks,
          messages: day.messages,
          booked: day.booked,
          showed: day.showed,
          registered: day.registered,
          costPerMessage: round(ratio(day.spend, day.messages)),
          costPerRegistered: round(ratio(day.spend, day.registered)),
        })),
      };
    }).sort((a, b) => b.spend - a.spend || b.registered - a.registered || String(a.name).localeCompare(String(b.name)));
  }

  const campaigns = levelRows("campaign");
  const adSets = levelRows("adSet");
  const ads = levelRows("ad");

  // ---------- Students & payments (school side) ----------
  const paymentsByStudent = new Map();
  (state.payments || []).forEach((payment) => {
    if (!paymentsByStudent.has(payment.studentId)) paymentsByStudent.set(payment.studentId, []);
    paymentsByStudent.get(payment.studentId).push(payment);
  });
  const studentRange = { from: period.from, to: period.to || period.today };
  const studentRows = includeStudents ? (state.students || []).map((student) => {
    const group = index.groups.get(student.groupId);
    const program = index.programs.get(student.programId || group?.programId);
    const payments = paymentsByStudent.get(student.id) || [];
    const paid = studentPaid(paymentsByStudent, student.id);
    const total = Number(student.totalDue || 0);
    const remaining = Math.max(0, total - paid);
    const row = {
      id: student.id,
      registeredAt: student.registeredAt || "",
      registeredInPeriod: inRange(student.registeredAt, studentRange),
      status: student.status || "",
      training: program?.name || "",
      group: group?.name || "",
      agent: index.agents.get(student.agentId)?.name || "",
      agentId: student.agentId || "",
      paymentPlan: student.paymentPlan || "",
      totalDue: round(total),
      paid: round(paid),
      paidInPeriod: round(payments.filter((p) => inRange(p.paidAt, studentRange)).reduce((sum, p) => sum + Number(p.amount || 0), 0)),
      remaining: round(remaining),
      paidShare: round(ratio(paid, total), 4),
      paymentsCount: payments.length,
      lastPaymentDate: payments.map((p) => p.paidAt).filter(Boolean).sort().pop() || "",
      nextPaymentDate: student.nextPaymentDate || "",
      dueState: dueState(student, remaining, paid, period.today),
      daysOverdue: student.nextPaymentDate && remaining > 0 && student.nextPaymentDate < period.today ? daysBetween(student.nextPaymentDate, period.today) : 0,
      installmentAmount: round(student.installmentAmount || 0),
      installmentsCount: student.installmentsCount || 0,
    };
    if (includePersonal) Object.assign(row, { name: student.name || "", phone: student.phone || "", notes: student.notes || "", agreementNote: student.agreementNote || "" });
    return row;
  }).sort((a, b) => String(b.registeredAt).localeCompare(String(a.registeredAt))) : [];

  const paymentRows = includeStudents ? (state.payments || []).filter((payment) => inRange(payment.paidAt, studentRange)).map((payment) => {
    const student = index.students.get(payment.studentId);
    const group = index.groups.get(student?.groupId);
    const program = index.programs.get(student?.programId || group?.programId);
    const row = {
      id: payment.id,
      paidAt: payment.paidAt || "",
      amount: round(payment.amount),
      method: payment.method || "",
      studentId: payment.studentId,
      training: program?.name || "",
      group: group?.name || "",
      agent: index.agents.get(student?.agentId)?.name || "",
    };
    if (includePersonal) Object.assign(row, { student: student?.name || "", notes: payment.notes || "" });
    return row;
  }).sort((a, b) => String(a.paidAt).localeCompare(String(b.paidAt))) : [];

  const activeStudents = studentRows.filter((s) => s.status !== "cancelled");
  const finance = includeStudents ? {
    studentsTotal: studentRows.length,
    studentsActive: activeStudents.length,
    studentsRegisteredInPeriod: studentRows.filter((s) => s.registeredInPeriod).length,
    studentsCancelled: studentRows.filter((s) => s.status === "cancelled").length,
    collectedInPeriod: round(paymentRows.reduce((sum, p) => sum + p.amount, 0)),
    paymentsInPeriod: paymentRows.length,
    contractedValueActive: round(activeStudents.reduce((sum, s) => sum + s.totalDue, 0)),
    collectedAllTime: round(activeStudents.reduce((sum, s) => sum + s.paid, 0)),
    outstandingBalance: round(activeStudents.reduce((sum, s) => sum + s.remaining, 0)),
    overdueStudents: activeStudents.filter((s) => s.dueState === "overdue").length,
    overdueAmount: round(activeStudents.filter((s) => s.dueState === "overdue").reduce((sum, s) => sum + s.remaining, 0)),
    dueWithin7Days: activeStudents.filter((s) => ["due_today", "due_soon"].includes(s.dueState)).length,
    roasCollected: round(ratio(paymentRows.reduce((sum, p) => sum + p.amount, 0), current.total.spend), 3),
    netCollectedMinusSpend: round(paymentRows.reduce((sum, p) => sum + p.amount, 0) - current.total.spend),
    paymentMethods: paymentRows.reduce((acc, p) => { acc[p.method || "unknown"] = round((acc[p.method || "unknown"] || 0) + p.amount); return acc; }, {}),
  } : null;

  const trainings = includeStudents ? (state.programs || []).map((program) => {
    const students = studentRows.filter((s) => s.training === program.name);
    const active = students.filter((s) => s.status !== "cancelled");
    const groups = (state.groups || []).filter((group) => group.programId === program.id);
    const capacity = groups.reduce((sum, group) => sum + Number(group.capacity || 0), 0);
    return {
      training: program.name,
      groups: groups.length,
      capacity,
      activeStudents: active.length,
      fillRate: round(ratio(active.length, capacity), 4),
      registeredInPeriod: students.filter((s) => s.registeredInPeriod).length,
      collectedInPeriod: round(students.reduce((sum, s) => sum + s.paidInPeriod, 0)),
      outstanding: round(active.reduce((sum, s) => sum + s.remaining, 0)),
      overdueStudents: active.filter((s) => s.dueState === "overdue").length,
      monthlyPrice: round(program.monthlyPrice || 0),
      fullPrice: round(program.fullPrice || program.basePrice || 0),
      cashPrice: round(program.discountedPrice || 0),
    };
  }) : [];

  // ---------- Agents ----------
  const agentRowsRaw = [...new Set([...(state.agents || []).map((agent) => agent.id), ...current.levels.agent.keys()])].map((key) => {
    const agent = index.agents.get(key);
    const metrics = current.levels.agent.get(key) || emptyMetrics();
    return { key, id: key, name: key === "__unassigned" ? "Unassigned" : agent?.name || "Unknown agent", active: agent ? agent.active !== false : true, ...metrics };
  });
  const scoredAgents = CmcgQuality.scoreRows(agentRowsRaw, state.settings || {}, new Date(`${period.today}T12:00:00Z`));
  const agents = scoredAgents.map((row) => {
    const derived = derive(row, breakEven, rev);
    const prev = previous?.levels.agent.get(row.id);
    const prevDerived = prev ? derive(prev, breakEven, rev) : null;
    const mine = studentRows.filter((s) => s.agentId === row.id);
    const mineActive = mine.filter((s) => s.status !== "cancelled");
    const collected = mine.reduce((sum, s) => sum + s.paidInPeriod, 0);
    const potential = mineActive.reduce((sum, s) => sum + s.totalDue, 0);
    const agentAdSets = adSets.filter((adSet) => {
      const source = index.adSets.get(adSet.id);
      return (source?.agentId || "__unassigned") === row.id;
    });
    const ranked = agentAdSets.filter((adSet) => adSet.spend > 0).sort((a, b) => a.verdict.rank - b.verdict.rank || b.registered - a.registered);
    const daily = buildDailySeries(adRange, current.entityDaily.agent.get(row.id) || new Map());
    return {
      id: row.id === "__unassigned" ? "" : row.id,
      name: row.name,
      active: row.active,
      firstActivityDate: row.firstActivityDate,
      lastActivityDate: row.lastActivityDate,
      ...roundObject(Object.fromEntries([...BASE_KEYS, "booked", "showed", "registered", "visits"].map((key) => [key, row[key]]))),
      ...roundObject(derived),
      shareOfSpend: round(ratio(row.spend, current.total.spend), 4),
      shareOfRegistered: round(ratio(row.registered, current.total.registered), 4),
      verdict: verdictOf(row.spend, row.registered, breakEven),
      closing: {
        showRate: round(derived.showRate, 4),
        closeRate: round(derived.closeRate, 4),
        bookedToRegisteredRate: round(derived.bookedToRegisteredRate, 4),
        score: row.agentClosingScore,
        status: row.agentClosingStatus?.label || "",
      },
      quality: { score: row.qualityScore, status: row.qualityStatus?.label || "", confidence: row.qualityConfidence?.label || "" },
      school: includeStudents ? {
        studentsTotal: mine.length,
        studentsActive: mineActive.length,
        studentsRegisteredInPeriod: mine.filter((s) => s.registeredInPeriod).length,
        crmRegisteredOutcomes: row.registered,
        collectedInPeriod: round(collected),
        potentialValue: round(potential),
        outstanding: round(mineActive.reduce((sum, s) => sum + s.remaining, 0)),
        overdueStudents: mineActive.filter((s) => s.dueState === "overdue").length,
        overdueAmount: round(mineActive.filter((s) => s.dueState === "overdue").reduce((sum, s) => sum + s.remaining, 0)),
        roi: round(ratio(collected, row.spend), 3),
        roiNet: round(collected - row.spend),
        potentialRoi: round(ratio(potential, row.spend), 3),
      } : null,
      adSetsActive: agentAdSets.length,
      bestAdSets: ranked.slice(0, 3).map((adSet) => ({ name: adSet.name, verdict: adSet.verdict.label, spend: adSet.spend, registered: adSet.registered, costPerRegistered: adSet.costPerRegistered })),
      worstAdSets: ranked.slice(-3).reverse().filter((adSet) => !ranked.slice(0, 3).includes(adSet)).map((adSet) => ({ name: adSet.name, verdict: adSet.verdict.label, spend: adSet.spend, registered: adSet.registered, costPerRegistered: adSet.costPerRegistered })),
      previous: prev ? {
        spend: round(prev.spend),
        booked: prev.booked,
        registered: prev.registered,
        costPerRegistered: round(prevDerived.costPerRegistered),
        closeRate: round(prevDerived.closeRate, 4),
        registeredChange: round(change(row.registered, prev.registered), 4),
        costPerRegisteredChange: round(change(derived.costPerRegistered, prevDerived.costPerRegistered), 4),
      } : null,
      daily: daily.map((day) => ({ date: day.date, spend: round(day.spend), messages: day.messages, booked: day.booked, showed: day.showed, registered: day.registered })),
    };
  }).filter((row) => row.id || row.spend > 0 || row.messages > 0)
    .sort((a, b) => b.registered - a.registered || (a.costPerRegistered ?? Infinity) - (b.costPerRegistered ?? Infinity) || b.spend - a.spend);

  // Rank agents (excluding Unassigned) on the main business metrics.
  const rankable = agents.filter((agent) => agent.id);
  const rankBy = (key, lowerIsBetter = false) => {
    const sorted = rankable.filter((agent) => agent[key] !== null && agent[key] !== undefined && (!lowerIsBetter || agent[key] > 0))
      .sort((a, b) => (lowerIsBetter ? a[key] - b[key] : b[key] - a[key]));
    sorted.forEach((agent, position) => { agent.ranks = { ...(agent.ranks || {}), [key]: position + 1 }; });
  };
  rankBy("registered");
  rankBy("booked");
  rankBy("costPerRegistered", true);
  rankBy("margin");

  // ---------- Outcomes ----------
  const outcomes = current.outcomes.map((outcome) => {
    const relation = relationForOutcome(index, outcome);
    const row = {
      id: outcome.id,
      type: outcome.type,
      date: outcome.date || "",
      firstContactDate: outcome.sourceDate || "",
      lagDays: outcome.sourceDate && outcome.date ? daysBetween(outcome.sourceDate, outcome.date) : null,
      attributedAt: outcome.assignmentLevel || "",
      ad: relation.ad?.name || "",
      adCode: relation.ad?.code || "",
      adSet: relation.adSet?.name || "",
      campaign: relation.campaign?.name || "",
      agent: relation.agent?.name || "",
    };
    if (includePersonal) Object.assign(row, { person: outcome.personName || "", phone: outcome.phone || "", notes: outcome.notes || "" });
    return row;
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const lags = outcomes.filter((o) => o.type === "registered" && o.lagDays !== null).map((o) => o.lagDays).sort((a, b) => a - b);
  const attribution = {
    byLevel: outcomes.reduce((acc, o) => { acc[o.attributedAt || "unknown"] = (acc[o.attributedAt || "unknown"] || 0) + 1; return acc; }, {}),
    withoutAgent: current.outcomes.filter((o) => !o.agentId).length,
    registeredMedianLagDays: lags.length ? lags[Math.floor(lags.length / 2)] : null,
  };

  // ---------- Breakdowns ----------
  const dailyRows = buildDailySeries(adRange, current.daily).map((day) => ({
    date: day.date,
    weekday: WEEKDAYS[new Date(`${day.date}T00:00:00Z`).getUTCDay()],
    ...roundObject(Object.fromEntries([...BASE_KEYS, "booked", "showed", "registered", "visits"].map((key) => [key, day[key]]))),
    ...roundObject(derive(day, breakEven, rev)),
  }));
  const weekdayMap = new Map(WEEKDAYS.map((name) => [name, { weekday: name, days: 0, ...emptyMetrics() }]));
  buildDailySeries(adRange, current.daily).forEach((day) => {
    const target = weekdayMap.get(WEEKDAYS[new Date(`${day.date}T00:00:00Z`).getUTCDay()]);
    target.days += 1;
    BASE_KEYS.forEach((key) => { target[key] += Number(day[key] || 0); });
    ["booked", "showed", "registered", "visits"].forEach((key) => { target[key] += Number(day[key] || 0); });
  });
  const weekdays = [1, 2, 3, 4, 5, 6, 0].map((i) => weekdayMap.get(WEEKDAYS[i])).filter((row) => row.days).map((row) => ({
    weekday: row.weekday,
    days: row.days,
    spend: round(row.spend),
    messages: row.messages,
    booked: row.booked,
    registered: row.registered,
    costPerMessage: round(ratio(row.spend, row.messages)),
    costPerBooked: round(ratio(row.spend, row.booked)),
    costPerRegistered: round(ratio(row.spend, row.registered)),
    messagesPerDay: round(ratio(row.messages, row.days)),
  }));
  const weekly = [];
  for (let i = 0; i < dailyRows.length; i += 7) {
    const slice = dailyRows.slice(i, i + 7);
    const m = emptyMetrics();
    slice.forEach((day) => {
      BASE_KEYS.forEach((key) => { m[key] += Number(day[key] || 0); });
      ["booked", "showed", "registered", "visits"].forEach((key) => { m[key] += Number(day[key] || 0); });
    });
    weekly.push({ from: slice[0].date, to: slice[slice.length - 1].date, spend: round(m.spend), messages: m.messages, booked: m.booked, showed: m.showed, registered: m.registered, costPerMessage: round(ratio(m.spend, m.messages)), costPerBooked: round(ratio(m.spend, m.booked)), costPerRegistered: round(ratio(m.spend, m.registered)), margin: round(m.registered * breakEven - m.spend) });
  }
  const objectiveMap = new Map();
  campaigns.forEach((campaign) => {
    const key = campaign.objective || "Unknown";
    if (!objectiveMap.has(key)) objectiveMap.set(key, { objective: key, campaigns: 0, spend: 0, messages: 0, booked: 0, registered: 0 });
    const target = objectiveMap.get(key);
    target.campaigns += 1;
    ["spend", "messages", "booked", "registered"].forEach((field) => { target[field] += Number(campaign[field] || 0); });
  });
  const objectives = [...objectiveMap.values()].map((row) => ({ ...row, spend: round(row.spend), costPerMessage: round(ratio(row.spend, row.messages)), costPerRegistered: round(ratio(row.spend, row.registered)) }));
  const verdictMix = {};
  adSets.forEach((adSet) => {
    const key = adSet.verdict.label;
    verdictMix[key] = verdictMix[key] || { adSets: 0, spend: 0, registered: 0 };
    verdictMix[key].adSets += 1;
    verdictMix[key].spend = round(verdictMix[key].spend + adSet.spend);
    verdictMix[key].registered += adSet.registered;
  });

  // ---------- Data health ----------
  const unassignedAdSets = (state.adSets || []).filter((adSet) => adSet.metaAdSetId && !adSet.agentId);
  const lastImport = (state.imports || [])[0] || null;
  const latestDataDate = state.dailyLogs.map(logDay).filter(Boolean).sort().pop() || "";
  const dataHealth = {
    lastImportAt: lastImport?.importedAt || "",
    lastImportFile: lastImport?.filename || "",
    latestAdDataDate: latestDataDate,
    daysSinceLatestAdData: latestDataDate ? daysBetween(latestDataDate, period.today) : null,
    unassignedAdSets: unassignedAdSets.length,
    unassignedSpendInPeriod: round(current.levels.agent.get("__unassigned")?.spend || 0),
    outcomesWithoutAgent: attribution.withoutAgent,
    manualSpendInPeriod: round(current.logs.filter((log) => log.source === "manual").reduce((sum, log) => sum + Number(log.spend || 0), 0)),
    crmRegisteredOutcomes: current.total.registered,
    studentsRegisteredInPeriod: finance ? finance.studentsRegisteredInPeriod : null,
  };

  // ---------- Decisions ----------
  const insights = buildInsights({ campaigns, adSets, ads, agents, summary: summaryMetrics, previous: previousMetrics, finance, dataHealth, breakEven, currency, period });

  return {
    meta: {
      title: "CMCG CRM detailed performance report",
      generatedAt: new Date().toISOString(),
      centre: state.centre || {},
      currency,
      period: { preset: period.preset, requestedFrom: period.from, requestedTo: period.to, from: adRange.from, to: adRange.to, days: dayCount, today: period.today },
      previousPeriod: previousUsable ? { ...previousRange, days: daysBetween(previousRange.from, previousRange.to) + 1 } : null,
      dataStartDate: respectDataStart ? dataStartDate : "",
      breakEvenCostPerRegistered: breakEven,
      revenuePerRegistered: rev.perStudent,
      revenueCurrency: rev.label,
      exchangeRate: rev.rate,
      derivedBreakEvens: {
        costPerBooked: round(derivedTargets.booked),
        costPerMessage: round(derivedTargets.message),
        bookedToRegisteredRate: round(derivedTargets.bookedToRegistered, 4),
        messageToRegisteredRate: round(derivedTargets.messageToRegistered, 4),
      },
      personalDataIncluded: includePersonal,
      studentDataIncluded: includeStudents,
      definitions: DEFINITIONS,
    },
    summary: { ...roundObject(summaryMetrics), verdict: verdictOf(current.total.spend, current.total.registered, breakEven) },
    comparison,
    finance,
    insights,
    dataHealth,
    daily: dailyRows,
    weekly,
    weekdays,
    objectives,
    verdictMix,
    campaigns,
    adSets,
    ads,
    agents,
    outcomes,
    attribution,
    trainings,
    students: studentRows,
    payments: paymentRows,
  };
}

const DEFINITIONS = {
  spend: "Ad spend from Meta CSV imports plus manual budgets",
  messages: "Messaging conversations started (Meta)",
  booked: "Booked appointments recorded in the CRM",
  showed: "Visited the centre without registering",
  registered: "Registered students recorded as CRM outcomes",
  visits: "showed + registered",
  showRate: "visits / booked",
  closeRate: "registered / visits",
  margin: "registered x break-even - spend (positive = profit vs break-even)",
  estimatedRevenue: "registered x average revenue per student, in the revenue currency (DH)",
  profitAfterAds: "estimated revenue - spend converted with the exchange rate, in the revenue currency",
  roas: "estimated revenue / spend (both in the revenue currency)",
  verdict: "Cost per registration vs break-even: <=0.5 very profitable, <=0.8 profitable, <0.95 slightly profitable, 0.95-1.05 break-even, <=1.3 slight loss, <=2 losing, >2 heavy loss; spend without registration is Learning below break-even",
  frequency: "impressions / summed daily reach (approximate across days)",
  quality: "Automatic business-quality score learned from all rows of the same level",
  previous: "Same number of days immediately before the period",
};

function fmtMoney(value, currency) {
  return value === null || value === undefined ? "-" : `${Number(value).toFixed(2)} ${currency}`;
}

function pct(value) {
  return value === null || value === undefined ? "-" : `${(Number(value) * 100).toFixed(1)}%`;
}

// Rule-based decisions; each names the entity, the action, and why.
function buildInsights({ campaigns, adSets, ads, agents, summary, previous, finance, dataHealth, breakEven, currency, period }) {
  const items = [];
  const push = (priority, category, level, name, action, reason) => items.push({ priority, category, level, name, action, reason });
  const money = (value) => fmtMoney(value, currency);

  adSets.forEach((row) => {
    const v = row.verdict;
    if (["scale", "profit"].includes(v.key) && row.registered >= 2) {
      push(1, "scale", "adSet", row.name, "Increase budget 20-30%", `${row.registered} registrations at ${money(row.costPerRegistered)} each (break-even ${money(breakEven)}), margin ${money(row.margin)}.`);
    } else if (["losing", "heavy"].includes(v.key) && row.spend >= breakEven) {
      push(1, "cut", "adSet", row.name, v.key === "heavy" ? "Pause" : "Cut budget or pause", v.noResult || !row.registered ? `Spent ${money(row.spend)} with no registration (break-even ${money(breakEven)}).` : `Cost per registration ${money(row.costPerRegistered)} is ${(v.costVsBreakEven || 0).toFixed(2)}x break-even.`);
    } else if (v.key === "loss") {
      push(2, "fix", "adSet", row.name, "Fix creative or follow-up", row.registered ? `Slightly above break-even: ${money(row.costPerRegistered)} per registration.` : `Spent ${money(row.spend)} with no registration yet (break-even ${money(breakEven)}).`);
    } else if (v.key === "learning" && row.spend > 0) {
      push(3, "wait", "adSet", row.name, "Let it spend", v.note);
    }
    if (row.messages >= 20 && row.booked === 0) {
      push(2, "follow-up", "adSet", row.name, "Check WhatsApp follow-up", `${row.messages} conversations but no booked appointment${row.agent ? ` (agent ${row.agent})` : ""}.`);
    }
    if (row.previous && row.previous.costPerRegisteredChange !== null && row.previous.costPerRegisteredChange > 0.25 && row.registered > 0) {
      push(2, "trend", "adSet", row.name, "Watch rising cost", `Cost per registration up ${pct(row.previous.costPerRegisteredChange)} vs previous period (${money(row.previous.costPerRegistered)} -> ${money(row.costPerRegistered)}).`);
    }
    if (row.agentMatch !== "matched" && row.spend > 0) {
      push(2, "data", "adSet", row.name, "Assign an agent", `Spend ${money(row.spend)} is not linked to any agent${row.agentMatchHint ? ` (name found: "${row.agentMatchHint}")` : ""}. Put the agent's name in quotes in the ad set name.`);
    }
  });

  ads.forEach((row) => {
    if (row.frequency !== null && row.frequency >= 3.5 && row.spend > 0) {
      push(2, "creative", "ad", row.name, "Refresh creative", `Frequency ${row.frequency.toFixed(2)} suggests audience fatigue.`);
    }
    if (row.ctrLink !== null && row.impressions >= 2000 && row.ctrLink < 0.005) {
      push(3, "creative", "ad", row.name, "Test a new hook", `Link CTR ${pct(row.ctrLink)} on ${row.impressions} impressions.`);
    }
    if (/below/i.test(row.qualityRanking || "")) {
      push(3, "creative", "ad", row.name, "Improve creative quality", `Meta quality ranking: ${row.qualityRanking}.`);
    }
  });

  const team = agents.filter((agent) => agent.id && agent.visits >= 3);
  const teamClose = team.length ? team.reduce((sum, agent) => sum + agent.registered, 0) / Math.max(1, team.reduce((sum, agent) => sum + agent.visits, 0)) : null;
  agents.forEach((agent) => {
    if (!agent.id) return;
    if (teamClose !== null && agent.visits >= 3 && agent.closeRate !== null && agent.closeRate < teamClose * 0.7) {
      push(2, "agent", "agent", agent.name, "Coach closing", `Close rate ${pct(agent.closeRate)} vs team ${pct(teamClose)} on ${agent.visits} visits.`);
    }
    if (agent.booked >= 4 && agent.showRate !== null && agent.showRate < 0.4) {
      push(2, "agent", "agent", agent.name, "Improve appointment reminders", `Only ${pct(agent.showRate)} of ${agent.booked} booked appointments came to the centre.`);
    }
    if (["scale", "profit"].includes(agent.verdict.key) && agent.registered >= 2) {
      push(1, "scale", "agent", agent.name, "Give this agent more budget", `${agent.registered} registrations at ${money(agent.costPerRegistered)} each.`);
    }
    if (agent.school && agent.school.overdueStudents > 0) {
      push(2, "payments", "agent", agent.name, "Collect overdue payments", `${agent.school.overdueStudents} students overdue, ${money(agent.school.overdueAmount)} outstanding.`);
    }
  });

  if (previous && summary.costPerRegistered !== null && previous.costPerRegistered && summary.costPerRegistered > previous.costPerRegistered * 1.2) {
    push(1, "trend", "account", "All ads", "Review the account", `Cost per registration rose from ${money(previous.costPerRegistered)} to ${money(summary.costPerRegistered)}.`);
  }
  if (dataHealth.daysSinceLatestAdData !== null && dataHealth.daysSinceLatestAdData > 1) {
    push(1, "data", "account", "Meta import", "Import the latest Meta report", `Newest ad data is from ${dataHealth.latestAdDataDate} (${dataHealth.daysSinceLatestAdData} days before ${period.today}).`);
  }
  if (dataHealth.outcomesWithoutAgent > 0) {
    push(3, "data", "account", "Outcomes", "Link outcomes to agents", `${dataHealth.outcomesWithoutAgent} outcomes in this period have no agent.`);
  }
  if (dataHealth.studentsRegisteredInPeriod !== null && dataHealth.studentsRegisteredInPeriod !== dataHealth.crmRegisteredOutcomes) {
    push(3, "data", "account", "Registrations", "Reconcile registrations", `${dataHealth.studentsRegisteredInPeriod} students registered in the school module vs ${dataHealth.crmRegisteredOutcomes} "registered" outcomes attributed to ads.`);
  }
  if (finance && finance.overdueStudents > 0) {
    push(2, "payments", "account", "Students", "Chase overdue payments", `${finance.overdueStudents} students overdue for ${money(finance.overdueAmount)}.`);
  }
  campaigns.forEach((row) => {
    if (["losing", "heavy"].includes(row.verdict.key) && row.spend >= breakEven * 2) {
      push(1, "cut", "campaign", row.name, "Reduce campaign budget", `${money(row.spend)} spent, ${row.registered} registrations (${row.verdict.label}).`);
    }
  });

  return items.sort((a, b) => a.priority - b.priority || a.category.localeCompare(b.category));
}

// ---------- CSV ----------
const CSV_TABLES = {
  summary: (report) => [Object.fromEntries(Object.entries(report.summary).filter(([, v]) => typeof v !== "object").concat([["verdict", report.summary.verdict.label]]))],
  comparison: (report) => Object.entries(report.comparison).map(([metric, v]) => ({ metric, ...v })),
  insights: (report) => report.insights,
  daily: (report) => report.daily,
  weekly: (report) => report.weekly,
  weekdays: (report) => report.weekdays,
  campaigns: (report) => report.campaigns.map(flattenEntity),
  adsets: (report) => report.adSets.map(flattenEntity),
  ads: (report) => report.ads.map(flattenEntity),
  agents: (report) => report.agents.map(flattenAgent),
  outcomes: (report) => report.outcomes,
  trainings: (report) => report.trainings,
  students: (report) => report.students,
  payments: (report) => report.payments,
};

function flattenEntity(row) {
  const { daily, verdict, bookedVerdict, messageVerdict, quality, previous, trendInPeriod, ...rest } = row;
  return {
    ...rest,
    verdict: verdict?.label || "",
    verdictAction: verdict?.action || "",
    costVsBreakEven: verdict?.costVsBreakEven ?? "",
    verdictNote: verdict?.note || "",
    bookedVerdict: bookedVerdict?.label || "",
    messageVerdict: messageVerdict?.label || "",
    qualityScore: quality?.score ?? "",
    qualityStatus: quality?.status || "",
    qualityConfidence: quality?.confidence || "",
    prevSpend: previous?.spend ?? "",
    prevRegistered: previous?.registered ?? "",
    prevCostPerRegistered: previous?.costPerRegistered ?? "",
    costPerRegisteredChange: previous?.costPerRegisteredChange ?? "",
    trendDirection: trendInPeriod?.direction || "",
    trendCostBefore: trendInPeriod?.costBefore ?? "",
    trendCostAfter: trendInPeriod?.costAfter ?? "",
  };
}

function flattenAgent(row) {
  const { daily, verdict, closing, quality, school, bestAdSets, worstAdSets, previous, ranks, ...rest } = row;
  return {
    ...rest,
    verdict: verdict?.label || "",
    verdictAction: verdict?.action || "",
    closingScore: closing?.score ?? "",
    closingStatus: closing?.status || "",
    qualityScore: quality?.score ?? "",
    rankRegistered: ranks?.registered ?? "",
    rankCostPerRegistered: ranks?.costPerRegistered ?? "",
    rankMargin: ranks?.margin ?? "",
    studentsRegisteredInPeriod: school?.studentsRegisteredInPeriod ?? "",
    studentsActive: school?.studentsActive ?? "",
    collectedInPeriod: school?.collectedInPeriod ?? "",
    potentialValue: school?.potentialValue ?? "",
    outstanding: school?.outstanding ?? "",
    overdueStudents: school?.overdueStudents ?? "",
    roi: school?.roi ?? "",
    roiNet: school?.roiNet ?? "",
    prevRegistered: previous?.registered ?? "",
    prevCostPerRegistered: previous?.costPerRegistered ?? "",
    bestAdSets: (bestAdSets || []).map((a) => a.name).join(" | "),
    worstAdSets: (worstAdSets || []).map((a) => a.name).join(" | "),
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") value = JSON.stringify(value);
  let text = String(value);
  // Neutralize spreadsheet formulas in text cells (numbers stay numbers).
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = [...rows.reduce((set, row) => { Object.keys(row).forEach((key) => set.add(key)); return set; }, new Set())];
  return [headers.map(csvCell).join(","), ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(","))].join("\r\n");
}

function toCsv(report, table = "all") {
  if (table !== "all") {
    const builder = CSV_TABLES[table];
    if (!builder) throw new Error(`Unknown table. Use one of: all, ${Object.keys(CSV_TABLES).join(", ")}`);
    return `﻿${rowsToCsv(builder(report))}`;
  }
  const sections = Object.entries(CSV_TABLES).map(([name, builder]) => {
    const rows = builder(report);
    return `### ${name.toUpperCase()} (${rows.length})\r\n${rowsToCsv(rows) || "(no rows)"}`;
  });
  return `﻿${sections.join("\r\n\r\n")}`;
}

// ---------- Markdown (paste into Claude / ChatGPT) ----------
function mdCell(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value).replace(/\|/g, "/").replace(/\r?\n/g, " ");
}

function mdTable(rows, columns) {
  if (!rows.length) return "_No rows._\n";
  const head = `| ${columns.map(([label]) => label).join(" | ")} |`;
  const line = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map(([, get]) => mdCell(get(row))).join(" | ")} |`);
  return [head, line, ...body].join("\n") + "\n";
}

function toMarkdown(report) {
  const c = report.meta.currency;
  const m = (value) => (value === null || value === undefined ? "-" : `${Number(value).toFixed(2)}`);
  const p = pct;
  const s = report.summary;
  const out = [];
  out.push(`# ${report.meta.title}`);
  out.push("");
  out.push(`Centre: ${report.meta.centre.name || "CMCG"} (${report.meta.centre.city || ""}) · Currency: ${c} · Period: ${report.meta.period.from} -> ${report.meta.period.to} (${report.meta.period.days} days, preset ${report.meta.period.preset})`);
  if (report.meta.previousPeriod) out.push(`Compared with previous period: ${report.meta.previousPeriod.from} -> ${report.meta.previousPeriod.to}`);
  out.push(`Break-even cost per registration: ${m(report.meta.breakEvenCostPerRegistered)} ${c} · Derived break-even per booked appointment: ${m(report.meta.derivedBreakEvens.costPerBooked)} · per message: ${m(report.meta.derivedBreakEvens.costPerMessage)}`);
  out.push(`Average revenue per registered student: ${report.meta.revenuePerRegistered} ${report.meta.revenueCurrency} · 1 ${c} of ad spend = ${report.meta.exchangeRate} ${report.meta.revenueCurrency}`);
  out.push(`Generated: ${report.meta.generatedAt}`);
  out.push("");
  out.push("> **Instructions for the AI analyst:** This is a click-to-WhatsApp advertising business (a training centre). Meta reports spend and conversations; the CRM adds booked appointments, centre visits and registered students, which are the real goal. Judge ads by cost per registration against the break-even above, not by cost per message. Using the data below: (1) list what is working and why, (2) list what is not working and why, (3) give concrete decisions per campaign / ad set / ad (scale by how much, keep, fix, pause), (4) assess each sales agent's follow-up and closing, (5) flag data problems that make the analysis unreliable. Be specific and cite the numbers.");
  out.push(">");
  out.push("> **If you can act on the Meta Ads account:** finish with an \"Action plan\" table (Meta ID, level, name, current status/budget as read from Meta, action: pause / activate / change daily budget from X to Y, reason). Use the Meta IDs from the tables below. Raise budgets by at most 30% at a time, never pause something still in Learning, and show me the plan and wait for my confirmation before changing anything.");
  out.push("");
  out.push("## Summary");
  out.push(mdTable([s], [
    ["Spend", (r) => m(r.spend)], ["Impr.", (r) => r.impressions], ["Link clicks", (r) => r.linkClicks], ["Messages", (r) => r.messages], ["Booked", (r) => r.booked], ["Showed", (r) => r.showed], ["Registered", (r) => r.registered],
    ["Cost/msg", (r) => m(r.costPerMessage)], ["Cost/booked", (r) => m(r.costPerBooked)], ["Cost/visit", (r) => m(r.costPerVisit)], ["Cost/reg.", (r) => m(r.costPerRegistered)], ["Margin", (r) => m(r.margin)], ["Verdict", (r) => r.verdict.label],
  ]));
  out.push(mdTable([s], [
    [`Est. revenue (${report.meta.revenueCurrency})`, (r) => Math.round(r.estimatedRevenue)], [`Profit after ads (${report.meta.revenueCurrency})`, (r) => Math.round(r.profitAfterAds)], ["ROAS", (r) => (r.roas === null ? "-" : `${r.roas.toFixed(1)}x`)],
  ]));
  out.push(mdTable([s], [
    ["CPM", (r) => m(r.cpm)], ["Link CTR", (r) => p(r.ctrLink)], ["CPC", (r) => m(r.cpcLink)], ["Frequency", (r) => m(r.frequency)], ["Reply rate", (r) => p(r.replyRate)], ["Msg->booked", (r) => p(r.messageToBookedRate)], ["Show rate", (r) => p(r.showRate)], ["Close rate", (r) => p(r.closeRate)], ["Msg->reg.", (r) => p(r.messageToRegisteredRate)],
  ]));
  if (Object.keys(report.comparison).length) {
    out.push("## Versus previous period");
    out.push(mdTable(Object.entries(report.comparison).map(([metric, v]) => ({ metric, ...v })), [
      ["Metric", (r) => r.metric], ["Current", (r) => r.current], ["Previous", (r) => r.previous], ["Change", (r) => p(r.change)],
    ]));
  }
  if (report.finance) {
    const f = report.finance;
    out.push("## Money collected & students");
    out.push(mdTable([f], [
      ["Registered (school)", (r) => r.studentsRegisteredInPeriod], ["Active students", (r) => r.studentsActive], ["Collected in period", (r) => m(r.collectedInPeriod)], ["ROAS (collected/spend)", (r) => r.roasCollected], ["Net (collected-spend)", (r) => m(r.netCollectedMinusSpend)], ["Outstanding", (r) => m(r.outstandingBalance)], ["Overdue students", (r) => r.overdueStudents], ["Overdue amount", (r) => m(r.overdueAmount)],
    ]));
  }
  out.push("## Rule-based decisions (pre-computed)");
  out.push(mdTable(report.insights, [["P", (r) => r.priority], ["Type", (r) => r.category], ["Level", (r) => r.level], ["Name", (r) => r.name], ["Action", (r) => r.action], ["Why", (r) => r.reason]]));
  out.push("## Data health");
  out.push(Object.entries(report.dataHealth).map(([key, value]) => `- ${key}: ${value === null || value === "" ? "-" : value}`).join("\n") + "\n");
  const entityCols = (extra = []) => [
    ["Name", (r) => r.name], ...extra, ["Agent", (r) => r.agent], ["Status", (r) => r.deliveryStatus], ["Spend", (r) => m(r.spend)], ["Share", (r) => p(r.shareOfSpend)], ["Impr.", (r) => r.impressions], ["CTR", (r) => p(r.ctrLink)], ["Freq.", (r) => m(r.frequency)], ["Msgs", (r) => r.messages], ["Cost/msg", (r) => m(r.costPerMessage)], ["Booked", (r) => r.booked], ["Showed", (r) => r.showed], ["Reg.", (r) => r.registered],
    ["Cost/booked", (r) => m(r.costPerBooked)], ["Cost/reg.", (r) => m(r.costPerRegistered)], ["Margin", (r) => m(r.margin)], ["Verdict", (r) => `${r.verdict.label} (${r.verdict.action})`], ["Quality", (r) => r.quality.score ?? r.quality.status], ["Prev cost/reg.", (r) => m(r.previous?.costPerRegistered)], ["Trend", (r) => r.trendInPeriod ? `${r.trendInPeriod.direction}${r.trendInPeriod.change !== null ? ` ${p(r.trendInPeriod.change)}` : ""}` : "-"],
  ];
  out.push("## Campaigns");
  out.push(mdTable(report.campaigns, entityCols([["Meta ID", (r) => r.metaId], ["Objective", (r) => r.objective]])));
  out.push("## Ad sets");
  out.push(mdTable(report.adSets, entityCols([["Meta ID", (r) => r.metaId], ["Campaign", (r) => r.campaign]])));
  out.push("## Ads");
  out.push(mdTable(report.ads, entityCols([["Meta ID", (r) => r.metaId], ["Code", (r) => r.code], ["Ad set", (r) => r.adSet], ["Meta quality", (r) => [r.qualityRanking, r.engagementRanking, r.conversionRanking].filter(Boolean).join(" / ")]])));
  out.push("## Agents");
  out.push(mdTable(report.agents, [
    ["Agent", (r) => r.name], ["Spend", (r) => m(r.spend)], ["Msgs", (r) => r.messages], ["Booked", (r) => r.booked], ["Showed", (r) => r.showed], ["Reg.", (r) => r.registered], ["Cost/reg.", (r) => m(r.costPerRegistered)], ["Margin", (r) => m(r.margin)], ["Msg->booked", (r) => p(r.messageToBookedRate)], ["Show rate", (r) => p(r.closing.showRate)], ["Close rate", (r) => p(r.closing.closeRate)], ["Closing score", (r) => r.closing.score ?? r.closing.status],
    ["Verdict", (r) => r.verdict.label], [`Est. revenue (${report.meta.revenueCurrency})`, (r) => Math.round(r.estimatedRevenue)], ["ROAS", (r) => (r.roas === null ? "-" : `${r.roas.toFixed(1)}x`)], ["Rank reg.", (r) => r.ranks?.registered], ["Students (period)", (r) => r.school?.studentsRegisteredInPeriod], ["Collected", (r) => m(r.school?.collectedInPeriod)], ["ROI", (r) => r.school?.roi], ["Overdue", (r) => r.school?.overdueStudents], ["Prev reg.", (r) => r.previous?.registered], ["Best ad set", (r) => r.bestAdSets[0]?.name], ["Worst ad set", (r) => r.worstAdSets[0]?.name],
  ]));
  out.push("## Daily");
  out.push(mdTable(report.daily, [["Date", (r) => r.date], ["Day", (r) => r.weekday.slice(0, 3)], ["Spend", (r) => m(r.spend)], ["Impr.", (r) => r.impressions], ["Msgs", (r) => r.messages], ["Booked", (r) => r.booked], ["Showed", (r) => r.showed], ["Reg.", (r) => r.registered], ["Cost/msg", (r) => m(r.costPerMessage)], ["Cost/reg.", (r) => m(r.costPerRegistered)]]));
  if (report.weekly.length > 1) {
    out.push("## Weekly");
    out.push(mdTable(report.weekly, [["From", (r) => r.from], ["To", (r) => r.to], ["Spend", (r) => m(r.spend)], ["Msgs", (r) => r.messages], ["Booked", (r) => r.booked], ["Reg.", (r) => r.registered], ["Cost/reg.", (r) => m(r.costPerRegistered)], ["Margin", (r) => m(r.margin)]]));
  }
  out.push("## By weekday");
  out.push(mdTable(report.weekdays, [["Weekday", (r) => r.weekday], ["Days", (r) => r.days], ["Spend", (r) => m(r.spend)], ["Msgs", (r) => r.messages], ["Booked", (r) => r.booked], ["Reg.", (r) => r.registered], ["Cost/msg", (r) => m(r.costPerMessage)], ["Cost/reg.", (r) => m(r.costPerRegistered)]]));
  out.push("## By objective");
  out.push(mdTable(report.objectives, [["Objective", (r) => r.objective], ["Campaigns", (r) => r.campaigns], ["Spend", (r) => m(r.spend)], ["Msgs", (r) => r.messages], ["Booked", (r) => r.booked], ["Reg.", (r) => r.registered], ["Cost/reg.", (r) => m(r.costPerRegistered)]]));
  out.push("## Outcomes");
  out.push(`Median days from first contact to registration: ${report.attribution.registeredMedianLagDays ?? "-"} · Attributed at: ${Object.entries(report.attribution.byLevel).map(([k, v]) => `${k} ${v}`).join(", ") || "-"}\n`);
  out.push(mdTable(report.outcomes, [["Date", (r) => r.date], ["Type", (r) => r.type], ["First contact", (r) => r.firstContactDate], ["Lag (d)", (r) => r.lagDays], ["Level", (r) => r.attributedAt], ["Ad", (r) => r.ad], ["Ad set", (r) => r.adSet], ["Campaign", (r) => r.campaign], ["Agent", (r) => r.agent]]));
  if (report.trainings.length) {
    out.push("## Trainings");
    out.push(mdTable(report.trainings, [["Training", (r) => r.training], ["Groups", (r) => r.groups], ["Capacity", (r) => r.capacity], ["Active", (r) => r.activeStudents], ["Fill", (r) => p(r.fillRate)], ["Registered (period)", (r) => r.registeredInPeriod], ["Collected", (r) => m(r.collectedInPeriod)], ["Outstanding", (r) => m(r.outstanding)], ["Overdue", (r) => r.overdueStudents]]));
  }
  if (report.students.length) {
    out.push("## Students");
    out.push(mdTable(report.students, [["Registered", (r) => r.registeredAt], ...(report.meta.personalDataIncluded ? [["Name", (r) => r.name]] : []), ["Training", (r) => r.training], ["Group", (r) => r.group], ["Agent", (r) => r.agent], ["Status", (r) => r.status], ["Plan", (r) => r.paymentPlan], ["Total", (r) => m(r.totalDue)], ["Paid", (r) => m(r.paid)], ["Remaining", (r) => m(r.remaining)], ["Next due", (r) => r.nextPaymentDate], ["Payment state", (r) => r.dueState]]));
  }
  if (report.payments.length) {
    out.push("## Payments in period");
    out.push(mdTable(report.payments, [["Date", (r) => r.paidAt], ["Amount", (r) => m(r.amount)], ["Method", (r) => r.method], ["Training", (r) => r.training], ["Agent", (r) => r.agent]]));
  }
  out.push("## Definitions");
  out.push(Object.entries(report.meta.definitions).map(([key, value]) => `- **${key}**: ${value}`).join("\n"));
  return out.join("\n") + "\n";
}

module.exports = { buildReport, resolvePeriod, toCsv, toMarkdown, todayIn, CSV_TABLES: Object.keys(CSV_TABLES), PRESETS };
