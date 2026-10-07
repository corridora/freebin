import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/server/domain/"))
      return nextResolve(
        new URL(`../server/domain/${specifier.slice(16)}.ts`, import.meta.url)
          .href,
        context,
      );
    if (
      specifier.startsWith("./") &&
      context.parentURL?.includes("/server/domain/") &&
      !/\.[a-z]+$/i.test(specifier)
    )
      return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const { load } = await import("../server/pages/demo.ts");

test("public inspector loads all demo captures and excludes secrets and private data", async (t) => {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((file) => file.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  sqlite.exec(`
    INSERT INTO bins (id, name, owner_token_hash, created_at, expires_at, is_public_demo, response_body, forwarding_url)
    VALUES ('demo', 'Public bin', 'private-owner-token', '2026-10-06', '9999-12-31', 1, '{"token":"private-response","ok":true}', 'https://private-destination.example');
    INSERT INTO bins (id, name, owner_token_hash, created_at, expires_at, is_public_demo)
    VALUES ('private', 'Private bin', 'unused', '2026-10-06', '9999-12-31', 0);
    INSERT INTO response_rules (id, bin_id, name, priority, conditions, response_status, response_body, response_content_type, response_headers, created_at, updated_at)
    VALUES ('rule', 'demo', 'Public rule', 1, '[{"source":"query","key":"token","operator":"equals","value":"private-condition"}]', 202, '{"secret":"private-rule-body"}', 'application/json', '{"x-api-key":"private-rule-header"}', '2026-10-06', '2026-10-06');
    INSERT INTO audit_events (id, bin_id, actor_email, actor_type, action, target_type, metadata, created_at)
    VALUES ('audit', 'demo', 'private-actor@example.test', 'account', 'bin.update', 'bin', '{"name":"private-audit"}', '2026-10-06');
  `);
  const insert = sqlite.prepare(
    `INSERT INTO requests (id, bin_id, method, path, query, headers, body, content_type, remote_address, created_at, size_bytes) VALUES (?, ?, 'POST', ?, ?, ?, ?, 'application/json', 'private-address', ?, 10)`,
  );
  for (let index = 0; index < 51; index++)
    insert.run(
      `request-${index}`,
      "demo",
      `/public/${index}`,
      '{"token":"private-query","normal":"public-query"}',
      '{"authorization":"private-auth","x-forwarded-for":"private-ip"}',
      '{"password":"private-body","message":"public message"}',
      new Date(Date.UTC(2026, 9, 6, 12, index)).toISOString(),
    );
  insert.run(
    "private-request",
    "private",
    "/private-request",
    "{}",
    "{}",
    "{}",
    "2026-10-06T12:00:00Z",
  );
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...input) {
          values = input;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...values) || null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...values) };
        },
      };
    },
  };
  const data = await load({
    platform: {
      env: {
        DB: db,
        DEMO_BIN_ID: "demo",
        DEMO_API_KEY: "public-demo-capture-key",
      },
    },
  });
  assert.equal(data.id, "demo");
  assert.equal(data.interactions.length, 51);
  assert.equal(data.interactions[0].id, "request-50");
  assert.equal(data.bin.name, "Public bin");
  assert.equal(data.rules.length, 1);
  assert.equal(data.auditEvents.length, 1);
  assert.ok(JSON.stringify(data).includes("public-query"));
  assert.ok(JSON.stringify(data).includes("public message"));
  assert.ok(!JSON.stringify(data).includes("private-"));
  assert.equal(data.demoApiKey, "public-demo-capture-key");
  const hidden = await load({
    platform: { env: { DB: db, DEMO_BIN_ID: "private" } },
  });
  assert.deepEqual(hidden.interactions, []);
  assert.deepEqual(hidden.rules, []);
  assert.deepEqual(hidden.auditEvents, []);
  assert.equal(hidden.demoApiKey, undefined);
  assert.equal((await load({})).demoApiKey, undefined);
});
