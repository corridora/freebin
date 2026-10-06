import { test, expect } from "@playwright/test";

test("bin settings views and exact-name deletion confirmation", async ({
  page,
}) => {
  const registered = await page.request.post("/api/auth/register", {
    data: {
      email: `settings-${Date.now()}@example.test`,
      password: "synthetic-test-password-123",
      termsAccepted: true,
    },
  });
  expect(registered.status()).toBe(201);
  const created = await page.request.post("/api/v1/bins", {
    data: { name: "Settings fixture", termsAccepted: true },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).bin.binId;
  await page.goto(`/bin/${id}`);
  await expect(
    page.getByRole("heading", { name: "Your endpoint is listening" }),
  ).toBeVisible();

  const toolbar = page.locator(".top-actions");
  await expect(toolbar.getByRole("button")).toHaveCount(4);
  await expect(
    toolbar.getByRole("button", { name: "Share bin" }),
  ).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: "Export bin data" }),
  ).toBeDisabled();
  await expect(
    toolbar.getByRole("button", { name: "Refresh requests" }),
  ).toBeVisible();
  const dropdown = toolbar.getByRole("button", {
    name: "Bin settings",
    exact: true,
  });
  await dropdown.click();
  await expect(
    page.locator(".settings-options").getByRole("button"),
  ).toHaveText([
    "Config",
    "Response rules 0/10",
    "Request histogram",
    "Audit history",
    "Delete",
  ]);
  await page.keyboard.press("Escape");
  await expect(dropdown).toBeFocused();
  await expect(dropdown).toHaveAttribute("aria-expanded", "false");

  await dropdown.click();
  await page.getByRole("button", { name: "Config", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Config", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".response-settings")).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export config", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    `freebin-${id}-config.v1.json`,
  );
  await expect(page.getByLabel("Import config")).toBeAttached();
  const config = await (
    await page.request.get(`/api/v1/bins/${id}/config`)
  ).json();
  config.bin.name = "Imported fixture";
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Import config").setInputFiles({
    name: "bin-config.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(config)),
  });
  await expect(page.getByRole("status")).toContainText(
    "Configuration imported",
  );

  await dropdown.click();
  await page
    .getByRole("button", { name: "Response rules 0/10", exact: true })
    .click();
  await expect(page.locator(".rule-editor")).toBeVisible();
  await expect(page.locator(".response-settings")).toHaveCount(0);
  await dropdown.click();
  await page
    .getByRole("button", { name: "Audit history", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mutation audit history" }),
  ).toBeVisible();
  await expect(page.locator(".rule-editor")).toHaveCount(0);
  await page.getByRole("button", { name: "← Requests", exact: true }).click();
  await expect(page.getByRole("searchbox")).toBeVisible();

  await dropdown.click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const panel = page.locator(".delete-bin-panel");
  await expect(panel.getByRole("button")).toHaveCount(1);
  const remove = panel.getByRole("button", { name: "Delete bin", exact: true });
  const confirmation = panel.getByRole("textbox");
  await expect(remove).toBeDisabled();
  await confirmation.fill("settings fixture");
  await expect(remove).toBeDisabled();
  await confirmation.fill("Settings fixture");
  await expect(remove).toBeDisabled();
  await confirmation.fill("Imported fixture ");
  await expect(remove).toBeDisabled();
  await confirmation.fill("Imported fixture");
  await expect(remove).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  await dropdown.click();
  await expect(page.locator(".settings-options")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/baseline/bin-settings-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  const deleted = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/bins/${id}`) &&
      response.request().method() === "DELETE",
  );
  await remove.click();
  expect((await deleted).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/$/);
  // The API checks bin access before lookup, so a removed bin returns 403.
  expect((await page.request.get(`/api/v1/bins/${id}`)).status()).toBe(403);
});
