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
  const bin = await platform.env.DB.prepare(
    `
    SELECT id, name, created_at AS createdAt, forwarding_enabled AS forwardingEnabled,
      forwarding_url AS forwardingUrl, forwarding_auth_headers AS forwardingAuthHeaders,
      forwarding_conditions AS forwardingConditions FROM bins WHERE id = ?
  `,
  )
    .bind(params.id)
    .first();
  const requests: Record<string, unknown>[] = [];
  let beforeTimestamp = "9999-12-31T23:59:59.999Z";
  let beforeId = "\uffff";
  while (true) {
    const page = await platform.env.DB.prepare(
      `
      SELECT id, method, path, query, headers, body, content_type AS contentType,
        remote_address AS remoteAddress, created_at AS timestamp, size_bytes AS sizeBytes,
        forward_status AS forwardStatus, forward_status_code AS forwardStatusCode,
        forward_error AS forwardError, forwarded_at AS forwardedAt,
        forward_duration_ms AS forwardDurationMs, matched_rule_id AS matchedRuleId,
        matched_rule_revision AS matchedRuleRevision,
        (SELECT name FROM response_rules WHERE id = requests.matched_rule_id) AS matchedRuleName
      FROM requests
      WHERE bin_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
      ORDER BY created_at DESC, id DESC LIMIT 25
    `,
    )
      .bind(params.id, beforeTimestamp, beforeTimestamp, beforeId)
      .all<Record<string, unknown>>();
    for (const row of page.results) {
      requests.push({
        ...row,
        headers: JSON.parse(String(row.headers || "{}")),
        query: JSON.parse(String(row.query || "{}")),
      });
    }
    if (page.results.length < 25) break;
    const last = page.results.at(-1)!;
    beforeTimestamp = String(last.timestamp);
    beforeId = String(last.id);
  }
  const ruleRows = await platform.env.DB.prepare(
    `SELECT id, name, enabled, priority, revision, conditions,
    response_status AS responseStatus, response_body AS responseBody, response_content_type AS responseContentType,
    response_headers AS responseHeaders, response_delay_ms AS responseDelayMs FROM response_rules WHERE bin_id = ? ORDER BY priority`,
  )
    .bind(params.id)
    .all<Record<string, unknown>>();
  const rules = ruleRows.results.map((rule) => ({
    ...rule,
    enabled: Boolean(Number(rule.enabled)),
    conditions: JSON.parse(String(rule.conditions || "[]")),
    responseHeaders: JSON.parse(String(rule.responseHeaders || "{}")),
  }));
  const attemptRows = await platform.env.DB.prepare(
    `SELECT id, request_id AS requestId, operation, target_url AS targetUrl, method, path,
    query, headers, body, response_status AS responseStatus, response_status_text AS responseStatusText, error,
    duration_ms AS durationMs, size_bytes AS sizeBytes, created_at AS createdAt FROM replay_attempts WHERE bin_id = ? ORDER BY created_at DESC`,
  )
    .bind(params.id)
    .all<Record<string, unknown>>();
  const replayAttempts = attemptRows.results.map((attempt) => ({
    ...attempt,
    query: JSON.parse(String(attempt.query || "{}")),
    headers: JSON.parse(String(attempt.headers || "{}")),
  }));
  const forwardAttemptRows = await platform.env.DB.prepare(
    `SELECT id, request_id AS requestId,
    attempt_number AS attemptNumber, target_url AS targetUrl, status,
    response_status AS responseStatus, error, duration_ms AS durationMs,
    started_at AS startedAt, completed_at AS completedAt
    FROM forward_attempts WHERE bin_id = ? ORDER BY started_at DESC`,
  )
    .bind(params.id)
    .all<Record<string, unknown>>();
  return json(
    {
      exportedAt: new Date().toISOString(),
      bin: {
        ...bin,
        forwardingEnabled: Boolean(
          Number((bin as Record<string, unknown>)?.forwardingEnabled),
        ),
        forwardingAuthHeaders: JSON.parse(
          String(
            (bin as Record<string, unknown>)?.forwardingAuthHeaders || "[]",
          ),
        ),
        forwardingConditions: JSON.parse(
          String(
            (bin as Record<string, unknown>)?.forwardingConditions || "[]",
          ),
        ),
      },
      rules,
      requests,
      replayAttempts,
      forwardAttempts: forwardAttemptRows.results,
    },
    {
      headers: {
        "content-disposition": `attachment; filename="freebin-${params.id}.json"`,
      },
    },
  );
};
