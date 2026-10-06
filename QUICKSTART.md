# Capture your first request

This guide walks through webhook debugging with Freebin's browser inspector, CLI, and MCP tools. Use the hosted service or a local instance from the [development setup](src/site/README.md#local-development).

## Choose an instance

The examples use these shell variables:

```bash
export FREEBIN_URL='https://freebin.org'
# For the local development server instead:
# export FREEBIN_URL='http://localhost:8788'
```

Open `/account` on that instance. Register when signups are enabled, or sign in with an existing account. Create a bin named `Payments dev` and copy its bin ID. Create a named account API key and copy it when shown; the full key is displayed only once.

```bash
export FREEBIN_BIN_ID='YOUR_BIN_ID'
export FREEBIN_API_KEY='YOUR_API_KEY'
```

Capture keys authorize bins owned by that account. Revoke a key from the account page when it is no longer needed.

## Send and inspect a webhook

```bash
curl -X POST "$FREEBIN_URL/b/$FREEBIN_BIN_ID/webhooks/orders?source=quickstart" \
  -H "authorization: Bearer $FREEBIN_API_KEY" \
  -H 'content-type: application/json' \
  -H 'x-event: order.created' \
  -d '{"orderId":"ord_123","status":"created"}'
```

Open the bin's inspector at `/bin/YOUR_BIN_ID`. Freebin records the method, path, query, headers, body, source address, content type, size, and timestamp. New requests appear through a live event stream with a polling fallback.

Expand a request to inspect or copy its payload and generated curl command. Filter by method, path, time, content type, headers, or JSON fields. Filters and pagination are preserved in browser history. Selected requests can be exported, deleted, replayed, or forwarded in bulk.

## Use the CLI

From a checkout of this repository, run the dependency-free CLI directly:

```bash
node src/site/public/freebin.mjs --help
node src/site/public/freebin.mjs bins
node src/site/public/freebin.mjs requests "$FREEBIN_BIN_ID" 10
node src/site/public/freebin.mjs watch "$FREEBIN_BIN_ID"
```

The CLI reads `FREEBIN_URL` and `FREEBIN_API_KEY`. You can also download it from `/freebin.mjs` on your instance. Additional commands create bins, send captures, export data, replay requests, forward traffic locally, assert incoming events, and delete individual captures.

For example, check that an expected webhook arrives during an integration test:

```bash
node src/site/public/freebin.mjs assert "$FREEBIN_BIN_ID" \
  --method POST \
  --path '/webhooks/*' \
  --body-json status=created \
  --timeout 30
```

Start the assertion before triggering the webhook, or pass `--include-existing` to inspect retained traffic. Assertion exit codes are `0` for a match, `2` for a timeout, and `1` for an operational or usage error.

To deliver incoming traffic to a development service on your machine:

```bash
node src/site/public/freebin.mjs local-forward "$FREEBIN_BIN_ID" \
  http://127.0.0.1:3000
```

Local forwarding runs in the CLI process and strips sensitive headers. Worker replay and automatic forwarding use the deployment's public HTTPS destination policy.

## Replay and automate responses

Expand a capture and use the replay editor to choose an allowed HTTPS destination. You can edit the effective method, path, query, headers, and body. Each attempt is recorded separately with its response, latency, and error information; the original capture stays unchanged.

Bin settings also support:

- A fallback response and ordered conditional response rules.
- Automatic forwarding to an allowed destination, with up to five conditions on method, path, query, headers, or JSON/form fields. All conditions must match; an empty list forwards every new capture. Manual forwarding does not apply these conditions.
- Portable configuration export/import using the [configuration schema](src/site/public/schemas/bin-config.v1.json).
- Collaborator invitations with explicit feature permissions and revocable public links.

Sensitive, credential, cookie, hop-by-hop, source-address, and propagation headers are removed from Worker outbound requests.

## REST API and examples

Use `Authorization: Bearer YOUR_API_KEY` for account API-key requests to `/api/v1`. The [OpenAPI contract](src/site/public/openapi.yaml) documents endpoint parameters and responses. Each instance serves the same contract at `/openapi.yaml` and browser documentation at `/docs`.

Start with the [JavaScript example](src/site/examples/javascript.mjs) or [Python example](src/site/examples/python.py) when building your own integration. API keys, capture bodies, and exported requests can contain sensitive data; keep them out of public issues and pull requests.

## Connect an MCP client

For an OAuth-capable MCP client, configure the instance's `/mcp` URL:

```json
{
  "mcpServers": {
    "freebin": {
      "url": "https://freebin.org/mcp"
    }
  }
}
```

For a local instance, substitute `http://localhost:8788/mcp`. The client discovers OAuth endpoints and opens the sign-in and consent flow. Tools can list owned bins, list requests, inspect a bounded request body, and replay captures. Clients that support custom authorization headers can also use an account API key.

## Defaults and permissions

| Limit                   | Registered account     | Public demo               |
| ----------------------- | ---------------------- | ------------------------- |
| Owned bins              | 5                      | One configured demo bin   |
| Active account API keys | 5                      | Public capture credential |
| Retained storage        | 5 MB across owned bins | 1 MB                      |
| Capture body            | 1 MB                   | 20 KB                     |
| Capture rate            | 20 requests/second     | 1 request/second          |

Demo quotas can be configured by the operator. Replay and forwarding share a 20-requests-per-second egress envelope; bulk egress runs at concurrency three. Storage retention evicts the oldest replay attempts and then the oldest captures when the allowance is exceeded.

Owners assign collaborators permissions for requests, exports, replay, forwarding, rules, configuration, sharing, collaborators, and audit. Backend APIs check each operation. Public links grant a separate read-only view and can be revoked.

## Next steps

- [Develop and deploy the web application](src/site/README.md).
- [Use or develop the VS Code extension](src/extension/README.md).
- [Contribute a fix or integration](CONTRIBUTING.md).
