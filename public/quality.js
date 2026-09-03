(function exposeQualityScore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CmcgQuality = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createQualityScore() {
  const defaultScoringSettings = {
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
      closingWindowDays: clamp(Math.round(positiveNumber(input.closingWindowDays) || defaultScoringSettings.closingWindowDays), 1, 90),
      targetShowRate: clamp(positiveNumber(input.targetShowRate) || defaultScoringSettings.targetShowRate, 1, 100),
      targetCloseRate: clamp(positiveNumber(input.targetCloseRate) || defaultScoringSettings.targetCloseRate, 1, 100),
    };
  }

  function percentile(values, point = 0.5) {
    const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * point) - 1));
    return sorted[index];
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

  function metricsFor(row) {
    const spend = finiteNumber(row.spend);
    const booked = finiteNumber(row.booked);
    const showed = finiteNumber(row.showed);
    const registered = finiteNumber(row.registered);
    const visits = showed + registered;
    return {
      ...row,
      spend,
      booked,
      showed,
      registered,
      visits,
      costBooked: costPer(spend, booked),
      costVisit: costPer(spend, visits),
      costRegistered: costPer(spend, registered),
      showRate: booked > 0 ? visits / booked : null,
      closeRate: visits > 0 ? registered / visits : null,
      outcomeVolume: (registered * 5) + (visits * 2) + booked,
    };
  }

  function deriveTargets(settings = {}, rows = []) {
    if (Array.isArray(settings)) {
      rows = settings;
      settings = {};
    }
    const scoring = normalizeSettings(settings);
    const metrics = rows.map(metricsFor);
    const targetCostRegistered = percentile(metrics.map((row) => row.costRegistered), 0.6);
    const targetCostVisit = percentile(metrics.map((row) => row.costVisit), 0.6);
    const targetCostBooked = percentile(metrics.map((row) => row.costBooked), 0.6);
    const learnedShowRate = percentile(metrics.map((row) => row.showRate), 0.5);
    const learnedCloseRate = percentile(metrics.map((row) => row.closeRate), 0.5);
    const spendBenchmark = percentile(metrics.filter((row) => row.outcomeVolume > 0).map((row) => row.spend), 0.5)
      || percentile(metrics.map((row) => row.spend), 0.5)
      || 50;
    const maxOutcomeVolume = Math.max(0, ...metrics.map((row) => row.outcomeVolume));
    return {
      ...scoring,
      configured: Boolean(targetCostRegistered || targetCostVisit || targetCostBooked || maxOutcomeVolume),
      automatic: true,
      targetCostRegistered,
      targetCostVisit,
      targetCostBooked,
      targetShowRate: learnedShowRate ? learnedShowRate * 100 : scoring.targetShowRate,
      targetCloseRate: learnedCloseRate ? learnedCloseRate * 100 : scoring.targetCloseRate,
      spendBenchmark,
      maxOutcomeVolume,
    };
  }

  function costComponent(target, actual) {
    if (!target || !Number.isFinite(actual) || actual <= 0) return 0;
    return Math.min(100, (target / actual) * 100);
  }

  function rateComponent(targetRatePercent, actualRate) {
    if (!targetRatePercent || !Number.isFinite(actualRate)) return 0;
    return Math.min(100, (actualRate / (targetRatePercent / 100)) * 100);
  }

  function volumeComponent(targets, row) {
    return targets.maxOutcomeVolume > 0 ? Math.min(100, (row.outcomeVolume / targets.maxOutcomeVolume) * 100) : 0;
  }

  function weightedScore(row, targets) {
    const parts = [];
    if (targets.targetCostRegistered) parts.push([costComponent(targets.targetCostRegistered, row.costRegistered), 45]);
    if (targets.targetCostVisit) parts.push([costComponent(targets.targetCostVisit, row.costVisit), 20]);
    if (targets.targetCostBooked) parts.push([costComponent(targets.targetCostBooked, row.costBooked), 15]);
    if (targets.maxOutcomeVolume) parts.push([volumeComponent(targets, row), 15]);
    if (row.closeRate !== null) parts.push([rateComponent(targets.targetCloseRate, row.closeRate), 5]);
    const totalWeight = parts.reduce((sum, [, weight]) => sum + weight, 0);
    if (!totalWeight) return null;
    return Math.round(parts.reduce((sum, [score, weight]) => sum + (score * weight), 0) / totalWeight);
  }

  function confidenceFor(row, targets, mature) {
    if (!targets.configured || row.spend <= 0 || !mature) return { key: "low", label: "Low confidence" };
    if (row.registered >= 5 || row.visits >= 12 || row.booked >= 18 || row.spend >= targets.spendBenchmark * 3) return { key: "high", label: "High confidence" };
    if (row.registered >= 2 || row.visits >= 4 || row.booked >= 8 || row.spend >= targets.spendBenchmark * 1.5) return { key: "medium", label: "Medium confidence" };
    return { key: "low", label: "Low confidence" };
  }

  function statusFor(row, targets, score, mature) {
    if (row.spend <= 0) return { key: "none", label: "No spend", final: false };
    if (!targets.configured) return { key: "learning", label: "Learning", final: false };
    if (!mature) return { key: "pending", label: "Awaiting", final: false };
    if (row.outcomeVolume <= 0 && row.spend < targets.spendBenchmark * 0.75) return { key: "insufficient", label: "Not enough", final: false };
    if (row.outcomeVolume <= 0 && row.spend < targets.spendBenchmark * 1.5) return { key: "watch", label: "Watch", final: false };
    if (row.registered <= 0 && row.outcomeVolume > 0) {
      const efficientVisit = targets.targetCostVisit && row.costVisit <= targets.targetCostVisit * 1.25;
      const efficientBooked = targets.targetCostBooked && row.costBooked <= targets.targetCostBooked * 1.25;
      if (efficientVisit || efficientBooked) return { key: "watch", label: "Watch", final: false };
    }
    if (score === null) return { key: "learning", label: "Learning", final: false };
    if (score >= 80) return { key: "strong", label: "Strong", final: true };
    if (score >= 55) return { key: "watch", label: "Watch", final: true };
    return { key: "weak", label: "Weak", final: true };
  }

  function agentClosingScore(row, targets) {
    const parts = [];
    if (row.showRate !== null) parts.push(rateComponent(targets.targetShowRate, row.showRate));
    if (row.closeRate !== null) parts.push(rateComponent(targets.targetCloseRate, row.closeRate));
    if (!parts.length || !targets.configured) return null;
    return Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length);
  }

  function scoreRows(rows, settings = {}, today = new Date()) {
    const targets = deriveTargets(settings, rows);
    return rows.map((row) => {
      const metrics = metricsFor(row);
      const ageDays = ageDaysSince(metrics.firstActivityDate || metrics.reportingStart || metrics.date, today);
      const mature = ageDays !== null && ageDays >= targets.closingWindowDays;
      const score = weightedScore(metrics, targets);
      const status = statusFor(metrics, targets, score, mature);
      const closingScore = agentClosingScore(metrics, targets);
      const confidence = confidenceFor(metrics, targets, mature);
      return {
        ...metrics,
        ageDays,
        closingWindowDays: targets.closingWindowDays,
        qualityScore: status.key === "learning" || status.key === "insufficient" ? null : score,
        qualityStatus: status,
        qualityConfidence: confidence,
        qualityTargets: targets,
        agentClosingScore: closingScore,
        agentClosingStatus: closingScore === null ? { key: "none", label: "No data", final: false } : statusFor(metrics, targets, closingScore, mature),
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
