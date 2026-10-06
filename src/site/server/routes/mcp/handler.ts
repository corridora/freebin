import type { WorkerPlatform } from "@/server/context";
import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { getApiUser } from "@/server/domain/auth";
import { bearer } from "@/server/domain/db";
import { executeReplay } from "@/server/domain/replay-execute";
import {
  fetchWithClientSpan,
  type Defer,
  type TraceContext,
} from "@/server/domain/telemetry";

type ApiUser = { id: string; email: string };

function toolResult(value: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    isError,
  };
}

async function ownedBin(db: D1Database, userId: string, binId: string) {
  return Boolean(
    await db
      .prepare("SELECT id FROM bins WHERE id = ? AND user_id = ?")
      .bind(binId, userId)
      .first(),
  );
}

function createServer(
  db: D1Database,
  user: ApiUser,
  token: string,
  origin: string,
  scopes: Set<string>,
  env: WorkerPlatform["env"],
  request: Request,
  parent: TraceContext,
  defer: Defer,
) {
  const server = new McpServer({ name: "freebin", version: "1.0.0" });

  if (scopes.has("bins:read"))
    server.registerTool(
      "list_bins",
      {
        title: "List Freebin bins",
        description:
          "List request bins owned by the authenticated Freebin account, including request counts.",
        inputSchema: z.object({}),
      },
      async () => {
        const rows = await db
          .prepare(
            `SELECT b.id AS binId, b.name, b.created_at AS createdAt,
      COUNT(r.id) AS requestCount FROM bins b LEFT JOIN requests r ON r.bin_id = b.id
      WHERE b.user_id = ? GROUP BY b.id ORDER BY lower(b.name), b.id`,
          )
          .bind(user.id)
          .all();
        return toolResult({ bins: rows.results });
      },
    );

  if (scopes.has("requests:read"))
    server.registerTool(
      "list_requests",
      {
        title: "List captured requests",
        description:
          "List newest captured-request summaries for one owned bin. Use get_request for headers and body.",
        inputSchema: z.object({
          binId: z.string().min(1).describe("Freebin bin ID"),
          limit: z.number().int().min(1).max(50).default(10),
        }),
      },
      async ({ binId, limit }) => {
        if (!(await ownedBin(db, user.id, binId)))
          return toolResult(
            { error: "Bin not found or not owned by this account" },
            true,
          );
        const rows = await db
          .prepare(
            `SELECT id AS requestId, method, path, content_type AS contentType,
      size_bytes AS sizeBytes, created_at AS timestamp, forward_status AS forwardStatus,
      matched_rule_id AS matchedRuleId FROM requests WHERE bin_id = ?
      ORDER BY created_at DESC, id DESC LIMIT ?`,
          )
          .bind(binId, limit)
          .all();
        return toolResult({ binId, requests: rows.results });
      },
    );

  if (scopes.has("requests:read"))
    server.registerTool(
      "get_request",
      {
        title: "Inspect a captured request",
        description:
          "Get one captured request with query, headers, and a bounded body. Large bodies are truncated for model safety.",
        inputSchema: z.object({
          binId: z.string().min(1).describe("Freebin bin ID"),
          requestId: z.string().min(1).describe("Captured request ID"),
          bodyMaxBytes: z.number().int().min(0).max(100_000).default(20_000),
        }),
      },
      async ({ binId, requestId, bodyMaxBytes }) => {
        if (!(await ownedBin(db, user.id, binId)))
          return toolResult(
            { error: "Bin not found or not owned by this account" },
            true,
          );
        const row = await db
          .prepare(
            `SELECT id AS requestId, method, path, query, headers, body,
      content_type AS contentType, created_at AS timestamp, size_bytes AS sizeBytes,
      forward_status AS forwardStatus, forward_status_code AS forwardStatusCode,
      forward_error AS forwardError, matched_rule_id AS matchedRuleId,
      matched_rule_revision AS matchedRuleRevision FROM requests WHERE id = ? AND bin_id = ?`,
          )
          .bind(requestId, binId)
          .first<Record<string, unknown>>();
        if (!row)
          return toolResult({ error: "Captured request not found" }, true);
        const body = row.body === null ? null : String(row.body);
        const bytes =
          body === null ? 0 : new TextEncoder().encode(body).byteLength;
        const boundedBody =
          body === null || bytes <= bodyMaxBytes
            ? body
            : new TextDecoder().decode(
                new TextEncoder().encode(body).slice(0, bodyMaxBytes),
              );
        return toolResult({
          ...row,
          query: JSON.parse(String(row.query || "{}")),
          headers: JSON.parse(String(row.headers || "{}")),
          body: boundedBody,
          bodyTruncated: bytes > bodyMaxBytes,
          bodyBytes: bytes,
        });
      },
    );

  if (scopes.has("replay:write"))
    server.registerTool(
      "replay_request",
      {
        title: "Replay a captured request",
        description:
          "Replay a captured request to an allowlisted public HTTPS destination. Optional fields edit the immutable capture for this attempt. The attempt is retained and audited.",
        inputSchema: z.object({
          binId: z.string().min(1),
          requestId: z.string().min(1),
          url: z.string().url().startsWith("https://"),
          method: z.string().max(32).optional(),
          path: z.string().max(2000).optional(),
          query: z
            .record(z.string(), z.union([z.string(), z.array(z.string())]))
            .optional(),
          headers: z.record(z.string(), z.string()).optional(),
          body: z.string().max(1_048_576).nullable().optional(),
        }),
      },
      async ({ binId, requestId, ...input }) => {
        if (!(await ownedBin(db, user.id, binId)))
          return toolResult(
            { error: "Bin not found or not owned by this account" },
            true,
          );
        if (token) {
          const response = await fetchWithClientSpan(
            `${origin}/api/v1/bins/${encodeURIComponent(binId)}/interactions/${encodeURIComponent(requestId)}/replay`,
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${token}`,
                "content-type": "application/json",
              },
              body: JSON.stringify(input),
            },
            { env, parent, defer, name: "freebin.mcp.replay" },
          );
          const result = await response
            .json()
            .catch(() => ({
              error: `Replay returned HTTP ${response.status}`,
            }));
          return toolResult(result, !response.ok);
        }
        const result = await executeReplay({
          db,
          request,
          binId,
          requestId,
          input,
          rateLimitSalt: env.RATE_LIMIT_SALT,
          allowedOrigins: env.REPLAY_ALLOWED_ORIGINS,
          env,
          parent,
          defer,
          actor: { id: user.id, email: user.email, type: "oauth" },
        });
        return toolResult(result.body, result.status >= 400);
      },
    );

  return server;
}

const handle: RequestHandler = async ({ request, platform, url, locals }) => {
  if (!platform?.env.DB)
    return new Response("Database unavailable", { status: 503 });
  const delegatedUserId = request.headers.get("x-freebin-mcp-user-id") || "";
  const delegatedEmail = request.headers.get("x-freebin-mcp-email") || "";
  const delegatedScopes = new Set(
    (request.headers.get("x-freebin-mcp-scopes") || "")
      .split(/\s+/)
      .filter(Boolean),
  );
  const delegatedToken = request.headers.get("x-freebin-mcp-api-token") || "";
  const token = delegatedToken || bearer(request);
  const user =
    delegatedUserId && delegatedEmail
      ? { id: delegatedUserId, email: delegatedEmail }
      : await getApiUser(platform.env.DB, token);
  if (!user)
    return new Response(
      JSON.stringify({ error: "A valid Freebin account API key is required" }),
      {
        status: 401,
        headers: {
          "content-type": "application/json",
          "www-authenticate": 'Bearer realm="freebin-mcp"',
        },
      },
    );
  const scopes = delegatedScopes.size
    ? delegatedScopes
    : new Set(["bins:read", "requests:read", "replay:write"]);
  const defer = (promise: Promise<unknown>) =>
    platform.context.waitUntil(promise);
  const handler = createMcpHandler(
    () =>
      createServer(
        platform.env.DB,
        user,
        token,
        url.origin,
        scopes,
        platform.env,
        request,
        locals.traceContext,
        defer,
      ),
    {
      route: "/mcp",
      allowedHostnames: [url.hostname],
      allowedOriginHostnames: [url.hostname],
      corsOptions: false,
    },
  );
  return handler(request, platform.env, platform.context);
};

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = handle;
