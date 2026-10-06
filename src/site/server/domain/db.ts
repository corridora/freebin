export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function createId(length = 12) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => (byte % 36).toString(36)).join("");
}

export function bearer(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
}

export async function ownsBin(db: D1Database, binId: string, token: string) {
  if (!token) return false;
  const hash = await sha256(token);
  const row = await db
    .prepare("SELECT id FROM bins WHERE id = ? AND owner_token_hash = ?")
    .bind(binId, hash)
    .first();
  return Boolean(row);
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}
