import type { WorkerPlatform } from "@/server/context";
import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { canManageBin, type BinPermission } from "@/server/domain/auth";
import { bearer, createId, json } from "@/server/domain/db";
import { isSafeOutboundTarget } from "@/server/domain/outbound";
import { forwardingTarget } from "@/server/domain/outbound";
import {
  applyReplayPath,
  normalizeReplay,
  type ReplayInput,
} from "@/server/domain/replay";
import { enforceStorageLimit } from "@/server/domain/retention";
import { enforceQuota } from "@/server/domain/security";
import { recordAudit } from "@/server/domain/audit";
import { fetchWithClientSpan } from "@/server/domain/telemetry";

async function authorize(
  request: Request,
  params: { id: string },
  platform: WorkerPlatform | undefined,
  permission: BinPermission,
) {
  if (!platform?.env.DB)
    return {
      error: json(
        { error: "D1 database binding is unavailable" },
        { status: 503 },
      ),
    };
  if (
    !(await canManageBin(
      platform.env.DB,
      request,
      params.id,
      bearer(request),
      permission,
    ))
  )
    return {
      error: json(
        { error: "Invalid or expired inspector token" },
        { status: 403 },
      ),
    };
  return { db: platform.env.DB };
}

export const GET: RequestHandler = async ({ request, params, platform }) => {
  const auth = await authorize(
    request,
    { id: params.id },
    platform,
    "replay.view",
  );
  if (auth.error) return auth.error;
  const captured = await auth
    .db!.prepare("SELECT id FROM requests WHERE id = ? AND bin_id = ?")
    .bind(params.requestId, params.id)
    .first();
  if (!captured)
    return json({ error: "Captured request not found" }, { status: 404 });
  const result = await auth
    .db!.prepare(
      `SELECT id, operation, target_url AS targetUrl, method, path, query, headers, body,
    response_status AS responseStatus, response_status_text AS responseStatusText, error,
    duration_ms AS durationMs, size_bytes AS sizeBytes, created_at AS createdAt
    FROM replay_attempts WHERE request_id = ? AND bin_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .bind(params.requestId, params.id)
    .all<Record<string, unknown>>();
  return json({
    attempts: result.results.map((row) => ({
      ...row,
      query: JSON.parse(String(row.query || "{}")),
      headers: JSON.parse(String(row.headers || "{}")),
    })),
  });
};

export const POST: RequestHandler = async ({
  request,
  params,
  platform,
  locals,
}) => {
  const input = (await request.json().catch(() => ({}))) as ReplayInput;
  const operation = input.operation === "forward" ? "forward" : "replay";
  const auth = await authorize(
    request,
    { id: params.id },
    platform,
    operation === "forward" ? "forwarding.edit" : "replay.edit",
  );
  if (auth.error) return auth.error;
  const captured = await auth
    .db!.prepare(
      `
    SELECT r.method, r.path, r.query, r.headers, r.body, r.content_type AS contentType,
      b.user_id AS userId, b.is_public_demo AS isPublicDemo, b.forwarding_enabled AS forwardingEnabled,
      b.forwarding_url AS forwardingUrl, b.forwarding_auth_headers AS forwardingAuthHeaders
    FROM requests r JOIN bins b ON b.id = r.bin_id WHERE r.id = ? AND r.bin_id = ?
  `,
    )
    .bind(params.requestId, params.id)
    .first<Record<string, unknown>>();
  if (!captured)
    return json({ error: "Captured request not found" }, { status: 404 });
  const isPublicDemo = Boolean(Number(captured.isPublicDemo));
  const quota = await enforceQuota(
    auth.db!,
    "request-egress",
    String(captured.userId),
    isPublicDemo ? 1 : 20,
    1,
    platform?.env.RATE_LIMIT_SALT,
  );
  if (!quota.allowed)
    return json(
      { error: "Egress rate limit exceeded; try again shortly" },
      { status: 429 },
    );
  let target: URL;
  const configuredUrl =
    operation === "forward"
      ? String(captured.forwardingUrl || "")
      : String(input.url || "");
  if (
    operation === "forward" &&
    (!Number(captured.forwardingEnabled) || !configuredUrl)
  )
    return json(
      { error: "Automatic forwarding is not configured for this bin" },
      { status: 409 },
    );
  try {
    target = new URL(configuredUrl);
  } catch {
    return json(
      {
        error:
          operation === "forward"
            ? "The configured forwarding URL is invalid"
            : "Enter a valid HTTPS replay URL",
      },
      { status: 400 },
    );
  }
  if (!isSafeOutboundTarget(target, platform?.env.REPLAY_ALLOWED_ORIGINS))
    return json(
      {
        error: `${operation === "forward" ? "Forwarding" : "Replay"} target origin is not allowed by this deployment`,
      },
      { status: 400 },
    );
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
    return json(
      {
        error:
          cause instanceof Error ? cause.message : "Invalid replay request",
      },
      { status: 400 },
    );
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
    return json(
      { error: "Final replay URL exceeds 4,000 characters" },
      { status: 400 },
    );
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
        env: platform!.env,
        parent: locals.traceContext,
        defer: (promise) => platform!.context.waitUntil(promise),
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
  await auth
    .db!.prepare(
      `INSERT INTO replay_attempts
    (id, bin_id, request_id, operation, target_url, method, path, query, headers, body, response_status, response_status_text, error, duration_ms, size_bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      params.id,
      params.requestId,
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
  await enforceStorageLimit(auth.db!, params.id);
  const retained = Boolean(
    await auth
      .db!.prepare("SELECT id FROM replay_attempts WHERE id = ?")
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
  await recordAudit(auth.db!, request, {
    binId: params.id,
    action: operation === "forward" ? "forward.create" : "replay.create",
    targetType: "request",
    targetId: params.requestId,
    metadata: { attemptId: id, status: responseStatus, failed: Boolean(error) },
  });
  return json(
    {
      ok: !error,
      status: responseStatus,
      statusText: responseStatusText,
      error,
      attempt,
    },
    { status: error ? 502 : 200 },
  );
};
