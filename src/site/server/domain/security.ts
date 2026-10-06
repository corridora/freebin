import { sha256 } from "./db";

export async function enforceQuota(
  db: D1Database,
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
  salt = "freebin-local",
) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const key = await sha256(`${salt}:${scope}:${identifier}:${windowStart}`);
  const result = await db
    .prepare(
      `
    INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count
  `,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  const next = Number(result?.count) || limit + 1;
  return {
    allowed: next <= limit,
    remaining: Math.max(0, limit - next),
    resetAt: windowStart + windowSeconds,
  };
}

const sensitive =
  /(^|[-_])(authorization|cookie|password|passwd|secret|token|api[-_]?key|access[-_]?(key|token)|jwt([-_]?assertion)?|credit[-_]?card|ssn)($|[-_])/i;
const sourceIdentityHeader =
  /^(cf-connecting-ip|cf-pseudo-ipv4|true-client-ip|x-forwarded-for|x-real-ip|forwarded|via)$/i;
const unsafeControls =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;

export function redactHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key]) => !sourceIdentityHeader.test(key))
      .map(([key, value]) => [key, sensitive.test(key) ? "[redacted]" : value]),
  );
}

export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        sensitive.test(key) ? "[redacted]" : redactValue(child),
      ]),
    );
  }
  return value;
}

export function redactBody(
  body: string | null,
  contentType: string | null,
  publicMode = false,
) {
  if (!body) return body;
  const normalizedType = contentType?.toLowerCase() || "";
  if (normalizedType.includes("application/json")) {
    try {
      return JSON.stringify(redactValue(JSON.parse(body)));
    } catch {
      return publicMode ? "[redacted: invalid JSON]" : body;
    }
  }
  if (normalizedType.includes("application/x-www-form-urlencoded")) {
    const values = new URLSearchParams(body);
    for (const key of [...values.keys()]) {
      if (sensitive.test(key)) values.set(key, "[redacted]");
    }
    return values.toString();
  }
  return publicMode ? "[redacted: unsupported content type]" : body;
}

export function sanitizePublicText(value: unknown, maximumLength: number) {
  return String(value ?? "")
    .replace(unsafeControls, "\uFFFD")
    .slice(0, maximumLength);
}
