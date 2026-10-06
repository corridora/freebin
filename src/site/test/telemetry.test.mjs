import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTracePayload,
  createServerTraceContext,
  deploymentEnvironment,
  fetchWithClientSpan,
  serverRouteAttributes,
} from "../server/domain/telemetry.ts";

const env = {
  OTEL_EXPORTER_OTLP_ENDPOINT: "https://ingest.example.test/v1/logs",
  OTEL_SERVER_KEY: "server-key",
  CF_VERSION_METADATA: { tag: "release-42", id: "ignored-id" },
  DEPLOYMENT_ENVIRONMENT: "staging",
};

const parent = {
  traceId: "0123456789abcdef0123456789abcdef",
  spanId: "1111111111111111",
  traceFlags: "01",
};

function attributesByName(attributes) {
  return Object.fromEntries(attributes.map(({ key, value }) => [key, value]));
}

test("OTLP payloads preserve parentage, kinds, status, and the Freebin identity contract", () => {
  const payload = buildTracePayload(env, {
    context: {
      ...parent,
      spanId: "2222222222222222",
      parentSpanId: parent.spanId,
    },
    name: "freebin.replay",
    kind: 3,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_000_010,
    attributes: {
      "http.request.method": "POST",
      "http.response.status_code": 503,
    },
    error: true,
    statusMessage: "HTTP 503",
  });
  const resource = attributesByName(
    payload.resourceSpans[0].resource.attributes,
  );
  const span = payload.resourceSpans[0].scopeSpans[0].spans[0];

  assert.deepEqual(resource["service.namespace"], { stringValue: "freebin" });
  assert.deepEqual(resource["service.name"], { stringValue: "freebin" });
  assert.deepEqual(resource["service.version"], { stringValue: "ignored-id" });
  assert.deepEqual(resource["deployment.environment.name"], {
    stringValue: "staging",
  });
  assert.equal(span.traceId, parent.traceId);
  assert.equal(span.parentSpanId, parent.spanId);
  assert.equal(span.kind, 3);
  assert.deepEqual(span.status, { code: 2, message: "HTTP 503" });
  assert.equal(span.startTimeUnixNano, "1700000000000000000");
});

test("successful and generic 4xx SERVER spans remain UNSET", () => {
  for (const statusCode of [200, 404]) {
    const payload = buildTracePayload(env, {
      context: createServerTraceContext(null),
      name: "HTTP GET",
      kind: 2,
      startedAt: 1,
      endedAt: 2,
      attributes: { "http.response.status_code": statusCode },
      error: false,
    });
    assert.deepEqual(payload.resourceSpans[0].scopeSpans[0].spans[0].status, {
      code: 0,
    });
  }
});

test("continued traces preserve the sampled flag and clear reserved flags", () => {
  const context = createServerTraceContext(
    "00-0123456789abcdef0123456789abcdef-1111111111111111-a3",
  );

  assert.equal(context.traceId, "0123456789abcdef0123456789abcdef");
  assert.equal(context.parentSpanId, "1111111111111111");
  assert.equal(context.traceFlags, "01");
});

test("deployment environment is explicit and defaults to local", () => {
  assert.equal(
    deploymentEnvironment({ CF_VERSION_METADATA: { id: "preview-version" } }),
    "local",
  );
  assert.equal(
    deploymentEnvironment({ DEPLOYMENT_ENVIRONMENT: " preview " }),
    "preview",
  );
  assert.equal(deploymentEnvironment(env), "staging");
});

test("server route attributes retain templates without capability-token paths", () => {
  const shared = serverRouteAttributes(
    new URL("https://freebin.org/shared/bin/private-capability"),
    "/shared/bin/[token]",
  );
  const staticRoute = serverRouteAttributes(
    new URL("https://freebin.org/api/config"),
    "/api/config",
  );

  assert.equal(shared["http.route"], "/shared/bin/[token]");
  assert.equal(shared["url.path"], undefined);
  assert.equal(staticRoute["url.path"], "/api/config");
});

test("client fetch replaces stale carriers without mutating caller input and exports the exact child", async () => {
  const sourceHeaders = new Headers({
    traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-00",
    tracestate: "vendor=stale",
    baggage: "private=value",
    "x-request-id": "request-1",
  });
  const calls = [];
  const deferred = [];
  const fetchMock = async (input, init) => {
    calls.push({ url: String(input), init });
    if (String(input).includes("ingest.example.test"))
      return new Response(null, { status: 200 });
    return new Response("upstream failed", {
      status: 503,
      statusText: "Unavailable",
    });
  };
  const signal = AbortSignal.timeout(5_000);

  const response = await fetchWithClientSpan(
    "https://receiver.example.test:8443/hook?secret=nope",
    {
      method: "POST",
      headers: sourceHeaders,
      body: "payload",
      redirect: "manual",
      signal,
    },
    {
      env,
      parent,
      defer: (promise) => deferred.push(promise),
      fetch: fetchMock,
      name: "freebin.replay",
    },
  );
  await Promise.all(deferred);

  assert.equal(response.status, 503);
  assert.equal(sourceHeaders.get("tracestate"), "vendor=stale");
  assert.equal(sourceHeaders.get("baggage"), "private=value");
  const outboundHeaders = new Headers(calls[0].init.headers);
  assert.equal(outboundHeaders.get("tracestate"), null);
  assert.equal(outboundHeaders.get("baggage"), null);
  assert.equal(outboundHeaders.get("x-request-id"), "request-1");
  assert.match(
    outboundHeaders.get("traceparent"),
    new RegExp(`^00-${parent.traceId}-[0-9a-f]{16}-01$`),
  );
  assert.equal(calls[0].init.body, "payload");
  assert.equal(calls[0].init.signal, signal);
  assert.equal(calls[0].init.redirect, "manual");

  assert.equal(calls[1].url, "https://ingest.example.test/v1/traces");
  assert.equal(calls[1].init.redirect, "error");
  const exported = JSON.parse(calls[1].init.body);
  const span = exported.resourceSpans[0].scopeSpans[0].spans[0];
  assert.equal(span.parentSpanId, parent.spanId);
  assert.equal(span.kind, 3);
  assert.equal(span.status.code, 2);
  const spanAttributes = attributesByName(span.attributes);
  assert.equal(spanAttributes["url.path"], undefined);
  assert.equal(spanAttributes["url.query"], undefined);
});

test("transport errors are rethrown unchanged and exporter failures stay isolated", async () => {
  const original = new TypeError("network unavailable");
  const deferred = [];
  const errors = [];
  const originalConsoleError = console.error;
  console.error = (value) => errors.push(value);
  try {
    const fetchMock = async (input) => {
      if (String(input).includes("ingest.example.test"))
        return new Response(null, { status: 500 });
      throw original;
    };
    await assert.rejects(
      fetchWithClientSpan("https://receiver.example.test/hook", undefined, {
        env,
        parent,
        defer: (promise) => deferred.push(promise),
        fetch: fetchMock,
      }),
      (cause) => cause === original,
    );
    await Promise.all(deferred);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(errors.length, 1);
  const record = JSON.parse(errors[0]);
  assert.equal(record.event, "otel.export.failed");
  assert.equal(record.trace_id, parent.traceId);
  assert.match(record.span_id, /^[0-9a-f]{16}$/);
});
