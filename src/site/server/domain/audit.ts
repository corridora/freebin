import { bearer, createId } from "./db";
import { getApiUser, getUser } from "./auth";

export async function recordAudit(
  db: D1Database,
  request: Request,
  input: {
    binId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
    actor?: {
      id: string;
      email: string;
      type: "session" | "api_key" | "oauth";
    };
  },
) {
  let actor: { id: string; email: string } | null =
    input.actor || (await getUser(db, request));
  let actorType: string =
    input.actor?.type || (actor ? "session" : "inspector");
  if (!actor) {
    actor = await getApiUser(db, bearer(request));
    if (actor) actorType = "api_key";
  }
  const owner = await db
    .prepare("SELECT user_id AS userId FROM bins WHERE id = ?")
    .bind(input.binId)
    .first<{ userId: string | null }>();
  const metadata = JSON.stringify(input.metadata || {});
  await db
    .prepare(
      `INSERT INTO audit_events
    (id, bin_id, owner_user_id, actor_user_id, actor_email, actor_type, action, target_type, target_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      createId(16),
      input.binId,
      owner?.userId || null,
      actor?.id || null,
      actor?.email || null,
      actorType,
      input.action,
      input.targetType,
      input.targetId || null,
      metadata.slice(0, 4000),
      new Date().toISOString(),
    )
    .run();
  await db
    .prepare(
      `DELETE FROM audit_events WHERE bin_id = ? AND id NOT IN
    (SELECT id FROM audit_events WHERE bin_id = ? ORDER BY created_at DESC, id DESC LIMIT 500)`,
    )
    .bind(input.binId, input.binId)
    .run();
}
