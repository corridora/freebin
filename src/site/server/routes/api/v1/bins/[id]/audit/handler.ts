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
    return json({ error: "Database unavailable" }, { status: 503 });
  if (
    !(await canManageBin(
      platform.env.DB,
      request,
      params.id,
      bearer(request),
      "audit.view",
    ))
  )
    return json({ error: "Forbidden" }, { status: 403 });
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 100, 1),
    500,
  );
  const rows = await platform.env.DB.prepare(
    `SELECT id, actor_email AS actorEmail, actor_type AS actorType,
    action, target_type AS targetType, target_id AS targetId, metadata, created_at AS createdAt
    FROM audit_events WHERE bin_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
  )
    .bind(params.id, limit)
    .all<Record<string, unknown>>();
  return json({
    events: rows.results.map((row) => ({
      ...row,
      metadata: JSON.parse(String(row.metadata || "{}")),
    })),
    limit,
  });
};
