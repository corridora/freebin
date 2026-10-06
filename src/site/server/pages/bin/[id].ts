import { error, redirect } from "@/server/http";
import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { ownsBin } from "@/server/domain/db";
import { inspectorCookieName } from "@/server/domain/auth";

export const load: PageServerLoad = async ({
  cookies,
  params,
  platform,
  url,
}) => {
  const token = url.searchParams.get("token");
  if (token) {
    if (!platform?.env.DB) error(503, "Database unavailable");
    if (!(await ownsBin(platform.env.DB, params.id, token)))
      error(403, "Invalid inspector token");
    cookies.set(inspectorCookieName(params.id), token, {
      path: `/api/v1/bins/${params.id}`,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    });
    redirect(303, `/bin/${params.id}`);
  }

  return { id: params.id };
};
