(function exposeProfit(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CmcgProfit = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createProfit() {
  // Verdict tiers, best to worst. `max` is the upper bound of cost / break-even.
  const TIERS = {
    scale: { key: "scale", label: "Very profitable", action: "Scale budget", rank: 1 },
    profit: { key: "profit", label: "Profitable", action: "Scale gradually", rank: 2 },
    edge: { key: "edge", label: "Slightly profitable", action: "Keep running", rank: 3 },
    even: { key: "even", label: "Break-even", action: "Optimize", rank: 4 },
    learning: { key: "learning", label: "Learning", action: "Let it spend", rank: 5 },
    loss: { key: "loss", label: "Slight loss", action: "Fix creative / follow-up", rank: 6 },
    losing: { key: "losing", label: "Losing", action: "Cut budget", rank: 7 },
    heavy: { key: "heavy", label: "Heavy loss", action: "Stop", rank: 8 },
    idle: { key: "idle", label: "Not spending", action: "No spend", rank: 9 },
    // No student yet, judged by RDVs: an RDV usually registers 2-10 days later.
    rdvGood: { key: "rdvGood", label: "Cheap RDVs", action: "Wait for students", rank: 4.5 },
    rdvHold: { key: "rdvHold", label: "RDVs pending", action: "Hold budget", rank: 5.5 },
    rdvCostly: { key: "rdvCostly", label: "Costly RDVs", action: "Fix creative / offer", rank: 6.5 },
    noRdv: { key: "noRdv", label: "No RDV", action: "Replace or pause", rank: 7.5 },
  };
  const BANDS = [
    [0.5, "scale"],
    [0.8, "profit"],
    [0.95, "edge"],
    [1.05, "even"],
    [1.3, "loss"],
    [2, "losing"],
    [Number.POSITIVE_INFINITY, "heavy"],
  ];

  function amount(value) {
    const result = Number(value);
    return Number.isFinite(result) && result > 0 ? result : 0;
  }

  function costPer(spend, count) {
    return amount(count) > 0 ? amount(spend) / amount(count) : null;
  }

  function tierForRatio(ratio) {
    return TIERS[BANDS.find(([max]) => ratio <= max)[1]];
  }

  // Judge a cost-per-result against its break-even. With no result yet, the
  // cost is at least the spend (the next result would cost that much), so an
  // ad that already spent past break-even without converting is a loss.
  function verdict(spend, results, breakEven) {
    const money = amount(spend);
    const count = amount(results);
    const limit = amount(breakEven);
    const base = { cost: costPer(money, count), ratio: null, spend: money, results: count, breakEven: limit };
    if (money <= 0) return { ...TIERS.idle, ...base, note: count ? "Results without spend in this period" : "No spend in this period" };
    if (!limit) return { ...TIERS.learning, ...base, note: "No break-even set" };
    if (!count) {
      const ratio = money / limit;
      if (ratio < 1) return { ...TIERS.learning, ...base, ratio, progress: ratio, note: `No result yet · ${Math.round(ratio * 100)}% of break-even spent` };
      return { ...tierForRatio(ratio), ...base, ratio, noResult: true, note: "No result yet · already past break-even" };
    }
    const ratio = base.cost / limit;
    return { ...tierForRatio(ratio), ...base, ratio, lowData: count < 3, note: count < 3 ? `Only ${count} result${count === 1 ? "" : "s"} · low data` : "" };
  }

  // Registration verdict that, before any student, looks at RDVs: recent cheap RDVs
  // mean "wait", costly RDVs or none at all mean the ad is bad early.
  // input: { spend, registered, booked, pendingBooked } (pendingBooked = RDVs from the
  // last 10 days not yet registered); rdvTarget = what one RDV may cost.
  function rdvVerdict(input, breakEven, rdvTarget) {
    const base = verdict(input.spend, input.registered, breakEven);
    const spend = amount(input.spend);
    const booked = amount(input.booked);
    const pending = amount(input.pendingBooked);
    const target = amount(rdvTarget);
    if (amount(input.registered) || !spend || !target) return base;
    const costBooked = costPer(spend, booked);
    const extra = { costBooked, rdvTarget: target, rdvRatio: costBooked === null ? null : costBooked / target, pendingBooked: pending };
    if (!booked && spend >= target * 2) return { ...base, ...TIERS.noRdv, ...extra, note: "No RDV yet after twice the RDV target" };
    if (pending > 0) {
      if (spend >= amount(breakEven)) {
        return costBooked <= target * 1.5 ? { ...base, ...TIERS.rdvHold, ...extra, note: `${pending} RDV${pending > 1 ? "s" : ""} from the last 10 days may still register` } : { ...base, ...extra };
      }
      if (costBooked <= target) return { ...base, ...TIERS.rdvGood, ...extra, note: "Students usually register 2-10 days after the RDV" };
    }
    if (booked && costBooked > target * 2) return { ...base, ...TIERS.rdvCostly, ...extra, note: "RDVs cost more than twice the target" };
    return { ...base, ...extra };
  }

  // Leading-indicator targets: what an RDV or a message may cost if, at your
  // real conversion rates, registrations are to stay at break-even.
  function derivedBreakEvens(totals, breakEven) {
    const limit = amount(breakEven);
    const registered = amount(totals.registered);
    const booked = amount(totals.booked);
    const messages = amount(totals.messages);
    const bookedToRegistered = booked && registered ? Math.min(1, registered / booked) : null;
    const messageToRegistered = messages && registered ? Math.min(1, registered / messages) : null;
    return {
      registered: limit || null,
      booked: limit && bookedToRegistered ? limit * bookedToRegistered : null,
      message: limit && messageToRegistered ? limit * messageToRegistered : null,
      bookedToRegistered,
      messageToRegistered,
    };
  }

  function sum(days, key) {
    return days.reduce((total, day) => total + amount(day[key]), 0);
  }

  // Cost trend between two slices of days. Lower cost is better, so "down" is good.
  function compareCost(before, after, key) {
    const spendBefore = sum(before, "spend");
    const spendAfter = sum(after, "spend");
    const resultsBefore = sum(before, key);
    const resultsAfter = sum(after, key);
    const costBefore = costPer(spendBefore, resultsBefore);
    const costAfter = costPer(spendAfter, resultsAfter);
    if (costBefore !== null && costAfter !== null) {
      const change = (costAfter - costBefore) / costBefore;
      const direction = Math.abs(change) < 0.05 ? "flat" : change < 0 ? "down" : "up";
      return { direction, change, costBefore, costAfter, good: direction === "down" ? true : direction === "up" ? false : null };
    }
    if (costBefore !== null && !resultsAfter && spendAfter > 0) return { direction: "up", change: null, costBefore, costAfter: null, good: false, note: "No result lately" };
    if (costAfter !== null && !resultsBefore && spendBefore > 0) return { direction: "down", change: null, costBefore: null, costAfter, good: true, note: "Started converting" };
    return null;
  }

  function halfTrend(days, key) {
    if (days.length < 2) return null;
    const middle = Math.floor(days.length / 2);
    return compareCost(days.slice(0, middle), days.slice(days.length - middle), key);
  }

  // Trailing-window cost per result for each day (null when the window has no result).
  function rollingCost(days, key, window = 7) {
    return days.map((day, index) => {
      const slice = days.slice(Math.max(0, index - window + 1), index + 1);
      return { date: day.date, value: costPer(sum(slice, "spend"), sum(slice, key)) };
    });
  }

  // Group consecutive days into fixed-size buckets (oldest first) and cost each bucket.
  function bucketCost(days, key, size = 7) {
    const buckets = [];
    for (let end = days.length; end > 0; end -= size) buckets.unshift(days.slice(Math.max(0, end - size), end));
    return buckets.map((slice) => ({ from: slice[0].date, to: slice[slice.length - 1].date, spend: sum(slice, "spend"), results: sum(slice, key), value: costPer(sum(slice, "spend"), sum(slice, key)) }));
  }

  return { TIERS, verdict, rdvVerdict, derivedBreakEvens, compareCost, halfTrend, rollingCost, bucketCost, costPer, tierForRatio };
}));
