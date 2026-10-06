import { test, expect } from "@playwright/test";

test("request histogram uses all data, adapts buckets, and supports keyboard and mobile", async ({
  page,
}) => {
  const start = Date.parse("2026-10-06T12:00:00Z");
  const requestAt = (offset: number, id: string) => ({
    id,
    timestamp: new Date(start + offset).toISOString(),
    method: "POST",
    path: "/histogram-fixture",
    query: {},
    headers: {},
    body: "{}",
    contentType: "application/json",
  });
  let interactions: ReturnType<typeof requestAt>[] = [];
  await page.route(
    /\/api\/v1\/bins\/histogram-fixture(?:\/|\?|$)/,
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/stream")) {
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: ": ready\n\n",
        });
        return;
      }
      await route.fulfill({
        json: path.endsWith("/interactions")
          ? { interactions }
          : path.endsWith("/rules")
            ? { rules: [] }
            : {
                bin: {
                  name: "Histogram fixture",
                  responseStatus: 200,
                  responseBody: "{}",
                  responseContentType: "application/json",
                  responseHeaders: {},
                },
              },
      });
    },
  );
  await page.goto("/bin/histogram-fixture");
  await expect(
    page.getByRole("heading", { name: "Your endpoint is listening" }),
  ).toBeVisible();
  // The histogram always describes the bin, independent of request-list filters.
  await page.getByRole("searchbox").fill("no matching captures");
  await page.getByRole("button", { name: "Bin settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Request histogram", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Request histogram", exact: true }),
  ).toBeFocused();
  await expect(page.getByText(/No captured requests yet/)).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveCount(0);

  interactions = [
    requestAt(0, "first"),
    requestAt(20_000, "second"),
    requestAt(40_000, "third"),
    ...Array.from({ length: 99 }, (_, index) =>
      requestAt((index + 1) * 60_000, `minute-${index + 1}`),
    ),
  ];
  await page.getByRole("button", { name: "Refresh requests" }).click();
  await expect(page.locator(".histogram-summary")).toContainText(
    "102 requests",
  );
  await expect(page.locator(".aside-title > strong")).toHaveText(
    "Requests 102",
  );
  await expect(page.locator(".histogram-summary")).toContainText(
    "100 buckets · 1 minute per bucket",
  );
  const bars = page.locator(".histogram-bars button");
  await expect(bars).toHaveCount(100);
  await bars.first().focus();
  await expect(page.locator(".histogram-detail strong")).toHaveText(
    "3 requests",
  );
  await page.keyboard.press("ArrowRight");
  await expect(bars.nth(1)).toBeFocused();
  await expect(page.locator(".histogram-detail strong")).toHaveText(
    "1 request",
  );
  await page.keyboard.press("End");
  await expect(bars.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(bars.first()).toBeFocused();
  await page.screenshot({
    path: "artifacts/baseline/request-histogram-desktop.png",
    fullPage: true,
  });

  interactions = [...interactions, requestAt(120 * 60_000, "later")];
  await page.getByRole("button", { name: "Refresh requests" }).click();
  await expect(page.locator(".histogram-summary")).toContainText(
    "103 requests",
  );
  await expect(page.locator(".histogram-summary")).toContainText(
    "61 buckets · 2 minutes per bucket",
  );
  await expect(bars).toHaveCount(61);
  await page
    .locator(".histogram-bars")
    .getByRole("button", { name: /: 0 requests$/ })
    .first()
    .click();
  await expect(page.locator(".histogram-detail strong")).toHaveText(
    "0 requests",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/baseline/request-histogram-mobile.png",
    fullPage: true,
  });
});
