import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const { POST, GET, DELETE } =
  await import("../server/routes/api/account/token/handler.ts");
const { createSession, getApiUser } = await import("../server/domain/auth.ts");
const { sha256 } = await import("../server/domain/db.ts");

test("fb_UUID API keys authenticate, expose only metadata, and can be revoked without invalidating legacy keys", async (t) => {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec(
    readFileSync(
      new URL("../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  sqlite.exec(`INSERT INTO users (id, email, password_hash, password_salt, created_at)
    VALUES ('owner', 'owner@example.test', 'unused', 'unused', '2026-10-06');`);
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
  };
  const session = await createSession(db, "owner");
  const event = (method, body) => ({
    platform: { env: { DB: db } },
    request: new Request("https://freebin.example.test/api/account/token", {
      method,
      headers: { cookie: `freebin_session=${session.token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  });
  const issued = [];
  for (const name of ["First key", "Second key"]) {
    const response = await POST(event("POST", { name }));
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.match(
      result.token,
      /^fb_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.equal(result.key.prefix, result.token.slice(0, 8));
    assert.equal((await getApiUser(db, result.token)).id, "owner");
    assert.equal(
      sqlite
        .prepare("SELECT token_hash FROM api_keys WHERE id = ?")
        .get(result.key.id).token_hash,
      await sha256(result.token),
    );
    issued.push(result);
  }
  assert.notEqual(issued[0].token, issued[1].token);
  const listed = await (await GET(event("GET"))).json();
  assert.equal(listed.keys.length, 2);
  for (const { token } of issued)
    assert.ok(!JSON.stringify(listed).includes(token));
  assert.ok(listed.keys.every((key) => !key.token && !key.token_hash));
  assert.equal(await getApiUser(db, `${issued[0].token}x`), null);

  const legacyToken = "legacy-key-created-before-the-fb-prefix";
  sqlite
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, token_hash, token_prefix, created_at)
    VALUES ('legacy', 'owner', 'Legacy key', ?, 'legacy-k', '2026-10-06')`,
    )
    .run(await sha256(legacyToken));
  assert.equal((await getApiUser(db, legacyToken)).id, "owner");
  assert.equal(
    (await DELETE(event("DELETE", { id: issued[0].key.id }))).status,
    200,
  );
  assert.equal(await getApiUser(db, issued[0].token), null);
  assert.equal((await getApiUser(db, issued[1].token)).id, "owner");
  assert.equal((await getApiUser(db, legacyToken)).id, "owner");
});
