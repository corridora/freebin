import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { writeProductionConfig, projectRoot } from "./cloudflare-config.mjs";
const { path, settings } = writeProductionConfig({ built: false });
const result = spawnSync(
  resolve(projectRoot, "node_modules/.bin/wrangler"),
  ["d1", "migrations", "apply", "freebin-db", "--remote", "--config", path],
  { cwd: projectRoot, env: settings, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status || 0;
