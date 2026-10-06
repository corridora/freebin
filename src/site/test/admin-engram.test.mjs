import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { buildEngramReport } from "../scripts/engram-report.mjs";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/server/")) {
      const path = specifier.slice(9);
      return nextResolve(
        new URL(`../server/${path}.ts`, import.meta.url).href,
        context,
      );
    }
    if (
      specifier.startsWith("./") &&
      context.parentURL?.includes("/server/") &&
      !/\.[a-z]+$/i.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
const { load } = await import("../server/pages/admin.ts");

test("admin snapshot publishes only application nodes and in-scope relationships", () => {
  const report = buildEngramReport(
    {
      nodes: [
        {
          id: "original-node-id",
          label: "handler()",
          source_file: "src/site/server/handler.ts",
          source_location: "L12",
          community: 0,
          file_type: "code",
          privateMetadata: "must-not-publish",
        },
        {
          id: "component",
          label: "Component()",
          source_file: "src/site/components/Component.tsx",
          source_location: "L3",
          community: 1,
          file_type: "code",
        },
        {
          id: "outside",
          label: "private",
          source_file: "src/private/secret.ts",
        },
        { id: "traversal", source_file: "src/site/../private/secret.ts" },
        { id: "credentials", source_file: "src/site/.env" },
        { id: "nested-hidden", source_file: "src/site/server/.credentials" },
        { id: "types", source_file: "src/site/worker-configuration.d.ts" },
        {
          id: "recursive",
          source_file: "src/site/server/generated/engram-report.json",
        },
        {
          id: "dependency",
          source_file: "src/site/node_modules/dependency/index.js",
        },
      ],
      links: [
        {
          source: "original-node-id",
          target: "component",
          relation: "calls",
          source_file: "src/site/server/handler.ts",
        },
        {
          source: "original-node-id",
          target: "component",
          relation: "calls",
          source_file: "src/site/server/handler.ts",
        },
        {
          source: "original-node-id",
          target: "component",
          relation: "private",
          source_file: "src/private/secret.ts",
        },
        { source: "outside", target: "component", relation: "calls" },
      ],
      privateMetadata: "must-not-publish",
    },
    {
      runtime: {
        runtime: "typescript",
        version: "0.19.0",
        privateMetadata: "must-not-publish",
      },
      stale: true,
    },
  );
  assert.deepEqual(report.totals, {
    nodes: 2,
    relationships: 1,
    files: 2,
    clusters: 2,
  });
  assert.equal(report.nodes[0].cluster, 0);
  assert.equal(report.nodes[0].location, "L12");
  assert.equal(report.stale, true);
  assert.equal(report.runtime, "typescript");
  assert.equal(report.sourceDigest.length, 64);
  assert.equal(JSON.stringify(report).includes("must-not-publish"), false);
  assert.equal(JSON.stringify(report).includes("original-node-id"), false);
  assert.equal(JSON.stringify(report).includes("secret.ts"), false);
  assert.equal(JSON.stringify(report).includes(".env"), false);
});

test("missing graph and unsafe labels produce safe report states", () => {
  const empty = buildEngramReport(null);
  assert.equal(empty.available, false);
  assert.equal(empty.totals.nodes, 0);
  const safe = buildEngramReport({
    nodes: [
      {
        id: "id",
        source_file: "src/site/server/handler.ts",
        label: "<script>alert('injected')</script>",
        source_location: "/private/path",
      },
    ],
  });
  assert.equal(safe.nodes[0].label, "handler.ts");
  assert.equal(safe.nodes[0].location, null);
});

function event(
  user,
  { cookie = true, adminEmails = "admin@example.test" } = {},
) {
  const queries = [];
  const db = {
    prepare(sql) {
      queries.push(sql);
      return {
        bind() {
          return this;
        },
        async first() {
          return sql.includes("FROM sessions") ? user : { userCount: 1 };
        },
        async all() {
          return { results: [] };
        },
      };
    },
  };
  return {
    request: new Request(
      "https://freebin.example.test/api/ui/page?path=/admin",
      {
        headers: cookie ? { cookie: "freebin_session=synthetic-session" } : {},
      },
    ),
    platform: { env: { DB: db, ADMIN_EMAILS: adminEmails } },
    queries,
  };
}

test("anonymous, ordinary, expired-session and unconfigured users cannot read admin reports", async () => {
  const cases = [
    event(null, { cookie: false }),
    event({ id: "user", email: "user@example.test" }),
    event(null),
    event({ id: "admin", email: "admin@example.test" }, { adminEmails: "" }),
  ];
  for (const input of cases) {
    await assert.rejects(
      load(input),
      (error) => error.status === 303 && error.location === "/account",
    );
    assert.ok(input.queries.every((sql) => sql.includes("FROM sessions")));
  }
});

test("configured administrators receive the report with service data", async () => {
  const input = event(
    { id: "admin", email: "ADMIN@example.test" },
    { adminEmails: " other@example.test, admin@example.test " },
  );
  const data = await load(input);
  assert.equal(data.admin.id, "admin");
  assert.equal(data.engram.schemaVersion, 1);
  assert.equal(data.engram.scope, "src/site");
  assert.equal(typeof data.engram.available, "boolean");
  assert.equal(input.queries.length, 3);
});
