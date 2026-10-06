const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ZERO_TRACE_ID = "0".repeat(32);
const ZERO_SPAN_ID = "0".repeat(16);

function randomHex(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function requestContext(traceparent) {
  const match = traceparent
    ? TRACEPARENT_PATTERN.exec(traceparent.trim())
    : null;
  const remote =
    match && match[1] !== ZERO_TRACE_ID && match[2] !== ZERO_SPAN_ID
      ? {
          traceId: match[1],
          spanId: match[2],
          traceFlags: (Number.parseInt(match[3], 16) & 0x01)
            .toString(16)
            .padStart(2, "0"),
        }
      : null;
  return {
    traceId: remote?.traceId || randomHex(16),
    spanId: randomHex(8),
    traceFlags: remote?.traceFlags || "01",
    ...(remote ? { parentSpanId: remote.spanId } : {}),
  };
}

function otelValue(value) {
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number" && Number.isSafeInteger(value))
    return { intValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  return { stringValue: value };
}

function otelAttributes(attributes) {
  return Object.entries(attributes)
    .filter((entry) => entry[1] !== undefined)
    .map(([key, value]) => ({ key, value: otelValue(value) }));
}

function serviceVersion(env) {
  return env.CF_VERSION_METADATA?.id || env.CF_VERSION_METADATA?.tag;
}

function deploymentEnvironment(env) {
  return env.DEPLOYMENT_ENVIRONMENT?.trim() || "local";
}

function providerRoute(pathname) {
  if (pathname === "/.well-known/oauth-authorization-server") return pathname;
  if (pathname.startsWith("/.well-known/oauth-protected-resource")) {
    return "/.well-known/oauth-protected-resource/{resource}";
  }
  if (pathname === "/oauth/token" || pathname === "/oauth/register")
    return pathname;
  if (pathname === "/mcp" || pathname.startsWith("/mcp/")) return "/mcp{path}";
  return "oauth-provider";
}

export function buildProviderTracePayload(
  env,
  request,
  response,
  thrown,
  startedAt,
  endedAt,
) {
  const context = requestContext(request.headers.get("traceparent"));
  const url = new URL(request.url);
  const status = response?.status || 500;
  const failed = thrown !== undefined || status >= 500;
  const attributes = {
    "http.request.method": request.method,
    "http.response.status_code": status,
    "http.route": providerRoute(url.pathname),
    "url.scheme": url.protocol.slice(0, -1),
    "server.address": url.hostname,
    "server.port": url.port ? Number(url.port) : undefined,
    "error.type":
      thrown instanceof Error
        ? thrown.name
        : thrown === undefined
          ? undefined
          : typeof thrown,
  };
  return {
    context,
    attributes,
    payload: {
      resourceSpans: [
        {
          resource: {
            attributes: otelAttributes({
              "service.namespace": "freebin",
              "service.name": "freebin",
              "service.version": serviceVersion(env),
              "deployment.environment.name": deploymentEnvironment(env),
              "cloud.provider": "cloudflare",
              "cloud.platform": "cloudflare_workers",
            }),
            droppedAttributesCount: 0,
          },
          scopeSpans: [
            {
              scope: {
                name: "freebin.oauth-provider",
                version: "1.0.0",
                attributes: [],
                droppedAttributesCount: 0,
              },
              spans: [
                {
                  traceId: context.traceId,
                  spanId: context.spanId,
                  ...(context.parentSpanId
                    ? { parentSpanId: context.parentSpanId }
                    : {}),
                  flags: Number.parseInt(context.traceFlags, 16),
                  name: `HTTP ${request.method}`,
                  kind: 2,
                  startTimeUnixNano: (
                    BigInt(Math.trunc(startedAt)) * 1_000_000n
                  ).toString(),
                  endTimeUnixNano: (
                    BigInt(Math.trunc(endedAt)) * 1_000_000n
                  ).toString(),
                  attributes: otelAttributes(attributes),
                  droppedAttributesCount: 0,
                  droppedEventsCount: 0,
                  droppedLinksCount: 0,
                  status: failed
                    ? { code: 2, message: "request failed" }
                    : { code: 0 },
                },
              ],
              schemaUrl: "https://opentelemetry.io/schemas/1.37.0",
            },
          ],
          schemaUrl: "https://opentelemetry.io/schemas/1.37.0",
        },
      ],
    },
  };
}

async function exportProviderTrace(env, payload, fetchImpl) {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT || !env.OTEL_SERVER_KEY) return;
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, "").replace(
    /\/v1\/(?:traces|metrics|logs)$/,
    "",
  );
  const response = await fetchImpl(`${endpoint}/v1/traces`, {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      "x-corridora-key": env.OTEL_SERVER_KEY,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok)
    throw new Error(`Corridora trace ingest returned HTTP ${response.status}`);
}

function traceLog(level, event, env, context, fields) {
  const record = JSON.stringify({
    level,
    event,
    "service.namespace": "freebin",
    "service.name": "freebin",
    "service.version": serviceVersion(env),
    "deployment.environment.name": deploymentEnvironment(env),
    trace_id: context.traceId,
    span_id: context.spanId,
    ...fields,
  });
  if (level === "error") console.error(record);
  else console.log(record);
}

export async function runWithProviderTelemetry({
  request,
  env,
  ctx,
  dispatch,
  wasDelegated,
  fetchImpl = fetch,
}) {
  const startedAt = Date.now();
  let response;
  let thrown;
  try {
    response = await dispatch();
    return response;
  } catch (cause) {
    thrown = cause;
    throw cause;
  } finally {
    if (!wasDelegated()) {
      const endedAt = Date.now();
      const trace = buildProviderTracePayload(
        env,
        request,
        response,
        thrown,
        startedAt,
        endedAt,
      );
      traceLog("info", "http.request", env, trace.context, {
        duration_ms: endedAt - startedAt,
        ...trace.attributes,
      });
      const task = exportProviderTrace(env, trace.payload, fetchImpl).catch(
        (cause) => {
          traceLog("error", "otel.export.failed", env, trace.context, {
            "error.type": cause instanceof Error ? cause.name : typeof cause,
          });
        },
      );
      try {
        ctx.waitUntil(task);
      } catch {
        void task;
      }
    }
  }
}
