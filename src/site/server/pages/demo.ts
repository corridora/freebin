import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import {
  redactBody,
  redactHeaders,
  redactValue,
  sanitizePublicText,
} from "@/server/domain/security";
import { parseJson, ruleFromRow } from "@/server/domain/rules";

function parseRecord(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function sanitizeRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record)
      .slice(0, 100)
      .map(([key, value]) => [
        sanitizePublicText(key, 200),
        Array.isArray(value)
          ? value.slice(0, 100).map((item) => sanitizePublicText(item, 2_000))
          : sanitizePublicText(value, 2_000),
      ]),
  );
}

export const load: PageServerLoad = async ({ platform }) => {
  const demoBinId = platform?.env.DEMO_BIN_ID || "demo-public";
  const empty = {
    id: demoBinId,
    interactions: [],
    rules: [],
    auditEvents: [],
    bin: {
      name: "freebin public demo",
      responseStatus: 200,
      responseBody: '{"ok":true,"captured":true}',
      responseContentType: "application/json; charset=utf-8",
      responseHeaders: {},
      forwardingEnabled: false,
      forwardingUrl: "",
      forwardingAuthHeaders: [],
      forwardingConditions: [],
    },
  };
  if (!platform?.env.DB) return empty;
  const bin = await platform.env.DB.prepare(
    `
    SELECT name, response_status AS responseStatus, response_body AS responseBody,
      response_content_type AS responseContentType, response_headers AS responseHeaders,
      forwarding_enabled AS forwardingEnabled, forwarding_url AS forwardingUrl,
      forwarding_auth_headers AS forwardingAuthHeaders, forwarding_conditions AS forwardingConditions
    FROM bins WHERE id = ? AND is_public_demo = 1
  `,
  )
    .bind(demoBinId)
    .first<Record<string, unknown>>();
  if (!bin) return empty;
  const result = await platform.env.DB.prepare(
    `
    SELECT r.id, r.method, r.path, r.query, r.headers, r.body,
      r.content_type AS contentType, r.created_at AS timestamp, b.id AS binId, b.name AS binName
    FROM requests r JOIN bins b ON b.id = r.bin_id
    WHERE b.id = ? AND b.is_public_demo = 1
    ORDER BY r.created_at DESC, r.id DESC
  `,
  )
    .bind(demoBinId)
    .all<Record<string, unknown>>();
  const [rules, audit] = await Promise.all([
    platform.env.DB.prepare(
      `
      SELECT id, name, enabled, priority, conditions, response_status AS responseStatus,
        response_body AS responseBody, response_content_type AS responseContentType,
        response_headers AS responseHeaders, response_delay_ms AS responseDelayMs
      FROM response_rules WHERE bin_id = ? ORDER BY priority, created_at
    `,
    )
      .bind(demoBinId)
      .all<Record<string, unknown>>(),
    platform.env.DB.prepare(
      `
      SELECT id, actor_type AS actorType, action, target_type AS targetType, created_at AS createdAt
      FROM audit_events WHERE bin_id = ? ORDER BY created_at DESC, id DESC LIMIT 100
    `,
    )
      .bind(demoBinId)
      .all<Record<string, unknown>>(),
  ]);
  return {
    id: demoBinId,
    // This public capture credential is also exposed by the home-page quickstart.
    demoApiKey: platform.env.DEMO_API_KEY || "freebin_demo_public",
    bin: {
      name: sanitizePublicText(bin.name, 200),
      responseStatus: Number(bin.responseStatus),
      responseContentType: sanitizePublicText(bin.responseContentType, 500),
      responseBody: redactBody(
        String(bin.responseBody || ""),
        String(bin.responseContentType || ""),
        true,
      ),
      responseHeaders: sanitizeRecord(
        redactHeaders(
          parseRecord(bin.responseHeaders) as Record<string, string>,
        ),
      ),
      forwardingEnabled: Boolean(Number(bin.forwardingEnabled)),
      forwardingUrl: bin.forwardingUrl ? "[redacted]" : "",
      forwardingAuthHeaders: parseJson<string[]>(
        bin.forwardingAuthHeaders,
        [],
      ).map((name) => sanitizePublicText(name, 200)),
      forwardingConditions: parseJson<any[]>(bin.forwardingConditions, []).map(
        (condition) => ({
          ...condition,
          value: condition.value === undefined ? undefined : "[redacted]",
        }),
      ),
    },
    rules: rules.results.map((row) => {
      const rule = ruleFromRow(row);
      return {
        ...rule,
        name: sanitizePublicText(rule.name, 200),
        responseBody: redactBody(
          rule.responseBody || "",
          rule.responseContentType || "",
          true,
        ),
        responseHeaders: sanitizeRecord(redactHeaders(rule.responseHeaders)),
        conditions: rule.conditions.map((condition) => ({
          ...condition,
          value: condition.value === undefined ? undefined : "[redacted]",
        })),
      };
    }),
    auditEvents: audit.results.map((row) => ({ ...row, metadata: {} })),
    interactions: result.results.map((row) => ({
      id: sanitizePublicText(row.id, 100),
      method: sanitizePublicText(row.method, 20),
      path: sanitizePublicText(row.path, 2_000),
      body: row.body
        ? sanitizePublicText(
            redactBody(String(row.body), String(row.contentType || ""), true),
            20 * 1024,
          )
        : null,
      contentType: row.contentType
        ? sanitizePublicText(row.contentType, 200)
        : null,
      timestamp: sanitizePublicText(row.timestamp, 100),
      binId: sanitizePublicText(row.binId, 100),
      binName: sanitizePublicText(row.binName, 200),
      headers: sanitizeRecord(
        redactHeaders(parseRecord(row.headers) as Record<string, string>),
      ),
      query: sanitizeRecord(
        redactValue(parseRecord(row.query)) as Record<string, unknown>,
      ),
    })),
  };
};
