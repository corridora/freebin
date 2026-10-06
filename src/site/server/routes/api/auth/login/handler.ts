import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { createSession, hashPassword } from "@/server/domain/auth";
import { json } from "@/server/domain/db";
import { enforceQuota } from "@/server/domain/security";

export const POST: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB)
    return json({ error: "Database unavailable" }, { status: 503 });
  const remoteAddress = request.headers.get("cf-connecting-ip") || "local";
  const quota = await enforceQuota(
    platform.env.DB,
    "login",
    remoteAddress,
    20,
    900,
    platform.env.RATE_LIMIT_SALT,
  );
  if (!quota.allowed)
    return json({ error: "Too many login attempts" }, { status: 429 });
  const input = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  const row = await platform.env.DB.prepare(
    `
    SELECT id, email, password_hash AS passwordHash, password_salt AS passwordSalt
    FROM users WHERE email = ?
  `,
  )
    .bind(email)
    .first<{
      id: string;
      email: string;
      passwordHash: string;
      passwordSalt: string;
    }>();
  const candidate = row
    ? await hashPassword(String(input.password || ""), row.passwordSalt)
    : null;
  if (!row || candidate?.hash !== row.passwordHash)
    return json({ error: "Invalid email or password" }, { status: 401 });
  const session = await createSession(platform.env.DB, row.id);
  return json(
    { user: { id: row.id, email: row.email } },
    { headers: { "set-cookie": session.cookie } },
  );
};
