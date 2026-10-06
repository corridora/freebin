import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { getUser } from "@/server/domain/auth";

export const load: PageServerLoad = async ({ platform, request, url }) => {
  const signupsEnabled = ["1", "true", "yes", "on"].includes(
    (platform?.env.SIGNUPS_ENABLED || "").toLowerCase(),
  );
  if (!platform?.env.DB)
    return {
      signupsEnabled,
      siteOrigin: url.origin,
      user: null,
      bins: [],
      apiKeys: [],
    };

  const sessionUser = await getUser(platform.env.DB, request);
  if (!sessionUser)
    return {
      signupsEnabled,
      siteOrigin: url.origin,
      user: null,
      bins: [],
      apiKeys: [],
    };

  const [user, bins, apiKeys] = await Promise.all([
    platform.env.DB.prepare(
      `
      SELECT u.id, u.email, u.storage_limit_bytes AS storageLimitBytes,
        COALESCE((SELECT SUM(r.size_bytes) FROM requests r JOIN bins b ON b.id = r.bin_id WHERE b.user_id = u.id), 0) +
        COALESCE((SELECT SUM(ra.size_bytes) FROM replay_attempts ra JOIN bins b ON b.id = ra.bin_id WHERE b.user_id = u.id), 0) AS storageUsedBytes
      FROM users u WHERE u.id = ?
    `,
    )
      .bind(sessionUser.id)
      .first(),
    platform.env.DB.prepare(
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
      .bind(sessionUser.id, sessionUser.id, sessionUser.id, sessionUser.id)
      .all(),
    platform.env.DB.prepare(
      `
      SELECT id, name, token_prefix AS prefix, created_at AS createdAt, last_used_at AS lastUsedAt
      FROM api_keys WHERE user_id = ? ORDER BY created_at DESC
    `,
    )
      .bind(sessionUser.id)
      .all(),
  ]);

  return {
    signupsEnabled,
    siteOrigin: url.origin,
    user,
    bins: bins.results,
    apiKeys: apiKeys.results,
  };
};
