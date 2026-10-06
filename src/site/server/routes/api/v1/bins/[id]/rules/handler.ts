import type { WorkerPlatform } from "@/server/context";
import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { canManageBin, type BinPermission } from "@/server/domain/auth";
import { bearer, createId, json } from "@/server/domain/db";
import { enforceQuota } from "@/server/domain/security";
import {
  ruleFromRow,
  ruleLimits,
  validateRule,
  type RuleInput,
} from "@/server/domain/rules";
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

const selection = `id, name, enabled, priority, revision, conditions, response_status AS responseStatus,
  response_body AS responseBody, response_content_type AS responseContentType,
  response_headers AS responseHeaders, response_delay_ms AS responseDelayMs,
  created_at AS createdAt, updated_at AS updatedAt`;

export const GET: RequestHandler = async ({ request, params, platform }) => {
  const auth = await authorize(request, platform, params.id, "rules.view");
  if (auth.error) return auth.error;
  const result = await auth
    .db!.prepare(
      `SELECT ${selection} FROM response_rules WHERE bin_id = ? ORDER BY priority, created_at`,
    )
    .bind(params.id)
    .all<Record<string, unknown>>();
  return json({ rules: result.results.map(ruleFromRow), limits: ruleLimits });
};

export const POST: RequestHandler = async ({ request, params, platform }) => {
  const auth = await authorize(request, platform, params.id, "rules.edit");
  if (auth.error) return auth.error;
  const quota = await enforceQuota(
    auth.db!,
    "rule-mutation",
    params.id,
    30,
    60,
    platform?.env.RATE_LIMIT_SALT,
  );
  if (!quota.allowed)
    return json(
      { error: "Rule mutation limit exceeded", code: "RULE_MUTATION_LIMIT" },
      { status: 429 },
    );
  let rule;
  try {
    rule = validateRule((await request.json()) as RuleInput);
  } catch (cause) {
    return json(
      {
        error: cause instanceof Error ? cause.message : "Invalid rule",
        code: "INVALID_RULE",
      },
      { status: 400 },
    );
  }
  const counts = await auth
    .db!.prepare(
      `
    SELECT COUNT(r.id) AS binTotal, COALESCE(SUM(r.enabled), 0) AS binEnabled,
      (SELECT COUNT(*) FROM response_rules ar JOIN bins ab ON ab.id = ar.bin_id WHERE ab.user_id = b.user_id) AS accountTotal,
      (SELECT COALESCE(SUM(ar.enabled), 0) FROM response_rules ar JOIN bins ab ON ab.id = ar.bin_id WHERE ab.user_id = b.user_id) AS accountEnabled
    FROM bins b LEFT JOIN response_rules r ON r.bin_id = b.id WHERE b.id = ? GROUP BY b.id
  `,
    )
    .bind(params.id)
    .first<Record<string, unknown>>();
  if (
    Number(counts?.binTotal) >= ruleLimits.totalPerBin ||
    Number(counts?.accountTotal) >= ruleLimits.totalPerAccount
  ) {
    return json(
      { error: "Rule count limit reached", code: "RULE_TOTAL_LIMIT" },
      { status: 409 },
    );
  }
  if (
    rule.enabled &&
    (Number(counts?.binEnabled) >= ruleLimits.enabledPerBin ||
      Number(counts?.accountEnabled) >= ruleLimits.enabledPerAccount)
  ) {
    return json(
      { error: "Enabled rule limit reached", code: "RULE_ENABLED_LIMIT" },
      { status: 409 },
    );
  }
  const priority =
    Number(
      (
        await auth
          .db!.prepare(
            "SELECT COALESCE(MAX(priority), 0) AS priority FROM response_rules WHERE bin_id = ?",
          )
          .bind(params.id)
          .first()
      )?.priority,
    ) + 1;
  const id = createId(16);
  const now = new Date().toISOString();
  await auth
    .db!.prepare(
      `INSERT INTO response_rules
    (id, bin_id, name, enabled, priority, conditions, response_status, response_body, response_content_type, response_headers, response_delay_ms, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      params.id,
      rule.name,
      rule.enabled ? 1 : 0,
      priority,
      JSON.stringify(rule.conditions),
      rule.responseStatus,
      rule.responseBody,
      rule.responseContentType,
      JSON.stringify(rule.responseHeaders),
      rule.responseDelayMs,
      now,
      now,
    )
    .run();
  const created = await auth
    .db!.prepare(`SELECT ${selection} FROM response_rules WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();
  await recordAudit(auth.db!, request, {
    binId: params.id,
    action: "rule.create",
    targetType: "rule",
    targetId: id,
    metadata: { name: rule.name },
  });
  return json({ rule: ruleFromRow(created!) }, { status: 201 });
};

export const PUT: RequestHandler = async ({ request, params, platform }) => {
  const auth = await authorize(request, platform, params.id, "rules.edit");
  if (auth.error) return auth.error;
  const quota = await enforceQuota(
    auth.db!,
    "rule-mutation",
    params.id,
    30,
    60,
    platform?.env.RATE_LIMIT_SALT,
  );
  if (!quota.allowed)
    return json(
      { error: "Rule mutation limit exceeded", code: "RULE_MUTATION_LIMIT" },
      { status: 429 },
    );
  const input = (await request.json().catch(() => ({}))) as {
    ruleIds?: string[];
  };
  if (
    !Array.isArray(input.ruleIds) ||
    new Set(input.ruleIds).size !== input.ruleIds.length
  )
    return json(
      { error: "ruleIds must be a unique ordered array" },
      { status: 400 },
    );
  const current = await auth
    .db!.prepare("SELECT id FROM response_rules WHERE bin_id = ?")
    .bind(params.id)
    .all<{ id: string }>();
  if (
    current.results.length !== input.ruleIds.length ||
    current.results.some((row) => !input.ruleIds!.includes(row.id))
  )
    return json(
      { error: "ruleIds must contain every rule in this bin" },
      { status: 400 },
    );
  const now = new Date().toISOString();
  await auth.db!.batch([
    ...input.ruleIds.map((id, index) =>
      auth
        .db!.prepare(
          "UPDATE response_rules SET priority = ?, updated_at = ? WHERE id = ? AND bin_id = ?",
        )
        .bind(-(index + 1), now, id, params.id),
    ),
    ...input.ruleIds.map((id, index) =>
      auth
        .db!.prepare(
          "UPDATE response_rules SET priority = ?, updated_at = ? WHERE id = ? AND bin_id = ?",
        )
        .bind(index + 1, now, id, params.id),
    ),
  ]);
  await recordAudit(auth.db!, request, {
    binId: params.id,
    action: "rules.reorder",
    targetType: "rules",
    metadata: { ruleIds: input.ruleIds },
  });
  return json({ ok: true });
};
