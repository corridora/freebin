import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeProductionConfig } from "./cloudflare-config.mjs";

const remote = process.argv.includes("--remote");
const local = process.argv.includes("--local");
const persistIndex = process.argv.indexOf("--persist-to");
const persistPath = persistIndex >= 0 ? process.argv[persistIndex + 1] : "";
if (remote && local) {
  console.error("Choose either --local or --remote.");
  process.exit(1);
}
if (persistIndex >= 0 && !persistPath) {
  console.error("--persist-to requires a directory.");
  process.exit(1);
}
const persistenceArgs = persistPath ? ["--persist-to", persistPath] : [];

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deployment = remote ? writeProductionConfig({ built: false }) : null;
const settings = deployment?.settings || process.env;
const configArgs = deployment ? ["--config", deployment.path] : [];
const wrangler = resolve(projectRoot, "node_modules", ".bin", "wrangler");
const binId = remote ? settings.DEMO_BIN_ID || "demo-public" : "demo-public";
const binName = "freebin public demo";
const demoUserId = "demo-public-user";
const now = Date.now();
const configuredStorageLimit = Number(settings.DEMO_STORAGE_LIMIT_BYTES);
const demoStorageLimitBytes =
  Number.isSafeInteger(configuredStorageLimit) && configuredStorageLimit > 0
    ? configuredStorageLimit
    : 1024 * 1024;

const samples = [
  {
    id: "demo_request_health",
    method: "GET",
    path: "/health",
    query: {},
    headers: { accept: "application/json", "user-agent": "freebin-demo/1.0" },
    body: null,
    contentType: null,
    remoteAddress: "203.0.113.10",
    timestamp: new Date(now - 120_000).toISOString(),
  },
  {
    id: "demo_request_order",
    method: "POST",
    path: "/orders",
    query: { source: "demo" },
    headers: {
      "content-type": "application/json",
      "user-agent": "freebin-demo/1.0",
    },
    body: JSON.stringify({ orderId: "ord_demo_42", status: "created" }),
    contentType: "application/json",
    remoteAddress: "198.51.100.24",
    timestamp: new Date(now - 60_000).toISOString(),
  },
  {
    id: "demo_request_delivery",
    method: "PATCH",
    path: "/deliveries/demo",
    query: {},
    headers: {
      "content-type": "application/json",
      "user-agent": "freebin-demo/1.0",
    },
    body: JSON.stringify({ delivered: true }),
    contentType: "application/json",
    remoteAddress: "192.0.2.18",
    timestamp: new Date(now).toISOString(),
  },
];

const quote = (value) =>
  value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const bytes = (...values) =>
  values.reduce(
    (total, value) => total + new TextEncoder().encode(value || "").byteLength,
    0,
  );

const statements = [
  `INSERT INTO users (
    id, email, password_hash, password_salt, storage_limit_bytes, created_at
  ) VALUES (
    ${quote(demoUserId)}, 'demo@freebin.invalid', 'login-disabled', 'login-disabled',
    ${demoStorageLimitBytes}, ${quote(new Date(now).toISOString())}
  ) ON CONFLICT(id) DO UPDATE SET storage_limit_bytes = ${demoStorageLimitBytes}`,
  `DELETE FROM api_keys WHERE id = 'demo-public-key'`,
  `INSERT INTO bins (
    id, name, owner_token_hash, created_at, expires_at, user_id, is_public_demo
  ) VALUES (
    ${quote(binId)}, ${quote(binName)}, ${quote("demo-capture-disabled")},
    ${quote(new Date(now).toISOString())}, '9999-12-31T23:59:59.999Z',
    ${quote(demoUserId)}, 1
  ) ON CONFLICT(id) DO UPDATE SET
    name = excluded.name, user_id = excluded.user_id, is_public_demo = 1`,
  ...samples.map((sample) => {
    const query = JSON.stringify(sample.query);
    const headers = JSON.stringify(sample.headers);
    const size = bytes(
      sample.method,
      sample.path,
      query,
      headers,
      sample.body,
      sample.contentType,
      sample.remoteAddress,
    );
    return `INSERT INTO requests (
      id, bin_id, method, path, query, headers, body, content_type,
      remote_address, created_at, size_bytes
    ) VALUES (
      ${quote(sample.id)}, ${quote(binId)}, ${quote(sample.method)}, ${quote(sample.path)},
      ${quote(query)}, ${quote(headers)}, ${quote(sample.body)}, ${quote(sample.contentType)},
      ${quote(sample.remoteAddress)}, ${quote(sample.timestamp)}, ${size}
    ) ON CONFLICT(id) DO UPDATE SET
      bin_id = excluded.bin_id,
      method = excluded.method, path = excluded.path, query = excluded.query,
      headers = excluded.headers, body = excluded.body,
      content_type = excluded.content_type, remote_address = excluded.remote_address,
      created_at = excluded.created_at, size_bytes = excluded.size_bytes`;
  }),
];

const result = spawnSync(
  wrangler,
  [
    "d1",
    "migrations",
    "apply",
    "freebin-db",
    remote ? "--remote" : "--local",
    ...configArgs,
    ...persistenceArgs,
  ],
  { cwd: projectRoot, env: settings, stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

const seedResult = spawnSync(
  wrangler,
  [
    "d1",
    "execute",
    "freebin-db",
    remote ? "--remote" : "--local",
    ...configArgs,
    ...persistenceArgs,
    "--command",
    `${statements.join(";\n")};`,
    "--yes",
  ],
  { cwd: projectRoot, env: settings, stdio: "inherit" },
);

if (seedResult.error) {
  console.error(seedResult.error.message);
  process.exit(1);
}
if (seedResult.status !== 0) process.exit(seedResult.status ?? 1);
console.log(`Demo bin ready: ${binId} (${remote ? "remote" : "local"})`);
