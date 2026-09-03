(function exposeQualityScore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CmcgQuality = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createQualityScore() {
  const defaultScoringSettings = {
    targetCostRegistered: 0,
    closingWindowDays: 7,
    targetShowRate: 60,
    targetCloseRate: 40,
  };

  function finiteNumber(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  }

  function positiveNumber(value) {
    const result = finiteNumber(value);
    return result > 0 ? result : 0;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeSettings(settings = {}) {
    const input = settings.scoring && typeof settings.scoring === "object" ? settings.scoring : settings;
    return {
      targetCostRegistered: positiveNumber(input.targetCostRegistered),
      closingWindowDays: clamp(Math.round(positiveNumber(input.closingWindowDays) || defaultScoringSettings.closingWindowDays), 1, 90),
      targetShowRate: clamp(positiveNumber(input.targetShowRate) || defaultScoringSettings.targetShowRate, 1, 100),
      targetCloseRate: clamp(positiveNumber(input.targetCloseRate) || defaultScoringSettings.targetCloseRate, 1, 100),
    };
  }

  function deriveTargets(settings = {}) {
    const scoring = normalizeSettings(settings);
    const targetCostRegistered = positiveNumber(scoring.targetCostRegistered);
    if (!targetCostRegistered) {
      return {
        ...scoring,
        configured: false,
        targetCostRegistered: 0,
        targetCostVisit: 0,
        targetCostBooked: 0,
      };
    }
    const showRate = scoring.targetShowRate / 100;
    const closeRate = scoring.targetCloseRate / 100;
    const targetCostVisit = targetCostRegistered * closeRate;
    return {
      ...scoring,
      configured: true,
      targetCostRegistered,
      targetCostVisit,
      targetCostBooked: targetCostVisit * showRate,
    };
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function ageDaysSince(value, today = new Date()) {
    const start = parseDate(value);
    if (!start) return null;
    const end = parseDate(today.toISOString ? today.toISOString() : today) || new Date();
    return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
  }

  function costPer(spend, count) {
    const value = finiteNumber(count);
    const amount = finiteNumber(spend);
    return value > 0 && amount > 0 ? amount / value : Number.POSITIVE_INFINITY;
  }

  function costComponent(target, actual) {
    if (!target || !Number.isFinite(actual) || actual <= 0) return 0;
    return Math.min(100, (target / actual) * 100);
  }

  function rateComponent(targetRatePercent, actualRate) {
    if (!targetRatePercent || !Number.isFinite(actualRate)) return 0;
    return Math.min(100, (actualRate / (targetRatePercent / 100)) * 100);
  }

  function confidenceFor(row, targets, mature) {
    const spend = finiteNumber(row.spend);
    const registrations = finiteNumber(row.registered);
    const visits = finiteNumber(row.visits);
    const booked = finiteNumber(row.booked);
    if (!targets.configured || spend <= 0 || !mature) return { key: "low", label: "Low confidence" };
    if (registrations >= 5 || spend >= targets.targetCostRegistered * 3 || visits >= 10) return { key: "high", label: "High confidence" };
    if (registrations >= 2 || spend >= targets.targetCostRegistered * 1.5 || visits >= 4 || booked >= 8) return { key: "medium", label: "Medium confidence" };
    return { key: "low", label: "Low confidence" };
  }

  function statusFor(row, targets, score, mature) {
    const spend = finiteNumber(row.spend);
    const registered = finiteNumber(row.registered);
    if (!targets.configured) return { key: "setup", label: "Set target", final: false };
    if (spend <= 0) return { key: "none", label: "No spend", final: false };
    if (!mature) return { key: "pending", label: "Awaiting", final: false };
    if (registered <= 0 && spend < targets.targetCostRegistered * 0.5) return { key: "insufficient", label: "Not enough", final: false };
    if (registered <= 0 && spend < targets.targetCostRegistered * 1.5) return { key: "watch", label: "Watch", final: false };
    if (score >= 80) return { key: "strong", label: "Strong", final: true };
    if (score >= 55) return { key: "watch", label: "Watch", final: true };
    return { key: "weak", label: "Weak", final: true };
  }

  function scoreRows(rows, settings = {}, today = new Date()) {
    const targets = deriveTargets(settings);
    return rows.map((row) => {
      const spend = finiteNumber(row.spend);
      const booked = finiteNumber(row.booked);
      const showed = finiteNumber(row.showed);
      const registered = finiteNumber(row.registered);
      const visits = showed + registered;
      const costBooked = costPer(spend, booked);
      const costVisit = costPer(spend, visits);
      const costRegistered = costPer(spend, registered);
      const showRate = booked > 0 ? visits / booked : null;
      const closeRate = visits > 0 ? registered / visits : null;
      const ageDays = ageDaysSince(row.firstActivityDate || row.reportingStart || row.date, today);
      const mature = ageDays !== null && ageDays >= targets.closingWindowDays;

      const rawScore = Math.round(
        (costComponent(targets.targetCostRegistered, costRegistered) * 0.60)
        + (costComponent(targets.targetCostVisit, costVisit) * 0.20)
        + (costComponent(targets.targetCostBooked, costBooked) * 0.10)
        + (rateComponent(targets.targetCloseRate, closeRate) * 0.10),
      );
      const status = statusFor({ ...row, spend, registered, visits, booked }, targets, rawScore, mature);
      const score = targets.configured && spend > 0 && status.key !== "insufficient" ? rawScore : null;

      const closingComponents = [];
      if (showRate !== null) closingComponents.push(rateComponent(targets.targetShowRate, showRate));
      if (closeRate !== null) closingComponents.push(rateComponent(targets.targetCloseRate, closeRate));
      const agentClosingScore = targets.configured && closingComponents.length
        ? Math.round(closingComponents.reduce((sum, value) => sum + value, 0) / closingComponents.length)
        : null;

      return {
        ...row,
        spend,
        booked,
        showed,
        registered,
        visits,
        costBooked,
        costVisit,
        costRegistered,
        showRate,
        closeRate,
        ageDays,
        closingWindowDays: targets.closingWindowDays,
        qualityScore: score,
        qualityStatus: status,
        qualityConfidence: confidenceFor({ ...row, spend, registered, visits, booked }, targets, mature),
        qualityTargets: targets,
        agentClosingScore,
        agentClosingStatus: agentClosingScore === null ? { key: "none", label: "No data", final: false } : statusFor({ ...row, spend, registered, visits, booked }, targets, agentClosingScore, mature),
      };
    });
  }

  function qualityBand(scoreOrRow) {
    if (scoreOrRow && typeof scoreOrRow === "object" && scoreOrRow.qualityStatus) return scoreOrRow.qualityStatus;
    const score = Number(scoreOrRow);
    if (!Number.isFinite(score)) return { key: "none", label: "No data", final: false };
    if (score >= 80) return { key: "strong", label: "Strong", final: true };
    if (score >= 55) return { key: "watch", label: "Watch", final: true };
    return { key: "weak", label: "Weak", final: true };
  }

  function valueForCostSort(row, key) {
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  }

  function scoreValue(row, key) {
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
  }

  function sortRows(rows, criterion = "quality") {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let result = 0;
      if (criterion === "quality") result = scoreValue(b, "qualityScore") - scoreValue(a, "qualityScore");
      else if (criterion === "agentClosing") result = scoreValue(b, "agentClosingScore") - scoreValue(a, "agentClosingScore");
      else if (criterion === "spendHigh") result = finiteNumber(b.spend) - finiteNumber(a.spend);
      else if (criterion === "spendLow") result = finiteNumber(a.spend) - finiteNumber(b.spend);
      else if (["booked", "showed", "visits", "registered", "messages"].includes(criterion)) result = finiteNumber(b[criterion]) - finiteNumber(a[criterion]);
      else if (criterion === "showRate") result = scoreValue(b, "showRate") - scoreValue(a, "showRate");
      else if (criterion === "closeRate") result = scoreValue(b, "closeRate") - scoreValue(a, "closeRate");
      else if (criterion === "costBooked") result = valueForCostSort(a, "costBooked") - valueForCostSort(b, "costBooked");
      else if (criterion === "costVisit") result = valueForCostSort(a, "costVisit") - valueForCostSort(b, "costVisit");
      else if (criterion === "costShowed") result = costPer(a.spend, a.showed) - costPer(b.spend, b.showed);
      else if (criterion === "costRegistered") result = valueForCostSort(a, "costRegistered") - valueForCostSort(b, "costRegistered");
      return result || String(a.name || "").localeCompare(String(b.name || ""));
    });
    return sorted;
  }

  return { scoreRows, qualityBand, sortRows, deriveTargets, normalizeSettings };
}));
