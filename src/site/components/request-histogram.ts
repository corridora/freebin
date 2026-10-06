const MINUTE_MS = 60_000;
const MAX_BUCKETS = 100;

export function buildRequestHistogram(
  requests: readonly { timestamp: string }[],
) {
  const timestamps = requests
    .map((request) => Date.parse(request.timestamp))
    .filter(Number.isFinite);
  if (!timestamps.length) return null;

  let earliest = timestamps[0];
  let latest = timestamps[0];
  for (const timestamp of timestamps) {
    earliest = Math.min(earliest, timestamp);
    latest = Math.max(latest, timestamp);
  }
  const start = Math.floor(earliest / MINUTE_MS) * MINUTE_MS;
  // Include the latest timestamp even when it lands exactly on a bucket edge.
  const bucketMs = Math.max(
    MINUTE_MS,
    Math.ceil((latest - start + 1) / MAX_BUCKETS / MINUTE_MS) * MINUTE_MS,
  );
  const buckets = Array.from(
    { length: Math.floor((latest - start) / bucketMs) + 1 },
    (_, index) => ({
      start: start + index * bucketMs,
      end: start + (index + 1) * bucketMs,
      count: 0,
    }),
  );
  for (const timestamp of timestamps)
    buckets[Math.floor((timestamp - start) / bucketMs)].count++;

  return { buckets, bucketMs, earliest, latest, total: timestamps.length };
}
