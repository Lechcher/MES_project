/**
 * Authenticated GraphQL proxy.
 *
 * Forwards the client's operation to `POST <MES_API_URL>/api/v1/graphql`,
 * attaching the session token from the httpOnly cookie, and relays the
 * backend's JSON response verbatim. The token itself never reaches the browser.
 */

import { cookies } from "next/headers";
import { MES_SESSION_COOKIE, postToBackend } from "@/lib/mes/server";

const BAD_BODY = {
  errors: [
    {
      message: "The request body must be JSON with a `query` string.",
      extensions: { code: "VALIDATION_FAILED" },
    },
  ],
};

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(BAD_BODY, { status: 400 });
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  if (typeof body.query !== "string") {
    return Response.json(BAD_BODY, { status: 400 });
  }

  const store = await cookies();
  const token = store.get(MES_SESSION_COOKIE)?.value ?? null;

  const upstream = await postToBackend({
    query: body.query,
    variables:
      body.variables && typeof body.variables === "object"
        ? (body.variables as Record<string, unknown>)
        : {},
    operationName:
      typeof body.operationName === "string" ? body.operationName : undefined,
    token,
  });

  if (upstream === null) {
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

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.contentType },
  });
}
