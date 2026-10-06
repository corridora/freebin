import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { canManageBin } from "@/server/domain/auth";
import { bearer, json } from "@/server/domain/db";

export const GET: RequestHandler = async ({ request, params, platform }) => {
  if (!platform?.env.DB)
    return json({ error: "Database unavailable" }, { status: 503 });
  const token = bearer(request);
  if (
    !(await canManageBin(
      platform.env.DB,
      request,
      params.id,
      token,
      "exports.view",
    ))
  ) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  const row = await platform.env.DB.prepare(
    `
    SELECT id, method, path, query, headers, body, content_type AS contentType,
      remote_address AS remoteAddress, created_at AS timestamp, size_bytes AS sizeBytes,
      forward_status AS forwardStatus, forward_status_code AS forwardStatusCode,
      forward_error AS forwardError, forwarded_at AS forwardedAt,
      forward_duration_ms AS forwardDurationMs, matched_rule_id AS matchedRuleId,
      matched_rule_revision AS matchedRuleRevision,
      (SELECT name FROM response_rules WHERE id = requests.matched_rule_id) AS matchedRuleName
    FROM requests WHERE id = ? AND bin_id = ?
  `,
  )
    .bind(params.requestId, params.id)
    .first<Record<string, unknown>>();
  if (!row) return json({ error: "Request not found" }, { status: 404 });
  const capturedRequest = {
    ...row,
    headers: JSON.parse(String(row.headers || "{}")),
    query: JSON.parse(String(row.query || "{}")),
  };
  const attemptRows = await platform.env.DB.prepare(
    `SELECT id, operation, target_url AS targetUrl, method, path, query, headers, body,
    response_status AS responseStatus, response_status_text AS responseStatusText, error, duration_ms AS durationMs,
    size_bytes AS sizeBytes, created_at AS createdAt FROM replay_attempts WHERE request_id = ? AND bin_id = ? ORDER BY created_at DESC`,
  )
    .bind(params.requestId, params.id)
    .all<Record<string, unknown>>();
  const replayAttempts = attemptRows.results.map((attempt) => ({
    ...attempt,
    query: JSON.parse(String(attempt.query || "{}")),
    headers: JSON.parse(String(attempt.headers || "{}")),
  }));
  const forwardAttemptRows = await platform.env.DB.prepare(
    `SELECT id, attempt_number AS attemptNumber,
    target_url AS targetUrl, status, response_status AS responseStatus, error,
    duration_ms AS durationMs, started_at AS startedAt, completed_at AS completedAt
    FROM forward_attempts WHERE request_id = ? AND bin_id = ? ORDER BY attempt_number DESC`,
  )
    .bind(params.requestId, params.id)
    .all<Record<string, unknown>>();
  return json(
    {
      exportedAt: new Date().toISOString(),
      binId: params.id,
      request: capturedRequest,
      replayAttempts,
      forwardAttempts: forwardAttemptRows.results,
    },
    {
      headers: {
        "content-disposition": `attachment; filename="freebin-${params.id}-${params.requestId}.json"`,
      },
    },
  );
};
