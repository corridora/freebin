import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import {
  canManageBin,
  getUser,
  isBinOwner,
  type BinPermission,
} from "@/server/domain/auth";
import { bearer, createId, json } from "@/server/domain/db";
import { recordAudit } from "@/server/domain/audit";

const allowed = new Set([
  "bin.view",
  "bin.edit",
  "requests.view",
  "requests.delete",
  "exports.view",
  "exports.edit",
  "replay.view",
  "replay.edit",
  "replay.delete",
  "forwarding.view",
  "forwarding.edit",
  "forwarding.delete",
  "rules.view",
  "rules.edit",
  "rules.delete",
  "config.view",
  "config.edit",
  "sharing.view",
  "sharing.edit",
  "sharing.delete",
  "collaborators.view",
  "audit.view",
]);

async function authorize(db: D1Database, request: Request, binId: string) {
  return await isBinOwner(db, request, binId);
}

export const GET: RequestHandler = async ({ request, params, platform }) => {
  if (!platform?.env.DB)
    return json({ error: "Database unavailable" }, { status: 503 });
  if (
    !(await canManageBin(
      platform.env.DB,
      request,
      params.id,
      bearer(request),
      "collaborators.view",
    ))
  )
    return json(
      { error: "Collaborator view access required" },
      { status: 403 },
    );
  const rows = await platform.env.DB.prepare(
    `SELECT bc.id, u.email, bc.permissions,
    bc.created_at AS createdAt, bc.updated_at AS updatedAt
    FROM bin_collaborators bc JOIN users u ON u.id = bc.user_id
    WHERE bc.bin_id = ? ORDER BY lower(u.email)`,
  )
    .bind(params.id)
    .all<Record<string, unknown>>();
  return json({
    collaborators: rows.results.map((row) => ({
      ...row,
      permissions: JSON.parse(String(row.permissions || "{}")),
    })),
  });
};

export const PUT: RequestHandler = async ({ request, params, platform }) => {
  if (!platform?.env.DB)
    return json({ error: "Database unavailable" }, { status: 503 });
  const owner = await getUser(platform.env.DB, request);
  if (!owner || !(await authorize(platform.env.DB, request, params.id)))
    return json({ error: "Bin owner access required" }, { status: 403 });
  const input = (await request.json().catch(() => ({}))) as {
    email?: string;
    permissions?: Record<string, unknown>;
  };
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  const invitee = await platform.env.DB.prepare(
    "SELECT id, email FROM users WHERE lower(email) = ?",
  )
    .bind(email)
    .first<{ id: string; email: string }>();
  if (!invitee)
    return json(
      { error: "No registered user has that email address" },
      { status: 404 },
    );
  if (invitee.id === owner.id)
    return json(
      { error: "The bin owner already has full access" },
      { status: 400 },
    );
  const permissions = Object.fromEntries(
    Object.entries(input.permissions || {}).filter(
      ([key, value]) => allowed.has(key) && value === true,
    ),
  ) as Record<BinPermission, true>;
  if (!Object.keys(permissions).length)
    return json({ error: "Select at least one permission" }, { status: 400 });
  const now = new Date().toISOString();
  await platform.env.DB.prepare(
    `INSERT INTO bin_collaborators
    (id, bin_id, user_id, invited_by_user_id, permissions, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bin_id, user_id) DO UPDATE SET permissions = excluded.permissions,
      invited_by_user_id = excluded.invited_by_user_id, updated_at = excluded.updated_at`,
  )
    .bind(
      createId(16),
      params.id,
      invitee.id,
      owner.id,
      JSON.stringify(permissions),
      now,
      now,
    )
    .run();
  await recordAudit(platform.env.DB, request, {
    binId: params.id,
    action: "collaborator.upsert",
    targetType: "collaborator",
    targetId: invitee.id,
    metadata: {
      email: invitee.email,
      permissions: Object.keys(permissions).sort(),
    },
  });
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, params, platform }) => {
  if (!platform?.env.DB)
    return json({ error: "Database unavailable" }, { status: 503 });
  if (!(await authorize(platform.env.DB, request, params.id)))
    return json({ error: "Bin owner access required" }, { status: 403 });
  const input = (await request.json().catch(() => ({}))) as {
    collaboratorId?: string;
  };
  const removed = await platform.env.DB.prepare(
    `SELECT bc.user_id AS userId, u.email FROM bin_collaborators bc
    JOIN users u ON u.id = bc.user_id WHERE bc.id = ? AND bc.bin_id = ?`,
  )
    .bind(input.collaboratorId || "", params.id)
    .first<Record<string, unknown>>();
  await platform.env.DB.prepare(
    "DELETE FROM bin_collaborators WHERE id = ? AND bin_id = ?",
  )
    .bind(input.collaboratorId || "", params.id)
    .run();
  if (removed)
    await recordAudit(platform.env.DB, request, {
      binId: params.id,
      action: "collaborator.remove",
      targetType: "collaborator",
      targetId: String(removed.userId),
      metadata: { email: removed.email },
    });
  return json({ ok: true });
};
