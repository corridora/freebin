import { test, expect, type BrowserContext } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

test.describe.configure({ mode: "serial" });

let owner: BrowserContext, viewer: BrowserContext;
let binId: string, apiKey: string, viewerEmail: string, ownerEmail: string;
const password = "synthetic-test-password-123";
const stamp = Date.now().toString(36);
test.beforeAll(async ({ browser }) => {
  owner = await browser.newContext();
  viewer = await browser.newContext();
  ownerEmail = `owner-${stamp}@example.test`;
  viewerEmail = `viewer-${stamp}@example.test`;
  for (const [context, email] of [
    [owner, ownerEmail],
    [viewer, viewerEmail],
  ] as const) {
    const response = await context.request.post("/api/auth/register", {
      data: { email, password, termsAccepted: true },
    });
    expect(response.status(), await response.text()).toBe(201);
  }
  const bin = await owner.request.post("/api/v1/bins", {
    data: { name: "Parity webhook", termsAccepted: true },
  });
  expect(bin.status()).toBe(201);
  binId = (await bin.json()).bin.binId;
  const key = await owner.request.post("/api/account/token", {
    data: { name: "Parity fixture" },
  });
  expect(key.ok()).toBeTruthy();
  apiKey = (await key.json()).token;
  expect(apiKey).toMatch(
    /^fb_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});
test.afterAll(async () => {
  await owner?.close();
  await viewer?.close();
});

test("public styling, SPA navigation, and mobile layout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your endpoint is waiting." }),
  ).toBeVisible();
  const styles = await page.evaluate(() => ({
    background: getComputedStyle(document.documentElement).backgroundColor,
    color: getComputedStyle(document.documentElement).color,
  }));
  expect(styles).toEqual({
    background: "rgb(244, 240, 231)",
    color: "rgb(23, 35, 29)",
  });
  await page.evaluate(() => {
    (window as any).spaMarker = "preserved";
  });
  await page.getByRole("link", { name: "API docs", exact: true }).click();
  await expect(page.locator('[data-view="Docs"]')).toBeVisible();
  expect(await page.evaluate(() => (window as any).spaMarker)).toBe(
    "preserved",
  );
  await page.goto("/");
  await page.screenshot({
    path: "artifacts/baseline/home-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/baseline/home-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test("account controls, bin sharing, and session state", async () => {
  const page = await owner.newPage();
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: ownerEmail })).toBeVisible();
  await expect(page.getByText("Parity fixture", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByPlaceholder("person@example.com").fill(viewerEmail);
  await page.getByRole("button", { name: "Viewer", exact: true }).click();
  await page
    .getByRole("button", { name: "Invite or update", exact: true })
    .click();
  await expect(
    page.locator(".share-panel").getByText(viewerEmail, { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/baseline/account.png",
    fullPage: true,
  });
  const viewerPage = await viewer.newPage();
  await viewerPage.goto("/account");
  await expect(
    viewerPage.getByRole("heading", { name: "Bins shared with you" }),
  ).toBeVisible();
  const forbidden = await viewer.request.patch(`/api/v1/bins/${binId}`, {
    data: { name: "Unauthorized edit" },
  });
  expect(forbidden.status()).toBe(403);
  await viewerPage.close();
  await page.close();
});

test("capture, live inspection, filtering, history, gzip, and export", async () => {
  const page = await owner.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/bin/${binId}`);
  await expect(
    page.getByRole("heading", { name: "Your endpoint is listening" }),
  ).toBeVisible();
  for (const [path, body] of [
    ["invoice", { event: "invoice.created", amount: 4200 }],
    ["payment", { event: "payment.created", amount: 800 }],
  ] as const) {
    const response = await owner.request.post(`/b/${binId}/${path}`, {
      headers: { authorization: `Bearer ${apiKey}` },
      data: body,
    });
    expect(response.ok()).toBeTruthy();
  }
  await expect(page.locator(".request-list")).toContainText("/invoice", {
    timeout: 15000,
  });
  const search = page.getByPlaceholder(/Search/).first();
  await search.fill("invoice.created");
  await expect(page).toHaveURL(/q=invoice.created/);
  await expect(page.locator(".request-list")).not.toContainText("/payment");
  await page.reload();
  await expect(search).toHaveValue("invoice.created");
  await search.fill("");
  await expect(page.locator(".request-list")).toContainText("/payment");
  const gzip = await owner.request.post(`/b/${binId}/gzip`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "content-encoding": "gzip",
    },
    data: gzipSync(JSON.stringify({ message: "compressed fixture" })),
  });
  expect(gzip.ok()).toBeTruthy();
  await expect(page.locator(".request-list")).toContainText("/gzip", {
    timeout: 15000,
  });
  await page
    .locator(".request-list article")
    .filter({ hasText: "/gzip" })
    .locator("button.request-row")
    .click();
  await page
    .getByRole("button", { name: "Show decompressed", exact: true })
    .click();
  await expect(page.locator('[data-view="RequestBody"] pre')).toContainText(
    "compressed fixture",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export bin data", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await page.screenshot({
    path: "artifacts/baseline/inspector.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await page.close();
});

test("response rules, portable config, and replay restrictions", async () => {
  const base = `/api/v1/bins/${binId}`;
  const rule = await owner.request.post(`${base}/rules`, {
    data: {
      name: "Accepted invoice",
      enabled: true,
      conditions: [{ source: "path", operator: "equals", value: "/rule" }],
      responseStatus: 202,
      responseBody: "accepted",
      responseContentType: "text/plain",
      responseHeaders: {},
      responseDelayMs: 0,
    },
  });
  expect(rule.status(), await rule.text()).toBe(201);
  const response = await owner.request.post(`/b/${binId}/rule`, {
    headers: { authorization: `Bearer ${apiKey}` },
    data: "fixture",
  });
  expect(response.status()).toBe(202);
  expect(await response.text()).toBe("accepted");
  const config = await owner.request.get(`${base}/config`);
  expect(config.ok()).toBeTruthy();
  expect(
    (
      await owner.request.put(`${base}/config`, { data: await config.json() })
    ).ok(),
  ).toBeTruthy();
  const list = await owner.request.get(`${base}/interactions?limit=all`);
  const first = (await list.json()).interactions[0];
  const replay = await owner.request.post(
    `${base}/interactions/${first.id}/replay`,
    { data: { url: "http://127.0.0.1/internal" } },
  );
  expect(replay.status()).toBe(400);
  const audit = await owner.request.get(`${base}/audit`);
  expect((await audit.json()).events.length).toBeGreaterThan(0);
});

test("revocable public shares omit source addresses", async ({ page }) => {
  const base = `/api/v1/bins/${binId}`;
  const response = await owner.request.post(`${base}/share`, {
    data: { public: true },
  });
  expect(response.ok()).toBeTruthy();
  const link = (await response.json()).shareUrl;
  await page.goto(link);
  await expect(page.locator('[data-view="SharedBin"]')).toBeVisible();
  const data = await page.request.get(
    "/api/ui/page?path=" + encodeURIComponent(new URL(link).pathname),
  );
  expect(JSON.stringify(await data.json())).not.toContain("remoteAddress");
  expect(data.headers()["cache-control"]).toBe("private, no-store");
  await owner.request.post(`${base}/share`, { data: { public: false } });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Page unavailable" }),
  ).toBeVisible();
  const list = await owner.request.get(`${base}/interactions?limit=all`);
  const requestId = (await list.json()).interactions[0].id;
  const shared = await owner.request.post(
    `${base}/interactions/${requestId}/share`,
    { data: { public: true } },
  );
  expect(shared.ok()).toBeTruthy();
  const requestLink = (await shared.json()).shareUrl;
  await page.goto(requestLink);
  await expect(page.locator('[data-view="SharedRequest"]')).toBeVisible();
  const requestData = await page.request.get(
    "/api/ui/page?path=" + encodeURIComponent(new URL(requestLink).pathname),
  );
  expect(JSON.stringify(await requestData.json())).not.toContain(
    "remoteAddress",
  );
  await owner.request.post(`${base}/interactions/${requestId}/share`, {
    data: { public: false },
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Page unavailable" }),
  ).toBeVisible();
});

test("demo traffic is redacted and anonymous capture is denied", async ({
  request,
  page,
}) => {
  const forbidden = await request.post(`/b/${binId}/anonymous`, {
    data: "fixture",
  });
  expect(forbidden.status()).toBe(401);
  const demoSettings = await request.get("/api/ui/page?path=%2F");
  const { demoBinId, demoApiKey } = await demoSettings.json();
  const demo = await request.post(`/b/${demoBinId}/redaction`, {
    headers: { authorization: `Bearer ${demoApiKey}` },
    data: { token: "sensitive-fixture", message: "public fixture" },
  });
  expect(demo.ok()).toBeTruthy();
  await page.goto("/demo");
  await expect(page.locator(".request-list")).toContainText("/redaction");
  const data = await request.get("/api/ui/page?path=%2Fdemo");
  expect(JSON.stringify(await data.json())).not.toContain("sensitive-fixture");
});

test("OAuth PKCE consent and MCP authentication", async ({ baseURL }) => {
  const resource = new URL("/mcp", baseURL).href;
  const client = await owner.request.post("/oauth/register", {
    data: {
      client_name: "Parity MCP client",
      redirect_uris: ["http://127.0.0.1:9999/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
  });
  expect(client.ok(), await client.text()).toBeTruthy();
  const { client_id } = await client.json();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({
    client_id,
    redirect_uri: "http://127.0.0.1:9999/callback",
    response_type: "code",
    scope: "bins:read requests:read",
    state: "synthetic-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource,
  });
  const path = "/oauth/authorize?" + params;
  const page = await owner.newPage();
  await page.goto(path);
  await expect(
    page.getByRole("button", { name: "Allow access" }),
  ).toBeVisible();
  const consent = await owner.request.post(path, {
    form: { decision: "allow" },
    maxRedirects: 0,
  });
  expect(consent.status(), await consent.text()).toBe(303);
  const callback = new URL(consent.headers().location);
  expect(callback.searchParams.get("state")).toBe("synthetic-state");
  const code = callback.searchParams.get("code");
  expect(code).toBeTruthy();
  const token = await owner.request.post("/oauth/token", {
    form: {
      grant_type: "authorization_code",
      code: code!,
      client_id,
      code_verifier: verifier,
      redirect_uri: "http://127.0.0.1:9999/callback",
      resource,
    },
  });
  expect(token.ok(), await token.text()).toBeTruthy();
  const tokens = await token.json();
  expect(tokens.access_token).toBeTruthy();
  const headers = {
    authorization: `Bearer ${tokens.access_token}`,
    accept: "application/json, text/event-stream",
  };
  const tools = await owner.request.post("/mcp", {
    headers,
    data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
  });
  expect(tools.ok(), await tools.text()).toBeTruthy();
  expect(await tools.text()).toContain("list_bins");
  const keyed = await owner.request.post("/mcp", {
    headers: { ...headers, authorization: `Bearer ${apiKey}` },
    data: { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
  });
  expect(keyed.ok(), await keyed.text()).toBeTruthy();
  const anonymous = await page.request.post("/mcp", {
    headers: {
      "x-freebin-mcp-user-id": "spoofed-user",
      "x-freebin-mcp-scopes": "bins:read requests:read",
    },
    data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
  });
  expect(anonymous.status()).toBe(401);
  await page.close();
});

test("admin access, cache boundaries, security headers, and methods", async ({
  request,
}) => {
  const admin = await viewer.request.get("/api/ui/page?path=%2Fadmin");
  expect(await admin.json()).toEqual({ redirect: "/account" });
  const me = await request.get("/api/me");
  expect((await me.json()).user).toBeNull();
  expect(me.headers()["cache-control"]).toBe("private, no-store");
  expect(me.headers()["x-content-type-options"]).toBe("nosniff");
  const invalidMethod = await owner.request.put("/api/ui/layout");
  expect(invalidMethod.status()).toBe(405);
  const csrf = await owner.request.post("/api/account/token", {
    headers: { origin: "https://untrusted.example" },
    data: { name: "forbidden" },
  });
  expect(csrf.status()).toBe(403);
  for (const path of [
    "/freebin.mjs",
    "/openapi.yaml",
    "/schemas/bin-config.v1.json",
  ])
    expect((await request.get(path)).ok()).toBeTruthy();
});

test("React settings controls, forwarding conditions, and response-rule editor", async () => {
  const page = await owner.newPage();
  await page.goto(`/bin/${binId}`);
  await page.getByRole("button", { name: "Bin settings", exact: true }).click();
  await page.getByRole("button", { name: "Config", exact: true }).click();
  const settings = page.locator(".response-settings");
  await settings.getByLabel("Status", { exact: true }).fill("201");
  await settings.getByLabel(/Response body/).fill("queued");
  await settings.getByLabel(/Content type/).fill("text/plain");
  const forwarding = settings.getByLabel(
    "Forward new captures after storing them",
  );
  await forwarding.check();
  await settings.getByRole("button", { name: "Add condition" }).click();
  await settings.getByRole("button", { name: "Add condition" }).click();
  await expect(settings.locator(".forwarding-condition")).toHaveCount(2);
  await settings
    .getByRole("button", { name: "Remove condition" })
    .last()
    .click();
  await expect(settings.locator(".forwarding-condition")).toHaveCount(1);
  const condition = settings.locator(".forwarding-condition");
  await condition.getByLabel("Request field").selectOption("body");
  await condition.getByLabel("Field name").fill("data.status");
  await condition.getByLabel("Value", { exact: true }).fill("paid");
  await forwarding.uncheck(); // Exercise configuration without sending outbound traffic.
  await settings.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toContainText("Bin settings saved");
  const bin = await owner.request.get(`/api/v1/bins/${binId}`);
  expect((await bin.json()).bin.forwardingConditions).toEqual([
    { source: "body", key: "data.status", operator: "equals", value: "paid" },
  ]);
  const capture = await owner.request.post(`/b/${binId}/fallback`, {
    headers: { authorization: `Bearer ${apiKey}` },
    data: "fixture",
  });
  expect(capture.status()).toBe(201);
  expect(await capture.text()).toBe("queued");
  await page.getByRole("button", { name: "Bin settings", exact: true }).click();
  await page.getByRole("button", { name: /Response rules/ }).click();
  const editor = page.locator(".rule-editor");
  await editor.getByLabel("Name", { exact: true }).fill("UI rule");
  await editor
    .getByLabel(/Conditions/)
    .fill(
      JSON.stringify([
        { source: "path", operator: "equals", value: "/ui-rule" },
      ]),
    );
  await editor.getByLabel("Status", { exact: true }).fill("202");
  await editor
    .getByLabel("Response body", { exact: false })
    .fill("ui-accepted");
  await editor.getByRole("button", { name: "Create rule" }).click();
  await expect(page.locator(".rule-list")).toContainText("UI rule");
  const matched = await owner.request.post(`/b/${binId}/ui-rule`, {
    headers: { authorization: `Bearer ${apiKey}` },
    data: "fixture",
  });
  expect(matched.status()).toBe(202);
  expect(await matched.text()).toBe("ui-accepted");
  await page.close();
});

test("inspector capability exchange uses a narrow HttpOnly cookie", async ({
  request,
  page,
}) => {
  const created = await request.post("/api/v1/bins", {
    data: { name: "Capability fixture", termsAccepted: true },
  });
  expect(created.status()).toBe(201);
  const bin = await created.json();
  const exchange = await request.get(bin.inspectUrl, { maxRedirects: 0 });
  expect(exchange.status()).toBe(303);
  expect(exchange.headers().location).toBe(`/bin/${bin.bin.binId}`);
  const cookie = exchange.headers()["set-cookie"];
  expect(cookie).toContain(`Path=/api/v1/bins/${bin.bin.binId}`);
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=lax");
  expect(exchange.headers()["cache-control"]).toBe("private, no-store");
  await page.goto(bin.inspectUrl);
  await expect(page).toHaveURL(new RegExp(`/bin/${bin.bin.binId}$`));
  await expect(
    page.getByRole("heading", { name: "Your endpoint is listening" }),
  ).toBeVisible();
  expect(
    (await page.request.get(`/api/v1/bins/${bin.bin.binId}/interactions`)).ok(),
  ).toBeTruthy();
});

test("bin creation and logout navigate within the SPA and clear private UI data", async () => {
  const page = await owner.newPage();
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: ownerEmail })).toBeVisible();
  await page.evaluate(() => {
    (window as any).spaMarker = "session-transition";
  });
  const form = page.locator(".add-panel");
  await form.getByPlaceholder("Name your bin").fill("SPA-created bin");
  await form.getByRole("button", { name: "Create bin", exact: true }).click();
  await expect(page).toHaveURL(/\/bin\/[a-z0-9]+$/);
  await expect(
    page.getByRole("heading", { name: "Your endpoint is listening" }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).spaMarker)).toBe(
    "session-transition",
  );
  const previousBinURL = page.url();
  const header = page.locator('header.site-header');
  await header.locator('details summary').click();
  await header.getByLabel('Create bin', { exact: true }).fill('Header-created bin');
  await header.getByRole('button', { name: 'Create bin', exact: true }).click();
  await expect(page).not.toHaveURL(previousBinURL);
  await expect(page.getByRole('heading', { name: 'Your endpoint is listening' })).toBeVisible();
  await header.locator('details summary').click();
  await expect(header.getByRole('button', { name: 'Create bin', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).spaMarker)).toBe('session-transition');
  await page
    .locator("header.site-header")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: ownerEmail })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).spaMarker)).toBe(
    "session-transition",
  );
  await page.close();
});
