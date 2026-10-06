import { routes } from "./route-table";
import { pages, layoutLoader, consentActions } from "./page-table";
import { HttpError, Redirect } from "./http";
import type { RequestEvent, RuntimeEnv, RequestHandler } from "./context";
import {
  createServerTraceContext,
  deploymentEnvironment,
  scheduleTraceExport,
  serverRouteAttributes,
  serviceVersion,
  traceLog,
} from "./domain/telemetry";
import { matchPath } from "./path-matcher";
export { matchPath } from "./path-matcher";

export async function dispatch(
  request: Request,
  env: RuntimeEnv,
  ctx: ExecutionContext,
  frontend: () => Promise<Response>,
): Promise<Response> {
  const startedAt = Date.now(),
    url = new URL(request.url);
  const traceContext = createServerTraceContext(
    request.headers.get("traceparent"),
  );
  const responseHeaders = new Headers();
  let routeId = "/[...path]",
    response: Response;
  const event: RequestEvent = {
    request,
    url,
    params: {},
    getClientAddress: () =>
      request.headers.get("cf-connecting-ip") || "127.0.0.1",
    platform: { env, context: ctx },
    locals: { traceContext },
    setHeaders(headers) {
      for (const [name, value] of Object.entries(headers))
        responseHeaders.set(name, value);
    },
    cookies: {
      set(name, value, options) {
        const parts = [
          `${name}=${encodeURIComponent(value)}`,
          `Path=${options.path}`,
        ];
        if (options.httpOnly) parts.push("HttpOnly");
        if (options.secure) parts.push("Secure");
        if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
        if (options.maxAge !== undefined)
          parts.push(`Max-Age=${options.maxAge}`);
        responseHeaders.append("set-cookie", parts.join("; "));
      },
    },
  };
  try {
    const origin = request.headers.get("origin");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      !url.pathname.startsWith("/b/") &&
      origin &&
      origin !== url.origin
    ) {
      throw new HttpError(403, "Cross-origin mutations are not permitted");
    }
    if (url.pathname === "/api/ui/layout") {
      if (!["GET", "HEAD"].includes(request.method))
        throw new HttpError(405, "Method not allowed");
      routeId = "/api/ui/layout";
      response = Response.json(await layoutLoader(event));
    } else if (url.pathname === "/api/ui/page") {
      if (!["GET", "HEAD"].includes(request.method))
        throw new HttpError(405, "Method not allowed");
      // Page data uses the same cookies and authority as the browser route.
      const target = new URL(url.searchParams.get("path") || "/", url.origin);
      if (target.origin !== url.origin)
        throw new HttpError(400, "Invalid page path");
      const page = pages.find((item) => matchPath(item.path, target.pathname));
      routeId = page?.path || "/api/ui/page";
      if (page) {
        event.url = target;
        event.params = matchPath(page.path, target.pathname)!;
        response = Response.json(await page.loader(event));
      } else if (["/docs", "/terms"].includes(target.pathname))
        response = Response.json({});
      else throw new HttpError(404, "Page unavailable");
    } else if (
      url.pathname === "/oauth/authorize" &&
      request.method === "POST"
    ) {
      routeId = "/oauth/authorize";
      const result = await consentActions.default(event);
      const consentUrl = new URL(request.url);
      consentUrl.searchParams.set(
        "error",
        String(result.error || "Authorization failed"),
      );
      response = new Response(null, {
        status: 303,
        headers: { location: consentUrl.pathname + consentUrl.search },
      });
    } else if (
      matchPath("/bin/[id]", url.pathname) &&
      url.searchParams.has("token")
    ) {
      const page = pages.find((item) => item.path === "/bin/[id]")!;
      routeId = page.path;
      event.params = matchPath(page.path, url.pathname)!;
      await page.loader(event);
      response = await frontend();
    } else {
      const route = routes.find((item) => matchPath(item.path, url.pathname));
      if (route) {
        routeId = route.path;
        event.params = matchPath(route.path, url.pathname)!;
        const handlers = route.handlers as Record<string, RequestHandler>;
        const handler =
          handlers[request.method] ||
          (request.method === "HEAD" ? handlers.GET : undefined);
        response = handler
          ? await handler(event)
          : new Response("Method not allowed", {
              status: 405,
              headers: { allow: Object.keys(handlers).join(", ") },
            });
      } else if (
        url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/b/")
      )
        throw new HttpError(404, "Endpoint unavailable");
      else {
        routeId =
          pages.find((item) => matchPath(item.path, url.pathname))?.path ||
          (["/docs", "/terms"].includes(url.pathname)
            ? url.pathname
            : "/[...path]");
        response = await frontend();
      }
    }
  } catch (cause) {
    if (cause instanceof Redirect)
      response = url.pathname.startsWith("/api/ui/")
        ? Response.json({ redirect: cause.location })
        : new Response(null, {
            status: cause.status,
            headers: { location: cause.location },
          });
    else {
      const status =
        cause instanceof HttpError
          ? cause.status
          : cause instanceof URIError
            ? 400
            : 500;
      response = Response.json(
        {
          error:
            status === 500
              ? "Request failed"
              : cause instanceof Error
                ? cause.message
                : "Request failed",
        },
        { status },
      );
      traceLog("error", "http.error", traceContext, {
        "error.type": cause instanceof Error ? cause.name : "Unknown",
        "http.route": routeId,
      });
    }
  }
  response = new Response(
    request.method === "HEAD" ? null : response.body,
    response,
  );
  for (const [name, value] of responseHeaders)
    if (name !== "set-cookie") response.headers.set(name, value);
  for (const value of responseHeaders.getSetCookie())
    response.headers.append("set-cookie", value);
  if (
    ["/api/", "/shared/", "/oauth/", "/bin/"].some((prefix) =>
      url.pathname.startsWith(prefix),
    ) ||
    ["/account", "/admin"].includes(url.pathname) ||
    request.headers.has("cookie") ||
    response.headers.has("set-cookie")
  )
    response.headers.set("cache-control", "private, no-store");
  response.headers.set("cross-origin-opener-policy", "same-origin");
  response.headers.set(
    "permissions-policy",
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  );
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("x-content-type-options", "nosniff");
  const attributes = {
    "http.request.method": request.method,
    "http.response.status_code": response.status,
    ...serverRouteAttributes(url, routeId),
    "url.scheme": url.protocol.slice(0, -1),
    "server.address": url.hostname,
  };
  traceLog("info", "http.request", traceContext, {
    "service.version": serviceVersion(env),
    "deployment.environment.name": deploymentEnvironment(env),
    duration_ms: Date.now() - startedAt,
    ...attributes,
  });
  scheduleTraceExport(
    env,
    {
      context: traceContext,
      name: `HTTP ${request.method}`,
      kind: 2,
      startedAt,
      endedAt: Date.now(),
      attributes,
      error: response.status >= 500,
    },
    (promise) => ctx.waitUntil(promise),
  );
  return response;
}
