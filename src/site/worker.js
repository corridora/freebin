import frontend from "vinext/server/fetch-handler";
import { dispatch } from "./server/dispatch";
const app = {
  fetch: (request, env, ctx) =>
    dispatch(request, env, ctx, () => frontend.fetch(request, env, ctx)),
};
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { runWithProviderTelemetry } from "./server/provider-telemetry.js";

const MCP_SCOPES = ["bins:read", "requests:read", "replay:write"];
const delegatedRequests = new WeakSet();

async function sha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const mcpHandler = {
  async fetch(request, env, ctx) {
    delegatedRequests.add(request);
    const props = ctx.props || {};
    const headers = new Headers(request.headers);
    headers.set("x-freebin-mcp-user-id", String(props.userId || ""));
    headers.set("x-freebin-mcp-email", String(props.email || ""));
    headers.set(
      "x-freebin-mcp-scopes",
      Array.isArray(props.scopes) ? props.scopes.join(" ") : "",
    );
    headers.set("x-freebin-mcp-auth-type", String(props.authType || "oauth"));
    if (props.apiToken)
      headers.set("x-freebin-mcp-api-token", String(props.apiToken));
    return app.fetch(new Request(request, { headers }), env, ctx);
  },
};

const appHandler = {
  fetch(request, env, ctx) {
    delegatedRequests.add(request);
    return app.fetch(request, env, ctx);
  },
};

function oauthProvider(requestOrigin) {
  const requestUrl = new URL(requestOrigin);
  const origin = requestUrl.origin;
  const resource = `${origin}/mcp`;
  return new OAuthProvider({
    apiRoute: "/mcp",
    apiHandler: mcpHandler,
    defaultHandler: appHandler,
    authorizeEndpoint: "/oauth/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: MCP_SCOPES,
    allowPlainPKCE: false,
    clientIdMetadataDocumentEnabled: true,
    resourceMetadata: {
      resource,
      ...(requestUrl.protocol === "https:"
        ? { authorization_servers: [origin] }
        : {}),
      scopes_supported: ["bins:read", "requests:read"],
      resource_name: "Freebin MCP server",
    },
    async resolveExternalToken({ token, env }) {
      if (!token || token === "freebin_demo_public") return null;
      const user = await env.DB.prepare(
        `SELECT u.id, u.email, k.id AS apiKeyId
        FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.token_hash = ?`,
      )
        .bind(await sha256(token))
        .first();
      if (!user) return null;
      await env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), user.apiKeyId)
        .run();
      return {
        audience: resource,
        props: {
          userId: user.id,
          email: user.email,
          scopes: MCP_SCOPES,
          authType: "api_key",
          apiToken: token,
        },
      };
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const headers = new Headers(request.headers);
    for (const name of [...headers.keys()])
      if (name.startsWith("x-freebin-mcp-")) headers.delete(name);
    request = new Request(request, { headers });
    const url = new URL(request.url);
    try {
      return await runWithProviderTelemetry({
        request,
        env,
        ctx,
        dispatch: () => oauthProvider(url.origin).fetch(request, env, ctx),
        wasDelegated: () => delegatedRequests.has(request),
      });
    } finally {
      delegatedRequests.delete(request);
    }
  },
};
