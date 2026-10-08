const test = require("node:test");
const assert = require("node:assert/strict");
const { decide, sortDecisions } = require("../public/coach.js");

// Build consecutive days ending on `latest` from per-day [spend, registered, booked, messages].
function days(latest, values) {
  const end = new Date(`${latest}T00:00:00Z`);
  return values.map(([spend, registered = 0, booked = 0, messages = 0], index) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (values.length - 1 - index));
    return { date: d.toISOString().slice(0, 10), spend, registered, booked, messages };
  });
}
const opts = { breakEven: 60, latestDate: "2026-10-05", money: (v) => `$${v.toFixed(2)}` };
const adSet = (values) => ({ name: "Test", level: "adSet", days: days("2026-10-05", values) });

test("new ad sets are left alone during the learning days", () => {
  const result = decide(adSet([[5], [6]]), opts);
  assert.equal(result.key, "learning");
  assert.equal(result.age, 2);
  assert.equal(result.nextCheck, "2026-10-07");
});

test("spend past the limit without a student pauses, unless bookings are open", () => {
  assert.equal(decide(adSet([[25], [25], [25]]), opts).key, "pause");
  assert.equal(decide(adSet([[45], [45], [45]]), opts).key, "pause"); // twice the limit
  const pending = decide(adSet([[25], [25, 0, 1], [25, 0, 1]]), opts);
  assert.equal(pending.key, "hold");
  assert.equal(pending.nextCheck, "2026-10-10"); // up to 5 days for open RDVs
});

test("fresh ads are judged by RDVs while registrations can still come", () => {
  const rdvOpts = { ...opts, rdvTarget: 26.67 };
  // $9.53 spent, 2 RDVs: cheap RDVs, wait for registrations instead of judging the ad.
  const cheap = decide(adSet([[3, 0, 1], [3], [3.53, 0, 1]]), rdvOpts);
  assert.equal(cheap.key, "promising");
  assert.equal(cheap.nextCheck, "2026-10-10");
  // Twice the RDV target spent without one RDV: replace or pause, before the registration limit.
  assert.equal(decide(adSet([[18], [18], [18]]), rdvOpts).key, "noRdv");
  // RDVs that cost more than twice the target.
  assert.equal(decide(adSet([[10, 0, 0], [10], [10, 0, 1]]), { ...rdvOpts, rdvTarget: 10 }).key, "costlyRdv");
  // Past the limit, but recent RDVs at a fair price: hold instead of pausing.
  assert.equal(decide(adSet([[25, 0, 1], [25, 0, 1], [25, 0, 1]]), rdvOpts).key, "hold");
});

test("half the limit spent without a student gets a decision date from the daily pace", () => {
  const result = decide(adSet([[10], [10], [10], [10]]), opts);
  assert.equal(result.key, "watch");
  assert.equal(result.nextCheck, "2026-10-07"); // 20 left at 10 a day
});

test("one cheap sale is not enough to scale; two after the learning days are", () => {
  assert.equal(decide(adSet([[5, 1], [5]]), opts).key, "confirm");
  const scale = decide(adSet([[10, 1], [10], [10, 1]]), opts);
  assert.equal(scale.key, "scale");
  assert.equal(scale.nextCheck, "2026-10-08");
  assert.equal(decide(adSet([[10, 1], [10, 1], [10, 1]]), opts).key, "scaleMore"); // $10 per student, 3 students
});

test("costs over the limit are fixed, cut, or paused by how far over they are", () => {
  assert.equal(decide(adSet([[35, 1], [35], [0]]), opts).key, "fix"); // $70 per student, 17% over
  assert.equal(decide(adSet([[50, 1], [50], [5]]), opts).key, "cut"); // $105 per student
  assert.equal(decide(adSet([[100, 1], [100], [10]]), opts).key, "pause"); // $210 per student
});

test("ad sets with no spend in the last 3 days are skipped", () => {
  assert.equal(decide(adSet([[20], [0], [0], [0]]), opts), null);
});

test("ad-level signals: copy winners, pause dead ads, refresh tired creatives", () => {
  const ad = (values, extra = {}) => ({ name: "Ad", level: "ad", days: days("2026-10-05", values), ...extra });
  assert.equal(decide(ad([[10, 1], [10], [10, 1]]), opts).key, "copy");
  assert.equal(decide(ad([[30], [30], [5]]), opts).key, "pause");
  assert.equal(decide(ad([[5], [5], [5]], { impressions: 3000, reach: 900, linkClicks: 40 }), opts).key, "refresh");
  assert.equal(decide(ad([[5], [5], [5]], { impressions: 3000, reach: 2500, linkClicks: 9 }), opts).key, "refresh");
  assert.equal(decide(ad([[5], [5], [5]], { impressions: 3000, reach: 2500, linkClicks: 60 }), opts), null);
});

test("decisions sort with pauses first", () => {
  const sorted = sortDecisions([decide(adSet([[5], [6]]), opts), decide(adSet([[25], [25], [25]]), opts), null]);
  assert.equal(sorted.length, 2);
  assert.equal(sorted[0].key, "pause");
});

test("the coach uses the learned cost-per-RDV benchmark", () => {
  const bench = { dynamic: true, best: 0.5, median: 4, high: 7, worst: 20 };
  const benchOpts = { ...opts, rdvTarget: bench };
  assert.equal(decide(adSet([[2, 0, 1], [1], [1]]), benchOpts).key, "promising"); // $4 per RDV, typical
  assert.equal(decide(adSet([[8], [8], [8]]), benchOpts).key, "noRdv"); // $24, more than the worst RDV
  assert.equal(decide(adSet([[9, 0, 1], [9], [9]]), { ...benchOpts }).key, "costlyRdv"); // $27 per RDV
});
