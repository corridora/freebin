import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import {
  redactBody,
  redactHeaders,
  sanitizePublicText,
} from "@/server/domain/security";

function parseRecord(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function sanitizeRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record)
      .slice(0, 100)
      .map(([key, value]) => [
        sanitizePublicText(key, 200),
        Array.isArray(value)
          ? value.slice(0, 100).map((item) => sanitizePublicText(item, 2_000))
          : sanitizePublicText(value, 2_000),
      ]),
  );
}

export const load: PageServerLoad = async ({ platform }) => {
  const demoBinId = platform?.env.DEMO_BIN_ID || "demo-public";
  const demoApiKey = platform?.env.DEMO_API_KEY || "freebin_demo_public";
  if (!platform?.env.DB) return { interactions: [], demoBinId, demoApiKey };
  const result = await platform.env.DB.prepare(
    `
    SELECT r.id, r.method, r.path, r.query, r.headers, r.body,
      r.content_type AS contentType, r.created_at AS timestamp, b.id AS binId, b.name AS binName
    FROM requests r JOIN bins b ON b.id = r.bin_id
    WHERE b.id = ? AND b.is_public_demo = 1
    ORDER BY r.created_at DESC LIMIT 50
  `,
  )
    .bind(demoBinId)
    .all<Record<string, unknown>>();
  return {
    demoBinId,
    demoApiKey,
    interactions: result.results.map((row) => ({
      id: sanitizePublicText(row.id, 100),
      method: sanitizePublicText(row.method, 20),
      path: sanitizePublicText(row.path, 2_000),
      body: row.body
        ? sanitizePublicText(
            redactBody(String(row.body), String(row.contentType || ""), true),
            20 * 1024,
          )
        : null,
      contentType: row.contentType
        ? sanitizePublicText(row.contentType, 200)
        : null,
      timestamp: sanitizePublicText(row.timestamp, 100),
      binId: sanitizePublicText(row.binId, 100),
      binName: sanitizePublicText(row.binName, 200),
      headers: sanitizeRecord(
        redactHeaders(parseRecord(row.headers) as Record<string, string>),
      ),
      query: sanitizeRecord(parseRecord(row.query)),
    })),
  };
};
