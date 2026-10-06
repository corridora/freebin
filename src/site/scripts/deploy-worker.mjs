import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  writeProductionConfig,
  deploymentSecrets,
  projectRoot,
} from "./cloudflare-config.mjs";
import { sendDeployEvent } from "./deploy-event.mjs";

const dryRun = process.argv.includes("--dry-run");
const { path, config, settings } = writeProductionConfig({ dryRun });
const secrets = dryRun ? {} : deploymentSecrets(settings);
const directory = mkdtempSync(resolve(tmpdir(), "freebin-deploy-"));
try {
  const args = ["deploy", "--config", path];
  if (dryRun) args.push("--dry-run");
  else {
    const file = resolve(directory, "secrets.json");
    writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
    args.push("--secrets-file", file);
  }
  const result = spawnSync(
    resolve(projectRoot, "node_modules/.bin/wrangler"),
    args,
    { cwd: projectRoot, env: settings, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
  else if (
    !dryRun &&
    settings.OTEL_EXPORTER_OTLP_ENDPOINT &&
    settings.OTEL_SERVER_KEY
  ) {
    const version =
      settings.GITHUB_SHA ||
      settings.FREEBIN_RELEASE ||
      new Date().toISOString();
    try {
      await sendDeployEvent({
        endpoint: settings.OTEL_EXPORTER_OTLP_ENDPOINT,
        key: settings.OTEL_SERVER_KEY,
        serviceName: "freebin",
        version,
        environment: config.vars.DEPLOYMENT_ENVIRONMENT,
        accountId: settings.CLOUDFLARE_ACCOUNT_ID || "",
        targets: config.routes?.map((route) => route.pattern) || [config.name],
      });
    } catch {
      console.warn(
        "Worker deployed; deployment telemetry could not be delivered.",
      );
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
