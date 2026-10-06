const EVENT_NAME = "software.deployment.completed";
const SCHEMA_URL = "https://opentelemetry.io/schemas/1.37.0";

function attr(key, value) {
  return { key, value: { stringValue: String(value) } };
}

export function buildDeployEvent({
  serviceName,
  version,
  environment = "production",
  accountId,
  targets,
  timestamp = new Date(),
}) {
  const timeUnixNano = (BigInt(timestamp.getTime()) * 1_000_000n).toString();
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [
            attr("service.namespace", "freebin"),
            attr("service.name", serviceName),
            attr("service.version", version),
            attr("deployment.environment.name", environment),
            attr("cloud.provider", "cloudflare"),
            attr("cloud.account.id", accountId),
          ],
          droppedAttributesCount: 0,
        },
        scopeLogs: [
          {
            scope: {
              name: "freebin.deploy",
              version: "1.0.0",
              attributes: [],
              droppedAttributesCount: 0,
            },
            logRecords: [
              {
                timeUnixNano,
                observedTimeUnixNano: timeUnixNano,
                severityNumber: 9,
                severityText: "INFO",
                body: {
                  stringValue: `Deployed ${serviceName} to Cloudflare Workers`,
                },
                attributes: [
                  attr("event.name", EVENT_NAME),
                  attr("deployment.status", "succeeded"),
                  attr("deployment.target", targets.join(",")),
                  attr("deployment.version", version),
                  attr("cloud.platform", "cloudflare_workers"),
                ],
                droppedAttributesCount: 0,
                flags: 0,
                eventName: EVENT_NAME,
              },
            ],
            schemaUrl: SCHEMA_URL,
          },
        ],
        schemaUrl: SCHEMA_URL,
      },
    ],
  };
}

export async function sendDeployEvent(
  { endpoint, key, ...event },
  fetchImpl = fetch,
) {
  if (!endpoint || !key)
    throw new Error(
      "OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_SERVER_KEY are required",
    );
  const url =
    endpoint.replace(/\/$/, "").replace(/\/v1\/(?:traces|metrics|logs)$/, "") +
    "/v1/logs";
  const response = await fetchImpl(url, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/json", "x-corridora-key": key },
    body: JSON.stringify(buildDeployEvent(event)),
  });
  if (!response.ok)
    throw new Error(`Corridora ingest returned HTTP ${response.status}`);
}
