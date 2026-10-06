import { outboundHeaders } from "./outbound";

const encoder = new TextEncoder();
const methodPattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export type ReplayInput = {
  url?: string;
  method?: string;
  path?: string;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string>;
  body?: string | null;
  operation?: "replay" | "forward";
};

export function normalizeReplay(
  input: ReplayInput,
  captured: Record<string, unknown>,
  retainedAuthHeaders: string[] = [],
) {
  const method = String(input.method ?? captured.method ?? "POST")
    .trim()
    .toUpperCase();
  const path = String(input.path ?? captured.path ?? "/").trim();
  const query =
    input.query ??
    (JSON.parse(String(captured.query || "{}")) as Record<
      string,
      string | string[]
    >);
  const sourceHeaders =
    input.headers ??
    (JSON.parse(String(captured.headers || "{}")) as Record<string, string>);
  const body =
    input.body === undefined
      ? captured.body === null
        ? null
        : String(captured.body ?? "")
      : input.body;
  if (!methodPattern.test(method) || method.length > 32)
    throw new Error("Enter a valid HTTP method");
  if (!path.startsWith("/") || encoder.encode(path).byteLength > 2_000)
    throw new Error("Replay path must start with / and be at most 2,000 bytes");
  if (!query || typeof query !== "object" || Array.isArray(query))
    throw new Error("Replay query must be an object");
  for (const [key, value] of Object.entries(query)) {
    if (
      encoder.encode(key).byteLength > 500 ||
      (!Array.isArray(value) && typeof value !== "string") ||
      (Array.isArray(value) && value.some((item) => typeof item !== "string"))
    )
      throw new Error(
        "Replay query keys and values must be strings no longer than 500 bytes",
      );
    const values = Array.isArray(value) ? value : [value];
    if (values.some((value) => encoder.encode(value).byteLength > 500))
      throw new Error(
        "Replay query keys and values must be strings no longer than 500 bytes",
      );
  }
  if (
    !sourceHeaders ||
    typeof sourceHeaders !== "object" ||
    Array.isArray(sourceHeaders) ||
    Object.keys(sourceHeaders).length > 50
  )
    throw new Error("Replay headers must be an object with at most 50 entries");
  const safeHeaders = outboundHeaders(
    Object.fromEntries(
      Object.entries(sourceHeaders).map(([key, value]) => [key, String(value)]),
    ),
    retainedAuthHeaders,
  );
  if (
    encoder.encode(JSON.stringify(Object.fromEntries(safeHeaders))).byteLength >
    16 * 1024
  )
    throw new Error("Replay headers exceed 16 KB");
  if (body !== null && encoder.encode(String(body)).byteLength > 1024 * 1024)
    throw new Error("Replay body exceeds 1 MB");
  return {
    method,
    path,
    query,
    headers: Object.fromEntries(safeHeaders),
    body: body === null ? null : String(body),
  };
}

export function applyReplayPath(
  target: URL,
  path: string,
  query: Record<string, string | string[]>,
) {
  target.pathname = path;
  target.search = "";
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value])
      target.searchParams.append(key, item);
  }
  return target;
}
