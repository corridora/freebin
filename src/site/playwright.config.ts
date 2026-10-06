import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testIgnore: "admin-report.spec.ts",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: process.env.FREEBIN_TEST_URL || "http://localhost:8788",
    trace: "retain-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: process.env.FREEBIN_TEST_URL
    ? undefined
    : {
        command: "npm run start -- --port 8788",
        url: "http://localhost:8788/api/config",
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      },
});
