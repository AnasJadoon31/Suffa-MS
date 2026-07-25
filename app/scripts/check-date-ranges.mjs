import assert from "node:assert/strict";
import { dateInTimezone, presetRange } from "../src/lib/dateRanges.ts";

const leapDay = new Date("2024-02-29T20:30:00Z");
assert.equal(dateInTimezone(leapDay, "Asia/Karachi"), "2024-03-01");
assert.deepEqual(presetRange("week", "Asia/Karachi", leapDay), {
  from: "2024-02-24",
  to: "2024-03-01",
});
assert.deepEqual(presetRange("month", "Asia/Karachi", new Date("2024-03-31T06:00:00Z")), {
  from: "2024-02-29",
  to: "2024-03-31",
});
assert.deepEqual(presetRange("year", "Asia/Karachi", new Date("2024-02-29T06:00:00Z")), {
  from: "2023-02-28",
  to: "2024-02-29",
});

console.log("date range boundary checks passed");
