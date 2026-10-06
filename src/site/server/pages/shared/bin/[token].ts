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
  const bin = await platform.env.DB.prepare(
    "SELECT id, name, created_at AS createdAt FROM bins WHERE public_share_token = ?",
  )
    .bind(params.token)
    .first<Record<string, unknown>>();
  if (!bin) error(404, "This shared bin is unavailable");
  const result = await platform.env.DB.prepare(
    `
    SELECT id, method, path, query, headers, body, content_type AS contentType, created_at AS timestamp
    FROM requests WHERE bin_id = ? ORDER BY created_at DESC LIMIT 100
  `,
  )
    .bind(bin.id)
    .all<Record<string, unknown>>();
  return {
    bin,
    interactions: result.results.map((row) => ({
      ...row,
      headers: redactHeaders(
        JSON.parse(String(row.headers || "{}")) as Record<string, string>,
      ),
      query: JSON.parse(String(row.query || "{}")),
    })),
  };
};
