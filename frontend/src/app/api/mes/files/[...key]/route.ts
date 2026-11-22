/**
 * Proxied attachment download.
 *
 * The key follows the `/api/mes/files/` prefix, so this route also serves keys
 * that themselves contain slashes (`tasks/<taskId>/<uuid>-<filename>`) — which
 * is every real attachment key, not an edge case. A catch-all segment is
 * therefore required: a plain `files/route.ts` matches only `/api/mes/files`
 * itself, so every download would have 404'd before reaching the backend.
 *
 * Each path segment is encoded individually when forwarded, keeping the
 * separators the backend route needs while still making a segment containing a
 * space or a `#` safe to carry.
 */

import { cookies } from "next/headers";
import { MES_API_URL, MES_SESSION_COOKIE } from "@/lib/mes/server";

const UNAVAILABLE = {
  errors: [
    {
      message: "Unable to reach the MES API.",
      extensions: { code: "INTERNAL" },
    },
  ],
};

async function sessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(MES_SESSION_COOKIE)?.value ?? null;
}

/** Relay the backend's response with its status, headers and body intact. */
function relay(upstream: Response): Response {
  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const token = await sessionToken();
  const { key } = await params;
  const objectKey = key.map((segment) => encodeURIComponent(segment)).join("/");

  const url = new URL(request.url);
  let upstream: Response;
  try {
    upstream = await fetch(
      `${MES_API_URL}/api/v1/files/${objectKey}${url.search}`,
      {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        cache: "no-store",
        signal: request.signal,
      },
    );
  } catch {
    return Response.json(UNAVAILABLE, { status: 502 });
  }

  return relay(upstream);
}
