import type {
  RequestHandler,
  PageServerLoad,
  LayoutServerLoad,
  Actions,
} from "@/server/context";
import { canManageBin } from "@/server/domain/auth";

export const GET: RequestHandler = async ({
  params,
  platform,
  url,
  request,
}) => {
  if (!platform?.env.DB)
    return new Response("Database unavailable", { status: 503 });
  if (
    !(await canManageBin(
      platform.env.DB,
      request,
      params.id,
      "",
      "requests.view",
    ))
  ) {
    return new Response("Forbidden", { status: 403 });
  }
  const db = platform.env.DB;
  let stopped = false;
  let abortHandler: (() => void) | undefined;
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastId =
        request.headers.get("last-event-id") ||
        url.searchParams.get("lastId") ||
        "";
      abortHandler = () => {
        stopped = true;
      };
      request.signal.addEventListener("abort", abortHandler, { once: true });
      try {
        for (let attempt = 0; attempt < 25 && !stopped; attempt += 1) {
          const latest = await db
            .prepare(
              "SELECT id FROM requests WHERE bin_id = ? ORDER BY created_at DESC LIMIT 1",
            )
            .bind(params.id)
            .first<{ id: string }>();
          if (stopped) break;
          try {
            if (latest?.id && latest.id !== lastId) {
              lastId = latest.id;
              controller.enqueue(
                encoder.encode(
                  `id: ${lastId}\nevent: request\ndata: ${JSON.stringify({ id: lastId })}\n\n`,
                ),
              );
            } else {
              controller.enqueue(encoder.encode(": keepalive\n\n"));
            }
          } catch {
            // The response consumer can cancel before the request abort event arrives.
            stopped = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      } finally {
        if (abortHandler)
          request.signal.removeEventListener("abort", abortHandler);
        if (!stopped) {
          stopped = true;
          try {
            controller.close();
          } catch {
            // Cancellation may have already closed the Web Streams controller.
          }
        }
      }
    },
    cancel() {
      stopped = true;
      if (abortHandler)
        request.signal.removeEventListener("abort", abortHandler);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
};
