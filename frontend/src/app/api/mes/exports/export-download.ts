/**
 * Backend fetch for a persisted export artifact.
 *
 * The browser cannot download an artifact straight from the backend: the
 * backend's route requires an `Authorization: Bearer` header, which a
 * top-level navigation (`window.open`) never carries. This module is the
 * authenticated hop the proxy route relies on — it attaches the viewer's
 * session token and turns an unreachable backend into an explicit 502 so the
 * route relays one failure shape.
 *
 * The upstream response is returned as-is: the backend's own 401 (no or
 * invalid session), 404 (unknown artifact id) and 410 (file gone from disk)
 * semantics reach the browser verbatim.
 */

import { MES_EXPORTS_URL } from "@/lib/mes/server";

/** The error payload returned when the backend cannot be reached. */
const UNAVAILABLE = {
  errors: [
    {
      message: "Unable to reach the MES API.",
      extensions: { code: "INTERNAL" },
    },
  ],
};

/**
 * Fetch one artifact's bytes from the backend, authenticated with the viewer's
 * session token. Network failures resolve to a 502 response rather than
 * throwing, so the route always has a response to relay.
 */
export async function fetchExportArtifact(
  id: string,
  token: string | null,
): Promise<Response> {
  try {
    return await fetch(`${MES_EXPORTS_URL}/${encodeURIComponent(id)}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
  } catch {
    return Response.json(UNAVAILABLE, { status: 502 });
  }
}
