import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { projectRoot } from "./cloudflare-config.mjs";

function buildAssets() {
  const root = resolve(projectRoot, "dist/client/_next/static");
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(js|css)$/.test(entry.name)) files.push(path);
    }
  }
  walk(root);
  if (!files.length)
    throw new Error("Build the application before recording assets.");
  return files.sort().map((path) => {
    const bytes = readFileSync(path);
    return {
      file: relative(root, path),
      bytes: bytes.length,
      gzipBytes: gzipSync(bytes).length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
}
if (process.argv.includes("--assets-only")) {
  const path = resolve(projectRoot, "artifacts/baseline/manifest.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.assets = buildAssets();
  manifest.assetsRecordedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `Recorded ${manifest.assets.length} build assets; measurement samples preserved.`,
  );
  process.exit(0);
}

const origin = process.env.FREEBIN_BASELINE_URL || "http://localhost:8788";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("The baseline seeds synthetic captures; use a local Worker.");
const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: origin,
  viewport: { width: 1280, height: 900 },
});
const count = 100,
  bodyPadding = "x".repeat(8192);
const artifactDirectory = resolve(projectRoot, "artifacts/baseline");
mkdirSync(artifactDirectory, { recursive: true });
async function requireOK(response) {
  if (!response.ok())
    throw new Error(
      `Baseline fixture request returned HTTP ${response.status()}`,
    );
  return response.json();
}
try {
  await requireOK(
    await context.request.post("/api/auth/register", {
      data: {
        email: `baseline-${Date.now()}@example.test`,
        password: "synthetic-baseline-password-123",
        termsAccepted: true,
      },
    }),
  );
  const { bin } = await requireOK(
    await context.request.post("/api/v1/bins", {
      data: { name: "Synthetic performance baseline", termsAccepted: true },
    }),
  );
  const { token } = await requireOK(
    await context.request.post("/api/account/token", {
      data: { name: "Synthetic baseline" },
    }),
  );
  for (let i = 0; i < count; i++) {
    const response = await context.request.post(
      `/b/${bin.binId}/fixture-${String(i).padStart(3, "0")}`,
      {
        headers: { authorization: `Bearer ${token}` },
        data: {
          event: `invoice.${i}`,
          data: { status: i % 2 ? "paid" : "pending", padding: bodyPadding },
        },
      },
    );
    if (!response.ok())
      throw new Error(`Capture fixture failed: HTTP ${response.status()}`);
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  const payload = await requireOK(
    await context.request.get(
      `/api/v1/bins/${bin.binId}/interactions?limit=all`,
    ),
  );
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const samples = [];
  for (let i = 0; i < 3; i++) {
    await page.goto(`/bin/${bin.binId}`);
    await page
      .locator(".request-list")
      .getByText("/fixture-099", { exact: true })
      .waitFor();
    samples.push(
      await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0];
        return {
          responseEndMs: navigation.responseEnd,
          domContentLoadedMs: navigation.domContentLoadedEventEnd,
          firstContentfulPaintMs:
            performance.getEntriesByName("first-contentful-paint")[0]
              ?.startTime || null,
          observedAfterDataVisibleMs: performance.now(),
          domElements: document.getElementsByTagName("*").length,
        };
      }),
    );
  }
  const searchPaintMs = [];
  for (const needle of [
    "invoice.9",
    "paid",
    "pending",
    "fixture-0",
    "invoice.99",
  ]) {
    const start = await page.evaluate(() => performance.now());
    await page.getByPlaceholder(/Search path/).fill(needle);
    const end = await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(performance.now())),
          ),
        ),
    );
    searchPaintMs.push(end - start);
  }
  await page.getByPlaceholder(/Search path/).fill("");
  await page.screenshot({
    path: resolve(artifactDirectory, "inspector-100-captures.png"),
    fullPage: true,
  });
  const assets = buildAssets();
  const packageJSON = JSON.parse(
    readFileSync(resolve(projectRoot, "package.json"), "utf8"),
  );
  const manifest = {
    recordedAt: new Date().toISOString(),
    runtime: "local compiled Cloudflare Worker / vinext",
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    chromium: browser.version(),
    versions: {
      next: packageJSON.dependencies.next,
      react: packageJSON.dependencies.react,
      vinext: packageJSON.dependencies.vinext,
    },
    profile: {
      viewport: "1280x900",
      cpuThrottle: 4,
      networkThrottle: "none / localhost",
      samples: 3,
      browserCache: "same context across reloads",
    },
    fixture: {
      captures: payload.interactions.length,
      paddingBytesPerCapture: 8192,
      listJSONBytes: Buffer.byteLength(JSON.stringify(payload)),
    },
    navigationSamples: samples,
    searchPaintMs,
    assets,
    limitations: [
      "Synthetic local samples, not production Core Web Vitals or RUM.",
      "Search measurement includes browser automation and two animation frames; it is not INP.",
      "All-asset gzip sizes are not per-route network transfer.",
      "First contentful paint includes loading UI; data-visible timing includes the automation wait.",
    ],
  };
  writeFileSync(
    resolve(artifactDirectory, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    `Recorded ${manifest.fixture.captures} synthetic captures and ${assets.length} build assets.`,
  );
} finally {
  await context.close();
  await browser.close();
}
