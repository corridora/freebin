import { error, redirect } from "@/server/http";
import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { getUser, isAdminEmail } from "@/server/domain/auth";
import engram from "../generated/engram-report.json" with { type: "json" };

export const load: PageServerLoad = async ({ platform, request }) => {
  if (!platform?.env.DB) error(503, "Database unavailable");

  const user = await getUser(platform.env.DB, request);
  if (!user) redirect(303, "/account");
  if (!isAdminEmail(user.email, platform.env.ADMIN_EMAILS))
    redirect(303, "/account");

  const environment = platform.env.DEPLOYMENT_ENVIRONMENT || "local";
  const metadata =
    environment === "local" ? undefined : platform.env.CF_VERSION_METADATA;
  const deployment = {
    environment,
    versionId: metadata?.id || null,
    tag: metadata?.tag || null,
    uploadedAt: metadata?.timestamp || null,
    dashboardUrl: metadata?.id
      ? platform.env.CLOUDFLARE_DEPLOYMENTS_URL || null
      : null,
  };

  const [totals, users] = await Promise.all([
    platform.env.DB.prepare(
      `
      SELECT
        (SELECT COUNT(*) FROM users) AS userCount,
        (SELECT COUNT(*) FROM bins) AS binCount,
        (SELECT COUNT(*) FROM requests) AS requestCount,
        (SELECT COALESCE(SUM(size_bytes), 0) FROM requests) AS retainedBytes
    `,
    ).first(),
    platform.env.DB.prepare(
      `
      SELECT u.id, u.email, u.created_at AS createdAt,
        u.storage_limit_bytes AS storageLimitBytes,
        COUNT(DISTINCT b.id) AS binCount,
        COUNT(r.id) AS requestCount,
        COALESCE(SUM(r.size_bytes), 0) AS retainedBytes
      FROM users u
      LEFT JOIN bins b ON b.user_id = u.id
      LEFT JOIN requests r ON r.bin_id = b.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT 250
    `,
    ).all(),
  ]);

  return {
    admin: { id: user.id, email: user.email },
    totals,
    users: users.results,
    engram,
    deployment,
  };
};
