import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { clearSession, getUser } from "@/server/domain/auth";
import { json } from "@/server/domain/db";

export const GET: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB) return json({ user: null, bins: [] });
  const user = await getUser(platform.env.DB, request);
  if (!user) return json({ user: null, bins: [] });
  const account = await platform.env.DB.prepare(
    `
    SELECT u.id, u.email, u.storage_limit_bytes AS storageLimitBytes,
      COALESCE((SELECT SUM(r.size_bytes) FROM requests r JOIN bins b ON b.id = r.bin_id WHERE b.user_id = u.id), 0) +
      COALESCE((SELECT SUM(ra.size_bytes) FROM replay_attempts ra JOIN bins b ON b.id = ra.bin_id WHERE b.user_id = u.id), 0) AS storageUsedBytes
    FROM users u WHERE u.id = ?
  `,
  )
    .bind(user.id)
    .first();
  const bins = await platform.env.DB.prepare(
    `
    SELECT b.id AS binId, b.name, b.created_at AS createdAt,
      b.public_share_token AS publicShareToken, owner.email AS ownerEmail,
      CASE WHEN b.user_id = ? THEN 1 ELSE 0 END AS isOwner,
      bc.permissions, COUNT(r.id) AS interactionCount
    FROM bins b JOIN users owner ON owner.id = b.user_id
    LEFT JOIN bin_collaborators bc ON bc.bin_id = b.id AND bc.user_id = ?
    LEFT JOIN requests r ON r.bin_id = b.id
    WHERE b.user_id = ? OR bc.user_id = ?
    GROUP BY b.id ORDER BY isOwner DESC, lower(owner.email), lower(b.name), b.id
  `,
  )
    .bind(user.id, user.id, user.id, user.id)
    .all();
  return json({ user: account, bins: bins.results });
};

export const DELETE: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB)
    return json({ error: "Database unavailable" }, { status: 503 });
  const user = await getUser(platform.env.DB, request);
  if (!user) return json({ error: "Sign in required" }, { status: 401 });
  const cookie = await clearSession(platform.env.DB, request);
  await platform.env.DB.prepare("DELETE FROM users WHERE id = ?")
    .bind(user.id)
    .run();
  return json({ ok: true }, { headers: { "set-cookie": cookie } });
};
