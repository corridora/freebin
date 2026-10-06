import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";

export const load: PageServerLoad = async ({ platform }) => {
  const signupsEnabled = ["1", "true", "yes", "on"].includes(
    (platform?.env.SIGNUPS_ENABLED || "").toLowerCase(),
  );
  const demoApiKey = platform?.env.DEMO_API_KEY || "freebin_demo_public";
  if (!platform?.env.DB)
    return {
      demoBinId: platform?.env.DEMO_BIN_ID || null,
      demoApiKey,
      signupsEnabled,
    };
  if (platform.env.DEMO_BIN_ID)
    return { demoBinId: platform.env.DEMO_BIN_ID, demoApiKey, signupsEnabled };
  const demo = await platform.env.DB.prepare(
    `
    SELECT id FROM bins WHERE is_public_demo = 1 ORDER BY created_at DESC LIMIT 1
  `,
  ).first<{ id: string }>();
  return { demoBinId: demo?.id || null, demoApiKey, signupsEnabled };
};
