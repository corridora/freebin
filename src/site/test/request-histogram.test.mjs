import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequestHistogram } from "../components/request-histogram.ts";

const start = Date.parse("2026-10-06T12:00:00.000Z");
const request = (offset) => ({
  timestamp: new Date(start + offset).toISOString(),
});

test("empty and invalid timestamps have no histogram", () => {
  assert.equal(buildRequestHistogram([]), null);
  assert.equal(buildRequestHistogram([{ timestamp: "invalid" }]), null);
});

test("a single capture and simultaneous captures use one minute", () => {
  for (const count of [1, 5]) {
    const result = buildRequestHistogram(
      Array.from({ length: count }, () => request(15_000)),
    );
    assert.equal(result.bucketMs, 60_000);
    assert.deepEqual(result.buckets, [{ start, end: start + 60_000, count }]);
    assert.equal(result.earliest, start + 15_000);
    assert.equal(result.latest, start + 15_000);
  }
});

test("unsorted captures use half-open buckets and preserve empty intervals", () => {
  const result = buildRequestHistogram([
    request(180_000),
    request(59_999),
    request(60_000),
    request(5_000),
    { timestamp: "invalid" },
  ]);
  assert.equal(result.bucketMs, 60_000);
  assert.deepEqual(
    result.buckets.map((bucket) => bucket.count),
    [2, 1, 0, 1],
  );
  assert.equal(result.total, 4);
});

test("100 minutes fit in 100 buckets while the next edge widens buckets", () => {
  const hundred = buildRequestHistogram([
    request(0),
    request(100 * 60_000 - 1),
  ]);
  assert.equal(hundred.buckets.length, 100);
  assert.equal(hundred.bucketMs, 60_000);
  const edge = buildRequestHistogram([request(0), request(100 * 60_000)]);
  assert.equal(edge.bucketMs, 120_000);
  assert.equal(edge.buckets.length, 51);
  assert.equal(edge.buckets.at(-1).count, 1);
});

test("short and long data ranges always conserve counts within the limits", () => {
  for (const span of [
    0,
    60_000,
    120 * 60_000,
    24 * 60 * 60_000,
    365 * 24 * 60 * 60_000,
  ]) {
    const requests = Array.from({ length: 503 }, (_, index) =>
      request(Math.floor((index / 502) * span)),
    );
    const result = buildRequestHistogram(requests);
    assert.ok(result.buckets.length >= 1 && result.buckets.length <= 100);
    assert.ok(result.bucketMs >= 60_000);
    assert.equal(result.bucketMs % 60_000, 0);
    assert.equal(
      result.buckets.reduce((sum, bucket) => sum + bucket.count, 0),
      requests.length,
    );
    assert.ok(result.buckets[0].start <= result.earliest);
    assert.ok(result.buckets.at(-1).end > result.latest);
  }
});
