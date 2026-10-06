import type { WorkerPlatform } from "@/server/context";
import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { canManageBin, type BinPermission } from "@/server/domain/auth";
import { bearer, json } from "@/server/domain/db";
import {
  ruleFromRow,
  ruleLimits,
  validateRule,
  type RuleInput,
} from "@/server/domain/rules";
import { enforceQuota } from "@/server/domain/security";
import { recordAudit } from "@/server/domain/audit";

async function dbFor(
  request: Request,
  platform: WorkerPlatform | undefined,
  binId: string,
  permission: BinPermission,
) {
  if (!platform?.env.DB) return null;
  return (await canManageBin(
    platform.env.DB,
    request,
    binId,
    bearer(request),
    permission,
  ))
    ? platform.env.DB
    : null;
}

export const PATCH: RequestHandler = async ({ request, params, platform }) => {
  const db = await dbFor(request, platform, params.id, "rules.edit");
  if (!db) return json({ error: "Forbidden" }, { status: 403 });
  const quota = await enforceQuota(
    db,
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
  const existing = await db
    .prepare(
      `SELECT id, name, enabled, priority, revision, conditions,
    response_status AS responseStatus, response_body AS responseBody,
    response_content_type AS responseContentType, response_headers AS responseHeaders,
    response_delay_ms AS responseDelayMs, created_at AS createdAt, updated_at AS updatedAt
    FROM response_rules WHERE id = ? AND bin_id = ?`,
    )
    .bind(params.ruleId, params.id)
    .first<Record<string, unknown>>();
  if (!existing) return json({ error: "Rule not found" }, { status: 404 });
  const input = (await request.json().catch(() => ({}))) as RuleInput;
  let rule;
  try {
    rule = validateRule({ ...ruleFromRow(existing), ...input });
  } catch (cause) {
    return json(
      {
        error: cause instanceof Error ? cause.message : "Invalid rule",
        code: "INVALID_RULE",
      },
      { status: 400 },
    );
  }
  if (rule.enabled && !Number(existing.enabled)) {
    const counts = await db
      .prepare(
        `SELECT SUM(r.enabled) AS binEnabled,
      (SELECT COALESCE(SUM(ar.enabled), 0) FROM response_rules ar JOIN bins ab ON ab.id = ar.bin_id WHERE ab.user_id = b.user_id) AS accountEnabled
      FROM bins b LEFT JOIN response_rules r ON r.bin_id = b.id WHERE b.id = ? GROUP BY b.id`,
      )
      .bind(params.id)
      .first<Record<string, unknown>>();
    if (
      Number(counts?.binEnabled) >= ruleLimits.enabledPerBin ||
      Number(counts?.accountEnabled) >= ruleLimits.enabledPerAccount
    )
      return json(
        { error: "Enabled rule limit reached", code: "RULE_ENABLED_LIMIT" },
        { status: 409 },
      );
  }
  await db
    .prepare(
      `UPDATE response_rules SET name = ?, enabled = ?, revision = revision + 1, conditions = ?, response_status = ?,
    response_body = ?, response_content_type = ?, response_headers = ?, response_delay_ms = ?, updated_at = ? WHERE id = ? AND bin_id = ?`,
    )
    .bind(
      rule.name,
      rule.enabled ? 1 : 0,
      JSON.stringify(rule.conditions),
      rule.responseStatus,
      rule.responseBody,
      rule.responseContentType,
      JSON.stringify(rule.responseHeaders),
      rule.responseDelayMs,
      new Date().toISOString(),
      params.ruleId,
      params.id,
    )
    .run();
  await recordAudit(db, request, {
    binId: params.id,
    action: "rule.update",
    targetType: "rule",
    targetId: params.ruleId,
    metadata: { name: rule.name },
  });
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, params, platform }) => {
  const db = await dbFor(request, platform, params.id, "rules.delete");
  if (!db) return json({ error: "Forbidden" }, { status: 403 });
  const quota = await enforceQuota(
    db,
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
  const result = await db
    .prepare("DELETE FROM response_rules WHERE id = ? AND bin_id = ?")
    .bind(params.ruleId, params.id)
    .run();
  if (!result.meta.changes)
    return json({ error: "Rule not found" }, { status: 404 });
  const remaining = await db
    .prepare("SELECT id FROM response_rules WHERE bin_id = ? ORDER BY priority")
    .bind(params.id)
    .all<{ id: string }>();
  await db.batch(
    remaining.results.map((row, index) =>
      db
        .prepare("UPDATE response_rules SET priority = ? WHERE id = ?")
        .bind(index + 1, row.id),
    ),
  );
  await recordAudit(db, request, {
    binId: params.id,
    action: "rule.delete",
    targetType: "rule",
    targetId: params.ruleId,
  });
  return json({ ok: true });
};
