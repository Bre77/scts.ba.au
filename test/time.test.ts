import { strict as assert } from "node:assert";
import { test } from "node:test";
import { formatDuration, formatDurationLong, readLease } from "../src/lib/time.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test("formatDuration drops the smaller unit when it is zero", () => {
  assert.equal(formatDuration(3 * DAY), "3d");
  assert.equal(formatDuration(3 * DAY + 2 * HOUR), "3d 2h");
  assert.equal(formatDuration(5 * HOUR), "5h");
  assert.equal(formatDuration(5 * HOUR + 20 * MIN), "5h 20m");
  assert.equal(formatDuration(18 * MIN), "18m");
});

test("formatDuration never claims zero minutes remain", () => {
  assert.equal(formatDuration(20_000), "1m");
  assert.equal(formatDuration(0), "now");
  assert.equal(formatDuration(-HOUR), "now");
});

test("formatDurationLong pluralises", () => {
  assert.equal(formatDurationLong(DAY), "1 day");
  assert.equal(formatDurationLong(4 * DAY), "4 days");
  assert.equal(formatDurationLong(2 * HOUR), "2 hours");
  assert.equal(formatDurationLong(-1), "any moment now");
});

test("readLease reports how much of the stack's life is spent", () => {
  const start = Date.parse("2026-09-01T00:00:00Z");
  const end = Date.parse("2026-09-11T00:00:00Z");
  const lease = readLease(new Date(start).toISOString(), new Date(end).toISOString(), start + 2 * DAY);

  assert.equal(lease.spent, 0.2);
  assert.equal(lease.remainingMs, 8 * DAY);
  assert.equal(lease.endingSoon, false);
});

test("readLease clamps a spent fraction to the bar's range", () => {
  const start = "2026-09-01T00:00:00Z";
  const end = "2026-09-08T00:00:00Z";

  assert.equal(readLease(start, end, Date.parse(start) - DAY).spent, 0, "clock skew before creation");
  assert.equal(readLease(start, end, Date.parse(end) + DAY).spent, 1, "already overdue");
});

test("readLease flags the final day", () => {
  const start = "2026-09-01T00:00:00Z";
  const end = "2026-09-08T00:00:00Z";

  assert.equal(readLease(start, end, Date.parse(end) - 25 * HOUR).endingSoon, false);
  assert.equal(readLease(start, end, Date.parse(end) - 4 * HOUR).endingSoon, true);
});

test("readLease survives a termination date it cannot parse", () => {
  const lease = readLease("2026-09-01T00:00:00Z", "not-a-date", Date.now());
  assert.ok(Number.isNaN(lease.remainingMs));
  assert.equal(lease.spent, 0);
});
