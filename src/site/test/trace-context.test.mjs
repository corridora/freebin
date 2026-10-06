import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createChildTraceContext,
  createServerTraceContext,
  formatTraceparent,
  parseTraceparent,
} from "../server/domain/telemetry.ts";

const valid = "00-0123456789abcdef0123456789abcdef-1111111111111111-a3";

test("a server span continues one strictly valid remote parent", () => {
  const context = createServerTraceContext(valid);

  assert.equal(context.traceId, "0123456789abcdef0123456789abcdef");
  assert.equal(context.parentSpanId, "1111111111111111");
  assert.equal(context.traceFlags, "01");
  assert.match(context.spanId, /^[0-9a-f]{16}$/);
  assert.notEqual(context.spanId, "0000000000000000");
});

test("malformed, ambiguous, unsupported, uppercase, and all-zero parents are rejected", () => {
  const invalid = [
    `${valid},${valid}`,
    valid.replace(/^00/, "01"),
    valid.toUpperCase(),
    "00-00000000000000000000000000000000-1111111111111111-01",
    "00-0123456789abcdef0123456789abcdef-0000000000000000-01",
    "00-0123456789abcdef0123456789abcdef-1111111111111111-0",
  ];

  for (const value of invalid)
    assert.equal(parseTraceparent(value), null, value);
  const root = createServerTraceContext(invalid[0]);
  assert.match(root.traceId, /^[0-9a-f]{32}$/);
  assert.equal(root.parentSpanId, undefined);
  assert.equal(root.traceFlags, "01");
});

test("a child gets a fresh span ID and formats the sampled inherited trace flag", () => {
  const parent = createServerTraceContext(valid);
  const child = createChildTraceContext(parent);

  assert.equal(child.traceId, parent.traceId);
  assert.equal(child.parentSpanId, parent.spanId);
  assert.notEqual(child.spanId, parent.spanId);
  assert.equal(
    formatTraceparent(child),
    `00-${parent.traceId}-${child.spanId}-01`,
  );
});
