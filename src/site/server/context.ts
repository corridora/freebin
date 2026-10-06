import type { TraceContext } from "./domain/telemetry";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
export type RuntimeEnv = Cloudflare.Env & { OAUTH_PROVIDER?: OAuthHelpers };
export interface WorkerPlatform {
  env: RuntimeEnv;
  context: ExecutionContext;
  caches?: CacheStorage;
}
export interface RequestEvent {
  request: Request;
  url: URL;
  params: Record<string, string>;
  getClientAddress(): string;
  platform: WorkerPlatform;
  locals: { traceContext: TraceContext };
  cookies: {
    set(
      name: string,
      value: string,
      options: {
        path: string;
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: string;
        maxAge?: number;
      },
    ): void;
  };
  setHeaders(headers: Record<string, string>): void;
}
export type RequestHandler = (
  event: RequestEvent,
) => Response | Promise<Response>;
export type PageServerLoad = (
  event: RequestEvent,
) => Promise<Record<string, unknown>>;
export type LayoutServerLoad = PageServerLoad;
export type Actions = Record<
  string,
  (event: RequestEvent) => Promise<Record<string, unknown>>
>;
