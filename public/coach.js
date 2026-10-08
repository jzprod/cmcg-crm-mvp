(function exposeCoach(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CmcgCoach = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createCoach() {
  // Media-buying rules for click-to-WhatsApp ad sets and ads, judged against the
  // break-even cost per registration and how long the entity has been spending.
  // Principles: give Meta 3 days of learning before judging, never scale on one
  // sale, raise budgets by 20-30% at most once every 3 days, cut what spends past
  // the limit without a student, and wait on open bookings before killing.
  const LEARNING_DAYS = 3;
  const RDV_LAG_DAYS = 10;
  const SCALE_EVERY_DAYS = 3;

  function shift(date, days) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function between(from, to) {
    return Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000);
  }
  function sum(days, key) { return days.reduce((total, day) => total + Number(day[key] || 0), 0); }
  function costPer(spend, count) { return count > 0 && spend > 0 ? spend / count : null; }

  const ACTIONS = {
    pause: { label: "Pause", tone: "bad", priority: 1, group: "now" },
    cut: { label: "Cut budget 30%", tone: "bad", priority: 2, group: "now" },
    scale: { label: "Scale +20%", tone: "good", priority: 2, group: "now" },
    scaleMore: { label: "Scale +30%", tone: "good", priority: 2, group: "now" },
    copy: { label: "Copy this creative", tone: "good", priority: 3, group: "now" },
    noRdv: { label: "No RDV: replace or pause", tone: "bad", priority: 1, group: "now" },
    hold: { label: "Hold: RDVs pending", tone: "warn", priority: 3, group: "soon" },
    promising: { label: "Cheap RDVs, wait", tone: "good", priority: 3, group: "soon" },
    costlyRdv: { label: "Costly RDVs", tone: "warn", priority: 3, group: "soon" },
    watch: { label: "Decision day coming", tone: "warn", priority: 3, group: "soon" },
    fix: { label: "Fix creative or follow-up", tone: "warn", priority: 3, group: "soon" },
    refresh: { label: "Refresh creative", tone: "warn", priority: 4, group: "soon" },
    confirm: { label: "Promising, wait", tone: "neutral", priority: 4, group: "wait" },
    keep: { label: "Keep as is", tone: "neutral", priority: 5, group: "wait" },
    learning: { label: "Learning, don't touch", tone: "neutral", priority: 6, group: "wait" },
  };

  // entity: { name, level: "adSet" | "ad", days: [{ date, spend, messages, booked, registered }],
  //           impressions, linkClicks, reach }
  // options: { breakEven, latestDate, money(value) -> string }
  function decide(entity, options) {
    const breakEven = Number(options.breakEven) || 0;
    const latest = options.latestDate;
    const money = options.money || ((value) => value.toFixed(2));
    const day = options.date || ((value) => value);
    const days = (entity.days || []).filter((day) => day.date <= latest);
    const spendDays = days.filter((day) => Number(day.spend) > 0);
    if (!breakEven || !latest || !spendDays.length) return null;
    const last3 = days.filter((day) => day.date > shift(latest, -3));
    const spentLately = sum(last3, "spend") > 0;
    if (!spentLately) return null; // paused or finished: nothing to decide today
    const firstSpend = spendDays[0].date;
    const age = between(firstSpend, latest) + 1;
    const spend = sum(days, "spend");
    const registered = sum(days, "registered");
    const booked = sum(days, "booked");
    const messages = sum(days, "messages");
    const pace = sum(last3, "spend") / Math.max(1, last3.filter((day) => Number(day.spend) > 0).length);
    const cost = costPer(spend, registered);
    const ratio = cost === null ? null : cost / breakEven;
    const prior = days.filter((day) => day.date <= shift(latest, -3) && day.date > shift(latest, -10));
    const costRecent = costPer(sum(last3, "spend"), sum(last3, "registered"));
    const costPrior = costPer(sum(prior, "spend"), sum(prior, "registered"));
    const rising = costRecent !== null && costPrior !== null && costRecent > costPrior * 1.25;
    const lastBooking = [...days].reverse().find((day) => Number(day.booked) > 0)?.date || "";
    // RDVs turn into registrations 2-10 days later, so recent RDVs are judged by their cost.
    const rdvTarget = Number(options.rdvTarget) || 0;
    const costBooked = costPer(spend, booked);
    const rdvsPending = booked > 0 && lastBooking > shift(latest, -RDV_LAG_DAYS);
    const rdvDeadline = lastBooking ? [shift(lastBooking, RDV_LAG_DAYS), shift(latest, 5)].sort()[0] : "";
    const stats = { age, spend, registered, booked, messages, cost, ratio, pace, firstSpend };
    const make = (key, reason, nextCheck) => ({ key, ...ACTIONS[key], reason, nextCheck: nextCheck || "", ...stats, name: entity.name, level: entity.level });

    // Creative signals for single ads.
    if (entity.level === "ad") {
      const impressions = Number(entity.impressions || 0);
      const ctr = impressions ? Number(entity.linkClicks || 0) / impressions : null;
      const frequency = Number(entity.reach) > 0 ? impressions / Number(entity.reach) : null;
      if (registered >= 2 && ratio !== null && ratio <= 0.8 && age >= LEARNING_DAYS) {
        return make("copy", `${registered} students at ${money(cost)} each over ${age} days. Put this creative in your other ad sets.`, "");
      }
      if (!registered && booked === 0 && rdvTarget && age >= LEARNING_DAYS && spend >= Math.max(rdvTarget * 3, breakEven * 0.5) && spend < breakEven) {
        return make("noRdv", `This ad spent ${money(spend)} in ${age} days without one RDV (an RDV should cost about ${money(rdvTarget)}). Turn this ad off or replace its creative.`, "");
      }
      if (!registered && spend >= breakEven && booked === 0) {
        return make("pause", `This ad spent ${money(spend)} in ${age} days with no booking and no student. Turn this ad off; the ad set keeps its other ads.`, "");
      }
      if (frequency !== null && frequency >= 3) {
        return make("refresh", `People have seen it ${frequency.toFixed(1)} times on average. The audience is tired of it; add a new version.`, shift(latest, 2));
      }
      if (ctr !== null && impressions >= 2000 && ctr < 0.005) {
        return make("refresh", `Only ${(ctr * 100).toFixed(2)}% of ${impressions.toLocaleString("en")} viewers clicked. Test a new first line or image.`, shift(latest, 2));
      }
      return null; // ads without a clear signal are handled by their ad set
    }

    if (!registered) {
      if (spend >= breakEven * 2) {
        return make("pause", `${money(spend)} spent in ${age} days, twice your ${money(breakEven)} limit, with no student.`, "");
      }
      if (spend >= breakEven) {
        if (age < LEARNING_DAYS) return make("learning", `Day ${age} of learning but already ${money(spend)} spent with no student. Decide on ${day(shift(firstSpend, LEARNING_DAYS))}.`, shift(firstSpend, LEARNING_DAYS));
        if (rdvsPending && (!rdvTarget || costBooked <= rdvTarget * 1.5)) {
          return make("hold", `Past your ${money(breakEven)} limit (${money(spend)}) with no student yet, but ${booked} RDV${booked > 1 ? "s" : ""} at ${money(costBooked)} each are still within the 2-10 days it takes to register. Don't raise the budget. If no student by ${day(rdvDeadline)}, pause.`, rdvDeadline);
        }
        return make("pause", `${money(spend)} spent over ${age} days, past your ${money(breakEven)} limit, with no student${booked ? ` and only ${booked} booking${booked > 1 ? "s" : ""}` : ""}. Pause it or replace the creative.`, "");
      }
      if (rdvTarget && age >= LEARNING_DAYS) {
        if (!booked && spend >= rdvTarget * 2) {
          return make("noRdv", `${money(spend)} spent in ${age} days and not one RDV, while an RDV should cost about ${money(rdvTarget)}. ${messages ? `${messages} messages came in, so check the agent's replies, then ` : ""}replace the creative or pause.`, "");
        }
        if (booked && costBooked > rdvTarget * 2) {
          return make("costlyRdv", `RDVs cost ${money(costBooked)} each, more than twice the ${money(rdvTarget)} target. Test a new creative or a clearer offer before more spend.`, shift(latest, 2));
        }
      }
      if (rdvsPending && rdvTarget && costBooked <= rdvTarget) {
        return make("promising", `${booked} RDV${booked > 1 ? "s" : ""} at ${money(costBooked)} each (target ${money(rdvTarget)}). Customers usually come to register 2-10 days after the RDV, so judge the students on ${day(rdvDeadline)}. Keep the budget as it is.`, rdvDeadline);
      }
      if (spend >= breakEven * 0.5) {
        const daysLeft = pace > 0 ? Math.ceil((breakEven - spend) / pace) : null;
        const when = daysLeft ? shift(latest, daysLeft) : "";
        const followUp = messages >= 10 && booked === 0 ? ` ${messages} messages but no booking yet: check the agent's replies.` : "";
        return make("watch", `${Math.round((spend / breakEven) * 100)}% of your limit spent (${money(spend)}) with no student.${when ? ` At ${money(pace)} a day it reaches the limit on ${day(when)}; pause then if still no student.` : ""}${followUp}`, when);
      }
      if (age < LEARNING_DAYS) {
        return make("learning", `Day ${age} of Meta's learning period. Don't change budget, audience or creative before ${day(shift(firstSpend, LEARNING_DAYS))}.`, shift(firstSpend, LEARNING_DAYS));
      }
      return make("keep", `${money(spend)} spent, under half your limit. Let it keep spending.`, shift(latest, 2));
    }

    if (ratio <= 0.8) {
      if (registered < 2 || age < LEARNING_DAYS) {
        return make("confirm", `${registered} student at ${money(cost)} after ${age} day${age > 1 ? "s" : ""}. One sale can be luck: wait for a second before scaling.`, shift(latest, 2));
      }
      if (rising) {
        return make("keep", `Profitable (${money(cost)} per student) but the last 3 days cost ${money(costRecent)} vs ${money(costPrior)} before. Hold the budget until it settles.`, shift(latest, 2));
      }
      const strong = ratio <= 0.5 && registered >= 3;
      return make(strong ? "scaleMore" : "scale", `${registered} students at ${money(cost)} each (${Math.round(ratio * 100)}% of your limit) over ${age} days. Raise the budget once, then wait 3 days before the next raise so Meta doesn't restart learning.`, shift(latest, SCALE_EVERY_DAYS));
    }
    if (ratio <= 1.05) {
      return make("keep", `${money(cost)} per student, right at your ${money(breakEven)} limit. Keep the budget and test one new creative.`, shift(latest, 3));
    }
    if (ratio <= 1.3) {
      const improving = costRecent !== null && costPrior !== null && costRecent < costPrior;
      return make(improving ? "keep" : "fix", `${money(cost)} per student, ${Math.round((ratio - 1) * 100)}% over your limit.${improving ? " The last 3 days are cheaper, so give it time." : " Refresh the creative or speed up the follow-up; keep the budget."}`, shift(latest, 2));
    }
    if (ratio <= 2) {
      return make("cut", `${money(cost)} per student, ${Math.round((ratio - 1) * 100)}% over your limit after ${age} days. Lower the budget by 30% and refresh the creative.`, shift(latest, 3));
    }
    return make("pause", `${money(cost)} per student, more than twice your ${money(breakEven)} limit.`, "");
  }

  function sortDecisions(items) {
    return items.filter(Boolean).sort((a, b) => a.priority - b.priority || b.spend - a.spend);
  }

  return { decide, sortDecisions, ACTIONS, LEARNING_DAYS, RDV_LAG_DAYS };
}));
