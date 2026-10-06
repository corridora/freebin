export const ruleLimits = {
  enabledPerBin: 5,
  totalPerBin: 10,
  enabledPerAccount: 25,
  totalPerAccount: 50,
  conditions: 5,
  serializedBytes: 8 * 1024,
  responseBodyBytes: 20 * 1024,
  responseHeadersBytes: 4 * 1024,
  delayMs: 5_000,
} as const;

export type RuleOperator = "equals" | "exists" | "contains" | "glob";
export type RuleSource = "method" | "path" | "query" | "header" | "body";
export type RuleCondition = {
  source: RuleSource;
  key?: string;
  operator: RuleOperator;
  value?: string;
};
export type RuleInput = {
  name?: string;
  enabled?: boolean;
  conditions?: RuleCondition[];
  responseStatus?: number;
  responseBody?: string;
  responseContentType?: string;
  responseHeaders?: Record<string, string>;
  responseDelayMs?: number;
};

const encoder = new TextEncoder();
const headerName = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const prohibitedResponseHeaders = new Set([
  "set-cookie",
  "content-length",
  "transfer-encoding",
  "connection",
  "upgrade",
]);
const prohibitedConditionHeaders = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
]);

export function validateConditions(
  input: unknown,
  allowEmpty = false,
): RuleCondition[] {
  if (
    !Array.isArray(input) ||
    input.length > ruleLimits.conditions ||
    (!allowEmpty && !input.length)
  ) {
    throw new Error(
      `Conditions must be an array of ${allowEmpty ? "0" : "1"}–5 conditions`,
    );
  }
  return input.map((condition) => {
    if (!condition || typeof condition !== "object" || Array.isArray(condition))
      throw new Error("Each condition must be an object");
    if (
      Object.keys(condition).some(
        (key) => !["source", "key", "operator", "value"].includes(key),
      )
    )
      throw new Error("Unsupported condition property");
    if (
      !["method", "path", "query", "header", "body"].includes(condition.source)
    )
      throw new Error("Invalid rule condition source");
    if (!["equals", "exists", "contains", "glob"].includes(condition.operator))
      throw new Error("Invalid rule condition operator");
    if (condition.key !== undefined && typeof condition.key !== "string")
      throw new Error("Condition keys must be strings");
    if (condition.value !== undefined && typeof condition.value !== "string")
      throw new Error("Condition values must be strings");
    const key = (condition.key || "").trim();
    const value = condition.value ?? "";
    if (["query", "header", "body"].includes(condition.source) && !key)
      throw new Error(`${condition.source} conditions require a key`);
    if (encoder.encode(key).byteLength > 500)
      throw new Error("Condition keys are limited to 500 UTF-8 bytes");
    if (
      condition.source === "header" &&
      prohibitedConditionHeaders.has(key.toLowerCase())
    )
      throw new Error("Rules cannot inspect authorization or cookie headers");
    if (encoder.encode(value).byteLength > 500)
      throw new Error("Condition values are limited to 500 UTF-8 bytes");
    return {
      source: condition.source,
      key: key || undefined,
      operator: condition.operator,
      value: condition.operator === "exists" ? undefined : value,
    };
  });
}

export function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

export type ParsedRule = Record<string, unknown> & {
  id?: string;
  name?: string;
  enabled: boolean;
  revision?: number;
  responseStatus?: number;
  responseBody?: string;
  responseContentType?: string;
  responseDelayMs?: number;
  conditions: RuleCondition[];
  responseHeaders: Record<string, string>;
};

export function ruleFromRow(row: Record<string, unknown>): ParsedRule {
  return {
    ...row,
    responseStatus: Number(row.responseStatus ?? row.response_status) || 200,
    responseBody: String(row.responseBody ?? row.response_body ?? ""),
    responseContentType: String(
      row.responseContentType ??
        row.response_content_type ??
        "text/plain; charset=utf-8",
    ),
    responseDelayMs: Number(row.responseDelayMs ?? row.response_delay_ms) || 0,
    enabled: Boolean(Number(row.enabled)),
    conditions: parseJson<RuleCondition[]>(row.conditions, []),
    responseHeaders: parseJson<Record<string, string>>(
      row.responseHeaders ?? row.response_headers,
      {},
    ),
  };
}

export function validateRule(input: RuleInput) {
  const name = String(input.name || "").trim();
  const enabled = input.enabled !== false;
  const conditions = validateConditions(input.conditions);
  const responseStatus = Number(input.responseStatus ?? 200);
  const responseBody = String(input.responseBody ?? "");
  const responseContentType = String(
    input.responseContentType || "text/plain; charset=utf-8",
  );
  const responseDelayMs = Number(input.responseDelayMs ?? 0);
  const responseHeaders = Object.fromEntries(
    Object.entries(input.responseHeaders || {}).map(([key, value]) => [
      key.trim(),
      String(value),
    ]),
  );
  if (!name || encoder.encode(name).byteLength > 80)
    throw new Error("Rule name must be 1–80 UTF-8 bytes");
  if (
    !Number.isInteger(responseStatus) ||
    responseStatus < 200 ||
    responseStatus > 599
  )
    throw new Error("Rule response status must be between 200 and 599");
  if (
    !Number.isInteger(responseDelayMs) ||
    responseDelayMs < 0 ||
    responseDelayMs > ruleLimits.delayMs
  )
    throw new Error("Response delay must be between 0 and 5,000 ms");
  if (encoder.encode(responseBody).byteLength > ruleLimits.responseBodyBytes)
    throw new Error("Rule response body exceeds 20 KB");
  if (encoder.encode(responseContentType).byteLength > 500)
    throw new Error("Response content type exceeds 500 bytes");
  if (
    Object.keys(responseHeaders).length > 20 ||
    encoder.encode(JSON.stringify(responseHeaders)).byteLength >
      ruleLimits.responseHeadersBytes
  )
    throw new Error("Rule response headers exceed 20 headers or 4 KB");
  for (const [key, value] of Object.entries(responseHeaders)) {
    if (
      !headerName.test(key) ||
      prohibitedResponseHeaders.has(key.toLowerCase())
    )
      throw new Error(`Response header ${key || "(empty)"} is not allowed`);
    if (encoder.encode(value).byteLength > 500)
      throw new Error("Each response header value is limited to 500 bytes");
  }
  try {
    const checkedHeaders = new Headers(responseHeaders);
    checkedHeaders.set("content-type", responseContentType);
  } catch {
    throw new Error(
      "Response headers and content type must contain valid HTTP header values",
    );
  }
  const normalized = {
    name,
    enabled,
    conditions: conditions.map((condition) => ({
      source: condition.source,
      key: condition.key?.trim() || undefined,
      operator: condition.operator,
      value:
        condition.operator === "exists"
          ? undefined
          : String(condition.value ?? ""),
    })),
    responseStatus,
    responseBody,
    responseContentType,
    responseHeaders,
    responseDelayMs,
  };
  if (
    encoder.encode(JSON.stringify(normalized)).byteLength >
    ruleLimits.serializedBytes + ruleLimits.responseBodyBytes
  )
    throw new Error("Serialized rule exceeds its size limit");
  return normalized;
}

function nestedValue(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (current, part) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[part]
          : undefined,
      value,
    );
}

function glob(value: string, pattern: string) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`).test(value);
}

function compare(actual: unknown, operator: RuleOperator, expected = "") {
  if (operator === "exists") return actual !== undefined && actual !== null;
  const values = Array.isArray(actual)
    ? actual.map(String)
    : [String(actual ?? "")];
  if (operator === "equals") return values.some((value) => value === expected);
  if (operator === "contains")
    return values.some((value) => value.includes(expected));
  return values.some((value) => glob(value, expected));
}

export type MatchContext = {
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  headers: Record<string, string>;
  body: string | null;
  contentType: string | null;
};

export function matchesRule(
  conditions: RuleCondition[],
  context: MatchContext,
) {
  let parsedBody: unknown = undefined;
  if (context.body && context.contentType?.includes("application/json"))
    parsedBody = parseJson(context.body, undefined);
  else if (
    context.body &&
    context.contentType?.includes("application/x-www-form-urlencoded")
  )
    parsedBody = Object.fromEntries(new URLSearchParams(context.body));
  return conditions.every((condition) => {
    let actual: unknown;
    if (condition.source === "method") actual = context.method.toUpperCase();
    else if (condition.source === "path") actual = context.path;
    else if (condition.source === "query")
      actual = context.query[String(condition.key)];
    else if (condition.source === "header")
      actual = context.headers[String(condition.key).toLowerCase()];
    else actual = nestedValue(parsedBody, String(condition.key));
    return compare(actual, condition.operator, String(condition.value ?? ""));
  });
}
