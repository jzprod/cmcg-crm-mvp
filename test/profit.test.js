const test = require("node:test");
const assert = require("node:assert/strict");
const { verdict, derivedBreakEvens, compareCost, halfTrend, bucketCost, rollingCost } = require("../public/profit.js");

test("verdict tiers cost per registration against the break-even", () => {
  assert.equal(verdict(100, 5, 60).key, "scale"); // 20 per registration
  assert.equal(verdict(200, 5, 60).key, "profit"); // 40
  assert.equal(verdict(270, 5, 60).key, "edge"); // 54
  assert.equal(verdict(300, 5, 60).key, "even"); // 60
  assert.equal(verdict(360, 5, 60).key, "loss"); // 72
  assert.equal(verdict(500, 5, 60).key, "losing"); // 100
  assert.equal(verdict(700, 5, 60).key, "heavy"); // 140
  assert.equal(verdict(300, 5, 60).action, "Optimize");
});

test("verdict separates not spending, learning, and spending past break-even without a result", () => {
  assert.equal(verdict(0, 0, 60).key, "idle");
  assert.equal(verdict(0, 2, 60).key, "idle");
  const learning = verdict(30, 0, 60);
  assert.equal(learning.key, "learning");
  assert.equal(learning.ratio, 0.5);
  assert.equal(verdict(70, 0, 60).key, "loss");
  assert.equal(verdict(150, 0, 60).key, "heavy");
  assert.equal(verdict(150, 0, 60).noResult, true);
  assert.equal(verdict(40, 1, 60).lowData, true);
  assert.equal(verdict(40, 3, 60).lowData, false);
});

test("derived break-evens follow real conversion rates", () => {
  const targets = derivedBreakEvens({ messages: 1000, booked: 40, registered: 20 }, 60);
  assert.equal(targets.booked, 30); // half of RDVs register
  assert.equal(targets.message, 1.2); // 2% of messages register
  assert.equal(derivedBreakEvens({ messages: 10, booked: 2, registered: 5 }, 60).booked, 60); // capped at 100%
  assert.equal(derivedBreakEvens({ messages: 0, booked: 0, registered: 0 }, 60).booked, null);
});

test("cost trends treat a lower cost as an improvement", () => {
  const day = (spend, registered) => ({ spend, registered });
  assert.equal(compareCost([day(100, 1)], [day(100, 2)], "registered").direction, "down");
  assert.equal(compareCost([day(100, 1)], [day(100, 2)], "registered").good, true);
  assert.equal(compareCost([day(50, 1)], [day(100, 1)], "registered").good, false);
  assert.equal(compareCost([day(100, 1)], [day(80, 0)], "registered").note, "No result lately");
  assert.equal(compareCost([day(80, 0)], [day(100, 1)], "registered").note, "Started converting");
  assert.equal(compareCost([day(0, 0)], [day(0, 0)], "registered"), null);
  assert.equal(halfTrend([day(100, 1), day(100, 1), day(100, 2), day(100, 2)], "registered").direction, "down");
});

test("bucketed and rolling costs skip windows without results", () => {
  const days = Array.from({ length: 10 }, (_, index) => ({ date: `2026-09-${String(index + 1).padStart(2, "0")}`, spend: 10, registered: index === 9 ? 1 : 0 }));
  const buckets = bucketCost(days, "registered", 7);
  assert.equal(buckets.length, 2);
  assert.equal(buckets[0].value, null);
  assert.equal(buckets[1].value, 70);
  const rolling = rollingCost(days, "registered", 7);
  assert.equal(rolling[8].value, null);
  assert.equal(rolling[9].value, 70);
});
