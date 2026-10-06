import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

// Match the application server alias and extensionless TS imports in the Node test runner.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/server/domain/")) {
      return nextResolve(
        new URL(`../server/domain/${specifier.slice(16)}.ts`, import.meta.url)
          .href,
        context,
      );
    }
    if (
      specifier.startsWith("./") &&
      context.parentURL?.includes("/server/domain/") &&
      !/\.[a-z]+$/i.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { POST: capture } =
  await import("../server/routes/b/[id]/[...path]/handler.ts");
const { GET: getBin, PATCH: patchBin } =
  await import("../server/routes/api/v1/bins/[id]/handler.ts");
const { GET: exportConfig, PUT: importConfig } =
  await import("../server/routes/api/v1/bins/[id]/config/handler.ts");
const { GET: exportBin } =
  await import("../server/routes/api/v1/bins/[id]/export/handler.ts");
const { POST: replay } =
  await import("../server/routes/api/v1/bins/[id]/interactions/[requestId]/replay/handler.ts");
const { validateForwardingConditions, matchesForwardingConditions } =
  await import("../server/domain/forwarding.ts");
const { validatePortableConfig } =
  await import("../server/domain/portable-config.ts");
const { validateRule } = await import("../server/domain/rules.ts");
const { sha256 } = await import("../server/domain/db.ts");

const token = "test-owner-key";
const origin = "https://receiver.example.test";
const conditions = [
  { source: "method", operator: "equals", value: "POST" },
  { source: "path", operator: "glob", value: "/webhooks/*" },
  {
    source: "query",
    key: "event",
    operator: "equals",
    value: "invoice.created",
  },
  { source: "header", key: "X-Event", operator: "contains", value: "invoice" },
  { source: "body", key: "data.status", operator: "equals", value: "paid" },
];

async function fixture(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  const migrations = new URL("../migrations/", import.meta.url);
  const files = readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files.filter(
    (name) => name !== "0011_conditional_forwarding.sql",
  )) {
    sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  }
  sqlite.exec(`INSERT INTO users (id, email, password_hash, password_salt, created_at)
    VALUES ('owner', 'owner@example.test', 'unused', 'unused', '2026-10-05T00:00:00Z');
    INSERT INTO bins (id, name, owner_token_hash, created_at, expires_at, user_id,
      response_status, response_body, forwarding_enabled, forwarding_url)
    VALUES ('bin', 'Test bin', 'unused', '2026-10-05T00:00:00Z', '9999-12-31', 'owner',
      202, 'accepted', 1, '${origin}/prefix');`);
  sqlite
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, token_hash, token_prefix, created_at)
    VALUES ('key', 'owner', 'Test key', ?, 'test', '2026-10-05T00:00:00Z')`,
    )
    .run(await sha256(token));
  sqlite.exec(
    readFileSync(
      new URL("0011_conditional_forwarding.sql", migrations),
      "utf8",
    ),
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
        async run() {
          return {
            meta: {
              changes: Number(sqlite.prepare(sql).run(...values).changes),
            },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const background = [];
  const platform = {
    env: { DB: db, REPLAY_ALLOWED_ORIGINS: origin },
    context: {
      waitUntil(promise) {
        background.push(promise);
      },
    },
  };
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(null, { status: 204 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  function event(path, init = {}, apiKey = token) {
    const url = new URL(path, "https://freebin.example.test");
    const request = new Request(url, {
      ...init,
      headers: { authorization: `Bearer ${apiKey}`, ...init.headers },
    });
    return {
      request,
      url,
      platform,
      params: { id: "bin", path: url.pathname.replace(/^\/b\/bin\/?/, "") },
      getClientAddress: () => "203.0.113.1",
      locals: {
        traceContext: {
          traceId: "0123456789abcdef0123456789abcdef",
          spanId: "1111111111111111",
          traceFlags: "01",
        },
      },
    };
  }
  return {
    sqlite,
    event,
    calls,
    async drain() {
      await Promise.all(background);
    },
  };
}

test("migration preserves forward-all and capture delivery boundaries", async (t) => {
  const f = await fixture(t);
  assert.equal(
    f.sqlite.prepare("SELECT forwarding_conditions FROM bins").get()
      .forwarding_conditions,
    "[]",
  );
  const response = await capture(
    f.event("/b/bin/webhooks/new?event=test", {
      method: "POST",
      body: "payload",
    }),
  );
  await f.drain();
  assert.equal(response.status, 202);
  assert.equal(await response.text(), "accepted");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, `${origin}/prefix/webhooks/new?event=test`);
  assert.equal(f.calls[0].options.headers.get("authorization"), null);
  assert.equal(f.calls[0].options.redirect, "manual");
  assert.equal(
    f.sqlite.prepare("SELECT status FROM forward_attempts").get().status,
    "delivered",
  );
});

test("automatic forwarding requires every condition while all captures remain inspectable", async (t) => {
  const f = await fixture(t);
  const update = await patchBin(
    f.event("/api/v1/bins/bin", {
      method: "PATCH",
      body: JSON.stringify({ forwardingConditions: conditions }),
    }),
  );
  assert.equal(update.status, 200);
  const headers = {
    "content-type": "application/json",
    "x-event": "invoice.created",
  };
  const body = JSON.stringify({ data: { status: "paid" } });
  for (const [path, init] of [
    [
      "/b/bin/webhooks/pay?event=invoice.created",
      { method: "POST", headers, body },
    ],
    [
      "/b/bin/webhooks/pay?event=invoice.created",
      { method: "PUT", headers, body },
    ],
    ["/b/bin/other?event=invoice.created", { method: "POST", headers, body }],
    ["/b/bin/webhooks/pay?event=other", { method: "POST", headers, body }],
    [
      "/b/bin/webhooks/pay?event=invoice.created",
      { method: "POST", headers: { "content-type": "application/json" }, body },
    ],
    [
      "/b/bin/webhooks/pay?event=invoice.created",
      { method: "POST", headers, body: "{invalid json" },
    ],
    [
      "/b/bin/webhooks/pay?event=invoice.created",
      { method: "POST", headers, body: '{"data":{"status":"unpaid"}}' },
    ],
    [
      "/b/bin/webhooks/pay?event=invoice.created",
      {
        method: "POST",
        headers: { ...headers, "content-encoding": "gzip" },
        body,
      },
    ],
  ])
    assert.equal((await capture(f.event(path, init))).status, 202);
  await f.drain();
  assert.equal(f.calls.length, 1);
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) AS count FROM requests").get().count,
    8,
  );
  assert.equal(
    f.sqlite
      .prepare(
        "SELECT COUNT(*) AS count FROM requests WHERE forward_status IS NULL",
      )
      .get().count,
    7,
  );
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) AS count FROM forward_attempts").get()
      .count,
    1,
  );
});

test("condition validation rejects malformed policies, limits, and credential headers", async (t) => {
  const f = await fixture(t);
  for (const invalid of [
    null,
    {},
    [null],
    [{ source: "unknown", operator: "exists" }],
    [{ source: "method", operator: "regex", value: ".*" }],
    [{ source: "header", operator: "equals", value: "missing key" }],
    [{ source: "body", key: 3, operator: "exists" }],
    [{ source: "method", operator: "equals", value: 3 }],
    [{ source: "path", operator: "equals", value: "é".repeat(251) }],
    [{ source: "query", key: "é".repeat(251), operator: "exists" }],
    [{ source: "path", operator: "exists", typo: true }],
    Array.from({ length: 6 }, () => conditions[0]),
    ...["Authorization", "proxy-authorization", "COOKIE"].map((key) => [
      { source: "header", key, operator: "exists" },
    ]),
  ]) {
    assert.throws(() => validateForwardingConditions(invalid));
    const response = await patchBin(
      f.event("/api/v1/bins/bin", {
        method: "PATCH",
        body: JSON.stringify({ forwardingConditions: invalid }),
      }),
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_FORWARDING_CONDITIONS");
  }
  assert.equal(
    f.sqlite.prepare("SELECT forwarding_conditions FROM bins").get()
      .forwarding_conditions,
    "[]",
  );
  assert.throws(() =>
    validateRule({ name: "Empty response rule", conditions: [] }),
  );
  assert.deepEqual(validateForwardingConditions([]), []);
});

test("PATCH preserves omitted conditions, clears an empty list, and checks forwarding permission", async (t) => {
  const f = await fixture(t);
  for (const body of [
    { forwardingConditions: conditions },
    { responseBody: "updated" },
    { forwardingAuthHeaders: ["stripe-signature"] },
  ]) {
    assert.equal(
      (
        await patchBin(
          f.event("/api/v1/bins/bin", {
            method: "PATCH",
            body: JSON.stringify(body),
          }),
        )
      ).status,
      200,
    );
  }
  const bin = (await (await getBin(f.event("/api/v1/bins/bin"))).json()).bin;
  assert.deepEqual(bin.forwardingConditions, conditions);
  f.sqlite
    .exec(`INSERT INTO users (id, email, password_hash, password_salt, created_at)
    VALUES ('viewer', 'viewer@example.test', 'unused', 'unused', '2026-10-05T00:00:00Z');
    INSERT INTO bin_collaborators (id, bin_id, user_id, invited_by_user_id, permissions, created_at, updated_at)
    VALUES ('invite', 'bin', 'viewer', 'owner', '{"bin.edit":true}', '2026-10-05', '2026-10-05');`);
  f.sqlite
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(
      await sha256("viewer-session"),
      "viewer",
      "9999-12-31T00:00:00Z",
      "2026-10-05",
    );
  const denied = await patchBin(
    f.event(
      "/api/v1/bins/bin",
      {
        method: "PATCH",
        headers: { cookie: "freebin_session=viewer-session" },
        body: JSON.stringify({ forwardingConditions: [] }),
      },
      "",
    ),
  );
  assert.equal(denied.status, 403);
  f.sqlite.exec(
    `UPDATE bin_collaborators SET permissions = '{"forwarding.edit":true}' WHERE id = 'invite'`,
  );
  const allowed = await patchBin(
    f.event(
      "/api/v1/bins/bin",
      {
        method: "PATCH",
        headers: { cookie: "freebin_session=viewer-session" },
        body: JSON.stringify({ forwardingConditions: [] }),
      },
      "",
    ),
  );
  assert.equal(allowed.status, 200);
  assert.equal(
    (
      await patchBin(
        f.event("/api/v1/bins/bin", {
          method: "PATCH",
          body: JSON.stringify({ forwardingConditions: [] }),
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    f.sqlite.prepare("SELECT forwarding_conditions FROM bins").get()
      .forwarding_conditions,
    "[]",
  );
});

test("portable configuration and full-bin exports retain conditions; legacy imports default to forward-all", async (t) => {
  const f = await fixture(t);
  await patchBin(
    f.event("/api/v1/bins/bin", {
      method: "PATCH",
      body: JSON.stringify({ forwardingConditions: conditions }),
    }),
  );
  const config = await (
    await exportConfig(f.event("/api/v1/bins/bin/config"))
  ).json();
  assert.deepEqual(config.bin.forwarding.conditions, conditions);
  assert.deepEqual(
    validatePortableConfig(config, origin).forwarding.conditions,
    conditions.map((condition) => ({
      ...condition,
      key: condition.key || undefined,
    })),
  );
  assert.equal(
    (
      await importConfig(
        f.event("/api/v1/bins/bin/config", {
          method: "PUT",
          body: JSON.stringify(config),
        }),
      )
    ).status,
    200,
  );
  const full = await (
    await exportBin(f.event("/api/v1/bins/bin/export"))
  ).json();
  assert.deepEqual(full.bin.forwardingConditions, conditions);
  delete config.bin.forwarding.conditions;
  assert.equal(
    (
      await importConfig(
        f.event("/api/v1/bins/bin/config", {
          method: "PUT",
          body: JSON.stringify(config),
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    f.sqlite.prepare("SELECT forwarding_conditions FROM bins").get()
      .forwarding_conditions,
    "[]",
  );
});

test("invalid stored policy fails closed without dropping captures", async (t) => {
  const f = await fixture(t);
  for (const stored of ["not json", "{}", "null", "[null]"]) {
    f.sqlite.prepare("UPDATE bins SET forwarding_conditions = ?").run(stored);
    assert.equal(
      (
        await capture(
          f.event("/b/bin/webhooks/test", { method: "POST", body: "{}" }),
        )
      ).status,
      202,
    );
  }
  await f.drain();
  assert.equal(f.calls.length, 0);
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) AS count FROM requests").get().count,
    4,
  );
});

test("explicit configured forwarding bypasses the automatic condition policy", async (t) => {
  const f = await fixture(t);
  await patchBin(
    f.event("/api/v1/bins/bin", {
      method: "PATCH",
      body: JSON.stringify({ forwardingConditions: conditions }),
    }),
  );
  await capture(
    f.event("/b/bin/manual", { method: "POST", body: "manual payload" }),
  );
  const { id } = f.sqlite.prepare("SELECT id FROM requests").get();
  const event = f.event(`/api/v1/bins/bin/interactions/${id}/replay`, {
    method: "POST",
    body: JSON.stringify({ operation: "forward" }),
  });
  event.params.requestId = id;
  assert.equal((await replay(event)).status, 200);
  await f.drain();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, `${origin}/prefix/manual`);
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) AS count FROM forward_attempts").get()
      .count,
    0,
  );
  assert.equal(
    f.sqlite.prepare("SELECT operation FROM replay_attempts").get().operation,
    "forward",
  );
});

test("forwarding supports form fields, exists, repeated queries, and case-insensitive header names", () => {
  const context = {
    method: "POST",
    path: "/form",
    query: { tag: ["first", "second"] },
    headers: { "x-event": "created" },
    body: "state=paid",
    contentType: "application/x-www-form-urlencoded",
  };
  assert.equal(
    matchesForwardingConditions(
      JSON.stringify([
        { source: "query", key: "tag", operator: "equals", value: "second" },
        { source: "header", key: "X-Event", operator: "exists" },
        { source: "body", key: "state", operator: "equals", value: "paid" },
      ]),
      context,
    ),
    true,
  );
  assert.equal(
    matchesForwardingConditions(
      JSON.stringify([{ source: "body", key: "missing", operator: "exists" }]),
      context,
    ),
    false,
  );
});
