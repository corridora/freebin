import { test, expect } from "@playwright/test";

test("public demo shares the bin inspector and disables every inspector action", async ({
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

test("demo sample methods capture example data, refresh history, and show failures", async ({
  page,
}) => {
  const captures: { method: string; path: string; body: string | null }[] = [];
  const interactions: any[] = [];
  let outcome = "captured";
  let releaseFirst: () => void = () => {};
  const firstCapture = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  await page.route("**/api/ui/page?path=%2Fdemo", (route) =>
    route.fulfill({
      json: {
        id: "demo-public",
        demoApiKey: "public-sample-key",
        bin: {
          name: "Public demo",
          responseStatus: 200,
          responseBody: "OK",
          responseHeaders: {},
          forwardingAuthHeaders: [],
          forwardingConditions: [],
        },
        interactions,
        rules: [],
        auditEvents: [],
      },
    }),
  );
  await page.route("**/b/demo-public/sample/*", async (route) => {
    const request = route.request();
    expect(request.headers().authorization).toBe("Bearer public-sample-key");
    if (!captures.length) await firstCapture;
    if (outcome === "network") {
      await route.abort();
      return;
    }
    if (outcome === "limited") {
      await route.fulfill({ status: 429, body: "Capture rate limit exceeded" });
      return;
    }
    const method = request.method();
    const path = new URL(request.url()).pathname.replace("/b/demo-public", "");
    captures.push({ method, path, body: request.postData() });
    interactions.unshift({
      id: `sample-${captures.length}`,
      method,
      path,
      timestamp: new Date().toISOString(),
      headers: {},
      query: {},
      body: request.postData(),
    });
    await route.fulfill({
      status: method === "DELETE" ? 404 : 200,
      headers: { "x-freebin-captured": "true" },
      body: "Sample response",
    });
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/demo");
  const samples = page.getByRole("region", { name: "Send a sample request." });
  await expect(samples).toBeVisible();
  await expect(samples.getByRole("button")).toHaveText([
    "POST",
    "GET",
    "DELETE",
    "PATCH",
    "OPTIONS",
  ]);
  await page.evaluate(() => document.fonts.ready);
  const geometry = () =>
    samples.evaluate((element) => {
      const rect = (node: Element) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        section: rect(element),
        buttons: [...element.querySelectorAll("button")].map(rect),
      };
    });
  const beforeClick = await geometry();
  await samples
    .getByRole("button", { name: "Send POST sample request" })
    .click();
  await expect(
    samples.getByRole("button", { name: "Send POST sample request" }),
  ).toHaveText("POST");
  await expect(samples.getByRole("status")).toHaveText(
    "Sending POST sample request…",
  );
  expect(await geometry()).toEqual(beforeClick);
  for (const button of await samples.getByRole("button").all())
    await expect(button).toBeDisabled();
  releaseFirst();
  await expect(samples.getByRole("status")).toContainText(
    "POST captured — 200",
  );
  await expect(page.locator(".request-list")).toContainText("/sample/post");
  await expect(samples.getByRole("button").first()).toBeEnabled();
  expect(await geometry()).toEqual(beforeClick);
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const method of ["GET", "DELETE", "PATCH", "OPTIONS"]) {
    const beforeNextClick = await geometry();
    await samples
      .getByRole("button", { name: `Send ${method} sample request` })
      .click();
    await expect(samples.getByRole("status")).toContainText(
      `${method} captured`,
    );
    await expect(page.locator(".request-list")).toContainText(
      `/sample/${method.toLowerCase()}`,
    );
    await expect(samples.getByRole("button").first()).toBeEnabled();
    expect(await geometry()).toEqual(beforeNextClick);
  }
  expect(captures.map((capture) => capture.method)).toEqual([
    "POST",
    "GET",
    "DELETE",
    "PATCH",
    "OPTIONS",
  ]);
  for (const capture of captures) {
    if (["POST", "PATCH"].includes(capture.method))
      expect(JSON.parse(capture.body!)).toEqual({
        method: capture.method,
        message: `Hello from the ${capture.method} demo`,
      });
    else expect(capture.body).toBeNull();
  }
  outcome = "limited";
  await samples
    .getByRole("button", { name: "Send GET sample request" })
    .click();
  await expect(samples.getByRole("status")).toContainText(
    "GET failed — 429 Capture rate limit exceeded",
  );
  outcome = "network";
  await samples
    .getByRole("button", { name: "Send GET sample request" })
    .click();
  await expect(samples.getByRole("status")).toContainText(
    "could not reach the demo endpoint",
  );
  for (const button of await samples.getByRole("button").all())
    await expect(button).toBeEnabled();
  await expect(
    page
      .locator('[data-view="Inspector"]')
      .getByRole("button", { name: "Share bin", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "artifacts/baseline/demo-samples-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/baseline/demo-samples-mobile.png",
    fullPage: true,
  });
});
