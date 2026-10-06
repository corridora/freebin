import type { WorkerPlatform } from "@/server/context";
import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { canManageBin, type BinPermission } from "@/server/domain/auth";
import { bearer, createId, json } from "@/server/domain/db";
import {
  binConfigSchema,
  validatePortableConfig,
  type PortableBinConfig,
} from "@/server/domain/portable-config";
import { ruleFromRow, ruleLimits } from "@/server/domain/rules";
import { enforceQuota } from "@/server/domain/security";
import { recordAudit } from "@/server/domain/audit";

async function authorize(
  request: Request,
  platform: WorkerPlatform | undefined,
  binId: string,
  permission: BinPermission,
) {
  if (!platform?.env.DB)
    return { error: json({ error: "Database unavailable" }, { status: 503 }) };
  if (
    !(await canManageBin(
      platform.env.DB,
      request,
      binId,
      bearer(request),
      permission,
    ))
  )
    return { error: json({ error: "Forbidden" }, { status: 403 }) };
  return { db: platform.env.DB };
}

export const GET: RequestHandler = async ({ request, params, platform }) => {
  const auth = await authorize(request, platform, params.id, "config.view");
  if (auth.error) return auth.error;
  const bin = await auth
    .db!.prepare(
      `SELECT name, response_status AS responseStatus, response_body AS responseBody,
    response_content_type AS responseContentType, response_headers AS responseHeaders,
    forwarding_enabled AS forwardingEnabled, forwarding_url AS forwardingUrl,
    forwarding_auth_headers AS forwardingAuthHeaders, forwarding_conditions AS forwardingConditions FROM bins WHERE id = ?`,
    )
    .bind(params.id)
    .first<Record<string, unknown>>();
  if (!bin) return json({ error: "Bin not found" }, { status: 404 });
  const rows = await auth
    .db!.prepare(
      `SELECT name, enabled, conditions, response_status AS responseStatus,
    response_body AS responseBody, response_content_type AS responseContentType,
    response_headers AS responseHeaders, response_delay_ms AS responseDelayMs
    FROM response_rules WHERE bin_id = ? ORDER BY priority, created_at`,
    )
    .bind(params.id)
    .all<Record<string, unknown>>();
  const rules = rows.results.map(ruleFromRow).map((rule) => ({
    name: rule.name,
    enabled: rule.enabled,
    conditions: rule.conditions,
    responseStatus: rule.responseStatus,
    responseBody: rule.responseBody,
    responseContentType: rule.responseContentType,
    responseHeaders: rule.responseHeaders,
    responseDelayMs: rule.responseDelayMs,
  }));
  return json(
    {
      $schema: binConfigSchema,
      version: 1,
      bin: {
        name: bin.name,
        response: {
          status: bin.responseStatus,
          body: bin.responseBody,
          contentType: bin.responseContentType,
          headers: JSON.parse(String(bin.responseHeaders || "{}")),
        },
        forwarding: {
          enabled: Boolean(Number(bin.forwardingEnabled)),
          url: bin.forwardingUrl || null,
          authHeaders: JSON.parse(String(bin.forwardingAuthHeaders || "[]")),
          conditions: JSON.parse(String(bin.forwardingConditions || "[]")),
        },
      },
      rules,
    },
    {
      headers: {
        "content-disposition": `attachment; filename="freebin-${params.id}-config.v1.json"`,
      },
    },
  );
};

export const PUT: RequestHandler = async ({ request, params, platform }) => {
  const auth = await authorize(request, platform, params.id, "config.edit");
  if (auth.error) return auth.error;
  const quota = await enforceQuota(
    auth.db!,
    "config-import",
    params.id,
    10,
    60,
    platform?.env.RATE_LIMIT_SALT,
  );
  if (!quota.allowed)
    return json(
      { error: "Configuration import limit exceeded; try again shortly" },
      { status: 429 },
    );
  const input = (await request
    .json()
    .catch(() => null)) as PortableBinConfig | null;
  let config;
  try {
    config = validatePortableConfig(
      input as PortableBinConfig,
      platform?.env.REPLAY_ALLOWED_ORIGINS,
    );
  } catch (cause) {
    return json(
      {
        error: cause instanceof Error ? cause.message : "Invalid configuration",
        code: "INVALID_BIN_CONFIG",
      },
      { status: 400 },
    );
  }
  const counts = await auth
    .db!.prepare(
      `SELECT b.user_id AS userId,
    (SELECT COUNT(*) FROM response_rules ar JOIN bins ab ON ab.id = ar.bin_id WHERE ab.user_id = b.user_id AND ab.id <> b.id) AS otherTotal,
    (SELECT COALESCE(SUM(ar.enabled), 0) FROM response_rules ar JOIN bins ab ON ab.id = ar.bin_id WHERE ab.user_id = b.user_id AND ab.id <> b.id) AS otherEnabled
    FROM bins b WHERE b.id = ?`,
    )
    .bind(params.id)
    .first<Record<string, unknown>>();
  if (!counts) return json({ error: "Bin not found" }, { status: 404 });
  if (
    counts.userId &&
    Number(counts.otherTotal) + config.rules.length > ruleLimits.totalPerAccount
  )
    return json(
      {
        error: "Imported rules would exceed the account total-rule limit",
        code: "RULE_TOTAL_LIMIT",
      },
      { status: 409 },
    );
  if (
    counts.userId &&
    Number(counts.otherEnabled) +
      config.rules.filter((rule) => rule.enabled).length >
      ruleLimits.enabledPerAccount
  )
    return json(
      {
        error: "Imported rules would exceed the account enabled-rule limit",
        code: "RULE_ENABLED_LIMIT",
      },
      { status: 409 },
    );
  const now = new Date().toISOString();
  const statements = [
    auth
      .db!.prepare(
        `UPDATE bins SET name = ?, response_status = ?, response_body = ?, response_content_type = ?, response_headers = ?,
      forwarding_enabled = ?, forwarding_url = ?, forwarding_auth_headers = ?, forwarding_conditions = ? WHERE id = ?`,
      )
      .bind(
        config.name,
        config.response.status,
        config.response.body,
        config.response.contentType,
        JSON.stringify(config.response.headers),
        config.forwarding.enabled ? 1 : 0,
        config.forwarding.url || null,
        JSON.stringify(config.forwarding.authHeaders),
        JSON.stringify(config.forwarding.conditions),
        params.id,
      ),
    auth
      .db!.prepare("DELETE FROM response_rules WHERE bin_id = ?")
      .bind(params.id),
    ...config.rules.map((rule, index) =>
      auth
        .db!.prepare(
          `INSERT INTO response_rules
      (id, bin_id, name, enabled, priority, revision, conditions, response_status, response_body, response_content_type, response_headers, response_delay_ms, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          createId(16),
          params.id,
          rule.name,
          rule.enabled ? 1 : 0,
          index + 1,
          JSON.stringify(rule.conditions),
          rule.responseStatus,
          rule.responseBody,
          rule.responseContentType,
          JSON.stringify(rule.responseHeaders),
          rule.responseDelayMs,
          now,
          now,
        ),
    ),
  ];
  await auth.db!.batch(statements);
  await recordAudit(auth.db!, request, {
    binId: params.id,
    action: "config.import",
    targetType: "bin",
    targetId: params.id,
    metadata: { version: 1, rules: config.rules.length },
  });
  return json({ ok: true, importedRules: config.rules.length });
};
