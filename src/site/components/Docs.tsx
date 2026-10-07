"use client";
import { Fragment } from "react";
import Link from "next/link";
import "./styles/Docs.css";

export default function Docs({ data = {}, form }: any) {
  const endpointGroups = [
    {
      title: "Management API",
      description:
        "Replace path parameters with IDs returned by the API. Bin access means an owner account API key, an authorized browser session, or an anonymous inspector capability. Collaborator sessions require the permission for each operation.",
      endpoints: [
        [
          "GET",
          "/api/v1/bins",
          "List bins owned by the API-key account, newest first. An anonymous inspector capability lists its bin. An unrecognized nonempty credential returns an empty list.",
          "Bearer key",
        ],
        [
          "POST",
          "/api/v1/bins",
          "Create a private bin with a bearer key or browser session. Without credentials, creates a public bin that cannot capture. Send termsAccepted: true; names default to Untitled bin.",
          "Optional bearer key or session",
        ],
        [
          "GET",
          "/api/v1/bins/:binId",
          "Read a bin’s name, response and forwarding configuration, creation time, and current public-share token.",
          "Bin access",
        ],
        [
          "PATCH",
          "/api/v1/bins/:binId",
          "Update the fallback capture response and automatic forwarding configuration, including one allowed HTTPS destination and optional conditions.",
          "Bin access",
        ],
        [
          "DELETE",
          "/api/v1/bins/:binId",
          "Permanently delete a bin and its retained data. Collaborator sessions cannot delete bins.",
          "Bin access",
        ],
        [
          "GET / PUT",
          "/api/v1/bins/:binId/config",
          "Export or atomically replace the versioned portable bin configuration and ordered response rules. Captures and replay history are preserved.",
          "Bin access",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/audit",
          "List mutation audit events, newest first. limit accepts 1–500 and defaults to 100; up to 500 events are retained per bin.",
          "Bin access",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/collaborators",
          "List collaborators and their permissions. Collaborator sessions require collaborators.view.",
          "Bin access",
        ],
        [
          "PUT / DELETE",
          "/api/v1/bins/:binId/collaborators",
          "Invite or update a registered-user collaborator with PUT; remove one with DELETE. Both operations require the bin owner’s browser session.",
          "Owner session required",
        ],
        [
          "GET / POST / PUT",
          "/api/v1/bins/:binId/rules",
          "List, create, or reorder conditional response rules. Enabled rules use first-match-wins order.",
          "Bin access",
        ],
        [
          "PATCH / DELETE",
          "/api/v1/bins/:binId/rules/:ruleId",
          "Update or delete one conditional response rule.",
          "Bin access",
        ],
        [
          "POST",
          "/api/v1/bins/:binId/rules/test",
          "Test a synthetic request against enabled rules without capturing it.",
          "Bin access",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/interactions?limit=10&offset=0",
          "List retained requests, newest first. limit accepts 1–100 or all and defaults to 10; responses include an interactions array plus meta.total, meta.limit, and meta.offset.",
          "Bin access",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/stream?lastId=:requestId",
          "Open a server-sent event stream. Checks the latest request every five seconds for about 125 seconds, emitting request IDs or keepalives. Reconnect to continue; Last-Event-ID takes precedence over lastId.",
          "Bin access",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/export",
          "Download bin configuration, rules, retained requests, replay attempts, and automatic-forwarding attempts as JSON.",
          "Bin access",
        ],
        [
          "POST",
          "/api/v1/bins/:binId/share",
          'Enable or disable a read-only public bin URL with {"public":true|false}. Enabling again rotates the URL.',
          "Bin access",
        ],
        [
          "DELETE",
          "/api/v1/bins/:binId/interactions/:requestId",
          "Permanently delete one retained request.",
          "Bin access",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/interactions/:requestId/export",
          "Download one retained request and its replay and automatic-forwarding attempts as JSON.",
          "Bin access",
        ],
        [
          "POST",
          "/api/v1/bins/:binId/interactions/:requestId/share",
          'Enable or disable a read-only public request URL with {"public":true|false}.',
          "Bin access",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/interactions/:requestId/replay",
          "List the newest 50 retained replay attempts, including effective request snapshots and results.",
          "Bin access",
        ],
        [
          "POST",
          "/api/v1/bins/:binId/interactions/:requestId/replay",
          'Replay a request with optional edits, or use operation: "forward" with the bin’s enabled forwarding destination. Manual forwarding bypasses forwarding conditions and can also apply edits. Outbound attempts are recorded; requests rejected before delivery do not create attempts.',
          "Bin access",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/interactions/:requestId/forwarding",
          "List retained automatic-forwarding attempts for one captured request.",
          "Bin access",
        ],
      ],
    },
    {
      title: "MCP and OAuth",
      description:
        "OAuth-capable MCP clients discover these endpoints automatically. Freebin requires authorization code flow with S256 PKCE and explicit account consent.",
      endpoints: [
        [
          "POST",
          "/mcp",
          "Send MCP JSON-RPC messages over Streamable HTTP. Tool availability depends on the granted bins:read, requests:read, and replay:write scopes.",
          "OAuth token or account key",
        ],
        [
          "GET",
          "/.well-known/oauth-protected-resource/mcp",
          "Describe the protected MCP resource, authorization server, and baseline scopes.",
          "Public",
        ],
        [
          "GET",
          "/.well-known/oauth-authorization-server",
          "Publish authorization, token, registration, revocation, scope, and PKCE metadata.",
          "Public",
        ],
        [
          "GET / POST",
          "/oauth/authorize",
          "Authenticate the account, display requested access, and approve or deny the OAuth grant.",
          "Session required",
        ],
        [
          "POST",
          "/oauth/token",
          "Exchange an authorization code, refresh an access token, or revoke a token according to advertised metadata.",
          "OAuth client",
        ],
        [
          "POST",
          "/oauth/register",
          "Register a compatible OAuth client dynamically. Client ID Metadata Documents are also supported.",
          "Public",
        ],
      ],
    },
    {
      title: "Request capture",
      description:
        "Capture URLs accept requests at /b/:binId and any path below it. Use an API key belonging to the bin owner, or the configured public capture key for the designated demo.",
      endpoints: [
        [
          "GET",
          "/b/:binId/*",
          "Capture a GET request and return the bin’s configured response.",
          "Bearer key required",
        ],
        [
          "POST",
          "/b/:binId/*",
          "Capture a POST request and return the bin’s configured response.",
          "Bearer key required",
        ],
        [
          "PUT",
          "/b/:binId/*",
          "Capture a PUT request and return the configured response.",
          "Bearer key required",
        ],
        [
          "PATCH",
          "/b/:binId/*",
          "Capture a PATCH request and return the configured response.",
          "Bearer key required",
        ],
        [
          "DELETE",
          "/b/:binId/*",
          "Capture a DELETE request and return the configured response.",
          "Bearer key required",
        ],
        [
          "OPTIONS",
          "/b/:binId/*",
          "Capture an OPTIONS request and return the configured response.",
          "Bearer key required",
        ],
        [
          "HEAD",
          "/b/:binId/*",
          "Capture a HEAD request. The stored body is null and the response has no body.",
          "Bearer key required",
        ],
      ],
    },
    {
      title: "Browser account and session API",
      description:
        "These endpoints support the first-party web application. Session endpoints use the secure HttpOnly cookie set during registration or login.",
      endpoints: [
        [
          "GET",
          "/api/config",
          "Return signup availability, the optional browser telemetry script URL, application name, deployment environment, and application version.",
          "Public",
        ],
        [
          "POST",
          "/api/auth/register",
          "Create an account and session. Requires email, a 10–128 character password, termsAccepted: true, and enabled signups.",
          "Public",
        ],
        [
          "POST",
          "/api/auth/login",
          "Validate email and password and create a 30-day session cookie.",
          "Public",
        ],
        [
          "POST",
          "/api/auth/logout",
          "Delete the current server session and clear its cookie.",
          "Session optional",
        ],
        [
          "GET",
          "/api/me",
          "Return the signed-in account, storage usage and limit, and owned or shared bins. Signed-out callers receive user: null and an empty bins array.",
          "Session optional",
        ],
        [
          "DELETE",
          "/api/me",
          "Permanently delete the signed-in account and clear its session.",
          "Session required",
        ],
        [
          "GET",
          "/api/account/token",
          "List API-key metadata. Full key values are never returned after creation.",
          "Session required",
        ],
        [
          "POST",
          "/api/account/token",
          "Create a named user API key in fb_<uuid> format. The full token is returned once; accounts may have five active keys.",
          "Session required",
        ],
        [
          "DELETE",
          "/api/account/token",
          'Revoke the key whose ID is supplied as {"id":"…"}.',
          "Session required",
        ],
      ],
    },
  ] as const;
  return (
    <div data-view="Docs">
      <title>{"API Documentation | freebin.org"}</title>
      <meta
        name="description"
        content="Freebin REST API reference, authentication, CLI, client examples, and service limits."
      />

      <div className="shell">
        <main className="docs">
          <p className="eyebrow">{"Developer platform"}</p>
          <h1>{"API documentation"}</h1>
          <p className="lede">
            {
              "Use the REST API to create bins, capture and inspect HTTP requests, configure responses, and replay traffic. This reference includes authentication requirements, a Node.js CLI, client examples, and an OpenAPI 3.1 specification. Bin creation requires acceptance of the "
            }
            <Link href="/terms">{"Terms and Conditions"}</Link>
            {"."}
          </p>

          <nav aria-label="Developer resources" className="resources">
            <a href="#quickstart">
              <strong>{"Quickstart"}</strong>
              <span>
                {"Create a bin, send a request, and inspect the capture."}
              </span>
            </a>
            <a href="/openapi.yaml">
              <strong>{"OpenAPI 3.1"}</strong>
              <span>{"Download the machine-readable API contract."}</span>
            </a>
            <a href="/schemas/bin-config.v1.json">
              <strong>{"Bin config schema"}</strong>
              <span>
                {
                  "Validate portable configuration files with JSON Schema 2020-12."
                }
              </span>
            </a>
            <a href="/freebin.mjs">
              <strong>{"CLI"}</strong>
              <span>
                {"Download the dependency-free Node.js command line tool."}
              </span>
            </a>
          </nav>

          <section>
            <h2>{"API versioning"}</h2>
            <p>
              {"Management endpoints use "}
              <code>{"/api/v1"}</code>
              {". Account and session endpoints use /api. Capture URLs use "}
              <code>{"/b/:binId/*"}</code>
              {
                " and also accept requests at /b/:binId without a path suffix. Clients should tolerate additional fields in JSON responses."
              }
            </p>
          </section>

          <section>
            <h2>{"Install the CLI"}</h2>
            <p>
              Use Node.js 24 or later. Set <code>FREEBIN_API_KEY</code> to an
              account API key before running commands that access your bins.
            </p>
            <pre>
              {
                "curl -fsS https://freebin.org/freebin.mjs -o freebin.mjs\nexport FREEBIN_API_KEY='YOUR_API_KEY'\nnode freebin.mjs bins"
              }
            </pre>
            <p>
              {"The CLI supports "}
              <code>{"bins"}</code>
              {", "}
              <code>{"create"}</code>
              {", "}
              <code>{"send"}</code>
              {", "}
              <code>{"requests"}</code>
              {", "}
              <code>{"watch"}</code>
              {", "}
              <code>{"export"}</code>
              {", "}
              <code>{"replay"}</code>
              {", "}
              <code>{"local-forward"}</code>
              {", "}
              <code>{"assert"}</code>
              {", and "}
              <code>{"delete-request"}</code>
              {
                ". The watch and local-forward commands emit JSON lines and accept "
              }
              <code>{"--include-existing"}</code>
              {
                ". Local forwarding runs on the machine running the CLI and can reach localhost. It strips authorization, cookies, credential-like headers, hop-by-hop headers, and selected source-address headers. Set "
              }
              <code>{"FREEBIN_URL=http://localhost:8788"}</code>
              {
                " for a local instance on port 8788; adjust the origin to match your server."
              }
            </p>
            <pre>
              {
                "node freebin.mjs assert BIN_ID --method POST --path '/webhooks/*' \\\n  --header x-event=invoice.created --body-json data.status=paid --timeout 30"
              }
            </pre>
            <p>
              {
                "Assertions combine method, path glob, repeated header, repeated body substring, and repeated JSON dot-path predicates with AND semantics. Exit code "
              }
              <code>{"0"}</code>
              {" indicates a match, "}
              <code>{"2"}</code>
              {" a timeout, and "}
              <code>{"1"}</code>
              {" a usage or operational error."}
            </p>
            <p>
              Start an assertion before triggering the webhook. By default it
              matches requests captured after the command starts. Use
              <code>{" --include-existing"}</code> to include retained requests,
              or <code>--since</code> with an ISO timestamp. Assertions check
              the latest 100 requests on each poll.
            </p>
          </section>

          <section>
            <h2>{"Connect an MCP client"}</h2>
            <p>
              Configure a remote MCP connection to
              <code>{" https://freebin.org/mcp"}</code>. The following example
              applies to clients that accept an <code>mcpServers</code> object;
              configuration syntax varies by client.
            </p>
            <pre>
              {
                '{\n  "mcpServers": {\n    "freebin": {\n      "url": "https://freebin.org/mcp"\n    }\n  }\n}'
              }
            </pre>
            <p>
              {"The stateless Streamable HTTP server provides "}
              <code>{"list_bins"}</code>
              {", "}
              <code>{"list_requests"}</code>
              {", "}
              <code>{"get_request"}</code>
              {", and "}
              <code>{"replay_request"}</code>
              {
                ". OAuth-capable clients discover Freebin automatically, use authorization code flow with S256 PKCE, and show an explicit consent screen for read and replay scopes. Account API keys remain a compatibility option through a custom bearer header. Both methods return owned bins only. Request bodies are bounded before entering model context, and replay uses the same destination allowlist, egress limits, retention, sensitive-header stripping, and mutation audit trail as the browser and API."
              }
            </p>
          </section>

          <section id="quickstart">
            <h2>{"Create a bin"}</h2>
            <p>
              Sign in at <Link href="/account">Account</Link> and create an API
              key in the API keys tab. Replace <code>YOUR_API_KEY</code> in the
              examples with that key. Create a bin and use the returned
              <code>{" bin.binId"}</code> wherever an example uses
              <code>{" YOUR_BIN_ID"}</code>.
            </p>
            <pre>
              {
                'curl -X POST https://freebin.org/api/v1/bins \\\n  -H "authorization: Bearer YOUR_API_KEY" \\\n  -H "content-type: application/json" \\\n  -d \'{"name":"Payments dev","termsAccepted":true}\''
              }
            </pre>
          </section>

          <section>
            <h2>{"Send a request"}</h2>
            <pre>
              {
                'curl -X POST https://freebin.org/b/YOUR_BIN_ID/events \\\n  -H "authorization: Bearer YOUR_API_KEY" \\\n  -H "content-type: application/json" \\\n  -d \'{"status":"ok"}\''
              }
            </pre>
            <p>
              A stored capture returns <code>X-Freebin-Captured: true</code>.
              The response status, headers, and body come from the first
              matching response rule or the bin’s fallback configuration. A
              configured error status can still indicate a successful capture.
            </p>
          </section>

          <section>
            <h2>{"List captured requests"}</h2>
            <pre>
              {
                'curl "https://freebin.org/api/v1/bins/YOUR_BIN_ID/interactions?limit=50" \\\n  -H "authorization: Bearer YOUR_API_KEY"'
              }
            </pre>
            <p>
              Headers and JSON or form fields with common credential names are
              redacted before storage. Private gzip bodies are returned as
              <code>{" freebin:base64:<encoded bytes>"}</code>. GET and HEAD
              captures have a null body. The public demo applies additional
              redaction and does not expose source addresses.
            </p>
          </section>

          <section>
            <h2>HTTP client examples</h2>
            <p>
              The{" "}
              <a href="https://github.com/corridora/freebin/blob/main/src/site/examples/javascript.mjs">
                JavaScript example
              </a>{" "}
              and
              <a href="https://github.com/corridora/freebin/blob/main/src/site/examples/python.py">
                {" "}
                Python example
              </a>{" "}
              provide reusable functions for listing bins, creating bins, and
              listing requests. Both read <code>FREEBIN_API_KEY</code> and the
              optional
              <code>{" FREEBIN_URL"}</code> environment variable.
            </p>
          </section>

          <section>
            <h2>{"Inspector filtering"}</h2>
            <p>
              {
                "The browser inspector filters its loaded retained history by free text, HTTP method, capture time range, path, content type, header name and value, and dotted JSON body fields. Filter and paging state is encoded in the URL and restored by browser history, making a filtered inspector URL shareable with another authorized user. Filters apply in the browser; the request-list API supports pagination rather than these filter predicates."
              }
            </p>
          </section>

          <section>
            <h2>{"Portable bin configuration"}</h2>
            <p>
              {
                "Export a versioned document containing the bin name, fallback response, forwarding configuration, and ordered conditional response rules. The document excludes captures, replay history, account ownership, Freebin API keys, public-share tokens, rule IDs and revisions, and internal enforcement metadata. User-authored response bodies, headers, destinations, and rule values may still be sensitive, so review a file before sharing it."
              }
            </p>
            <pre>
              {
                'curl https://freebin.org/api/v1/bins/YOUR_BIN_ID/config \\\n  -H "authorization: Bearer YOUR_API_KEY" \\\n  -o freebin-config.json\n\ncurl -X PUT https://freebin.org/api/v1/bins/OTHER_BIN_ID/config \\\n  -H "authorization: Bearer YOUR_API_KEY" \\\n  -H "content-type: application/json" \\\n  --data-binary @freebin-config.json'
              }
            </pre>
            <p>
              {
                "Imports replace the destination bin’s portable fields and all rules atomically while preserving its captured requests and replay attempts. Local rule IDs and revisions are regenerated. The import must satisfy the destination account’s limits, and enabled forwarding must target an origin permitted by that deployment. Validate files against "
              }
              <a href="/schemas/bin-config.v1.json">
                <code>{"bin-config.v1.json"}</code>
              </a>
              {"."}
            </p>
          </section>

          <section>
            <h2>{"Authentication"}</h2>
            <p>
              {"Send an account API key as "}
              <code>{"Authorization: Bearer YOUR_API_KEY"}</code>
              {". New keys use the "}
              <code>{"fb_<uuid>"}</code>
              {
                " format with a UUID v4. Existing keys remain valid. Keys are scoped to an account, shown only once, individually revocable, and limited to five active keys per account. Capture requests require a key belonging to the bin owner; the designated public demo also accepts its configured public capture key. Browser session cookies do not authenticate capture requests."
              }
            </p>
            <p>
              Bin-scoped management endpoints also accept an authorized browser
              session. Anonymous inspector capabilities are accepted by the
              supported bin-management endpoints as bearer credentials. Visiting
              the token-bearing <code>inspectUrl</code> returned at creation
              exchanges that capability for a Secure, HttpOnly cookie scoped to
              the bin’s API path. A <code>token</code> query parameter does not
              authenticate API requests. Collaborators use browser sessions and
              require the permission for each operation; API keys access owned
              bins only.
            </p>
            <p>
              Mutation requests outside capture endpoints must use the service’s
              origin when an <code>Origin</code> header is present. OAuth access
              tokens authenticate MCP requests; use account API keys for the
              REST API.
            </p>
          </section>

          <section>
            <h2>{"Endpoint reference"}</h2>
            <p>
              {
                "The reference below covers management, capture, account, and MCP endpoints. Use the OpenAPI specification for REST request and response schemas. Public share URLs are read-only web pages."
              }
            </p>
            {endpointGroups.map((group, _index0) => (
              <Fragment key={_index0}>
                <div className="endpoint-group">
                  <h3>{group.title}</h3>
                  <p>{group.description}</p>
                  <div className="endpoint-list">
                    {group.endpoints.map((endpoint, _index1) => (
                      <Fragment key={_index1}>
                        <article className="endpoint">
                          <div className="endpoint-signature">
                            <span className="method">{endpoint[0]}</span>
                            <code>{endpoint[1]}</code>
                          </div>
                          <p>{endpoint[2]}</p>
                          <span className="auth">{endpoint[3]}</span>
                        </article>
                      </Fragment>
                    ))}
                  </div>
                </div>
              </Fragment>
            ))}
          </section>

          <section>
            <h2>{"Service limits"}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{"Limit"}</th>
                    <th>{"Registered"}</th>
                    <th>{"Public demo"}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">{"Capture rate"}</th>
                    <td>{"20 requests/second per user"}</td>
                    <td>{"1 request/second by default"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{"Request body"}</th>
                    <td>{"1 MiB"}</td>
                    <td>{"20 KiB by default"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{"Retention"}</th>
                    <td>{"5 MiB per account by default"}</td>
                    <td>{"1 MiB by default"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{"Bins"}</th>
                    <td>{"5 per account"}</td>
                    <td>{"One configured demo bin"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{"API keys"}</th>
                    <td>{"5 active per account"}</td>
                    <td>{"Not applicable"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{"List page"}</th>
                    <td colSpan={2}>{"1–100 requests or all; default 10"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{"Fallback response fields"}</th>
                    <td colSpan={2}>
                      {
                        "500 UTF-8 bytes each for body, content type, and the JSON-serialized response headers"
                      }
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{"Conditional response rules"}</th>
                    <td>
                      {
                        "5 enabled and 10 total per bin; 25 enabled and 50 total per account"
                      }
                    </td>
                    <td>{"Same per-bin limits"}</td>
                  </tr>
                  <tr>
                    <th scope="row">Rule payload</th>
                    <td colSpan={2}>
                      8 KiB per normalized rule; up to 5 conditions
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Portable configuration import</th>
                    <td colSpan={2}>
                      320 KiB per JSON document; 10 imports/minute per bin
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{"Replay and manual forwarding"}</th>
                    <td>{"20 requests/second per account"}</td>
                    <td>{"1 request/second"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{"Browser bulk egress concurrency"}</th>
                    <td colSpan={2}>
                      {"3 concurrent operations; cancellation is not supported"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              {
                "Storage and body sizes use binary units (1 KiB = 1,024 bytes; 1 MiB = 1,048,576 bytes). Public-demo quotas are deployment-configurable. Retention is byte-based across captures and replay history: the oldest replay attempts are evicted before captured requests when storage exceeds the allowance. There is no date-based cleanup. Rate-limited requests return "
              }
              <code>{"429"}</code>
              {"; capture bodies that exceed the body limit return "}
              <code>{"413"}</code>
              {"."}
            </p>
            <p>
              {
                "Automatic forwarding is best-effort: one destination per bin, a 10-second timeout, no redirects, and no retries. Up to five AND conditions select which captures to forward; an empty condition list forwards every new capture. Manual forwarding bypasses these conditions. Each forwarded capture has separate pending, delivered, or failed attempt history with destination, response code, error, latency, and timestamps; the request-level fields summarize the latest result. The original path and query are appended to the configured base URL. Credential-like headers are stripped by default and may be retained with a per-bin allowlist. Authorization, transport-control headers, selected source-address headers, and trace propagation headers are always removed."
              }
            </p>
            <p>
              {
                "Conditional responses evaluate up to five enabled rules in order and stop at the first match. Each rule supports up to five AND conditions over method, path, query, selected headers, and JSON or form body fields using equals, exists, contains, or glob. Rules cannot inspect authorization, proxy-authorization, or cookie headers. Compressed bodies are not evaluated by body conditions. Static responses may delay for up to five seconds."
              }
            </p>
            <p>
              {
                "Replay attempts preserve the original capture and store the effective edited request plus its result separately. Replay history shares the account retention budget; oldest replay attempts are evicted before captured requests. Replay uses a 10-second timeout, does not follow redirects, and strips authorization, cookies, credential-like headers, hop-by-hop headers, selected source-address headers, and trace propagation headers."
              }
            </p>
          </section>

          <section>
            <h2>{"Error model"}</h2>
            <p>
              {"REST API errors generally use "}
              <code>{'{"error":"Human-readable message"}'}</code>
              {
                ". Some endpoints include an additional code field. Clients should branch on HTTP status codes and treat the message as diagnostic text. Stream authorization and availability errors use plain text. Capture responses use the bin’s configured response format, and MCP uses its protocol-specific error format. Replay delivery errors are returned with attempt details; a destination HTTP error still returns API status 200, while a transport failure returns 502."
              }
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
