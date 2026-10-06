import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  buildProviderTracePayload,
  runWithProviderTelemetry,
} from "../server/provider-telemetry.js";

const env = {
  OTEL_EXPORTER_OTLP_ENDPOINT: "https://ingest.example.test/v1/logs",
  OTEL_SERVER_KEY: "server-key",
  CF_VERSION_METADATA: { id: "version-id", tag: "release-tag" },
  DEPLOYMENT_ENVIRONMENT: "staging",
};

function attributesByName(attributes) {
  return Object.fromEntries(attributes.map(({ key, value }) => [key, value]));
}

test("provider spans continue valid context without exporting sensitive path segments", () => {
  const request = new Request(
    "https://freebin.org/.well-known/oauth-protected-resource/private-capability?secret=nope",
    {
      headers: {
        traceparent: "00-0123456789abcdef0123456789abcdef-1111111111111111-a3",
      },
    },
  );
  const result = buildProviderTracePayload(
    env,
    request,
    new Response(null, { status: 200 }),
    undefined,
    1_700_000_000_000,
    1_700_000_000_010,
  );
  const resource = attributesByName(
    result.payload.resourceSpans[0].resource.attributes,
  );
  const span = result.payload.resourceSpans[0].scopeSpans[0].spans[0];
  const attributes = attributesByName(span.attributes);

  assert.equal(span.traceId, "0123456789abcdef0123456789abcdef");
  assert.equal(span.parentSpanId, "1111111111111111");
  assert.equal(span.flags, 1);
  assert.deepEqual(resource["service.version"], { stringValue: "version-id" });
  assert.deepEqual(resource["deployment.environment.name"], {
    stringValue: "staging",
  });
  assert.deepEqual(attributes["http.route"], {
    stringValue: "/.well-known/oauth-protected-resource/{resource}",
  });
  assert.equal(attributes["url.path"], undefined);
  assert.equal(attributes["url.query"], undefined);
});

test("provider-owned responses emit one correlated span and request log", async () => {
  const deferred = [];
  const calls = [];
  const logs = [];
  const originalConsoleLog = console.log;
  console.log = (record) => logs.push(record);
  try {
    const response = await runWithProviderTelemetry({
      request: new Request("https://freebin.org/oauth/token", {
        method: "POST",
      }),
      env,
      ctx: { waitUntil: (promise) => deferred.push(promise) },
      dispatch: async () => new Response(null, { status: 400 }),
      wasDelegated: () => false,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return new Response(null, { status: 200 });
      },
    });
    await Promise.all(deferred);

    assert.equal(response.status, 400);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://ingest.example.test/v1/traces");
    assert.equal(calls[0].init.redirect, "error");
    const span = JSON.parse(calls[0].init.body).resourceSpans[0].scopeSpans[0]
      .spans[0];
    const log = JSON.parse(logs[0]);
    assert.equal(span.status.code, 0);
    assert.equal(log.trace_id, span.traceId);
    assert.equal(log.span_id, span.spanId);
  } finally {
    console.log = originalConsoleLog;
  }
});

test("requests delegated to the application skip provider instrumentation", async () => {
  const deferred = [];
  const calls = [];
  const response = await runWithProviderTelemetry({
    request: new Request("https://freebin.org/oauth/authorize"),
    env,
    ctx: { waitUntil: (promise) => deferred.push(promise) },
    dispatch: async () => new Response(null, { status: 200 }),
    wasDelegated: () => true,
    fetchImpl: async (...args) => {
      calls.push(args);
      return new Response(null, { status: 200 });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(deferred.length, 0);
  assert.equal(calls.length, 0);
});

test("Worker modules are not exposed as public assets", () => {
  const publicDirectory = new URL("../public/", import.meta.url);
  for (const name of ["worker.js", "provider-telemetry.js"]) {
    assert.throws(() => readFileSync(new URL(name, publicDirectory)), {
      code: "ENOENT",
    });
  }
});
