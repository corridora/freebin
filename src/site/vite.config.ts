import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { execFileSync } from "node:child_process";

function gitCommit() {
  let commit = process.env.FREEBIN_GIT_COMMIT || "";
  if (!commit) {
    try {
      commit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: import.meta.dirname,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      commit = process.env.GITHUB_SHA || "";
    }
  }
  return /^[0-9a-f]{40}$/i.test(commit) ? commit.toLowerCase() : "";
}

export default defineConfig({
  define: {
    "process.env.FREEBIN_GIT_COMMIT": JSON.stringify(gitCommit()),
  },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
