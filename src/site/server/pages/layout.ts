import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { getUser, isAdminEmail } from "@/server/domain/auth";

export const load: LayoutServerLoad = async ({
  platform,
  request,
  setHeaders,
}) => {
  const commit = process.env.FREEBIN_GIT_COMMIT || "";
  const appVersion = commit.slice(0, 7) || null;
  const appVersionUrl = commit
    ? `https://github.com/corridora/freebin/commit/${commit}`
    : null;
  if (!platform?.env.DB)
    return { headerUser: null, headerBins: [], appVersion, appVersionUrl };

  const user = await getUser(platform.env.DB, request);
  if (!user)
    return { headerUser: null, headerBins: [], appVersion, appVersionUrl };
  setHeaders({ "cache-control": "private, no-store" });

  const bins = await platform.env.DB.prepare(
    `
    SELECT id, name FROM bins
    WHERE user_id = ?
    ORDER BY created_at DESC
  `,
  )
    .bind(user.id)
    .all<{ id: string; name: string }>();

  return {
    headerUser: {
      id: user.id,
      isAdmin: isAdminEmail(user.email, platform.env.ADMIN_EMAILS),
    },
    headerBins: bins.results,
    appVersion,
    appVersionUrl,
  };
};
