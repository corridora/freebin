import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { projectRoot } from "./cloudflare-config.mjs";
const server = spawn(
  resolve(projectRoot, "node_modules/.bin/wrangler"),
  [
    "dev",
    "--config",
    "dist/server/wrangler.json",
    "--persist-to",
    resolve(projectRoot, ".wrangler/state"),
    ...process.argv.slice(2),
  ],
  { cwd: projectRoot, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.kill(signal));
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.on("exit", (code) => {
  process.exitCode = code || 0;
});
