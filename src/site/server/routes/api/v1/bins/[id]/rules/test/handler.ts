import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { canManageBin } from "@/server/domain/auth";
import { bearer, json } from "@/server/domain/db";
import {
  matchesRule,
  parseJson,
  ruleFromRow,
  type MatchContext,
} from "@/server/domain/rules";

export const POST: RequestHandler = async ({ request, params, platform }) => {
  if (!platform?.env.DB)
    return json({ error: "Database unavailable" }, { status: 503 });
  if (
    !(await canManageBin(
      platform.env.DB,
      request,
      params.id,
      bearer(request),
      "rules.edit",
    ))
  )
    return json({ error: "Forbidden" }, { status: 403 });
  const input = (await request
    .json()
    .catch(() => ({}))) as Partial<MatchContext>;
  const context: MatchContext = {
    method: String(input.method || "POST").toUpperCase(),
    path: String(input.path || "/"),
    query:
      typeof input.query === "object" && input.query
        ? (input.query as Record<string, string | string[]>)
        : {},
    headers: Object.fromEntries(
      Object.entries(input.headers || {}).map(([key, value]) => [
        key.toLowerCase(),
        String(value),
      ]),
    ),
    body:
      input.body === null || input.body === undefined
        ? null
        : String(input.body),
    contentType: String(input.contentType || "application/json"),
  };
  const result = await platform.env.DB.prepare(
    "SELECT * FROM response_rules WHERE bin_id = ? AND enabled = 1 ORDER BY priority LIMIT 5",
  )
    .bind(params.id)
    .all<Record<string, unknown>>();
  const matched = result.results
    .map(ruleFromRow)
    .find((rule) => matchesRule(rule.conditions, context));
  return json({
    matched: matched
      ? {
          id: matched.id,
          name: matched.name,
          revision: matched.revision,
          responseStatus: matched.responseStatus,
        }
      : null,
  });
};
