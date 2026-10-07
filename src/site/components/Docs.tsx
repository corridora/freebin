"use client";
import { Fragment, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { invalidateAll } from "@/components/AppShell";
import "./styles/Docs.css";

export default function Docs({ data = {}, form }: any) {
  const endpointGroups = [
    {
      title: "Stable management API",
      description:
        "Management endpoints intended for integrations and the first-party browser. Replace path parameters with IDs returned by the API.",
      endpoints: [
        [
          "GET",
          "/api/v1/bins",
          "List every bin owned by the API-key user, newest first. Returns names, IDs, creation times, and retained-request counts.",
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
          "Bearer, session, or token query",
        ],
        [
          "PATCH",
          "/api/v1/bins/:binId",
          "Customize capture response fields and optional Phase 0 automatic forwarding to one allowlisted HTTPS base URL.",
          "Bearer key or session",
        ],
        [
          "DELETE",
          "/api/v1/bins/:binId",
          "Permanently delete the bin and all of its retained requests.",
          "Bearer key or session",
        ],
        [
          "GET / PUT",
          "/api/v1/bins/:binId/config",
          "Export or atomically replace the versioned portable bin configuration and ordered response rules. Captures and replay history are preserved.",
          "Bearer key or session",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/audit",
          "List the newest permission-gated mutation events; up to 500 are retained per bin.",
          "Bearer key or session",
        ],
        [
          "GET / PUT / DELETE",
          "/api/v1/bins/:binId/collaborators",
          "List, invite or update, and remove registered-user collaborators. Invitation changes remain owner-only.",
          "Session required",
        ],
        [
          "GET / POST / PUT",
          "/api/v1/bins/:binId/rules",
          "List, create, or reorder conditional response rules. Enabled rules use first-match-wins order.",
          "Bearer key or session",
        ],
        [
          "PATCH / DELETE",
          "/api/v1/bins/:binId/rules/:ruleId",
          "Update or delete one conditional response rule.",
          "Bearer key or session",
        ],
        [
          "POST",
          "/api/v1/bins/:binId/rules/test",
          "Test a synthetic request against enabled rules without capturing it.",
          "Bearer key or session",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/interactions?limit=10&offset=0",
          "List retained requests. limit accepts 1–100 or all and defaults to 10; responses include total and offset metadata.",
          "Bearer, session, or token query",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/stream?lastId=:requestId",
          "Open a server-sent event stream. Emits request events and keepalives for about 25 seconds; reconnect to continue.",
          "Bearer, session, or token query",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/export",
          "Download bin metadata and every currently retained request as JSON.",
          "Bearer key or session",
        ],
        [
          "POST",
          "/api/v1/bins/:binId/share",
          'Enable or disable a read-only public bin URL with {"public":true|false}. Enabling again rotates the URL.',
          "Bearer key or session",
        ],
        [
          "DELETE",
          "/api/v1/bins/:binId/interactions/:requestId",
          "Permanently delete one retained request.",
          "Bearer key or session",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/interactions/:requestId/export",
          "Download one retained request as JSON.",
          "Bearer key or session",
        ],
        [
          "POST",
          "/api/v1/bins/:binId/interactions/:requestId/share",
          'Enable or disable a read-only public request URL with {"public":true|false}.',
          "Bearer key or session",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/interactions/:requestId/replay",
          "List the newest 50 retained replay attempts, including effective request snapshots and results.",
          "Bearer key or session",
        ],
        [
          "POST",
          "/api/v1/bins/:binId/interactions/:requestId/replay",
          'Replay an optionally edited request, or forward the original through the bin’s configured destination with operation: "forward". Manual forwarding bypasses automatic-forwarding conditions. Every attempt is recorded.',
          "Bearer key or session",
        ],
        [
          "GET",
          "/api/v1/bins/:binId/interactions/:requestId/forwarding",
          "List retained automatic-forwarding attempts for one captured request.",
          "Bearer key or session",
        ],
      ],
    },
    {
      title: "MCP OAuth 2.1",
      description:
        "OAuth-capable MCP clients discover these endpoints automatically. Freebin requires authorization code flow with S256 PKCE and explicit account consent.",
      endpoints: [
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
        "Capture URLs are deliberately outside the management API version. They remain stable destinations for webhook senders.",
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
          "Return public browser configuration: signup availability plus the optional RUM beacon-script URL and public token.",
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
          "Return the signed-in account, byte usage and limit, and owned bins. Returns user: null when signed out.",
          "Session",
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
        content="Versioned freebin API, CLI, SDK examples, and service limits."
      />

      <div className="shell">
        <main className="docs">
          <p className="eyebrow">{"Developer platform"}</p>
          <h1>
            {"Small API."}
            <br />
            {"Stable contract."}
          </h1>
          <p className="lede">
            {
              "Build local webhook workflows with the versioned API, a dependency-free CLI, reusable SDK examples, and an OpenAPI 3.1 contract. Creating a bin confirms acceptance of the "
            }
            <Link href="/terms">{"Terms and Conditions"}</Link>
            {"."}
          </p>

          <nav aria-label="Developer resources" className="resources">
            <a href="https://github.com/corridora/freebin.org/blob/main/quickstart.md">
              <strong>{"Quickstart"}</strong>
              <span>
                {"Capture, inspect, replay, and automate your first request."}
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
              {
                ". Compatible fields may be added within v1, but existing fields and behavior will not be removed or changed incompatibly. A breaking contract change will use a new major path. Capture URLs remain "
              }
              <code>{"/b/:binId/*"}</code>
              {
                " so webhook destinations do not change when the management API evolves."
              }
            </p>
          </section>

          <section>
            <h2>{"Install the CLI"}</h2>
            <pre>
              {
                "curl -fsS https://freebin.org/freebin.mjs -o freebin.mjs\nchmod +x freebin.mjs\nFREEBIN_API_KEY=YOUR_API_KEY ./freebin.mjs bins"
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
              {". Watch and local-forward emit JSON lines and accept "}
              <code>{"--include-existing"}</code>
              {
                ". Local forwarding runs in the CLI, so it can reach localhost while still stripping authorization, cookies, credential-like, hop-by-hop, and source-address headers. Set "
              }
              <code>{"FREEBIN_URL=http://127.0.0.1:8787"}</code>
              {" for local development."}
            </p>
            <pre>
              {
                "./freebin.mjs assert BIN_ID --method POST --path '/webhooks/*' \\\n  --header x-event=invoice.created --body-json data.status=paid --timeout 30"
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
          </section>

          <section>
            <h2>{"Connect an MCP client"}</h2>
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

          <section>
            <h2>{"Create a bin"}</h2>
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
          </section>

          <section>
            <h2>{"List captured requests"}</h2>
            <pre>
              {
                'curl "https://freebin.org/api/v1/bins/YOUR_BIN_ID/interactions?limit=50" \\\n  -H "authorization: Bearer YOUR_API_KEY"'
              }
            </pre>
          </section>

          <section>
            <h2>{"Inspector filtering"}</h2>
            <p>
              {
                "The browser inspector filters its loaded retained history by free text, HTTP method, capture time range, path, content type, header name and value, and dotted JSON body fields. Filter and paging state is encoded in the URL and restored by browser history, making a filtered inspector URL shareable with another authorized user. Named saved views are planned for a later phase."
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
                " format. Existing keys remain valid. Keys are user-scoped, shown only once, individually revocable, and limited to five active keys per account. Every capture method requires a key belonging to the destination bin’s owner."
              }
            </p>
          </section>

          <section>
            <h2>{"Complete endpoint reference"}</h2>
            <p>
              {
                "All currently implemented API and capture endpoints are listed below. Public share URLs are read-only web pages rather than JSON API endpoints."
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
            <h2>{"Documented service limits"}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{"Limit"}</th>
                    <th>{"Registered"}</th>
                    <th>{"Canonical demo"}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">{"Capture rate"}</th>
                    <td>{"20 requests/second per user"}</td>
                    <td>{"1 request/second for the canonical demo"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{"Request body"}</th>
                    <td>{"1 MB"}</td>
                    <td>{"20 KB for the canonical demo"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{"Retention"}</th>
                    <td>{"5 MB per account by default"}</td>
                    <td>{"1 MB for the canonical demo"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{"Bins"}</th>
                    <td>{"5 per account"}</td>
                    <td>{"Subject to creation abuse controls"}</td>
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
                    <th scope="row">{"Custom response fields"}</th>
                    <td colSpan={2}>
                      {
                        "500 UTF-8 bytes per text field and serialized headers field"
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
                    <th scope="row">{"Replay and forward egress"}</th>
                    <td>{"20 requests/second per account"}</td>
                    <td>{"1 request/second"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{"Bulk egress concurrency"}</th>
                    <td colSpan={2}>
                      {"3 requests in flight; no cancellation"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              {
                "Retention is byte-based across captures and replay history. Old replay attempts are evicted before captured requests when the account reaches its allowance. There is no date-based cleanup. Rate-limited requests return "
              }
              <code>{"429"}</code>
              {"; oversized requests return "}
              <code>{"413"}</code>
              {"."}
            </p>
            <p>
              {
                "Automatic forwarding is best-effort: one destination per bin, a 10-second timeout, no redirects, and no retries. Each captured request has separate pending, delivered, or failed attempt history with destination, response code, error, latency, and timestamps; the request-level fields summarize the latest result. The original path and query are appended to the configured base URL. Credential-like headers are stripped by default and may be retained with a per-bin allowlist. Authorization is always removed because it contains the Freebin API key; hop-by-hop and source-address headers are also never forwarded."
              }
            </p>
            <p>
              {
                "Conditional responses evaluate up to five enabled rules in order and stop at the first match. Each rule supports up to five AND conditions over method, path, query, selected headers, and JSON or form body fields using equals, exists, contains, or glob. Rules cannot inspect authorization or cookie headers. Static responses may delay for up to five seconds."
              }
            </p>
            <p>
              {
                "Replay attempts preserve the original capture and store the effective edited request plus its result separately. Replay history shares the account retention budget; oldest replay attempts are evicted before captured requests. Replay uses a 10-second timeout, does not follow redirects, and strips authorization, cookies, credential-like, hop-by-hop, and source-address headers."
              }
            </p>
          </section>

          <section>
            <h2>{"Error model"}</h2>
            <p>
              {"JSON API errors use "}
              <code>{'{"error":"Human-readable message"}'}</code>
              {
                ". Clients should branch on HTTP status codes and treat the message as diagnostic text, not a stable machine identifier."
              }
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
