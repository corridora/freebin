import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { json } from "@/server/domain/db";
import {
  deploymentEnvironment,
  serviceVersion,
} from "@/server/domain/telemetry";

export const GET: RequestHandler = async ({ platform }) =>
  json({
    rumScriptUrl: platform?.env.RUM_SCRIPT_URL || null,
    rumAppName: platform?.env.RUM_APP_NAME || "freebin-web",
    deploymentEnvironment: deploymentEnvironment(platform?.env),
    appVersion: serviceVersion(platform?.env) || null,
    signupsEnabled: ["1", "true", "yes", "on"].includes(
      (platform?.env.SIGNUPS_ENABLED || "").toLowerCase(),
    ),
  });
