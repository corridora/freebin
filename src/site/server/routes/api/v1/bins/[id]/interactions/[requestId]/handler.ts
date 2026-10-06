import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { canManageBin } from "@/server/domain/auth";
import { bearer, json } from "@/server/domain/db";
import { recordAudit } from "@/server/domain/audit";

export const DELETE: RequestHandler = async ({ request, params, platform }) => {
  if (!platform?.env.DB)
    return json({ error: "Database unavailable" }, { status: 503 });
  if (
    !(await canManageBin(
      platform.env.DB,
      request,
      params.id,
      bearer(request),
      "requests.delete",
    ))
  ) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await platform.env.DB.prepare(
    "DELETE FROM requests WHERE id = ? AND bin_id = ?",
  )
    .bind(params.requestId, params.id)
    .run();
  if (!result.meta.changes)
    return json({ error: "Request not found" }, { status: 404 });
  await recordAudit(platform.env.DB, request, {
    binId: params.id,
    action: "request.delete",
    targetType: "request",
    targetId: params.requestId,
  });
  return json({ ok: true });
};
