import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  deploymentSettings,
  parseWranglerConfig,
  productionConfig,
  deploymentSecrets,
} from "../scripts/cloudflare-config.mjs";
const base = {
  vars: {
    SIGNUPS_ENABLED: "true",
    RATE_LIMIT_SALT: "local-development",
    OTEL_SERVER_KEY: "",
  },
  d1_databases: [{ migrations_dir: "../../migrations" }],
};
test("Wrangler configuration supports comments and trailing commas, rejecting malformed JSONC", () => {
  const config = parseWranglerConfig(`{
    // Preserve normal Wrangler JSONC syntax.
    "name": "preview-worker",
    "vars": { "RUM_SCRIPT_URL": "https://example.test/rum.js", },
  }`);
  assert.equal(config.name, "preview-worker");
  assert.equal(config.vars.RUM_SCRIPT_URL, "https://example.test/rum.js");
  for (const text of ['{"name": }', "null", "[]"]) {
    assert.throws(() => parseWranglerConfig(text), /Invalid Wrangler JSONC/);
  }
});
test("production binds explicit resources and never publishes secrets as vars", () => {
  const config = productionConfig(base, {
    D1_DATABASE_ID: "database",
    OAUTH_KV_ID: "namespace",
    RATE_LIMIT_SALT: "a".repeat(32),
    CLOUDFLARE_API_TOKEN: "private",
    WORKER_DOMAINS: "preview.example.com",
    RUM_APP_NAME: "preview-web",
  });
  assert.equal(config.vars.SIGNUPS_ENABLED, "false");
  assert.equal(config.vars.DEPLOYMENT_ENVIRONMENT, "production");
  assert.equal(config.vars.RUM_APP_NAME, "preview-web");
  assert.deepEqual(config.routes, [
    { pattern: "preview.example.com", custom_domain: true },
  ]);
  assert.equal(config.d1_databases[0].database_id, "database");
  assert.equal(config.kv_namespaces[0].id, "namespace");
  assert.equal(config.vars.RATE_LIMIT_SALT, undefined);
  assert.equal(config.vars.OTEL_SERVER_KEY, undefined);
  assert.equal(JSON.stringify(config).includes("private"), false);
  assert.equal(base.vars.RATE_LIMIT_SALT, "local-development");
});

test(".env wins over shell values and reaches Wrangler's child environment", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "freebin-env-test-"));
  try {
    const envFile = resolve(directory, ".env");
    writeFileSync(
      envFile,
      [
        'CLOUDFLARE_API_TOKEN="file-token"',
        'ADMIN_EMAILS="one@example.test,two@example.test"',
        "REPLAY_ALLOWED_ORIGINS=",
      ].join("\n"),
    );
    const environment = {
      ...process.env,
      CLOUDFLARE_API_TOKEN: "shell-token",
      D1_DATABASE_ID: "shell-database",
      REPLAY_ALLOWED_ORIGINS: "https://shell.example.test",
    };
    const settings = deploymentSettings({ envFile, environment });
    assert.equal(settings.CLOUDFLARE_API_TOKEN, "file-token");
    assert.equal(settings.ADMIN_EMAILS, "one@example.test,two@example.test");
    assert.equal(settings.D1_DATABASE_ID, "shell-database");
    assert.equal(settings.REPLAY_ALLOWED_ORIGINS, "");
    assert.equal(environment.CLOUDFLARE_API_TOKEN, "shell-token");
    const child = spawnSync(
      process.execPath,
      [
        "-e",
        'process.stdout.write(String(process.env.CLOUDFLARE_API_TOKEN === "file-token"))',
      ],
      { env: settings, encoding: "utf8" },
    );
    assert.equal(child.status, 0);
    assert.equal(child.stdout, "true");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("deployments without .env use shell or CI configuration", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "freebin-env-test-"));
  try {
    assert.deepEqual(
      deploymentSettings({
        envFile: resolve(directory, ".env"),
        environment: { CLOUDFLARE_ACCOUNT_ID: "ci-account" },
      }),
      { CLOUDFLARE_ACCOUNT_ID: "ci-account" },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("deployment rejects missing resource ids, malformed domains, and local salts", () => {
  assert.throws(() => productionConfig(base, {}), /D1_DATABASE_ID/);
  assert.throws(
    () =>
      productionConfig(
        base,
        { WORKER_DOMAINS: "https://example.com" },
        { dryRun: true },
      ),
    /hostnames/,
  );
  assert.throws(
    () =>
      deploymentSecrets({
        RATE_LIMIT_SALT: "local-development-only-change-before-deployment",
      }),
    /unique/,
  );
  assert.deepEqual(
    deploymentSecrets({
      RATE_LIMIT_SALT: "a".repeat(32),
      CLOUDFLARE_API_TOKEN: "never-upload",
    }),
    { RATE_LIMIT_SALT: "a".repeat(32) },
  );
});
