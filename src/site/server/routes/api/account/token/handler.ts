import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { getUser } from "@/server/domain/auth";
import { createId, json, sha256 } from "@/server/domain/db";

export const POST: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB)
    return json({ error: "Database unavailable" }, { status: 503 });
  const user = await getUser(platform.env.DB, request);
  if (!user) return json({ error: "Sign in required" }, { status: 401 });
  const input = (await request.json().catch(() => ({}))) as { name?: string };
  const token = `fb_${crypto.randomUUID()}`;
  const id = createId(16);
  const name =
    String(input.name || "API key")
      .trim()
      .slice(0, 60) || "API key";
  const createdAt = new Date().toISOString();
  const result = await platform.env.DB.prepare(
    `
    INSERT INTO api_keys (id, user_id, name, token_hash, token_prefix, created_at)
    SELECT ?, ?, ?, ?, ?, ?
    WHERE (SELECT COUNT(*) FROM api_keys WHERE user_id = ?) < 5
  `,
  )
    .bind(
      id,
      user.id,
      name,
      await sha256(token),
      token.slice(0, 8),
      createdAt,
      user.id,
    )
    .run();
  if (!result.meta.changes)
    return json(
      { error: "Each account can have at most 5 API keys" },
      { status: 409 },
    );
  return json(
    { key: { id, name, prefix: token.slice(0, 8), createdAt }, token },
    { status: 201 },
  );
};

export const GET: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB)
    return json({ error: "Database unavailable" }, { status: 503 });
  const user = await getUser(platform.env.DB, request);
  if (!user) return json({ error: "Sign in required" }, { status: 401 });
  const keys = await platform.env.DB.prepare(
    `
    SELECT id, name, token_prefix AS prefix, created_at AS createdAt, last_used_at AS lastUsedAt
    FROM api_keys WHERE user_id = ? ORDER BY created_at DESC
  `,
  )
    .bind(user.id)
    .all();
  return json({ keys: keys.results });
};

export const DELETE: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB)
    return json({ error: "Database unavailable" }, { status: 503 });
  const user = await getUser(platform.env.DB, request);
  if (!user) return json({ error: "Sign in required" }, { status: 401 });
  const input = (await request.json().catch(() => ({}))) as { id?: string };
  if (!input.id) return json({ error: "API key id required" }, { status: 400 });
  const result = await platform.env.DB.prepare(
    "DELETE FROM api_keys WHERE id = ? AND user_id = ?",
  )
    .bind(input.id, user.id)
    .run();
  if (!result.meta.changes)
    return json({ error: "API key not found" }, { status: 404 });
  return json({ ok: true });
};
