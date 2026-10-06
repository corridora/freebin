import { test, expect } from "@playwright/test";

test("public demo shares the bin inspector and disables every action", async ({
  page,
}) => {
  const protectedRequests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/\/api\/v1\/bins\/|\/b\/demo-public/.test(request.url()))
      protectedRequests.push(`${request.method()} ${request.url()}`);
  });
  const bin = {
    name: "freebin public demo",
    responseStatus: 202,
    responseBody: '{"accepted":true}',
    responseContentType: "application/json",
    responseHeaders: {},
    forwardingEnabled: false,
    forwardingUrl: "",
    forwardingAuthHeaders: [],
    forwardingConditions: [],
  };
  await page.route("**/api/ui/page?path=%2Fdemo", (route) =>
    route.fulfill({
      json: {
        id: "demo-public",
        bin,
        interactions: Array.from({ length: 52 }, (_, index) => ({
          id: `public-${index}`,
          method: index % 2 ? "POST" : "GET",
          path: `/sample/${index}`,
          timestamp: new Date(Date.UTC(2026, 9, 6, 12, index)).toISOString(),
          headers: { authorization: "[redacted]" },
          query: {},
          body: '{"message":"public"}',
          contentType: "application/json",
        })),
        rules: [
          {
            id: "public-rule",
            name: "Demo rule",
            enabled: true,
            conditions: [
              { source: "method", operator: "equals", value: "[redacted]" },
            ],
            responseStatus: 202,
            responseDelayMs: 0,
          },
        ],
        auditEvents: [
          {
            id: "public-audit",
            actorType: "account",
            action: "bin.update",
            targetType: "bin",
            createdAt: "2026-10-06T12:00:00Z",
            metadata: {},
          },
        ],
      },
    }),
  );
  await page.goto("/demo");
  const inspector = page.locator(
    '[data-view="Inspector"][data-read-only="true"]',
  );
  await expect(inspector).toBeVisible();
  await expect(inspector.locator(".request-list article")).toHaveCount(10);
  await expect(inspector.locator(".aside-title > strong")).toHaveText(
    "Requests 52",
  );
  for (const name of [
    "Share bin",
    "Export bin data",
    "Refresh requests",
    "Copy",
  ]) {
    await expect(
      inspector.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  }
  await expect(inspector.getByLabel("Select this page")).toBeDisabled();
  await inspector
    .getByRole("combobox", { name: "Filter by method" })
    .selectOption("POST");
  await expect(inspector.locator(".aside-title > strong")).toHaveText(
    "Requests 26",
  );
  await inspector
    .getByRole("combobox", { name: "Filter by method" })
    .selectOption("ALL");
  await inspector.locator("button.request-row").first().click();
  await expect(inspector.locator(".request-details")).toBeVisible();
  await expect(
    inspector.getByRole("button", { name: "Copy request body" }),
  ).toBeDisabled();
  for (const control of await inspector
    .locator(
      ".replay-editor button, .replay-editor input, .replay-editor textarea",
    )
    .all())
    await expect(control).toBeDisabled();
  await expect(inspector.locator(".select-request").first()).toBeDisabled();

  const settings = inspector.getByRole("button", {
    name: "Bin settings",
    exact: true,
  });
  const open = async (name: string) => {
    await settings.click();
    await inspector.getByRole("button", { name, exact: true }).click();
  };
  await open("Config");
  await expect(
    inspector
      .locator(".response-settings")
      .getByLabel("Status", { exact: true }),
  ).toHaveValue("202");
  for (const control of await inspector
    .locator(
      ".response-settings input, .response-settings select, .response-settings textarea, .response-settings button, .config-actions button, .config-actions input",
    )
    .all())
    await expect(control).toBeDisabled();
  await inspector
    .locator(".response-settings")
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await open("Response rules 1/10");
  await expect(inspector.locator(".rule-list")).toContainText("Demo rule");
  for (const control of await inspector
    .locator(".rules-panel button, .rules-panel input, .rules-panel textarea")
    .all())
    await expect(control).toBeDisabled();
  await inspector
    .locator(".rule-editor")
    .evaluate((form: HTMLFormElement) =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  await open("Request histogram");
  await expect(inspector.locator(".histogram-summary")).toContainText(
    "52 requests",
  );
  await open("Audit history");
  await expect(inspector.locator(".rule-list")).toContainText("bin.update");
  await open("Delete");
  await expect(inspector.locator(".delete-bin-panel input")).toBeDisabled();
  await expect(
    inspector.getByRole("button", { name: "Delete bin", exact: true }),
  ).toBeDisabled();
  await inspector
    .locator(".delete-bin-panel")
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await page.setViewportSize({ width: 390, height: 844 });
  await open("Request histogram");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/baseline/demo-inspector-mobile.png",
    fullPage: true,
  });
  expect(protectedRequests).toEqual([]);
  expect(errors).toEqual([]);
});
