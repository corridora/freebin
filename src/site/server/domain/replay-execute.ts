import type { WorkerPlatform } from "@/server/context";
import { createId } from "./db";
import { isSafeOutboundTarget, forwardingTarget } from "./outbound";
import { applyReplayPath, normalizeReplay, type ReplayInput } from "./replay";
import { enforceStorageLimit } from "./retention";
import { enforceQuota } from "./security";
import { recordAudit } from "./audit";
import {
  fetchWithClientSpan,
  type Defer,
  type TraceContext,
} from "./telemetry";

export async function executeReplay(options: {
  db: D1Database;
  request: Request;
  binId: string;
  requestId: string;
  input: ReplayInput;
  rateLimitSalt?: string;
  allowedOrigins?: string;
  env: WorkerPlatform["env"];
  parent: TraceContext;
  defer: Defer;
  actor?: { id: string; email: string; type: "session" | "api_key" | "oauth" };
}) {
  const { db, request, binId, requestId, input } = options;
  const operation = input.operation === "forward" ? "forward" : "replay";
  const captured = await db
    .prepare(
      `SELECT r.method, r.path, r.query, r.headers, r.body, r.content_type AS contentType,
    b.user_id AS userId, b.is_public_demo AS isPublicDemo, b.forwarding_enabled AS forwardingEnabled,
    b.forwarding_url AS forwardingUrl, b.forwarding_auth_headers AS forwardingAuthHeaders
    FROM requests r JOIN bins b ON b.id = r.bin_id WHERE r.id = ? AND r.bin_id = ?`,
    )
    .bind(requestId, binId)
    .first<Record<string, unknown>>();
  if (!captured)
    return { status: 404, body: { error: "Captured request not found" } };
  const isPublicDemo = Boolean(Number(captured.isPublicDemo));
  const quota = await enforceQuota(
    db,
    "request-egress",
    String(captured.userId),
    isPublicDemo ? 1 : 20,
    1,
    options.rateLimitSalt,
  );
  if (!quota.allowed)
    return {
      status: 429,
      body: { error: "Egress rate limit exceeded; try again shortly" },
    };
  const configuredUrl =
    operation === "forward"
      ? String(captured.forwardingUrl || "")
      : String(input.url || "");
  if (
    operation === "forward" &&
    (!Number(captured.forwardingEnabled) || !configuredUrl)
  )
    return {
      status: 409,
      body: { error: "Automatic forwarding is not configured for this bin" },
    };
  let target: URL;
  try {
    target = new URL(configuredUrl);
  } catch {
    return {
      status: 400,
      body: {
        error:
          operation === "forward"
            ? "The configured forwarding URL is invalid"
            : "Enter a valid HTTPS replay URL",
      },
    };
  }
  if (!isSafeOutboundTarget(target, options.allowedOrigins))
    return {
      status: 400,
      body: {
        error: `${operation === "forward" ? "Forwarding" : "Replay"} target origin is not allowed by this deployment`,
      },
    };
  let retainedHeaders: string[] = [];
  if (operation === "forward") {
    try {
      const names = JSON.parse(String(captured.forwardingAuthHeaders || "[]"));
      retainedHeaders = Array.isArray(names) ? names.map(String) : [];
    } catch {
      retainedHeaders = [];
    }
  }
  let edited;
  try {
    edited = normalizeReplay(input, captured, retainedHeaders);
  } catch (cause) {
    return {
      status: 400,
      body: {
        error:
          cause instanceof Error ? cause.message : "Invalid replay request",
      },
    };
  }
  target =
    operation === "forward"
      ? forwardingTarget(
          target,
          edited.path,
          new URLSearchParams(
            Object.entries(edited.query).flatMap(([key, value]) =>
              (Array.isArray(value) ? value : [value]).map((item) => [
                key,
                item,
              ]),
            ),
          ),
        )
      : applyReplayPath(target, edited.path, edited.query);
  if (target.href.length > 4_000)
    return {
      status: 400,
      body: { error: "Final replay URL exceeds 4,000 characters" },
    };
  const id = createId(16);
  const createdAt = new Date().toISOString();
  const startedAt = Date.now();
  let responseStatus: number | null = null;
  let responseStatusText: string | null = null;
  let error: string | null = null;
  try {
    const response = await fetchWithClientSpan(
      target,
      {
        method: edited.method,
        headers: new Headers(edited.headers),
        body:
          ["GET", "HEAD"].includes(edited.method) || edited.body === null
            ? undefined
            : edited.body,
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      },
      {
        env: options.env,
        parent: options.parent,
        defer: options.defer,
        name: `freebin.${operation}`,
      },
    );
    responseStatus = response.status;
    responseStatusText = response.statusText;
  } catch (cause) {
    error = (cause instanceof Error ? cause.message : "Replay failed").slice(
      0,
      500,
    );
  }
  const durationMs = Date.now() - startedAt;
  const serializedQuery = JSON.stringify(edited.query);
  const serializedHeaders = JSON.stringify(edited.headers);
  const sizeBytes = new TextEncoder().encode(
    [
      operation,
      target.href,
      edited.method,
      edited.path,
      serializedQuery,
      serializedHeaders,
      edited.body || "",
      error || "",
    ].join(""),
  ).byteLength;
  await db
    .prepare(
      `INSERT INTO replay_attempts
    (id, bin_id, request_id, operation, target_url, method, path, query, headers, body, response_status, response_status_text, error, duration_ms, size_bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      binId,
      requestId,
      operation,
      target.href,
      edited.method,
      edited.path,
      serializedQuery,
      serializedHeaders,
      edited.body,
      responseStatus,
      responseStatusText,
      error,
      durationMs,
      sizeBytes,
      createdAt,
    )
    .run();
  await enforceStorageLimit(db, binId);
  const retained = Boolean(
    await db
      .prepare("SELECT id FROM replay_attempts WHERE id = ?")
      .bind(id)
      .first(),
  );
  const attempt = {
    id,
    operation,
    targetUrl: target.href,
    ...edited,
    responseStatus,
    responseStatusText,
    error,
    durationMs,
    sizeBytes,
    createdAt,
    retained,
  };
  await recordAudit(db, request, {
    binId,
    action: operation === "forward" ? "forward.create" : "replay.create",
    targetType: "request",
    targetId: requestId,
    metadata: { attemptId: id, status: responseStatus, failed: Boolean(error) },
    actor: options.actor,
  });
  return {
    status: error ? 502 : 200,
    body: {
      ok: !error,
      status: responseStatus,
      statusText: responseStatusText,
      error,
      attempt,
    },
  };
}
