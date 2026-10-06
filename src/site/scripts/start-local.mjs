import { spawnSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { projectRoot } from "./cloudflare-config.mjs";
const persistence = process.env.FREEBIN_DATA_DIR || "/data";
const seed = spawnSync(
  process.execPath,
  ["scripts/create-demo-bin.mjs", "--local", "--persist-to", persistence],
  { cwd: projectRoot, stdio: "inherit" },
);
if (seed.status !== 0) process.exit(seed.status || 1);
const server = spawn(
  resolve(projectRoot, "node_modules/.bin/wrangler"),
  [
    "dev",
    "--config",
    "dist/server/wrangler.json",
    "--ip",
    "0.0.0.0",
    "--port",
    "8787",
    "--persist-to",
    persistence,
  ],
  { cwd: projectRoot, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.kill(signal));
server.on("exit", (code) => {
  process.exitCode = code || 0;
});
