const blockedHeaders = new Set([
  "host",
  "authorization",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "upgrade",
  "cf-ray",
  "cf-connecting-ip",
  "x-forwarded-for",
  "traceparent",
  "tracestate",
  "baggage",
]);

const sensitiveHeaderPattern =
  /authorization|(^|[-_])(auth|cookie|credential|key|secret|signature|token)($|[-_])|api[-_]?key/i;

export function isRetainableAuthHeader(name: string) {
  const normalized = name.trim().toLowerCase();
  return Boolean(normalized) && !blockedHeaders.has(normalized);
}

export function allowedOutboundOrigins(configuredOrigins = "") {
  return new Set(
    configuredOrigins
      .split(/[,\n]/)
      .map((value) => {
        try {
          const origin = new URL(value.trim());
          return origin.protocol === "https:" &&
            !origin.username &&
            !origin.password
            ? origin.origin
            : "";
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
}

export function isSafeOutboundTarget(target: URL, configuredOrigins = "") {
  return (
    target.protocol === "https:" &&
    !target.username &&
    !target.password &&
    allowedOutboundOrigins(configuredOrigins).has(target.origin)
  );
}

export function outboundHeaders(
  storedHeaders: Record<string, string>,
  retainedAuthHeaders: string[] = [],
) {
  const headers = new Headers();
  const retained = new Set(
    retainedAuthHeaders.map((name) => name.trim().toLowerCase()),
  );
  for (const [key, value] of Object.entries(storedHeaders)) {
    const normalized = key.toLowerCase();
    if (blockedHeaders.has(normalized)) continue;
    if (sensitiveHeaderPattern.test(normalized) && !retained.has(normalized))
      continue;
    headers.set(key, value);
  }
  return headers;
}

export function forwardingTarget(
  base: URL,
  capturedPath: string,
  capturedQuery: URLSearchParams,
) {
  const target = new URL(base);
  const prefix = target.pathname.endsWith("/")
    ? target.pathname.slice(0, -1)
    : target.pathname;
  const suffix = capturedPath.startsWith("/")
    ? capturedPath
    : `/${capturedPath}`;
  target.pathname = `${prefix}${suffix}` || "/";
  for (const [key, value] of capturedQuery)
    target.searchParams.append(key, value);
  return target;
}
