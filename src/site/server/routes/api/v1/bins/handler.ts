import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { getApiUser, getUser } from "@/server/domain/auth";
import { bearer, createId, json, sha256 } from "@/server/domain/db";
import { enforceQuota } from "@/server/domain/security";
import { recordAudit } from "@/server/domain/audit";

export const POST: RequestHandler = async ({ request, platform, url }) => {
  if (!platform?.env.DB)
    return json(
      { error: "D1 database binding is unavailable" },
      { status: 503 },
    );
  const input = (await request.json().catch(() => ({}))) as {
    name?: string;
    termsAccepted?: boolean;
  };
  const remoteAddress = request.headers.get("cf-connecting-ip") || "local";
  const suppliedToken = bearer(request);
  const user =
    (await getUser(platform.env.DB, request)) ||
    (await getApiUser(platform.env.DB, suppliedToken));
  if (suppliedToken && !user)
    return json({ error: "Invalid account API key" }, { status: 401 });
  const quota = await enforceQuota(
    platform.env.DB,
    "bin-create",
    remoteAddress,
    20,
    3600,
    platform.env.RATE_LIMIT_SALT,
  );
  if (!quota.allowed)
    return json({ error: "Bin creation rate limit exceeded" }, { status: 429 });
  if (!input.termsAccepted)
    return json(
      { error: "You must accept the Terms and Conditions" },
      { status: 400 },
    );
  const name = (input.name || "Untitled bin").trim().slice(0, 60);
  const id = createId(10);
  const ownerToken = createId(32);
  const now = new Date();
  if (user) {
    const result = await platform.env.DB.prepare(
      `
      INSERT INTO bins (id, name, owner_token_hash, created_at, expires_at, user_id, is_public_demo)
      SELECT ?, ?, ?, ?, ?, ?, 0
      WHERE (SELECT COUNT(*) FROM bins WHERE user_id = ?) < 5
    `,
    )
      .bind(
        id,
        name,
        await sha256(ownerToken),
        now.toISOString(),
        "9999-12-31T23:59:59.999Z",
        user.id,
        user.id,
      )
      .run();
    if (!result.meta.changes)
      return json(
        { error: "Each account can have at most 5 bins" },
        { status: 409 },
      );
  } else {
    await platform.env.DB.prepare(
      "INSERT INTO bins (id, name, owner_token_hash, created_at, expires_at, user_id, is_public_demo) VALUES (?, ?, ?, ?, ?, NULL, 1)",
    )
      .bind(
        id,
        name,
        await sha256(ownerToken),
        now.toISOString(),
        "9999-12-31T23:59:59.999Z",
      )
      .run();
  }
  await recordAudit(platform.env.DB, request, {
    binId: id,
    action: "bin.create",
    targetType: "bin",
    targetId: id,
    metadata: { name },
  });
  const origin = url.origin;
  return json(
    {
      bin: {
        binId: id,
        name,
        url: `${origin}/b/${id}`,
        interactionCount: 0,
        createdAt: now.toISOString(),
      },
      token: user ? undefined : ownerToken,
      inspectUrl: user
        ? `${origin}/bin/${id}`
        : `${origin}/bin/${id}?token=${ownerToken}`,
    },
    { status: 201 },
  );
};

export const GET: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB)
    return json(
      { error: "D1 database binding is unavailable" },
      { status: 503 },
    );
  const token = bearer(request);
  if (!token) return json({ error: "Bearer token required" }, { status: 401 });
  const apiUser = await getApiUser(platform.env.DB, token);
  if (apiUser) {
    const result = await platform.env.DB.prepare(
      `
      SELECT b.id AS binId, b.name, b.created_at AS createdAt, COUNT(r.id) AS interactionCount
      FROM bins b LEFT JOIN requests r ON r.bin_id = b.id
      WHERE b.user_id = ?
      GROUP BY b.id ORDER BY b.created_at DESC
    `,
    )
      .bind(apiUser.id)
      .all();
    return json({ bins: result.results });
  }
  const result = await platform.env.DB.prepare(
    `
    SELECT b.id AS binId, b.name, b.created_at AS createdAt, COUNT(r.id) AS interactionCount
    FROM bins b LEFT JOIN requests r ON r.bin_id = b.id
    WHERE b.owner_token_hash = ?
    GROUP BY b.id ORDER BY b.created_at DESC
  `,
  )
    .bind(await sha256(token))
    .all();
  return json({ bins: result.results });
};
