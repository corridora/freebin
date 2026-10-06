import { test, expect } from "@playwright/test";

test("Engram reports require an admin session and support inspection and download", async ({
  browser,
}) => {
  const admin = await browser.newContext();
  const ordinary = await browser.newContext();
  const anonymous = await browser.newContext();
  const password = "synthetic-admin-test-password-123";
  try {
    for (const [context, email] of [
      [admin, "admin-e2e@freebin.invalid"],
      [ordinary, `ordinary-admin-test-${Date.now()}@freebin.invalid`],
    ] as const) {
      const registration = await context.request.post("/api/auth/register", {
        data: { email, password, termsAccepted: true },
      });
      if (registration.status() === 409) {
        const login = await context.request.post("/api/auth/login", {
          data: { email, password },
        });
        expect(login.ok()).toBeTruthy();
      } else expect(registration.status(), await registration.text()).toBe(201);
    }
    for (const context of [ordinary, anonymous]) {
      const denied = await context.request.get("/api/ui/page?path=%2Fadmin");
      expect(await denied.json()).toEqual({ redirect: "/account" });
      expect(denied.headers()["cache-control"]).toContain("no-store");
      const page = await context.newPage();
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/account$/);
      await expect(
        page.getByRole("heading", { name: "Engram report" }),
      ).toHaveCount(0);
      await page.close();
    }

    const allowed = await admin.request.get("/api/ui/page?path=%2Fadmin");
    expect(allowed.headers()["cache-control"]).toContain("no-store");
    const payload = await allowed.json();
    expect(payload.engram.scope).toBe("src/site");
    expect(payload.engram.schemaVersion).toBe(1);
    const page = await admin.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Engram report" }),
    ).toBeVisible();
    const report = page.locator(".engram-report");
    if (process.env.ENGRAM_REQUIRED === "true") {
      expect(payload.engram.available).toBe(true);
      expect(payload.engram.nodes.length).toBeGreaterThan(0);
    }
    if (payload.engram.available && payload.engram.nodes.length) {
      const graph = page.getByRole("group", {
        name: "Engram relationship graph",
        exact: true,
      });
      const clusters = page.getByRole("group", {
        name: "Engram cluster graph",
        exact: true,
      });
      await expect(graph).toBeVisible();
      await expect(clusters).toBeVisible();
      const graphNode = graph.getByRole("button").first();
      await graphNode.focus();
      await page.keyboard.press("Enter");
      await expect(graph.getByRole("button", { pressed: true })).toHaveCount(1);
      await expect(
        page
          .getByRole("complementary", { name: "Selected node relationships" })
          .getByRole("heading"),
      ).toBeVisible();
      if (payload.engram.clusters.length) {
        await clusters.getByRole("button").first().click();
        await expect(
          page.getByRole("combobox", { name: "Cluster", exact: true }),
        ).not.toHaveValue("");
        await page
          .getByRole("combobox", { name: "Cluster", exact: true })
          .selectOption("");
      }
      await expect(
        page.getByRole("table", { name: "Engram nodes" }),
      ).toBeVisible();
      await page
        .getByLabel("Search nodes")
        .fill("no-node-will-match-this-query");
      await expect(
        page.getByText("No nodes match these filters."),
      ).toBeVisible();
      await expect(graph).toHaveCount(0);
      await page.getByLabel("Search nodes").fill("");
      const first = payload.engram.nodes[0];
      await page
        .getByRole("table", { name: "Engram nodes" })
        .getByRole("button")
        .first()
        .click();
      await expect(
        page
          .getByRole("complementary", { name: "Selected node relationships" })
          .getByRole("heading"),
      ).toHaveText(first.label);
      const cluster = payload.engram.clusters[0];
      if (cluster) {
        await page
          .getByRole("combobox", { name: "Cluster", exact: true })
          .selectOption(String(cluster.id));
        const clusterCells = await report
          .locator("tbody tr td:last-child")
          .allTextContents();
        expect(
          clusterCells.every((value) => value === String(cluster.id)),
        ).toBeTruthy();
        await page
          .getByRole("combobox", { name: "Cluster", exact: true })
          .selectOption("");
      }
      if (payload.engram.nodes.length > 30) {
        await report.getByRole("button", { name: "Next", exact: true }).click();
        await expect(report.getByText(/Page 2 of/)).toBeVisible();
        await report
          .getByRole("button", { name: "Previous", exact: true })
          .click();
      }
      const downloadPromise = page.waitForEvent("download");
      await report.getByRole("button", { name: "Download JSON" }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("freebin-engram-report.json");
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(chunk);
      expect(JSON.parse(Buffer.concat(chunks).toString()).sourceDigest).toBe(
        payload.engram.sourceDigest,
      );
    } else {
      await expect(
        report.getByText("No Engram graph was available for this build."),
      ).toBeVisible();
    }
    await report.screenshot({ path: "artifacts/admin/engram-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await report.screenshot({ path: "artifacts/admin/engram-mobile.png" });
    await page
      .locator("header.site-header")
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/account$/);
    await expect(
      page.getByRole("heading", { name: "Engram report" }),
    ).toHaveCount(0);
    const revoked = await admin.request.get("/api/ui/page?path=%2Fadmin");
    expect(await revoked.json()).toEqual({ redirect: "/account" });
    expect(errors).toEqual([]);
  } finally {
    // Remove the synthetic fixtures, including the admin after its logout check.
    await Promise.allSettled([
      (async () => {
        await admin.request.post("/api/auth/login", {
          data: { email: "admin-e2e@freebin.invalid", password },
        });
        await admin.request.delete("/api/me");
      })(),
      ordinary.request.delete("/api/me"),
    ]);
    await Promise.allSettled([
      admin.close(),
      ordinary.close(),
      anonymous.close(),
    ]);
  }
});
