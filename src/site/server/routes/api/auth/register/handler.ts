import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { createSession, hashPassword, validEmail } from "@/server/domain/auth";
import { createId, json } from "@/server/domain/db";
import { enforceQuota } from "@/server/domain/security";
import { DEFAULT_STORAGE_LIMIT_BYTES } from "@/server/domain/retention";

export const POST: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB)
    return json({ error: "Database unavailable" }, { status: 503 });
  if (
    !["1", "true", "yes", "on"].includes(
      (platform.env.SIGNUPS_ENABLED || "").toLowerCase(),
    )
  ) {
    return json(
      { error: "New account registration is temporarily unavailable" },
      { status: 403 },
    );
  }
  const input = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    termsAccepted?: boolean;
  };
  const remoteAddress = request.headers.get("cf-connecting-ip") || "local";
  const quota = await enforceQuota(
    platform.env.DB,
    "register",
    remoteAddress,
    10,
    900,
    platform.env.RATE_LIMIT_SALT,
  );
  if (!quota.allowed)
    return json({ error: "Too many registration attempts" }, { status: 429 });
  if (!input.termsAccepted)
    return json(
      { error: "You must accept the Terms and Conditions" },
      { status: 400 },
    );
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  const password = String(input.password || "");
  if (!validEmail(email))
    return json({ error: "Enter a valid email address" }, { status: 400 });
  if (password.length < 10 || password.length > 128)
    return json(
      { error: "Password must be 10–128 characters" },
      { status: 400 },
    );
  const exists = await platform.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?",
  )
    .bind(email)
    .first();
  if (exists)
    return json(
      { error: "An account already exists for this email" },
      { status: 409 },
    );
  const id = createId(20);
  const passwordData = await hashPassword(password);
  const now = new Date().toISOString();
  await platform.env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, password_salt, storage_limit_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      email,
      passwordData.hash,
      passwordData.salt,
      DEFAULT_STORAGE_LIMIT_BYTES,
      now,
    )
    .run();
  const session = await createSession(platform.env.DB, id);
  return json(
    { user: { id, email } },
    { status: 201, headers: { "set-cookie": session.cookie } },
  );
};
