import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  writeProductionConfig,
  deploymentSecrets,
  projectRoot,
} from "./cloudflare-config.mjs";
const dryRun = process.argv.includes("--dry-run");
const { path, settings } = writeProductionConfig({ built: false });
const secrets = deploymentSecrets(settings);
if (dryRun) console.log(`Would sync: ${Object.keys(secrets).join(", ")}`);
else {
  const result = spawnSync(
    resolve(projectRoot, "node_modules/.bin/wrangler"),
    ["secret", "bulk", "--config", path],
    {
      cwd: projectRoot,
      env: settings,
      input: JSON.stringify(secrets),
      encoding: "utf8",
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status || 0;
}
