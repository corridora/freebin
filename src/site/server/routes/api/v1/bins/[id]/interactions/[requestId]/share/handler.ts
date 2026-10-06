import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { canManageBin } from "@/server/domain/auth";
import { bearer, createId, json } from "@/server/domain/db";
import { recordAudit } from "@/server/domain/audit";

export const POST: RequestHandler = async ({
  request,
  params,
  platform,
  url,
}) => {
  if (!platform?.env.DB)
    return json({ error: "Database unavailable" }, { status: 503 });
  const input = (await request.json().catch(() => ({}))) as {
    public?: boolean;
  };
  if (
    !(await canManageBin(
      platform.env.DB,
      request,
      params.id,
      bearer(request),
      input.public ? "sharing.edit" : "sharing.delete",
    ))
  )
    return json({ error: "Forbidden" }, { status: 403 });
  const token = input.public ? createId(32) : null;
  const result = await platform.env.DB.prepare(
    "UPDATE requests SET public_share_token = ? WHERE id = ? AND bin_id = ?",
  )
    .bind(token, params.requestId, params.id)
    .run();
  if (!result.meta.changes)
    return json({ error: "Request not found" }, { status: 404 });
  await recordAudit(platform.env.DB, request, {
    binId: params.id,
    action: token ? "request_share.enable" : "request_share.revoke",
    targetType: "request",
    targetId: params.requestId,
  });
  return json({
    public: Boolean(token),
    shareUrl: token ? `${url.origin}/shared/request/${token}` : null,
  });
};
