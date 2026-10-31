/**
 * Authenticated export-artifact download proxy.
 *
 * This is the same-origin route every generated artifact URL points at:
 * `ExportResult.url` (backend `toExportResult`) is `/api/mes/exports/<id>`,
 * and `window.open` resolves it against the frontend origin — where the
 * backend's Bearer requirement would otherwise 404 on the frontend or 401 on
 * the backend, because a navigation cannot set request headers.
 *
 * Like `/api/mes/files/*` for attachments, the hop reads the httpOnly session
 * cookie, attaches it to `GET <MES_API_URL>/api/v1/exports/<id>`, and relays
 * the upstream status, headers and body verbatim. The token never reaches the
 * browser.
 */

import { cookies } from "next/headers";
import { MES_SESSION_COOKIE } from "@/lib/mes/server";
import { fetchExportArtifact } from "../export-download";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const store = await cookies();
  const token = store.get(MES_SESSION_COOKIE)?.value ?? null;

  const upstream = await fetchExportArtifact(id, token);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}
