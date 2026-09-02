(function exposeQualityScore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CmcgQuality = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createQualityScore() {
  const dimensions = [
    { key: "booked", weight: 0.20 },
    { key: "showed", weight: 0.30 },
    { key: "registered", weight: 0.50 },
  ];

  function finiteNumber(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  }

  function scoreRows(rows) {
    const bestCosts = {};
    dimensions.forEach(({ key }) => {
      const costs = rows
        .filter((row) => finiteNumber(row.spend) > 0 && finiteNumber(row[key]) > 0)
        .map((row) => finiteNumber(row.spend) / finiteNumber(row[key]));
      bestCosts[key] = costs.length ? Math.min(...costs) : null;
    });

    const activeDimensions = dimensions.filter(({ key }) => bestCosts[key] !== null);
    const activeWeight = activeDimensions.reduce((sum, dimension) => sum + dimension.weight, 0);

    return rows.map((row) => {
      const spend = finiteNumber(row.spend);
      if (spend <= 0 || !activeWeight) return { ...row, qualityScore: null };

      const weightedScore = activeDimensions.reduce((sum, { key, weight }) => {
        const count = finiteNumber(row[key]);
        const rowCost = count > 0 ? spend / count : Number.POSITIVE_INFINITY;
        const component = Number.isFinite(rowCost) ? Math.min(100, (bestCosts[key] / rowCost) * 100) : 0;
        return sum + (component * weight);
      }, 0);
      return { ...row, qualityScore: Math.round(weightedScore / activeWeight) };
    });
  }

  function qualityBand(score) {
    if (score === null || score === undefined || !Number.isFinite(Number(score))) return { key: "none", label: "No data" };
    if (Number(score) >= 70) return { key: "strong", label: "Strong" };
    if (Number(score) >= 40) return { key: "watch", label: "Watch" };
    return { key: "weak", label: "Weak" };
  }

  function costPer(row, key) {
    const count = finiteNumber(row[key]);
    const spend = finiteNumber(row.spend);
    return count > 0 && spend > 0 ? spend / count : Number.POSITIVE_INFINITY;
  }

  function sortRows(rows, criterion = "quality") {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let result = 0;
      if (criterion === "quality") {
        const aScore = a.qualityScore === null ? Number.NEGATIVE_INFINITY : a.qualityScore;
        const bScore = b.qualityScore === null ? Number.NEGATIVE_INFINITY : b.qualityScore;
        result = bScore - aScore;
      } else if (criterion === "spendHigh") result = finiteNumber(b.spend) - finiteNumber(a.spend);
      else if (criterion === "spendLow") result = finiteNumber(a.spend) - finiteNumber(b.spend);
      else if (["booked", "showed", "registered", "messages"].includes(criterion)) result = finiteNumber(b[criterion]) - finiteNumber(a[criterion]);
      else if (criterion === "costBooked") result = costPer(a, "booked") - costPer(b, "booked");
      else if (criterion === "costShowed") result = costPer(a, "showed") - costPer(b, "showed");
      else if (criterion === "costRegistered") result = costPer(a, "registered") - costPer(b, "registered");
      return result || String(a.name || "").localeCompare(String(b.name || ""));
    });
    return sorted;
  }

  return { scoreRows, qualityBand, sortRows };
}));
