import { error } from "@/server/http";
import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { redactHeaders } from "@/server/domain/security";

export const load: PageServerLoad = async ({ params, platform }) => {
  if (!platform?.env.DB) error(503, "Database unavailable");
  const item = await platform.env.DB.prepare(
    `
    SELECT r.id, r.method, r.path, r.query, r.headers, r.body, r.content_type AS contentType,
      r.created_at AS timestamp, b.name AS binName
    FROM requests r JOIN bins b ON b.id = r.bin_id
    WHERE r.public_share_token = ?
  `,
  )
    .bind(params.token)
    .first<Record<string, unknown>>();
  if (!item) error(404, "This shared request is unavailable");
  return {
    item: {
      ...item,
      headers: redactHeaders(
        JSON.parse(String(item.headers || "{}")) as Record<string, string>,
      ),
      query: JSON.parse(String(item.query || "{}")),
    },
  };
};
