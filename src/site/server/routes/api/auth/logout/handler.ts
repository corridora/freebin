import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { clearSession } from "@/server/domain/auth";
import { json } from "@/server/domain/db";

export const POST: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB) return json({ ok: true });
  const cookie = await clearSession(platform.env.DB, request);
  return json({ ok: true }, { headers: { "set-cookie": cookie } });
};
