import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parseEnv } from "node:util";
import { parse } from "jsonc-parser";

export const projectRoot = resolve(import.meta.dirname, "..");
export const secretNames = ["RATE_LIMIT_SALT", "OTEL_SERVER_KEY"];
const variableNames = [
  "SIGNUPS_ENABLED",
  "ADMIN_EMAILS",
  "DEMO_BIN_ID",
  "DEMO_API_KEY",
  "REPLAY_ALLOWED_ORIGINS",
  "RUM_SCRIPT_URL",
  "RUM_APP_NAME",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "DEMO_RATE_LIMIT_RPS",
  "DEMO_BODY_LIMIT_BYTES",
  "DEMO_STORAGE_LIMIT_BYTES",
];

export function deploymentSettings({
  envFile = resolve(projectRoot, ".env"),
  environment = process.env,
} = {}) {
  // The app's .env is authoritative; CI/shell values fill only absent keys.
  return {
    ...environment,
    ...(existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {}),
  };
}

export function parseWranglerConfig(text) {
  const errors = [];
  const config = parse(text, errors, { allowTrailingComma: true });
  if (
    errors.length ||
    !config ||
    typeof config !== "object" ||
    Array.isArray(config)
  )
    throw new Error("Invalid Wrangler JSONC configuration.");
  return config;
}

// A pure transformation makes deployment boundaries testable without an account.
export function productionConfig(base, settings, { dryRun = false } = {}) {
  if (!dryRun && (!settings.D1_DATABASE_ID || !settings.OAUTH_KV_ID))
    throw new Error(
      "Set D1_DATABASE_ID and OAUTH_KV_ID in src/site/.env for the intended Cloudflare resources.",
    );
  const config = structuredClone(base);
  config.name = settings.WORKER_NAME || "freebin-next";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(config.name))
    throw new Error("Invalid WORKER_NAME");
  config.keep_vars = true;
  config.workers_dev = true;
  delete config.routes;
  const domains = (settings.WORKER_DOMAINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (domains.some((domain) => !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)))
    throw new Error(
      "WORKER_DOMAINS must contain hostnames, without a scheme or path.",
    );
  if (domains.length)
    config.routes = domains.map((pattern) => ({
      pattern,
      custom_domain: true,
    }));
  config.d1_databases = [
    {
      binding: "DB",
      database_name: "freebin-db",
      database_id:
        settings.D1_DATABASE_ID || "00000000-0000-0000-0000-000000000000",
      migrations_dir: base.d1_databases[0].migrations_dir,
    },
  ];
  config.kv_namespaces = [
    { binding: "OAUTH_KV", id: settings.OAUTH_KV_ID || "0".repeat(32) },
  ];
  config.vars = {
    ...base.vars,
    SIGNUPS_ENABLED: "false",
    DEPLOYMENT_ENVIRONMENT: settings.DEPLOYMENT_ENVIRONMENT || "production",
    CLOUDFLARE_DEPLOYMENTS_URL: settings.CLOUDFLARE_ACCOUNT_ID
      ? `https://dash.cloudflare.com/${encodeURIComponent(settings.CLOUDFLARE_ACCOUNT_ID)}/workers/services/view/${encodeURIComponent(config.name)}/production/deployments`
      : "",
  };
  for (const name of variableNames)
    if (settings[name] !== undefined) config.vars[name] = settings[name];
  for (const name of secretNames) delete config.vars[name];
  delete config.configPath;
  delete config.userConfigPath;
  delete config.topLevelName;
  delete config.definedEnvironments;
  return config;
}

export function deploymentSecrets(settings) {
  if (
    !settings.RATE_LIMIT_SALT ||
    settings.RATE_LIMIT_SALT.length < 32 ||
    settings.RATE_LIMIT_SALT.startsWith("local-development")
  )
    throw new Error(
      "Production RATE_LIMIT_SALT must be a unique value of at least 32 characters.",
    );
  return Object.fromEntries(
    secretNames
      .filter((name) => settings[name])
      .map((name) => [name, settings[name]]),
  );
}

export function writeProductionConfig({
  built = true,
  dryRun = false,
  settings = deploymentSettings(),
} = {}) {
  const source = resolve(
    projectRoot,
    built ? "dist/server/wrangler.json" : "wrangler.jsonc",
  );
  const base = parseWranglerConfig(readFileSync(source, "utf8"));
  const config = productionConfig(base, settings, { dryRun });
  if (!built) {
    config.main = resolve(projectRoot, base.main);
    config.assets.directory = resolve(projectRoot, base.assets.directory);
    config.d1_databases[0].migrations_dir = resolve(
      projectRoot,
      base.d1_databases[0].migrations_dir,
    );
  }
  const path = built
    ? resolve(dirname(source), "wrangler.production.json")
    : resolve(projectRoot, ".cloudflare/production.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
  return { path, config, settings };
}
