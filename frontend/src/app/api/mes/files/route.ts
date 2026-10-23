/**
 * Authenticated attachment file proxy.
 *
 * Both directions go through the backend, attaching the session token from the
 * httpOnly cookie, so the browser never talks to storage directly and never
 * holds a credential:
 *
 *   POST /api/mes/files   — multipart bulk upload (FormData with `taskId` and
 *                           one or more `files`)
 *   GET  /api/mes/files/* — streaming download, inline by default and
 *                           `?download=1` to force an attachment
 *
 * This mirrors `app/api/mes/graphql/route.ts`, which relays the GraphQL
 * exchange the same way.
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

/**
 * Proxied multipart upload.
 *
 * The browser's `FormData` is forwarded as the request body untouched, so the
 * backend's own per-file validation and its per-file failure reports reach the
 * client unchanged.
 */
export async function POST(request: Request): Promise<Response> {
  const token = await sessionToken();

  // The multipart body is read once and re-sent, so no streaming `duplex`
  // option is needed: `FormData` re-serialises the parts for the upstream hop.
  const form = await request.formData();

  let upstream: Response;
  try {
    upstream = await fetch(`${MES_API_URL}/api/v1/files`, {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: form,
      cache: "no-store",
    });
  } catch {
    return Response.json(UNAVAILABLE, { status: 502 });
  }

  return relay(upstream);
}

/**
 * Proxied download.
 *
 * The key follows the `/api/mes/files/` prefix, so the route also serves keys
 * that themselves contain slashes (`tasks/<taskId>/<key>`): each path segment
 * is encoded individually, keeping the separators the backend route needs.
 */
export async function GET(request: Request): Promise<Response> {
  const token = await sessionToken();
  const url = new URL(request.url);
  const key = url.pathname
    .replace(/^\/api\/mes\/files\/?/, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  let upstream: Response;
  try {
    upstream = await fetch(`${MES_API_URL}/api/v1/files/${key}${url.search}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      cache: "no-store",
      signal: request.signal,
    });
  } catch {
    return Response.json(UNAVAILABLE, { status: 502 });
  }

  return relay(upstream);
}
