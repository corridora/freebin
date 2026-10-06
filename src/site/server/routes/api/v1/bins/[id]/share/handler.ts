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
  await platform.env.DB.prepare(
    "UPDATE bins SET public_share_token = ? WHERE id = ?",
  )
    .bind(token, params.id)
    .run();
  await recordAudit(platform.env.DB, request, {
    binId: params.id,
    action: token ? "bin_share.enable" : "bin_share.revoke",
    targetType: "bin",
    targetId: params.id,
  });
  return json({
    public: Boolean(token),
    shareUrl: token ? `${url.origin}/shared/bin/${token}` : null,
  });
};
