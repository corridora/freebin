import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const commit =
  process.env.FREEBIN_GIT_COMMIT ||
  spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).stdout?.trim() ||
  "";
const result = spawnSync("docker", ["compose", "up", "--build"], {
  cwd: root,
  env: { ...process.env, FREEBIN_GIT_COMMIT: commit },
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status || 0;
