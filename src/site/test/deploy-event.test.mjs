import assert from "node:assert/strict";
import test from "node:test";
import { buildDeployEvent, sendDeployEvent } from "../scripts/deploy-event.mjs";

test("builds a named OTEL deployment EventRecord", () => {
  const payload = buildDeployEvent({
    serviceName: "freebin",
    version: "version-id",
    accountId: "account-id",
    targets: ["freebin.org", "www.freebin.org"],
    timestamp: new Date("2026-08-18T12:00:00Z"),
  });
  const record = payload.resourceLogs[0].scopeLogs[0].logRecords[0];
  const resource = Object.fromEntries(
    payload.resourceLogs[0].resource.attributes.map(({ key, value }) => [
      key,
      value.stringValue,
    ]),
  );
  assert.equal(record.eventName, "software.deployment.completed");
  assert.equal(record.timeUnixNano, "1787054400000000000");
  assert.equal(record.severityText, "INFO");
  assert.match(record.body.stringValue, /Deployed freebin/);
  assert.equal(resource["service.namespace"], "freebin");
  assert.equal(resource["service.name"], "freebin");
  assert.equal(resource["deployment.environment.name"], "production");
  assert.ok(
    record.attributes.some(
      ({ key, value }) =>
        key === "deployment.version" && value.stringValue === "version-id",
    ),
  );
});

test("uses the exact configured deployment environment", () => {
  const payload = buildDeployEvent({
    serviceName: "freebin",
    version: "version-id",
    environment: "staging",
    accountId: "account-id",
    targets: ["staging.freebin.org"],
    timestamp: new Date("2026-08-18T12:00:00Z"),
  });
  const resource = Object.fromEntries(
    payload.resourceLogs[0].resource.attributes.map(({ key, value }) => [
      key,
      value.stringValue,
    ]),
  );

  assert.equal(resource["deployment.environment.name"], "staging");
});

test("deployment export refuses redirects while carrying the ingest key", async () => {
  const calls = [];
  await sendDeployEvent(
    {
      endpoint: "https://ingest.example.test/v1/traces",
      key: "server-key",
      serviceName: "freebin",
      version: "version-id",
      accountId: "account-id",
      targets: ["freebin.org"],
    },
    async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status: 200 });
    },
  );

  assert.equal(calls[0].url, "https://ingest.example.test/v1/logs");
  assert.equal(calls[0].init.redirect, "error");
});
