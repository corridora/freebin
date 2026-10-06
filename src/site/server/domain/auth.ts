import { createId, sha256 } from "./db";

const SESSION_COOKIE = "freebin_session";
const SESSION_DAYS = 30;
const PASSWORD_HASH_ITERATIONS = 100_000;

export function inspectorCookieName(binId: string) {
  return `freebin_inspector_${binId.replace(/[^a-z0-9]/gi, "_")}`;
}

export function isAdminEmail(email: string, configuredEmails = "") {
  const admins = new Set(
    configuredEmails
      .split(/[,\n]/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  return admins.has(email.trim().toLowerCase());
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex
    ? new Uint8Array(
        saltHex.match(/.{2}/g)!.map((value) => parseInt(value, 16)),
      )
    : crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    256,
  );
  return { hash: bytesToHex(new Uint8Array(derived)), salt: bytesToHex(salt) };
}

export function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return "";
      }
    }
  }
  return "";
}

export async function getUser(db: D1Database, request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const user = await db
    .prepare(
      `
    SELECT u.id, u.email
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `,
    )
    .bind(await sha256(token), new Date().toISOString())
    .first<{
      id: string;
      email: string;
    }>();
  return user || null;
}

export async function getApiUser(db: D1Database, token: string) {
  if (!token) return null;
  // This credential was previously seeded as a normal account key. Keep it
  // permanently excluded from account authentication even before old rows are
  // removed from an existing deployment.
  if (token === "freebin_demo_public") return null;
  const user = await db
    .prepare(
      `
    SELECT u.id, u.email, k.id AS apiKeyId
    FROM api_keys k JOIN users u ON u.id = k.user_id
    WHERE k.token_hash = ?
  `,
    )
    .bind(await sha256(token))
    .first<{
      id: string;
      email: string;
      apiKeyId: string;
    }>();
  if (user) {
    await db
      .prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), user.apiKeyId)
      .run();
  }
  return user || null;
}

export async function createSession(db: D1Database, userId: string) {
  const token = createId(48);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await db
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(await sha256(token), userId, expires.toISOString(), now.toISOString())
    .run();
  return {
    token,
    cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`,
  };
}

export async function clearSession(db: D1Database, request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token)
    await db
      .prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await sha256(token))
      .run();
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export type BinPermission =
  `${"bin" | "requests" | "exports" | "replay" | "forwarding" | "rules" | "config" | "sharing" | "collaborators" | "audit"}.${"view" | "edit" | "delete"}`;

export async function canManageBin(
  db: D1Database,
  request: Request,
  binId: string,
  token = "",
  permission?: BinPermission,
) {
  const user = await getUser(db, request);
  if (user) {
    const owned = await db
      .prepare("SELECT id FROM bins WHERE id = ? AND user_id = ?")
      .bind(binId, user.id)
      .first();
    if (owned) return true;
    if (permission) {
      const shared = await db
        .prepare(
          "SELECT permissions FROM bin_collaborators WHERE bin_id = ? AND user_id = ?",
        )
        .bind(binId, user.id)
        .first<{ permissions: string }>();
      if (shared) {
        try {
          if (JSON.parse(shared.permissions || "{}")[permission] === true)
            return true;
        } catch {
          /* deny malformed permissions */
        }
      }
    }
  }
  const resolved =
    token ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
    readCookie(request, inspectorCookieName(binId));
  if (!resolved) return false;
  const apiUser = await getApiUser(db, resolved);
  if (apiUser) {
    const ownedByApiUser = await db
      .prepare("SELECT id FROM bins WHERE id = ? AND user_id = ?")
      .bind(binId, apiUser.id)
      .first();
    if (ownedByApiUser) return true;
  }
  const owned = await db
    .prepare("SELECT id FROM bins WHERE id = ? AND owner_token_hash = ?")
    .bind(binId, await sha256(resolved))
    .first();
  return Boolean(owned);
}

export async function isBinOwner(
  db: D1Database,
  request: Request,
  binId: string,
) {
  const user = await getUser(db, request);
  if (!user) return false;
  return Boolean(
    await db
      .prepare("SELECT id FROM bins WHERE id = ? AND user_id = ?")
      .bind(binId, user.id)
      .first(),
  );
}

export function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
