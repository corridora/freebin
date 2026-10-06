import type { WorkerPlatform } from "@/server/context";
import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import {
  canManageBin,
  getUser,
  isBinOwner,
  type BinPermission,
} from "@/server/domain/auth";
import { bearer, json } from "@/server/domain/db";
import {
  isRetainableAuthHeader,
  isSafeOutboundTarget,
} from "@/server/domain/outbound";
import { recordAudit } from "@/server/domain/audit";
import { validateForwardingConditions } from "@/server/domain/forwarding";

const headerNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function parseHeaderNames(value: unknown) {
  try {
    const names = Array.isArray(value)
      ? value
      : JSON.parse(String(value || "[]"));
    return Array.isArray(names) ? names.map(String) : [];
  } catch {
    return [];
  }
}

async function authorize(
  request: Request,
  platform: WorkerPlatform | undefined,
  id: string,
  permission: BinPermission,
  token = "",
) {
  if (!platform?.env.DB)
    return {
      error: json(
        { error: "D1 database binding is unavailable" },
        { status: 503 },
      ),
    };
  const resolved = bearer(request) || token;
  if (
    !(await canManageBin(platform.env.DB, request, id, resolved, permission))
  ) {
    return {
      error: json({ error: "Invalid inspector token" }, { status: 403 }),
    };
  }
  return { db: platform.env.DB };
}

export const GET: RequestHandler = async ({ request, params, platform }) => {
  const auth = await authorize(request, platform, params.id, "bin.view");
  if (auth.error) return auth.error;
  const bin = await auth
    .db!.prepare(
      `
    SELECT id AS binId, name, created_at AS createdAt,
      response_status AS responseStatus, response_body AS responseBody,
      response_content_type AS responseContentType, response_headers AS responseHeaders,
      public_share_token AS publicShareToken, forwarding_enabled AS forwardingEnabled,
      forwarding_url AS forwardingUrl, forwarding_auth_headers AS forwardingAuthHeaders,
      forwarding_conditions AS forwardingConditions
    FROM bins WHERE id = ?
  `,
    )
    .bind(params.id)
    .first<Record<string, unknown>>();
  return json({
    bin: {
      ...bin,
      responseHeaders: JSON.parse(String(bin?.responseHeaders || "{}")),
      forwardingEnabled: Boolean(Number(bin?.forwardingEnabled)),
      forwardingAuthHeaders: parseHeaderNames(bin?.forwardingAuthHeaders),
      forwardingConditions: JSON.parse(
        String(bin?.forwardingConditions || "[]"),
      ),
    },
  });
};

export const PATCH: RequestHandler = async ({ request, params, platform }) => {
  const input = (await request.json().catch(() => ({}))) as {
    responseStatus?: number;
    responseBody?: string;
    responseContentType?: string;
    responseHeaders?: Record<string, string>;
    forwardingEnabled?: boolean;
    forwardingUrl?: string;
    forwardingAuthHeaders?: string[];
    forwardingConditions?: unknown;
  };
  const hasForwarding = [
    "forwardingEnabled",
    "forwardingUrl",
    "forwardingAuthHeaders",
    "forwardingConditions",
  ].some((key) => key in input);
  const hasBinSettings = [
    "responseStatus",
    "responseBody",
    "responseContentType",
    "responseHeaders",
  ].some((key) => key in input);
  const auth = await authorize(
    request,
    platform,
    params.id,
    hasBinSettings || !hasForwarding ? "bin.edit" : "forwarding.edit",
  );
  if (auth.error) return auth.error;
  if (
    hasForwarding &&
    hasBinSettings &&
    !(await canManageBin(
      auth.db!,
      request,
      params.id,
      bearer(request),
      "forwarding.edit",
    ))
  ) {
    return json(
      { error: "Forwarding edit permission is required" },
      { status: 403 },
    );
  }
  const current = await auth
    .db!.prepare(
      `SELECT response_status AS responseStatus, response_body AS responseBody,
    response_content_type AS responseContentType, response_headers AS responseHeaders,
    forwarding_enabled AS forwardingEnabled, forwarding_url AS forwardingUrl,
    forwarding_auth_headers AS forwardingAuthHeaders, forwarding_conditions AS forwardingConditions FROM bins WHERE id = ?`,
    )
    .bind(params.id)
    .first<Record<string, unknown>>();
  const byteLength = (value: string) =>
    new TextEncoder().encode(value).byteLength;
  const status = Math.min(
    Math.max(
      Number(input.responseStatus ?? current?.responseStatus) || 200,
      100,
    ),
    599,
  );
  const body = String(input.responseBody ?? current?.responseBody ?? "");
  const contentType = String(
    input.responseContentType ??
      current?.responseContentType ??
      "text/plain; charset=utf-8",
  );
  const headers = Object.fromEntries(
    Object.entries(
      input.responseHeaders ??
        JSON.parse(String(current?.responseHeaders || "{}")),
    )
      .filter(
        ([key]) =>
          !["set-cookie", "content-length", "transfer-encoding"].includes(
            key.toLowerCase(),
          ),
      )
      .slice(0, 20)
      .map(([key, value]) => [key, String(value)]),
  );
  const serializedHeaders = JSON.stringify(headers);
  if (byteLength(body) > 500)
    return json({ error: "Response body exceeds 500 bytes" }, { status: 400 });
  if (byteLength(contentType) > 500)
    return json(
      { error: "Response content type exceeds 500 bytes" },
      { status: 400 },
    );
  if (byteLength(serializedHeaders) > 500)
    return json(
      { error: "Response headers exceed 500 bytes" },
      { status: 400 },
    );
  if (
    Object.entries(headers).some(
      ([key, value]) => byteLength(key) > 500 || byteLength(value) > 500,
    )
  ) {
    return json(
      {
        error: "Each response header name and value must be 500 bytes or less",
      },
      { status: 400 },
    );
  }
  const forwardingEnabled =
    input.forwardingEnabled === undefined
      ? Boolean(Number(current?.forwardingEnabled))
      : Boolean(input.forwardingEnabled);
  const forwardingUrl =
    input.forwardingUrl === undefined
      ? String(current?.forwardingUrl || "")
      : String(input.forwardingUrl || "").trim();
  if (
    input.forwardingAuthHeaders !== undefined &&
    !Array.isArray(input.forwardingAuthHeaders)
  ) {
    return json(
      { error: "Forwarding auth headers must be an array of header names" },
      { status: 400 },
    );
  }
  const forwardingAuthHeaders =
    input.forwardingAuthHeaders === undefined
      ? parseHeaderNames(current?.forwardingAuthHeaders)
      : [
          ...new Set(
            input.forwardingAuthHeaders
              .map((name) => String(name).trim().toLowerCase())
              .filter(Boolean),
          ),
        ];
  if (forwardingAuthHeaders.length > 10)
    return json(
      { error: "At most 10 forwarding auth headers may be retained" },
      { status: 400 },
    );
  if (forwardingAuthHeaders.some((name) => !headerNamePattern.test(name))) {
    return json(
      { error: "Forwarding auth header names must be valid HTTP header names" },
      { status: 400 },
    );
  }
  if (
    forwardingAuthHeaders.includes("authorization") ||
    forwardingAuthHeaders.includes("proxy-authorization")
  ) {
    return json(
      {
        error:
          "Authorization cannot be forwarded because it contains the Freebin API key",
      },
      { status: 400 },
    );
  }
  if (forwardingAuthHeaders.some((name) => !isRetainableAuthHeader(name))) {
    return json(
      {
        error:
          "Hop-by-hop, source-address, and Freebin authorization headers cannot be retained",
      },
      { status: 400 },
    );
  }
  if (byteLength(forwardingUrl) > 2_000)
    return json(
      { error: "Forwarding URL exceeds 2,000 bytes" },
      { status: 400 },
    );
  let forwardingConditions;
  try {
    forwardingConditions = validateForwardingConditions(
      input.forwardingConditions === undefined
        ? JSON.parse(String(current?.forwardingConditions || "[]"))
        : input.forwardingConditions,
    );
  } catch (cause) {
    return json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : "Invalid forwarding conditions",
        code: "INVALID_FORWARDING_CONDITIONS",
      },
      { status: 400 },
    );
  }
  if (forwardingEnabled) {
    let target: URL;
    try {
      target = new URL(forwardingUrl);
    } catch {
      return json(
        { error: "Enter a valid HTTPS forwarding URL" },
        { status: 400 },
      );
    }
    if (!isSafeOutboundTarget(target, platform?.env.REPLAY_ALLOWED_ORIGINS)) {
      return json(
        { error: "Forwarding target origin is not allowed by this deployment" },
        { status: 400 },
      );
    }
  }
  await auth
    .db!.prepare(
      `
    UPDATE bins SET response_status = ?, response_body = ?, response_content_type = ?, response_headers = ?,
      forwarding_enabled = ?, forwarding_url = ?, forwarding_auth_headers = ?, forwarding_conditions = ? WHERE id = ?
  `,
    )
    .bind(
      status,
      body,
      contentType,
      serializedHeaders,
      forwardingEnabled ? 1 : 0,
      forwardingUrl || null,
      JSON.stringify(forwardingAuthHeaders),
      JSON.stringify(forwardingConditions),
      params.id,
    )
    .run();
  await recordAudit(auth.db!, request, {
    binId: params.id,
    action:
      hasForwarding && !hasBinSettings ? "forwarding.update" : "bin.update",
    targetType: "bin",
    targetId: params.id,
    metadata: { binSettings: hasBinSettings, forwarding: hasForwarding },
  });
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, params, platform }) => {
  const auth = await authorize(request, platform, params.id, "bin.delete");
  if (auth.error) return auth.error;
  const sessionUser = await getUser(auth.db!, request);
  if (sessionUser && !(await isBinOwner(auth.db!, request, params.id)))
    return json(
      { error: "Only the bin owner can delete this bin" },
      { status: 403 },
    );
  await recordAudit(auth.db!, request, {
    binId: params.id,
    action: "bin.delete",
    targetType: "bin",
    targetId: params.id,
  });
  await auth.db!.batch([
    auth.db!.prepare("DELETE FROM requests WHERE bin_id = ?").bind(params.id),
    auth.db!.prepare("DELETE FROM bins WHERE id = ?").bind(params.id),
  ]);
  return json({ ok: true });
};
