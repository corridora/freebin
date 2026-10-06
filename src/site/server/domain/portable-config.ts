import { isRetainableAuthHeader, isSafeOutboundTarget } from "./outbound";
import { ruleLimits, validateRule, type RuleInput } from "./rules";
import { validateForwardingConditions } from "./forwarding";

export const binConfigSchema = "https://freebin.org/schemas/bin-config.v1.json";
const encoder = new TextEncoder();
const headerNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(
  value: Record<string, unknown>,
  allowed: string[],
  label: string,
) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown)
    throw new Error(`${label} contains unsupported property ${unknown}`);
}

function requireKeys(
  value: Record<string, unknown>,
  required: string[],
  label: string,
) {
  const missing = required.find((key) => !(key in value));
  if (missing)
    throw new Error(`${label} is missing required property ${missing}`);
}

export type PortableBinConfig = {
  $schema?: string;
  version?: number;
  bin?: {
    name?: string;
    response?: {
      status?: number;
      body?: string;
      contentType?: string;
      headers?: Record<string, string>;
    };
    forwarding?: {
      enabled?: boolean;
      url?: string | null;
      authHeaders?: string[];
      conditions?: unknown;
    };
  };
  rules?: RuleInput[];
};

export function validatePortableConfig(
  input: PortableBinConfig,
  allowedOrigins = "",
) {
  if (
    !isRecord(input) ||
    input.version !== 1 ||
    !isRecord(input.bin) ||
    !Array.isArray(input.rules)
  )
    throw new Error("Expected a version 1 Freebin configuration document");
  onlyKeys(input, ["$schema", "version", "bin", "rules"], "Configuration");
  requireKeys(input, ["$schema", "version", "bin", "rules"], "Configuration");
  onlyKeys(input.bin, ["name", "response", "forwarding"], "Bin configuration");
  requireKeys(
    input.bin,
    ["name", "response", "forwarding"],
    "Bin configuration",
  );
  if (input.$schema !== binConfigSchema)
    throw new Error("Unsupported Freebin configuration schema");
  if (encoder.encode(JSON.stringify(input)).byteLength > 320 * 1024)
    throw new Error("Configuration document exceeds 320 KB");
  const name = String(input.bin.name || "").trim();
  if (!name || name.length > 60 || encoder.encode(name).byteLength > 240)
    throw new Error("Bin name must be 1–60 characters and at most 240 bytes");
  if (!isRecord(input.bin.response) || !isRecord(input.bin.forwarding))
    throw new Error(
      "Bin response and forwarding configuration must be objects",
    );
  const response = input.bin.response;
  onlyKeys(
    response,
    ["status", "body", "contentType", "headers"],
    "Fallback response",
  );
  requireKeys(
    response,
    ["status", "body", "contentType", "headers"],
    "Fallback response",
  );
  const status = Number(response.status ?? 200);
  const body = String(response.body ?? "");
  const contentType = String(
    response.contentType || "text/plain; charset=utf-8",
  );
  if (!isRecord(response.headers))
    throw new Error("Fallback response headers must be an object");
  const headers = Object.fromEntries(
    Object.entries(response.headers).map(([key, value]) => [
      key.trim(),
      String(value),
    ]),
  );
  if (!Number.isInteger(status) || status < 100 || status > 599)
    throw new Error("Fallback response status must be between 100 and 599");
  if (
    encoder.encode(body).byteLength > 500 ||
    encoder.encode(contentType).byteLength > 500 ||
    encoder.encode(JSON.stringify(headers)).byteLength > 500
  )
    throw new Error(
      "Fallback response body, content type, and serialized headers are limited to 500 bytes each",
    );
  if (Object.keys(headers).length > 20)
    throw new Error("Fallback response is limited to 20 headers");
  for (const [key, value] of Object.entries(headers)) {
    if (
      !headerNamePattern.test(key) ||
      [
        "set-cookie",
        "content-length",
        "transfer-encoding",
        "connection",
        "upgrade",
      ].includes(key.toLowerCase())
    )
      throw new Error(
        `Fallback response header ${key || "(empty)"} is not allowed`,
      );
    if (encoder.encode(value).byteLength > 500)
      throw new Error(
        "Each fallback response header value is limited to 500 bytes",
      );
  }
  try {
    const checked = new Headers(headers);
    checked.set("content-type", contentType);
  } catch {
    throw new Error("Fallback response headers contain an invalid HTTP value");
  }
  const forwarding = input.bin.forwarding;
  onlyKeys(
    forwarding,
    ["enabled", "url", "authHeaders", "conditions"],
    "Forwarding configuration",
  );
  requireKeys(
    forwarding,
    ["enabled", "url", "authHeaders"],
    "Forwarding configuration",
  );
  const forwardingEnabled = Boolean(forwarding.enabled);
  const forwardingConditions = validateForwardingConditions(
    forwarding.conditions === undefined ? [] : forwarding.conditions,
  );
  const forwardingUrl = String(forwarding.url || "").trim();
  const forwardingAuthHeaders = [
    ...new Set(
      (Array.isArray(forwarding.authHeaders) ? forwarding.authHeaders : [])
        .map((value) => String(value).trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (forwardingUrl.length > 2_000)
    throw new Error("Forwarding URL exceeds 2,000 characters");
  if (
    forwardingAuthHeaders.length > 10 ||
    forwardingAuthHeaders.some(
      (value) =>
        !headerNamePattern.test(value) || !isRetainableAuthHeader(value),
    )
  )
    throw new Error(
      "Forwarding auth headers contain an invalid or prohibited header name",
    );
  if (
    forwardingAuthHeaders.includes("authorization") ||
    forwardingAuthHeaders.includes("proxy-authorization")
  )
    throw new Error(
      "Authorization cannot be forwarded because it contains the Freebin API key",
    );
  if (forwardingEnabled) {
    let target: URL;
    try {
      target = new URL(forwardingUrl);
    } catch {
      throw new Error("Enabled forwarding requires a valid HTTPS URL");
    }
    if (!isSafeOutboundTarget(target, allowedOrigins))
      throw new Error(
        "Forwarding target origin is not allowed by this deployment",
      );
  }
  if (input.rules.length > ruleLimits.totalPerBin)
    throw new Error(
      `A bin may contain at most ${ruleLimits.totalPerBin} rules`,
    );
  for (const value of input.rules) {
    if (!isRecord(value)) throw new Error("Every rule must be an object");
    onlyKeys(
      value,
      [
        "name",
        "enabled",
        "conditions",
        "responseStatus",
        "responseBody",
        "responseContentType",
        "responseHeaders",
        "responseDelayMs",
      ],
      "Rule",
    );
    requireKeys(
      value,
      [
        "name",
        "enabled",
        "conditions",
        "responseStatus",
        "responseBody",
        "responseContentType",
        "responseHeaders",
        "responseDelayMs",
      ],
      "Rule",
    );
    if (Array.isArray(value.conditions))
      for (const condition of value.conditions) {
        if (!isRecord(condition))
          throw new Error("Every rule condition must be an object");
        onlyKeys(
          condition,
          ["source", "key", "operator", "value"],
          "Rule condition",
        );
        requireKeys(condition, ["source", "operator"], "Rule condition");
      }
  }
  const rules = input.rules.map(validateRule);
  if (rules.filter((rule) => rule.enabled).length > ruleLimits.enabledPerBin)
    throw new Error(
      `A bin may contain at most ${ruleLimits.enabledPerBin} enabled rules`,
    );
  return {
    name,
    response: { status, body, contentType, headers },
    forwarding: {
      enabled: forwardingEnabled,
      url: forwardingUrl,
      authHeaders: forwardingAuthHeaders,
      conditions: forwardingConditions,
    },
    rules,
  };
}
