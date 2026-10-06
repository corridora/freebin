import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { canManageBin } from "@/server/domain/auth";
import { bearer, json } from "@/server/domain/db";

export const GET: RequestHandler = async ({
  request,
  params,
  platform,
  url,
}) => {
  if (!platform?.env.DB)
    return json(
      { error: "D1 database binding is unavailable" },
      { status: 503 },
    );
  const token = bearer(request);
  if (
    !(await canManageBin(
      platform.env.DB,
      request,
      params.id,
      token,
      "requests.view",
    ))
  )
    return json(
      { error: "Invalid or expired inspector token" },
      { status: 403 },
    );
  const requestedLimit = url.searchParams.get("limit");
  const limit =
    requestedLimit === "all"
      ? -1
      : Math.min(Math.max(Number(requestedLimit) || 10, 1), 100);
  const offset = Math.max(
    Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0,
    0,
  );
  const count = await platform.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM requests WHERE bin_id = ?",
  )
    .bind(params.id)
    .first<{ total: number }>();
  const result = await platform.env.DB.prepare(
    `
    SELECT id, method, path, query, headers, body, content_type AS contentType,
      remote_address AS remoteAddress, created_at AS timestamp, size_bytes AS sizeBytes,
      public_share_token AS publicShareToken, forward_status AS forwardStatus,
      forward_status_code AS forwardStatusCode, forward_error AS forwardError,
      forwarded_at AS forwardedAt, forward_duration_ms AS forwardDurationMs,
      matched_rule_id AS matchedRuleId, matched_rule_revision AS matchedRuleRevision,
      (SELECT name FROM response_rules WHERE id = requests.matched_rule_id) AS matchedRuleName
    FROM requests WHERE bin_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
  `,
  )
    .bind(params.id, limit, offset)
    .all();
  return json({
    meta: {
      total: Number(count?.total) || 0,
      limit: limit === -1 ? "all" : limit,
      offset,
    },
    interactions: result.results.map((row: Record<string, unknown>) => ({
      ...row,
      headers: JSON.parse(String(row.headers || "{}")),
      query: JSON.parse(String(row.query || "{}")),
    })),
  });
};
