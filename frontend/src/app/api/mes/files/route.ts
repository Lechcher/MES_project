/**
 * Authenticated attachment upload proxy.
 *
 * The upload goes through the backend, attaching the session token from the
 * httpOnly cookie, so the browser never talks to storage directly and never
 * holds a credential:
 *
 *   POST /api/mes/files — multipart bulk upload (FormData with `taskId` and
 *                         one or more `files`)
 *
 * Downloads live in `[...key]/route.ts`, which needs its own catch-all segment
 * to carry a storage key such as `tasks/<taskId>/<uuid>-<filename>`.
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
