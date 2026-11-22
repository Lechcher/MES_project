/**
 * Authenticated change-event stream proxy.
 *
 * Forwards the browser's long-lived SSE connection to
 * `GET <MES_API_URL>/api/v1/events`, attaching the session token from the
 * httpOnly cookie. `EventSource` cannot set request headers, so this hop is
 * what makes bearer-authenticated streaming reachable from the browser at all
 * — the same reason `/api/mes/graphql` exists.
 *
 * The upstream body is streamed verbatim through `copyEventStream`: frames
 * reach the client as the backend writes them, never as one buffered blob, and
 * a stream that ends mid-life — upstream socket death, backend restart — ends
 * cleanly instead of surfacing as Next's `failed to pipe response`.
 */

import { cookies } from "next/headers";
import { MES_EVENTS_URL, MES_SESSION_COOKIE } from "@/lib/mes/server";
import { copyEventStream } from "./copy-stream";

/** Headers every proxied SSE response carries, buffering-proofing the hop. */
const STREAM_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
} as const;

export async function GET(request: Request): Promise<Response> {
  const store = await cookies();
  const token = store.get(MES_SESSION_COOKIE)?.value ?? null;

  // One controller owns every reason the upstream connection ends: the browser
  // going away (request.signal) or the copy loop cancelling. Aborting the
  // fetch releases the upstream socket deterministically rather than waiting
  // for it to be reaped.
  const upstreamAbort = new AbortController();
  const abortUpstream = () => upstreamAbort.abort();
  request.signal.addEventListener("abort", abortUpstream, { once: true });

  let upstream: Response;
  try {
    upstream = await fetch(MES_EVENTS_URL, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: upstreamAbort.signal,
      cache: "no-store",
    });
  } catch (error) {
    request.signal.removeEventListener("abort", abortUpstream);
    // An abort is the client going away, not a failure worth reporting as one.
    if ((error as Error)?.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    return Response.json(
      {
        errors: [
          {
            message: "Unable to reach the MES API.",
            extensions: { code: "INTERNAL" },
          },
        ],
      },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    request.signal.removeEventListener("abort", abortUpstream);
    // Relay the backend's verdict (notably its 401) with its message intact.
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  }

  return new Response(
    copyEventStream({ upstream: upstream.body, signal: request.signal }),
    { status: 200, headers: STREAM_HEADERS },
  );
}
