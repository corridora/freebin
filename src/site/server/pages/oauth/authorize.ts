import type { WorkerPlatform } from "@/server/context";
import { fail, isRedirect, redirect } from "@/server/http";
import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { getUser } from "@/server/domain/auth";

const supportedScopes = new Set(["bins:read", "requests:read", "replay:write"]);

async function parse(platform: WorkerPlatform | undefined, url: URL) {
  const helpers = platform?.env.OAUTH_PROVIDER;
  if (!helpers) throw new Error("OAuth provider binding is unavailable");
  const requestUrl = new URL(url);
  requestUrl.searchParams.delete("/authorize");
  return {
    helpers,
    oauthRequest: await helpers.parseAuthRequest(
      new Request(requestUrl, { method: "GET" }),
    ),
  };
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "description" in error)
    return String(error.description);
  return error instanceof Error
    ? error.message
    : "Unable to authorize this client";
}

export const load: PageServerLoad = async ({ platform, request, url }) => {
  if (!platform?.env.DB) return { error: "Database unavailable", user: null };
  try {
    const { helpers, oauthRequest } = await parse(platform, url);
    const [client, user] = await Promise.all([
      helpers.lookupClient(oauthRequest.clientId),
      getUser(platform.env.DB, request),
    ]);
    if (!client) return { error: "Unknown OAuth client", user: null };
    const scopes = oauthRequest.scope.filter((scope) =>
      supportedScopes.has(scope),
    );
    return {
      ...(url.searchParams.get("error")
        ? { error: url.searchParams.get("error")!.slice(0, 500) }
        : {}),
      user,
      client: {
        name: client.clientName || client.clientId,
        uri: client.clientUri || null,
      },
      scopes,
      returnTo: `${url.pathname}${url.search}`,
    };
  } catch (error) {
    return { error: errorMessage(error), user: null };
  }
};

export const actions: Actions = {
  default: async ({ platform, request, url }) => {
    if (!platform?.env.DB) return fail(503, { error: "Database unavailable" });
    const user = await getUser(platform.env.DB, request);
    if (!user)
      return fail(401, { error: "Sign in before authorizing this client" });
    try {
      const { helpers, oauthRequest } = await parse(platform, url);
      const form = await request.formData();
      if (form.get("decision") !== "allow") {
        const denied = new URL(oauthRequest.redirectUri);
        denied.searchParams.set("error", "access_denied");
        denied.searchParams.set(
          "error_description",
          "The user denied this authorization request.",
        );
        if (oauthRequest.state)
          denied.searchParams.set("state", oauthRequest.state);
        if (oauthRequest.issuer)
          denied.searchParams.set("iss", oauthRequest.issuer);
        redirect(303, denied.toString());
      }
      const scope = oauthRequest.scope.filter((item) =>
        supportedScopes.has(item),
      );
      const { redirectTo } = await helpers.completeAuthorization({
        request: oauthRequest,
        userId: user.id,
        metadata: { accountEmail: user.email },
        scope,
        props: {
          userId: user.id,
          email: user.email,
          scopes: scope,
          authType: "oauth",
        },
      });
      redirect(303, redirectTo);
    } catch (error) {
      if (isRedirect(error)) throw error;
      return fail(400, { error: errorMessage(error) });
    }
  },
};
