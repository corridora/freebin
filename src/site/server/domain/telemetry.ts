export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: string;
  parentSpanId?: string;
}

export interface TelemetryEnv {
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_SERVER_KEY?: string;
  CF_VERSION_METADATA?: { id?: string; tag?: string };
  DEPLOYMENT_ENVIRONMENT?: string;
}

export type SpanKind = 2 | 3;

export interface TraceSpan {
  context: TraceContext;
  name: string;
  kind: SpanKind;
  startedAt: number;
  endedAt: number;
  attributes: Record<string, string | number | boolean | undefined>;
  error?: boolean;
  statusMessage?: string;
}

export type Defer = (promise: Promise<unknown>) => void;

const traceparentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const zeroTraceId = "0".repeat(32);
const zeroSpanId = "0".repeat(16);

function randomHex(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function parseTraceparent(
  value: string | null | undefined,
): TraceContext | null {
  if (!value) return null;
  const match = traceparentPattern.exec(value.trim());
  if (!match || match[1] === zeroTraceId || match[2] === zeroSpanId)
    return null;
  const traceFlags = (Number.parseInt(match[3], 16) & 0x01)
    .toString(16)
    .padStart(2, "0");
  return { traceId: match[1], spanId: match[2], traceFlags };
}

export function createServerTraceContext(
  traceparent?: string | null,
): TraceContext {
  const remote = parseTraceparent(traceparent);
  return {
    traceId: remote?.traceId || randomHex(16),
    spanId: randomHex(8),
    traceFlags: remote?.traceFlags || "01",
    ...(remote ? { parentSpanId: remote.spanId } : {}),
  };
}

export function createChildTraceContext(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: randomHex(8),
    traceFlags: parent.traceFlags,
    parentSpanId: parent.spanId,
  };
}

export function formatTraceparent(context: TraceContext) {
  return `00-${context.traceId}-${context.spanId}-${context.traceFlags}`;
}

export function serverRouteAttributes(url: URL, routeId?: string | null) {
  const route = routeId || undefined;
  return {
    "http.route": route,
    "url.path": route && !route.includes("[") ? url.pathname : undefined,
  };
}

function otelValue(value: string | number | boolean) {
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number" && Number.isSafeInteger(value))
    return { intValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  return { stringValue: value };
}

function otelAttributes(attributes: TraceSpan["attributes"]) {
  return Object.entries(attributes)
    .filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== undefined,
    )
    .map(([key, value]) => ({ key, value: otelValue(value) }));
}

export function serviceVersion(env?: TelemetryEnv | null) {
  return env?.CF_VERSION_METADATA?.id || env?.CF_VERSION_METADATA?.tag;
}

export function deploymentEnvironment(env?: TelemetryEnv | null) {
  return env?.DEPLOYMENT_ENVIRONMENT?.trim() || "local";
}

function resourceAttributes(env: TelemetryEnv) {
  return otelAttributes({
    "service.namespace": "freebin",
    "service.name": "freebin",
    "service.version": serviceVersion(env),
    "deployment.environment.name": deploymentEnvironment(env),
    "cloud.provider": "cloudflare",
    "cloud.platform": "cloudflare_workers",
  });
}

export function buildTracePayload(env: TelemetryEnv, span: TraceSpan) {
  const status = span.error
    ? {
        code: 2,
        ...(span.statusMessage ? { message: span.statusMessage } : {}),
      }
    : { code: 0 };
  return {
    resourceSpans: [
      {
        resource: {
          attributes: resourceAttributes(env),
          droppedAttributesCount: 0,
        },
        scopeSpans: [
          {
            scope: {
              name: "freebin.server",
              version: "1.0.0",
              attributes: [],
              droppedAttributesCount: 0,
            },
            spans: [
              {
                traceId: span.context.traceId,
                spanId: span.context.spanId,
                ...(span.context.parentSpanId
                  ? { parentSpanId: span.context.parentSpanId }
                  : {}),
                flags: Number.parseInt(span.context.traceFlags, 16),
                name: span.name,
                kind: span.kind,
                startTimeUnixNano: (
                  BigInt(Math.trunc(span.startedAt)) * 1_000_000n
                ).toString(),
                endTimeUnixNano: (
                  BigInt(Math.trunc(span.endedAt)) * 1_000_000n
                ).toString(),
                attributes: otelAttributes(span.attributes),
                droppedAttributesCount: 0,
                droppedEventsCount: 0,
                droppedLinksCount: 0,
                status,
              },
            ],
            schemaUrl: "https://opentelemetry.io/schemas/1.37.0",
          },
        ],
        schemaUrl: "https://opentelemetry.io/schemas/1.37.0",
      },
    ],
  };
}

function tracesEndpoint(endpoint: string) {
  return `${endpoint.replace(/\/$/, "").replace(/\/v1\/(?:traces|metrics|logs)$/, "")}/v1/traces`;
}

export async function exportTraceSpan(
  env: TelemetryEnv,
  span: TraceSpan,
  fetchImpl: typeof fetch = fetch,
) {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT || !env.OTEL_SERVER_KEY) return;
  const response = await fetchImpl(
    tracesEndpoint(env.OTEL_EXPORTER_OTLP_ENDPOINT),
    {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        "x-corridora-key": env.OTEL_SERVER_KEY,
      },
      body: JSON.stringify(buildTracePayload(env, span)),
    },
  );
  if (!response.ok)
    throw new Error(`Corridora trace ingest returned HTTP ${response.status}`);
}

export function traceLog(
  level: "info" | "error",
  event: string,
  context: TraceContext,
  fields: Record<string, string | number | boolean | undefined> = {},
) {
  const record = JSON.stringify({
    level,
    event,
    "service.namespace": "freebin",
    "service.name": "freebin",
    trace_id: context.traceId,
    span_id: context.spanId,
    ...fields,
  });
  if (level === "error") console.error(record);
  else console.log(record);
}

export function scheduleTraceExport(
  env: TelemetryEnv,
  span: TraceSpan,
  defer?: Defer,
  fetchImpl: typeof fetch = fetch,
) {
  const task = exportTraceSpan(env, span, fetchImpl).catch((cause) => {
    traceLog("error", "otel.export.failed", span.context, {
      "service.version": serviceVersion(env),
      "deployment.environment.name": deploymentEnvironment(env),
      "error.type": cause instanceof Error ? cause.name : typeof cause,
    });
  });
  if (defer) {
    try {
      defer(task);
    } catch {
      void task;
    }
  }
  return task;
}

export async function fetchWithClientSpan(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: {
    env: TelemetryEnv;
    parent: TraceContext;
    defer?: Defer;
    fetch?: typeof fetch;
    name?: string;
  },
) {
  const fetchImpl = options.fetch || fetch;
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = String(
    init?.method || (input instanceof Request ? input.method : "GET"),
  ).toUpperCase();
  const context = createChildTraceContext(options.parent);
  const headers = new Headers(
    init?.headers || (input instanceof Request ? input.headers : undefined),
  );
  headers.delete("traceparent");
  headers.delete("tracestate");
  headers.delete("baggage");
  headers.set("traceparent", formatTraceparent(context));
  const startedAt = Date.now();
  let responseStatus: number | undefined;
  let transportError: unknown;
  try {
    const response = await fetchImpl(input, { ...init, headers });
    responseStatus = response.status;
    return response;
  } catch (cause) {
    transportError = cause;
    throw cause;
  } finally {
    const error =
      transportError !== undefined ||
      (responseStatus !== undefined && responseStatus >= 400);
    scheduleTraceExport(
      options.env,
      {
        context,
        name: options.name || `HTTP ${method}`,
        kind: 3,
        startedAt,
        endedAt: Date.now(),
        attributes: {
          "http.request.method": method,
          "http.response.status_code": responseStatus,
          "url.scheme": url.protocol.slice(0, -1),
          "server.address": url.hostname,
          "server.port": url.port ? Number(url.port) : undefined,
          "error.type":
            transportError instanceof Error
              ? transportError.name
              : transportError === undefined
                ? undefined
                : typeof transportError,
        },
        error,
        statusMessage:
          transportError !== undefined
            ? "transport error"
            : error
              ? `HTTP ${responseStatus}`
              : undefined,
      },
      options.defer,
      fetchImpl,
    );
  }
}
