import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isRetainableAuthHeader,
  outboundHeaders,
} from "../server/domain/outbound.ts";

test("replay and forwarding permanently strip stale propagation carriers", () => {
  const stored = Object.freeze({
    TraceParent: "00-0123456789abcdef0123456789abcdef-1111111111111111-01",
    TRACESTATE: "vendor=value",
    Baggage: "account.email=private@example.test",
    "X-Request-ID": "request-123",
  });
  const before = { ...stored };

  const headers = outboundHeaders(stored, [
    "traceparent",
    "tracestate",
    "baggage",
  ]);

  assert.equal(headers.get("traceparent"), null);
  assert.equal(headers.get("tracestate"), null);
  assert.equal(headers.get("baggage"), null);
  assert.equal(headers.get("x-request-id"), "request-123");
  assert.deepEqual(stored, before);
});

test("propagation carriers cannot be configured as retained auth headers", () => {
  for (const name of ["traceparent", "TraceState", "BAGGAGE"]) {
    assert.equal(isRetainableAuthHeader(name), false);
  }
  assert.equal(isRetainableAuthHeader("stripe-signature"), true);
});
