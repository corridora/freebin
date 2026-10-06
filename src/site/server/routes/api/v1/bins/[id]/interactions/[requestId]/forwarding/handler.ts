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
    return json(
      { error: "D1 database binding is unavailable" },
      { status: 503 },
    );
  if (
    !(await canManageBin(
      platform.env.DB,
      request,
      params.id,
      bearer(request),
      "forwarding.view",
    ))
  ) {
    return json(
      { error: "Invalid or expired inspector token" },
      { status: 403 },
    );
  }
  const captured = await platform.env.DB.prepare(
    "SELECT id FROM requests WHERE id = ? AND bin_id = ?",
  )
    .bind(params.requestId, params.id)
    .first();
  if (!captured)
    return json({ error: "Captured request not found" }, { status: 404 });
  const result = await platform.env.DB.prepare(
    `SELECT id, attempt_number AS attemptNumber,
    target_url AS targetUrl, status, response_status AS responseStatus, error,
    duration_ms AS durationMs, started_at AS startedAt, completed_at AS completedAt
    FROM forward_attempts WHERE request_id = ? AND bin_id = ?
    ORDER BY attempt_number DESC LIMIT 50`,
  )
    .bind(params.requestId, params.id)
    .all<Record<string, unknown>>();
  return json({ attempts: result.results });
};
