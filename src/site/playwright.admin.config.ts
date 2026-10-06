import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "admin-report.spec.ts",
  workers: 1,
  timeout: 30000,
  outputDir: "test-results/admin",
  use: { baseURL: "http://localhost:8790", trace: "retain-on-failure" },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/admin", open: "never" }],
  ],
  webServer: {
    command:
      "npm run start -- --port 8790 --var ADMIN_EMAILS:admin-e2e@freebin.invalid --var SIGNUPS_ENABLED:true",
    url: "http://localhost:8790/api/config",
    reuseExistingServer: false,
    env: { CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" },
    timeout: 60000,
  },
});
