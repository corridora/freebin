import type { WorkerPlatform } from "@/server/context";
import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { createId, json } from "@/server/domain/db";
import { getApiUser } from "@/server/domain/auth";
import {
  enforceQuota,
  redactBody,
  redactHeaders,
  redactValue,
} from "@/server/domain/security";
import { byteLength, enforceStorageLimit } from "@/server/domain/retention";
import {
  forwardingTarget,
  isSafeOutboundTarget,
  outboundHeaders,
} from "@/server/domain/outbound";
import { matchesRule, ruleFromRow } from "@/server/domain/rules";
import { matchesForwardingConditions } from "@/server/domain/forwarding";
import {
  fetchWithClientSpan,
  type Defer,
  type TraceContext,
} from "@/server/domain/telemetry";

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const compressedBodyPrefix = "freebin:base64:";

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

async function readBody(request: Request, limit: number) {
  if (["GET", "HEAD"].includes(request.method)) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("body_limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function forwardCapture(
  db: D1Database,
  env: WorkerPlatform["env"],
  parent: TraceContext,
  defer: Defer,
  requestId: string,
  attemptId: string,
  method: string,
  target: URL,
  headers: Headers,
  rawBody: Uint8Array | null,
) {
  const startedAt = Date.now();
  try {
    const response = await fetchWithClientSpan(
      target,
      {
        method,
        headers,
        body:
          ["GET", "HEAD"].includes(method) || rawBody === null
            ? undefined
            : (rawBody.buffer as ArrayBuffer),
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      },
      { env, parent, defer, name: "freebin.forward" },
    );
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAt;
    const status = response.ok ? "delivered" : "failed";
    await db.batch([
      db
        .prepare(
          `
      UPDATE requests SET forward_status = ?, forward_status_code = ?, forward_error = NULL,
        forwarded_at = ?, forward_duration_ms = ? WHERE id = ?
    `,
        )
        .bind(status, response.status, completedAt, durationMs, requestId),
      db
        .prepare(
          `
      UPDATE forward_attempts SET status = ?, response_status = ?, error = NULL,
        duration_ms = ?, completed_at = ? WHERE id = ?
    `,
        )
        .bind(status, response.status, durationMs, completedAt, attemptId),
    ]);
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Forwarding failed";
    const error = message.slice(0, 500);
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAt;
    await db.batch([
      db
        .prepare(
          `
      UPDATE requests SET forward_status = 'failed', forward_status_code = NULL, forward_error = ?,
        forwarded_at = ?, forward_duration_ms = ? WHERE id = ?
    `,
        )
        .bind(error, completedAt, durationMs, requestId),
      db
        .prepare(
          `
      UPDATE forward_attempts SET status = 'failed', response_status = NULL, error = ?,
        duration_ms = ?, completed_at = ? WHERE id = ?
    `,
        )
        .bind(error, durationMs, completedAt, attemptId),
    ]);
  }
}

const capture: RequestHandler = async ({
  request,
  params,
  platform,
  url,
  getClientAddress,
  locals,
}) => {
  if (!platform?.env.DB)
    return json(
      { error: "D1 database binding is unavailable" },
      { status: 503 },
    );
  const bin = await platform.env.DB.prepare(
    `
    SELECT id, response_status AS responseStatus, response_body AS responseBody,
      response_content_type AS responseContentType, response_headers AS responseHeaders,
      user_id AS userId, is_public_demo AS isPublicDemo,
      forwarding_enabled AS forwardingEnabled, forwarding_url AS forwardingUrl,
      forwarding_auth_headers AS forwardingAuthHeaders, forwarding_conditions AS forwardingConditions
    FROM bins WHERE id = ?
  `,
  )
    .bind(params.id)
    .first<Record<string, unknown>>();
  if (!bin) return json({ error: "Bin not found" }, { status: 404 });
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!token)
    return json(
      { error: "Bearer API key required for request capture" },
      { status: 401 },
    );
  const isPublicDemo = Boolean(Number(bin.isPublicDemo));
  const demoBinId = platform.env.DEMO_BIN_ID || "demo-public";
  const demoApiKey = platform.env.DEMO_API_KEY || "freebin_demo_public";
  const isDemoCapture =
    isPublicDemo && params.id === demoBinId && token === demoApiKey;
  if (!isDemoCapture) {
    const apiUser = await getApiUser(platform.env.DB, token);
    if (!apiUser) return json({ error: "Invalid API key" }, { status: 401 });
    if (!bin.userId || apiUser.id !== bin.userId) {
      return json(
        { error: "API key does not have access to this bin" },
        { status: 403 },
      );
    }
  }
  const demoRateLimitRps = positiveInteger(platform.env.DEMO_RATE_LIMIT_RPS, 1);
  const demoBodyLimitBytes = positiveInteger(
    platform.env.DEMO_BODY_LIMIT_BYTES,
    20 * 1024,
  );
  const demoStorageLimitBytes = positiveInteger(
    platform.env.DEMO_STORAGE_LIMIT_BYTES,
    1024 * 1024,
  );
  const quota = await enforceQuota(
    platform.env.DB,
    isPublicDemo ? "capture:demo" : "capture:registered",
    String(bin.userId),
    isPublicDemo ? demoRateLimitRps : 20,
    1,
    platform.env.RATE_LIMIT_SALT,
  );
  if (!quota.allowed)
    return json(
      { error: "Capture rate limit exceeded", resetAt: quota.resetAt },
      { status: 429, headers: { "retry-after": "1" } },
    );
  const remoteAddress = getClientAddress();
  const bodyLimit = isPublicDemo ? demoBodyLimitBytes : 1024 * 1024;
  const length = Number(request.headers.get("content-length") || 0);
  if (length > bodyLimit)
    return json(
      { error: `Request body exceeds the ${bodyLimit}-byte limit` },
      { status: 413 },
    );
  const contentType = request.headers.get("content-type");
  let rawBody: Uint8Array | null;
  try {
    rawBody = await readBody(request, bodyLimit);
  } catch {
    return json(
      { error: `Request body exceeds the ${bodyLimit}-byte limit` },
      { status: 413 },
    );
  }
  const contentEncoding =
    request.headers.get("content-encoding")?.toLowerCase() || "";
  const isGzip = contentEncoding
    .split(",")
    .map((value) => value.trim())
    .includes("gzip");
  const decodedBody =
    rawBody === null ? null : new TextDecoder().decode(rawBody);
  const body =
    isGzip && rawBody
      ? isPublicDemo
        ? "[redacted: compressed content]"
        : `${compressedBodyPrefix}${toBase64(rawBody)}`
      : redactBody(decodedBody, contentType, isPublicDemo);
  const capturedHeaders = Object.fromEntries(request.headers);
  const headers = redactHeaders(capturedHeaders);
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const current = query[key];
    query[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }
  const path = `/${params.path || ""}`;
  const queryJson = JSON.stringify(isPublicDemo ? redactValue(query) : query);
  const headersJson = JSON.stringify(headers);
  const sizeBytes = byteLength(
    request.method,
    path,
    queryJson,
    headersJson,
    body,
    contentType,
    remoteAddress,
  );
  const requestId = createId(16);
  const ruleRows = await platform.env.DB.prepare(
    "SELECT * FROM response_rules WHERE bin_id = ? AND enabled = 1 ORDER BY priority LIMIT 5",
  )
    .bind(params.id)
    .all<Record<string, unknown>>();
  const matchedRule = ruleRows.results.map(ruleFromRow).find((rule) =>
    matchesRule(rule.conditions, {
      method: request.method,
      path,
      query,
      headers: capturedHeaders,
      body: isGzip ? null : decodedBody,
      contentType,
    }),
  );
  let forwardUrl: URL | null = null;
  if (
    !isPublicDemo &&
    Number(bin.forwardingEnabled) &&
    bin.forwardingUrl &&
    matchesForwardingConditions(bin.forwardingConditions, {
      method: request.method,
      path,
      query,
      headers: capturedHeaders,
      body: isGzip ? null : decodedBody,
      contentType,
    })
  ) {
    try {
      const base = new URL(String(bin.forwardingUrl));
      if (isSafeOutboundTarget(base, platform.env.REPLAY_ALLOWED_ORIGINS)) {
        forwardUrl = forwardingTarget(base, path, url.searchParams);
      }
    } catch {
      forwardUrl = null;
    }
  }
  await platform.env.DB.prepare(
    `
    INSERT INTO requests (id, bin_id, method, path, query, headers, body, content_type, remote_address, created_at, size_bytes,
      forward_status, matched_rule_id, matched_rule_revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  )
    .bind(
      requestId,
      params.id,
      request.method,
      path,
      queryJson,
      headersJson,
      body,
      contentType,
      remoteAddress,
      new Date().toISOString(),
      sizeBytes,
      forwardUrl ? "pending" : null,
      matchedRule?.id || null,
      matchedRule?.revision || null,
    )
    .run();
  let forwardAttemptId: string | null = null;
  if (forwardUrl) {
    forwardAttemptId = createId(16);
    await platform.env.DB.prepare(
      `INSERT INTO forward_attempts
      (id, bin_id, request_id, attempt_number, target_url, status, started_at)
      VALUES (?, ?, ?, 1, ?, 'pending', ?)`,
    )
      .bind(
        forwardAttemptId,
        params.id,
        requestId,
        forwardUrl.href,
        new Date().toISOString(),
      )
      .run();
  }
  await enforceStorageLimit(
    platform.env.DB,
    params.id,
    isPublicDemo ? demoStorageLimitBytes : undefined,
  );
  if (forwardUrl && forwardAttemptId) {
    platform.context.waitUntil(
      forwardCapture(
        platform.env.DB,
        platform.env,
        locals.traceContext,
        (promise) => platform.context.waitUntil(promise),
        requestId,
        forwardAttemptId,
        request.method,
        forwardUrl,
        outboundHeaders(
          capturedHeaders,
          (() => {
            try {
              const names = JSON.parse(
                String(bin.forwardingAuthHeaders || "[]"),
              );
              return Array.isArray(names) ? names.map(String) : [];
            } catch {
              return [];
            }
          })(),
        ),
        rawBody,
      ),
    );
  }
  if (matchedRule?.responseDelayMs)
    await new Promise((resolve) =>
      setTimeout(resolve, Number(matchedRule.responseDelayMs)),
    );
  const responseHeaders = new Headers(
    matchedRule?.responseHeaders ||
      JSON.parse(String(bin.responseHeaders || "{}")),
  );
  responseHeaders.set(
    "content-type",
    String(
      matchedRule?.responseContentType ||
        bin.responseContentType ||
        "application/json; charset=utf-8",
    ),
  );
  responseHeaders.set("x-freebin-captured", "true");
  if (matchedRule)
    responseHeaders.set("x-freebin-rule", String(matchedRule.id));
  return new Response(
    String(matchedRule?.responseBody ?? bin.responseBody ?? ""),
    {
      status: Number(matchedRule?.responseStatus || bin.responseStatus) || 200,
      headers: responseHeaders,
    },
  );
};

export const GET = capture;
export const POST = capture;
export const PUT = capture;
export const PATCH = capture;
export const DELETE = capture;
export const OPTIONS = capture;
